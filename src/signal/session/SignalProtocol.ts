import { toRawPubKey, toSerializedPubKey, xeddsaVerify } from '@crypto'
import { isMlKemSupported, kemDecapsulate, kemEncapsulate } from '@crypto/kem/MlKem'
import { ConsoleLogger } from '@infra/log/ConsoleLogger'
import type { Logger } from '@infra/log/types'
import { StoreLock } from '@infra/perf/StoreLock'
import { signalAddressKey } from '@protocol/jid'
import { MAX_PREV_SESSIONS } from '@signal/constants'
import { encodeSignalSessionSnapshot } from '@signal/session/encoding'
import {
    isPqSessionAddress,
    SIGNAL_PQ_DISABLED,
    type SignalPqPolicy,
    toClassicSessionAddress
} from '@signal/session/pq-scope'
import {
    decryptMsg,
    decryptMsgFromSession,
    type DecryptOutcome,
    encryptMsg
} from '@signal/session/SignalRatchet'
import {
    deserializeMsg,
    deserializePkMsg,
    requirePreKey,
    requireSignedPreKey
} from '@signal/session/SignalSerializer'
import {
    findMatchingSession,
    generateSerializedKeyPair,
    initiateSessionIncoming,
    initiateSessionOutgoing,
    type LocalIdentityContext,
    requireLocalIdentity,
    toSerializedKeyPair
} from '@signal/session/SignalSession'
import type {
    ParsedPreKeySignalMessage,
    SignalAddress,
    SignalPreKeyBundle,
    SignalSessionRecord
} from '@signal/types'
import type { WaIdentityStore } from '@store/contracts/identity.store'
import { hasPqPreKeyStore, type WaPreKeyStore } from '@store/contracts/pre-key.store'
import type { WaSessionStore } from '@store/contracts/session.store'
import type { WaSignalStore } from '@store/contracts/signal.store'
import { uint8Equal } from '@util/bytes'
import { toError } from '@util/primitives'

function signalAddressLockKey(address: SignalAddress): string {
    return `signal:${signalAddressKey(address)}`
}

interface EstablishOutgoingSessionOptions {
    readonly reuseExisting?: boolean
    readonly knownAbsent?: boolean
    /**
     * Preloaded local identity for batch session setup. Must come from
     * {@link SignalProtocol.loadLocalIdentity} on the same store; when
     * absent the identity is read from the store per call.
     */
    readonly localIdentity?: LocalIdentityContext
}

export interface SignalProtocolStores {
    readonly signal: WaSignalStore
    readonly preKey: WaPreKeyStore
    readonly session: WaSessionStore
    readonly identity: WaIdentityStore
}

/**
 * High-level Signal protocol session orchestrator: establishes outgoing
 * sessions from prekey bundles, encrypts/decrypts ratchet messages, and owns
 * the per-address session mutation lock.
 */
export class SignalProtocol {
    private readonly stores: SignalProtocolStores
    private readonly logger: Logger
    private readonly sessionMutationLock: StoreLock
    private readonly pqPolicy: SignalPqPolicy

    public constructor(
        stores: SignalProtocolStores,
        logger: Logger = new ConsoleLogger('info'),
        pqPolicy: SignalPqPolicy = SIGNAL_PQ_DISABLED
    ) {
        this.stores = stores
        this.logger = logger
        this.sessionMutationLock = new StoreLock()
        this.pqPolicy = pqPolicy
    }

    /**
     * Loads the local registration identity once so batch callers can share
     * it across many `prepareOutgoingSession` calls via
     * `options.localIdentity` instead of re-reading the store per address.
     */
    public async loadLocalIdentity(): Promise<LocalIdentityContext> {
        return requireLocalIdentity(this.stores.signal)
    }

