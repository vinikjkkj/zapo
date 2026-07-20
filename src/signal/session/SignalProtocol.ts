import { toSerializedPubKey } from '@crypto'
import { ConsoleLogger } from '@infra/log/ConsoleLogger'
import type { Logger } from '@infra/log/types'
import { StoreLock } from '@infra/perf/StoreLock'
import { signalAddressKey } from '@protocol/jid'
import { MAX_PREV_SESSIONS } from '@signal/constants'
import { encodeSignalSessionSnapshot } from '@signal/session/encoding'
import type { SignalAddressResolver } from '@signal/session/SignalAddressResolver'
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
import type { WaPreKeyStore } from '@store/contracts/pre-key.store'
import type { WaSessionStore } from '@store/contracts/session.store'
import type { WaSignalStore } from '@store/contracts/signal.store'
import { uint8Equal } from '@util/bytes'

function signalAddressLockKey(address: SignalAddress): string {
    return `signal:${signalAddressKey(address)}`
}

interface EstablishOutgoingSessionOptions {
    readonly reuseExisting?: boolean
    readonly knownAbsent?: boolean
}

interface SignalEncryptRequest {
    readonly address: SignalAddress
    readonly plaintext: Uint8Array
    readonly expectedIdentity?: Uint8Array
}

interface SignalPrefetchedSession {
    readonly address: SignalAddress
    readonly session: SignalSessionRecord
}

interface SignalEncryptResult {
    readonly type: 'msg' | 'pkmsg'
    readonly ciphertext: Uint8Array
    readonly baseKey: Uint8Array | null
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
    private readonly addressResolver: SignalAddressResolver | undefined

    public constructor(
        stores: SignalProtocolStores,
        logger: Logger = new ConsoleLogger('info'),
        addressResolver?: SignalAddressResolver
    ) {
        this.stores = stores
        this.logger = logger
        this.sessionMutationLock = new StoreLock()
        this.addressResolver = addressResolver
    }

    /**
     * Builds an outgoing Signal session against a remote prekey bundle. Set
     * `options.reuseExisting` to skip the handshake when a session already
     * exists for the same remote identity. Set `options.knownAbsent` only
     * when the caller already proved (within the same logical step) that no
     * session exists; it skips the in-lock recheck and forces a new handshake.
     */
    public async establishOutgoingSession(
        address: SignalAddress,
        remoteBundle: SignalPreKeyBundle,
        options: EstablishOutgoingSessionOptions = {}
    ): Promise<SignalSessionRecord> {
        address = await this.resolveAddress(address)
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
            const [local, localOneTimeBase] = await Promise.all([
                requireLocalIdentity(this.stores.signal),
                generateSerializedKeyPair()
            ])
            const session = await initiateSessionOutgoing(local, remoteBundle, localOneTimeBase)
            // Keep writes ordered: a stored session without matching remote identity causes false mismatch checks.
            await this.stores.identity.setRemoteIdentity(address, session.remote.pubKey)
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
        address = await this.resolveAddress(address)
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
            const [local, localOneTimeBase] = await Promise.all([
                requireLocalIdentity(this.stores.signal),
                generateSerializedKeyPair()
            ])
            const session = await initiateSessionOutgoing(local, remoteBundle, localOneTimeBase)
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
        entries = await this.resolveAddressEntries(entries)
        const entryIndexByAddress = new Map<string, number>()
        let uniqueEntries: Array<(typeof entries)[number]> | null = null
        for (let index = 0; index < entries.length; index += 1) {
            const entry = entries[index]
            const key = signalAddressKey(entry.address)
            const previousIndex = entryIndexByAddress.get(key)
            if (previousIndex !== undefined) {
                if (!uint8Equal(entries[previousIndex].remoteIdentity, entry.remoteIdentity)) {
                    throw new Error('identity mismatch')
                }
                uniqueEntries ??= entries.slice(0, index)
                continue
            }
            entryIndexByAddress.set(key, index)
            if (uniqueEntries) uniqueEntries.push(entry)
        }
        if (uniqueEntries) entries = uniqueEntries
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
                    address: entry.address,
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
    ): Promise<SignalEncryptResult> {
        address = await this.resolveAddress(address)
        const [encrypted] = await this.encryptMessagesBatchResolved([
            { address, plaintext, expectedIdentity }
        ])
        return encrypted
    }

    /** Batch variant of {@link encryptMessage} that shares per-address locks. */
    public async encryptMessagesBatch(
        requests: readonly SignalEncryptRequest[],
        prefetchedSessions?: readonly SignalPrefetchedSession[]
    ): Promise<readonly SignalEncryptResult[]> {
        if (requests.length === 0) {
            return []
        }
        requests = await this.resolveAddressEntries(requests)
        if (prefetchedSessions && prefetchedSessions.length > 0) {
            prefetchedSessions = await this.resolveAddressEntries(prefetchedSessions)
        }
        return this.encryptMessagesBatchResolved(requests, prefetchedSessions)
    }

