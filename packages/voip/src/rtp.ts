import { randomInt } from 'node:crypto'

import { PayloadType } from './types.js'

const RTP_VERSION = 2

const MIN_HEADER_SIZE = 12

export class RtpHeader {
    version: number = RTP_VERSION
    padding = false
    extension = false
    csrcCount = 0
    marker = false
    payloadType: number
    sequenceNumber: number
    timestamp: number
    ssrc: number
    csrc: number[] = []
    extensionProfile = 0
    extensionData: Buffer = Buffer.alloc(0)

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

    encode(buf: Buffer): number {
        if (buf.length < this.size()) {
            throw new Error('buffer too small for RTP header')
        }

        buf[0] =
            ((this.version & 0x03) << 6) |
            ((this.padding ? 1 : 0) << 5) |
            ((this.extension ? 1 : 0) << 4) |
            (this.csrcCount & 0x0f)

        buf[1] = ((this.marker ? 1 : 0) << 7) | (this.payloadType & 0x7f)

        buf.writeUInt16BE(this.sequenceNumber, 2)

        buf.writeUInt32BE(this.timestamp, 4)

        buf.writeUInt32BE(this.ssrc, 8)

        let offset = 12
        for (let i = 0; i < this.csrc.length; i++) {
            buf.writeUInt32BE(this.csrc[i], offset)
            offset += 4
        }

        if (this.extension) {
            buf.writeUInt16BE(this.extensionProfile, offset)
            buf.writeUInt16BE(this.extensionData.length / 4, offset + 2)
            this.extensionData.copy(buf, offset + 4)
        }

        return this.size()
    }

    static decode(buf: Buffer): RtpHeader {
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
        const sequenceNumber = buf.readUInt16BE(2)
        const timestamp = buf.readUInt32BE(4)
        const ssrc = buf.readUInt32BE(8)

        const headerSize = MIN_HEADER_SIZE + csrcCount * 4
        if (buf.length < headerSize) {
            throw new Error('buffer too small for CSRC list')
        }

        const csrc: number[] = []
        let offset = 12
        for (let i = 0; i < csrcCount; i++) {
            csrc.push(buf.readUInt32BE(offset))
            offset += 4
        }

        const header = new RtpHeader(payloadType, sequenceNumber, timestamp, ssrc)
        header.version = version
        header.padding = padding
        header.extension = extension
        header.csrcCount = csrcCount
        header.marker = marker
        header.csrc = csrc

        if (extension && buf.length >= offset + 4) {
            header.extensionProfile = buf.readUInt16BE(offset)
            const extWords = buf.readUInt16BE(offset + 2)
            const extBytes = extWords * 4
            offset += 4
            if (buf.length >= offset + extBytes) {
                header.extensionData = Buffer.from(buf.subarray(offset, offset + extBytes))
            }
        }

        return header
    }
}

export class RtpPacket {
    header: RtpHeader
    payload: Buffer

    constructor(header: RtpHeader, payload: Buffer) {
        this.header = header
        this.payload = payload
    }

    size(): number {
        return this.header.size() + this.payload.length
    }

    encode(): Buffer {
        const buf = Buffer.alloc(this.size())
        const headerSize = this.header.encode(buf)
        this.payload.copy(buf, headerSize)
        return buf
    }

    static decode(buf: Buffer): RtpPacket {
        const header = RtpHeader.decode(buf)
        const payload = Buffer.from(buf.subarray(header.size()))
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
        // WhatsApp Opus uses a 16 kHz RTP clock (matches Go reference rtp.go).
        return new RtpSession(ssrc, PayloadType.WhatsAppOpus, 16000, 960)
    }

    createPacket(payload: Buffer, marker = false): RtpPacket {
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
        payload: Buffer,
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