    /**
     * Builds an outgoing Signal session against a remote prekey bundle. An
     * address from `toPqSessionAddress` builds a post-quantum session and needs
     * a bundle with a valid Kyber pre-key; any other address is classic X3DH.
     * Set `options.reuseExisting` to skip the handshake when a session already
     * exists for the same remote identity. Set `options.knownAbsent` only
     * when the caller already proved (within the same logical step) that no
     * session exists; it skips the in-lock recheck and forces a new handshake.
     */
    public async establishOutgoingSession(
        address: SignalAddress,
        remoteBundle: SignalPreKeyBundle,
        options: EstablishOutgoingSessionOptions = {}
    ): Promise<SignalSessionRecord> {
        return this.runWithAddressLock(address, async () => {
            if (options.reuseExisting && !options.knownAbsent) {
                const existing = await this.stores.session.getSession(address)
                if (existing) {
                    const remoteIdentity = toSerializedPubKey(remoteBundle.identity)
                    if (!uint8Equal(existing.remote.pubKey, remoteIdentity)) {
                        throw new Error('identity mismatch')
                    }
                    return existing
                }
            }
            const [local, localOneTimeBase, pqParams] = await Promise.all([
                options.localIdentity ?? requireLocalIdentity(this.stores.signal),
                generateSerializedKeyPair(),
                this.resolveOutgoingPqParams(address, remoteBundle)
            ])
            const session = await initiateSessionOutgoing(
                local,
                remoteBundle,
                localOneTimeBase,
                pqParams
            )
            // Keep writes ordered: a stored session without matching remote identity causes false mismatch checks.
            await this.stores.identity.setRemoteIdentity(
                toClassicSessionAddress(address),
                session.remote.pubKey
            )
            await this.stores.session.setSession(address, session)
            return session
        })
    }

    /**
     * Compute an outgoing session under the per-address lock without
     * persisting. Caller batches results and persists via
     * {@link persistOutgoingSessionsBatch} to collapse N `setRemoteIdentity`
     * + `setSession` round-trips into one bulk write per store.
     */
    public async prepareOutgoingSession(
        address: SignalAddress,
        remoteBundle: SignalPreKeyBundle,
        options: EstablishOutgoingSessionOptions = {}
    ): Promise<{
        readonly session: SignalSessionRecord
        readonly remoteIdentity: Uint8Array
        readonly reusedExisting: boolean
    }> {
        return this.runWithAddressLock(address, async () => {
            if (options.reuseExisting && !options.knownAbsent) {
                const existing = await this.stores.session.getSession(address)
                if (existing) {
                    const remoteIdentity = toSerializedPubKey(remoteBundle.identity)
                    if (!uint8Equal(existing.remote.pubKey, remoteIdentity)) {
                        throw new Error('identity mismatch')
                    }
                    return {
                        session: existing,
                        remoteIdentity: existing.remote.pubKey,
                        reusedExisting: true
                    }
                }
            }
            const [local, localOneTimeBase, pqParams] = await Promise.all([
                options.localIdentity ?? requireLocalIdentity(this.stores.signal),
                generateSerializedKeyPair(),
                this.resolveOutgoingPqParams(address, remoteBundle)
            ])
            const session = await initiateSessionOutgoing(
                local,
                remoteBundle,
                localOneTimeBase,
                pqParams
            )
            return {
                session,
                remoteIdentity: session.remote.pubKey,
                reusedExisting: false
            }
        })
    }

