import { readUInt32BE, writeUInt32BE } from '../bytes.js'
import { setBoundedMapEntry } from '../collections.js'
import { RtpHeader, RtpPacket } from '../media/rtp.js'
import { SRTP_AUTH_TAG_LEN, SRTP_LABEL, type SrtpKeyingMaterial } from '../types.js'

import type { WaMediaCrypto } from './primitives.js'

/**
 * Default upper bound on the number of per-SSRC receive contexts an {@link SrtpSession}
 * or {@link SrtcpSession} keeps at once. Past this bound, the oldest tracked
 * SSRC is evicted to admit a new one. Each session counts on its own and can be
 * resized with `setMaxRecvContexts`.
 */
export const SRTP_MAX_RECV_CONTEXTS = 32

/**
 * SRTCP authentication tag length in bytes. WhatsApp truncates the RTP tag to 4
 * bytes but keeps the full HMAC-SHA1_80 tag on RTCP: a 4-byte tag here makes the
 * peer drop every control packet we emit, key-frame requests included.
 */
export const SRTCP_AUTH_TAG_LEN = 10

const SRTCP_HEADER_LEN = 8
const SRTCP_INDEX_LEN = 4
const SRTCP_ENCRYPTED_FLAG = 0x80000000
const SRTCP_INDEX_MASK = 0x7fffffff

const SRTCP_LABEL = {
    ENCRYPTION: 0x03,
    AUTH: 0x04,
    SALT: 0x05
} as const

const REPLAY_WINDOW = 64

/** RFC 3711 sliding replay window over the 64 indices below the highest, as two 32-bit words. */
export class ReplayWindow {
    private initialized = false
    private highest = 0
    /** Offsets 0-31 below `highest`. */
    private low = 0
    /** Offsets 32-63 below `highest`. */
    private high = 0

    has(index: number): boolean {
        if (!this.initialized || index > this.highest) {
            return false
        }
        const offset = this.highest - index
        if (offset >= REPLAY_WINDOW) {
            return true
        }
        return offset < 32
            ? (this.low & (1 << offset)) !== 0
            : (this.high & (1 << (offset - 32))) !== 0
    }

    /** Records an authenticated `index`; returns whether it became the highest. */
    add(index: number): boolean {
        if (this.initialized && index <= this.highest) {
            const offset = this.highest - index
            if (offset < 32) this.low |= 1 << offset
            else if (offset < REPLAY_WINDOW) this.high |= 1 << (offset - 32)
            return false
        }
        const shift = this.initialized ? index - this.highest : REPLAY_WINDOW
        if (shift >= REPLAY_WINDOW) {
            this.high = 0
            this.low = 1
        } else if (shift >= 32) {
            this.high = this.low << (shift - 32)
            this.low = 1
        } else {
            this.high = (this.high << shift) | (this.low >>> (32 - shift))
            this.low = (this.low << shift) | 1
        }
        this.highest = index
        this.initialized = true
        return true
    }
}

interface SessionKeys {
    readonly cipherKey: Uint8Array
    readonly authKey: Uint8Array
    /** The 14-byte session salt zero-padded to a 16-byte IV. */
    readonly ivTemplate: Uint8Array
}

interface SessionLabels {
    readonly ENCRYPTION: number
    readonly AUTH: number
    readonly SALT: number
}

const srtpKeyCache = new WeakMap<SrtpKeyingMaterial, SessionKeys>()
const srtcpKeyCache = new WeakMap<SrtpKeyingMaterial, SessionKeys>()

/** Derives the session keys once per keying object, so each new SSRC context reuses them. */
function sessionKeys(
    crypto: WaMediaCrypto,
    keying: SrtpKeyingMaterial,
    labels: SessionLabels,
    cache: WeakMap<SrtpKeyingMaterial, SessionKeys>
): SessionKeys {
    const cached = cache.get(keying)
    if (cached) return cached
    const { masterKey, masterSalt } = keying
    const ivTemplate = new Uint8Array(16)
    ivTemplate.set(deriveSrtpSessionKey(crypto, masterKey, masterSalt, labels.SALT, 14))
    const keys: SessionKeys = {
        cipherKey: deriveSrtpSessionKey(crypto, masterKey, masterSalt, labels.ENCRYPTION, 16),
        authKey: deriveSrtpSessionKey(crypto, masterKey, masterSalt, labels.AUTH, 20),
        ivTemplate
    }
    cache.set(keying, keys)
    return keys
}

