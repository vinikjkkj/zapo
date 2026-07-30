import assert from 'node:assert/strict'
import test from 'node:test'

import { decodeGroupHistoryBundle, encodeGroupHistoryBundle } from '@message/kinds/group-history'
import type { Proto } from '@proto'

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
