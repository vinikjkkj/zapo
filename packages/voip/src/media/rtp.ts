import { EMPTY_BYTES, readUInt16BE, readUInt32BE, writeUInt16BE, writeUInt32BE } from '../bytes.js'
import { randomInt } from '../crypto/primitives.js'
import { PayloadType } from '../types.js'

const RTP_VERSION = 2

const MIN_HEADER_SIZE = 12

export class RtpHeader {
    version: number = RTP_VERSION
    padding = false
    extension = false
    marker = false
    payloadType: number
    sequenceNumber: number
    timestamp: number
    ssrc: number
    csrc: number[] = []
    extensionProfile = 0
    extensionData: Uint8Array = EMPTY_BYTES

    get csrcCount(): number {
        return this.csrc.length
    }

    constructor(payloadType: number, sequenceNumber: number, timestamp: number, ssrc: number) {
        this.payloadType = payloadType
        this.sequenceNumber = sequenceNumber
        this.timestamp = timestamp
        this.ssrc = ssrc
    }

    size(): number {
        let s = MIN_HEADER_SIZE + this.csrcCount * 4
        if (this.extension) {
            s += 4 + this.extensionData.length
        }
        return s
    }

    encode(buf: Uint8Array): number {
        if (buf.length < this.size()) {
            throw new Error('buffer too small for RTP header')
        }

        buf[0] =
            ((this.version & 0x03) << 6) |
            ((this.padding ? 1 : 0) << 5) |
            ((this.extension ? 1 : 0) << 4) |
            (this.csrcCount & 0x0f)

        buf[1] = ((this.marker ? 1 : 0) << 7) | (this.payloadType & 0x7f)

        writeUInt16BE(buf, this.sequenceNumber, 2)
        writeUInt32BE(buf, this.timestamp, 4)
        writeUInt32BE(buf, this.ssrc, 8)

        let offset = 12
        for (let i = 0; i < this.csrc.length; i++) {
            writeUInt32BE(buf, this.csrc[i], offset)
            offset += 4
        }

        if (this.extension) {
            if (this.extensionData.length % 4 !== 0) {
                throw new Error('RTP extension data must be 32-bit aligned')
            }
            writeUInt16BE(buf, this.extensionProfile, offset)
            writeUInt16BE(buf, this.extensionData.length / 4, offset + 2)
            buf.set(this.extensionData, offset + 4)
        }

        return this.size()
    }

    static decode(buf: Uint8Array): RtpHeader {
        if (buf.length < MIN_HEADER_SIZE) {
            throw new Error('buffer too small for RTP header')
        }

        const version = (buf[0] >> 6) & 0x03
        if (version !== RTP_VERSION) {
            throw new Error(`invalid RTP version: ${version}`)
        }

        const padding = ((buf[0] >> 5) & 0x01) !== 0
        const extension = ((buf[0] >> 4) & 0x01) !== 0
        const csrcCount = buf[0] & 0x0f
        const marker = ((buf[1] >> 7) & 0x01) !== 0
        const payloadType = buf[1] & 0x7f
        const sequenceNumber = readUInt16BE(buf, 2)
        const timestamp = readUInt32BE(buf, 4)
        const ssrc = readUInt32BE(buf, 8)

        const headerSize = MIN_HEADER_SIZE + csrcCount * 4
        if (buf.length < headerSize) {
            throw new Error('buffer too small for CSRC list')
        }

        const csrc: number[] = []
        let offset = 12
        for (let i = 0; i < csrcCount; i++) {
            csrc.push(readUInt32BE(buf, offset))
            offset += 4
        }

        const header = new RtpHeader(payloadType, sequenceNumber, timestamp, ssrc)
        header.version = version
        header.padding = padding
        header.extension = extension
        header.marker = marker
        header.csrc = csrc

        if (extension) {
            if (buf.length < offset + 4) {
                throw new Error('buffer too small for RTP extension header')
            }
            header.extensionProfile = readUInt16BE(buf, offset)
            const extWords = readUInt16BE(buf, offset + 2)
            const extBytes = extWords * 4
            offset += 4
            if (buf.length < offset + extBytes) {
                throw new Error('buffer too small for RTP extension data')
            }
            header.extensionData = buf.slice(offset, offset + extBytes)
        }

        return header
    }
}

export class RtpPacket {
    header: RtpHeader
    payload: Uint8Array

    constructor(header: RtpHeader, payload: Uint8Array) {
        this.header = header
        this.payload = payload
    }

    size(): number {
        return this.header.size() + this.payload.length
    }

    encode(): Uint8Array {
        const buf = new Uint8Array(this.size())
        const headerSize = this.header.encode(buf)
        buf.set(this.payload, headerSize)
        return buf
    }

    static decode(buf: Uint8Array): RtpPacket {
        const header = RtpHeader.decode(buf)
        let end = buf.length
        if (header.padding) {
            const padLen = buf[buf.length - 1]
            if (padLen > 0 && header.size() + padLen <= buf.length) {
                end = buf.length - padLen
            }
        }
        const payload = buf.slice(header.size(), end)
        return new RtpPacket(header, payload)
    }
}

export class RtpSession {
    private ssrc: number
    private payloadType: number
    private sequenceNumber: number
    private sampleRate: number
    private timestamp: number
    private samplesPerPacket: number

    constructor(ssrc: number, payloadType: number, sampleRate: number, samplesPerPacket: number) {
        this.ssrc = ssrc
        this.payloadType = payloadType
        this.sequenceNumber = randomInt(0, 65536)
        this.sampleRate = sampleRate
        this.timestamp = randomInt(0, 0xffffffff)
        this.samplesPerPacket = samplesPerPacket
    }

    static whatsappOpus(ssrc: number): RtpSession {
        return new RtpSession(ssrc, PayloadType.WhatsAppOpus, 16000, 960)
    }

    createPacket(payload: Uint8Array, marker = false): RtpPacket {
        const header = new RtpHeader(
            this.payloadType,
            this.sequenceNumber,
            this.timestamp,
            this.ssrc
        )
        header.marker = marker

        this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff
        this.timestamp = (this.timestamp + this.samplesPerPacket) >>> 0

        return new RtpPacket(header, payload)
    }

    createPacketWithDuration(
        payload: Uint8Array,
        durationSamples: number,
        marker = false
    ): RtpPacket {
        const header = new RtpHeader(
            this.payloadType,
            this.sequenceNumber,
            this.timestamp,
            this.ssrc
        )
        header.marker = marker

        this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff
        this.timestamp = (this.timestamp + durationSamples) >>> 0

        return new RtpPacket(header, payload)
    }
}
