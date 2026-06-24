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
    extensionData: Uint8Array = new Uint8Array(0)

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

        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

        buf[0] =
            ((this.version & 0x03) << 6) |
            ((this.padding ? 1 : 0) << 5) |
            ((this.extension ? 1 : 0) << 4) |
            (this.csrcCount & 0x0f)

        buf[1] = ((this.marker ? 1 : 0) << 7) | (this.payloadType & 0x7f)
        dv.setUint16(2, this.sequenceNumber, false)
        dv.setUint32(4, this.timestamp, false)
        dv.setUint32(8, this.ssrc, false)

        let offset = 12
        for (let i = 0; i < this.csrc.length; i++) {
            dv.setUint32(offset, this.csrc[i], false)
            offset += 4
        }

        if (this.extension) {
            dv.setUint16(offset, this.extensionProfile, false)
            dv.setUint16(offset + 2, this.extensionData.length / 4, false)
            buf.set(this.extensionData, offset + 4)
        }

        return this.size()
    }

    static decode(buf: Uint8Array): RtpHeader {
        if (buf.length < MIN_HEADER_SIZE) {
            throw new Error('buffer too small for RTP header')
        }

        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

        const version = (buf[0] >> 6) & 0x03
        if (version !== RTP_VERSION) {
            throw new Error(`invalid RTP version: ${version}`)
        }

        const padding = ((buf[0] >> 5) & 0x01) !== 0
        const extension = ((buf[0] >> 4) & 0x01) !== 0
        const csrcCount = buf[0] & 0x0f
        const marker = ((buf[1] >> 7) & 0x01) !== 0
        const payloadType = buf[1] & 0x7f
        const sequenceNumber = dv.getUint16(2, false)
        const timestamp = dv.getUint32(4, false)
        const ssrc = dv.getUint32(8, false)

        const headerSize = MIN_HEADER_SIZE + csrcCount * 4
        if (buf.length < headerSize) {
            throw new Error('buffer too small for CSRC list')
        }

        const csrc: number[] = []
        let offset = 12
        for (let i = 0; i < csrcCount; i++) {
            csrc.push(dv.getUint32(offset, false))
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
            header.extensionProfile = dv.getUint16(offset, false)
            const extWords = dv.getUint16(offset + 2, false)
            const extBytes = extWords * 4
            offset += 4
            if (buf.length >= offset + extBytes) {
                header.extensionData = buf.slice(offset, offset + extBytes)
            }
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
        const payload = buf.slice(header.size())
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
