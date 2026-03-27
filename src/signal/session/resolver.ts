import { toSerializedPubKey } from '@crypto/core/keys'
import type { Logger } from '@infra/log/types'
import { PromiseDedup } from '@infra/perf/PromiseDedup'
import { normalizeDeviceJid, parseSignalAddressFromJid, signalAddressKey } from '@protocol/jid'
import type { SignalIdentitySyncApi } from '@signal/api/SignalIdentitySyncApi'
import type { SignalSessionSyncApi } from '@signal/api/SignalSessionSyncApi'
import type { SignalProtocol } from '@signal/session/SignalProtocol'
import type { SignalAddress, SignalPreKeyBundle, SignalSessionRecord } from '@signal/types'
import type { WaSignalStore } from '@store/contracts/signal.store'
import { bytesToHex, uint8Equal } from '@util/bytes'
import { toError } from '@util/primitives'

export interface SignalResolvedSessionTarget {
    readonly jid: string
    readonly address: SignalAddress
    readonly session: SignalSessionRecord
}

export type SignalSessionResolver = {
    ensureSession(
        address: SignalAddress,
        jid: string,
        expectedIdentity?: Uint8Array,
        reasonIdentity?: boolean
    ): Promise<void>

    ensureSessionsBatch(
        targetJids: readonly string[],
        expectedIdentityByJid?: ReadonlyMap<string, Uint8Array>
    ): Promise<readonly SignalResolvedSessionTarget[]>
}

export function createSignalSessionResolver(options: {
    readonly signalProtocol: SignalProtocol
    readonly signalStore: WaSignalStore
    readonly signalIdentitySync: SignalIdentitySyncApi
    readonly signalSessionSync: SignalSessionSyncApi
    readonly logger: Logger
}): SignalSessionResolver {
    const { signalProtocol, signalStore, signalIdentitySync, signalSessionSync, logger } = options
    const dedup = new PromiseDedup()

    const ensureSessionInternal = async (
        address: SignalAddress,
        jid: string,
        expectedIdentity?: Uint8Array,
        reasonIdentity = false,
        prefetchedBundle?: SignalPreKeyBundle
    ): Promise<SignalSessionRecord | null> => {
        const expectedSerializedIdentity = expectedIdentity
            ? toSerializedPubKey(expectedIdentity)
            : null
        if (reasonIdentity) {
            await signalIdentitySync.syncIdentityKeys([jid])
        }
        if (await signalStore.hasSession(address)) {
            if (expectedSerializedIdentity) {
                const storedIdentity = await signalStore.getRemoteIdentity(address)
                if (!storedIdentity || !uint8Equal(storedIdentity, expectedSerializedIdentity)) {
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
            logger.info('signal session missing, fetching remote key bundle', { jid })
            fetched = await signalSessionSync.fetchKeyBundle({
                jid,
                reasonIdentity
            })
        }
        const remoteIdentity = toSerializedPubKey(fetched.bundle.identity)
        if (reasonIdentity) {
            const storedIdentity = await signalStore.getRemoteIdentity(address)
            if (storedIdentity && !uint8Equal(remoteIdentity, storedIdentity)) {
                throw new Error('identity mismatch')
            }
        }
        if (expectedSerializedIdentity && !uint8Equal(remoteIdentity, expectedSerializedIdentity)) {
            throw new Error('identity mismatch')
        }
        const session = await signalProtocol.establishOutgoingSession(address, fetched.bundle, {
            reuseExisting: true
        })
        logger.info('signal session synchronized', {
            jid,
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
        prefetchedBundle?: SignalPreKeyBundle
    ): Promise<SignalSessionRecord | null> => {
        const expectedIdentityKey = expectedIdentity ? bytesToHex(expectedIdentity) : 'none'
        const dedupKey = `signalSession:${signalAddressKey(address)}:${reasonIdentity ? '1' : '0'}:${expectedIdentityKey}`
        return dedup.run(dedupKey, () =>
            ensureSessionInternal(address, jid, expectedIdentity, reasonIdentity, prefetchedBundle)
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

        const resolvedByIndex = (await signalStore.getSessionsBatch(
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
                if (!uint8Equal(session.remote.pubKey, toSerializedPubKey(expectedIdentity))) {
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

        const ensuredTargetIndices = new Array<number>(missingIndices.length)
        const ensurePromises = new Array<Promise<SignalSessionRecord | null>>(missingIndices.length)
        let ensureCount = 0
        for (let index = 0; index < missingIndices.length; index += 1) {
            const targetIndex = missingIndices[index]
            const targetJid = normalizedTargetJids[targetIndex]
            const batchResult = batchResults[index] as
                | { readonly bundle?: SignalPreKeyBundle; readonly errorText?: string }
                | undefined
            if (!batchResult?.bundle) {
                logger.warn('signal batch key fetch returned target without bundle', {
                    jid: targetJid,
                    message: batchResult?.errorText ?? 'missing key bundle user in response'
                })
                continue
            }
            const expectedIdentity = normalizedExpectedIdentityByJid?.get(targetJid)
            ensuredTargetIndices[ensureCount] = targetIndex
            ensurePromises[ensureCount] = ensureSessionWithDedup(
                normalizedTargetAddresses[targetIndex],
                targetJid,
                expectedIdentity,
                false,
                batchResult.bundle
            )
            ensureCount += 1
        }
        if (ensureCount === 0) {
            return collectResolvedTargets()
        }
        ensuredTargetIndices.length = ensureCount
        ensurePromises.length = ensureCount
        const ensureResults = await Promise.allSettled(ensurePromises)

        const fallbackIndices: number[] = []
        for (let index = 0; index < ensuredTargetIndices.length; index += 1) {
            const targetIndex = ensuredTargetIndices[index]
            const ensureResult = ensureResults[index]
            if (ensureResult.status === 'rejected') {
                const normalized = toError(ensureResult.reason)
                if (normalized.message === 'identity mismatch') {
                    throw normalized
                }
                logger.warn('signal session ensure failed during batch resolution', {
                    jid: normalizedTargetJids[targetIndex],
                    message: normalized.message
                })
                continue
            }
            const session = ensureResult.value
            if (session) {
                resolvedByIndex[targetIndex] = session
            } else {
                fallbackIndices.push(targetIndex)
            }
        }
        if (fallbackIndices.length > 0) {
            const fallbackAddresses = new Array<SignalAddress>(fallbackIndices.length)
            for (let i = 0; i < fallbackIndices.length; i++) {
                fallbackAddresses[i] = normalizedTargetAddresses[fallbackIndices[i]]
            }
            const fallbackSessions = await signalStore.getSessionsBatch(fallbackAddresses)
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
