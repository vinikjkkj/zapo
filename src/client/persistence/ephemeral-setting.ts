import type { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import type { WaIncomingMessageEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import type { Proto } from '@proto'
import { isGroupJid } from '@protocol/jid'
import { normalizeEphemeralSettingSeconds } from '@protocol/message'
import { longToNumber, toError } from '@util/primitives'

export interface WaPersistIncomingEphemeralSettingOptions {
    readonly logger: Logger
    readonly writeBehind: WriteBehindPersistence
    readonly event: WaIncomingMessageEvent
    readonly protocolMessage: Proto.Message.IProtocolMessage
}

/**
 * Persists a 1:1 `EPHEMERAL_SETTING` protocol message so outgoing sends pick up
 * the peer's change without waiting for history sync. Groups are skipped –
 * their timer comes from group notifications, not protocol messages.
 */
export function persistIncomingEphemeralSetting(
    options: WaPersistIncomingEphemeralSettingOptions
): void {
    const { logger, writeBehind, event, protocolMessage } = options
    const chatJid = event.key.remoteJid
    if (!chatJid || event.key.isGroup || isGroupJid(chatJid)) {
        return
    }

    const expiration = protocolMessage.ephemeralExpiration ?? 0
    const rawTimestamp =
        protocolMessage.ephemeralSettingTimestamp !== undefined &&
        protocolMessage.ephemeralSettingTimestamp !== null
            ? longToNumber(protocolMessage.ephemeralSettingTimestamp)
            : event.timestampSeconds
    const settingTimestamp =
        rawTimestamp !== undefined ? normalizeEphemeralSettingSeconds(rawTimestamp) : undefined

    try {
        writeBehind.persistThread({
            jid: chatJid,
            ephemeralExpiration: expiration,
            ...(settingTimestamp !== undefined
                ? { ephemeralSettingTimestamp: settingTimestamp }
                : {})
        })
    } catch (error) {
        logger.warn('failed to persist incoming ephemeral setting', {
            jid: chatJid,
            expiration,
            message: toError(error).message
        })
    }
}