/** Writes salt XOR SSRC (bytes 4-7) into `iv`; the caller XORs the index in. */
function saltedIv(iv: Uint8Array, template: Uint8Array, ssrc: number): Uint8Array {
    iv.set(template)
    iv[4] ^= ssrc >>> 24
    iv[5] ^= (ssrc >>> 16) & 0xff
    iv[6] ^= (ssrc >>> 8) & 0xff
    iv[7] ^= ssrc & 0xff
    return iv
}

export class SrtpContext {
    private readonly crypto: WaMediaCrypto
    private readonly keys: SessionKeys
    private readonly authTagLen: number
    private readonly replay = new ReplayWindow()
    private roc = 0
    private lastSeq = 0
    private initialized = false

    private readonly ivBuffer: Uint8Array = new Uint8Array(16)
    private readonly rocBuffer: Uint8Array = new Uint8Array(4)

    constructor(crypto: WaMediaCrypto, keying: SrtpKeyingMaterial, authTagLen?: number) {
        this.crypto = crypto
        this.authTagLen = authTagLen ?? SRTP_AUTH_TAG_LEN
        this.keys = sessionKeys(crypto, keying, SRTP_LABEL, srtpKeyCache)
    }

    protect(packet: RtpPacket): Uint8Array {
        const seq = packet.header.sequenceNumber
        this.updateRoc(seq)

        const headerSize = packet.header.size()
        const output = new Uint8Array(headerSize + packet.payload.length + this.authTagLen)

        packet.header.encode(output)

        const iv = this.generateIv(packet.header.ssrc, this.roc, seq)
        const encrypted = this.crypto.aesCtr128(this.keys.cipherKey, iv, packet.payload)

        output.set(encrypted, headerSize)

        if (this.authTagLen > 0) {
            const authData = output.subarray(0, headerSize + packet.payload.length)
            const tag = this.computeAuthTag(authData, this.roc, this.authTagLen)
            output.set(tag, headerSize + packet.payload.length)
        }

        return output
    }

    /**
     * Verifies and decrypts `data`; `null` for a replayed or duplicate packet.
     * @throws {SrtpError} `packet_too_short` or `auth_failed`
     */
    unprotect(data: Uint8Array): RtpPacket | null {
        if (data.length < 12) {
            throw new SrtpError('packet_too_short', `Packet too short: ${data.length} bytes`)
        }

        const header = RtpHeader.decode(data)
        const headerSize = header.size()
        const payloadLen = data.length - headerSize - this.authTagLen

        if (payloadLen <= 0) {
            throw new SrtpError(
                'packet_too_short',
                `No payload: ${data.length}B total, ${headerSize}B header, auth=${this.authTagLen}`
            )
        }

        const seq = header.sequenceNumber
        const estimatedRoc = this.estimateRoc(seq)
        const index = estimatedRoc * 0x10000 + seq

        if (this.replay.has(index)) {
            return null
        }

        if (this.authTagLen > 0) {
            const authStart = headerSize + payloadLen
            const authData = data.subarray(0, authStart)
            const expected = this.computeAuthTag(authData, estimatedRoc, this.authTagLen)
            const received = data.subarray(authStart, authStart + this.authTagLen)
            if (!this.crypto.timingSafeEqual(expected, received)) {
                throw new SrtpError('auth_failed', 'SRTP auth tag verification failed')
            }
        }

        const iv = this.generateIv(header.ssrc, estimatedRoc, seq)
        const decrypted = this.crypto.aesCtr128(
            this.keys.cipherKey,
            iv,
            data.subarray(headerSize, headerSize + payloadLen)
        )

        if (this.replay.add(index)) {
            this.roc = estimatedRoc
            this.lastSeq = seq
            this.initialized = true
        }

        return new RtpPacket(header, decrypted)
    }

    private updateRoc(seq: number): void {
        if (!this.initialized) {
            this.lastSeq = seq
            this.initialized = true
            return
        }

        const diff = seq - this.lastSeq

        if (diff < -32768) {
            this.roc = (this.roc + 1) >>> 0
        }

        this.lastSeq = seq
    }

    private estimateRoc(seq: number): number {
        if (!this.initialized) {
            return this.roc
        }
        if (this.lastSeq < 32768) {
            return seq - this.lastSeq > 32768 ? (this.roc - 1) >>> 0 : this.roc
        }
        return this.lastSeq - seq > 32768 ? (this.roc + 1) >>> 0 : this.roc
    }

