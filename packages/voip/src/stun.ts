import { createHmac, randomBytes } from 'node:crypto'

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

function generateTransactionId(): Buffer {
    const id = Buffer.alloc(12)
    for (let i = 0; i < 12; i++) {
        id[i] = Math.floor(Math.random() * 256)
    }
    return id
}

function encodeAttribute(attrType: number, data: Buffer): Buffer {
    const header = Buffer.alloc(4)
    header.writeUInt16BE(attrType, 0)
    header.writeUInt16BE(data.length, 2)

    const padding = (4 - (data.length % 4)) % 4
    const pad = Buffer.alloc(padding)

    return Buffer.concat([header, data, pad])
}

function crc32(data: Buffer): number {
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
    attrs: Buffer,
    transactionId: Buffer,
    integrityKey?: Buffer,
    includeFingerprint = true
): Buffer {
    let attrsData = attrs

    if (integrityKey) {
        const msgLenForHmac = attrsData.length + 24
        const hmacHeader = Buffer.alloc(20)
        hmacHeader.writeUInt16BE(msgType, 0)
        hmacHeader.writeUInt16BE(msgLenForHmac, 2)
        hmacHeader.writeUInt32BE(STUN_MAGIC_COOKIE, 4)
        transactionId.copy(hmacHeader, 8)

        const hmacInput = Buffer.concat([hmacHeader, attrsData])
        const hmac = createHmac('sha1', integrityKey).update(hmacInput).digest()
        const miAttr = encodeAttribute(ATTR_MESSAGE_INTEGRITY, hmac)
        attrsData = Buffer.concat([attrsData, miAttr])
    }

    if (includeFingerprint) {
        const msgLenForCrc = attrsData.length + 8
        const crcHeader = Buffer.alloc(20)
        crcHeader.writeUInt16BE(msgType, 0)
        crcHeader.writeUInt16BE(msgLenForCrc, 2)
        crcHeader.writeUInt32BE(STUN_MAGIC_COOKIE, 4)
        transactionId.copy(crcHeader, 8)

        const crcInput = Buffer.concat([crcHeader, attrsData])
        const fingerprint = (crc32(crcInput) ^ STUN_FINGERPRINT_XOR) >>> 0
        const fpBuf = Buffer.alloc(4)
        fpBuf.writeUInt32BE(fingerprint, 0)
        const fpAttr = encodeAttribute(ATTR_FINGERPRINT, fpBuf)
        attrsData = Buffer.concat([attrsData, fpAttr])
    }

    const header = Buffer.alloc(20)
    header.writeUInt16BE(msgType, 0)
    header.writeUInt16BE(attrsData.length, 2)
    header.writeUInt32BE(STUN_MAGIC_COOKIE, 4)
    transactionId.copy(header, 8)

    return Buffer.concat([header, attrsData])
}

function encodeVarint(value: number): Buffer {
    const bytes: number[] = []
    let v = value >>> 0
    while (v > 0x7f) {
        bytes.push((v & 0x7f) | 0x80)
        v >>>= 7
    }
    bytes.push(v & 0x7f)
    return Buffer.from(bytes)
}

function encodeProtobufVarintField(fieldNumber: number, value: number): Buffer {
    const tag = encodeVarint((fieldNumber << 3) | 0)
    const val = encodeVarint(value)
    return Buffer.concat([tag, val])
}

function encodeProtobufLengthDelimited(fieldNumber: number, data: Buffer): Buffer {
    const tag = encodeVarint((fieldNumber << 3) | 2)
    const len = encodeVarint(data.length)
    return Buffer.concat([tag, len, data])
}

export function buildSenderSubscriptions(ssrc: number): Buffer {
    const inner = Buffer.concat([
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
): Buffer {
    const entries: Buffer[] = []

    for (const ssrc of selfSsrcs) {
        if (ssrc === 0) continue
        const inner = Buffer.concat([
            encodeProtobufVarintField(1, selfPid),
            encodeProtobufVarintField(2, 1),
            encodeProtobufVarintField(3, ssrc)
        ])
        entries.push(encodeProtobufLengthDelimited(1, inner))
    }

    for (const peerSsrc of peerSsrcs) {
        if (peerSsrc === 0) continue
        const inner = Buffer.concat([
            encodeProtobufVarintField(1, peerPid),
            encodeProtobufVarintField(2, 1),
            encodeProtobufVarintField(3, peerSsrc)
        ])
        entries.push(encodeProtobufLengthDelimited(1, inner))
    }

    return Buffer.concat(entries)
}

function encodeXorRelayedAddress(ip: string, port: number): Buffer {
    const data = Buffer.alloc(8)
    data[0] = 0x00
    data[1] = 0x01
    data.writeUInt16BE(port ^ (STUN_MAGIC_COOKIE >>> 16), 2)
    const parts = ip.split('.').map(Number)
    const ipNum = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
    data.writeUInt32BE((ipNum ^ STUN_MAGIC_COOKIE) >>> 0, 4)
    return data
}

export function buildAllocateForRelay(
    senderSubscriptions: Buffer,
    ssrcList: Buffer,
    hmacKey: Buffer,
    relayIp?: string,
    relayPort?: number
): Buffer {
    const transactionId = generateTransactionId()
    const parts: Buffer[] = []

    parts.push(encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions))

    parts.push(encodeAttribute(ATTR_SSRC_LIST, ssrcList))

    if (relayIp && relayPort) {
        parts.push(
            encodeAttribute(ATTR_XOR_RELAYED_ADDRESS, encodeXorRelayedAddress(relayIp, relayPort))
        )
    }

    const attrs = Buffer.concat(parts)

    return buildStunMessage(STUN_ALLOCATE_REQUEST, attrs, transactionId, hmacKey, false)
}

export function buildBindingRequest(
    username: Buffer,
    hmacKey: Buffer | undefined,
    senderSubscriptions?: Buffer,
    includeIceControllingOrOptions:
        | boolean
        | {
              iceRole?: 'none' | 'controlling' | 'controlled'
              includePriority?: boolean
              includeUsername?: boolean
          } = true
): Buffer {
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
        ? (() => {
              const priorityBuf = Buffer.alloc(4)
              priorityBuf.writeUInt32BE(DEFAULT_ICE_PRIORITY, 0)
              return encodeAttribute(ATTR_PRIORITY, priorityBuf)
          })()
        : undefined

    const parts = []
    if (usernameAttr) parts.push(usernameAttr)
    if (priorityAttr) parts.push(priorityAttr)

    if (iceRole === 'controlling' || iceRole === 'controlled') {
        const tieBreaker = Buffer.alloc(8)
        for (let i = 0; i < 8; i++) {
            tieBreaker[i] = Math.floor(Math.random() * 256)
        }
        const attrType = iceRole === 'controlled' ? ATTR_ICE_CONTROLLED : ATTR_ICE_CONTROLLING
        parts.push(encodeAttribute(attrType, tieBreaker))
    }

    if (senderSubscriptions && senderSubscriptions.length > 0) {
        parts.push(encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions))
    }

    const attrs = Buffer.concat(parts)

    return buildStunMessage(STUN_BINDING_REQUEST, attrs, transactionId, hmacKey, true)
}