    private async encryptMessagesBatchResolved(
        requests: readonly SignalEncryptRequest[],
        prefetchedSessions?: readonly SignalPrefetchedSession[]
    ): Promise<readonly SignalEncryptResult[]> {
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

            const uniqueAddressKeys = new Array<string>(requests.length)
            const uniqueAddresses = new Array<SignalAddress>(requests.length)
            let uniqueAddressCount = 0
            for (let index = 0; index < requests.length; index += 1) {
                const address = requests[index].address
                const addressKey = signalAddressKey(address)
                let isDuplicate = false
                for (let dedupIndex = 0; dedupIndex < uniqueAddressCount; dedupIndex += 1) {
                    if (uniqueAddressKeys[dedupIndex] === addressKey) {
                        isDuplicate = true
                        break
                    }
                }
                if (isDuplicate) {
                    continue
                }
                uniqueAddressKeys[uniqueAddressCount] = addressKey
                uniqueAddresses[uniqueAddressCount] = address
                uniqueAddressCount += 1
            }
            uniqueAddressKeys.length = uniqueAddressCount
            uniqueAddresses.length = uniqueAddressCount

            const currentSessions = await this.stores.session.getSessionsBatch(uniqueAddresses)
            const latestSessionByAddress = new Map<string, SignalSessionRecord>()
            for (let index = 0; index < uniqueAddressCount; index += 1) {
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
            const results = new Array<SignalEncryptResult>(requests.length)

            for (let index = 0; index < requests.length; index += 1) {
                const request = requests[index]
                const address = request.address
                const addressKey = signalAddressKey(address)
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

                const [updatedSession, encrypted] = await encryptMsg(session, request.plaintext)
                latestSessionByAddress.set(addressKey, updatedSession)
                sessionUpdatesByAddress.set(addressKey, {
                    address,
                    session: updatedSession
                })
                if (!uint8Equal(updatedSession.remote.pubKey, session.remote.pubKey)) {
                    identityUpdatesByAddress.set(addressKey, {
                        address,
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
        address = await this.resolveAddress(address)
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
                await this.stores.identity.setRemoteIdentity(address, nextRemoteIdentity)
            }
            await this.stores.session.setSession(address, outcome.updatedSession)
            return outcome.plaintext
        })
    }

    private runWithAddressLock<T>(address: SignalAddress, task: () => Promise<T>): Promise<T> {
        return this.sessionMutationLock.run(signalAddressLockKey(address), task)
    }

    private resolveAddress(address: SignalAddress): SignalAddress | Promise<SignalAddress> {
        return this.addressResolver ? this.addressResolver.resolve(address) : address
    }

    private async resolveAddressEntries<T extends { readonly address: SignalAddress }>(
        entries: readonly T[]
    ): Promise<readonly T[]> {
        if (!this.addressResolver || entries.length === 0) return entries
        const addresses = new Array<SignalAddress>(entries.length)
        for (let index = 0; index < entries.length; index += 1) {
            addresses[index] = entries[index].address
        }
        const resolvedAddresses = await this.addressResolver.resolveMany(addresses)
        if (resolvedAddresses === addresses) return entries

        let resolvedEntries: T[] | null = null
        for (let index = 0; index < entries.length; index += 1) {
            if (resolvedAddresses[index] === addresses[index]) {
                if (resolvedEntries) resolvedEntries.push(entries[index])
                continue
            }
            resolvedEntries ??= entries.slice(0, index)
            resolvedEntries.push({
                ...entries[index],
                address: resolvedAddresses[index]
            })
        }
        return resolvedEntries ?? entries
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
        const incoming = await initiateSessionIncoming(
            local,
            parsed.remote,
            parsed.sessionBaseKey,
            {
                signed: toSerializedKeyPair(signedPreKey.keyPair),
                oneTime: oneTimePreKey ? toSerializedKeyPair(oneTimePreKey.keyPair) : undefined,
                ratchet: toSerializedKeyPair(signedPreKey.keyPair)
            }
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
        // Only consume one-time prekeys after successful decrypt/session materialization.
        if (parsed.localOneTimeKeyId !== null && parsed.localOneTimeKeyId !== undefined) {
            await this.stores.preKey.consumePreKeyById(parsed.localOneTimeKeyId)
        }
        return {
            updatedSession,
            plaintext,
            newSessionInfo: {
                newIdentity,
                baseSession,
                usedPreKey: parsed.localOneTimeKeyId
            }
        }
    }
}
