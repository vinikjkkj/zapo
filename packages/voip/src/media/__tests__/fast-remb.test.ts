import assert from 'node:assert/strict'
import test from 'node:test'

import {
    WA_FAST_REMB_BITRATE_ENCODING,
    WA_FAST_REMB_ELEMENT_LENGTH,
    WA_FAST_REMB_EXTENSION_ID,
    WA_FAST_REMB_PAYLOAD_LENGTH,
    writeFastRembExtension,
    writeFastRembPayload
} from '../fast-remb.js'

/**
 * The bytes the official client put on the wire for the 110,238 estimate,
 * the first of four aligned samples: bitmap, the 3 bytes of the estimate,
 * the receiver capacity field, and the flags byte.
 *
 * Kept whole on purpose, even though we emit only the first two fields. Only
 * the 3 bytes of the estimate are checked against it: the bitmap diverges by
 * choice - the client announces `0x09` and we announce `0x01` - and the rest
 * documents what was left out.
 */
const OBSERVED_CONTENT = new Uint8Array([0x09, 0x01, 0xae, 0x9e, 0x00, 0x0c, 0x3f, 0x11, 0x01])

/** The estimate the capture's `01 ae 9e` bytes carry. */
const OBSERVED_BITRATE = 110_238

/**
 * Content bytes the client parser requires before looking at bit 3, which is
 * the length of {@link OBSERVED_CONTENT}. Below that, the receiver capacity
 * field is not read, even if the bit is set.
 */
const CAPACITY_FIELD_MIN_CONTENT = 9

/**
 * The element we emit for that same estimate: id 13 with 4 bytes of content,
 * bitmap `0x01` and the 3 bytes of the estimate.
 *
 * None of these bytes comes from a constant of the code under test - the
 * id/len byte comes from the id and the length, the bitmap is our choice of
 * fields, and the following 3 are what the encoding has to produce for
 * {@link OBSERVED_BITRATE}. If any of the three choices changes, the tests
 * that compare against it fail.
 */
const EMITTED_ELEMENT = new Uint8Array([0xd3, 0x01, 0x01, 0xae, 0x9e])

/** Ids the video extension of this session already occupies. */
const ELEMENT_IDS_IN_USE = [3, 5, 6, 9]

/** Scratch buffer filled with a byte no write produces. */
function scratch(length: number): Uint8Array {
    return new Uint8Array(length).fill(0xff)
}

test('writes the element in the one-byte form of RFC 8285', () => {
    const target = scratch(WA_FAST_REMB_ELEMENT_LENGTH)
    const written = writeFastRembExtension(target, 0, OBSERVED_BITRATE)

    assert.equal(written, WA_FAST_REMB_ELEMENT_LENGTH)
    assert.equal(target[0] >>> 4, WA_FAST_REMB_EXTENSION_ID, 'the high nibble is the id')
    assert.equal(
        (target[0] & 0x0f) + 1,
        WA_FAST_REMB_PAYLOAD_LENGTH,
        'the low nibble is the content length minus one'
    )
})

/**
 * The assembled element has to come out byte for byte equal to
 * {@link EMITTED_ELEMENT}, which is written here from the id, the choice of
 * fields, and the sample's estimate - not copied from what the session
 * produces. This is the test that pins all three format choices at once: the
 * id, the bitmap, and the estimate's encoding. Changing any one of them
 * breaks here, which is the point.
 */
test('builds the whole element out of the id, the bitmap and the estimate', () => {
    const target = scratch(WA_FAST_REMB_ELEMENT_LENGTH)
    writeFastRembExtension(target, 0, OBSERVED_BITRATE)

    assert.deepEqual(target, EMITTED_ELEMENT)
})

