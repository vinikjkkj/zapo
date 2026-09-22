import { bytesToHex } from 'zapo-js/util'

import {
    concatBytes,
    readBigUInt64BE,
    readUInt16BE,
    readUInt32BE,
    TEXT_DECODER,
    writeUInt16BE,
    writeUInt32BE
} from '../bytes.js'
import { hmacSha1, randomBytes } from '../crypto/primitives.js'

const STUN_MAGIC_COOKIE = 0x2112a442
const STUN_FINGERPRINT_XOR = 0x5354554e

const STUN_BINDING_REQUEST = 0x0001
const STUN_ALLOCATE_REQUEST = 0x0003
const WHATSAPP_PING = 0x0801
const WHATSAPP_PONG = 0x0802

const ATTR_USERNAME = 0x0006
const ATTR_MESSAGE_INTEGRITY = 0x0008
const ATTR_XOR_RELAYED_ADDRESS = 0x0016
const ATTR_PRIORITY = 0x0024

/**
 * The relay credential: the `<relay>` token, raw bytes, not text.
 *
 * It is not a subscription attribute despite the `SENDER-SUBSCRIPTIONS` label
 * that circulated for it. The real subscription attributes are
 * `SENDER-SUBSCRIPTIONS` (0x4025) and `RECEIVER-SUBSCRIPTION` (0x4021), neither
 * of which this file emits. Treating 0x4000 as a droppable subscription blob
 * and replacing it with a `USERNAME` cost every allocate on the wire.
 */
const ATTR_RELAY_CREDENTIAL = 0x4000
const ATTR_SSRC_LIST = 0x4024
const ATTR_ICE_CONTROLLING = 0x802a
const ATTR_FINGERPRINT = 0x8028

const DEFAULT_ICE_PRIORITY = 16_777_215

const TRANSACTION_ID_LENGTH = 12

/** The relay XOR key reads the transaction id as 32-bit words. */
const RELAY_KEY_WORD_BYTES = 4

const STUN_ADDRESS_FAMILY_IPV4 = 0x01
const STUN_ADDRESS_FAMILY_IPV6 = 0x02

const IPV4_ADDRESS_BYTES = 4
const IPV6_ADDRESS_BYTES = 16

/** Zero byte, family byte, XOR-masked port, XOR-masked address. */
const XOR_RELAYED_IPV4_BYTES = 4 + IPV4_ADDRESS_BYTES
const XOR_RELAYED_IPV6_BYTES = 4 + IPV6_ADDRESS_BYTES

/**
 * Creates the 12-byte transaction id of a relay connection.
 *
 * The id is stable per connection, not per message. This is a parity decision,
 * not an oversight: reverse engineering the official client shows that the STUN
 * message init routine generates no id at all, it only copies a 12-byte field
 * off the connection object into the header at +8, and every builder reads that
 * same source. Since the XOR key of the IPv6 `XOR-RELAYED-ADDRESS` derives from
 * the id sitting in the header, the id that masks the address is always that
 * connection id.
 *
 * Where the official client derives the value from is still unknown: the write
 * site sits in connection init and does not show up in the dumps. What is
 * implemented here is the simplest hypothesis, that the relay demands
 * consistency and nothing more. If the IPv6 legs keep answering 452 after this
 * change, the conclusion is that the relay demands a value derived from
 * something it knows as well, and stability on its own is not enough.
 */
export function createStunTransactionId(): Uint8Array {
    return randomBytes(TRANSACTION_ID_LENGTH)
}

function encodeAttribute(attrType: number, data: Uint8Array): Uint8Array {
    const header = new Uint8Array(4)
    writeUInt16BE(header, attrType, 0)
    writeUInt16BE(header, data.length, 2)

    const padding = (4 - (data.length % 4)) % 4
    const pad = new Uint8Array(padding)

    return concatBytes([header, data, pad])
}

function crc32(data: Uint8Array): number {
    let crc = 0xffffffff
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i]
        for (let j = 0; j < 8; j++) {
            if (crc & 1) {
                crc = (crc >>> 1) ^ 0xedb88320
            } else {
                crc >>>= 1
            }
        }
    }
    return (crc ^ 0xffffffff) >>> 0
}