    /**
     * Persist prepared outgoing sessions while holding every per-address
     * lock (same discipline as {@link encryptMessagesBatch}). Re-reads
     * sessions inside the lock; defers to a concurrent writer's session
     * when identities agree to avoid clobbering a fresher ratchet advance,
     * and reports identity conflicts via `skipped`.
     */
    public async persistOutgoingSessionsBatch(
        entries: ReadonlyArray<{
            readonly address: SignalAddress
            readonly session: SignalSessionRecord
            readonly remoteIdentity: Uint8Array
        }>
    ): Promise<{
        readonly resolved: ReadonlyArray<{
            readonly address: SignalAddress
            readonly session: SignalSessionRecord
        }>
        readonly skipped: ReadonlyArray<{
            readonly address: SignalAddress
            readonly reason: 'identity-mismatch'
        }>
    }> {
        if (entries.length === 0) return { resolved: [], skipped: [] }
        const lockKeys = new Array<string>(entries.length)
        for (let i = 0; i < entries.length; i += 1) {
            lockKeys[i] = signalAddressLockKey(entries[i].address)
        }
        return this.sessionMutationLock.runMany(lockKeys, async () => {
            const addresses = entries.map((e) => e.address)
            const existingSessions = await this.stores.session.getSessionsBatch(addresses)
            const identityUpdates: { address: SignalAddress; identityKey: Uint8Array }[] = []
            const sessionUpdates: { address: SignalAddress; session: SignalSessionRecord }[] = []
            const resolved: { address: SignalAddress; session: SignalSessionRecord }[] = []
            const skipped: { address: SignalAddress; reason: 'identity-mismatch' }[] = []
            for (let i = 0; i < entries.length; i += 1) {
                const entry = entries[i]
                const existing = existingSessions[i]
                if (existing) {
                    if (uint8Equal(existing.remote.pubKey, entry.remoteIdentity)) {
                        resolved.push({ address: entry.address, session: existing })
                        continue
                    }
                    skipped.push({ address: entry.address, reason: 'identity-mismatch' })
                    continue
                }
                identityUpdates.push({
                    address: toClassicSessionAddress(entry.address),
                    identityKey: entry.remoteIdentity
                })
                sessionUpdates.push({ address: entry.address, session: entry.session })
                resolved.push({ address: entry.address, session: entry.session })
            }
            if (identityUpdates.length > 0) {
                await this.stores.identity.setRemoteIdentities(identityUpdates)
            }
            if (sessionUpdates.length > 0) {
                await this.stores.session.setSessionsBatch(sessionUpdates)
            }
            return { resolved, skipped }
        })
    }

    /**
     * Encrypts `plaintext` for `address`. Returns `pkmsg` when this is the
     * first message of the session, `msg` otherwise. `expectedIdentity`
     * enforces identity continuity.
     */
    public async encryptMessage(
        address: SignalAddress,
        plaintext: Uint8Array,
        expectedIdentity?: Uint8Array
    ): Promise<{
        readonly type: 'msg' | 'pkmsg'
        readonly ciphertext: Uint8Array
        readonly baseKey: Uint8Array | null
    }> {
        const [encrypted] = await this.encryptMessagesBatch([
            { address, plaintext, expectedIdentity }
        ])
        return encrypted
    }

