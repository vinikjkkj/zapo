const START_CODE = new Uint8Array([0, 0, 0, 1])

export interface H264AccessUnit {
    readonly timestamp: number
    readonly data: Uint8Array
    readonly keyFrame: boolean
}

/** Packetizes an Annex-B access unit into RFC 6184 single-NAL/FU-A payloads. */
export function packetizeH264AnnexB(data: Uint8Array, maxPayload = 1100): Uint8Array[] {
    if (maxPayload < 3) throw new Error('H264 RTP payload size must be at least 3 bytes')
    const starts: Array<{ start: number; size: number }> = []
    for (let i = 0; i + 3 < data.length; ) {
        const four = data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1
        const three = data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1
        if (four || three) {
            starts.push({ start: i, size: four ? 4 : 3 })
            i += four ? 4 : 3
        } else i++
    }
    const nals: Uint8Array[] = []
    if (!starts.length && data.length) nals.push(data)
    for (let i = 0; i < starts.length; i++) {
        const from = starts[i].start + starts[i].size
        const to = i + 1 < starts.length ? starts[i + 1].start : data.length
        if (to > from) nals.push(data.subarray(from, to))
    }
    const payloads: Uint8Array[] = []
    for (const nal of nals) {
        if (nal.length <= maxPayload) {
            payloads.push(nal.slice())
            continue
        }
        const indicator = (nal[0] & 0xe0) | 28
        const nalType = nal[0] & 0x1f
        const chunkSize = maxPayload - 2
        for (let offset = 1; offset < nal.length; offset += chunkSize) {
            const end = Math.min(nal.length, offset + chunkSize)
            const payload = new Uint8Array(2 + end - offset)
            payload[0] = indicator
            payload[1] = nalType | (offset === 1 ? 0x80 : 0) | (end === nal.length ? 0x40 : 0)
            payload.set(nal.subarray(offset, end), 2)
            payloads.push(payload)
        }
    }
    return payloads
}

/** WhatsApp's native sender packs the complete Annex-B access unit as one NAL
 * before applying FU-A fragmentation. This intentionally differs from generic
 * RFC 6184 packetization and keeps SPS/PPS/IDR together for mobile receivers. */
export function packetizeWhatsAppH264AccessUnit(data: Uint8Array, maxPayload = 800): Uint8Array[] {
    if (maxPayload < 3) throw new Error('H264 RTP payload size must be at least 3 bytes')
    const starts: Array<{ start: number; size: number }> = []
    for (let i = 0; i + 2 < data.length; ) {
        const four =
            i + 3 < data.length &&
            data[i] === 0 &&
            data[i + 1] === 0 &&
            data[i + 2] === 0 &&
            data[i + 3] === 1
        const three = data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1
        if (four || three) {
            starts.push({ start: i, size: four ? 4 : 3 })
            i += four ? 4 : 3
        } else i++
    }
    const nals: Uint8Array[] = []
    if (!starts.length && data.length) nals.push(data)
    for (let i = 0; i < starts.length; i++) {
        const from = starts[i].start + starts[i].size
        let to = i + 1 < starts.length ? starts[i + 1].start : data.length
        while (to > from && data[to - 1] === 0) to--
        if (to > from && (data[from] & 0x1f) !== 9) nals.push(data.subarray(from, to))
    }
    if (!nals.length) return []
    const packedSize = nals.reduce((size, nal, index) => size + nal.length + (index ? 4 : 0), 0)
    const packed = new Uint8Array(packedSize)
    let packedOffset = 0
    for (let i = 0; i < nals.length; i++) {
        if (i) {
            packed.set(START_CODE, packedOffset)
            packedOffset += START_CODE.length
        }
        packed.set(nals[i], packedOffset)
        packedOffset += nals[i].length
    }
    if (packed.length <= maxPayload) return [packed]
    const indicator = (packed[0] & 0xe0) | 28
    const nalType = packed[0] & 0x1f
    const chunkSize = maxPayload - 2
    const payloads: Uint8Array[] = []
    for (let offset = 1; offset < packed.length; offset += chunkSize) {
        const end = Math.min(packed.length, offset + chunkSize)
        const payload = new Uint8Array(2 + end - offset)
        payload[0] = indicator
        payload[1] = nalType | (offset === 1 ? 0x80 : 0) | (end === packed.length ? 0x40 : 0)
        payload.set(packed.subarray(offset, end), 2)
        payloads.push(payload)
    }
    return payloads
}

