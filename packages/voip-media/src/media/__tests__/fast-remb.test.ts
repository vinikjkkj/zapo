import assert from 'node:assert/strict'
import test from 'node:test'

import {
    WA_FAST_REMB_ELEMENT_LENGTH,
    WA_FAST_REMB_EXTENSION_ID,
    writeFastRembExtension
} from '../fast-remb.js'

/**
 * The content the official client sent for a 110,238 estimate: bitmap, the 3 estimate bytes,
 * then the receiver capacity and a flags byte, which are left out.
 */
const OBSERVED_CONTENT = new Uint8Array([0x09, 0x01, 0xae, 0x9e, 0x00, 0x0c, 0x3f, 0x11, 0x01])

const OBSERVED_BITRATE = 110_238

/** Content length from which the client parser reads the receiver capacity of bit 3. */
const CAPACITY_FIELD_MIN_CONTENT = 9

/** Id 13 with 4 content bytes, bitmap `0x01`, then the estimate, written by hand. */
const EMITTED_ELEMENT = new Uint8Array([0xd3, 0x01, 0x01, 0xae, 0x9e])

/** Ids the video extension of this session already occupies. */
const ELEMENT_IDS_IN_USE = [3, 5, 6, 9]

/** Scratch buffer filled with a byte no write produces. */
function scratch(length: number): Uint8Array {
    return new Uint8Array(length).fill(0xff)
}

function estimateOf(element: Uint8Array): number {
    return (element[2] << 16) | (element[3] << 8) | element[4]
}

test('writes the element in the one-byte form of RFC 8285', () => {
    const target = scratch(WA_FAST_REMB_ELEMENT_LENGTH)
    const written = writeFastRembExtension(target, 0, OBSERVED_BITRATE)

    assert.equal(written, WA_FAST_REMB_ELEMENT_LENGTH)
    assert.equal(target[0] >>> 4, WA_FAST_REMB_EXTENSION_ID, 'the high nibble is the id')
    assert.equal((target[0] & 0x0f) + 2, written, 'the low nibble is the content length minus one')
})

test('builds the whole element out of the id, the bitmap and the estimate', () => {
    const target = scratch(WA_FAST_REMB_ELEMENT_LENGTH)
    writeFastRembExtension(target, 0, OBSERVED_BITRATE)

    assert.deepEqual(target, EMITTED_ELEMENT)
    assert.deepEqual(
        target.subarray(2),
        OBSERVED_CONTENT.subarray(1, 4),
        'the estimate the client sent'
    )
})

test('writes at the offset it is given and nowhere else', () => {
    const target = scratch(WA_FAST_REMB_ELEMENT_LENGTH + 6)
    writeFastRembExtension(target, 3, OBSERVED_BITRATE)

    assert.deepEqual(target.subarray(0, 3), new Uint8Array([0xff, 0xff, 0xff]))
    assert.deepEqual(target.subarray(3, 3 + WA_FAST_REMB_ELEMENT_LENGTH), EMITTED_ELEMENT)
    assert.deepEqual(
        target.subarray(3 + WA_FAST_REMB_ELEMENT_LENGTH),
        new Uint8Array([0xff, 0xff, 0xff])
    )
})

test('keeps the id inside the dynamic range and off the ids already in use', () => {
    assert.ok(WA_FAST_REMB_EXTENSION_ID >= 1, '0 is reserved')
    assert.ok(WA_FAST_REMB_EXTENSION_ID <= 14, '15 terminates the element list')
    assert.ok(
        !ELEMENT_IDS_IN_USE.includes(WA_FAST_REMB_EXTENSION_ID),
        'a repeated id hands the peer two elements under one name'
    )
})

test('reads back as the plain big endian integer the client parser expects', () => {
    const target = new Uint8Array(WA_FAST_REMB_ELEMENT_LENGTH)
    for (const value of [1, 110_238, 149_564, 262_144, 1_000_000, 0xfffffe]) {
        writeFastRembExtension(target, 0, value)
        assert.equal(estimateOf(target), value)
    }
})

test('leaves out the receiver capacity field the client sends', () => {
    const target = scratch(WA_FAST_REMB_ELEMENT_LENGTH)
    const written = writeFastRembExtension(target, 0, OBSERVED_BITRATE)

    assert.equal(target[1] & 0x08, 0, 'bit 3 is off, so nothing announces the capacity')
    assert.ok(written - 1 < CAPACITY_FIELD_MIN_CONTENT, 'and the content is too short to hold it')
})

test('saturates instead of wrapping past the width of the field', () => {
    const target = new Uint8Array(WA_FAST_REMB_ELEMENT_LENGTH)
    writeFastRembExtension(target, 0, 2 ** 40)
    assert.equal(estimateOf(target), 0xffffff)
    writeFastRembExtension(target, 0, -1)
    assert.equal(estimateOf(target), 0)
})