    /** Batch variant of {@link encryptMessage} that shares per-address locks. */
    public async encryptMessagesBatch(
        requests: readonly {
            readonly address: SignalAddress
            readonly plaintext: Uint8Array
            readonly expectedIdentity?: Uint8Array
        }[],
        prefetchedSessions?: readonly {
            readonly address: SignalAddress
            readonly session: SignalSessionRecord
        }[]
    ): Promise<
        readonly {
            readonly type: 'msg' | 'pkmsg'
            readonly ciphertext: Uint8Array
            readonly baseKey: Uint8Array | null
        }[]
    > {
        if (requests.length === 0) {
            return []
        }
        const lockKeySet = new Set<string>()
        for (let i = 0; i < requests.length; i += 1)
            lockKeySet.add(signalAddressLockKey(requests[i].address))
        const lockKeys = [...lockKeySet]
        return this.sessionMutationLock.runMany(lockKeys, async () => {
            const prefetchedByAddress = new Map<string, SignalSessionRecord>()
            if (prefetchedSessions && prefetchedSessions.length > 0) {
                for (let index = 0; index < prefetchedSessions.length; index += 1) {
                    const entry = prefetchedSessions[index]
                    prefetchedByAddress.set(signalAddressKey(entry.address), entry.session)
                }
            }

            const addressKeys = new Array<string>(requests.length)
            const seenAddressKeys = new Set<string>()
            const uniqueAddressKeys: string[] = []
            const uniqueAddresses: SignalAddress[] = []
            for (let index = 0; index < requests.length; index += 1) {
                const address = requests[index].address
                const addressKey = signalAddressKey(address)
                addressKeys[index] = addressKey
                if (seenAddressKeys.has(addressKey)) {
                    continue
                }
                seenAddressKeys.add(addressKey)
                uniqueAddressKeys.push(addressKey)
                uniqueAddresses.push(address)
            }

            const currentSessions = await this.stores.session.getSessionsBatch(uniqueAddresses)
            const latestSessionByAddress = new Map<string, SignalSessionRecord>()
            for (let index = 0; index < uniqueAddresses.length; index += 1) {
                const addressKey = uniqueAddressKeys[index]
                const current = currentSessions[index]
                if (current) {
                    latestSessionByAddress.set(addressKey, current)
                    continue
                }
                const prefetched = prefetchedByAddress.get(addressKey)
                if (prefetched) {
                    latestSessionByAddress.set(addressKey, prefetched)
                }
            }
            const sessionUpdatesByAddress = new Map<
                string,
                { readonly address: SignalAddress; readonly session: SignalSessionRecord }
            >()
            const identityUpdatesByAddress = new Map<
                string,
                { readonly address: SignalAddress; readonly identityKey: Uint8Array }
            >()
            const results = new Array<{
                readonly type: 'msg' | 'pkmsg'
                readonly ciphertext: Uint8Array
                readonly baseKey: Uint8Array | null
            }>(requests.length)

            const pq = this.pqPolicy.isOneToOneEnabled()
            for (let index = 0; index < requests.length; index += 1) {
                const request = requests[index]
                const address = request.address
                const addressKey = addressKeys[index]
                const session = latestSessionByAddress.get(addressKey)
                if (!session) {
                    throw new Error('signal session not found')
                }
                if (
                    request.expectedIdentity &&
                    !uint8Equal(toSerializedPubKey(request.expectedIdentity), session.remote.pubKey)
                ) {
                    throw new Error('identity mismatch')
                }

                const [updatedSession, encrypted] = encryptMsg(session, request.plaintext, pq)
                latestSessionByAddress.set(addressKey, updatedSession)
                sessionUpdatesByAddress.set(addressKey, {
                    address,
                    session: updatedSession
                })
                if (!uint8Equal(updatedSession.remote.pubKey, session.remote.pubKey)) {
                    identityUpdatesByAddress.set(addressKey, {
                        address: toClassicSessionAddress(address),
                        identityKey: updatedSession.remote.pubKey
                    })
                }
                results[index] = {
                    ...encrypted,
                    baseKey: updatedSession.aliceBaseKey
                }
            }

            // Persist remote identities first when needed so session writes never commit ahead of identity data.
            if (identityUpdatesByAddress.size > 0) {
                const identityUpdates = new Array<{
                    readonly address: SignalAddress
                    readonly identityKey: Uint8Array
                }>(identityUpdatesByAddress.size)
                let identityIndex = 0
                for (const update of identityUpdatesByAddress.values()) {
                    identityUpdates[identityIndex] = update
                    identityIndex += 1
                }
                await this.stores.identity.setRemoteIdentities(identityUpdates)
            }
            const sessionUpdates = new Array<{
                readonly address: SignalAddress
                readonly session: SignalSessionRecord
            }>(sessionUpdatesByAddress.size)
            let sessionIndex = 0
            for (const update of sessionUpdatesByAddress.values()) {
                sessionUpdates[sessionIndex] = update
                sessionIndex += 1
            }
            await this.stores.session.setSessionsBatch(sessionUpdates)
            return results
        })
    }