function buildStunMessage(
    msgType: number,
    attrs: Uint8Array,
    transactionId: Uint8Array,
    integrityKey?: Uint8Array,
    includeFingerprint = true
): Uint8Array {
    let attrsData = attrs

    if (integrityKey) {
        const msgLenForHmac = attrsData.length + 24
        const hmacHeader = new Uint8Array(20)
        writeUInt16BE(hmacHeader, msgType, 0)
        writeUInt16BE(hmacHeader, msgLenForHmac, 2)
        writeUInt32BE(hmacHeader, STUN_MAGIC_COOKIE, 4)
        hmacHeader.set(transactionId, 8)

        const hmacInput = concatBytes([hmacHeader, attrsData])
        const hmac = hmacSha1(integrityKey, hmacInput)
        const miAttr = encodeAttribute(ATTR_MESSAGE_INTEGRITY, hmac)
        attrsData = concatBytes([attrsData, miAttr])
    }

    if (includeFingerprint) {
        const msgLenForCrc = attrsData.length + 8
        const crcHeader = new Uint8Array(20)
        writeUInt16BE(crcHeader, msgType, 0)
        writeUInt16BE(crcHeader, msgLenForCrc, 2)
        writeUInt32BE(crcHeader, STUN_MAGIC_COOKIE, 4)
        crcHeader.set(transactionId, 8)

        const crcInput = concatBytes([crcHeader, attrsData])
        const fingerprint = (crc32(crcInput) ^ STUN_FINGERPRINT_XOR) >>> 0
        const fpBuf = new Uint8Array(4)
        writeUInt32BE(fpBuf, fingerprint, 0)
        const fpAttr = encodeAttribute(ATTR_FINGERPRINT, fpBuf)
        attrsData = concatBytes([attrsData, fpAttr])
    }

    const header = new Uint8Array(20)
    writeUInt16BE(header, msgType, 0)
    writeUInt16BE(header, attrsData.length, 2)
    writeUInt32BE(header, STUN_MAGIC_COOKIE, 4)
    header.set(transactionId, 8)

    return concatBytes([header, attrsData])
}

function encodeVarint(value: number): Uint8Array {
    const bytes: number[] = []
    let v = value >>> 0
    while (v > 0x7f) {
        bytes.push((v & 0x7f) | 0x80)
        v >>>= 7
    }
    bytes.push(v & 0x7f)
    return new Uint8Array(bytes)
}

function encodeProtobufVarintField(fieldNumber: number, value: number): Uint8Array {
    const tag = encodeVarint((fieldNumber << 3) | 0)
    const val = encodeVarint(value)
    return concatBytes([tag, val])
}

function encodeProtobufLengthDelimited(fieldNumber: number, data: Uint8Array): Uint8Array {
    const tag = encodeVarint((fieldNumber << 3) | 2)
    const len = encodeVarint(data.length)
    return concatBytes([tag, len, data])
}

export function buildSenderSubscriptions(ssrc: number): Uint8Array {
    const inner = concatBytes([
        encodeProtobufVarintField(3, ssrc),
        encodeProtobufVarintField(5, 0),
        encodeProtobufVarintField(6, 0)
    ])

    return encodeProtobufLengthDelimited(1, inner)
}

export function buildSSRCSubscriptionList(
    selfSsrcs: number[],
    peerSsrcs: number[],
    selfPid: number,
    peerPid: number
): Uint8Array {
    const entries: Uint8Array[] = []

    for (const ssrc of selfSsrcs) {
        if (ssrc === 0) continue
        const inner = concatBytes([
            encodeProtobufVarintField(1, selfPid),
            encodeProtobufVarintField(2, 1),
            encodeProtobufVarintField(3, ssrc)
        ])
        entries.push(encodeProtobufLengthDelimited(1, inner))
    }

    for (const peerSsrc of peerSsrcs) {
        if (peerSsrc === 0) continue
        const inner = concatBytes([
            encodeProtobufVarintField(1, peerPid),
            encodeProtobufVarintField(2, 1),
            encodeProtobufVarintField(3, peerSsrc)
        ])
        entries.push(encodeProtobufLengthDelimited(1, inner))
    }

    return concatBytes(entries)
}