/** RFC 6184 depacketizer for single NAL, STAP-A and FU-A payloads. */
export class H264Depacketizer {
    private static readonly MAX_BUFFERED_BYTES = 8 * 1024 * 1024
    private timestamp: number | null = null
    private parts: Uint8Array[] = []
    private keyFrame = false
    private fuParts: Uint8Array[] = []
    private bufferedBytes = 0

    push(payload: Uint8Array, timestamp: number, marker: boolean): H264AccessUnit[] {
        if (!payload.length) return []
        const completed: H264AccessUnit[] = []
        let previous: H264AccessUnit | null = null
        if (this.timestamp !== null && this.timestamp !== timestamp) {
            // Some WhatsApp senders omit the RTP marker on a complete access unit.
            // A timestamp transition is also an authoritative frame boundary.
            if (this.parts.length && !this.fuParts.length) previous = this.flush()
            this.resetFrame(timestamp)
        }
        if (previous) completed.push(previous)
        if (this.timestamp === null) this.timestamp = timestamp

        if (
            this.bufferedBytes + payload.length + START_CODE.length >
            H264Depacketizer.MAX_BUFFERED_BYTES
        ) {
            this.resetFrame(timestamp)
            return completed
        }

        const type = payload[0] & 0x1f
        if (type >= 1 && type <= 23) this.appendNal(payload)
        else if (type === 24) this.appendStapA(payload)
        else if (type === 28) this.appendFuA(payload)
        else return completed

        if (marker && !this.fuParts.length) {
            const current = this.flush()
            if (current) completed.push(current)
        }
        return completed
    }

    reset(): void {
        this.timestamp = null
        this.parts = []
        this.fuParts = []
        this.keyFrame = false
        this.bufferedBytes = 0
    }

    private resetFrame(timestamp: number): void {
        this.parts = []
        this.fuParts = []
        this.keyFrame = false
        this.timestamp = timestamp
        this.bufferedBytes = 0
    }

    private appendNal(nal: Uint8Array): void {
        if (
            this.bufferedBytes + START_CODE.length + nal.length >
            H264Depacketizer.MAX_BUFFERED_BYTES
        ) {
            this.resetFrame(this.timestamp ?? 0)
            return
        }
        this.keyFrame ||= (nal[0] & 0x1f) === 5
        this.parts.push(START_CODE, nal.slice())
        this.bufferedBytes += START_CODE.length + nal.length
    }

    private appendStapA(payload: Uint8Array): void {
        let offset = 1
        while (offset + 2 <= payload.length) {
            const size = (payload[offset] << 8) | payload[offset + 1]
            offset += 2
            if (!size || offset + size > payload.length) break
            this.appendNal(payload.subarray(offset, offset + size))
            offset += size
        }
    }

    private appendFuA(payload: Uint8Array): void {
        if (payload.length < 2) return
        const indicator = payload[0]
        const header = payload[1]
        const start = (header & 0x80) !== 0
        const end = (header & 0x40) !== 0
        const nalType = header & 0x1f
        if (start) {
            for (const part of this.fuParts) this.bufferedBytes -= part.length
            this.fuParts = [new Uint8Array([(indicator & 0xe0) | nalType]), payload.slice(2)]
            this.bufferedBytes += payload.length - 1
            this.keyFrame ||= nalType === 5
        } else if (this.fuParts.length) {
            this.fuParts.push(payload.slice(2))
            this.bufferedBytes += payload.length - 2
        }
        if (end && this.fuParts.length) {
            this.parts.push(START_CODE, ...this.fuParts)
            this.fuParts = []
        }
    }

    private flush(): H264AccessUnit | null {
        if (!this.parts.length || this.timestamp === null) return null
        const size = this.parts.reduce((sum, part) => sum + part.length, 0)
        const data = new Uint8Array(size)
        let offset = 0
        for (const part of this.parts) {
            data.set(part, offset)
            offset += part.length
        }
        const result = { timestamp: this.timestamp, data, keyFrame: this.keyFrame }
        this.reset()
        return result
    }
}