export function buildBindingRequestWithSubs(
    username: Buffer | undefined,
    hmacKey: Buffer | undefined,
    senderSubscriptions: Buffer | undefined,
    includeIceControlling: boolean,
    includeFingerprint: boolean
): Buffer {
    const transactionId = generateTransactionId()
    const parts: Buffer[] = []

    if (username && username.length > 0) {
        parts.push(encodeAttribute(ATTR_USERNAME, username))
    }

    const priorityBuf = Buffer.alloc(4)
    priorityBuf.writeUInt32BE(DEFAULT_ICE_PRIORITY, 0)
    parts.push(encodeAttribute(ATTR_PRIORITY, priorityBuf))

    if (includeIceControlling) {
        const tieBreaker = randomBytes(8)
        parts.push(encodeAttribute(ATTR_ICE_CONTROLLING, tieBreaker))
    }

    if (senderSubscriptions && senderSubscriptions.length > 0) {
        parts.push(encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions))
    }

    const attrs = Buffer.concat(parts)

    return buildStunMessage(STUN_BINDING_REQUEST, attrs, transactionId, hmacKey, includeFingerprint)
}

export function buildMinimalBindingWithSubs(
    senderSubscriptions: Buffer,
    includeFingerprint = false
): Buffer {
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
    senderSubscriptions: Buffer,
    includeFingerprint = false
): Buffer {
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

export function buildAllocateRequest(username: Buffer, hmacKey: Buffer, lifetime = 3600): Buffer {
    const transactionId = generateTransactionId()
    const parts: Buffer[] = []

    parts.push(encodeAttribute(ATTR_REQUESTED_TRANSPORT, Buffer.from([17, 0, 0, 0])))

    parts.push(encodeAttribute(ATTR_USERNAME, username))

    const lifetimeBuf = Buffer.alloc(4)
    lifetimeBuf.writeUInt32BE(lifetime, 0)
    parts.push(encodeAttribute(ATTR_LIFETIME, lifetimeBuf))

    const attrs = Buffer.concat(parts)

    return buildStunMessage(STUN_ALLOCATE_REQUEST, attrs, transactionId, hmacKey, true)
}

export function buildWhatsAppPing(): Buffer {
    const transactionId = generateTransactionId()
    const header = Buffer.alloc(20)
    header.writeUInt16BE(WHATSAPP_PING, 0)
    header.writeUInt16BE(0, 2)
    header.writeUInt32BE(STUN_MAGIC_COOKIE, 4)
    transactionId.copy(header, 8)
    return header
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
    data: Buffer
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

    const buf = Buffer.from(data)

    const cookie = buf.readUInt32BE(4)
    if (cookie !== STUN_MAGIC_COOKIE) {
        const msgType = buf.readUInt16BE(0)
        if (msgType === 0x0801 || msgType === 0x0802) {
            return {
                rawType: msgType,
                method: msgType === 0x0801 ? 'wa-ping' : 'wa-pong',
                stunClass: 'indication',
                isSuccess: false,
                isError: false,
                transactionId: buf.subarray(8, 20).toString('hex'),
                length: data.length,
                attributes: []
            }
        }
        return null
    }

    const rawType = buf.readUInt16BE(0)
    const msgLength = buf.readUInt16BE(2)
    const transactionId = buf.subarray(8, 20).toString('hex')

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
        const attrType = buf.readUInt16BE(offset)
        const attrLength = buf.readUInt16BE(offset + 2)
        const attrEnd = offset + 4 + attrLength

        if (attrEnd > data.length) break

        const attrData = buf.subarray(offset + 4, attrEnd)
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
                errorReason = attrData.subarray(4).toString('utf-8')
            }
        }

        if (attrType === 0x4033 && stunClass === 'success' && attrLength === 8) {
            stableRoutingConnId = attrData.readBigUInt64BE(0)
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