const CHAR_ZERO = 0x30
const CHAR_NINE = 0x39
const CHAR_UPPER_A = 0x41
const CHAR_UPPER_F = 0x46
const CHAR_LOWER_A = 0x61
const CHAR_LOWER_F = 0x66
const CHAR_DOT = 0x2e
const CHAR_COLON = 0x3a
const CHAR_PERCENT = 0x25

function hexDigit(code: number): number {
    if (code >= CHAR_ZERO && code <= CHAR_NINE) return code - CHAR_ZERO
    if (code >= CHAR_LOWER_A && code <= CHAR_LOWER_F) return code - CHAR_LOWER_A + 10
    if (code >= CHAR_UPPER_A && code <= CHAR_UPPER_F) return code - CHAR_UPPER_A + 10
    return -1
}

/** Writes the four dotted-decimal octets of `text[start, end)` into `out` at `offset`. */
function writeIpv4Address(
    text: string,
    start: number,
    end: number,
    out: Uint8Array,
    offset: number
): boolean {
    let octets = 0
    let value = 0
    let digits = 0

    for (let i = start; i <= end; i++) {
        const code = i < end ? text.charCodeAt(i) : CHAR_DOT

        if (code === CHAR_DOT) {
            if (digits === 0 || digits > 3 || value > 0xff || octets === IPV4_ADDRESS_BYTES) {
                return false
            }
            out[offset + octets] = value
            octets++
            value = 0
            digits = 0
            continue
        }

        if (code < CHAR_ZERO || code > CHAR_NINE) return false
        value = value * 10 + (code - CHAR_ZERO)
        digits++
    }

    return octets === IPV4_ADDRESS_BYTES
}

/**
 * Writes the 16 address bytes of an RFC 4291 textual IPv6 address into `out` at
 * `offset`, covering the compressed `::` run anywhere in the address and the
 * mixed `::ffff:1.2.3.4` tail.
 *
 * Groups are written front to back and the `::` run is closed at the end by
 * sliding everything after it against the tail of the field, so the only
 * allocation is the caller's exact-size attribute buffer.
 */
function writeIpv6Address(text: string, out: Uint8Array, offset: number): boolean {
    let end = text.length
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === CHAR_PERCENT) {
            end = i
            break
        }
    }

    let hexEnd = end
    let v4Start = -1
    for (let i = 0; i < end; i++) {
        if (text.charCodeAt(i) === CHAR_DOT) {
            v4Start = text.lastIndexOf(':', i) + 1
            if (v4Start === 0) return false
            hexEnd = v4Start
            break
        }
    }

    let written = 0
    let gapAt = -1
    let value = 0
    let digits = 0
    let i = 0

    if (end > 0 && text.charCodeAt(0) === CHAR_COLON) {
        if (end < 2 || text.charCodeAt(1) !== CHAR_COLON) return false
        gapAt = 0
        i = 2
    }

    for (; i < hexEnd; i++) {
        const code = text.charCodeAt(i)

        if (code === CHAR_COLON) {
            if (digits === 0 || written + 2 > IPV6_ADDRESS_BYTES) return false
            out[offset + written] = value >>> 8
            out[offset + written + 1] = value & 0xff
            written += 2
            value = 0
            digits = 0

            if (i + 1 < hexEnd && text.charCodeAt(i + 1) === CHAR_COLON) {
                if (gapAt >= 0) return false
                gapAt = written
                i++
                continue
            }

            if (v4Start < 0 && i + 1 === hexEnd) return false
            continue
        }

        const digit = hexDigit(code)
        if (digit < 0) return false
        value = (value << 4) | digit
        digits++
        if (digits > 4) return false
    }

    if (digits > 0) {
        if (written + 2 > IPV6_ADDRESS_BYTES) return false
        out[offset + written] = value >>> 8
        out[offset + written + 1] = value & 0xff
        written += 2
    }

    if (v4Start >= 0) {
        if (written + IPV4_ADDRESS_BYTES > IPV6_ADDRESS_BYTES) return false
        if (!writeIpv4Address(text, v4Start, end, out, offset + written)) return false
        written += IPV4_ADDRESS_BYTES
    }

    if (gapAt < 0) return written === IPV6_ADDRESS_BYTES

    if (written >= IPV6_ADDRESS_BYTES) return false
    const tail = written - gapAt
    const tailAt = IPV6_ADDRESS_BYTES - tail
    out.copyWithin(offset + tailAt, offset + gapAt, offset + written)
    out.fill(0, offset + gapAt, offset + tailAt)
    return true
}

