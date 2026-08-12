import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'

import {
    CONVERSATION_FIELDS,
    HISTORY_SYNC_FIELDS,
    processHistorySyncNotification
} from '@client/persistence/history-sync'
import { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import { createNoopLogger } from '@infra/log/types'
import { proto, type Proto } from '@proto'
import type { WaStoredContactRecord } from '@store/contracts/contact.store'
import type { WaStoredMessageRecord } from '@store/contracts/message.store'
import type { WaStoredThreadRecord } from '@store/contracts/thread.store'
import { toBytesView } from '@util/bytes'
import { readProtoVarint } from '@util/protoscan'

const gzipAsync = promisify(gzip)

/**
 * Reads a field number back out of the generated encoder: encode a message
 * carrying only that field, then decode the leading tag. Keeps the hardcoded
 * numbers pinned to the code that actually serializes the wire, with no
 * reflection metadata to depend on.
 */
function encodedFieldNumber(
    type: { encode: (value: never) => { finish: () => Uint8Array } },
    value: unknown
): number {
    const bytes = type.encode(value as never).finish()
    assert.ok(bytes.length > 0, 'the probe field must actually be encoded')
    return Math.floor(readProtoVarint(bytes, 0, bytes.length).value / 8)
}

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

interface TokenConversation {
    readonly jid: string
    readonly tcToken?: Uint8Array | null
    readonly tcTokenTimestamp?: number | null
}

interface Capture {
    readonly order: string[]
    readonly messages: WaStoredMessageRecord[]
    readonly threads: WaStoredThreadRecord[]
    readonly contacts: WaStoredContactRecord[]
    readonly events: unknown[]
    readonly acked: number[]
    readonly salts: Uint8Array[]
    readonly tokens: TokenConversation[]
}

function createCapture(): { readonly capture: Capture; readonly deps: unknown } {
    const capture: Capture = {
        order: [],
        messages: [],
        threads: [],
        contacts: [],
        events: [],
        acked: [],
        salts: [],
        tokens: []
    }
    const deps = {
        logger: createNoopLogger(),
        mediaTransfer: {} as never,
        writeBehind: {
            persistMessageAsync: async (record: WaStoredMessageRecord) => {
                capture.order.push(`msg:${record.id}`)
                capture.messages.push(record)
            },
            persistThreadAsync: async (record: WaStoredThreadRecord) => {
                capture.order.push(`thread:${record.jid}`)
                capture.threads.push(record)
            },
            persistContactAsync: async (record: WaStoredContactRecord) => {
                capture.contacts.push(record)
            }
        } as never,
        emitEvent: (_type: string, payload: unknown) => {
            capture.events.push(payload)
        },
        onNctSalt: async (salt: Uint8Array) => {
            capture.salts.push(salt)
        },
        onPrivacyTokens: async (conversations: readonly TokenConversation[]) => {
            capture.tokens.push(...conversations)
        },
        onProcessed: async (syncType: number) => {
            capture.acked.push(syncType)
        }
    }
    return { capture, deps }
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

test('streaming history sync is equivalent to the monolithic HistorySync decode', async () => {
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
        phoneNumberToLidMappings: [
            { pnJid: '5511111111111@s.whatsapp.net', lidJid: '111@lid' },
            { pnJid: '5544444444444@s.whatsapp.net', lidJid: '444@lid' }
        ],
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
                name: 'Alice',
                unreadCount: 3,
                messages: [
                    {
                        message: {
                            key: { remoteJid: '5511111111111@s.whatsapp.net', id: 'M1' },
                            message: { conversation: 'oi' },
                            messageTimestamp: 1_722_000_000
                        }
                    },
                    {
                        message: {
                            key: { remoteJid: '5511111111111@s.whatsapp.net', id: 'M2' },
                            messageStubType: proto.WebMessageInfo.StubType.GROUP_PARTICIPANT_ADD
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
    const { capture, deps } = createCapture()
    await processHistorySyncNotification(deps as never, {
        syncType: proto.Message.HistorySyncType.RECENT,
        initialHistBootstrapInlinePayload: toBytesView(await gzipAsync(blob))
    })

    const emitted = capture.events[0] as Record<string, number>
    assert.equal(emitted.conversationsCount, reference.conversations.length)
    assert.equal(emitted.pushnamesCount, reference.pushnames.length)
    assert.equal(emitted.inlineContactsCount, reference.inlineContacts.length)
    assert.equal(emitted.chunkOrder, reference.chunkOrder)
    assert.equal(emitted.progress, reference.progress)

    assert.deepEqual(
        capture.threads.map((record) => record.jid),
        reference.conversations.map((conversation) => conversation.id)
    )
    const alice = capture.threads[0]
    assert.equal(alice.name, 'Alice')
    assert.equal(alice.unreadCount, 3)

    assert.deepEqual(
        capture.messages.map((record) => record.id),
        ['M1']
    )
    assert.equal(capture.messages[0].threadJid, '5511111111111@s.whatsapp.net')
    assert.equal(capture.messages[0].timestampMs, 1_722_000_000_000)
    const messageBytes = capture.messages[0].messageBytes
    assert.ok(messageBytes, 'message payload must be persisted')
    assert.deepEqual(
        Array.from(messageBytes),
        Array.from(proto.Message.encode({ conversation: 'oi' }).finish())
    )

    const bob = capture.contacts.find((record) => record.pushName === 'Bob')
    assert.ok(bob, 'Bob pushname must be persisted')
    assert.equal(bob.jid, '222@lid', 'pushname must land on the canonical LID row')
    const aliceContact = capture.contacts.find((record) => record.pushName === 'Alice')
    assert.ok(aliceContact)
    assert.equal(aliceContact.jid, '111@lid')

    assert.deepEqual(
        capture.salts.map((salt) => Array.from(salt)),
        [Array.from(reference.nctSalt as Uint8Array)],
        'the chunk nctSalt must be handed over'
    )
    assert.deepEqual(
        capture.tokens.map((token) => [token.jid, Array.from(token.tcToken ?? [])]),
        [
            [
                '5511111111111@s.whatsapp.net',
                Array.from(reference.conversations[0].tcToken as Uint8Array)
            ]
        ],
        'privacy tokens must be collected from the conversations that carry them'
    )

    const standalone = capture.contacts.find((record) => record.jid === '444@lid')
    assert.ok(standalone, 'a mapping with no conversation or inline contact must still land')
    assert.equal(standalone.phoneNumber, '5544444444444@s.whatsapp.net')

    const firstMessage = capture.order.indexOf('msg:M1')
    const ownerThread = capture.order.indexOf('thread:5511111111111@s.whatsapp.net')
    assert.ok(firstMessage >= 0 && ownerThread >= 0)
    assert.ok(
        firstMessage < ownerThread,
        'messages must be written as they stream, before their conversation closes'
    )

    assert.deepEqual(capture.acked, [proto.Message.HistorySyncType.RECENT])
})

test('streaming history sync tolerates a Conversation whose id follows its messages', async () => {
    const messageField = proto.Conversation.encode({
        messages: [
            {
                message: {
                    key: { remoteJid: '5511444444444@s.whatsapp.net', id: 'REVERSED' },
                    message: { conversation: 'fora de ordem' },
                    messageTimestamp: 1_722_000_001
                }
            }
        ]
    }).finish()
    const idField = proto.Conversation.encode({ id: '5511444444444@s.whatsapp.net' }).finish()
    const conversation = new Uint8Array(messageField.length + idField.length)
    conversation.set(messageField, 0)
    conversation.set(idField, messageField.length)

    assert.ok(conversation.length < 128, 'fixture must fit single-byte length framing')
    const blob = new Uint8Array(2 + conversation.length)
    blob.set([0x12, conversation.length], 0)
    blob.set(conversation, 2)

    const { capture, deps } = createCapture()
    await processHistorySyncNotification(deps as never, {
        syncType: proto.Message.HistorySyncType.RECENT,
        initialHistBootstrapInlinePayload: toBytesView(await gzipAsync(blob))
    })

    assert.deepEqual(
        capture.messages.map((record) => [record.id, record.threadJid]),
        [['REVERSED', '5511444444444@s.whatsapp.net']]
    )
})

test('streaming history sync rejects a chunk whose MAC fails, without acking it', async () => {
    const payload = proto.HistorySync.encode({
        syncType: proto.HistorySync.HistorySyncType.RECENT,
        conversations: [{ id: '5511555555555@s.whatsapp.net', messages: [] }]
    }).finish()
    const gzipped = toBytesView(await gzipAsync(payload))

    const { capture, deps } = createCapture()
    const withTransfer = {
        ...(deps as Record<string, unknown>),
        mediaTransfer: {
            downloadAndDecryptStream: async () => ({
                plaintext: Readable.from([Buffer.from(gzipped)]),
                metadata: Promise.reject(new Error('media MAC mismatch'))
            })
        }
    }

    await assert.rejects(
        () =>
            processHistorySyncNotification(withTransfer as never, {
                syncType: proto.Message.HistorySyncType.RECENT,
                directPath: '/history',
                mediaKey: new Uint8Array(32),
                fileSha256: new Uint8Array(32),
                fileEncSha256: new Uint8Array(32)
            }),
        /media MAC mismatch/
    )
    assert.deepEqual(capture.acked, [], 'a chunk that failed verification must stay unacked')
    assert.deepEqual(capture.events, [], 'no chunk event may be emitted for unverified data')
})

test('history sync abort on a corrupt conversation settles pending writes', async () => {
    const validConversation = proto.Conversation.encode({
        id: '5511111111111@s.whatsapp.net',
        messages: [
            {
                message: {
                    key: { remoteJid: '5511111111111@s.whatsapp.net', id: 'M1' },
                    message: { conversation: 'oi' },
                    messageTimestamp: 1_722_000_000
                }
            }
        ]
    }).finish()
    assert.ok(
        validConversation.length < 128,
        'fixture must stay below 128 bytes for the single-byte length framing below'
    )
    const corruptRecord = new Uint8Array([0x12, 0x01, 0x0d])
    const blob = new Uint8Array(2 + 2 + validConversation.length + 2 + corruptRecord.length)
    blob.set([0x08, 0x02], 0)
    blob.set([0x12, validConversation.length], 2)
    blob.set(validConversation, 4)
    blob.set([0x12, corruptRecord.length], 4 + validConversation.length)
    blob.set(corruptRecord, 6 + validConversation.length)
    const gzipped = toBytesView(await promisify(gzip)(blob))

    let rejectedWriteSettled = false
    const threadJids: string[] = []
    const deps = {
        logger: createNoopLogger(),
        mediaTransfer: null as never,
        writeBehind: {
            persistContactAsync: async () => undefined,
            persistThreadAsync: (input: { readonly jid: string }) => {
                threadJids.push(input.jid)
                return Promise.reject(new Error('write failed')).catch((error: unknown) => {
                    rejectedWriteSettled = true
                    throw error
                })
            },
            persistMessageAsync: async () => undefined
        } as never,
        emitEvent: () => {
            throw new Error('event must not be emitted on abort')
        },
        onProcessed: async () => {
            throw new Error('chunk must not be acked on abort')
        }
    }

    await assert.rejects(
        () =>
            processHistorySyncNotification(deps as never, {
                syncType: proto.Message.HistorySyncType.RECENT,
                initialHistBootstrapInlinePayload: gzipped
            }),
        /invalid|index out of range|protobuf/i
    )
    assert.equal(rejectedWriteSettled, true, 'pending write rejection must be consumed')
    assert.deepEqual(
        threadJids,
        ['5511111111111@s.whatsapp.net'],
        'the conversation before the corrupt record must have been written'
    )
})

test('history sync field numbers match the generated encoder', () => {
    assert.deepEqual(
        {
            CONVERSATIONS: encodedFieldNumber(proto.HistorySync, { conversations: [{ id: 'x' }] }),
            CHUNK_ORDER: encodedFieldNumber(proto.HistorySync, { chunkOrder: 1 }),
            PROGRESS: encodedFieldNumber(proto.HistorySync, { progress: 1 }),
            PUSHNAMES: encodedFieldNumber(proto.HistorySync, { pushnames: [{ id: 'x' }] }),
            PHONE_NUMBER_TO_LID_MAPPINGS: encodedFieldNumber(proto.HistorySync, {
                phoneNumberToLidMappings: [{ pnJid: 'x' }]
            }),
            NCT_SALT: encodedFieldNumber(proto.HistorySync, { nctSalt: new Uint8Array([1]) }),
            INLINE_CONTACTS: encodedFieldNumber(proto.HistorySync, {
                inlineContacts: [{ pnJid: 'x' }]
            })
        },
        { ...HISTORY_SYNC_FIELDS }
    )

    assert.deepEqual(
        {
            ID: encodedFieldNumber(proto.Conversation, { id: 'x' }),
            MESSAGES: encodedFieldNumber(proto.Conversation, { messages: [{}] })
        },
        { ...CONVERSATION_FIELDS }
    )
})
