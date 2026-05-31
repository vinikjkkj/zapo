import { toSerializedPubKey } from '@crypto/core/keys'
import type { Logger } from '@infra/log/types'
import { PromiseDedup } from '@infra/perf/PromiseDedup'
import { normalizeDeviceJid, parseSignalAddressFromJid, signalAddressKey } from '@protocol/jid'
import type { SignalIdentitySyncApi } from '@signal/api/SignalIdentitySyncApi'
import type { SignalSessionSyncApi } from '@signal/api/SignalSessionSyncApi'
import type { SignalProtocol } from '@signal/session/SignalProtocol'
import type { SignalAddress, SignalPreKeyBundle, SignalSessionRecord } from '@signal/types'
import type { WaIdentityStore } from '@store/contracts/identity.store'
import type { WaSessionStore } from '@store/contracts/session.store'
import { bytesToHex, uint8Equal } from '@util/bytes'
import { toError } from '@util/primitives'

export interface SignalResolvedSessionTarget {
    readonly jid: string
    readonly address: SignalAddress
    readonly session: SignalSessionRecord
}

/**
 * Resolves Signal sessions for one or more JIDs, fetching missing prekey
 * bundles, enforcing identity continuity, and deduplicating concurrent
 * fetches for the same address.
 */
export type SignalSessionResolver = {
    /**
     * Ensures a session exists for `address` (fetching the prekey bundle if
     * needed). `reasonIdentity` triggers a remote identity refresh first.
     */
    ensureSession(
        address: SignalAddress,
        jid: string,
        expectedIdentity?: Uint8Array,
        reasonIdentity?: boolean
    ): Promise<void>

    /**
     * Batched session resolver – issues a single key-bundle fetch for all
     * missing JIDs. Returns the resolved targets that now have a session.
     */
    ensureSessionsBatch(
        targetJids: readonly string[],
        expectedIdentityByJid?: ReadonlyMap<string, Uint8Array>
    ): Promise<readonly SignalResolvedSessionTarget[]>
}