/**
 * Applies, in place, the IPv6 address XOR key over the 12 bytes of `data` that
 * start at `offset`.
 *
 * The key is not the transaction id as it travels in the header: it is that
 * same id read as three 32-bit words, each one with its bytes reversed. The
 * order was recovered by algebra over two real connections, not deduced from
 * the RFC: the relay echoes back inside the 452 error the address it decoded,
 * and `decoded XOR actual XOR header_id` yields the key it in fact used. Both
 * samples match that order exactly; reversing the whole 12 bytes, or swapping
 * the bytes two at a time, fails on both. The reading is an endianness
 * divergence at a single point: one side treats the id as three host-order
 * uint32s, the other as bytes.
 *
 * The header still carries the id with no swap at all, and STUN responses echo
 * back exactly the value that was sent, so the only thing that diverges is the
 * key.
 *
 * The falsifiable prediction is the IPv6 legs moving from 452 to SUCCESS. If
 * they stay on 452, the pattern was a coincidence of the two samples and this
 * byte order has to be withdrawn.
 */
function xorWithRelayKeyByteOrder(
    data: Uint8Array,
    offset: number,
    transactionId: Uint8Array
): void {
    for (let word = 0; word < TRANSACTION_ID_LENGTH; word += RELAY_KEY_WORD_BYTES) {
        for (let i = 0; i < RELAY_KEY_WORD_BYTES; i++) {
            data[offset + word + i] ^= transactionId[word + RELAY_KEY_WORD_BYTES - 1 - i]
        }
    }
}

/**
 * Encodes the relay's own endpoint as the RFC 5389 `XOR-RELAYED-ADDRESS` the
 * relay matches against the socket the allocate arrived on. Both families share
 * the 0x0016 attribute type and differ only in the family byte and the XOR key:
 * IPv4 masks its 4 address bytes with the magic cookie, IPv6 masks its 16 with
 * the cookie followed by the transaction id of the message being built, in the
 * byte order the relay expects in the key (see `xorWithRelayKeyByteOrder`),
 * which is why the transaction id has to be threaded in from the header.
 *
 * Announcing the wrong family is worse than announcing nothing: an IPv6 relay
 * told `0.0.0.0` answers every allocate with a 452 mismatch and forwards no
 * media, so an address that does not parse yields no attribute at all.
 */
function encodeXorRelayedAddress(
    ip: string,
    port: number,
    transactionId: Uint8Array
): Uint8Array | undefined {
    const isIpv6 = ip.includes(':')
    const data = new Uint8Array(isIpv6 ? XOR_RELAYED_IPV6_BYTES : XOR_RELAYED_IPV4_BYTES)

    data[0] = 0x00
    data[1] = isIpv6 ? STUN_ADDRESS_FAMILY_IPV6 : STUN_ADDRESS_FAMILY_IPV4
    writeUInt16BE(data, port ^ (STUN_MAGIC_COOKIE >>> 16), 2)

    if (isIpv6) {
        if (!writeIpv6Address(ip, data, 4)) return undefined
    } else if (!writeIpv4Address(ip, 0, ip.length, data, 4)) {
        return undefined
    }

    for (let i = 0; i < 4; i++) {
        data[4 + i] ^= (STUN_MAGIC_COOKIE >>> (24 - i * 8)) & 0xff
    }

    if (isIpv6) {
        xorWithRelayKeyByteOrder(data, 8, transactionId)
    }

    return data
}

