import assert from 'node:assert/strict'
import test from 'node:test'

import { persistIncomingMailboxEntities } from '@client/persistence/mailbox'
import type { WaIncomingMessageEvent } from '@client/types'
import { createNoopLogger } from '@infra/log/types'
import type { WaStoredContactRecord } from '@store/contracts/contact.store'

interface Captured {
    readonly messages: { readonly id: string; readonly threadJid: string }[]
    readonly contacts: WaStoredContactRecord[]
}

function captureWriteBehind(): {
    readonly captured: Captured
    readonly writeBehind: unknown
} {
    const captured: Captured = { messages: [], contacts: [] }
    const writeBehind = {
        persistMessage: (record: { id: string; threadJid: string }) => {
            captured.messages.push({ id: record.id, threadJid: record.threadJid })
        },
        persistContact: (record: WaStoredContactRecord) => {
            captured.contacts.push(record)
        }
    }
    return { captured, writeBehind }
}

function captureSecretStore(): {
    readonly sets: { readonly id: string }[]
    readonly store: unknown
} {
    const sets: { id: string }[] = []
    const store = {
        set: async (id: string) => {
            sets.push({ id })
        }
    }
    return { sets, store }
}

function baseEvent(
    overrides: Partial<WaIncomingMessageEvent> & {
        readonly keyOverrides?: Partial<WaIncomingMessageEvent['key']>
    }
): WaIncomingMessageEvent {
    const { keyOverrides, ...rest } = overrides
    return {
        key: {
            remoteJid: '120363000000000000@g.us',
            id: 'msg-1',
            fromMe: false,
            isGroup: true,
            isBroadcast: false,
            isNewsletter: false,
            senderDevice: 0,
            ...keyOverrides
        },
        rawNode: {
            tag: 'message',
            attrs: {}
        },
        ...rest
    }
}

test('mailbox persist writes ONE LID-canonical row when participant+participantAlt form a LID/PN pair', () => {
    const { captured, writeBehind } = captureWriteBehind()
    persistIncomingMailboxEntities({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        messageSecretStore: { set: async () => undefined } as never,
        event: baseEvent({
            keyOverrides: {
                remoteJid: '120363000000000000@g.us',
                participant: '111111111111111@lid',
                participantAlt: '5511999999999@s.whatsapp.net'
            }
        })
    })

    assert.equal(captured.contacts.length, 1)
    assert.equal(captured.contacts[0].jid, '111111111111111@lid')
    assert.equal(captured.contacts[0].phoneNumber, '5511999999999@s.whatsapp.net')
    assert.equal(captured.contacts[0].lid, undefined)
})

test('mailbox persist writes ONE canonical row for 1:1 chat with remoteJid+remoteJidAlt pair', () => {
    const { captured, writeBehind } = captureWriteBehind()
    persistIncomingMailboxEntities({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        messageSecretStore: { set: async () => undefined } as never,
        event: baseEvent({
            keyOverrides: {
                remoteJid: '5511999999999@s.whatsapp.net',
                remoteJidAlt: '111111111111111@lid',
                isGroup: false
            }
        })
    })

    assert.equal(captured.contacts.length, 1)
    assert.equal(captured.contacts[0].jid, '111111111111111@lid')
    assert.equal(captured.contacts[0].phoneNumber, '5511999999999@s.whatsapp.net')
})

test('mailbox persist falls back to bare jid when no LID/PN pair available', () => {
    const { captured, writeBehind } = captureWriteBehind()
    persistIncomingMailboxEntities({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        messageSecretStore: { set: async () => undefined } as never,
        event: baseEvent({
            keyOverrides: {
                participant: '111111111111111@lid',
                // both LIDs - no pairing possible
                participantAlt: '222222222222222@lid'
            }
        })
    })
    assert.equal(captured.contacts.length, 1)
    assert.equal(captured.contacts[0].jid, '111111111111111@lid')
    assert.equal(captured.contacts[0].phoneNumber, undefined)
    assert.equal(captured.contacts[0].lid, undefined)
})

test('mailbox persist does NOT treat remoteJid pair as user pair for groups', () => {
    const { captured, writeBehind } = captureWriteBehind()
    persistIncomingMailboxEntities({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        messageSecretStore: { set: async () => undefined } as never,
        event: baseEvent({
            keyOverrides: {
                remoteJid: '120363000000000000@g.us',
                remoteJidAlt: '120363999999999999@lid',
                participant: '111111111111111@lid',
                participantAlt: '5511999999999@s.whatsapp.net',
                isGroup: true
            }
        })
    })
    // Only the participant pair should produce a cross-ref row;
    // remoteJid is a group jid and is not a contact at all.
    const crossRefRows = captured.contacts.filter((c) => c.phoneNumber || c.lid)
    assert.equal(crossRefRows.length, 1)
    assert.equal(crossRefRows[0].jid, '111111111111111@lid')
})

const PLAIN_SECRET = new Uint8Array(32).fill(7)

function plainSecretEvent(): WaIncomingMessageEvent {
    return baseEvent({
        keyOverrides: {
            id: 'plain-1',
            remoteJid: '5511999999999@s.whatsapp.net',
            isGroup: false
        },
        message: { conversation: 'oi', messageContextInfo: { messageSecret: PLAIN_SECRET } }
    })
}

test('mailbox persist skips a plain-message secret by default (only poll/event/bot persist)', () => {
    const { writeBehind } = captureWriteBehind()
    const { sets, store } = captureSecretStore()
    persistIncomingMailboxEntities({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        messageSecretStore: store as never,
        event: plainSecretEvent()
    })
    assert.equal(sets.length, 0)
})

test('mailbox persist stores a plain-message secret when persistAllSecrets is set', () => {
    const { writeBehind } = captureWriteBehind()
    const { sets, store } = captureSecretStore()
    persistIncomingMailboxEntities({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        messageSecretStore: store as never,
        persistAllSecrets: true,
        event: plainSecretEvent()
    })
    assert.equal(sets.length, 1)
    assert.equal(sets[0].id, 'plain-1')
})
