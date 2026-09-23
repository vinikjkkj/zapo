import { uint8TimingSafeEqual } from 'zapo-js/util'

import { readUInt32BE, writeBigUInt64BE, writeUInt32BE } from '../bytes.js'
import { RtpHeader, RtpPacket } from '../media/rtp.js'
import { SRTP_AUTH_TAG_LEN, SRTP_LABEL, type SrtpKeyingMaterial } from '../types.js'

import { aesCtr128, hmacSha1 } from './primitives.js'

const SRTP_REPLAY_WINDOW = 64n
const SRTP_INDEX_MASK = (1n << 64n) - 1n

/**
 * Upper bound on the number of per-SSRC receive contexts an {@link SrtpSession}
 * or {@link SrtcpSession} keeps at once. Past this bound, the oldest tracked
 * SSRC is evicted to admit a new one.
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

export class SrtpContext {
    private sessionKey: Uint8Array
    private sessionSalt: Uint8Array
    private authKey: Uint8Array
    private roc = 0
    private lastSeq = 0
    private initialized = false
    private highestIndex = 0n
    private replayMask = 0n
    private authTagLen: number

    private readonly ivBuffer: Uint8Array = new Uint8Array(16)
    private readonly ssrcBuffer: Uint8Array = new Uint8Array(4)
    private readonly indexBuffer: Uint8Array = new Uint8Array(8)
    private readonly rocBuffer: Uint8Array = new Uint8Array(4)

    constructor(keying: SrtpKeyingMaterial, authTagLen?: number) {
        this.authTagLen = authTagLen ?? SRTP_AUTH_TAG_LEN
        this.sessionKey = deriveKey(keying.masterKey, keying.masterSalt, SRTP_LABEL.ENCRYPTION, 16)
        this.authKey = deriveKey(keying.masterKey, keying.masterSalt, SRTP_LABEL.AUTH, 20)
        this.sessionSalt = deriveKey(keying.masterKey, keying.masterSalt, SRTP_LABEL.SALT, 14)
    }

    setAuthKeying(keying: SrtpKeyingMaterial): void {
        this.authKey = deriveKey(keying.masterKey, keying.masterSalt, SRTP_LABEL.AUTH, 20)
    }

    protect(packet: RtpPacket): Uint8Array {
        this.updateRoc(packet.header.sequenceNumber)
        const index = this.packetIndex(packet.header.sequenceNumber)

        const headerSize = packet.header.size()
        const output = new Uint8Array(headerSize + packet.payload.length + this.authTagLen)

        packet.header.encode(output)

        const iv = this.generateIv(packet.header.ssrc, index)
        const encrypted = aesCtr128(this.sessionKey, iv, packet.payload)

        output.set(encrypted, headerSize)

        if (this.authTagLen > 0) {
            const authData = output.subarray(0, headerSize + packet.payload.length)
            const tag = this.computeAuthTag(authData, this.roc, this.authTagLen)
            output.set(tag, headerSize + packet.payload.length)
        }

        return output
    }

    unprotect(data: Uint8Array): RtpPacket {
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
        const index = (BigInt(estimatedRoc) << 16n) | BigInt(seq)

        if (this.isReplayed(index)) {
            throw new SrtpError('replay', `SRTP replay detected: index ${index}`)
        }

        if (this.authTagLen > 0) {
            const authStart = headerSize + payloadLen
            const authData = data.subarray(0, authStart)
            const expected = this.computeAuthTag(authData, estimatedRoc, this.authTagLen)
            const received = data.subarray(authStart, authStart + this.authTagLen)
            if (!uint8TimingSafeEqual(expected, received)) {
                throw new SrtpError('auth_failed', 'SRTP auth tag verification failed')
            }
        }

        const iv = this.generateIv(header.ssrc, index)
        const decrypted = aesCtr128(
            this.sessionKey,
            iv,
            data.subarray(headerSize, headerSize + payloadLen)
        )

        this.advanceReplay(index, estimatedRoc, seq)

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

    private isReplayed(index: bigint): boolean {
        if (!this.initialized) {
            return false
        }
        if (index > this.highestIndex) {
            return false
        }
        const offset = this.highestIndex - index
        if (offset >= SRTP_REPLAY_WINDOW) {
            return true
        }
        return (this.replayMask & (1n << offset)) !== 0n
    }

    private advanceReplay(index: bigint, estimatedRoc: number, seq: number): void {
        if (this.initialized && index <= this.highestIndex) {
            const offset = this.highestIndex - index
            if (offset < SRTP_REPLAY_WINDOW) {
                this.replayMask |= 1n << offset
            }
            return
        }
        const shift = this.initialized ? index - this.highestIndex : SRTP_REPLAY_WINDOW
        this.replayMask =
            shift >= SRTP_REPLAY_WINDOW ? 1n : ((this.replayMask << shift) | 1n) & SRTP_INDEX_MASK
        this.highestIndex = index
        this.roc = estimatedRoc
        this.lastSeq = seq
        this.initialized = true
    }

    private packetIndex(seq: number): bigint {
        return (BigInt(this.roc) << 16n) | BigInt(seq)
    }

    private generateIv(ssrc: number, index: bigint): Uint8Array {
        this.ivBuffer.fill(0)
        this.ivBuffer.set(this.sessionSalt.subarray(0, 14), 0)

        writeUInt32BE(this.ssrcBuffer, ssrc, 0)
        for (let i = 0; i < 4; i++) {
            this.ivBuffer[4 + i] ^= this.ssrcBuffer[i]
        }

        writeBigUInt64BE(this.indexBuffer, index, 0)
        for (let i = 0; i < 6; i++) {
            this.ivBuffer[8 + i] ^= this.indexBuffer[2 + i]
        }

        return this.ivBuffer
    }

    private computeAuthTag(data: Uint8Array, roc: number, tagLen: number): Uint8Array {
        writeUInt32BE(this.rocBuffer, roc, 0)
        const result = hmacSha1(this.authKey, data, this.rocBuffer)
        return result.subarray(0, tagLen)
    }
}

export class SrtpSession {
    private static readonly MAX_RECV_CONTEXTS = SRTP_MAX_RECV_CONTEXTS
    private readonly sendKey: SrtpKeyingMaterial
    private readonly recvKey: SrtpKeyingMaterial
    private readonly sendAuthLen?: number
    private readonly recvAuthLen?: number
    private readonly sendContexts = new Map<number, SrtpContext>()
    private readonly recvContexts = new Map<number, SrtpContext>()
    private sendAuthKeying: SrtpKeyingMaterial | null = null

    constructor(
        sendKey: SrtpKeyingMaterial,
        recvKey: SrtpKeyingMaterial,
        sendAuthLen?: number,
        recvAuthLen?: number
    ) {
        this.sendKey = sendKey
        this.recvKey = recvKey
        this.sendAuthLen = sendAuthLen
        this.recvAuthLen = recvAuthLen
    }

    protect(packet: RtpPacket): Uint8Array {
        let ctx = this.sendContexts.get(packet.header.ssrc)
        if (!ctx) {
            ctx = new SrtpContext(this.sendKey, this.sendAuthLen)
            if (this.sendAuthKeying) ctx.setAuthKeying(this.sendAuthKeying)
            this.sendContexts.set(packet.header.ssrc, ctx)
        }
        return ctx.protect(packet)
    }

    unprotect(data: Uint8Array): RtpPacket {
        if (data.length < 12) {
            throw new SrtpError('packet_too_short', `Packet too short: ${data.length} bytes`)
        }
        const header = RtpHeader.decode(data)
        let ctx = this.recvContexts.get(header.ssrc)
        if (!ctx) {
            ctx = new SrtpContext(this.recvKey, this.recvAuthLen)
            const packet = ctx.unprotect(data)
            if (this.recvContexts.size >= SrtpSession.MAX_RECV_CONTEXTS) {
                const oldest = this.recvContexts.keys().next().value
                if (oldest !== undefined) this.recvContexts.delete(oldest)
            }
            this.recvContexts.set(header.ssrc, ctx)
            return packet
        }
        return ctx.unprotect(data)
    }

    setSendAuthKeying(keying: SrtpKeyingMaterial): void {
        this.sendAuthKeying = keying
        for (const ctx of this.sendContexts.values()) ctx.setAuthKeying(keying)
    }
}

export class SrtcpContext {
    private readonly cipherKey: Uint8Array
    private readonly authKey: Uint8Array
    private readonly salt: Uint8Array
    private readonly authTagLen: number
    private index = 0
    private replayInitialized = false
    private highestIndex = 0n
    private replayMask = 0n

    private readonly ivBuffer: Uint8Array = new Uint8Array(16)
    private readonly ssrcBuffer: Uint8Array = new Uint8Array(4)
    private readonly indexBuffer: Uint8Array = new Uint8Array(4)

    constructor(keying: SrtpKeyingMaterial, authTagLen = SRTCP_AUTH_TAG_LEN) {
        this.cipherKey = deriveKey(keying.masterKey, keying.masterSalt, SRTCP_LABEL.ENCRYPTION, 16)
        this.authKey = deriveKey(keying.masterKey, keying.masterSalt, SRTCP_LABEL.AUTH, 20)
        this.salt = deriveKey(keying.masterKey, keying.masterSalt, SRTCP_LABEL.SALT, 14)
        this.authTagLen = authTagLen
    }

    protect(rtcp: Uint8Array, senderSsrc: number): Uint8Array {
        const current = this.index++ & SRTCP_INDEX_MASK
        const clearLen = Math.min(SRTCP_HEADER_LEN, rtcp.length)
        const payload = rtcp.subarray(clearLen)

        const iv = this.generateIv(senderSsrc, current)
        const encrypted = aesCtr128(this.cipherKey, iv, payload)

        const indexOffset = clearLen + encrypted.length
        const output = new Uint8Array(indexOffset + SRTCP_INDEX_LEN + this.authTagLen)
        output.set(rtcp.subarray(0, clearLen), 0)
        output.set(encrypted, clearLen)
        writeUInt32BE(output, (SRTCP_ENCRYPTED_FLAG | current) >>> 0, indexOffset)

        if (this.authTagLen > 0) {
            const authenticated = output.subarray(0, indexOffset + SRTCP_INDEX_LEN)
            const tag = hmacSha1(this.authKey, authenticated).subarray(0, this.authTagLen)
            output.set(tag, authenticated.length)
        }

        return output
    }

    /**
     * Verifies the auth tag and returns the RTCP packet in the clear. The sender
     * SSRC comes from the header the tag covers, so there is no SSRC argument.
     *
     * Replay is checked against the 31-bit SRTCP index the same way
     * {@link SrtpContext} checks it against its 48-bit RTP index: a sliding
     * window keyed on the highest index seen, so a relay that captured and
     * replays an earlier control packet (PLI, FIR, REMB, sender report) is
     * rejected instead of being decrypted and acted on again.
     *
     * @throws {SrtpError} `packet_too_short`, `auth_failed` or `replay`
     */
    unprotect(data: Uint8Array): Uint8Array {
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
            const expected = hmacSha1(this.authKey, authenticated).subarray(0, this.authTagLen)
            if (!uint8TimingSafeEqual(expected, data.subarray(authEnd))) {
                throw new SrtpError('auth_failed', 'SRTCP auth tag verification failed')
            }
        }

        const indexOffset = authEnd - SRTCP_INDEX_LEN
        const indexWord = readUInt32BE(data, indexOffset)
        const index = BigInt(indexWord & SRTCP_INDEX_MASK)

        if (this.isReplayed(index)) {
            throw new SrtpError('replay', `SRTCP replay detected: index ${index}`)
        }

        if ((indexWord & SRTCP_ENCRYPTED_FLAG) === 0) {
            this.advanceReplay(index)
            return data.subarray(0, indexOffset)
        }

        const iv = this.generateIv(readUInt32BE(data, 4), indexWord & SRTCP_INDEX_MASK)
        const decrypted = aesCtr128(
            this.cipherKey,
            iv,
            data.subarray(SRTCP_HEADER_LEN, indexOffset)
        )

        this.advanceReplay(index)

        const output = new Uint8Array(SRTCP_HEADER_LEN + decrypted.length)
        output.set(data.subarray(0, SRTCP_HEADER_LEN), 0)
        output.set(decrypted, SRTCP_HEADER_LEN)
        return output
    }

    private isReplayed(index: bigint): boolean {
        if (!this.replayInitialized) {
            return false
        }
        if (index > this.highestIndex) {
            return false
        }
        const offset = this.highestIndex - index
        if (offset >= SRTP_REPLAY_WINDOW) {
            return true
        }
        return (this.replayMask & (1n << offset)) !== 0n
    }

    private advanceReplay(index: bigint): void {
        if (this.replayInitialized && index <= this.highestIndex) {
            const offset = this.highestIndex - index
            if (offset < SRTP_REPLAY_WINDOW) {
                this.replayMask |= 1n << offset
            }
            return
        }
        const shift = this.replayInitialized ? index - this.highestIndex : SRTP_REPLAY_WINDOW
        this.replayMask =
            shift >= SRTP_REPLAY_WINDOW ? 1n : ((this.replayMask << shift) | 1n) & SRTP_INDEX_MASK
        this.highestIndex = index
        this.replayInitialized = true
    }

    private generateIv(ssrc: number, index: number): Uint8Array {
        this.ivBuffer.fill(0)
        this.ivBuffer.set(this.salt, 0)

        writeUInt32BE(this.ssrcBuffer, ssrc, 0)
        for (let i = 0; i < 4; i++) {
            this.ivBuffer[4 + i] ^= this.ssrcBuffer[i]
        }

        writeUInt32BE(this.indexBuffer, index, 0)
        for (let i = 0; i < 4; i++) {
            this.ivBuffer[10 + i] ^= this.indexBuffer[i]
        }

        return this.ivBuffer
    }
}