/**
 * Builds the relay ALLOCATE request, the handshake that opens the media
 * connection. It is not optional: without an allocate success the relay
 * forwards no RTP, and the `0x0801`/`0x0802` ping-pong is only keepalive on a
 * connection the allocate already created.
 *
 * Two distinct credential schemes meet on this socket, and they do not mix:
 *
 * - ICE connectivity checks authenticate with `USERNAME` (0x0006), holding
 *   `remote-ufrag:local-ufrag`, plus MESSAGE-INTEGRITY keyed with the ice-pwd.
 * - This allocate authenticates with the relay token, raw bytes, in
 *   `ATTR_RELAY_CREDENTIAL` (0x4000), plus MESSAGE-INTEGRITY keyed with the
 *   `<relay>` key. It carries no `USERNAME`.
 *
 * Sending the ICE scheme here, a text `USERNAME` in place of the raw token, is
 * answered with a 456 and drops every inbound media packet.
 *
 * `relayCredential` is `relayInfo.rawToken` and `hmacKey` the raw `<relay>` key
 * bytes. `transactionId` is the id of the connection this allocate belongs to,
 * and it lands both in the header and in the IPv6 XOR key; leaving it out is
 * only correct outside a connection, where a one-off id is all there is.
 */
export function buildAllocateForRelay(
    relayCredential: Uint8Array,
    ssrcList: Uint8Array,
    hmacKey: Uint8Array,
    relayIp?: string,
    relayPort?: number,
    transactionId: Uint8Array = createStunTransactionId()
): Uint8Array {
    const parts: Uint8Array[] = []

    parts.push(encodeAttribute(ATTR_RELAY_CREDENTIAL, relayCredential))
    parts.push(encodeAttribute(ATTR_SSRC_LIST, ssrcList))

    if (relayIp && relayPort) {
        const xorRelayedAddress = encodeXorRelayedAddress(relayIp, relayPort, transactionId)
        if (xorRelayedAddress) {
            parts.push(encodeAttribute(ATTR_XOR_RELAYED_ADDRESS, xorRelayedAddress))
        }
    }

    const attrs = concatBytes(parts)

    return buildStunMessage(STUN_ALLOCATE_REQUEST, attrs, transactionId, hmacKey, false)
}

/**
 * Builds an ICE connectivity-check binding request.
 *
 * This is the ICE credential path: `username` is `remote-ufrag:local-ufrag` and
 * `hmacKey` the ice-pwd, unlike the allocate above, which authenticates with
 * the raw relay token. `senderSubscriptions` rides in the 0x4000 attribute,
 * which the allocate uses for the relay credential; the shape validated against
 * a live relay puts the subscription protobuf there on binding requests, so it
 * stays that way.
 *
 * `transactionId` is the id of the connection this check belongs to; leaving it
 * out is only correct outside a connection, where a one-off id is all there is.
 */
export function buildBindingRequestWithSubs(
    username: Uint8Array | undefined,
    hmacKey: Uint8Array | undefined,
    senderSubscriptions: Uint8Array | undefined,
    includeIceControlling: boolean,
    includeFingerprint: boolean,
    transactionId: Uint8Array = createStunTransactionId()
): Uint8Array {
    const parts: Uint8Array[] = []

    if (username && username.length > 0) {
        parts.push(encodeAttribute(ATTR_USERNAME, username))
    }

    const priorityBuf = new Uint8Array(4)
    writeUInt32BE(priorityBuf, DEFAULT_ICE_PRIORITY, 0)
    parts.push(encodeAttribute(ATTR_PRIORITY, priorityBuf))

    if (includeIceControlling) {
        const tieBreaker = randomBytes(8)
        parts.push(encodeAttribute(ATTR_ICE_CONTROLLING, tieBreaker))
    }

    if (senderSubscriptions && senderSubscriptions.length > 0) {
        parts.push(encodeAttribute(ATTR_RELAY_CREDENTIAL, senderSubscriptions))
    }

    const attrs = concatBytes(parts)

    return buildStunMessage(STUN_BINDING_REQUEST, attrs, transactionId, hmacKey, includeFingerprint)
}