test('writes the content without the id byte in front of it', () => {
    const target = scratch(WA_FAST_REMB_PAYLOAD_LENGTH)
    const written = writeFastRembPayload(target, 0, OBSERVED_BITRATE)

    assert.equal(written, WA_FAST_REMB_PAYLOAD_LENGTH)
    assert.deepEqual(target, EMITTED_ELEMENT.subarray(1))
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

test('keeps the content inside what the one-byte length field can carry', () => {
    assert.ok(WA_FAST_REMB_PAYLOAD_LENGTH >= 1)
    assert.ok(WA_FAST_REMB_PAYLOAD_LENGTH <= 16, 'the field holds length minus one in four bits')
    assert.equal(WA_FAST_REMB_ELEMENT_LENGTH, WA_FAST_REMB_PAYLOAD_LENGTH + 1)
})

/**
 * The content length is derived from the chosen encoding, not hand-written:
 * one bitmap byte plus whatever the estimate's encoding occupies. Without
 * that, changing the field's width would leave the id/len byte announcing a
 * size the content does not have.
 *
 * The second half checks that the write follows the same length the two
 * announce: after the bitmap comes the encoding and nothing beyond it.
 */
test('derives the lengths from the encoding in force', () => {
    assert.equal(WA_FAST_REMB_PAYLOAD_LENGTH, 1 + WA_FAST_REMB_BITRATE_ENCODING.byteLength)

    const target = scratch(WA_FAST_REMB_PAYLOAD_LENGTH)
    const written = writeFastRembPayload(target, 0, OBSERVED_BITRATE)
    const estimate = scratch(WA_FAST_REMB_BITRATE_ENCODING.byteLength)
    WA_FAST_REMB_BITRATE_ENCODING.write(estimate, 0, OBSERVED_BITRATE)

    assert.equal(written, WA_FAST_REMB_PAYLOAD_LENGTH)
    assert.deepEqual(
        target.subarray(1),
        estimate,
        'the bitmap is followed by the encoding and by nothing else'
    )
})

/**
 * Below 2^18 the three plausible encodings produce the same bytes, which is
 * why the capture alone did not distinguish between them: in the samples,
 * the REMB pair's exponent would come out zero. What decided it was the
 * client parser, on the plain big-endian integer - this test pins the bytes
 * in the range where the three agree, and the next one pins the reading
 * above it.
 */
test('encodes the captured estimate to the very bytes the client put on the wire', () => {
    const target = new Uint8Array(WA_FAST_REMB_BITRATE_ENCODING.byteLength)
    WA_FAST_REMB_BITRATE_ENCODING.write(target, 0, OBSERVED_BITRATE)
    assert.deepEqual(target, OBSERVED_CONTENT.subarray(1, 4))
})

test('reads back as the plain big endian integer the client parser expects', () => {
    const target = new Uint8Array(3)
    for (const value of [1, 110_238, 149_564, 262_144, 1_000_000, 0xfffffe]) {
        WA_FAST_REMB_BITRATE_ENCODING.write(target, 0, value)
        assert.equal((target[0] << 16) | (target[1] << 8) | target[2], value)
    }
})

/**
 * The receiver capacity field is left out through two paths at once: the
 * bit that announces it stays off, and the content ends before the length
 * where the parser would go looking for it. Either alone would not be
 * enough - a clean bitmap with long content would still carry bytes that
 * are not ours, and short content with the bit set would announce a field
 * that is not there.
 */
test('leaves out the receiver capacity field the client sends', () => {
    const target = scratch(WA_FAST_REMB_PAYLOAD_LENGTH)
    const written = writeFastRembPayload(target, 0, OBSERVED_BITRATE)

    assert.equal(target[0] & 0x08, 0, 'bit 3 is off, so nothing announces the capacity')
    assert.ok(
        written < CAPACITY_FIELD_MIN_CONTENT,
        'and the content is too short for the parser to read it'
    )
})

test('saturates instead of wrapping past the width of the field', () => {
    const target = new Uint8Array(3)
    WA_FAST_REMB_BITRATE_ENCODING.write(target, 0, 2 ** 40)
    assert.deepEqual(target, new Uint8Array([0xff, 0xff, 0xff]))
    WA_FAST_REMB_BITRATE_ENCODING.write(target, 0, -1)
    assert.deepEqual(target, new Uint8Array([0, 0, 0]))
})
