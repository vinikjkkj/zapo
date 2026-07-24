import type { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import type { WaIncomingMessageEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import type { Proto } from '@proto'
import { isGroupJid } from '@protocol/jid'
import { longToNumber, toError } from '@util/primitives'

/** Values above ~year 2286 in seconds are treated as legacy millisecond rows. */
const EPHEMERAL_SETTING_MS_THRESHOLD = 10_000_000_000

function normalizeEphemeralSettingUnixSeconds(value: number): number {
    return value > EPHEMERAL_SETTING_MS_THRESHOLD ? Math.floor(value / 1000) : value
}

export interface WaPersistIncomingEphemeralSettingOptions {
    readonly logger: Logger
    readonly writeBehind: WriteBehindPersistence
    readonly event: WaIncomingMessageEvent
    readonly protocolMessage: Proto.Message.IProtocolMessage
}

/**
 * Persists a 1:1 {@link proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING}
 * into the thread store so outgoing sends pick up the peer's disappearing-mode
 * change without waiting for history sync.
 *
 * Groups are skipped – their timer is driven by group notifications and the
 * in-memory group metadata cache, not protocol messages.
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

    try {
        writeBehind.persistThread({
            jid: chatJid,
            ephemeralExpiration: expiration,
            ...(rawTimestamp !== undefined
                ? {
                      ephemeralSettingTimestamp: normalizeEphemeralSettingUnixSeconds(rawTimestamp)
                  }
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