    /** RFC 3711 4.1.1: salt XOR SSRC XOR the 48-bit index `roc || seq`. */
    private generateIv(ssrc: number, roc: number, seq: number): Uint8Array {
        const iv = saltedIv(this.ivBuffer, this.keys.ivTemplate, ssrc)
        iv[8] ^= roc >>> 24
        iv[9] ^= (roc >>> 16) & 0xff
        iv[10] ^= (roc >>> 8) & 0xff
        iv[11] ^= roc & 0xff
        iv[12] ^= seq >>> 8
        iv[13] ^= seq & 0xff
        return iv
    }

    private computeAuthTag(data: Uint8Array, roc: number, tagLen: number): Uint8Array {
        writeUInt32BE(this.rocBuffer, roc, 0)
        const result = this.crypto.hmacSha1(this.keys.authKey, data, this.rocBuffer)
        return result.subarray(0, tagLen)
    }
}

export class SrtpSession {
    private readonly crypto: WaMediaCrypto
    private readonly sendKey: SrtpKeyingMaterial
    private readonly recvKey: SrtpKeyingMaterial
    private readonly sendAuthLen?: number
    private readonly recvAuthLen?: number
    private readonly sendContexts = new Map<number, SrtpContext>()
    private readonly recvContexts = new Map<number, SrtpContext>()
    /** The material each entry of `recvContexts` was built from, under the same key. */
    private readonly recvKeyings = new Map<number, SrtpKeyingMaterial>()
    private maxRecv = SRTP_MAX_RECV_CONTEXTS

    constructor(
        crypto: WaMediaCrypto,
        sendKey: SrtpKeyingMaterial,
        recvKey: SrtpKeyingMaterial,
        sendAuthLen?: number,
        recvAuthLen?: number
    ) {
        this.crypto = crypto
        this.sendKey = sendKey
        this.recvKey = recvKey
        this.sendAuthLen = sendAuthLen
        this.recvAuthLen = recvAuthLen
    }

    protect(packet: RtpPacket): Uint8Array {
        let ctx = this.sendContexts.get(packet.header.ssrc)
        if (!ctx) {
            ctx = new SrtpContext(this.crypto, this.sendKey, this.sendAuthLen)
            this.sendContexts.set(packet.header.ssrc, ctx)
        }
        return ctx.protect(packet)
    }

    /**
     * Verifies and decrypts `data` in the context of its SSRC; `null` for a replayed or
     * duplicate packet. A new SSRC is admitted only once it authenticates.
     * @throws {SrtpError} `packet_too_short` or `auth_failed`
     */
    unprotect(data: Uint8Array): RtpPacket | null {
        if (data.length < 12) {
            throw new SrtpError('packet_too_short', `Packet too short: ${data.length} bytes`)
        }
        const ssrc = readUInt32BE(data, 8)
        let ctx = this.recvContexts.get(ssrc)
        if (!ctx) {
            ctx = new SrtpContext(this.crypto, this.recvKey, this.recvAuthLen)
            const packet = ctx.unprotect(data)
            this.admitRecvContext(ssrc, ctx, this.recvKey)
            return packet
        }
        return ctx.unprotect(data)
    }

    /**
     * Keys the receive context of `ssrc` with `keying` instead of the session's own receive key.
     * The same material again keeps the context, its ROC and replay window; other material
     * replaces it. Returns whether a new context was installed.
     */
    setRecvKeying(ssrc: number, keying: SrtpKeyingMaterial): boolean {
        const ctx = this.recvContexts.get(ssrc)
        const held = this.recvKeyings.get(ssrc)
        if (ctx && held && sameKeying(held, keying)) {
            this.admitRecvContext(ssrc, ctx, held)
            return false
        }
        this.admitRecvContext(ssrc, new SrtpContext(this.crypto, keying, this.recvAuthLen), keying)
        return true
    }

    /** Drops the receive context of `ssrc`; a later packet on it is keyed lazily again. */
    deleteRecvContext(ssrc: number): boolean {
        this.recvKeyings.delete(ssrc)
        return this.recvContexts.delete(ssrc)
    }

    get recvContextCount(): number {
        return this.recvContexts.size
    }

    get maxRecvContexts(): number {
        return this.maxRecv
    }

    /** Resizes the receive-context bound; shrinking evicts the oldest contexts past it. */
    setMaxRecvContexts(max: number): void {
        this.maxRecv = checkMaxRecvContexts(max)
        trimBoundedContexts(this.recvContexts, this.recvKeyings, this.maxRecv)
    }

    private admitRecvContext(ssrc: number, ctx: SrtpContext, keying: SrtpKeyingMaterial): void {
        this.recvKeyings.set(ssrc, keying)
        setBoundedMapEntry(this.recvContexts, ssrc, ctx, this.maxRecv, (evicted) =>
            this.recvKeyings.delete(evicted)
        )
    }
}

