import { createHmac, randomBytes } from 'node:crypto'

import { bytesToHex, concatBytes, intToBytes, TEXT_DECODER } from 'zapo-js/util'

const STUN_MAGIC_COOKIE = 0x2112a442
const STUN_FINGERPRINT_XOR = 0x5354554e

const STUN_BINDING_REQUEST = 0x0001
const STUN_ALLOCATE_REQUEST = 0x0003
const WHATSAPP_PING = 0x0801

const ATTR_USERNAME = 0x0006
const ATTR_MESSAGE_INTEGRITY = 0x0008
const ATTR_LIFETIME = 0x000d
const ATTR_XOR_RELAYED_ADDRESS = 0x0016
const ATTR_REQUESTED_TRANSPORT = 0x0019
const ATTR_PRIORITY = 0x0024
const ATTR_SENDER_SUBSCRIPTIONS = 0x4000
const ATTR_SSRC_LIST = 0x4024
const ATTR_ICE_CONTROLLED = 0x8029
const ATTR_ICE_CONTROLLING = 0x802a
const ATTR_FINGERPRINT = 0x8028

const DEFAULT_ICE_PRIORITY = 16_777_215

function generateTransactionId(): Uint8Array {
    const id = new Uint8Array(12)
    for (let i = 0; i < 12; i++) {
        id[i] = Math.floor(Math.random() * 256)
    }
    return id
}

function encodeAttribute(attrType: number, data: Uint8Array): Uint8Array {
    const padding = (4 - (data.length % 4)) % 4
    return concatBytes([
        intToBytes(2, attrType),
        intToBytes(2, data.length),
        data,
        new Uint8Array(padding)
    ])
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

function buildStunHeader(msgType: number, length: number, transactionId: Uint8Array): Uint8Array {
    return concatBytes([
        intToBytes(2, msgType),
        intToBytes(2, length),
        intToBytes(4, STUN_MAGIC_COOKIE),
        transactionId
    ])
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
        const hmacHeader = buildStunHeader(msgType, attrsData.length + 24, transactionId)
        const hmacInput = concatBytes([hmacHeader, attrsData])
        const hmac = createHmac('sha1', integrityKey).update(hmacInput).digest()
        const miAttr = encodeAttribute(ATTR_MESSAGE_INTEGRITY, hmac)
        attrsData = concatBytes([attrsData, miAttr])
    }

    if (includeFingerprint) {
        const crcHeader = buildStunHeader(msgType, attrsData.length + 8, transactionId)
        const crcInput = concatBytes([crcHeader, attrsData])
        const fingerprint = (crc32(crcInput) ^ STUN_FINGERPRINT_XOR) >>> 0
        const fpAttr = encodeAttribute(ATTR_FINGERPRINT, intToBytes(4, fingerprint))
        attrsData = concatBytes([attrsData, fpAttr])
    }

    const header = buildStunHeader(msgType, attrsData.length, transactionId)
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
    return concatBytes([encodeVarint((fieldNumber << 3) | 0), encodeVarint(value)])
}

function encodeProtobufLengthDelimited(fieldNumber: number, data: Uint8Array): Uint8Array {
    return concatBytes([encodeVarint((fieldNumber << 3) | 2), encodeVarint(data.length), data])
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

function encodeXorRelayedAddress(ip: string, port: number): Uint8Array {
    const parts = ip.split('.').map(Number)
    const ipNum = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
    return concatBytes([
        new Uint8Array([0x00, 0x01]),
        intToBytes(2, (port ^ (STUN_MAGIC_COOKIE >>> 16)) & 0xffff),
        intToBytes(4, (ipNum ^ STUN_MAGIC_COOKIE) >>> 0)
    ])
}

export function buildAllocateForRelay(
    senderSubscriptions: Uint8Array,
    ssrcList: Uint8Array,
    hmacKey: Uint8Array,
    relayIp?: string,
    relayPort?: number
): Uint8Array {
    const transactionId = generateTransactionId()
    const parts: Uint8Array[] = []

    parts.push(encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions))
    parts.push(encodeAttribute(ATTR_SSRC_LIST, ssrcList))

    if (relayIp && relayPort) {
        parts.push(
            encodeAttribute(ATTR_XOR_RELAYED_ADDRESS, encodeXorRelayedAddress(relayIp, relayPort))
        )
    }

    const attrs = concatBytes(parts)

    return buildStunMessage(STUN_ALLOCATE_REQUEST, attrs, transactionId, hmacKey, false)
}

