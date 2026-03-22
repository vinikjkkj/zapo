import { toSerializedPubKey } from '@crypto/core/keys'
import type { Logger } from '@infra/log/types'
import { normalizeDeviceJid, parseSignalAddressFromJid } from '@protocol/jid'
import type { SignalIdentitySyncApi } from '@signal/api/SignalIdentitySyncApi'
import type { SignalSessionSyncApi } from '@signal/api/SignalSessionSyncApi'
import type { SignalProtocol } from '@signal/session/SignalProtocol'
import type { SignalAddress, SignalSessionRecord } from '@signal/types'
import type { WaSignalStore } from '@store/contracts/signal.store'
import { uint8Equal } from '@util/bytes'
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

    const ensureSession = async (
        address: SignalAddress,
        jid: string,
        expectedIdentity?: Uint8Array,
        reasonIdentity = false
    ): Promise<void> => {
        const expectedSerializedIdentity = expectedIdentity
            ? toSerializedPubKey(expectedIdentity)
            : null
        if (reasonIdentity) {
            await signalIdentitySync.syncIdentityKeys([jid])
        }
        if (await signalProtocol.hasSession(address)) {
            if (expectedSerializedIdentity) {
                const storedIdentity = await signalStore.getRemoteIdentity(address)
                if (!storedIdentity || !uint8Equal(storedIdentity, expectedSerializedIdentity)) {
                    throw new Error('identity mismatch')
                }
            }
            return
        }
        logger.info('signal session missing, fetching remote key bundle', { jid })
        const fetched = await signalSessionSync.fetchKeyBundle({
            jid,
            reasonIdentity
        })
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
        await signalProtocol.establishOutgoingSession(address, fetched.bundle)
        logger.info('signal session synchronized', {
            jid,
            regId: fetched.bundle.regId,
            hasOneTimeKey: fetched.bundle.oneTimeKey !== undefined
        })
    }

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
                    normalizedExpectedIdentityByJid.set(
                        normalizeDeviceJid(jid),
                        toSerializedPubKey(identity)
                    )
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
        const synchronizeMissingTarget = async (
            targetIndex: number
        ): Promise<SignalSessionRecord> => {
            const targetJid = normalizedTargetJids[targetIndex]
            const targetAddress = normalizedTargetAddresses[targetIndex]
            const fetched = await signalSessionSync.fetchKeyBundle({
                jid: targetJid
            })
            const expectedSerializedIdentity = normalizedExpectedIdentityByJid?.get(targetJid)
            if (
                expectedSerializedIdentity &&
                !uint8Equal(toSerializedPubKey(fetched.bundle.identity), expectedSerializedIdentity)
            ) {
                throw new Error('identity mismatch')
            }
            const session = await signalProtocol.establishOutgoingSession(
                targetAddress,
                fetched.bundle
            )
            logger.debug('signal session synchronized from single key fetch', {
                jid: targetJid,
                regId: fetched.bundle.regId,
                hasOneTimeKey: fetched.bundle.oneTimeKey !== undefined
            })
            return session
        }

        const missingIndices: number[] = []
        for (let index = 0; index < normalizedTargetJids.length; index += 1) {
            const session = resolvedByIndex[index]
            const expectedSerializedIdentity = normalizedExpectedIdentityByJid?.get(
                normalizedTargetJids[index]
            )
            if (session && expectedSerializedIdentity) {
                if (!uint8Equal(session.remote.pubKey, expectedSerializedIdentity)) {
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

        try {
            const batchRequest = new Array<{ readonly jid: string }>(missingIndices.length)
            for (let index = 0; index < missingIndices.length; index += 1) {
                batchRequest[index] = { jid: normalizedTargetJids[missingIndices[index]] }
            }
            const batchResults = await signalSessionSync.fetchKeyBundles(batchRequest)
            const fallbackIndices: number[] = []
            const establishedIndices = new Array<number>(missingIndices.length)
            const establishedBundles = new Array<{
                readonly regId: number
                readonly hasOneTimeKey: boolean
            }>(missingIndices.length)
            const establishPromises = new Array<Promise<SignalSessionRecord>>(missingIndices.length)
            let establishedCount = 0
            for (let index = 0; index < missingIndices.length; index += 1) {
                const targetIndex = missingIndices[index]
                const result = batchResults[index]
                if (!result || !('bundle' in result)) {
                    fallbackIndices.push(targetIndex)
                    continue
                }
                const targetJid = normalizedTargetJids[targetIndex]
                const expectedSerializedIdentity = normalizedExpectedIdentityByJid?.get(targetJid)
                if (
                    expectedSerializedIdentity &&
                    !uint8Equal(
                        toSerializedPubKey(result.bundle.identity),
                        expectedSerializedIdentity
                    )
                ) {
                    throw new Error('identity mismatch')
                }
                establishedIndices[establishedCount] = targetIndex
                establishedBundles[establishedCount] = {
                    regId: result.bundle.regId,
                    hasOneTimeKey: result.bundle.oneTimeKey !== undefined
                }
                establishPromises[establishedCount] = signalProtocol.establishOutgoingSession(
                    normalizedTargetAddresses[targetIndex],
                    result.bundle
                )
                establishedCount += 1
            }

            establishedIndices.length = establishedCount
            establishedBundles.length = establishedCount
            establishPromises.length = establishedCount
            const establishmentResults = await Promise.allSettled(establishPromises)
            for (let index = 0; index < establishmentResults.length; index += 1) {
                const result = establishmentResults[index]
                const targetIndex = establishedIndices[index]
                if (result.status === 'fulfilled') {
                    resolvedByIndex[targetIndex] = result.value
                    logger.debug('signal session synchronized from batch key fetch', {
                        jid: normalizedTargetJids[targetIndex],
                        regId: establishedBundles[index].regId,
                        hasOneTimeKey: establishedBundles[index].hasOneTimeKey
                    })
                    continue
                }
                const error = toError(result.reason)
                if (error.message === 'identity mismatch') {
                    throw error
                }
                fallbackIndices.push(targetIndex)
            }

            if (fallbackIndices.length === 0) {
                return collectResolvedTargets()
            }

            logger.warn(
                'signal batch key fetch returned partial errors, falling back to single requests',
                {
                    requested: missingIndices.length,
                    fallbackTargets: fallbackIndices.length
                }
            )
            for (let index = 0; index < fallbackIndices.length; index += 1) {
                const targetIndex = fallbackIndices[index]
                if (resolvedByIndex[targetIndex]) {
                    continue
                }
                try {
                    resolvedByIndex[targetIndex] = await synchronizeMissingTarget(targetIndex)
                } catch (error) {
                    const normalized = toError(error)
                    if (normalized.message === 'identity mismatch') {
                        throw normalized
                    }
                    logger.warn('signal single key fetch failed after batch fallback', {
                        jid: normalizedTargetJids[targetIndex],
                        message: normalized.message
                    })
                }
            }
        } catch (error) {
            const normalized = toError(error)
            if (normalized.message === 'identity mismatch') {
                throw normalized
            }
            logger.warn('signal batch key fetch failed, falling back to single requests', {
                requested: missingIndices.length,
                message: normalized.message
            })
            for (let index = 0; index < missingIndices.length; index += 1) {
                const targetIndex = missingIndices[index]
                if (resolvedByIndex[targetIndex]) {
                    continue
                }
                try {
                    resolvedByIndex[targetIndex] = await synchronizeMissingTarget(targetIndex)
                } catch (fallbackError) {
                    const fallbackNormalized = toError(fallbackError)
                    if (fallbackNormalized.message === 'identity mismatch') {
                        throw fallbackNormalized
                    }
                    logger.warn('signal single key fetch failed', {
                        jid: normalizedTargetJids[targetIndex],
                        message: fallbackNormalized.message
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
