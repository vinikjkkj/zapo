import assert from 'node:assert/strict'
import { test } from 'node:test'

import { RtpHeader, RtpPacket } from '../rtp.js'

test('RtpPacket round-trips header and payload bytes', () => {
    const header = new RtpHeader(120, 42, 960, 0xabcd1234)
    header.marker = true
    header.extension = true
    header.extensionProfile = 0xdebe
    header.extensionData = new Uint8Array([0, 0, 0, 0])

    const payload = new Uint8Array([0xf8, 0xff, 0xfe, 0x01, 0x02])
    const packet = new RtpPacket(header, payload)
    const encoded = packet.encode()
    const decoded = RtpPacket.decode(encoded)

    assert.equal(decoded.header.payloadType, 120)
    assert.equal(decoded.header.sequenceNumber, 42)
    assert.equal(decoded.header.timestamp, 960)
    assert.equal(decoded.header.ssrc, 0xabcd1234)
    assert.equal(decoded.header.marker, true)
    assert.equal(decoded.header.extension, true)
    assert.equal(decoded.header.extensionProfile, 0xdebe)
    assert.deepEqual(decoded.header.extensionData, header.extensionData)
    assert.deepEqual(decoded.payload, payload)
    assert.deepEqual(encoded, packet.encode())
})
