import { createCipheriv, createHmac } from 'node:crypto'

import { toBytesView } from 'zapo-js/util'

import { writeBigUInt64BE, writeUInt32BE } from './bytes.js'
import { RtpHeader, RtpPacket } from './rtp.js'
import { SRTP_AUTH_TAG_LEN, SRTP_LABEL, type SrtpKeyingMaterial } from './types.js'

export class SrtpContext {
    private sessionKey: Uint8Array
    private sessionSalt: Uint8Array
    private authKey: Uint8Array
    private roc = 0
    private lastSeq = 0
    private initialized = false
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
        const cipher = createCipheriv('aes-128-ctr', this.sessionKey, iv)
        const encrypted = toBytesView(cipher.update(packet.payload))
        cipher.final()

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

        this.updateRoc(header.sequenceNumber)
        const index = this.packetIndex(header.sequenceNumber)

        const iv = this.generateIv(header.ssrc, index)
        const decipher = createCipheriv('aes-128-ctr', this.sessionKey, iv)
        const decrypted = toBytesView(
            decipher.update(data.subarray(headerSize, headerSize + payloadLen))
        )
        decipher.final()

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

    private computeAuthTag(
        data: Uint8Array,
        roc: number,
        tagLen: number = SRTP_AUTH_TAG_LEN
    ): Uint8Array {
        const hmac = createHmac('sha1', this.authKey)
        hmac.update(data)

        writeUInt32BE(this.rocBuffer, roc, 0)
        hmac.update(this.rocBuffer)

        const result = toBytesView(hmac.digest())
        return result.subarray(0, tagLen)
    }
}

export class SrtpSession {
    private sendCtx: SrtpContext
    private recvCtx: SrtpContext

    constructor(
        sendKey: SrtpKeyingMaterial,
        recvKey: SrtpKeyingMaterial,
        sendAuthLen?: number,
        recvAuthLen?: number
    ) {
        this.sendCtx = new SrtpContext(sendKey, sendAuthLen)
        this.recvCtx = new SrtpContext(recvKey, recvAuthLen)
    }

    protect(packet: RtpPacket): Uint8Array {
        return this.sendCtx.protect(packet)
    }

    unprotect(data: Uint8Array): RtpPacket {
        return this.recvCtx.unprotect(data)
    }

    setSendAuthKeying(keying: SrtpKeyingMaterial): void {
        this.sendCtx.setAuthKeying(keying)
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
    const cipher = createCipheriv('aes-128-ctr', masterKey, iv)
    const output = toBytesView(cipher.update(zeros))
    cipher.final()

    return output
}

export class SrtpError extends Error {
    type: 'packet_too_short' | 'auth_failed' | 'encryption' | 'decryption'

    constructor(type: SrtpError['type'], message: string) {
        super(message)
        this.type = type
        this.name = 'SrtpError'
    }
}
