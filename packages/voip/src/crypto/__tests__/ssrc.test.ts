import assert from 'node:assert/strict'
import { test } from 'node:test'

import { hkdf } from 'zapo-js/crypto'

import { readUInt32LE, TEXT_ENCODER, writeUInt32BE } from '../../bytes.js'
import { generateSecureSsrc, WA_SSRC_SLOT, WA_VIDEO_CALL_SSRC_SLOTS } from '../ssrc.js'

const CALL_ID = '00CEAC2144738E0FAADE17F16BCDBA04'
const DEVICE_JID = '50062877036657:76@lid'

/**
 * SSRCs read out of the official client's own logs and inverted offline. Three
 * distinct call-ids, one peer device, plus a second slot on the last call-id.
 */
const CAPTURED_VECTORS = [
    { callId: '00CEAC2144738E0FAADE17F16BCDBA04', slot: 0, ssrc: 0x0c87cbd9 },
    { callId: '0077AF959D3755BE009DD3A9DE2E803E', slot: 0, ssrc: 0x03a9bd2e },
    { callId: '006AFEADB13F4EDFE9D8BA599B10EA96', slot: 0, ssrc: 0x8ffe17b1 },
    { callId: '006AFEADB13F4EDFE9D8BA599B10EA96', slot: 2, ssrc: 0xeb15721e }
] as const

for (const vector of CAPTURED_VECTORS) {
    test(`generateSecureSsrc reproduces the captured ssrc for ${vector.callId} slot ${vector.slot}`, () => {
        assert.equal(
            generateSecureSsrc(vector.callId, DEVICE_JID, vector.slot),
            vector.ssrc,
            `expected 0x${vector.ssrc.toString(16).toUpperCase()}`
        )
    })
}

test('generateSecureSsrc is deterministic for fixed inputs', () => {
    const a = generateSecureSsrc(CALL_ID, DEVICE_JID)
    const b = generateSecureSsrc(CALL_ID, DEVICE_JID)
    const c = generateSecureSsrc(CALL_ID, DEVICE_JID, WA_SSRC_SLOT.AUDIO.FEC)

    assert.equal(a, b)
    assert.notEqual(a, c)
})

test('generateSecureSsrc keys the HKDF with the call-id text and salts with the slot', () => {
    const salt = new Uint8Array([2, 0, 0, 0])
    const expected = readUInt32LE(
        hkdf(TEXT_ENCODER.encode(CALL_ID), salt, TEXT_ENCODER.encode(DEVICE_JID), 4),
        0
    )

    assert.equal(generateSecureSsrc(CALL_ID, DEVICE_JID, WA_SSRC_SLOT.VIDEO.MAIN), expected)
})

test('generateSecureSsrc hashes the call-id spelling instead of decoding it as hex', () => {
    assert.notEqual(
        generateSecureSsrc(CALL_ID.toLowerCase(), DEVICE_JID),
        generateSecureSsrc(CALL_ID, DEVICE_JID)
    )
})

test('generateSecureSsrc accepts a call-id that is not hex', () => {
    assert.equal(typeof generateSecureSsrc('CALLID1234567890', DEVICE_JID), 'number')
})

test('generateSecureSsrc writes the slot salt little-endian', () => {
    const vector = CAPTURED_VECTORS[3]
    const bigEndianSalt = new Uint8Array(4)
    writeUInt32BE(bigEndianSalt, vector.slot, 0)
    const bigEndian = readUInt32LE(
        hkdf(TEXT_ENCODER.encode(vector.callId), bigEndianSalt, TEXT_ENCODER.encode(DEVICE_JID), 4),
        0
    )

    assert.notEqual(bigEndian, vector.ssrc)
    assert.equal(generateSecureSsrc(vector.callId, DEVICE_JID, vector.slot), vector.ssrc)
})

test('generateSecureSsrc feeds the device jid without a slot suffix', () => {
    const vector = CAPTURED_VECTORS[0]
    const suffixed = readUInt32LE(
        hkdf(
            TEXT_ENCODER.encode(vector.callId),
            new Uint8Array(4),
            TEXT_ENCODER.encode(`${DEVICE_JID}_${vector.slot}`),
            4
        ),
        0
    )

    assert.notEqual(suffixed, vector.ssrc)
    assert.equal(generateSecureSsrc(vector.callId, DEVICE_JID, vector.slot), vector.ssrc)
})

test('generateSecureSsrc takes the device jid verbatim', () => {
    const full = generateSecureSsrc(CALL_ID, DEVICE_JID)

    assert.notEqual(full, generateSecureSsrc(CALL_ID, '50062877036657@lid'))
    assert.notEqual(full, generateSecureSsrc(CALL_ID, '50062877036657:76'))
    assert.notEqual(full, generateSecureSsrc(CALL_ID, '50062877036657:1@lid'))
})

test('generateSecureSsrc gives every slot of one device a distinct ssrc', () => {
    const ssrcs = new Set(
        WA_VIDEO_CALL_SSRC_SLOTS.map((slot) => generateSecureSsrc(CALL_ID, DEVICE_JID, slot))
    )

    assert.equal(ssrcs.size, WA_VIDEO_CALL_SSRC_SLOTS.length)
})

test('WA_SSRC_SLOT reuses the video slots for screen share', () => {
    assert.deepEqual(WA_SSRC_SLOT.SCREEN_SHARE, WA_SSRC_SLOT.VIDEO)
    assert.deepEqual(WA_SSRC_SLOT.AUDIO, { MAIN: 0, FEC: 1, OOB_NACK: 4 })
    assert.deepEqual(WA_SSRC_SLOT.VIDEO, { MAIN: 2, FEC: 3, OOB_NACK: 5 })
    assert.deepEqual(WA_SSRC_SLOT.APP_DATA, { MAIN: 6 })
    assert.deepEqual(WA_VIDEO_CALL_SSRC_SLOTS, [0, 1, 4, 2, 3, 5, 6])
})
