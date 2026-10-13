const START_CODE = new Uint8Array([0, 0, 0, 1])

/** Coded slice of an IDR picture: the only NAL type that makes a key frame. */
const NAL_TYPE_IDR = 5
export const NAL_TYPE_SPS = 7
const NAL_TYPE_STAP_A = 24
/** Largest NAL unit a STAP-A can carry: its size field is 16 bits. */
const STAP_A_MAX_NAL = 0xffff

export interface H264AccessUnit {
    readonly timestamp: number
    readonly data: Uint8Array
    readonly keyFrame: boolean
}

export interface H264PacketizedFrame {
    readonly payloads: Uint8Array[]
    /** Whether the access unit carries an IDR slice, as {@link isH264KeyFrame} reports. */
    readonly keyFrame: boolean
}

/** Offset of the next Annex-B start code at or after `from`, or -1. One byte must follow it. */
export function nextStartCode(data: Uint8Array, from: number): number {
    for (let i = from; i + 3 < data.length; i++) {
        if (data[i] !== 0 || data[i + 1] !== 0) continue
        if (data[i + 2] === 1 || (data[i + 2] === 0 && data[i + 3] === 1)) return i
    }
    return -1
}

/** Offset of the NAL header behind the start code at `at`. */
export function nalHeaderAfter(data: Uint8Array, at: number): number {
    return at + (data[at + 2] === 1 ? 3 : 4)
}

/**
 * Packetizes an Annex-B access unit into RFC 6184 payloads and reports whether it is a key
 * frame, in one scan. A key frame leaves as WhatsApp sends it: the whole unit in one STAP-A
 * when it fits, else from its SPS to the end as one FU-A typed SPS, inner start codes kept.
 * Single-NAL payloads are views into `data`, valid only until the caller reuses that buffer.
 */
export function packetizeH264Frame(data: Uint8Array, maxPayload = 1100): H264PacketizedFrame {
    if (maxPayload < 3) throw new Error('H264 RTP payload size must be at least 3 bytes')
    const nals: Uint8Array[] = []
    let keyFrame = false
    let firstSps = -1
    let keyFrameSps = -1
    const addNal = (nal: Uint8Array): void => {
        const type = nal[0] & 0x1f
        if (!keyFrame) {
            if (type === NAL_TYPE_IDR) {
                keyFrame = true
                keyFrameSps = firstSps
            } else if (type === NAL_TYPE_SPS && firstSps < 0) firstSps = nals.length
        }
        nals.push(nal)
    }
    let at = nextStartCode(data, 0)
    if (at < 0 && data.length) addNal(data)
    while (at >= 0) {
        const from = nalHeaderAfter(data, at)
        at = nextStartCode(data, from)
        const to = at < 0 ? data.length : at
        if (to > from) addNal(data.subarray(from, to))
    }

    if (keyFrameSps >= 0) {
        const aggregated = stapA(nals, maxPayload)
        if (aggregated) return { payloads: [aggregated], keyFrame }
    }
    const payloads: Uint8Array[] = []
    const separate = keyFrameSps < 0 ? nals.length : keyFrameSps
    for (let i = 0; i < separate; i++) {
        const nal = nals[i]
        if (nal.length <= maxPayload) payloads.push(nal)
        else pushFuA(payloads, nal, maxPayload)
    }
    if (keyFrameSps >= 0) {
        const sps = nals[keyFrameSps]
        pushFuA(payloads, data.subarray(sps.byteOffset - data.byteOffset), maxPayload)
    }
    return { payloads, keyFrame }
}

/**
 * All of `nals` in one RFC 6184 STAP-A (F of any unit, the largest NRI), or null when it
 * exceeds `maxPayload` or a unit exceeds the 16-bit size field.
 */