    /**
     * Decrypts a Signal message (`msg` or `pkmsg`) from `address`. For
     * `pkmsg`, instantiates the session from the embedded bundle when needed.
     */
    public async decryptMessage(
        address: SignalAddress,
        envelope: {
            readonly type: 'msg' | 'pkmsg'
            readonly ciphertext: Uint8Array
        }
    ): Promise<Uint8Array> {
        return this.runWithAddressLock(address, async () => {
            const currentSession = await this.stores.session.getSession(address)

            let outcome: DecryptOutcome
            if (envelope.type === 'pkmsg') {
                const parsedPk = deserializePkMsg(envelope.ciphertext)
                outcome = await this.decryptPkMsg(currentSession, parsedPk)
            } else {
                const parsed = deserializeMsg(envelope.ciphertext)
                outcome = await decryptMsg(
                    currentSession,
                    parsed,
                    (error, previousSessionIndex) => {
                        this.logger.debug('signal decrypt fallback session failed', {
                            previousSessionIndex,
                            message: error.message
                        })
                    }
                )
            }

            const nextRemoteIdentity =
                outcome.newSessionInfo?.newIdentity ?? outcome.updatedSession.remote.pubKey
            const identityChanged =
                !currentSession || !uint8Equal(currentSession.remote.pubKey, nextRemoteIdentity)
            // Keep writes ordered for consistency with resolver identity checks.
            if (identityChanged) {
                await this.stores.identity.setRemoteIdentity(
                    toClassicSessionAddress(address),
                    nextRemoteIdentity
                )
            }
            await this.stores.session.setSession(address, outcome.updatedSession)
            await this.consumeUsedPreKeys(outcome.newSessionInfo)
            return outcome.plaintext
        })
    }

    /**
     * Drops the one-time keys a new session was built from, only once that
     * session is persisted so a failed write leaves them for the redelivery.
     * A failed cleanup is logged: the message and its session are already safe.
     */
    private async consumeUsedPreKeys(info: DecryptOutcome['newSessionInfo']): Promise<void> {
        if (!info) {
            return
        }
        if (info.usedPreKey !== null && info.usedPreKey !== undefined) {
            try {
                await this.stores.preKey.consumePreKeyById(info.usedPreKey)
            } catch (error) {
                this.logger.warn('signal one-time prekey cleanup failed', {
                    preKeyId: info.usedPreKey,
                    message: toError(error).message
                })
            }
        }
        const preKeyStore = this.stores.preKey
        if (
            info.usedKyberPreKeyId !== null &&
            info.usedKyberPreKeyId !== undefined &&
            hasPqPreKeyStore(preKeyStore)
        ) {
            try {
                await preKeyStore.consumeKyberPreKeyById(info.usedKyberPreKeyId)
            } catch (error) {
                this.logger.warn('signal kyber prekey cleanup failed', {
                    kyberPreKeyId: info.usedKyberPreKeyId,
                    message: toError(error).message
                })
            }
        }
    }

    private runWithAddressLock<T>(address: SignalAddress, task: () => Promise<T>): Promise<T> {
        return this.sessionMutationLock.run(signalAddressLockKey(address), task)
    }

    /**
     * PQXDH initiator inputs for a post-quantum session address: checks the
     * signed pre-key and the Kyber pre-key against the peer identity, then
     * encapsulates. Returns `undefined` for a classic address; any other
     * failure throws, so no session is created rather than a weaker one.
     */
    private async resolveOutgoingPqParams(
        address: SignalAddress,
        remoteBundle: SignalPreKeyBundle
    ): Promise<
        | {
              readonly kemSharedSecret: Uint8Array
              readonly kemCiphertext: Uint8Array
              readonly kyberPreKeyId: number
          }
        | undefined
    > {
        if (!isPqSessionAddress(address)) {
            return undefined
        }
        if (!isMlKemSupported()) {
            throw new Error('signal pqxdh session requires ML-KEM runtime support')
        }
        const kyberKey = remoteBundle.kyberKey
        if (!kyberKey) {
            throw new Error('signal pqxdh session requires a kyber pre-key in the bundle')
        }
        const identity = toRawPubKey(remoteBundle.identity)
        const [signedKeyValid, kyberKeyValid] = await Promise.all([
            xeddsaVerify(
                identity,
                toSerializedPubKey(remoteBundle.signedKey.publicKey),
                remoteBundle.signedKey.signature
            ),
            xeddsaVerify(identity, kyberKey.publicKey, kyberKey.signature)
        ])
        if (!signedKeyValid || !kyberKeyValid) {
            throw new Error('signal pqxdh pre-key signature invalid')
        }
        const { ciphertext, sharedSecret } = kemEncapsulate(kyberKey.publicKey)
        return {
            kemSharedSecret: sharedSecret,
            kemCiphertext: ciphertext,
            kyberPreKeyId: kyberKey.id
        }
    }