export class SrtcpContext {
    private readonly crypto: WaMediaCrypto
    private readonly keys: SessionKeys
    private readonly authTagLen: number
    private readonly replay = new ReplayWindow()
    private index = 0

    private readonly ivBuffer: Uint8Array = new Uint8Array(16)

    constructor(
        crypto: WaMediaCrypto,
        keying: SrtpKeyingMaterial,
        authTagLen = SRTCP_AUTH_TAG_LEN
    ) {
        this.crypto = crypto
        this.keys = sessionKeys(crypto, keying, SRTCP_LABEL, srtcpKeyCache)
        this.authTagLen = authTagLen
    }

    protect(rtcp: Uint8Array, senderSsrc: number): Uint8Array {
        const current = this.index++ & SRTCP_INDEX_MASK
        const clearLen = Math.min(SRTCP_HEADER_LEN, rtcp.length)
        const payload = rtcp.subarray(clearLen)

        const iv = this.generateIv(senderSsrc, current)
        const encrypted = this.crypto.aesCtr128(this.keys.cipherKey, iv, payload)

        const indexOffset = clearLen + encrypted.length
        const output = new Uint8Array(indexOffset + SRTCP_INDEX_LEN + this.authTagLen)
        output.set(rtcp.subarray(0, clearLen), 0)
        output.set(encrypted, clearLen)
        writeUInt32BE(output, (SRTCP_ENCRYPTED_FLAG | current) >>> 0, indexOffset)

        if (this.authTagLen > 0) {
            const authenticated = output.subarray(0, indexOffset + SRTCP_INDEX_LEN)
            const tag = this.crypto
                .hmacSha1(this.keys.authKey, authenticated)
                .subarray(0, this.authTagLen)
            output.set(tag, authenticated.length)
        }

        return output
    }

    /**
     * Verifies the tag and returns the RTCP packet in the clear; `null` for a replayed or
     * duplicate packet, judged on the 31-bit SRTCP index.
     * @throws {SrtpError} `packet_too_short` or `auth_failed`
     */
    unprotect(data: Uint8Array): Uint8Array | null {
        const minLength = SRTCP_HEADER_LEN + SRTCP_INDEX_LEN + this.authTagLen
        if (data.length < minLength) {
            throw new SrtpError(
                'packet_too_short',
                `SRTCP packet too short: ${data.length}B total, ${minLength}B minimum`
            )
        }

        const authEnd = data.length - this.authTagLen
        if (this.authTagLen > 0) {
            const authenticated = data.subarray(0, authEnd)
            const expected = this.crypto
                .hmacSha1(this.keys.authKey, authenticated)
                .subarray(0, this.authTagLen)
            if (!this.crypto.timingSafeEqual(expected, data.subarray(authEnd))) {
                throw new SrtpError('auth_failed', 'SRTCP auth tag verification failed')
            }
        }

        const indexOffset = authEnd - SRTCP_INDEX_LEN
        const indexWord = readUInt32BE(data, indexOffset)
        const index = indexWord & SRTCP_INDEX_MASK

        if (this.replay.has(index)) {
            return null
        }

        if ((indexWord & SRTCP_ENCRYPTED_FLAG) === 0) {
            this.replay.add(index)
            return data.subarray(0, indexOffset)
        }

        const iv = this.generateIv(readUInt32BE(data, 4), index)
        const decrypted = this.crypto.aesCtr128(
            this.keys.cipherKey,
            iv,
            data.subarray(SRTCP_HEADER_LEN, indexOffset)
        )

        this.replay.add(index)

        const output = new Uint8Array(SRTCP_HEADER_LEN + decrypted.length)
        output.set(data.subarray(0, SRTCP_HEADER_LEN), 0)
        output.set(decrypted, SRTCP_HEADER_LEN)
        return output
    }

    private generateIv(ssrc: number, index: number): Uint8Array {
        const iv = saltedIv(this.ivBuffer, this.keys.ivTemplate, ssrc)
        iv[10] ^= index >>> 24
        iv[11] ^= (index >>> 16) & 0xff
        iv[12] ^= (index >>> 8) & 0xff
        iv[13] ^= index & 0xff
        return iv
    }
}

/**
 * Dispatches incoming SRTCP to one {@link SrtcpContext} per sender SSRC (bytes 4-7): each of
 * the peer's streams runs its own SRTCP index, so each needs its own replay window.
 */
