import type { Logger } from '../../infra/log/types'
import { WA_DISCONNECT_REASONS, WA_STREAM_SIGNALING } from '../../protocol/constants'

import type { WaStreamControlNodeResult } from './parse'

interface StreamControlHandlers {
    readonly logger: Logger
    readonly forceLoginDueToStreamError: (code: number) => Promise<void>
    readonly logoutDueToStreamError: (
        reason: string,
        shouldRestartBackend: boolean
    ) => Promise<void>
    readonly disconnectDueToStreamError: (reason: string) => Promise<void>
    readonly resumeSocketDueToStreamError: (reason: string) => Promise<void>
}

export async function handleParsedStreamControl(
    result: WaStreamControlNodeResult,
    handlers: StreamControlHandlers
): Promise<void> {
    switch (result.kind) {
        case 'xmlstreamend':
            handlers.logger.info('received xmlstreamend stanza')
            return
        case 'stream_error_code':
            handlers.logger.warn('received stream:error with code', { code: result.code })
            if (result.code >= 500 && result.code < 600) {
                if (result.code === WA_STREAM_SIGNALING.FORCE_LOGIN_CODE) {
                    await handlers.forceLoginDueToStreamError(result.code)
                    return
                }
                if (result.code === WA_STREAM_SIGNALING.FORCE_LOGOUT_CODE) {
                    await handlers.logoutDueToStreamError(
                        `stream_error_code_${WA_STREAM_SIGNALING.FORCE_LOGOUT_CODE}`,
                        true
                    )
                    return
                }
            }
            await handlers.resumeSocketDueToStreamError(`stream_error_code_${result.code}`)
            return
        case 'stream_error_replaced':
            handlers.logger.warn('received stream:error replaced, stopping client')
            await handlers.disconnectDueToStreamError(WA_DISCONNECT_REASONS.STREAM_ERROR_REPLACED)
            return
        case 'stream_error_device_removed':
            handlers.logger.warn('received stream:error device removed, logging out')
            await handlers.logoutDueToStreamError(
                WA_DISCONNECT_REASONS.STREAM_ERROR_DEVICE_REMOVED,
                false
            )
            return
        case 'stream_error_ack':
            handlers.logger.warn('received stream:error ack', { id: result.id })
            await handlers.resumeSocketDueToStreamError(WA_DISCONNECT_REASONS.STREAM_ERROR_ACK)
            return
        case 'stream_error_xml_not_well_formed':
            handlers.logger.warn('received stream:error xml-not-well-formed')
            await handlers.resumeSocketDueToStreamError(
                WA_DISCONNECT_REASONS.STREAM_ERROR_XML_NOT_WELL_FORMED
            )
            return
        case 'stream_error_other':
            handlers.logger.warn('received stream:error other')
            await handlers.resumeSocketDueToStreamError(WA_DISCONNECT_REASONS.STREAM_ERROR_OTHER)
            return
        default:
            return
    }
}
