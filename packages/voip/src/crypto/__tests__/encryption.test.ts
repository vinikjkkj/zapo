import assert from 'node:assert/strict'
import { test } from 'node:test'

import { RtpHeader, RtpPacket } from '../../media/rtp.js'
import { derivePerJidSrtpKey, generateCallKey } from '../encryption.js'
import { SrtpSession } from '../srtp.js'

test('generateCallKey returns 32 bytes', () => {
    const key = generateCallKey()
    assert.equal(key.length, 32)
    assert.ok(key instanceof Uint8Array)
})

test('derivePerJidSrtpKey produces expected key material lengths', async () => {
    const callKey = new Uint8Array(32)
    for (let i = 0; i < callKey.length; i++) callKey[i] = i

    const keying = await derivePerJidSrtpKey(callKey, '12345:0@lid')
    assert.equal(keying.masterKey.length, 16)
    assert.equal(keying.masterSalt.length, 14)
})

test('SrtpSession protect/unprotect round-trips RTP payload', async () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x11)

    const keying = await derivePerJidSrtpKey(callKey, 'self:0@lid')
    const session = new SrtpSession(keying, keying, 4, 4)

    const header = new RtpHeader(120, 7, 1920, 0x11223344)
    const payload = new Uint8Array([0xf8, 0xff, 0xfe, 0xab, 0xcd])
    const packet = new RtpPacket(header, payload)

    const protectedPacket = session.protect(packet)
    const unprotected = session.unprotect(protectedPacket)

    assert.equal(unprotected.header.sequenceNumber, 7)
    assert.equal(unprotected.header.ssrc, 0x11223344)
    assert.deepEqual(unprotected.payload, payload)
})
