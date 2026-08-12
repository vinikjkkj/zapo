import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'

import { proto } from '@proto'
import {
    PROTO_STREAM_EVENT_KINDS,
    type ProtoStreamEvent,
    streamProtoFields
} from '@util/proto-stream'
import { PROTO_WIRE_TYPES, scanProtoFields } from '@util/protoscan'

/** Splits `bytes` into fixed-size chunks so buffer refills land mid-field. */
function chunked(bytes: Uint8Array, size: number): Readable {
    const chunks: Uint8Array[] = []
    for (let offset = 0; offset < bytes.byteLength; offset += size) {
        chunks[chunks.length] = bytes.subarray(offset, Math.min(offset + size, bytes.byteLength))
    }
    return Readable.from(chunks.length > 0 ? chunks.map((c) => Buffer.from(c)) : [Buffer.alloc(0)])
}

async function collect(
    bytes: Uint8Array,
    options?: Parameters<typeof streamProtoFields>[2],
    chunkSize = 7
): Promise<ProtoStreamEvent[]> {
    const events: ProtoStreamEvent[] = []
    await streamProtoFields(
        chunked(bytes, chunkSize),
        (event) => {
            events[events.length] =
                event.kind === PROTO_STREAM_EVENT_KINDS.FIELD
                    ? { ...event, value: event.value.slice(), raw: event.raw.slice() }
                    : event
        },
        options
    )
    return events
}

const SAMPLE = proto.HistorySync.encode({
    syncType: proto.HistorySync.HistorySyncType.RECENT,
    chunkOrder: 4,
    progress: 88,
    nctSalt: new Uint8Array([9, 8, 7, 6]),
    pushnames: [{ id: '5511111111111@s.whatsapp.net', pushname: 'Alice' }],
    conversations: [
        {
            id: '5511111111111@s.whatsapp.net',
            name: 'Alice',
            unreadCount: 2,
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
                        message: { conversation: 'tudo bem' },
                        messageTimestamp: 1_722_000_001
                    }
                }
            ]
        },
        { id: '123@g.us', messages: [] }
    ]
}).finish()

test('streamProtoFields matches scanProtoFields on the top-level fields', async () => {
    const expected: string[] = []
    scanProtoFields(SAMPLE, 0, SAMPLE.length, (field) => {
        expected[expected.length] = `${field.fieldNumber}/${field.wireType}/${field.varintValue}`
    })

    const events = await collect(SAMPLE)
    const actual = events.map(
        (event) =>
            `${event.fieldNumber}/${event.kind === PROTO_STREAM_EVENT_KINDS.FIELD ? event.wireType : PROTO_WIRE_TYPES.LEN}/${
                event.kind === PROTO_STREAM_EVENT_KINDS.FIELD ? event.varintValue : 0
            }`
    )
    assert.deepEqual(actual, expected)
})

test('streamProtoFields yields identical results at every chunk boundary', async () => {
    const reference = await collect(SAMPLE, undefined, SAMPLE.byteLength)
    const flatten = (events: readonly ProtoStreamEvent[]): string =>
        events
            .map((event) =>
                event.kind === PROTO_STREAM_EVENT_KINDS.FIELD
                    ? `F${event.fieldNumber}:${event.wireType}:${event.depth}:${event.varintValue}:${Buffer.from(event.value).toString('hex')}`
                    : `${event.kind}${event.fieldNumber}:${event.depth}`
            )
            .join('|')
    const expected = flatten(reference)

    for (const size of [1, 2, 3, 5, 13, 64, 1024]) {
        const events = await collect(SAMPLE, undefined, size)
        assert.equal(flatten(events), expected, `chunk size ${size}`)
    }
})

test('streamProtoFields descends without materializing the container', async () => {
    const events = await collect(SAMPLE, {
        shouldDescend: (fieldNumber, depth) => fieldNumber === 2 && depth === 0
    })

    const enters = events.filter((event) => event.kind === PROTO_STREAM_EVENT_KINDS.ENTER)
    const leaves = events.filter((event) => event.kind === PROTO_STREAM_EVENT_KINDS.LEAVE)
    assert.equal(enters.length, 2, 'one enter per conversation')
    assert.equal(leaves.length, 2, 'every enter is closed')
    assert.equal(
        events.some(
            (event) =>
                event.kind === PROTO_STREAM_EVENT_KINDS.FIELD &&
                event.depth === 0 &&
                event.fieldNumber === 2
        ),
        false,
        'a descended field must never be delivered as a materialized value'
    )

    const messageRecords = events.filter(
        (event) =>
            event.kind === PROTO_STREAM_EVENT_KINDS.FIELD &&
            event.depth === 1 &&
            event.fieldNumber === 2
    )
    assert.equal(messageRecords.length, 2)
    const ids = messageRecords.map((event) =>
        event.kind === PROTO_STREAM_EVENT_KINDS.FIELD
            ? proto.HistorySyncMsg.decode(event.value).message?.key?.id
            : null
    )
    assert.deepEqual(ids, ['M1', 'M2'])
})

