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
        if (reasonIdentity) {
            await signalIdentitySync.syncIdentityKeys([jid])
        }

        if (await signalProtocol.hasSession(address)) {
            if (expectedIdentity) {
                const storedIdentity = await signalStore.getRemoteIdentity(address)
                if (
                    !storedIdentity ||
                    !uint8Equal(storedIdentity, toSerializedPubKey(expectedIdentity))
                ) {
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
        if (expectedIdentity && !uint8Equal(remoteIdentity, toSerializedPubKey(expectedIdentity))) {
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
        expectedIdentityByJid: ReadonlyMap<string, Uint8Array> = new Map()
    ): Promise<void> => {
        const normalizedTargetJids = [...new Set(targetJids.map((jid) => normalizeDeviceJid(jid)))]
        if (normalizedTargetJids.length === 0) {
            return
        }

        const normalizedExpectedIdentityByJid = new Map<string, Uint8Array>()
        for (const [jid, identity] of expectedIdentityByJid.entries()) {
            try {
                normalizedExpectedIdentityByJid.set(normalizeDeviceJid(jid), identity)
            } catch (error) {
                logger.trace(
                    'ignoring malformed expected identity jid during batch normalization',
                    {
                        jid,
                        message: toError(error).message
                    }
                )
            }
        }

        const normalizedTargets = normalizedTargetJids.map((jid) => ({
            jid,
            address: parseSignalAddressFromJid(jid)
        }))
        const hasSessions = await signalProtocol.hasSessions(
            normalizedTargets.map((target) => target.address)
        )

        if (normalizedExpectedIdentityByJid.size > 0) {
            const existingSessionIdentityChecks: Promise<void>[] = []
            for (let index = 0; index < normalizedTargets.length; index += 1) {
                if (!hasSessions[index]) {
                    continue
                }
                const target = normalizedTargets[index]
                const expectedIdentity = normalizedExpectedIdentityByJid.get(target.jid)
                if (!expectedIdentity) {
                    continue
                }

                existingSessionIdentityChecks.push(
                    signalStore.getRemoteIdentity(target.address).then((storedIdentity) => {
                        if (
                            !storedIdentity ||
                            !uint8Equal(storedIdentity, toSerializedPubKey(expectedIdentity))
                        ) {
                            throw new Error('identity mismatch')
                        }
                    })
                )
            }
            await Promise.all(existingSessionIdentityChecks)
        }

        const missingTargets = normalizedTargets.filter((_, index) => !hasSessions[index])
        if (missingTargets.length === 0) {
            return
        }

        try {
            const batchResults = await signalSessionSync.fetchKeyBundles(
                missingTargets.map((target) => ({ jid: target.jid }))
            )
            const resultByJid = new Map(
                batchResults.map((result) => [normalizeDeviceJid(result.jid), result] as const)
            )
            const fallbackJids = new Set<string>()
            const establishTasks: {
                readonly jid: string
                readonly promise: Promise<void>
            }[] = []

            for (let index = 0; index < missingTargets.length; index += 1) {
                const target = missingTargets[index]
                const result = resultByJid.get(target.jid)
                if (!result || !('bundle' in result)) {
                    fallbackJids.add(target.jid)
                    continue
                }

                const expectedIdentity = normalizedExpectedIdentityByJid.get(target.jid)
                const remoteIdentity = toSerializedPubKey(result.bundle.identity)
                if (
                    expectedIdentity &&
                    !uint8Equal(remoteIdentity, toSerializedPubKey(expectedIdentity))
                ) {
                    throw new Error('identity mismatch')
                }

                establishTasks.push({
                    jid: target.jid,
                    promise: signalProtocol
                        .establishOutgoingSession(target.address, result.bundle)
                        .then(() => {
                            logger.debug('signal session synchronized from batch key fetch', {
                                jid: target.jid,
                                regId: result.bundle.regId,
                                hasOneTimeKey: result.bundle.oneTimeKey !== undefined
                            })
                        })
                })
            }

            const establishmentResults = await Promise.allSettled(
                establishTasks.map((task) => task.promise)
            )
            for (let index = 0; index < establishmentResults.length; index += 1) {
                const result = establishmentResults[index]
                if (result.status === 'fulfilled') {
                    continue
                }
                const error = toError(result.reason)
                if (error.message === 'identity mismatch') {
                    throw error
                }
                fallbackJids.add(establishTasks[index].jid)
            }

            if (fallbackJids.size === 0) {
                return
            }

            logger.warn(
                'signal batch key fetch returned partial errors, falling back to single requests',
                {
                    requested: missingTargets.length,
                    fallbackTargets: fallbackJids.size
                }
            )

            for (const jid of fallbackJids) {
                const address = parseSignalAddressFromJid(jid)
                await ensureSession(address, jid, normalizedExpectedIdentityByJid.get(jid))
            }
        } catch (error) {
            const normalized = toError(error)
            if (normalized.message === 'identity mismatch') {
                throw normalized
            }

            logger.warn('signal batch key fetch failed, falling back to single requests', {
                requested: missingTargets.length,
                message: normalized.message
            })

            for (let index = 0; index < missingTargets.length; index += 1) {
                const target = missingTargets[index]
                await ensureSession(
                    target.address,
                    target.jid,
                    normalizedExpectedIdentityByJid.get(target.jid)
                )
            }
        }
    }

    return {
        ensureSession,
        ensureSessionsBatch
    }
}
