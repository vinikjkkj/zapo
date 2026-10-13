import {
    bytesToHex,
    concatBytes,
    readUInt16BE,
    readUInt32BE,
    TEXT_DECODER,
    writeUInt16BE,
    writeUInt32BE
} from '../bytes.js'
import type { WaMediaCrypto } from '../crypto/primitives.js'
import { randomBytes } from '../crypto/random.js'

import {
    IPV4_ADDRESS_BYTES,
    IPV6_ADDRESS_BYTES,
    writeIpv4Address,
    writeIpv6Address
} from './ip-address.js'
import { isWarpFramedPacket, warpFrameHeaderLength } from './warp-frame.js'

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
 * On an allocate, the relay credential: the raw `<relay>` token, never a `USERNAME`. Binding
 * requests carry `buildSenderSubscriptions` in it instead.
 */
const ATTR_RELAY_CREDENTIAL = 0x4000
const ATTR_RX_SUBSCRIPTIONS = 0x4021
const ATTR_SSRC_LIST = 0x4024
const ATTR_ICE_CONTROLLING = 0x802a
const ATTR_FINGERPRINT = 0x8028

const DEFAULT_ICE_PRIORITY = 16_777_215

const TRANSACTION_ID_LENGTH = 12

/** The relay XOR key reads the transaction id as 32-bit words. */
const RELAY_KEY_WORD_BYTES = 4

const STUN_ADDRESS_FAMILY_IPV4 = 0x01
const STUN_ADDRESS_FAMILY_IPV6 = 0x02

/** Zero byte, family byte, XOR-masked port, XOR-masked address. */
const XOR_RELAYED_IPV4_BYTES = 4 + IPV4_ADDRESS_BYTES
const XOR_RELAYED_IPV6_BYTES = 4 + IPV6_ADDRESS_BYTES

/**
 * Creates the 12-byte transaction id of a relay connection: stable per connection, not per
 * message, as the official client does. It also keys the IPv6 `XOR-RELAYED-ADDRESS`.
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

/** The key a MESSAGE-INTEGRITY is computed with, and the HMAC it is computed by. */
interface StunIntegrity {
    readonly crypto: WaMediaCrypto
    readonly key: Uint8Array
}

function buildStunMessage(
    msgType: number,
    attrs: Uint8Array,
    transactionId: Uint8Array,
    integrity: StunIntegrity | null,
    includeFingerprint = true
): Uint8Array {
    let attrsData = attrs

    if (integrity) {
        const msgLenForHmac = attrsData.length + 24
        const hmacHeader = new Uint8Array(20)
        writeUInt16BE(hmacHeader, msgType, 0)
        writeUInt16BE(hmacHeader, msgLenForHmac, 2)
        writeUInt32BE(hmacHeader, STUN_MAGIC_COOKIE, 4)
        hmacHeader.set(transactionId, 8)

        const hmacInput = concatBytes([hmacHeader, attrsData])
        const hmac = integrity.crypto.hmacSha1(integrity.key, hmacInput)
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

/**
 * XORs, in place, the 12 bytes at `offset` with the IPv6 key: the transaction id read as three
 * 32-bit words, each byte-reversed. The header itself carries the id unswapped.
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
 * Encodes the relay's own endpoint as the `XOR-RELAYED-ADDRESS` it matches the allocate's socket
 * against. An address that does not parse yields no attribute: a wrong family is answered 452.
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
 * Builds the relay ALLOCATE, without which the relay forwards no media. It authenticates with the
 * raw token in 0x4000 and MESSAGE-INTEGRITY keyed with `hmacKey`; a `USERNAME` is answered 456.
 * `transactionId` is the connection's; `rxSubscriptions` goes between credential and SSRC list.
 */
export function buildAllocateForRelay(
    crypto: WaMediaCrypto,
    relayCredential: Uint8Array,
    ssrcList: Uint8Array,
    hmacKey: Uint8Array,
    relayIp?: string,
    relayPort?: number,
    transactionId: Uint8Array = createStunTransactionId(),
    rxSubscriptions?: Uint8Array | null
): Uint8Array {
    const parts: Uint8Array[] = []

    parts.push(encodeAttribute(ATTR_RELAY_CREDENTIAL, relayCredential))
    if (rxSubscriptions && rxSubscriptions.length > 0) {
        parts.push(encodeAttribute(ATTR_RX_SUBSCRIPTIONS, rxSubscriptions))
    }
    parts.push(encodeAttribute(ATTR_SSRC_LIST, ssrcList))

    if (relayIp && relayPort) {
        const xorRelayedAddress = encodeXorRelayedAddress(relayIp, relayPort, transactionId)
        if (xorRelayedAddress) {
            parts.push(encodeAttribute(ATTR_XOR_RELAYED_ADDRESS, xorRelayedAddress))
        }
    }

    const attrs = concatBytes(parts)

    return buildStunMessage(
        STUN_ALLOCATE_REQUEST,
        attrs,
        transactionId,
        { crypto, key: hmacKey },
        false
    )
}

/**
 * Builds an ICE binding request: `username` is `remote-ufrag:local-ufrag`, `hmacKey` the ice-pwd,
 * and `senderSubscriptions` rides in 0x4000. `transactionId` is the connection's.
 */
export function buildBindingRequestWithSubs(
    crypto: WaMediaCrypto,
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

    return buildStunMessage(
        STUN_BINDING_REQUEST,
        attrs,
        transactionId,
        hmacKey ? { crypto, key: hmacKey } : null,
        includeFingerprint
    )
}

/** Builds the bare 0x0801 keepalive the relay answers with a 0x0802 pong. */
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

/**
 * Whether a datagram is STUN control. Decided by the magic cookie, or the cookieless ping and
 * pong types; a WARP frame shares STUN's clear high bits and is never STUN, whatever its bytes.
 */
export function isStunPacket(data: Uint8Array): boolean {
    if (data.length < 2) return false
    if ((data[0] & 0xc0) !== 0) return false
    if (isWarpFramedPacket(data)) return false
    const type = readUInt16BE(data, 0)
    if (type === WHATSAPP_PING || type === WHATSAPP_PONG) return true
    return data.length >= 8 && readUInt32BE(data, 4) === STUN_MAGIC_COOKIE
}

/** Whether a datagram is the relay's 0x0802 pong, as {@link parseStunResponse} reads one. */
export function isWaPong(data: Uint8Array): boolean {
    return data.length >= 20 && readUInt16BE(data, 0) === WHATSAPP_PONG
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

    if (isWarpFramedPacket(data)) {
        return `WARP frame hdr=${warpFrameHeaderLength(data)} (${data.length}B)`
    }

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
