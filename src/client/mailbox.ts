import type { WaIncomingMessageEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import { proto } from '@proto'
import type { WaContactStore } from '@store/contracts/contact.store'
import type { WaMessageStore } from '@store/contracts/message.store'
import { toError } from '@util/primitives'

interface WaPersistIncomingMailboxOptions {
    readonly logger: Logger
    readonly contactStore: WaContactStore
    readonly messageStore: WaMessageStore
    readonly event: WaIncomingMessageEvent
}

async function persistContacts(
    contactStore: WaContactStore,
    event: WaIncomingMessageEvent,
    nowMs: number
): Promise<void> {
    const candidateJids = new Set<string>()
    if (event.senderJid) {
        candidateJids.add(event.senderJid)
    }
    if (event.rawNode.attrs.participant) {
        candidateJids.add(event.rawNode.attrs.participant)
    }

    await Promise.all(
        Array.from(candidateJids, (jid) => contactStore.upsert({ jid, lastUpdatedMs: nowMs }))
    )
}

export async function persistIncomingMailboxEntities(
    options: WaPersistIncomingMailboxOptions
): Promise<void> {
    const { logger, contactStore, messageStore, event } = options
    const { id, from } = event
    if (!id || !from) {
        return
    }

    const nowMs = Date.now()
    try {
        const messageBytes = event.message
            ? proto.Message.encode(event.message).finish()
            : undefined
        await Promise.all([
            messageStore.upsert({
                id,
                threadJid: from,
                senderJid: event.senderJid,
                participantJid: event.rawNode.attrs.participant,
                fromMe: false,
                timestampMs: event.timestamp,
                encType: event.encType,
                plaintext: event.plaintext,
                messageBytes
            }),
            persistContacts(contactStore, event, nowMs)
        ])
    } catch (error) {
        logger.warn('failed to persist incoming mailbox entities', {
            id,
            from,
            message: toError(error).message
        })
    }
}
