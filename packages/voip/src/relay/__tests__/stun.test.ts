import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bytesToHex } from 'zapo-js/util'

import { TEXT_ENCODER } from '../../bytes.js'
import {
    buildAllocateForRelay,
    buildBindingRequestWithSubs,
    buildSenderSubscriptions,
    buildSSRCSubscriptionList,
    buildWhatsAppPing,
    isRtcpPacket,
    isRtpPacket,
    isStunPacket,
    parseStunResponse
} from '../stun.js'

const ATTR_USERNAME = 0x0006
const ATTR_MESSAGE_INTEGRITY = 0x0008
const ATTR_XOR_RELAYED_ADDRESS = 0x0016
const ATTR_RELAY_CREDENTIAL = 0x4000
const ATTR_SSRC_LIST = 0x4024

const STUN_MAGIC_COOKIE = 0x2112a442
const MAGIC_COOKIE_BYTES = new Uint8Array([0x21, 0x12, 0xa4, 0x42])

test('buildWhatsAppPing emits a 20-byte STUN-like packet', () => {
    const ping = buildWhatsAppPing()
    assert.equal(ping.length, 20)
    assert.equal(isStunPacket(ping), true)
    const info = parseStunResponse(ping)
    assert.equal(info?.method, 'wa-ping')
})

