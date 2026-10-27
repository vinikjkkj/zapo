import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'

import { openHistoryBlobStream } from '@client/persistence/history-blob'
import {
    CONVERSATION_FIELDS,
    HISTORY_SYNC_FIELDS,
    processHistorySyncNotification
} from '@client/persistence/history-sync'
import { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import type {
    WaHistorySyncChunkEvent,
    WaHistorySyncChunkRef,
    WaHistorySyncItem,
    WaHistorySyncSink
} from '@client/types'
import { createNoopLogger } from '@infra/log/types'
import { proto, type Proto } from '@proto'
import type { WaStoredContactRecord } from '@store/contracts/contact.store'
import type { WaStoredMessageRecord } from '@store/contracts/message.store'
import type { WaStoredThreadRecord } from '@store/contracts/thread.store'
import { delay } from '@util/async'
import { toBytesView } from '@util/bytes'
import { longToNumber } from '@util/primitives'
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

function createCapture(meJid?: string): { readonly capture: Capture; readonly deps: unknown } {
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
        },
        meJid
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
    const emitted = capture.events[0] as Record<string, number>
    assert.equal(
        emitted.messagesCount,
        capture.messages.length,
        'a parked message must be counted exactly once, when it is written'
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

test('destroying the inflated stream tears down the decryption source', async () => {
    const plaintext = new Readable({ read: () => undefined })
    const blob = await openHistoryBlobStream(
        {
            downloadAndDecryptStream: async () => ({
                plaintext,
                metadata: Promise.resolve(null)
            })
        } as never,
        {
            directPath: '/history',
            mediaKey: new Uint8Array(32),
            fileSha256: new Uint8Array(32),
            fileEncSha256: new Uint8Array(32)
        },
        'history',
        'history sync'
    )

    assert.equal(plaintext.destroyed, false)
    blob.inflated.destroy(new Error('consumer gave up'))
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(plaintext.destroyed, true, 'the source must not keep draining after an abort')
})

test('history sync bounds the messages parked before their thread jid', async () => {
    const encodeVarint = (value: number): number[] => {
        const out: number[] = []
        let rest = value
        while (rest > 0x7f) {
            out.push((rest & 0x7f) | 0x80)
            rest = Math.floor(rest / 128)
        }
        out.push(rest)
        return out
    }

    const messages: Proto.IHistorySyncMsg[] = []
    for (let index = 0; index < 1_200; index += 1) {
        messages.push({
            message: {
                key: { remoteJid: '5511444444444@s.whatsapp.net', id: `P${index}` },
                message: { conversation: 'parked' },
                messageTimestamp: 1_722_000_000 + index
            }
        })
    }
    const messagesPart = proto.Conversation.encode({ messages }).finish()
    const idPart = proto.Conversation.encode({ id: '5511444444444@s.whatsapp.net' }).finish()
    const conversation = new Uint8Array(messagesPart.length + idPart.length)
    conversation.set(messagesPart, 0)
    conversation.set(idPart, messagesPart.length)
    const blob = new Uint8Array([0x12, ...encodeVarint(conversation.length), ...conversation])

    const payload = toBytesView(await gzipAsync(blob))
    const { capture, deps } = createCapture()
    await assert.rejects(
        () =>
            processHistorySyncNotification(deps as never, {
                syncType: proto.Message.HistorySyncType.RECENT,
                initialHistBootstrapInlinePayload: payload
            }),
        /parked 1024 messages with no thread jid/
    )

    assert.deepEqual(capture.acked, [], 'an aborted chunk must stay unacked so it is resent')
    assert.deepEqual(capture.events, [], 'no chunk event may report a partial apply')
})

test('history sync counts only the messages it persisted', async () => {
    const { capture, deps } = createCapture()
    await processHistorySyncNotification(deps as never, {
        syncType: proto.Message.HistorySyncType.RECENT,
        initialHistBootstrapInlinePayload: toBytesView(
            await gzipAsync(
                proto.HistorySync.encode({
                    conversations: [
                        {
                            id: '5511222222222@s.whatsapp.net',
                            messages: [
                                {
                                    message: {
                                        key: {
                                            remoteJid: '5511222222222@s.whatsapp.net',
                                            id: 'KEPT'
                                        },
                                        message: { conversation: 'kept' },
                                        messageTimestamp: 1_722_000_000
                                    }
                                },
                                {
                                    message: {
                                        key: {
                                            remoteJid: '5511222222222@s.whatsapp.net',
                                            id: 'STUB'
                                        },
                                        messageStubType:
                                            proto.WebMessageInfo.StubType.GROUP_PARTICIPANT_ADD
                                    }
                                }
                            ]
                        }
                    ]
                }).finish()
            )
        )
    })

    const emitted = capture.events[0] as Record<string, number>
    assert.equal(capture.messages.length, 1)
    assert.equal(
        emitted.messagesCount,
        capture.messages.length,
        'the reported count must match what was written'
    )
})

async function runConversation(
    conversation: proto.IConversation,
    meJid?: string
): Promise<Capture> {
    const { capture, deps } = createCapture(meJid)
    await processHistorySyncNotification(deps as never, {
        syncType: proto.Message.HistorySyncType.RECENT,
        initialHistBootstrapInlinePayload: toBytesView(
            await gzipAsync(proto.HistorySync.encode({ conversations: [conversation] }).finish())
        )
    })
    return capture
}

test('history sync reads a group sender from the top-level WebMessageInfo participant', async () => {
    const capture = await runConversation({
        id: '120363000000000000@g.us',
        messages: [
            {
                message: {
                    key: { remoteJid: '120363000000000000@g.us', id: 'G1' },
                    participant: '5511111111111@s.whatsapp.net',
                    message: { conversation: 'Good copy' },
                    messageTimestamp: 1_722_000_000
                }
            }
        ]
    })

    assert.equal(capture.messages.length, 1)
    assert.equal(capture.messages[0].senderJid, '5511111111111@s.whatsapp.net')
    assert.equal(capture.messages[0].participantJid, '5511111111111@s.whatsapp.net')
})

test('history sync prefers the top-level participant over key.participant', async () => {
    const capture = await runConversation({
        id: '120363000000000000@g.us',
        messages: [
            {
                message: {
                    key: {
                        remoteJid: '120363000000000000@g.us',
                        id: 'G2',
                        participant: '5522222222222@s.whatsapp.net'
                    },
                    participant: '222@lid',
                    message: { conversation: 'oi' },
                    messageTimestamp: 1_722_000_000
                }
            }
        ]
    })

    assert.equal(capture.messages[0].senderJid, '222@lid')
    assert.equal(capture.messages[0].participantJid, '222@lid')
})

test('history sync still reads a group sender carried only on key.participant', async () => {
    const capture = await runConversation({
        id: '120363000000000000@g.us',
        messages: [
            {
                message: {
                    key: {
                        remoteJid: '120363000000000000@g.us',
                        id: 'G3',
                        participant: '5533333333333@s.whatsapp.net'
                    },
                    message: { conversation: 'oi' },
                    messageTimestamp: 1_722_000_000
                }
            }
        ]
    })

    assert.equal(capture.messages[0].senderJid, '5533333333333@s.whatsapp.net')
    assert.equal(capture.messages[0].participantJid, '5533333333333@s.whatsapp.net')
})

test('history sync attributes a self-sent group message with no participant to this account', async () => {
    const capture = await runConversation(
        {
            id: '120363000000000000@g.us',
            messages: [
                {
                    message: {
                        key: { remoteJid: '120363000000000000@g.us', id: 'G4', fromMe: true },
                        message: { conversation: 'mine' },
                        messageTimestamp: 1_722_000_000
                    }
                }
            ]
        },
        '5599999999999:7@s.whatsapp.net'
    )

    assert.equal(capture.messages[0].senderJid, '5599999999999@s.whatsapp.net')
    assert.equal(capture.messages[0].participantJid, '5599999999999@s.whatsapp.net')
})

test('history sync prefers originalSelfAuthorUserJidString over the current account jid', async () => {
    const capture = await runConversation(
        {
            id: '120363000000000000@g.us',
            messages: [
                {
                    message: {
                        key: { remoteJid: '120363000000000000@g.us', id: 'G5', fromMe: true },
                        originalSelfAuthorUserJidString: '5588888888888@s.whatsapp.net',
                        message: { conversation: 'mine' },
                        messageTimestamp: 1_722_000_000
                    }
                }
            ]
        },
        '5599999999999@s.whatsapp.net'
    )

    assert.equal(capture.messages[0].senderJid, '5588888888888@s.whatsapp.net')
})

test('history sync falls back to the thread jid for a 1:1 sender and leaves participantJid unset', async () => {
    const capture = await runConversation({
        id: '5511444444444@s.whatsapp.net',
        messages: [
            {
                message: {
                    key: { remoteJid: '5511444444444@s.whatsapp.net', id: 'D1' },
                    message: { conversation: 'oi' },
                    messageTimestamp: 1_722_000_000
                }
            }
        ]
    })

    assert.equal(capture.messages[0].senderJid, '5511444444444@s.whatsapp.net')
    assert.equal(capture.messages[0].participantJid, undefined)
})

test('history sync keeps the sender on messages parked before their thread jid', async () => {
    const messagesPart = proto.Conversation.encode({
        messages: [
            {
                message: {
                    key: { remoteJid: '120363000000000000@g.us', id: 'P1' },
                    participant: '5511111111111@s.whatsapp.net',
                    message: { conversation: 'parked' },
                    messageTimestamp: 1_722_000_000
                }
            }
        ]
    }).finish()
    const idPart = proto.Conversation.encode({ id: '120363000000000000@g.us' }).finish()
    const conversation = new Uint8Array(messagesPart.length + idPart.length)
    conversation.set(messagesPart, 0)
    conversation.set(idPart, messagesPart.length)
    const blob = new Uint8Array([0x12, conversation.length & 0x7f, ...conversation])
    assert.ok(conversation.length < 128, 'the probe conversation must fit a one-byte length')

    const { capture, deps } = createCapture()
    await processHistorySyncNotification(deps as never, {
        syncType: proto.Message.HistorySyncType.RECENT,
        initialHistBootstrapInlinePayload: toBytesView(await gzipAsync(blob))
    })

    assert.equal(capture.messages.length, 1)
    assert.equal(capture.messages[0].threadJid, '120363000000000000@g.us')
    assert.equal(capture.messages[0].senderJid, '5511111111111@s.whatsapp.net')
    assert.equal(capture.messages[0].participantJid, '5511111111111@s.whatsapp.net')
})

test('history sync resolves a parked self-sent group message once the thread jid lands', async () => {
    const messagesPart = proto.Conversation.encode({
        messages: [
            {
                message: {
                    key: { id: 'PSELF', fromMe: true },
                    message: { conversation: 'parked and mine' },
                    messageTimestamp: 1_722_000_000
                }
            }
        ]
    }).finish()
    const idPart = proto.Conversation.encode({ id: '120363000000000000@g.us' }).finish()
    const conversation = new Uint8Array(messagesPart.length + idPart.length)
    conversation.set(messagesPart, 0)
    conversation.set(idPart, messagesPart.length)
    assert.ok(conversation.length < 128, 'the probe conversation must fit a one-byte length')
    const blob = new Uint8Array([0x12, conversation.length, ...conversation])

    const { capture, deps } = createCapture('5599999999999:7@s.whatsapp.net')
    await processHistorySyncNotification(deps as never, {
        syncType: proto.Message.HistorySyncType.RECENT,
        initialHistBootstrapInlinePayload: toBytesView(await gzipAsync(blob))
    })

    assert.equal(capture.messages.length, 1)
    assert.equal(capture.messages[0].senderJid, '5599999999999@s.whatsapp.net')
    assert.equal(capture.messages[0].participantJid, '5599999999999@s.whatsapp.net')
})

test('history sync leaves an unresolved group author empty instead of naming the group', async () => {
    const capture = await runConversation({
        id: '120363000000000000@g.us',
        messages: [
            {
                message: {
                    key: { remoteJid: '120363000000000000@g.us', id: 'GHOST' },
                    message: { conversation: 'no author anywhere' },
                    messageTimestamp: 1_722_000_000
                }
            }
        ]
    })

    assert.equal(capture.messages.length, 1)
    assert.equal(capture.messages[0].senderJid, undefined)
    assert.equal(capture.messages[0].participantJid, undefined)
})

const SINK_CARRIER_ID = '3EB0CARRIER0001'

interface SinkHooks {
    readonly item?: (item: WaHistorySyncItem, index: number) => void | Promise<void>
    readonly commit?: (event: WaHistorySyncChunkEvent) => void | Promise<void>
    readonly abort?: (chunk: WaHistorySyncChunkRef, error: Error) => void | Promise<void>
}

interface SinkRun {
    readonly capture: Capture
    readonly timeline: string[]
    readonly items: WaHistorySyncItem[]
    readonly chunks: WaHistorySyncChunkRef[]
    readonly commits: WaHistorySyncChunkEvent[]
    readonly aborts: { readonly chunk: WaHistorySyncChunkRef; readonly error: Error }[]
    readonly deps: Record<string, unknown>
}

function createSinkRun(hooks: SinkHooks = {}): SinkRun {
    const { capture, deps } = createCapture()
    const timeline: string[] = []
    const items: WaHistorySyncItem[] = []
    const chunks: WaHistorySyncChunkRef[] = []
    const commits: WaHistorySyncChunkEvent[] = []
    const aborts: { chunk: WaHistorySyncChunkRef; error: Error }[] = []
    const sink: WaHistorySyncSink = {
        item: (item, chunk) => {
            timeline.push(`item:${item.kind}`)
            items.push(item)
            chunks.push(chunk)
            return hooks.item?.(item, items.length - 1)
        },
        commit: (event) => {
            timeline.push('commit')
            commits.push(event)
            return hooks.commit?.(event)
        },
        abort: (chunk, error) => {
            timeline.push('abort')
            aborts.push({ chunk, error })
            return hooks.abort?.(chunk, error)
        }
    }
    return {
        capture,
        timeline,
        items,
        chunks,
        commits,
        aborts,
        deps: {
            ...(deps as Record<string, unknown>),
            chunkId: SINK_CARRIER_ID,
            sink,
            emitEvent: (_type: string, payload: unknown) => {
                timeline.push('event')
                capture.events.push(payload)
            },
            onProcessed: async (syncType: number) => {
                timeline.push('ack')
                capture.acked.push(syncType)
            }
        }
    }
}

function describeItem(item: WaHistorySyncItem): string {
    switch (item.kind) {
        case 'conversations.messages':
            return `message:${item.conversationId}:${item.value.message?.key?.id}`
        case 'conversations':
            return `conversation:${item.value.id}`
        case 'pushnames':
            return `pushname:${item.value.id}`
        case 'inlineContacts':
            return `inline_contact:${item.value.pnJid}`
        case 'phoneNumberToLidMappings':
            return `pn_lid_mapping:${item.value.pnJid}`
        default:
            return item.kind
    }
}

async function inlineNotificationOf(
    payload: Uint8Array,
    syncType: Proto.Message.HistorySyncType = proto.Message.HistorySyncType.RECENT
): Promise<Proto.Message.IHistorySyncNotification> {
    return {
        syncType,
        initialHistBootstrapInlinePayload: toBytesView(await gzipAsync(payload))
    }
}

function encodeVarintBytes(value: number): number[] {
    const out: number[] = []
    let rest = value
    while (rest > 0x7f) {
        out.push((rest & 0x7f) | 0x80)
        rest = Math.floor(rest / 128)
    }
    out.push(rest)
    return out
}

function conversationRecord(conversation: Uint8Array): Uint8Array {
    return new Uint8Array([0x12, ...encodeVarintBytes(conversation.length), ...conversation])
}

function concatParts(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
    let offset = 0
    for (const part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}

async function settleMacrotasks(): Promise<void> {
    for (let index = 0; index < 5; index += 1) {
        await new Promise((resolve) => setImmediate(resolve))
    }
}

async function waitFor(
    predicate: () => boolean,
    message: string,
    timeoutMs = 5_000
): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!predicate()) {
        if (Date.now() > deadline) {
            throw new Error(message)
        }
        await delay(1)
    }
}

function createGate(): { readonly promise: Promise<void>; readonly open: () => void } {
    let open: () => void = () => undefined
    const promise = new Promise<void>((resolve) => {
        open = resolve
    })
    return { promise, open }
}

test('history sink receives stubs and fields the stores drop, followed by the conversation header', async () => {
    const chat = '5511111111111@s.whatsapp.net'
    const run = createSinkRun()
    await processHistorySyncNotification(
        run.deps as never,
        await inlineNotificationOf(
            proto.HistorySync.encode({
                conversations: [
                    {
                        id: chat,
                        name: 'Alice',
                        messages: [
                            {
                                message: {
                                    key: { remoteJid: chat, id: 'M1' },
                                    pushName: 'Alice Push',
                                    status: proto.WebMessageInfo.Status.READ,
                                    message: { conversation: 'oi' },
                                    messageTimestamp: 1_722_000_000
                                }
                            },
                            {
                                message: {
                                    key: { remoteJid: chat, id: 'STUB1' },
                                    messageStubType:
                                        proto.WebMessageInfo.StubType.GROUP_PARTICIPANT_ADD,
                                    messageTimestamp: 1_722_000_001
                                }
                            }
                        ]
                    }
                ]
            }).finish()
        )
    )

    assert.deepEqual(run.items.map(describeItem), [
        `message:${chat}:M1`,
        `message:${chat}:STUB1`,
        `conversation:${chat}`
    ])
    const [first, stub, header] = run.items
    assert.ok(
        first.kind === 'conversations.messages' &&
            stub.kind === 'conversations.messages' &&
            header.kind === 'conversations'
    )
    assert.equal(first.value.message?.pushName, 'Alice Push')
    assert.equal(first.value.message?.status, proto.WebMessageInfo.Status.READ)
    assert.equal(first.value.message?.message?.conversation, 'oi')
    assert.equal(
        stub.value.message?.messageStubType,
        proto.WebMessageInfo.StubType.GROUP_PARTICIPANT_ADD
    )
    assert.ok(!stub.value.message?.message, 'the stub carries no content')
    assert.equal(header.value.name, 'Alice')
    assert.equal(
        (header.value as Proto.IConversation).messages?.length ?? 0,
        0,
        'the header carries no messages'
    )

    assert.deepEqual(
        run.chunks,
        run.chunks.map(() => ({
            id: SINK_CARRIER_ID,
            syncType: proto.Message.HistorySyncType.RECENT
        }))
    )
    assert.equal(run.chunks.length, 3)
    assert.deepEqual(
        run.capture.messages.map((record) => record.id),
        ['M1'],
        'the stores keep dropping the stub'
    )
    assert.deepEqual(
        run.capture.threads.map((record) => record.jid),
        [chat]
    )
})

test('history sink delivers a conversation whose id follows its messages after those messages', async () => {
    const inOrderChat = '5511111111111@s.whatsapp.net'
    const reversedChat = '5511222222222@s.whatsapp.net'
    const inOrder = proto.Conversation.encode({
        id: inOrderChat,
        messages: [
            {
                message: {
                    key: { remoteJid: inOrderChat, id: 'A1' },
                    message: { conversation: 'a' }
                }
            }
        ]
    }).finish()
    const reversedMessages = proto.Conversation.encode({
        messages: [
            {
                message: {
                    key: { remoteJid: reversedChat, id: 'P1' },
                    message: { conversation: 'parked' }
                }
            },
            {
                message: {
                    key: { remoteJid: reversedChat, id: 'PSTUB' },
                    messageStubType: proto.WebMessageInfo.StubType.GROUP_PARTICIPANT_ADD
                }
            }
        ]
    }).finish()
    const reversedHeader = proto.Conversation.encode({
        id: reversedChat,
        name: 'Reversed'
    }).finish()
    const blob = concatParts(
        conversationRecord(inOrder),
        conversationRecord(concatParts(reversedMessages, reversedHeader))
    )

    const run = createSinkRun()
    await processHistorySyncNotification(run.deps as never, await inlineNotificationOf(blob))

    assert.deepEqual(run.items.map(describeItem), [
        `message:${inOrderChat}:A1`,
        `conversation:${inOrderChat}`,
        `message:${reversedChat}:P1`,
        `message:${reversedChat}:PSTUB`,
        `conversation:${reversedChat}`
    ])
    const header = run.items[4]
    assert.ok(header.kind === 'conversations')
    assert.equal(header.value.name, 'Reversed')
    assert.deepEqual(
        run.capture.messages.map((record) => record.id),
        ['A1', 'P1'],
        'the stores still drop the parked stub'
    )
})

test('history sink receives one item per pushname, inline contact and phone number mapping', async () => {
    const alice = '5511111111111@s.whatsapp.net'
    const bob = '5522222222222@s.whatsapp.net'
    const carol = '5533333333333@s.whatsapp.net'
    const run = createSinkRun()
    await processHistorySyncNotification(
        run.deps as never,
        await inlineNotificationOf(
            proto.HistorySync.encode({
                pushnames: [
                    { id: alice, pushname: 'Alice' },
                    { id: bob, pushname: 'Bob' }
                ],
                phoneNumberToLidMappings: [{ pnJid: carol, lidJid: '333@lid' }],
                inlineContacts: [{ pnJid: bob, lidJid: '222@lid', fullName: 'Bob Silva' }]
            }).finish()
        )
    )

    assert.deepEqual(run.items.map(describeItem), [
        `pushname:${alice}`,
        `pushname:${bob}`,
        `pn_lid_mapping:${carol}`,
        `inline_contact:${bob}`
    ])
    const [aliceItem, , mappingItem, contactItem] = run.items
    assert.ok(
        aliceItem.kind === 'pushnames' &&
            mappingItem.kind === 'phoneNumberToLidMappings' &&
            contactItem.kind === 'inlineContacts'
    )
    assert.equal(aliceItem.value.pushname, 'Alice')
    assert.equal(mappingItem.value.lidJid, '333@lid')
    assert.equal(contactItem.value.fullName, 'Bob Silva')
    assert.equal(contactItem.value.lidJid, '222@lid')
})

test('history sink message items keep their bytes after the stream reuses its buffer', async () => {
    const chat = '5511111111111@s.whatsapp.net'
    const count = 300
    const thumbnailBytes = 600
    const fillOf = (index: number): number => (index * 7 + 1) % 256
    const messages: Proto.IHistorySyncMsg[] = []
    for (let index = 0; index < count; index += 1) {
        messages.push({
            message: {
                key: { remoteJid: chat, id: `T${index}` },
                message: {
                    imageMessage: {
                        jpegThumbnail: new Uint8Array(thumbnailBytes).fill(fillOf(index))
                    }
                }
            }
        })
    }
    const payload = proto.HistorySync.encode({ conversations: [{ id: chat, messages }] }).finish()
    assert.ok(payload.length > 2 * 64 * 1024, 'the fixture must outgrow the reader buffer')

    const run = createSinkRun()
    await processHistorySyncNotification(run.deps as never, await inlineNotificationOf(payload))

    const retained = run.items.filter((item) => item.kind === 'conversations.messages')
    assert.equal(retained.length, count)
    retained.forEach((item, index) => {
        assert.ok(item.kind === 'conversations.messages')
        const thumbnail = item.value.message?.message?.imageMessage?.jpegThumbnail
        assert.ok(thumbnail)
        assert.equal(thumbnail.length, thumbnailBytes)
        assert.ok(
            thumbnail.every((byte) => byte === fillOf(index)),
            `thumbnail ${index} was overwritten`
        )
    })
})

test('history sink pauses the stream while an item is pending', async () => {
    const chat = '5511111111111@s.whatsapp.net'
    const gate = createGate()
    const run = createSinkRun({ item: (_item, index) => (index === 0 ? gate.promise : undefined) })
    const done = processHistorySyncNotification(
        run.deps as never,
        await inlineNotificationOf(
            proto.HistorySync.encode({
                conversations: [
                    {
                        id: chat,
                        messages: ['B1', 'B2', 'B3'].map((id) => ({
                            message: {
                                key: { remoteJid: chat, id },
                                message: { conversation: id }
                            }
                        }))
                    }
                ]
            }).finish()
        )
    )

    await waitFor(() => run.items.length > 0, 'the first item never reached the sink')
    await settleMacrotasks()
    assert.deepEqual(run.items.map(describeItem), [`message:${chat}:B1`])
    assert.deepEqual(run.commits, [])

    gate.open()
    await done
    assert.deepEqual(run.items.map(describeItem), [
        `message:${chat}:B1`,
        `message:${chat}:B2`,
        `message:${chat}:B3`,
        `conversation:${chat}`
    ])
})

test('history sink commit gets the chunk event and the receipt waits for it', async () => {
    const chat = '5511111111111@s.whatsapp.net'
    const gate = createGate()
    const run = createSinkRun({ commit: () => gate.promise })
    const done = processHistorySyncNotification(
        run.deps as never,
        await inlineNotificationOf(
            proto.HistorySync.encode({
                chunkOrder: 2,
                progress: 40,
                pushnames: [{ id: chat, pushname: 'Alice' }],
                conversations: [
                    {
                        id: chat,
                        messages: [
                            {
                                message: {
                                    key: { remoteJid: chat, id: 'C1' },
                                    message: { conversation: 'oi' }
                                }
                            }
                        ]
                    }
                ]
            }).finish()
        )
    )

    await waitFor(() => run.commits.length > 0, 'the chunk never reached commit')
    await settleMacrotasks()
    assert.equal(run.commits.length, 1)
    assert.deepEqual(run.capture.events, [], 'no chunk event before the commit resolves')
    assert.deepEqual(run.capture.acked, [], 'no receipt before the commit resolves')

    gate.open()
    await done
    assert.deepEqual(run.commits[0], {
        id: SINK_CARRIER_ID,
        syncType: proto.Message.HistorySyncType.RECENT,
        messagesCount: 1,
        conversationsCount: 1,
        pushnamesCount: 1,
        inlineContactsCount: 0,
        chunkOrder: 2,
        progress: 40
    })
    assert.deepEqual(
        run.capture.events,
        [run.commits[0]],
        'history_sync_chunk carries the same event'
    )
    assert.deepEqual(run.timeline.slice(-3), ['commit', 'event', 'ack'])
})

for (const mode of ['throws', 'rejects'] as const) {
    test(`history sink item that ${mode} aborts the chunk and tears the stream down`, async () => {
        const chat = '5511111111111@s.whatsapp.net'
        const failure = new Error(`item ${mode}`)
        const gzipped = toBytesView(
            await gzipAsync(
                proto.HistorySync.encode({
                    conversations: [
                        {
                            id: chat,
                            messages: ['F1', 'F2'].map((id) => ({
                                message: {
                                    key: { remoteJid: chat, id },
                                    message: { conversation: id }
                                }
                            }))
                        }
                    ]
                }).finish()
            )
        )
        const plaintext = new Readable({ read: () => undefined })
        plaintext.push(Buffer.from(gzipped))
        const run = createSinkRun({
            item: (_item, index) => {
                if (index !== 1) {
                    return undefined
                }
                if (mode === 'throws') {
                    throw failure
                }
                return Promise.reject(failure)
            }
        })
        const deps = {
            ...run.deps,
            mediaTransfer: {
                downloadAndDecryptStream: async () => ({
                    plaintext,
                    metadata: Promise.resolve(null)
                })
            }
        }

        await assert.rejects(
            () =>
                processHistorySyncNotification(deps as never, {
                    syncType: proto.Message.HistorySyncType.RECENT,
                    directPath: '/history',
                    mediaKey: new Uint8Array(32),
                    fileSha256: new Uint8Array(32),
                    fileEncSha256: new Uint8Array(32)
                }),
            (error) => error === failure
        )

        assert.deepEqual(run.timeline, [
            'item:conversations.messages',
            'item:conversations.messages',
            'abort'
        ])
        assert.equal(run.aborts[0].error, failure)
        assert.deepEqual(run.aborts[0].chunk, {
            id: SINK_CARRIER_ID,
            syncType: proto.Message.HistorySyncType.RECENT
        })
        assert.deepEqual(run.capture.events, [])
        assert.deepEqual(run.capture.acked, [])
        await settleMacrotasks()
        assert.equal(plaintext.destroyed, true, 'the decryption source must be torn down')
    })
}

test('history sink aborts after its items when the chunk MAC fails', async () => {
    const chat = '5511111111111@s.whatsapp.net'
    const gzipped = toBytesView(
        await gzipAsync(
            proto.HistorySync.encode({
                conversations: [
                    {
                        id: chat,
                        messages: [
                            {
                                message: {
                                    key: { remoteJid: chat, id: 'X1' },
                                    message: { conversation: 'x' }
                                }
                            }
                        ]
                    }
                ]
            }).finish()
        )
    )
    const run = createSinkRun()
    const deps = {
        ...run.deps,
        mediaTransfer: {
            downloadAndDecryptStream: async () => ({
                plaintext: Readable.from([Buffer.from(gzipped)]),
                metadata: Promise.reject(new Error('media MAC mismatch'))
            })
        }
    }

    await assert.rejects(
        () =>
            processHistorySyncNotification(deps as never, {
                syncType: proto.Message.HistorySyncType.RECENT,
                directPath: '/history',
                mediaKey: new Uint8Array(32),
                fileSha256: new Uint8Array(32),
                fileEncSha256: new Uint8Array(32)
            }),
        /media MAC mismatch/
    )

    assert.deepEqual(run.timeline, ['item:conversations.messages', 'item:conversations', 'abort'])
    assert.match(run.aborts[0].error.message, /media MAC mismatch/)
    assert.deepEqual(run.commits, [])
    assert.deepEqual(run.capture.events, [])
    assert.deepEqual(run.capture.acked, [])
})

test('history sink commit that fails aborts the chunk without a chunk event or receipt', async () => {
    const run = createSinkRun({
        commit: () => {
            throw new Error('commit failed')
        }
    })

    await assert.rejects(
        async () =>
            processHistorySyncNotification(
                run.deps as never,
                await inlineNotificationOf(
                    proto.HistorySync.encode({
                        pushnames: [{ id: '5511111111111@s.whatsapp.net', pushname: 'Alice' }]
                    }).finish()
                )
            ),
        /commit failed/
    )

    assert.deepEqual(run.timeline, ['item:pushnames', 'commit', 'abort'])
    assert.match(run.aborts[0].error.message, /commit failed/)
    assert.deepEqual(run.capture.events, [])
    assert.deepEqual(run.capture.acked, [])
})

test('history sink abort that throws does not replace the original failure', async () => {
    const run = createSinkRun({
        item: () => {
            throw new Error('item failed')
        },
        abort: () => Promise.reject(new Error('abort failed'))
    })

    await assert.rejects(
        async () =>
            processHistorySyncNotification(
                run.deps as never,
                await inlineNotificationOf(
                    proto.HistorySync.encode({
                        pushnames: [{ id: '5511111111111@s.whatsapp.net', pushname: 'Alice' }]
                    }).finish()
                )
            ),
        /item failed/
    )
    assert.equal(run.aborts.length, 1)
})

test('history sink streams INITIAL_STATUS_V3 statusV3Messages, commits and acks without touching the stores or the event', async () => {
    const status = (id: string): Proto.IWebMessageInfo => ({
        key: { remoteJid: 'status@broadcast', id },
        message: { conversation: id },
        messageTimestamp: 1_722_000_000
    })
    const run = createSinkRun()
    await processHistorySyncNotification(
        run.deps as never,
        await inlineNotificationOf(
            proto.HistorySync.encode({
                syncType: proto.HistorySync.HistorySyncType.INITIAL_STATUS_V3,
                statusV3Messages: [status('S1'), status('S2')]
            }).finish(),
            proto.Message.HistorySyncType.INITIAL_STATUS_V3
        )
    )

    assert.deepEqual(
        run.items.map((item) => item.kind),
        ['statusV3Messages', 'statusV3Messages']
    )
    assert.deepEqual(
        run.items.map((item) => item.kind === 'statusV3Messages' && item.value.key?.id),
        ['S1', 'S2']
    )
    assert.deepEqual(run.chunks[0], {
        id: SINK_CARRIER_ID,
        syncType: proto.Message.HistorySyncType.INITIAL_STATUS_V3
    })
    assert.equal(run.commits.length, 1)
    assert.equal(run.commits[0].syncType, proto.Message.HistorySyncType.INITIAL_STATUS_V3)
    assert.deepEqual(run.capture.events, [])
    assert.deepEqual(run.capture.acked, [proto.Message.HistorySyncType.INITIAL_STATUS_V3])
    assert.deepEqual(run.timeline.slice(-2), ['commit', 'ack'])
    assert.ok(!run.timeline.includes('event'))
    assert.deepEqual(run.capture.messages, [])
    assert.deepEqual(run.capture.threads, [])
})

test('INITIAL_STATUS_V3 without a sink is acked without downloading', async () => {
    const { capture, deps } = createCapture()
    let downloads = 0
    await processHistorySyncNotification(
        {
            ...(deps as Record<string, unknown>),
            mediaTransfer: {
                downloadAndDecryptStream: async () => {
                    downloads += 1
                    throw new Error('must not download')
                }
            }
        } as never,
        {
            syncType: proto.Message.HistorySyncType.INITIAL_STATUS_V3,
            directPath: '/history',
            mediaKey: new Uint8Array(32),
            fileSha256: new Uint8Array(32),
            fileEncSha256: new Uint8Array(32)
        }
    )

    assert.equal(downloads, 0)
    assert.deepEqual(capture.acked, [proto.Message.HistorySyncType.INITIAL_STATUS_V3])
    assert.deepEqual(capture.events, [])
})

test('history sink item carries msgOrderId and receives records without a message that the stores skip', async () => {
    const inOrderChat = '5511111111111@s.whatsapp.net'
    const reversedChat = '5511222222222@s.whatsapp.net'
    const withMessage = (chat: string, id: string, msgOrderId: number): Proto.IHistorySyncMsg => ({
        message: { key: { remoteJid: chat, id }, message: { conversation: id } },
        msgOrderId
    })
    const inOrder = proto.Conversation.encode({
        id: inOrderChat,
        messages: [withMessage(inOrderChat, 'O1', 41), { msgOrderId: 42 }]
    }).finish()
    const reversedMessages = proto.Conversation.encode({
        messages: [{ msgOrderId: 51 }, withMessage(reversedChat, 'R1', 52)]
    }).finish()
    const reversedHeader = proto.Conversation.encode({ id: reversedChat }).finish()

    const run = createSinkRun()
    await processHistorySyncNotification(
        run.deps as never,
        await inlineNotificationOf(
            concatParts(
                conversationRecord(inOrder),
                conversationRecord(concatParts(reversedMessages, reversedHeader))
            )
        )
    )

    const records = run.items.flatMap((item) =>
        item.kind === 'conversations.messages'
            ? [
                  {
                      chat: item.conversationId,
                      id: item.value.message?.key?.id ?? null,
                      order: longToNumber(item.value.msgOrderId)
                  }
              ]
            : []
    )
    assert.deepEqual(records, [
        { chat: inOrderChat, id: 'O1', order: 41 },
        { chat: inOrderChat, id: null, order: 42 },
        { chat: reversedChat, id: null, order: 51 },
        { chat: reversedChat, id: 'R1', order: 52 }
    ])
    assert.deepEqual(
        run.capture.messages.map((record) => record.id),
        ['O1', 'R1'],
        'the stores skip the records without a message'
    )
    assert.equal(run.commits[0].messagesCount, 2)
})

const ALL_FIELDS_CHAT = '5511111111111@s.whatsapp.net'

function buildAllFieldsHistorySync(): Proto.IHistorySync {
    return {
        syncType: proto.HistorySync.HistorySyncType.RECENT,
        conversations: [
            {
                id: ALL_FIELDS_CHAT,
                name: 'Alice',
                messages: [
                    {
                        message: {
                            key: { remoteJid: ALL_FIELDS_CHAT, id: 'AF1' },
                            message: { conversation: 'oi' }
                        },
                        msgOrderId: 7
                    }
                ]
            }
        ],
        statusV3Messages: [
            { key: { remoteJid: 'status@broadcast', id: 'SV1' }, message: { conversation: 'a' } },
            { key: { remoteJid: 'status@broadcast', id: 'SV2' }, message: { conversation: 'b' } }
        ],
        chunkOrder: 3,
        progress: 55,
        pushnames: [
            { id: ALL_FIELDS_CHAT, pushname: 'Alice' },
            { id: '5522222222222@s.whatsapp.net', pushname: 'Bob' }
        ],
        globalSettings: { fontSize: 14, showGroupNotificationsPreview: true },
        threadIdUserSecret: new Uint8Array([1, 2, 3, 4]),
        threadDsTimeframeOffset: 9,
        recentStickers: [
            { url: 'https://s/1', mimetype: 'image/webp', fileSha256: new Uint8Array([9, 8]) }
        ],
        pastParticipants: [
            {
                groupJid: '120363000000000000@g.us',
                pastParticipants: [{ userJid: ALL_FIELDS_CHAT, leaveTs: 100 }]
            }
        ],
        callLogRecords: [{ callId: 'CALL1', duration: 12, isVideo: true }],
        aiWaitListState: proto.HistorySync.BotAIWaitListState.AI_AVAILABLE,
        phoneNumberToLidMappings: [{ pnJid: ALL_FIELDS_CHAT, lidJid: '111@lid' }],
        companionMetaNonce: 'nonce-1',
        shareableChatIdentifierEncryptionKey: new Uint8Array([5, 6, 7]),
        accounts: [{ lid: '111@lid', username: 'alice' }],
        nctSalt: new Uint8Array([11, 12, 13]),
        inlineContacts: [{ pnJid: ALL_FIELDS_CHAT, lidJid: '111@lid', fullName: 'Alice Silva' }],
        inlineContactsProvided: true
    }
}

type ProtoCodec = { encode: (value: never) => { finish: () => Uint8Array } }

function encodedHexOf(codec: ProtoCodec, value: unknown): string {
    return Buffer.from(codec.encode(value as never).finish()).toString('hex')
}

test('history sink receives one item per field and element, with the HistorySync key as kind', async () => {
    const source = buildAllFieldsHistorySync()
    const run = createSinkRun()
    await processHistorySyncNotification(
        run.deps as never,
        await inlineNotificationOf(proto.HistorySync.encode(source).finish())
    )

    const expectedKinds: string[] = ['conversations.messages', 'conversations']
    for (const [key, value] of Object.entries(source)) {
        if (key !== 'syncType' && key !== 'conversations') {
            expectedKinds.push(...(Array.isArray(value) ? value.map(() => key) : [key]))
        }
    }
    assert.deepEqual(
        run.items.map((item) => item.kind),
        expectedKinds
    )
    assert.equal(
        new Set(run.items.map((item) => item.kind)).size,
        20,
        'every field but syncType is represented, conversations split in two'
    )

    const codecs: Record<string, ProtoCodec> = {
        statusV3Messages: proto.WebMessageInfo,
        pushnames: proto.Pushname,
        globalSettings: proto.GlobalSettings,
        recentStickers: proto.StickerMetadata,
        pastParticipants: proto.PastParticipants,
        callLogRecords: proto.CallLogRecord,
        phoneNumberToLidMappings: proto.PhoneNumberToLIDMapping,
        accounts: proto.Account,
        inlineContacts: proto.InlineContact
    }
    const cursor = new Map<string, number>()
    for (const item of run.items) {
        if (item.kind === 'conversations.messages') {
            assert.equal(item.conversationId, ALL_FIELDS_CHAT)
            assert.equal(
                encodedHexOf(proto.HistorySyncMsg, item.value),
                encodedHexOf(proto.HistorySyncMsg, source.conversations?.[0].messages?.[0])
            )
            continue
        }
        if (item.kind === 'conversations') {
            assert.equal(item.value.id, ALL_FIELDS_CHAT)
            assert.equal(item.value.name, 'Alice')
            continue
        }
        const field = (source as Record<string, unknown>)[item.kind]
        const index = cursor.get(item.kind) ?? 0
        cursor.set(item.kind, index + 1)
        const expected = Array.isArray(field) ? field[index] : field
        const codec = codecs[item.kind]
        if (codec) {
            assert.equal(encodedHexOf(codec, item.value), encodedHexOf(codec, expected))
        } else if (expected instanceof Uint8Array) {
            assert.deepEqual(Array.from(item.value as Uint8Array), Array.from(expected))
        } else {
            assert.equal(item.value, expected)
        }
    }
})

test('history sink bytes fields keep their content after the stream reuses its buffer', async () => {
    const count = 300
    const fillOf = (index: number): number => (index * 7 + 1) % 256
    const source: Proto.IHistorySync = {
        statusV3Messages: Array.from({ length: count }, (_, index) => ({
            key: { remoteJid: 'status@broadcast', id: `SB${index}` },
            message: { imageMessage: { jpegThumbnail: new Uint8Array(600).fill(fillOf(index)) } }
        })),
        threadIdUserSecret: new Uint8Array(32).fill(0xa1),
        recentStickers: Array.from({ length: count }, (_, index) => ({
            fileSha256: new Uint8Array(600).fill(fillOf(index)),
            mediaKey: new Uint8Array(600).fill(fillOf(index + 1))
        })),
        shareableChatIdentifierEncryptionKey: new Uint8Array(32).fill(0xb2),
        nctSalt: new Uint8Array(32).fill(0xc3),
        inlineContacts: Array.from({ length: count }, (_, index) => ({
            pnJid: `55119${index}@s.whatsapp.net`,
            fullName: 'x'.repeat(600)
        }))
    }
    const payload = proto.HistorySync.encode(source).finish()
    assert.ok(payload.length > 2 * 64 * 1024, 'the fixture must outgrow the reader buffer')

    const run = createSinkRun()
    await processHistorySyncNotification(run.deps as never, await inlineNotificationOf(payload))

    const isFilled = (bytes: Uint8Array | null | undefined, fill: number): boolean =>
        !!bytes && bytes.length > 0 && bytes.every((byte) => byte === fill)

    const statuses = run.items.filter((item) => item.kind === 'statusV3Messages')
    assert.equal(statuses.length, count)
    statuses.forEach((item, index) => {
        assert.ok(item.kind === 'statusV3Messages')
        assert.ok(
            isFilled(item.value.message?.imageMessage?.jpegThumbnail, fillOf(index)),
            `status thumbnail ${index} was overwritten`
        )
    })
    const stickers = run.items.filter((item) => item.kind === 'recentStickers')
    assert.equal(stickers.length, count)
    stickers.forEach((item, index) => {
        assert.ok(item.kind === 'recentStickers')
        assert.ok(isFilled(item.value.fileSha256, fillOf(index)), `sha ${index} was overwritten`)
        assert.ok(isFilled(item.value.mediaKey, fillOf(index + 1)), `key ${index} was overwritten`)
    })
    for (const [kind, fill] of [
        ['threadIdUserSecret', 0xa1],
        ['shareableChatIdentifierEncryptionKey', 0xb2],
        ['nctSalt', 0xc3]
    ] as const) {
        const item = run.items.find((candidate) => candidate.kind === kind)
        assert.ok(item && item.kind === kind)
        assert.equal(item.value.length, 32)
        assert.ok(isFilled(item.value, fill), `${kind} was overwritten`)
    }
})