    private async decryptPkMsg(
        currentSession: SignalSessionRecord | null,
        parsed: ParsedPreKeySignalMessage
    ): Promise<DecryptOutcome> {
        const matchingSession = findMatchingSession(currentSession, parsed.sessionBaseKey)
        if (matchingSession) {
            const [updatedSession, plaintext] = await decryptMsgFromSession(matchingSession, parsed)
            return {
                updatedSession,
                plaintext,
                newSessionInfo: null
            }
        }

        const [local, signedPreKey, oneTimePreKey] = await Promise.all([
            requireLocalIdentity(this.stores.signal),
            requireSignedPreKey(this.stores.signal, parsed.localSignedPreKeyId),
            parsed.localOneTimeKeyId === null || parsed.localOneTimeKeyId === undefined
                ? Promise.resolve(null)
                : requirePreKey(this.stores.preKey, parsed.localOneTimeKeyId)
        ])
        let pqSharedSecret: Uint8Array | null = null
        let usedKyberPreKeyId: number | null = null
        if (parsed.kemCiphertext && parsed.localKyberPreKeyId !== null) {
            if (!isMlKemSupported()) {
                throw new Error('signal pqxdh message requires ML-KEM runtime support')
            }
            const preKeyStore = this.stores.preKey
            if (!hasPqPreKeyStore(preKeyStore)) {
                throw new Error('signal pqxdh message requires a pre-key store with pq support')
            }
            const kyberPreKey = await preKeyStore.getKyberPreKeyById(parsed.localKyberPreKeyId)
            if (kyberPreKey) {
                try {
                    pqSharedSecret = kemDecapsulate(
                        kyberPreKey.keyPair.privKey,
                        parsed.kemCiphertext
                    )
                } catch (error) {
                    this.logger.warn('signal pqxdh decapsulation failed', {
                        kyberPreKeyId: parsed.localKyberPreKeyId,
                        message: toError(error).message
                    })
                    throw new Error('signal pqxdh decapsulation failed')
                }
                usedKyberPreKeyId = parsed.localKyberPreKeyId
            } else {
                this.logger.warn('signal pqxdh local kyber prekey not found', {
                    kyberPreKeyId: parsed.localKyberPreKeyId
                })
            }
        }
        const incoming = await initiateSessionIncoming(
            local,
            parsed.remote,
            parsed.sessionBaseKey,
            {
                signed: toSerializedKeyPair(signedPreKey.keyPair),
                oneTime: oneTimePreKey ? toSerializedKeyPair(oneTimePreKey.keyPair) : undefined,
                ratchet: toSerializedKeyPair(signedPreKey.keyPair)
            },
            pqSharedSecret
        )

        const newIdentity =
            !currentSession || !uint8Equal(incoming.remote.pubKey, currentSession.remote.pubKey)
                ? incoming.remote.pubKey
                : null
        const baseSession = currentSession
            ? {
                  ...incoming,
                  prevSessions: [
                      encodeSignalSessionSnapshot(currentSession),
                      ...currentSession.prevSessions.slice(0, MAX_PREV_SESSIONS - 1)
                  ]
              }
            : incoming

        const [updatedSession, plaintext] = await decryptMsgFromSession(baseSession, parsed)
        return {
            updatedSession,
            plaintext,
            newSessionInfo: {
                newIdentity,
                baseSession,
                usedPreKey: parsed.localOneTimeKeyId,
                usedKyberPreKeyId
            }
        }
    }
}
