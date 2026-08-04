import assert from 'node:assert/strict'
import test from 'node:test'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'

import {
    processHistorySyncNotification,
    scanConversationJidPair,
    scanHistorySyncBlob
} from '@client/persistence/history-sync'
import { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import { createNoopLogger } from '@infra/log/types'
import { proto, type Proto } from '@proto'
import type { WaStoredThreadRecord } from '@store/contracts/thread.store'
import { toBytesView } from '@util/bytes'

const gzipAsync = promisify(gzip)

function createThreadCapture(): {
    readonly writes: WaStoredThreadRecord[]
    readonly writeBehind: WriteBehindPersistence
} {
    const writes: WaStoredThreadRecord[] = []
    const writeBehind = new WriteBehindPersistence(
        {
            messageStore: {
                upsert: async () => undefined,
                upsertBatch: async () => undefined
            } as never,
            threadStore: {
                upsert: async (record: WaStoredThreadRecord) => {
                    writes.push(record)
                },
                upsertBatch: async (records: readonly WaStoredThreadRecord[]) => {
                    writes.push(...records)
                }
            } as never,
            contactStore: {
                upsert: async () => undefined,
                upsertBatch: async () => undefined
            } as never
        },
        createNoopLogger()
    )
    return { writes, writeBehind }
}

async function buildInlineNotification(
    conversation: proto.IConversation
): Promise<proto.Message.IHistorySyncNotification> {
    const payload = proto.HistorySync.encode({
        syncType: proto.HistorySync.HistorySyncType.RECENT,
        conversations: [conversation]
    }).finish()
    return {
        syncType: proto.Message.HistorySyncType.RECENT,
        initialHistBootstrapInlinePayload: toBytesView(await gzipAsync(payload))
    }
}

test('history sync converts Conversation.ephemeralSettingTimestamp from ms to seconds', async () => {
    const { writes, writeBehind } = createThreadCapture()
    const notification = await buildInlineNotification({
        id: '5511999999999@s.whatsapp.net',
        ephemeralExpiration: 86_400,
        ephemeralSettingTimestamp: 1_751_808_692_000
    })

    await processHistorySyncNotification(
        {
            logger: createNoopLogger(),
            mediaTransfer: {} as never,
            writeBehind,
            emitEvent: () => undefined
        } as never,
        notification
    )
    await writeBehind.flush()

    const thread = writes.find((record) => record.jid === '5511999999999@s.whatsapp.net')
    assert.ok(thread, 'conversation should be persisted as a thread row')
    assert.equal(thread.ephemeralExpiration, 86_400)
    assert.equal(thread.ephemeralSettingTimestamp, 1_751_808_692)
})

test('history sync keeps an already-seconds Conversation timestamp untouched', async () => {
    const { writes, writeBehind } = createThreadCapture()
    const notification = await buildInlineNotification({
        id: '5511777777777@s.whatsapp.net',
        ephemeralExpiration: 86_400,
        ephemeralSettingTimestamp: 1_751_808_692
    })

    await processHistorySyncNotification(
        {
            logger: createNoopLogger(),
            mediaTransfer: {} as never,
            writeBehind,
            emitEvent: () => undefined
        } as never,
        notification
    )
    await writeBehind.flush()

    const thread = writes.find((record) => record.jid === '5511777777777@s.whatsapp.net')
    assert.ok(thread)
    assert.equal(thread.ephemeralSettingTimestamp, 1_751_808_692)
})

test('history sync leaves ephemeralSettingTimestamp absent for a non-ephemeral chat', async () => {
    const { writes, writeBehind } = createThreadCapture()
    const notification = await buildInlineNotification({
        id: '5511888888888@s.whatsapp.net'
    })

    await processHistorySyncNotification(
        {
            logger: createNoopLogger(),
            mediaTransfer: {} as never,
            writeBehind,
            emitEvent: () => undefined
        } as never,
        notification
    )
    await writeBehind.flush()

    const thread = writes.find((record) => record.jid === '5511888888888@s.whatsapp.net')
    assert.ok(thread)
    assert.equal(thread.ephemeralSettingTimestamp, undefined)
})

test('scanHistorySyncBlob is equivalent to the monolithic HistorySync decode', () => {
    const historySync: Proto.IHistorySync = {
        syncType: proto.HistorySync.HistorySyncType.RECENT,
        chunkOrder: 4,
        progress: 88,
        threadIdUserSecret: new Uint8Array([1, 2, 3]),
        nctSalt: new Uint8Array([9, 8, 7, 6]),
        pushnames: [
            { id: '5511111111111@s.whatsapp.net', pushname: 'Alice' },
            { id: '5522222222222@s.whatsapp.net', pushname: 'Bob' }
        ],
        phoneNumberToLidMappings: [{ pnJid: '5511111111111@s.whatsapp.net', lidJid: '111@lid' }],
        inlineContacts: [
            { pnJid: '5522222222222@s.whatsapp.net', lidJid: '222@lid', fullName: 'Bob Silva' }
        ],
        statusV3Messages: [
            { key: { remoteJid: 'status@broadcast', id: 'S1' }, message: { conversation: 'st' } }
        ],
        pastParticipants: [{ groupJid: '123@g.us' }],
        conversations: [
            {
                id: '5511111111111@s.whatsapp.net',
                pnJid: '5511111111111@s.whatsapp.net',
                lidJid: '111@lid',
                tcToken: new Uint8Array([5, 5, 5]),
                messages: [
                    {
                        message: {
                            key: { remoteJid: '5511111111111@s.whatsapp.net', id: 'M1' },
                            message: { conversation: 'oi' },
                            messageTimestamp: 1_722_000_000
                        }
                    }
                ]
            },
            {
                id: '5533333333333@s.whatsapp.net',
                pnJid: '5533333333333@s.whatsapp.net',
                accountLid: '333@lid',
                messages: []
            },
            { id: '123@g.us', messages: [] }
        ]
    }
    const clean = proto.HistorySync.encode(historySync).finish()
    const unknownVarint = new Uint8Array([0xf8, 0x1f, 0x2a])
    const unknownLen = new Uint8Array([0xfa, 0x1f, 0x02, 0xde, 0xad])
    const blob = new Uint8Array(clean.length + unknownVarint.length + unknownLen.length)
    blob.set(unknownVarint, 0)
    blob.set(clean, unknownVarint.length)
    blob.set(unknownLen, unknownVarint.length + clean.length)

    const reference = proto.HistorySync.decode(blob)
    const scan = scanHistorySyncBlob(blob)

    assert.equal(scan.conversationRanges.length, reference.conversations.length)
    for (let i = 0; i < scan.conversationRanges.length; i += 1) {
        const range = scan.conversationRanges[i]
        const incremental = proto.Conversation.decode(blob.subarray(range.start, range.end))
        assert.deepEqual(
            Array.from(proto.Conversation.encode(incremental).finish()),
            Array.from(proto.Conversation.encode(reference.conversations[i]).finish()),
            `conversation ${i}`
        )
        const pair = scanConversationJidPair(blob, range)
        assert.equal(pair.pnJid, reference.conversations[i].pnJid ?? null)
        assert.equal(
            pair.lidJid,
            reference.conversations[i].lidJid ?? reference.conversations[i].accountLid ?? null
        )
    }

    assert.equal(scan.pushnames.length, reference.pushnames.length)
    for (let i = 0; i < scan.pushnames.length; i += 1) {
        assert.equal(scan.pushnames[i].id, reference.pushnames[i].id)
        assert.equal(scan.pushnames[i].pushname, reference.pushnames[i].pushname)
    }
    assert.equal(scan.inlineContacts.length, reference.inlineContacts.length)
    assert.equal(scan.phoneNumberToLidMappings.length, reference.phoneNumberToLidMappings.length)
    assert.equal(scan.chunkOrder, reference.chunkOrder ?? null)
    assert.equal(scan.progress, reference.progress ?? null)
    assert.deepEqual(Array.from(scan.nctSalt ?? []), Array.from(reference.nctSalt ?? []))
})
