import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'
import { unzipSync } from 'node:zlib'

import {
    decodeGroupHistoryBundle,
    encodeGroupHistoryBundle,
    GROUP_HISTORY_FIELDS,
    streamGroupHistoryBundle
} from '@message/kinds/group-history'
import { proto, type Proto } from '@proto'
import { readProtoVarint } from '@util/protoscan'

const groupJid = '120363000000000000@g.us'

function buildMessage(id: string, text: string, timestamp: number): Proto.IWebMessageInfo {
    return {
        key: {
            id,
            remoteJid: groupJid,
            fromMe: false,
            participant: '5511999999999@s.whatsapp.net'
        },
        message: { conversation: text },
        messageTimestamp: timestamp
    }
}

test('group history bundle round-trips through zlib', async () => {
    const messages = [buildMessage('A', 'first', 100), buildMessage('B', 'second', 200)]
    const { compressed, encoded } = await encodeGroupHistoryBundle(messages)

    assert.equal(compressed[0], 0x78)
    assert.notDeepEqual(compressed, encoded)

    const decoded = await decodeGroupHistoryBundle(compressed)
    assert.equal(decoded.messages.length, 2)
    assert.equal(decoded.messages[0].key?.id, 'A')
    assert.equal(decoded.messages[0].message?.conversation, 'first')
    assert.equal(decoded.messages[1].key?.id, 'B')
    assert.equal(decoded.outOfWindowPinnedMessages.length, 0)
})

test('group history bundle carries out-of-window pins separately', async () => {
    const { compressed } = await encodeGroupHistoryBundle(
        [buildMessage('A', 'recent', 300)],
        [buildMessage('P', 'old pin', 1)]
    )
    const decoded = await decodeGroupHistoryBundle(compressed)
    assert.equal(decoded.messages.length, 1)
    assert.equal(decoded.outOfWindowPinnedMessages.length, 1)
    assert.equal(decoded.outOfWindowPinnedMessages[0].key?.id, 'P')
})

test('encodeGroupHistoryBundle omits out-of-window pins when the list is empty', async () => {
    const withoutPins = await encodeGroupHistoryBundle([buildMessage('A', 'x', 1)])
    const withEmptyPins = await encodeGroupHistoryBundle([buildMessage('A', 'x', 1)], [])
    assert.deepEqual(withEmptyPins.encoded, withoutPins.encoded)
})

test('decodeGroupHistoryBundle rejects a blob that is not zlib', async () => {
    await assert.rejects(() => decodeGroupHistoryBundle(new Uint8Array([1, 2, 3, 4])))
})

async function collectStreamed(
    inflated: Uint8Array,
    maxRecordBytes?: number
): Promise<{ id: string | null | undefined; outOfWindow: boolean }[]> {
    const seen: { id: string | null | undefined; outOfWindow: boolean }[] = []
    await streamGroupHistoryBundle(
        Readable.from([Buffer.from(inflated)]),
        (message, outOfWindow) => {
            seen.push({ id: message.key?.id, outOfWindow })
        },
        maxRecordBytes
    )
    return seen
}

test('streamGroupHistoryBundle is equivalent to the buffered decode', async () => {
    const inflated = proto.GroupHistory.encode({
        messages: [buildMessage('A', 'first', 100), buildMessage('B', 'second', 200)],
        commentMessages: [buildMessage('C', 'comment', 150)],
        uncountedAssociatedMessageLists: [
            {
                parentMessage: { id: 'A', remoteJid: groupJid },
                messages: [buildMessage('U', 'associated', 160)]
            }
        ],
        outOfWindowPinnedMessages: [buildMessage('P', 'old pin', 1)]
    }).finish()

    const reference = proto.GroupHistory.decode(inflated)
    const streamed = await collectStreamed(inflated)

    assert.deepEqual(streamed, [
        { id: 'A', outOfWindow: false },
        { id: 'B', outOfWindow: false },
        { id: 'P', outOfWindow: true }
    ])
    assert.deepEqual(
        streamed.filter((entry) => !entry.outOfWindow).map((entry) => entry.id),
        reference.messages.map((message) => message.key?.id),
        'plain messages must match the buffered decode, in wire order'
    )
    assert.deepEqual(
        streamed.filter((entry) => entry.outOfWindow).map((entry) => entry.id),
        reference.outOfWindowPinnedMessages.map((message) => message.key?.id)
    )
})

test('streamGroupHistoryBundle walks a real compressed bundle', async () => {
    const { compressed } = await encodeGroupHistoryBundle(
        [buildMessage('A', 'recent', 300)],
        [buildMessage('P', 'old pin', 1)]
    )
    const streamed = await collectStreamed(new Uint8Array(unzipSync(Buffer.from(compressed))))
    assert.deepEqual(streamed, [
        { id: 'A', outOfWindow: false },
        { id: 'P', outOfWindow: true }
    ])
})

test('streamGroupHistoryBundle rejects a record above maxRecordBytes', async () => {
    const inflated = proto.GroupHistory.encode({
        messages: [buildMessage('A', 'a fairly long message body to push past the cap', 100)]
    }).finish()
    await assert.rejects(() => collectStreamed(inflated, 8), /exceeds the 8 byte limit/)
})

test('group history field numbers match the generated encoder', () => {
    const fieldNumberOf = (value: Proto.IGroupHistory): number => {
        const bytes = proto.GroupHistory.encode(value).finish()
        assert.ok(bytes.length > 0, 'the probe field must actually be encoded')
        return Math.floor(readProtoVarint(bytes, 0, bytes.length).value / 8)
    }
    assert.deepEqual(
        {
            MESSAGES: fieldNumberOf({ messages: [{}] }),
            OUT_OF_WINDOW_PINNED_MESSAGES: fieldNumberOf({ outOfWindowPinnedMessages: [{}] })
        },
        { ...GROUP_HISTORY_FIELDS }
    )
})

test('streamGroupHistoryBundle rejects a truncated stream', async () => {
    const inflated = proto.GroupHistory.encode({
        messages: [buildMessage('A', 'first', 100)]
    }).finish()
    await assert.rejects(
        () => collectStreamed(inflated.subarray(0, inflated.length - 3)),
        /unexpected end of protobuf stream/
    )
})

test('streamGroupHistoryBundle hands out messages that survive the walk', async () => {
    // The payload has to outgrow the reader's buffer, otherwise it never
    // compacts and a retained alias is never overwritten.
    const secret = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const messages: Proto.IWebMessageInfo[] = []
    for (let index = 0; index < 2_000; index += 1) {
        messages.push({
            key: { id: `S${index}`, remoteJid: groupJid, fromMe: false },
            message: { conversation: `body ${index} ${'x'.repeat(80)}` },
            messageTimestamp: 100 + index,
            messageSecret: secret
        })
    }
    const inflated = proto.GroupHistory.encode({ messages }).finish()
    assert.ok(inflated.length > 64 * 1024, 'fixture must exceed the reader buffer')

    const chunks: Buffer[] = []
    for (let offset = 0; offset < inflated.length; offset += 64) {
        chunks.push(Buffer.from(inflated.subarray(offset, Math.min(offset + 64, inflated.length))))
    }

    const retained: Proto.WebMessageInfo[] = []
    await streamGroupHistoryBundle(Readable.from(chunks), (message) => {
        retained.push(message)
    })

    assert.equal(retained.length, 2_000)
    for (const message of retained) {
        assert.deepEqual(
            Array.from(message.messageSecret ?? []),
            Array.from(secret),
            'a retained message must not alias the reader buffer'
        )
    }
})