/** Builds a {@link SignalSessionResolver} backed by the given Signal APIs and stores. */
export function createSignalSessionResolver(options: {
    readonly signalProtocol: SignalProtocol
    readonly sessionStore: WaSessionStore
    readonly identityStore: WaIdentityStore
    readonly signalIdentitySync: SignalIdentitySyncApi
    readonly signalSessionSync: SignalSessionSyncApi
    readonly logger: Logger
}): SignalSessionResolver {
    const {
        signalProtocol,
        sessionStore,
        identityStore,
        signalIdentitySync,
        signalSessionSync,
        logger
    } = options
    const dedup = new PromiseDedup()

    const ensureSessionInternal = async (
        address: SignalAddress,
        jid: string,
        expectedIdentity?: Uint8Array,
        reasonIdentity = false,
        prefetchedBundle?: SignalPreKeyBundle,
        knownAbsent = false
    ): Promise<SignalSessionRecord | null> => {
        const jidLogger = logger.child({ jid })
        const expectedSerializedIdentity = expectedIdentity
            ? toSerializedPubKey(expectedIdentity)
            : null
        if (reasonIdentity) {
            await signalIdentitySync.syncIdentityKeys([jid])
        }
        if (!knownAbsent && (await sessionStore.hasSession(address))) {
            if (expectedSerializedIdentity) {
                const storedIdentity = await identityStore.getRemoteIdentity(address)
                if (!storedIdentity || !uint8Equal(storedIdentity, expectedSerializedIdentity)) {
                    jidLogger.warn('signal identity mismatch on stored identity', {
                        source: 'stored_vs_expected',
                        expected: bytesToHex(expectedSerializedIdentity),
                        stored: storedIdentity ? bytesToHex(storedIdentity) : null
                    })
                    throw new Error('identity mismatch')
                }
            }
            return null
        }
        let fetched: { readonly jid: string; readonly bundle: SignalPreKeyBundle }
        if (prefetchedBundle) {
            fetched = {
                jid,
                bundle: prefetchedBundle
            }
        } else {
            jidLogger.debug('signal session missing, fetching remote key bundle')
            fetched = await signalSessionSync.fetchKeyBundle({
                jid,
                reasonIdentity
            })
        }
        const remoteIdentity = toSerializedPubKey(fetched.bundle.identity)
        if (reasonIdentity) {
            const storedIdentity = await identityStore.getRemoteIdentity(address)
            if (storedIdentity && !uint8Equal(remoteIdentity, storedIdentity)) {
                jidLogger.warn('signal identity mismatch on fetched bundle vs stored', {
                    source: 'remote_vs_stored',
                    remote: bytesToHex(remoteIdentity),
                    stored: bytesToHex(storedIdentity)
                })
                throw new Error('identity mismatch')
            }
        }
        if (expectedSerializedIdentity && !uint8Equal(remoteIdentity, expectedSerializedIdentity)) {
            jidLogger.warn('signal identity mismatch on fetched bundle vs expected', {
                source: 'remote_vs_expected',
                remote: bytesToHex(remoteIdentity),
                expected: bytesToHex(expectedSerializedIdentity)
            })
            throw new Error('identity mismatch')
        }
        const session = await signalProtocol.establishOutgoingSession(address, fetched.bundle, {
            reuseExisting: true,
            knownAbsent
        })
        jidLogger.debug('signal session synchronized', {
            regId: fetched.bundle.regId,
            hasOneTimeKey: fetched.bundle.oneTimeKey !== undefined
        })
        return session
    }

    const ensureSessionWithDedup = (
        address: SignalAddress,
        jid: string,
        expectedIdentity?: Uint8Array,
        reasonIdentity = false,
        prefetchedBundle?: SignalPreKeyBundle,
        knownAbsent = false
    ): Promise<SignalSessionRecord | null> => {
        const expectedIdentityKey = expectedIdentity ? bytesToHex(expectedIdentity) : 'none'
        // knownAbsent is part of the dedup key: single-caller (false) and
        // batch (true) must NOT share a Promise, or the unsafe variant
        // could leak to the safe caller. Per-address lock + the recheck
        // inside persistOutgoingSessionsBatch resolves any race.
        const dedupKey = `signalSession:${signalAddressKey(address)}:${reasonIdentity ? '1' : '0'}:${expectedIdentityKey}:${knownAbsent ? '1' : '0'}`
        return dedup.run(dedupKey, () =>
            ensureSessionInternal(
                address,
                jid,
                expectedIdentity,
                reasonIdentity,
                prefetchedBundle,
                knownAbsent
            )
        )
    }

    const ensureSession = (
        address: SignalAddress,
        jid: string,
        expectedIdentity?: Uint8Array,
        reasonIdentity = false
    ): Promise<void> =>
        ensureSessionWithDedup(address, jid, expectedIdentity, reasonIdentity).then(() => {})

    const ensureSessionsBatch = async (
        targetJids: readonly string[],
        expectedIdentityByJid?: ReadonlyMap<string, Uint8Array>
    ): Promise<readonly SignalResolvedSessionTarget[]> => {
        const seenTargetJids = new Set<string>()
        const normalizedTargetJids = new Array<string>(targetJids.length)
        const normalizedTargetAddresses = new Array<SignalAddress>(targetJids.length)
        let normalizedTargetCount = 0
        for (let index = 0; index < targetJids.length; index += 1) {
            const jid = normalizeDeviceJid(targetJids[index])
            if (seenTargetJids.has(jid)) {
                continue
            }
            seenTargetJids.add(jid)
            normalizedTargetJids[normalizedTargetCount] = jid
            normalizedTargetAddresses[normalizedTargetCount] = parseSignalAddressFromJid(jid)
            normalizedTargetCount += 1
        }
        if (normalizedTargetCount === 0) {
            return []
        }
        normalizedTargetJids.length = normalizedTargetCount
        normalizedTargetAddresses.length = normalizedTargetCount

        const normalizedExpectedIdentityByJid =
            expectedIdentityByJid && expectedIdentityByJid.size > 0
                ? new Map<string, Uint8Array>()
                : undefined
        if (normalizedExpectedIdentityByJid && expectedIdentityByJid) {
            for (const [jid, identity] of expectedIdentityByJid.entries()) {
                try {
                    toSerializedPubKey(identity)
                    normalizedExpectedIdentityByJid.set(normalizeDeviceJid(jid), identity)
                } catch (error) {
                    logger.trace(
                        'ignoring malformed expected identity jid during batch normalization',
                        { jid, message: toError(error).message }
                    )
                }
            }
        }

        const resolvedByIndex = (await sessionStore.getSessionsBatch(
            normalizedTargetAddresses
        )) as (SignalSessionRecord | null)[]
        const collectResolvedTargets = (): readonly SignalResolvedSessionTarget[] => {
            const resolvedTargets = new Array<SignalResolvedSessionTarget>(
                normalizedTargetJids.length
            )
            let resolvedTargetCount = 0
            for (let index = 0; index < normalizedTargetJids.length; index += 1) {
                const session = resolvedByIndex[index]
                if (!session) {
                    continue
                }
                resolvedTargets[resolvedTargetCount] = {
                    jid: normalizedTargetJids[index],
                    address: normalizedTargetAddresses[index],
                    session
                }
                resolvedTargetCount += 1
            }
            resolvedTargets.length = resolvedTargetCount
            return resolvedTargets
        }

        const missingIndices: number[] = []
        for (let index = 0; index < normalizedTargetJids.length; index += 1) {
            const session = resolvedByIndex[index]
            const expectedIdentity = normalizedExpectedIdentityByJid?.get(
                normalizedTargetJids[index]
            )
            if (session && expectedIdentity) {
                const expectedSerialized = toSerializedPubKey(expectedIdentity)
                if (!uint8Equal(session.remote.pubKey, expectedSerialized)) {
                    logger.warn('signal identity mismatch on existing session vs expected', {
                        jid: normalizedTargetJids[index],
                        source: 'session_vs_expected',
                        session: bytesToHex(session.remote.pubKey),
                        expected: bytesToHex(expectedSerialized)
                    })
                    throw new Error('identity mismatch')
                }
            }
            if (!session) {
                missingIndices.push(index)
            }
        }
        if (missingIndices.length === 0) {
            return collectResolvedTargets()
        }
        const batchRequest = new Array<{ readonly jid: string }>(missingIndices.length)
        for (let index = 0; index < missingIndices.length; index += 1) {
            batchRequest[index] = { jid: normalizedTargetJids[missingIndices[index]] }
        }

        let batchResults: readonly unknown[]
        try {
            batchResults = await signalSessionSync.fetchKeyBundles(batchRequest)
        } catch (error) {
            logger.warn('signal batch key fetch failed', {
                requested: missingIndices.length,
                message: toError(error).message
            })
            return collectResolvedTargets()
        }

        // Prepare under per-address locks (no persist). Bulk persist below
        // holds every per-address lock at once via persistOutgoingSessionsBatch.
        const prepareTargetIndices = new Array<number>(missingIndices.length)
        const preparePromises = new Array<
            Promise<{
                readonly session: SignalSessionRecord
                readonly remoteIdentity: Uint8Array
            }>
        >(missingIndices.length)
        let prepareCount = 0
        const missingBundleTargets: { jid: string; reason: string }[] = []
        for (let index = 0; index < missingIndices.length; index += 1) {
            const targetIndex = missingIndices[index]
            const targetJid = normalizedTargetJids[targetIndex]
            const batchResult = batchResults[index] as
                | { readonly bundle?: SignalPreKeyBundle; readonly errorText?: string }
                | undefined
            if (!batchResult?.bundle) {
                missingBundleTargets.push({
                    jid: targetJid,
                    reason: batchResult?.errorText ?? 'missing key bundle user in response'
                })
                continue
            }
            const expectedIdentity = normalizedExpectedIdentityByJid?.get(targetJid)
            const expectedSerializedIdentity = expectedIdentity
                ? toSerializedPubKey(expectedIdentity)
                : null
            const bundleIdentity = toSerializedPubKey(batchResult.bundle.identity)
            if (
                expectedSerializedIdentity &&
                !uint8Equal(bundleIdentity, expectedSerializedIdentity)
            ) {
                logger.warn('signal identity mismatch on fetched batch bundle vs expected', {
                    jid: targetJid,
                    source: 'bundle_vs_expected',
                    bundle: bytesToHex(bundleIdentity),
                    expected: bytesToHex(expectedSerializedIdentity)
                })
                throw new Error('identity mismatch')
            }
            const targetAddress = normalizedTargetAddresses[targetIndex]
            const bundle = batchResult.bundle
            prepareTargetIndices[prepareCount] = targetIndex
            preparePromises[prepareCount] = signalProtocol
                .prepareOutgoingSession(targetAddress, bundle, {
                    reuseExisting: true,
                    knownAbsent: true
                })
                .then((prep) => ({
                    session: prep.session,
                    remoteIdentity: prep.remoteIdentity
                }))
            prepareCount += 1
        }
        if (missingBundleTargets.length > 0) {
            logger.warn('signal batch key fetch returned targets without bundle', {
                droppedCount: missingBundleTargets.length,
                totalRequested: missingIndices.length,
                sample: missingBundleTargets.slice(0, 3)
            })
        }
        if (prepareCount === 0) {
            return collectResolvedTargets()
        }
        prepareTargetIndices.length = prepareCount
        preparePromises.length = prepareCount
        const prepareResults = await Promise.allSettled(preparePromises)

        const batchEntries: {
            address: SignalAddress
            session: SignalSessionRecord
            remoteIdentity: Uint8Array
        }[] = []
        const entryToTargetIndex: number[] = []
        const fallbackIndices: number[] = []
        for (let i = 0; i < prepareTargetIndices.length; i += 1) {
            const targetIndex = prepareTargetIndices[i]
            const result = prepareResults[i]
            if (result.status === 'rejected') {
                const normalized = toError(result.reason)
                if (normalized.message === 'identity mismatch') {
                    throw normalized
                }
                logger.warn('signal session prepare failed during batch resolution', {
                    jid: normalizedTargetJids[targetIndex],
                    message: normalized.message
                })
                continue
            }
            batchEntries.push({
                address: normalizedTargetAddresses[targetIndex],
                session: result.value.session,
                remoteIdentity: result.value.remoteIdentity
            })
            entryToTargetIndex.push(targetIndex)
        }
        if (batchEntries.length === 0) {
            return collectResolvedTargets()
        }
        let persistResult: Awaited<ReturnType<SignalProtocol['persistOutgoingSessionsBatch']>>
        try {
            persistResult = await signalProtocol.persistOutgoingSessionsBatch(batchEntries)
        } catch (error) {
            const normalized = toError(error)
            logger.warn('signal batched session persist failed', {
                requested: batchEntries.length,
                message: normalized.message
            })
            for (let i = 0; i < entryToTargetIndex.length; i += 1) {
                fallbackIndices.push(entryToTargetIndex[i])
            }
            persistResult = { resolved: [], skipped: [] }
        }
        const sessionByAddressKey = new Map<string, SignalSessionRecord>()
        for (const r of persistResult.resolved) {
            sessionByAddressKey.set(signalAddressKey(r.address), r.session)
        }
        const skippedByAddressKey = new Set<string>()
        for (const s of persistResult.skipped) {
            skippedByAddressKey.add(signalAddressKey(s.address))
            logger.warn('signal session persist skipped due to identity conflict', {
                user: s.address.user,
                server: s.address.server,
                device: s.address.device
            })
        }
        for (let i = 0; i < entryToTargetIndex.length; i += 1) {
            const targetIndex = entryToTargetIndex[i]
            const addrKey = signalAddressKey(normalizedTargetAddresses[targetIndex])
            const session = sessionByAddressKey.get(addrKey)
            if (session) {
                resolvedByIndex[targetIndex] = session
                continue
            }
            if (skippedByAddressKey.has(addrKey)) {
                continue
            }
            if (!fallbackIndices.includes(targetIndex)) {
                fallbackIndices.push(targetIndex)
            }
        }
        if (fallbackIndices.length > 0) {
            const fallbackAddresses = new Array<SignalAddress>(fallbackIndices.length)
            for (let i = 0; i < fallbackIndices.length; i++) {
                fallbackAddresses[i] = normalizedTargetAddresses[fallbackIndices[i]]
            }
            const fallbackSessions = await sessionStore.getSessionsBatch(fallbackAddresses)
            for (let i = 0; i < fallbackIndices.length; i++) {
                const session = fallbackSessions[i]
                if (session) {
                    resolvedByIndex[fallbackIndices[i]] = session
                } else {
                    logger.warn('signal session ensure completed without persisted session', {
                        jid: normalizedTargetJids[fallbackIndices[i]]
                    })
                }
            }
        }

        return collectResolvedTargets()
    }

    return {
        ensureSession,
        ensureSessionsBatch
    }
}
