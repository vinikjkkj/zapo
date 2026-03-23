import type { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import type { WaIncomingMessageEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import { proto } from '@proto'
import { toError } from '@util/primitives'

interface WaPersistIncomingMailboxOptions {
    readonly logger: Logger
    readonly writeBehind: WriteBehindPersistence
    readonly event: WaIncomingMessageEvent
}

function persistContacts(
    writeBehind: WriteBehindPersistence,
    event: WaIncomingMessageEvent,
    nowMs: number
): void {
    const candidateJids = [event.senderJid, event.rawNode.attrs.participant].filter(
        (jid): jid is string => !!jid
    )
    if (candidateJids.length === 0) {
        return
    }

    for (const jid of [...new Set(candidateJids)]) {
        writeBehind.persistContact({ jid, lastUpdatedMs: nowMs })
    }
}

export function persistIncomingMailboxEntities(options: WaPersistIncomingMailboxOptions): void {
    const { logger, writeBehind, event } = options
    const { stanzaId, chatJid } = event
    if (!stanzaId || !chatJid) {
        return
    }

    const nowMs = Date.now()
    try {
        const messageBytes = event.message
            ? proto.Message.encode(event.message).finish()
            : undefined
        writeBehind.persistMessage({
            id: stanzaId,
            threadJid: chatJid,
            senderJid: event.senderJid,
            participantJid: event.rawNode.attrs.participant,
            fromMe: false,
            timestampMs:
                event.timestampSeconds === undefined ? undefined : event.timestampSeconds * 1_000,
            encType: event.encryptionType,
            plaintext: event.plaintext,
            messageBytes
        })
        persistContacts(writeBehind, event, nowMs)
    } catch (error) {
        logger.warn('failed to persist incoming mailbox entities', {
            id: stanzaId,
            from: chatJid,
            message: toError(error).message
        })
    }
}
