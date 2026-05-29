import type { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import type { WaIncomingMessageEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import { needsSecretPersistence } from '@message/encode/content'
import { proto } from '@proto'
import { toUserJid } from '@protocol/jid'
import type { WaMessageSecretStore } from '@store/contracts/message-secret.store'
import { toError } from '@util/primitives'

interface WaPersistIncomingMailboxOptions {
    readonly logger: Logger
    readonly writeBehind: WriteBehindPersistence
    readonly messageSecretStore: WaMessageSecretStore
    readonly event: WaIncomingMessageEvent
}

function persistContacts(
    writeBehind: WriteBehindPersistence,
    event: WaIncomingMessageEvent,
    nowMs: number
): void {
    const senderJid =
        event.key.participant ?? event.rawNode.attrs.participant ?? event.key.remoteJid
    const rawParticipant = event.rawNode.attrs.participant
    const participantJid = rawParticipant ? toUserJid(rawParticipant) : undefined
    if (!senderJid && !participantJid) {
        return
    }
    if (senderJid) {
        writeBehind.persistContact({ jid: senderJid, lastUpdatedMs: nowMs })
    }
    if (participantJid && participantJid !== senderJid) {
        writeBehind.persistContact({ jid: participantJid, lastUpdatedMs: nowMs })
    }
}

export function persistIncomingMailboxEntities(options: WaPersistIncomingMailboxOptions): void {
    const { logger, writeBehind, messageSecretStore, event } = options
    const stanzaId = event.key.id
    const chatJid = event.key.remoteJid
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
            senderJid:
                event.key.participant ?? event.rawNode.attrs.participant ?? event.key.remoteJid,
            participantJid: event.rawNode.attrs.participant,
            fromMe: false,
            timestampMs:
                event.timestampSeconds === undefined ? undefined : event.timestampSeconds * 1_000,
            encType: event.encryptionType,
            plaintext: event.plaintext,
            messageBytes
        })
        persistContacts(writeBehind, event, nowMs)
        const rawSecret = event.message?.messageContextInfo?.messageSecret
        if (
            rawSecret &&
            rawSecret.length > 0 &&
            event.message &&
            needsSecretPersistence(event.message)
        ) {
            const rawSender =
                event.key.participant ?? event.rawNode.attrs.participant ?? event.key.remoteJid
            const senderJid = rawSender ? toUserJid(rawSender) : ''
            void messageSecretStore
                .set(stanzaId, { secret: rawSecret, senderJid })
                .catch((error) => {
                    logger.warn('failed to persist message secret', {
                        id: stanzaId,
                        message: toError(error).message
                    })
                })
        }
    } catch (error) {
        logger.warn('failed to persist incoming mailbox entities', {
            id: stanzaId,
            from: chatJid,
            message: toError(error).message
        })
    }
}