export function buildBindingRequest(
    username: Uint8Array,
    hmacKey: Uint8Array | undefined,
    senderSubscriptions?: Uint8Array,
    includeIceControllingOrOptions:
        | boolean
        | {
              iceRole?: 'none' | 'controlling' | 'controlled'
              includePriority?: boolean
              includeUsername?: boolean
          } = true
): Uint8Array {
    const options: {
        iceRole?: 'none' | 'controlling' | 'controlled'
        includePriority?: boolean
        includeUsername?: boolean
    } =
        typeof includeIceControllingOrOptions === 'boolean'
            ? { iceRole: includeIceControllingOrOptions ? 'controlling' : 'none' }
            : (includeIceControllingOrOptions ?? {})
    const iceRole = options.iceRole ?? 'controlling'
    const includePriority = options.includePriority ?? true
    const includeUsername = options.includeUsername ?? true
    const transactionId = generateTransactionId()

    const usernameAttr = includeUsername ? encodeAttribute(ATTR_USERNAME, username) : undefined

    const priorityAttr = includePriority
        ? encodeAttribute(ATTR_PRIORITY, intToBytes(4, DEFAULT_ICE_PRIORITY))
        : undefined

    const parts: Uint8Array[] = []
    if (usernameAttr) parts.push(usernameAttr)
    if (priorityAttr) parts.push(priorityAttr)

    if (iceRole === 'controlling' || iceRole === 'controlled') {
        const tieBreaker = new Uint8Array(8)
        for (let i = 0; i < 8; i++) {
            tieBreaker[i] = Math.floor(Math.random() * 256)
        }
        const attrType = iceRole === 'controlled' ? ATTR_ICE_CONTROLLED : ATTR_ICE_CONTROLLING
        parts.push(encodeAttribute(attrType, tieBreaker))
    }

    if (senderSubscriptions && senderSubscriptions.length > 0) {
        parts.push(encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions))
    }

    const attrs = concatBytes(parts)

    return buildStunMessage(STUN_BINDING_REQUEST, attrs, transactionId, hmacKey, true)
}

export function buildBindingRequestWithSubs(
    username: Uint8Array | undefined,
    hmacKey: Uint8Array | undefined,
    senderSubscriptions: Uint8Array | undefined,
    includeIceControlling: boolean,
    includeFingerprint: boolean
): Uint8Array {
    const transactionId = generateTransactionId()
    const parts: Uint8Array[] = []

    if (username && username.length > 0) {
        parts.push(encodeAttribute(ATTR_USERNAME, username))
    }

    parts.push(encodeAttribute(ATTR_PRIORITY, intToBytes(4, DEFAULT_ICE_PRIORITY)))

    if (includeIceControlling) {
        parts.push(encodeAttribute(ATTR_ICE_CONTROLLING, randomBytes(8)))
    }

    if (senderSubscriptions && senderSubscriptions.length > 0) {
        parts.push(encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions))
    }

    const attrs = concatBytes(parts)

    return buildStunMessage(STUN_BINDING_REQUEST, attrs, transactionId, hmacKey, includeFingerprint)
}

export function buildMinimalBindingWithSubs(
    senderSubscriptions: Uint8Array,
    includeFingerprint = false
): Uint8Array {
    const transactionId = generateTransactionId()
    const attrs = encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions)
    return buildStunMessage(
        STUN_BINDING_REQUEST,
        attrs,
        transactionId,
        undefined,
        includeFingerprint
    )
}

export function buildMinimalAllocateWithSubs(
    senderSubscriptions: Uint8Array,
    includeFingerprint = false
): Uint8Array {
    const transactionId = generateTransactionId()
    const attrs = encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions)
    return buildStunMessage(
        STUN_ALLOCATE_REQUEST,
        attrs,
        transactionId,
        undefined,
        includeFingerprint
    )
}

export function buildAllocateRequest(
    username: Uint8Array,
    hmacKey: Uint8Array,
    lifetime = 3600
): Uint8Array {
    const transactionId = generateTransactionId()
    const parts: Uint8Array[] = []

    parts.push(encodeAttribute(ATTR_REQUESTED_TRANSPORT, new Uint8Array([17, 0, 0, 0])))
    parts.push(encodeAttribute(ATTR_USERNAME, username))
    parts.push(encodeAttribute(ATTR_LIFETIME, intToBytes(4, lifetime)))

    const attrs = concatBytes(parts)

    return buildStunMessage(STUN_ALLOCATE_REQUEST, attrs, transactionId, hmacKey, true)
}

export function buildWhatsAppPing(): Uint8Array {
    return buildStunHeader(WHATSAPP_PING, 0, generateTransactionId())
}

export function isStunPacket(data: Uint8Array): boolean {
    if (data.length < 2) return false
    return (data[0] & 0xc0) === 0
}

export function isRtpPacket(data: Uint8Array): boolean {
    if (data.length < 2) return false
    return (data[0] & 0xc0) === 0x80
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
    0x4000: 'SENDER-SUBSCRIPTIONS',
    0x4001: 'RECEIVER-SUBSCRIPTION',
    0x4002: 'SUBSCRIPTION-ACK',
    0x8022: 'SOFTWARE',
    0x8028: 'FINGERPRINT',
    0x8029: 'ICE-CONTROLLED',
    0x802a: 'ICE-CONTROLLING',
    0x4033: 'STABLE-ROUTING-CONN-ID'
}

export function parseStunResponse(data: Uint8Array): StunResponseInfo | null {
    if (data.length < 20) return null

    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)

    const cookie = dv.getUint32(4, false)
    if (cookie !== STUN_MAGIC_COOKIE) {
        const msgType = dv.getUint16(0, false)
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

    const rawType = dv.getUint16(0, false)
    const msgLength = dv.getUint16(2, false)
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
        const attrType = dv.getUint16(offset, false)
        const attrLength = dv.getUint16(offset + 2, false)
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
            stableRoutingConnId = dv.getBigUint64(offset + 4, false)
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
