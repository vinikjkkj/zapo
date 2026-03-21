import { toSerializedPubKey } from '@crypto/core/keys'
import type { Logger } from '@infra/log/types'
import { normalizeDeviceJid, parseSignalAddressFromJid } from '@protocol/jid'
import type { SignalIdentitySyncApi } from '@signal/api/SignalIdentitySyncApi'
import type { SignalSessionSyncApi } from '@signal/api/SignalSessionSyncApi'
import type { SignalProtocol } from '@signal/session/SignalProtocol'
import type { SignalAddress } from '@signal/types'
import type { WaSignalStore } from '@store/contracts/signal.store'
import { uint8Equal } from '@util/bytes'
import { toError } from '@util/primitives'

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
    ): Promise<void>
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
    ): Promise<void> => {
        const seenTargetJids = new Set<string>()
        const normalizedTargetJids: string[] = []
        const normalizedTargetAddresses: SignalAddress[] = []
        for (let index = 0; index < targetJids.length; index += 1) {
            const jid = normalizeDeviceJid(targetJids[index])
            if (seenTargetJids.has(jid)) {
                continue
            }
            seenTargetJids.add(jid)
            normalizedTargetJids.push(jid)
            normalizedTargetAddresses.push(parseSignalAddressFromJid(jid))
        }
        if (normalizedTargetJids.length === 0) {
            return
        }
        const normalizedExpectedIdentityByJid =
            expectedIdentityByJid && expectedIdentityByJid.size > 0
                ? new Map<string, Uint8Array>()
                : undefined
        if (normalizedExpectedIdentityByJid && expectedIdentityByJid) {
            for (const [jid, identity] of expectedIdentityByJid.entries()) {
                try {
                    normalizedExpectedIdentityByJid.set(normalizeDeviceJid(jid), identity)
                } catch (error) {
                    logger.trace(
                        'ignoring malformed expected identity jid during batch normalization',
                        { jid, message: toError(error).message }
                    )
                }
            }
        }
        const hasSessions = await signalProtocol.hasSessions(normalizedTargetAddresses)
        if (normalizedExpectedIdentityByJid) {
            for (let index = 0; index < normalizedTargetJids.length; index += 1) {
                if (!hasSessions[index]) {
                    continue
                }
                const expectedIdentity = normalizedExpectedIdentityByJid.get(
                    normalizedTargetJids[index]
                )
                if (!expectedIdentity) {
                    continue
                }
                const storedIdentity = await signalStore.getRemoteIdentity(
                    normalizedTargetAddresses[index]
                )
                if (
                    !storedIdentity ||
                    !uint8Equal(storedIdentity, toSerializedPubKey(expectedIdentity))
                ) {
                    throw new Error('identity mismatch')
                }
            }
        }
        const missingIndices: number[] = []
        for (let index = 0; index < normalizedTargetJids.length; index += 1) {
            if (!hasSessions[index]) {
                missingIndices.push(index)
            }
        }
        if (missingIndices.length === 0) {
            return
        }
        try {
            const batchRequest: { readonly jid: string }[] = []
            for (let index = 0; index < missingIndices.length; index += 1) {
                batchRequest.push({ jid: normalizedTargetJids[missingIndices[index]] })
            }
            const batchResults = await signalSessionSync.fetchKeyBundles(batchRequest)
            const fallbackIndices: number[] = []
            const establishedIndices: number[] = []
            const establishPromises: Promise<void>[] = []
            for (let index = 0; index < missingIndices.length; index += 1) {
                const targetIndex = missingIndices[index]
                const result = batchResults[index]
                if (!result || !('bundle' in result)) {
                    fallbackIndices.push(targetIndex)
                    continue
                }
                const targetJid = normalizedTargetJids[targetIndex]
                const expectedIdentity = normalizedExpectedIdentityByJid?.get(targetJid)
                const remoteIdentity = toSerializedPubKey(result.bundle.identity)
                if (
                    expectedIdentity &&
                    !uint8Equal(remoteIdentity, toSerializedPubKey(expectedIdentity))
                ) {
                    throw new Error('identity mismatch')
                }
                establishedIndices.push(targetIndex)
                establishPromises.push(
                    signalProtocol
                        .establishOutgoingSession(
                            normalizedTargetAddresses[targetIndex],
                            result.bundle
                        )
                        .then(() => {
                            logger.debug('signal session synchronized from batch key fetch', {
                                jid: targetJid,
                                regId: result.bundle.regId,
                                hasOneTimeKey: result.bundle.oneTimeKey !== undefined
                            })
                        })
                )
            }
            const establishmentResults = await Promise.allSettled(establishPromises)
            for (let index = 0; index < establishmentResults.length; index += 1) {
                const result = establishmentResults[index]
                if (result.status === 'fulfilled') {
                    continue
                }
                const error = toError(result.reason)
                if (error.message === 'identity mismatch') {
                    throw error
                }
                fallbackIndices.push(establishedIndices[index])
            }
            if (fallbackIndices.length === 0) {
                return
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
                const jid = normalizedTargetJids[targetIndex]
                await ensureSession(
                    normalizedTargetAddresses[targetIndex],
                    jid,
                    normalizedExpectedIdentityByJid?.get(jid)
                )
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
                const jid = normalizedTargetJids[targetIndex]
                await ensureSession(
                    normalizedTargetAddresses[targetIndex],
                    jid,
                    normalizedExpectedIdentityByJid?.get(jid)
                )
            }
        }
    }
    return {
        ensureSession,
        ensureSessionsBatch
    }
}