export class SrtcpSession {
    private readonly crypto: WaMediaCrypto
    private readonly keying: SrtpKeyingMaterial
    private readonly authTagLen: number
    private readonly contexts = new Map<number, SrtcpContext>()
    /** The material each entry of `contexts` was built from, under the same key. */
    private readonly keyings = new Map<number, SrtpKeyingMaterial>()
    private maxRecv = SRTP_MAX_RECV_CONTEXTS

    constructor(
        crypto: WaMediaCrypto,
        keying: SrtpKeyingMaterial,
        authTagLen = SRTCP_AUTH_TAG_LEN
    ) {
        this.crypto = crypto
        this.keying = keying
        this.authTagLen = authTagLen
    }

    /**
     * Verifies and decrypts an incoming SRTCP packet; `null` for a replayed or duplicate one.
     * A new SSRC is cached only once it authenticates, so a forged one cannot evict a stream.
     * @throws {SrtpError} `packet_too_short` or `auth_failed`
     */
    unprotect(data: Uint8Array): Uint8Array | null {
        if (data.length < SRTCP_HEADER_LEN) {
            throw new SrtpError(
                'packet_too_short',
                `SRTCP packet too short: ${data.length}B total, ${SRTCP_HEADER_LEN}B minimum`
            )
        }

        const ssrc = readUInt32BE(data, 4)
        let ctx = this.contexts.get(ssrc)
        if (!ctx) {
            ctx = new SrtcpContext(this.crypto, this.keying, this.authTagLen)
            const packet = ctx.unprotect(data)
            this.admitContext(ssrc, ctx, this.keying)
            return packet
        }
        return ctx.unprotect(data)
    }

    /**
     * Keys the context of sender `ssrc` with `keying` instead of the session's own. The same
     * material again keeps the context and its replay window; other material replaces it.
     * Returns whether a new context was installed.
     */
    setRecvKeying(ssrc: number, keying: SrtpKeyingMaterial): boolean {
        const ctx = this.contexts.get(ssrc)
        const held = this.keyings.get(ssrc)
        if (ctx && held && sameKeying(held, keying)) {
            this.admitContext(ssrc, ctx, held)
            return false
        }
        this.admitContext(ssrc, new SrtcpContext(this.crypto, keying, this.authTagLen), keying)
        return true
    }

    /** Drops the context of sender `ssrc`; a later packet on it is keyed lazily again. */
    deleteRecvContext(ssrc: number): boolean {
        this.keyings.delete(ssrc)
        return this.contexts.delete(ssrc)
    }

    get recvContextCount(): number {
        return this.contexts.size
    }

    get maxRecvContexts(): number {
        return this.maxRecv
    }

    /** Resizes the context bound; shrinking evicts the oldest contexts past it. */
    setMaxRecvContexts(max: number): void {
        this.maxRecv = checkMaxRecvContexts(max)
        trimBoundedContexts(this.contexts, this.keyings, this.maxRecv)
    }

    private admitContext(ssrc: number, ctx: SrtcpContext, keying: SrtpKeyingMaterial): void {
        this.keyings.set(ssrc, keying)
        setBoundedMapEntry(this.contexts, ssrc, ctx, this.maxRecv, (evicted) =>
            this.keyings.delete(evicted)
        )
    }
}

function sameKeying(a: SrtpKeyingMaterial, b: SrtpKeyingMaterial): boolean {
    return a === b || (sameBytes(a.masterKey, b.masterKey) && sameBytes(a.masterSalt, b.masterSalt))
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

function checkMaxRecvContexts(max: number): number {
    if (!Number.isInteger(max) || max < 1) {
        throw new RangeError(`max receive contexts must be a positive integer, got ${max}`)
    }
    return max
}

function trimBoundedContexts<C>(
    contexts: Map<number, C>,
    keyings: Map<number, SrtpKeyingMaterial>,
    max: number
): void {
    for (const ssrc of contexts.keys()) {
        if (contexts.size <= max) return
        contexts.delete(ssrc)
        keyings.delete(ssrc)
    }
}

/** RFC 3711 key derivation with a key derivation rate of zero. */
export function deriveSrtpSessionKey(
    crypto: WaMediaCrypto,
    masterKey: Uint8Array,
    masterSalt: Uint8Array,
    label: number,
    length: number
): Uint8Array {
    const iv = new Uint8Array(16)
    iv.set(masterSalt.subarray(0, 14), 0)
    iv[7] ^= label

    const zeros = new Uint8Array(length)
    return crypto.aesCtr128(masterKey, iv, zeros)
}

export class SrtpError extends Error {
    type: 'packet_too_short' | 'auth_failed'

    constructor(type: SrtpError['type'], message: string) {
        super(message)
        this.type = type
        this.name = 'SrtpError'
    }
}