function stapA(nals: readonly Uint8Array[], maxPayload: number): Uint8Array | null {
    let size = 1
    let forbidden = 0
    let nri = 0
    for (const nal of nals) {
        size += 2 + nal.length
        if (nal.length > STAP_A_MAX_NAL || size > maxPayload) return null
        forbidden |= nal[0] & 0x80
        nri = Math.max(nri, nal[0] & 0x60)
    }
    const payload = new Uint8Array(size)
    payload[0] = forbidden | nri | NAL_TYPE_STAP_A
    let at = 1
    for (const nal of nals) {
        payload[at] = nal.length >>> 8
        payload[at + 1] = nal.length & 0xff
        payload.set(nal, at + 2)
        at += 2 + nal.length
    }
    return payload
}

/** Appends `unit` as FU-A fragments typed by its first byte, even when it fits in one. */
function pushFuA(payloads: Uint8Array[], unit: Uint8Array, maxPayload: number): void {
    const indicator = (unit[0] & 0xe0) | 28
    const nalType = unit[0] & 0x1f
    const chunkSize = maxPayload - 2
    for (let offset = 1; offset < unit.length; offset += chunkSize) {
        const end = Math.min(unit.length, offset + chunkSize)
        const payload = new Uint8Array(2 + end - offset)
        payload[0] = indicator
        payload[1] = nalType | (offset === 1 ? 0x80 : 0) | (end === unit.length ? 0x40 : 0)
        payload.set(unit.subarray(offset, end), 2)
        payloads.push(payload)
    }
}

/**
 * Reports whether an Annex-B access unit carries an IDR slice. SPS and PPS do not count:
 * encoders repeat them ahead of every frame.
 */
export function isH264KeyFrame(data: Uint8Array): boolean {
    let at = nextStartCode(data, 0)
    if (at < 0) return data.length > 0 && (data[0] & 0x1f) === NAL_TYPE_IDR
    while (at >= 0) {
        const header = nalHeaderAfter(data, at)
        if (header < data.length && (data[header] & 0x1f) === NAL_TYPE_IDR) return true
        at = nextStartCode(data, header)
    }
    return false
}

/** RTP sequence numbers wrap at this modulus; used to test fragment contiguity. */
const SEQUENCE_MODULUS = 0x10000

const NO_ACCESS_UNITS: readonly H264AccessUnit[] = Object.freeze([])

/**
 * RFC 6184 depacketizer for single NAL, STAP-A and FU-A payloads. The key-frame flag comes
 * from what made it into the access unit at flush time, including an IDR carried inside an
 * FU-A typed SPS. Payloads are held as views until their frame flushes, so a caller must not
 * reuse a pushed buffer before then.
 */
export class H264Depacketizer {
    private static readonly MAX_BUFFERED_BYTES = 8 * 1024 * 1024
    private static readonly NO_FU_RUN = -1
    private timestamp: number | null = null
    private parts: Uint8Array[] = []
    private readonly nalHeaders: number[] = []
    private fuParts: Uint8Array[] = []
    private fuNalType = H264Depacketizer.NO_FU_RUN
    private fuLastSequence = H264Depacketizer.NO_FU_RUN
    private bufferedBytes = 0

    /**
     * @param sequenceNumber RTP sequence number of `payload`: an FU-A continuation is only
     * accepted right after the last fragment of its run.
     */
    push(
        payload: Uint8Array,
        timestamp: number,
        marker: boolean,
        sequenceNumber: number
    ): readonly H264AccessUnit[] {
        if (!payload.length) return NO_ACCESS_UNITS
        let previous: H264AccessUnit | null = null
        if (this.timestamp !== null && this.timestamp !== timestamp) {
            previous = this.flush()
            this.resetFrame(timestamp)
        }
        if (this.timestamp === null) this.timestamp = timestamp

        if (this.exceedsCap(payload.length + START_CODE.length)) {
            this.resetFrame(timestamp)
            return previous ? [previous] : NO_ACCESS_UNITS
        }

        const type = payload[0] & 0x1f
        if (type >= 1 && type <= 23) this.appendNal(payload)
        else if (type === NAL_TYPE_STAP_A) this.appendStapA(payload)
        else if (type === 28) this.appendFuA(payload, sequenceNumber)
        else return previous ? [previous] : NO_ACCESS_UNITS

        const current = marker && !this.fuParts.length ? this.flush() : null
        if (previous && current) return [previous, current]
        if (previous) return [previous]
        return current ? [current] : NO_ACCESS_UNITS
    }

