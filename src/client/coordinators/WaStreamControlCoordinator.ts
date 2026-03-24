import type { Logger } from '@infra/log/types'
import {
    WA_CONNECTION_REASONS,
    WA_DISCONNECT_REASONS,
    WA_STREAM_SIGNALING
} from '@protocol/constants'
import type { WaConnectionCode, WaConnectionOpenReason, WaDisconnectReason } from '@protocol/stream'
import type { WaStreamControlNodeResult } from '@transport/stream/parse'
import type { WaComms } from '@transport/WaComms'
import { toError } from '@util/primitives'

interface WaStreamControlCoordinatorOptions {
    readonly logger: Logger
    readonly getComms: () => WaComms | null
    readonly clearPendingQueries: (error: Error) => void
    readonly clearMediaConnCache: () => void
    readonly disconnect: (
        reason: WaDisconnectReason,
        isLogout: boolean,
        code: WaConnectionCode | null
    ) => Promise<void>
    readonly clearStoredCredentials: () => Promise<void>
    readonly connect: (reason: WaConnectionOpenReason) => Promise<void>
}

export interface WaStreamControlHandler {
    readonly handleStreamControlResult: (result: WaStreamControlNodeResult) => Promise<void>
}

export function createStreamControlHandler(
    options: WaStreamControlCoordinatorOptions
): WaStreamControlHandler {
    const {
        logger,
        getComms,
        clearPendingQueries,
        clearMediaConnCache,
        disconnect,
        clearStoredCredentials,
        connect
    } = options

    let lifecyclePromise: Promise<void> | null = null

    const runStreamControlLifecycle = (
        reason: string,
        action: () => Promise<void>
    ): Promise<void> => {
        if (lifecyclePromise) {
            logger.debug('stream-control lifecycle already running', { reason })
            return lifecyclePromise
        }
        lifecyclePromise = action().finally(() => {
            lifecyclePromise = null
        })
        return lifecyclePromise
    }

    const restartBackendAfterStreamControl = async (reason: WaDisconnectReason): Promise<void> => {
        logger.info('restarting backend after stream control', { reason })
        try {
            await connect(WA_CONNECTION_REASONS.RECONNECTED)
        } catch (error) {
            logger.warn('failed to restart backend after stream control', {
                reason,
                message: toError(error).message
            })
        }
    }

    const resumeSocketDueToStreamError = async (reason: string): Promise<void> => {
        const comms = getComms()
        if (!comms) {
            return
        }
        logger.info('resuming socket due to stream control node', { reason })
        clearPendingQueries(new Error(`socket resume requested by ${reason}`))
        clearMediaConnCache()
        try {
            await comms.closeSocketAndResume()
        } catch (error) {
            logger.warn('failed to resume socket for stream control node', {
                reason,
                message: toError(error).message
            })
        }
    }

    const stopCommsImmediately = (): void => {
        void getComms()?.stopComms()
    }

    const forceLoginDueToStreamError = async (code: WaConnectionCode): Promise<void> => {
        const reason = WA_DISCONNECT_REASONS.STREAM_ERROR_FORCE_LOGIN
        stopCommsImmediately()
        await runStreamControlLifecycle(reason, async () => {
            logger.warn('received forced login stream error; starting login lifecycle', {
                code
            })
            await disconnect(reason, true, code)
            await clearStoredCredentials()
            await restartBackendAfterStreamControl(reason)
        })
    }

    const disconnectDueToStreamError = async (
        reason: WaDisconnectReason,
        code: WaConnectionCode | null
    ): Promise<void> => {
        stopCommsImmediately()
        await runStreamControlLifecycle(reason, async () => {
            logger.warn('disconnecting due to stream control node', { reason })
            await disconnect(reason, false, code)
        })
    }

    const logoutDueToStreamError = async (
        reason: WaDisconnectReason,
        code: WaConnectionCode | null,
        shouldRestartBackend: boolean
    ): Promise<void> => {
        stopCommsImmediately()
        await runStreamControlLifecycle(reason, async () => {
            logger.warn('logging out due to stream control node', {
                reason,
                shouldRestartBackend
            })
            await disconnect(reason, true, code)
            await clearStoredCredentials()
            if (shouldRestartBackend) {
                await restartBackendAfterStreamControl(reason)
            }
        })
    }

    return {
        handleStreamControlResult: async (result: WaStreamControlNodeResult) => {
            switch (result.kind) {
                case 'xmlstreamend':
                    logger.info('received xmlstreamend stanza')
                    return
                case 'stream_error_code':
                    logger.warn('received stream:error with code', { code: result.code })
                    if (result.code >= 500 && result.code < 600) {
                        if (result.code === WA_STREAM_SIGNALING.FORCE_LOGIN_CODE) {
                            await forceLoginDueToStreamError(result.code)
                            return
                        }
                        if (result.code === WA_STREAM_SIGNALING.FORCE_LOGOUT_CODE) {
                            await logoutDueToStreamError(
                                WA_DISCONNECT_REASONS.STREAM_ERROR_FORCE_LOGOUT,
                                result.code,
                                true
                            )
                            return
                        }
                    }
                    await resumeSocketDueToStreamError(`stream_error_code_${result.code}`)
                    return
                case 'stream_error_replaced':
                    logger.warn('received stream:error replaced, stopping client')
                    await disconnectDueToStreamError(
                        WA_DISCONNECT_REASONS.STREAM_ERROR_REPLACED,
                        null
                    )
                    return
                case 'stream_error_device_removed':
                    logger.warn('received stream:error device removed, logging out')
                    await logoutDueToStreamError(
                        WA_DISCONNECT_REASONS.STREAM_ERROR_DEVICE_REMOVED,
                        null,
                        false
                    )
                    return
                case 'stream_error_ack':
                    logger.warn('received stream:error ack', { id: result.id })
                    await resumeSocketDueToStreamError(WA_DISCONNECT_REASONS.STREAM_ERROR_ACK)
                    return
                case 'stream_error_xml_not_well_formed':
                    logger.warn('received stream:error xml-not-well-formed')
                    await resumeSocketDueToStreamError(
                        WA_DISCONNECT_REASONS.STREAM_ERROR_XML_NOT_WELL_FORMED
                    )
                    return
                case 'stream_error_other':
                    logger.warn('received stream:error other')
                    await resumeSocketDueToStreamError(WA_DISCONNECT_REASONS.STREAM_ERROR_OTHER)
                    return
                default:
                    return
            }
        }
    }
}
