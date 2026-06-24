import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    buildAllocateForRelay,
    buildBindingRequestWithSubs,
    buildSenderSubscriptions,
    buildSSRCSubscriptionList,
    buildWhatsAppPing,
    classifyPacket,
    isStunPacket,
    parseStunResponse
} from '../stun.js'

const STUN_MAGIC_COOKIE_BYTES = new Uint8Array([0x21, 0x12, 0xa4, 0x42])

function findAttr(
    info: NonNullable<ReturnType<typeof parseStunResponse>>,
    type: number
): { type: number; length: number; data: Uint8Array } | undefined {
    return info.attributes.find((a) => a.type === type)
}

function readU32BE(data: Uint8Array, offset: number): number {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
    return dv.getUint32(offset, false)
}

test('STUN header encodes magic cookie and type as big-endian', () => {
    const ping = buildWhatsAppPing()
    assert.equal(ping.length, 20)
    // type 0x0801 at bytes 0..1
    assert.deepEqual(ping.subarray(0, 2), new Uint8Array([0x08, 0x01]))
    // magic cookie at bytes 4..7
    assert.deepEqual(ping.subarray(4, 8), STUN_MAGIC_COOKIE_BYTES)
})

test('buildWhatsAppPing round-trips through parseStunResponse', () => {
    const ping = buildWhatsAppPing()
    assert.ok(isStunPacket(ping))
    const info = parseStunResponse(ping)
    assert.ok(info)
    // the locally-built ping carries the magic cookie, so it parses through the
    // main path: class 'request' with the wa-ping method override.
    assert.equal(info.method, 'wa-ping')
    assert.equal(info.stunClass, 'request')
    assert.equal(info.transactionId.length, 24)
    assert.match(classifyPacket(ping), /wa-ping/)
})

test('cookie-less wa-pong parses as an indication', () => {
    // server pings/pongs (0x0801/0x0802) arrive without the STUN magic cookie
    const pong = new Uint8Array(20)
    pong[0] = 0x08
    pong[1] = 0x02
    const info = parseStunResponse(pong)
    assert.ok(info)
    assert.equal(info.method, 'wa-pong')
    assert.equal(info.stunClass, 'indication')
})

test('binding request round-trips: cookie, type, attrs, and echoed values', () => {
    const username = new TextEncoder().encode('alice:bob')
    const key = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const subs = buildSenderSubscriptions(0x12345678)

    const msg = buildBindingRequestWithSubs(username, key, subs, true, true)

    // raw header sanity (catches intToBytes endianness)
    assert.deepEqual(msg.subarray(0, 2), new Uint8Array([0x00, 0x01]))
    assert.deepEqual(msg.subarray(4, 8), STUN_MAGIC_COOKIE_BYTES)

    const info = parseStunResponse(msg)
    assert.ok(info)
    assert.equal(info.rawType, 0x0001)
    assert.equal(info.method, 'binding')
    assert.equal(info.stunClass, 'request')

    const present = new Set(info.attributes.map((a) => a.type))
    for (const type of [
        0x0006, // USERNAME
        0x0024, // PRIORITY
        0x802a, // ICE-CONTROLLING
        0x4000, // SENDER-SUBSCRIPTIONS
        0x0008, // MESSAGE-INTEGRITY
        0x8028 // FINGERPRINT
    ]) {
        assert.ok(present.has(type), `missing attr 0x${type.toString(16)}`)
    }

    // USERNAME echoes the input bytes
    const usernameAttr = findAttr(info, 0x0006)
    assert.deepEqual(usernameAttr?.data, username)

    // PRIORITY decodes back to DEFAULT_ICE_PRIORITY (16_777_215)
    const priorityAttr = findAttr(info, 0x0024)
    assert.ok(priorityAttr)
    assert.equal(readU32BE(priorityAttr.data, 0), 16_777_215)

    // MESSAGE-INTEGRITY is a 20-byte HMAC-SHA1
    assert.equal(findAttr(info, 0x0008)?.length, 20)
})

test('allocate-for-relay carries sender-subscriptions, ssrc-list and xor-relayed-address', () => {
    const subs = buildSenderSubscriptions(0xaabbccdd)
    const ssrcList = buildSSRCSubscriptionList([0x11111111], [0x22222222], 0, 0)
    const key = new Uint8Array(16).fill(7)

    const msg = buildAllocateForRelay(subs, ssrcList, key, '203.0.113.5', 3480)
    const info = parseStunResponse(msg)
    assert.ok(info)
    assert.equal(info.method, 'allocate')

    const present = new Set(info.attributes.map((a) => a.type))
    assert.ok(present.has(0x4000)) // SENDER-SUBSCRIPTIONS
    assert.ok(present.has(0x4024)) // SSRC-LIST
    assert.ok(present.has(0x0016)) // XOR-RELAYED-ADDRESS

    // XOR-RELAYED-ADDRESS: family byte then xor'd port/ip — first two bytes are 0x00 0x01
    const xor = findAttr(info, 0x0016)
    assert.ok(xor)
    assert.deepEqual(xor.data.subarray(0, 2), new Uint8Array([0x00, 0x01]))
})