/**
 * Builds the bare 0x0801 keepalive the relay answers with a 0x0802 pong.
 *
 * `transactionId` is the id of the connection being kept alive; leaving it out
 * is only correct outside a connection, where a one-off id is all there is.
 */
export function buildWhatsAppPing(
    transactionId: Uint8Array = createStunTransactionId()
): Uint8Array {
    const header = new Uint8Array(20)
    writeUInt16BE(header, WHATSAPP_PING, 0)
    writeUInt16BE(header, 0, 2)
    writeUInt32BE(header, STUN_MAGIC_COOKIE, 4)
    header.set(transactionId, 8)
    return header
}

export function isStunPacket(data: Uint8Array): boolean {
    if (data.length < 2) return false
    if ((data[0] & 0xc0) !== 0) return false
    const type = readUInt16BE(data, 0)
    if (type === WHATSAPP_PING || type === WHATSAPP_PONG) return true
    return data.length >= 8 && readUInt32BE(data, 4) === STUN_MAGIC_COOKIE
}

export function isRtpPacket(data: Uint8Array): boolean {
    if (data.length < 2) return false
    return (data[0] & 0xc0) === 0x80
}

/** RTCP/SRTCP keeps the RTCP header clear, so it can be demultiplexed before SRTP. */
export function isRtcpPacket(data: Uint8Array): boolean {
    if (data.length < 8 || (data[0] & 0xc0) !== 0x80) return false
    return data[1] >= 192 && data[1] <= 223
}

export interface StunResponseInfo {
    rawType: number
    method: string
    stunClass: string
    isSuccess: boolean
    isError: boolean
    errorCode?: number
    errorReason?: string
    stableRoutingConnId?: bigint
    transactionId: string
    length: number
    attributes: StunAttribute[]
}

interface StunAttribute {
    type: number
    typeName: string
    length: number
    data: Uint8Array
}

const STUN_ATTR_NAMES: Record<number, string> = {
    0x0001: 'MAPPED-ADDRESS',
    0x0006: 'USERNAME',
    0x0008: 'MESSAGE-INTEGRITY',
    0x0009: 'ERROR-CODE',
    0x000a: 'UNKNOWN-ATTRIBUTES',
    0x0014: 'REALM',
    0x0015: 'NONCE',
    0x0019: 'REQUESTED-TRANSPORT',
    0x0020: 'XOR-MAPPED-ADDRESS',
    0x0024: 'PRIORITY',
    0x0025: 'USE-CANDIDATE',
    0x4000: 'RELAY-CREDENTIAL',
    0x4021: 'RECEIVER-SUBSCRIPTION',
    0x4025: 'SENDER-SUBSCRIPTIONS',
    0x8022: 'SOFTWARE',
    0x8028: 'FINGERPRINT',
    0x8029: 'ICE-CONTROLLED',
    0x802a: 'ICE-CONTROLLING',
    0x4033: 'STABLE-ROUTING-CONN-ID'
}