/**
 * Dispatches incoming SRTCP to one {@link SrtcpContext} per sender SSRC.
 *
 * A call's peer emits more than one SRTCP stream on the same relay connection
 * (audio, main video, video FEC, ...), each with its own 31-bit SRTCP index
 * counter. A single shared {@link SrtcpContext} interleaves those independent
 * counters into one replay window, so a packet from stream B looks like an
 * out-of-window replay relative to stream A's index and gets dropped even
 * though nothing was actually replayed. Keying the context by the sender SSRC
 * at bytes 4-7 of the packet — the same field {@link SrtcpContext} already
 * reads to build the decryption IV — gives each stream its own window, the
 * way {@link SrtpSession} already does per-SSRC for RTP.
 */
export class SrtcpSession {
    private static readonly MAX_RECV_CONTEXTS = SRTP_MAX_RECV_CONTEXTS
    private readonly keying: SrtpKeyingMaterial
    private readonly authTagLen: number
    private readonly contexts = new Map<number, SrtcpContext>()

    constructor(keying: SrtpKeyingMaterial, authTagLen = SRTCP_AUTH_TAG_LEN) {
        this.keying = keying
        this.authTagLen = authTagLen
    }

    /**
     * Verifies and decrypts an incoming SRTCP packet, using (and lazily
     * creating) the {@link SrtcpContext} for its sender SSRC.
     *
     * A context for an unseen SSRC is authenticated through
     * {@link SrtcpContext.unprotect} before it is cached or allowed to evict
     * an existing entry. `MAX_RECV_CONTEXTS` bounds the cache, so a packet
     * with a forged SSRC that got inserted first could otherwise evict the
     * oldest tracked stream and wipe its replay window, letting a captured
     * packet from that stream be replayed. Caching only after a successful
     * authentication keeps a forged SSRC from ever reaching the eviction
     * check.
     *
     * @throws {SrtpError} `packet_too_short`, `auth_failed` or `replay`
     */
    unprotect(data: Uint8Array): Uint8Array {
        if (data.length < SRTCP_HEADER_LEN) {
            throw new SrtpError(
                'packet_too_short',
                `SRTCP packet too short: ${data.length}B total, ${SRTCP_HEADER_LEN}B minimum`
            )
        }

        const ssrc = readUInt32BE(data, 4)
        let ctx = this.contexts.get(ssrc)
        if (!ctx) {
            ctx = new SrtcpContext(this.keying, this.authTagLen)
            const packet = ctx.unprotect(data)
            if (this.contexts.size >= SrtcpSession.MAX_RECV_CONTEXTS) {
                const oldest = this.contexts.keys().next().value
                if (oldest !== undefined) this.contexts.delete(oldest)
            }
            this.contexts.set(ssrc, ctx)
            return packet
        }
        return ctx.unprotect(data)
    }
}

function deriveKey(
    masterKey: Uint8Array,
    masterSalt: Uint8Array,
    label: number,
    length: number
): Uint8Array {
    const iv = new Uint8Array(16)
    iv.set(masterSalt.subarray(0, 14), 0)
    iv[7] ^= label

    const zeros = new Uint8Array(length)
    return aesCtr128(masterKey, iv, zeros)
}

export class SrtpError extends Error {
    type: 'packet_too_short' | 'auth_failed' | 'replay' | 'encryption' | 'decryption'

    constructor(type: SrtpError['type'], message: string) {
        super(message)
        this.type = type
        this.name = 'SrtpError'
    }
}