    reset(): void {
        this.resetFrame(null)
    }

    private resetFrame(timestamp: number | null): void {
        this.parts = []
        this.nalHeaders.length = 0
        this.clearFuRun()
        this.timestamp = timestamp
        this.bufferedBytes = 0
    }

    private clearFuRun(): void {
        this.fuParts = []
        this.fuNalType = H264Depacketizer.NO_FU_RUN
        this.fuLastSequence = H264Depacketizer.NO_FU_RUN
    }

    private exceedsCap(bytes: number): boolean {
        return this.bufferedBytes + bytes > H264Depacketizer.MAX_BUFFERED_BYTES
    }

    private appendNal(nal: Uint8Array): void {
        if (this.exceedsCap(START_CODE.length + nal.length)) {
            this.resetFrame(this.timestamp)
            return
        }
        this.parts.push(START_CODE, nal)
        this.nalHeaders.push(nal[0])
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

    /** A continuation off sequence abandons its run; one of another type leaves the run alone. */
    private appendFuA(payload: Uint8Array, sequenceNumber: number): void {
        if (payload.length < 2) return
        const indicator = payload[0]
        const header = payload[1]
        const start = (header & 0x80) !== 0
        const end = (header & 0x40) !== 0
        const nalType = header & 0x1f
        if (start) {
            this.dropFuBytes()
            this.fuParts = [new Uint8Array([(indicator & 0xe0) | nalType]), payload.subarray(2)]
            this.fuNalType = nalType
            this.fuLastSequence = sequenceNumber
            this.bufferedBytes += payload.length - 1
        } else if (this.fuNalType !== nalType) {
            return
        } else if (sequenceNumber === (this.fuLastSequence + 1) % SEQUENCE_MODULUS) {
            this.fuParts.push(payload.subarray(2))
            this.fuLastSequence = sequenceNumber
            this.bufferedBytes += payload.length - 2
        } else {
            this.dropFuBytes()
            this.clearFuRun()
            return
        }
        if (end) {
            this.parts.push(START_CODE, ...this.fuParts)
            this.nalHeaders.push(this.fuParts[0][0])
            this.bufferedBytes += START_CODE.length
            this.clearFuRun()
        }
    }

    private dropFuBytes(): void {
        for (const part of this.fuParts) this.bufferedBytes -= part.length
    }

    private flush(): H264AccessUnit | null {
        if (!this.parts.length || this.timestamp === null) return null
        let size = 0
        for (const part of this.parts) size += part.length
        const data = new Uint8Array(size)
        let offset = 0
        for (const part of this.parts) {
            data.set(part, offset)
            offset += part.length
        }
        let keyFrame = false
        let hasSps = false
        for (let index = 0; index < this.nalHeaders.length; index++) {
            const type = this.nalHeaders[index] & 0x1f
            if (type === NAL_TYPE_IDR) {
                keyFrame = true
                break
            }
            if (type === NAL_TYPE_SPS) hasSps = true
        }
        if (!keyFrame && hasSps) keyFrame = this.spsCarriesIdr(data)
        const result = { timestamp: this.timestamp, data, keyFrame }
        this.reset()
        return result
    }

    /**
     * Whether an SPS of `data` carries an IDR after an embedded start code, reading only SPS
     * bytes. Every NAL in `parts` opens with the shared `START_CODE`, which marks its bounds.
     */
    private spsCarriesIdr(data: Uint8Array): boolean {
        let nal = -1
        let offset = 0
        let spsStart = -1
        for (const part of this.parts) {
            if (part === START_CODE) {
                if (spsStart >= 0 && isH264KeyFrame(data.subarray(spsStart, offset))) return true
                nal++
                const sps = (this.nalHeaders[nal] & 0x1f) === NAL_TYPE_SPS
                spsStart = sps ? offset + START_CODE.length : -1
            }
            offset += part.length
        }
        return spsStart >= 0 && isH264KeyFrame(data.subarray(spsStart))
    }
}