test('isRtcpPacket distinguishes RTCP from RTP and malformed packets', () => {
    const rtcp = new Uint8Array(8)
    rtcp[0] = 0x80
    rtcp[1] = 206
    const rtp = new Uint8Array(12)
    rtp[0] = 0x80
    rtp[1] = 97
    const wrongVersion = new Uint8Array(8)
    wrongVersion[0] = 0x40
    wrongVersion[1] = 200
    assert.equal(isRtcpPacket(rtcp), true)
    assert.equal(isRtcpPacket(rtp), false)
    assert.equal(isRtcpPacket(new Uint8Array(7)), false)
    assert.equal(isRtcpPacket(wrongVersion), false)
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

/**
 * A connection does the opposite, and on purpose: it mints one id through
 * `createStunTransactionId` and stamps it on every STUN message it sends,
 * header and IPv6 XOR key alike, because the official client copies a fixed
 * 12-byte field off the connection object instead of generating one per
 * message. That stability is the parity decision confirmed in RE, not an
 * oversight. What this test pins down is the fallback for a message built
 * outside any connection, where a one-off id is all there is.
 */
test('a ping built outside a connection gets a one-off transaction id', () => {
    const first = buildWhatsAppPing()
    const firstTid = [...first.subarray(8, 20)]
    const seen = new Set<string>([bytesToHex(first.subarray(8, 20))])

    for (let i = 0; i < 200; i++) {
        seen.add(bytesToHex(buildWhatsAppPing().subarray(8, 20)))
    }

    assert.equal(seen.size, 201)
    assert.deepEqual([...first.subarray(8, 20)], firstTid)
})

test('buildAllocateForRelay authenticates with the raw relay token, not a USERNAME', () => {
    const rawToken = new Uint8Array([0x00, 0xff, 0x7f, 0x80, 0x01])
    const hmacKey = TEXT_ENCODER.encode('relay-key')
    const ssrcList = buildSSRCSubscriptionList([0x11223344], [0x55667788], 1, 2)

    const packet = buildAllocateForRelay(rawToken, ssrcList, hmacKey, '192.0.2.10', 3478)
    const info = parseStunResponse(packet)

    assert.ok(info)
    assert.equal(info.method, 'allocate')
    assert.equal(info.stunClass, 'request')

    const types = info.attributes.map((attr) => attr.type)
    assert.ok(types.includes(ATTR_RELAY_CREDENTIAL))
    assert.ok(types.includes(ATTR_MESSAGE_INTEGRITY))
    assert.ok(types.includes(ATTR_SSRC_LIST))
    assert.equal(types.includes(ATTR_USERNAME), false)
    assert.ok(types.indexOf(ATTR_RELAY_CREDENTIAL) < types.indexOf(ATTR_MESSAGE_INTEGRITY))

    const credential = info.attributes.find((attr) => attr.type === ATTR_RELAY_CREDENTIAL)
    assert.deepEqual([...(credential?.data ?? [])], [...rawToken])
})

test('buildAllocateForRelay omits the TURN allocation attributes', () => {
    const packet = buildAllocateForRelay(
        new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
        buildSSRCSubscriptionList([1], [], 1, 2),
        TEXT_ENCODER.encode('key')
    )
    const info = parseStunResponse(packet)

    assert.equal(
        info?.attributes.some((attr) => attr.type === 0x0019 || attr.type === 0x000d),
        false
    )
})

function relayedAddressAttribute(ip: string, port: number) {
    const packet = buildAllocateForRelay(
        new Uint8Array([0x0a, 0x0b, 0x0c, 0x0d]),
        buildSSRCSubscriptionList([0x01020304], [], 1, 2),
        TEXT_ENCODER.encode('relay-key'),
        ip,
        port
    )
    const info = parseStunResponse(packet)
    assert.ok(info)
    return {
        transactionId: packet.subarray(8, 20),
        attribute: info.attributes.find((attr) => attr.type === ATTR_XOR_RELAYED_ADDRESS)
    }
}

/**
 * The IPv6 half of the mask is not the header transaction id as it was sent: it
 * is that id with the bytes of each 32-bit word reversed, which is the byte
 * order the relay reads the key in.
 */
function xorMask(family: number, transactionId: Uint8Array): Uint8Array {
    const mask = new Uint8Array(family === 0x01 ? 4 : 16)
    mask.set(MAGIC_COOKIE_BYTES, 0)
    if (family !== 0x01) {
        for (let word = 0; word < transactionId.length; word += 4) {
            for (let i = 0; i < 4; i++) mask[4 + word + i] = transactionId[word + 3 - i]
        }
    }
    return mask
}

function unmaskRelayedAddress(data: Uint8Array, transactionId: Uint8Array): Uint8Array {
    const mask = xorMask(data[1], transactionId)
    const address = new Uint8Array(mask.length)
    for (let i = 0; i < mask.length; i++) address[i] = data[4 + i] ^ mask[i]
    return address
}

test('XOR-RELAYED-ADDRESS keeps the IPv4 encoding byte-identical', () => {
    const { attribute } = relayedAddressAttribute('192.0.2.10', 3478)
    assert.ok(attribute)
    assert.deepEqual([...attribute.data], [0x00, 0x01, 0x2c, 0x84, 0xe1, 0x12, 0xa6, 0x48])

    for (const [ip, port] of [
        ['192.0.2.10', 3478],
        ['198.51.100.7', 3480],
        ['0.0.0.0', 1],
        ['255.255.255.255', 65535]
    ] as [string, number][]) {
        const legacy = new Uint8Array(8)
        legacy[0] = 0x00
        legacy[1] = 0x01
        const maskedPort = port ^ (STUN_MAGIC_COOKIE >>> 16)
        legacy[2] = (maskedPort >>> 8) & 0xff
        legacy[3] = maskedPort & 0xff
        const parts = ip.split('.').map(Number)
        const ipNum = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
        const masked = (ipNum ^ STUN_MAGIC_COOKIE) >>> 0
        legacy[4] = (masked >>> 24) & 0xff
        legacy[5] = (masked >>> 16) & 0xff
        legacy[6] = (masked >>> 8) & 0xff
        legacy[7] = masked & 0xff

        const { attribute: current } = relayedAddressAttribute(ip, port)
        assert.ok(current)
        assert.deepEqual([...current.data], [...legacy])
    }
})

test('XOR-RELAYED-ADDRESS masks IPv6 with the cookie and the relay-ordered transaction id', () => {
    const { attribute, transactionId } = relayedAddressAttribute(
        '2a03:2880:f234:1c:face:b00c:0:1',
        3480
    )
    assert.ok(attribute)
    assert.equal(attribute.length, 20)
    assert.equal(attribute.data[0], 0x00)
    assert.equal(attribute.data[1], 0x02)

    const address = new Uint8Array([
        0x2a, 0x03, 0x28, 0x80, 0xf2, 0x34, 0x00, 0x1c, 0xfa, 0xce, 0xb0, 0x0c, 0x00, 0x00, 0x00,
        0x01
    ])
    const expected = new Uint8Array(20)
    expected[1] = 0x02
    const maskedPort = 3480 ^ (STUN_MAGIC_COOKIE >>> 16)
    expected[2] = (maskedPort >>> 8) & 0xff
    expected[3] = maskedPort & 0xff
    const mask = xorMask(0x02, transactionId)
    for (let i = 0; i < 16; i++) expected[4 + i] = address[i] ^ mask[i]

    assert.deepEqual([...attribute.data], [...expected])
})

test('XOR-RELAYED-ADDRESS re-masks IPv6 per request while the address stays the same', () => {
    const first = relayedAddressAttribute('2a03:2880::177', 3480)
    const second = relayedAddressAttribute('2a03:2880::177', 3480)
    assert.ok(first.attribute)
    assert.ok(second.attribute)

    assert.notDeepEqual([...first.transactionId], [...second.transactionId])
    assert.notDeepEqual(
        [...first.attribute.data.subarray(8)],
        [...second.attribute.data.subarray(8)]
    )
    assert.deepEqual(
        [...unmaskRelayedAddress(first.attribute.data, first.transactionId)],
        [...unmaskRelayedAddress(second.attribute.data, second.transactionId)]
    )
})

test('XOR-RELAYED-ADDRESS masks the port with the cookie high half in both families', () => {
    for (const ip of ['198.51.100.7', '2a03:2880::177']) {
        for (const port of [1, 3478, 3480, 65535]) {
            const { attribute } = relayedAddressAttribute(ip, port)
            assert.ok(attribute)
            assert.equal(((attribute.data[2] << 8) | attribute.data[3]) ^ 0x2112, port)
        }
    }
})

test('XOR-RELAYED-ADDRESS expands compressed, mixed and full IPv6 text forms', () => {
    const cases: [string, number[]][] = [
        ['2a03:2880::177', [0x2a, 0x03, 0x28, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0x77]],
        ['::1', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01]],
        ['::', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
        ['2001:db8::', [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
        ['::ffff:1.2.3.4', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0x01, 0x02, 0x03, 0x04]],
        [
            '0:0:0:0:0:ffff:1.2.3.4',
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0x01, 0x02, 0x03, 0x04]
        ],
        [
            '1:2:3:4:5:6:7:8',
            [0, 0x01, 0, 0x02, 0, 0x03, 0, 0x04, 0, 0x05, 0, 0x06, 0, 0x07, 0, 0x08]
        ],
        ['2A03:2880::177', [0x2a, 0x03, 0x28, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0x77]],
        ['fe80::1%eth0', [0xfe, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01]]
    ]

    for (const [ip, expected] of cases) {
        const { attribute, transactionId } = relayedAddressAttribute(ip, 3480)
        assert.ok(attribute, `missing attribute for ${ip}`)
        assert.equal(attribute.data.length, 20, ip)
        assert.equal(attribute.data[1], 0x02, ip)
        assert.deepEqual([...unmaskRelayedAddress(attribute.data, transactionId)], expected, ip)
    }
})

test('XOR-RELAYED-ADDRESS is omitted instead of announcing a wrong address', () => {
    const rejected = [
        'not-an-ip',
        '1.2.3',
        '1.2.3.4.5',
        '999.1.1.1',
        '1:::2',
        '1:2:3:4:5:6:7:8:9',
        '12345::1',
        'gggg::1',
        '2a03:',
        ':1234::5',
        '::ffff:1.2.3'
    ]

    for (const ip of rejected) {
        const { attribute } = relayedAddressAttribute(ip, 3480)
        assert.equal(attribute, undefined, ip)
    }
})
