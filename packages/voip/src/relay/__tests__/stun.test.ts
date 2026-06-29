import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bytesToHex } from 'zapo-js/util'

import { TEXT_ENCODER } from '../../bytes.js'
import {
    buildBindingRequestWithSubs,
    buildSenderSubscriptions,
    buildWhatsAppPing,
    isRtpPacket,
    isStunPacket,
    parseStunResponse
} from '../stun.js'

test('buildWhatsAppPing emits a 20-byte STUN-like packet', () => {
    const ping = buildWhatsAppPing()
    assert.equal(ping.length, 20)
    assert.equal(isStunPacket(ping), true)
    const info = parseStunResponse(ping)
    assert.equal(info?.method, 'wa-ping')
})

test('buildSenderSubscriptions encodes protobuf wrapper for SSRC', () => {
    const subs = buildSenderSubscriptions(0x12345678)
    assert.ok(subs.length > 0)
    assert.notEqual(subs[0], 0)
})

test('isRtpPacket and isStunPacket classify first-byte families', () => {
    const stun = buildWhatsAppPing()
    const rtp = new Uint8Array(12)
    rtp[0] = 0x80
    rtp[1] = 120

    assert.equal(isStunPacket(stun), true)
    assert.equal(isRtpPacket(stun), false)
    assert.equal(isRtpPacket(rtp), true)
    assert.equal(isStunPacket(rtp), false)
})

test('isStunPacket accepts cookieless wa-ping/pong and rejects DTLS', () => {
    const pong = new Uint8Array(20)
    pong[0] = 0x08
    pong[1] = 0x02
    assert.equal(isStunPacket(pong), true)

    const dtls = new Uint8Array(13)
    dtls[0] = 0x16
    dtls[1] = 0xfe
    assert.equal(isStunPacket(dtls), false)
})

test('parseStunResponse reads transaction id as hex', () => {
    const ping = buildWhatsAppPing()
    const info = parseStunResponse(ping)
    assert.ok(info)
    assert.equal(info.transactionId, bytesToHex(ping.subarray(8, 20)))
})

test('buildBindingRequestWithSubs accepts Uint8Array username and key', () => {
    const username = TEXT_ENCODER.encode('remote:local')
    const key = TEXT_ENCODER.encode('ice-password')
    const subs = buildSenderSubscriptions(0xdeadbeef)
    const packet = buildBindingRequestWithSubs(username, key, subs, true, true)
    assert.ok(packet.length >= 20)
    assert.equal(isStunPacket(packet), true)
})