export function parseStunResponse(data: Uint8Array): StunResponseInfo | null {
    if (data.length < 20) return null

    const cookie = readUInt32BE(data, 4)
    if (cookie !== STUN_MAGIC_COOKIE) {
        const msgType = readUInt16BE(data, 0)
        if (msgType === 0x0801 || msgType === 0x0802) {
            return {
                rawType: msgType,
                method: msgType === 0x0801 ? 'wa-ping' : 'wa-pong',
                stunClass: 'indication',
                isSuccess: false,
                isError: false,
                transactionId: bytesToHex(data.subarray(8, 20)),
                length: data.length,
                attributes: []
            }
        }
        return null
    }

    const rawType = readUInt16BE(data, 0)
    const msgLength = readUInt16BE(data, 2)
    const transactionId = bytesToHex(data.subarray(8, 20))

    const c0 = (rawType >> 4) & 0x1
    const c1 = (rawType >> 8) & 0x1
    const stunClassNum = (c1 << 1) | c0
    const stunClass = ['request', 'indication', 'success', 'error'][stunClassNum] || 'unknown'

    const method_bits = ((rawType & 0x3e00) >> 2) | ((rawType & 0x00e0) >> 1) | (rawType & 0x000f)
    let method = 'unknown'
    switch (method_bits) {
        case 0x001:
            method = 'binding'
            break
        case 0x003:
            method = 'allocate'
            break
        case 0x004:
            method = 'refresh'
            break
        case 0x006:
            method = 'send'
            break
        case 0x007:
            method = 'data'
            break
        case 0x008:
            method = 'create-permission'
            break
        case 0x009:
            method = 'channel-bind'
            break
    }

    if (rawType === 0x0801) method = 'wa-ping'
    if (rawType === 0x0802) method = 'wa-pong'

    const attributes: StunAttribute[] = []
    let errorCode: number | undefined
    let errorReason: string | undefined
    let stableRoutingConnId: bigint | undefined
    let offset = 20

    while (offset + 4 <= 20 + msgLength && offset + 4 <= data.length) {
        const attrType = readUInt16BE(data, offset)
        const attrLength = readUInt16BE(data, offset + 2)
        const attrEnd = offset + 4 + attrLength

        if (attrEnd > data.length) break

        const attrData = data.subarray(offset + 4, attrEnd)
        attributes.push({
            type: attrType,
            typeName: STUN_ATTR_NAMES[attrType] || `0x${attrType.toString(16).padStart(4, '0')}`,
            length: attrLength,
            data: attrData
        })

        if (attrType === 0x0009 && attrLength >= 4) {
            const errorClass = attrData[2] & 0x07
            const errorNumber = attrData[3]
            errorCode = errorClass * 100 + errorNumber
            if (attrLength > 4) {
                errorReason = TEXT_DECODER.decode(attrData.subarray(4))
            }
        }

        if (attrType === 0x4033 && stunClass === 'success' && attrLength === 8) {
            stableRoutingConnId = readBigUInt64BE(attrData, 0)
        }

        offset = attrEnd + ((4 - (attrLength % 4)) % 4)
    }

    return {
        rawType,
        method,
        stunClass,
        isSuccess: stunClass === 'success',
        isError: stunClass === 'error',
        errorCode,
        errorReason,
        stableRoutingConnId,
        transactionId,
        length: data.length,
        attributes
    }
}

export function formatStunResponse(info: StunResponseInfo): string {
    let result = `STUN ${info.method} ${info.stunClass} (0x${info.rawType.toString(16).padStart(4, '0')}, ${info.length}B)`

    if (info.isError && info.errorCode) {
        result += ` ERROR ${info.errorCode}`
        if (info.errorReason) result += `: ${info.errorReason}`
    }

    if (info.attributes.length > 0) {
        const attrNames = info.attributes.map((a) => a.typeName).join(', ')
        result += ` [${attrNames}]`
    }

    return result
}

export function classifyPacket(data: Uint8Array): string {
    if (data.length < 2) return `tiny(${data.length}B)`

    const firstByte = data[0]
    const twoBits = (firstByte & 0xc0) >> 6

    if (twoBits === 0) {
        const info = parseStunResponse(data)
        if (info) return formatStunResponse(info)
        const msgType = (data[0] << 8) | data[1]
        return `STUN? 0x${msgType.toString(16)} (${data.length}B)`
    }

    if (twoBits === 2) {
        const pt = data[1] & 0x7f
        const marker = (data[1] >> 7) & 1
        const seq = data.length >= 4 ? (data[2] << 8) | data[3] : 0
        return `RTP/SRTP PT=${pt} M=${marker} seq=${seq} (${data.length}B)`
    }

    if (twoBits === 1) {
        return `DTLS? 0x${firstByte.toString(16)} (${data.length}B)`
    }

    return `unknown 0x${firstByte.toString(16)} (${data.length}B)`
}
