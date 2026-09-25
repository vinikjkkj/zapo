import assert from 'node:assert/strict'
import test from 'node:test'

import { bytesToHex } from '../../bytes.js'
import { decodeAppDataPayload, encodeReactionPayload } from '../protocol.js'

const THUMBS_UP = '\u{1F44D}'

/**
 * The bytes of one reaction, spelled out by hand from the field numbers rather
 * than produced by the encoder under test, so that the assertion fails if the
 * nesting or a field number moves:
 *
 * ```
 * 0a 0a                    appDataPayloads.messages, 10 bytes
 *   0a 08                  appDataMessage.reaction_info, 8 bytes
 *     08 01                reactionInfo.transaction_id = 1
 *     12 04 f0 9f 91 8d    reactionInfo.reaction = "👍" (4 UTF-8 bytes)
 * ```
 */
const THUMBS_UP_PAYLOAD_HEX = '0a0a0a0808011204f09f918d'

test('encodeReactionPayload writes the documented nesting and field numbers', () => {
    const payload = encodeReactionPayload({ transactionId: 1n, reaction: THUMBS_UP })

    assert.equal(bytesToHex(payload), THUMBS_UP_PAYLOAD_HEX)
})

test('the reaction travels as the utf-8 glyph, never as an index', () => {
    const payload = encodeReactionPayload({ transactionId: 1n, reaction: THUMBS_UP })

    // Four payload bytes for one emoji is what a glyph costs; an index would
    // be a single byte, and the four bytes of the emoji would appear nowhere.
    assert.ok(bytesToHex(payload).includes('f09f918d'))

    const decoded = decodeAppDataPayload(payload)
    assert.equal(decoded?.items[0]?.reaction?.reaction, THUMBS_UP)
})

test('decodeAppDataPayload round-trips a reaction', () => {
    const payload = encodeReactionPayload({ transactionId: 42n, reaction: '❤️' })
    const decoded = decodeAppDataPayload(payload)

    assert.equal(decoded?.shape, 'payloads')
    assert.equal(decoded?.items.length, 1)
    assert.deepEqual(decoded?.items[0]?.reaction, { transactionId: 42n, reaction: '❤️' })
})

test('a transaction id uses the whole uint64 range', () => {
    const transactionId = 0xffff_ffff_ffff_ffffn
    const decoded = decodeAppDataPayload(
        encodeReactionPayload({ transactionId, reaction: THUMBS_UP })
    )

    assert.equal(decoded?.items[0]?.reaction?.transactionId, transactionId)
})

test('decodeAppDataPayload also reads a bare appDataMessage', () => {
    // The same reaction without the repeated-list wrapper, which is the other
    // nesting the reverse engineering describes.
    const bare = new Uint8Array([0x0a, 0x08, 0x08, 0x07, 0x12, 0x04, 0xf0, 0x9f, 0x91, 0x8d])
    const decoded = decodeAppDataPayload(bare)

    assert.equal(decoded?.shape, 'message')
    assert.deepEqual(decoded?.items[0]?.reaction, { transactionId: 7n, reaction: THUMBS_UP })
})

test('decodeAppDataPayload reads an ar effect off the same envelope', () => {
    // appDataPayloads { messages { ar_effect_info { transaction_id: 3, ar_effect_id: "ab" } } }
    const payload = new Uint8Array([0x0a, 0x08, 0x1a, 0x06, 0x08, 0x03, 0x12, 0x02, 0x61, 0x62])
    const decoded = decodeAppDataPayload(payload)

    assert.equal(decoded?.items.length, 1)
    assert.deepEqual(decoded?.items[0]?.arEffect, { transactionId: 3n, arEffectId: 'ab' })
    assert.equal(decoded?.items[0]?.reaction, undefined)
})

test('decodeAppDataPayload skips message kinds it does not model', () => {
    // appDataPayloads { messages { transcription_info { transcript_id: 1 } } }
    const transcription = new Uint8Array([0x0a, 0x04, 0x12, 0x02, 0x08, 0x01])

    assert.equal(decodeAppDataPayload(transcription), null)
})

test('decodeAppDataPayload rejects truncated bytes instead of throwing', () => {
    const payload = encodeReactionPayload({ transactionId: 1n, reaction: THUMBS_UP })

    assert.equal(decodeAppDataPayload(payload.subarray(0, payload.length - 2)), null)
    assert.equal(decodeAppDataPayload(new Uint8Array([0xff])), null)
})

test('decodeAppDataPayload reads several reactions out of one payload', () => {
    const first = encodeReactionPayload({ transactionId: 1n, reaction: THUMBS_UP })
    const second = encodeReactionPayload({ transactionId: 2n, reaction: THUMBS_UP })
    const merged = new Uint8Array(first.length + second.length)
    merged.set(first)
    merged.set(second, first.length)

    const decoded = decodeAppDataPayload(merged)

    assert.equal(decoded?.items.length, 2)
    assert.deepEqual(
        decoded?.items.map((item) => item.reaction?.transactionId),
        [1n, 2n]
    )
})