test('streamProtoFields raw bytes re-encode into a decodable subset message', async () => {
    const events = await collect(SAMPLE, {
        shouldDescend: (fieldNumber, depth) => fieldNumber === 2 && depth === 0
    })

    const parts: Uint8Array[] = []
    let seenEnter = false
    for (const event of events) {
        if (event.kind === PROTO_STREAM_EVENT_KINDS.ENTER) {
            if (seenEnter) break
            seenEnter = true
            continue
        }
        if (event.kind !== PROTO_STREAM_EVENT_KINDS.FIELD || event.depth !== 1) {
            continue
        }
        if (event.fieldNumber === 2) {
            continue
        }
        parts[parts.length] = event.raw
    }
    const header = Buffer.concat(parts.map((part) => Buffer.from(part)))
    const conversation = proto.Conversation.decode(header)
    assert.equal(conversation.id, '5511111111111@s.whatsapp.net')
    assert.equal(conversation.name, 'Alice')
    assert.equal(conversation.unreadCount, 2)
    assert.equal(conversation.messages.length, 0, 'messages must be excluded from the subset')
})

test('streamProtoFields skips unknown fields by wire type', async () => {
    const unknownVarint = new Uint8Array([0xf8, 0x1f, 0x2a])
    const unknownLen = new Uint8Array([0xfa, 0x1f, 0x02, 0xde, 0xad])
    const unknownFixed32 = new Uint8Array([0xfd, 0x1f, 0x01, 0x02, 0x03, 0x04])
    const unknownFixed64 = new Uint8Array([0xf9, 0x1f, 1, 2, 3, 4, 5, 6, 7, 8])
    const known = proto.Pushname.encode({ id: 'a@s.whatsapp.net', pushname: 'A' }).finish()
    const blob = Buffer.concat([
        Buffer.from(unknownVarint),
        Buffer.from(known),
        Buffer.from(unknownFixed32),
        Buffer.from(unknownLen),
        Buffer.from(unknownFixed64)
    ])

    const events = await collect(new Uint8Array(blob), undefined, 3)
    assert.deepEqual(
        events.map((event) => event.fieldNumber),
        [511, 1, 2, 511, 511, 511]
    )
})

test('streamProtoFields rejects a materialized field above maxFieldBytes', async () => {
    await assert.rejects(() => collect(SAMPLE, { maxFieldBytes: 8 }), /exceeds the 8 byte limit/)
})

test('streamProtoFields exempts descended fields from maxFieldBytes', async () => {
    const events = await collect(SAMPLE, {
        maxFieldBytes: 64,
        shouldDescend: (fieldNumber, depth) => fieldNumber === 2 && depth === 0
    })
    assert.ok(
        events.some((event) => event.kind === PROTO_STREAM_EVENT_KINDS.ENTER),
        'the oversized conversation must still be walked'
    )
})

test('streamProtoFields rejects a truncated stream', async () => {
    await assert.rejects(
        () => collect(SAMPLE.subarray(0, SAMPLE.byteLength - 4), undefined, 5),
        /unexpected end of protobuf stream/
    )
})

test('streamProtoFields rejects a nested length that overruns its parent', async () => {
    const blob = new Uint8Array([0x12, 0x04, 0x12, 0xc8, 0x01, 0x00])
    await assert.rejects(
        () =>
            collect(blob, {
                shouldDescend: (fieldNumber, depth) => fieldNumber === 2 && depth === 0
            }),
        /exceeds its parent field/
    )
})

test('streamProtoFields rejects an invalid field number', async () => {
    await assert.rejects(
        () => collect(new Uint8Array([0x00, 0x01])),
        /invalid protobuf field number/
    )
})

test('streamProtoFields rejects an unmatched end-group', async () => {
    await assert.rejects(() => collect(new Uint8Array([0x0c])), /unmatched protobuf end-group/)
})

test('streamProtoFields skips a deprecated group', async () => {
    const blob = new Uint8Array([0x0b, 0x10, 0x2a, 0x0c, 0x28, 0x07])
    const events = await collect(blob, undefined, 2)
    assert.deepEqual(
        events.map((event) => event.fieldNumber),
        [5]
    )
    const field = events[0]
    assert.equal(field.kind, PROTO_STREAM_EVENT_KINDS.FIELD)
    if (field.kind === PROTO_STREAM_EVENT_KINDS.FIELD) {
        assert.equal(field.varintValue, 7)
    }
})

test('streamProtoFields handles an empty stream', async () => {
    assert.deepEqual(await collect(new Uint8Array(0)), [])
})
