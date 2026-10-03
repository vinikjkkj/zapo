const START_CODE = new Uint8Array([0, 0, 0, 1])

/** Coded slice of an IDR picture: the only NAL type that makes a key frame. */
const NAL_TYPE_IDR = 5

export interface H264AccessUnit {
    readonly timestamp: number
    readonly data: Uint8Array
    readonly keyFrame: boolean
}

/**
 * Packetizes an Annex-B access unit into RFC 6184 single-NAL/FU-A payloads.
 * Single-NAL payloads are views into `data`, not copies, so they stay valid
 * only until the caller reuses that buffer.
 */
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
            payloads.push(nal)
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

/**
 * Reports whether an Annex-B access unit carries an IDR slice. SPS and PPS do
 * not count: encoders repeat those parameter sets ahead of every frame, so
 * accepting them would flag every delta frame as a key frame.
 */
export function isH264KeyFrame(data: Uint8Array): boolean {
    let startCodes = 0
    for (let i = 0; i + 3 < data.length; ) {
        if (data[i] === 0 && data[i + 1] === 0) {
            if (data[i + 2] === 1) {
                startCodes++
                if ((data[i + 3] & 0x1f) === NAL_TYPE_IDR) return true
                i += 4
                continue
            }
            if (data[i + 2] === 0 && data[i + 3] === 1) {
                startCodes++
                if (i + 4 < data.length && (data[i + 4] & 0x1f) === NAL_TYPE_IDR) return true
                i += 5
                continue
            }
        }
        i++
    }
    if (!startCodes && data.length) return (data[0] & 0x1f) === NAL_TYPE_IDR
    return false
}

/**
 * RFC 6184 depacketizer for single NAL, STAP-A and FU-A payloads.
 *
 * The key-frame flag is derived at flush time from the headers of the NAL
 * units that actually made it into the access unit, never from the fragments
 * seen on the way in. A fragment run that is abandoned, replaced or dropped
 * therefore cannot mark or unmark the frame it never joined, which keeps the
 * flag correct no matter in what order the packets arrive.
 */
/** RTP sequence numbers wrap at this modulus; used to test fragment contiguity. */
const SEQUENCE_MODULUS = 0x10000

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
     * @param sequenceNumber RTP sequence number of `payload`. Required to tell a
     * genuine FU-A continuation apart from an orphaned fragment that happens to
     * share the NAL type of whatever run is already open: {@link appendFuA}
     * only accepts a continuation whose sequence number immediately follows the
     * last fragment it appended.
     */
    push(
        payload: Uint8Array,
        timestamp: number,
        marker: boolean,
        sequenceNumber: number
    ): H264AccessUnit[] {
        if (!payload.length) return []
        const completed: H264AccessUnit[] = []
        let previous: H264AccessUnit | null = null
        if (this.timestamp !== null && this.timestamp !== timestamp) {
            /**
             * Some senders omit the marker, so a timestamp change also ends a
             * frame. A fragment run still mid-assembly belongs to the frame
             * that is ending: drop the incomplete NAL but keep the NAL units
             * that already completed, or one late fragment takes the whole
             * access unit down with it.
             */
            previous = this.flush()
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
        else if (type === 28) this.appendFuA(payload, sequenceNumber)
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
        this.nalHeaders.length = 0
        this.fuParts = []
        this.fuNalType = H264Depacketizer.NO_FU_RUN
        this.fuLastSequence = H264Depacketizer.NO_FU_RUN
        this.bufferedBytes = 0
    }

    private resetFrame(timestamp: number): void {
        this.parts = []
        this.nalHeaders.length = 0
        this.fuParts = []
        this.fuNalType = H264Depacketizer.NO_FU_RUN
        this.fuLastSequence = H264Depacketizer.NO_FU_RUN
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
        this.parts.push(START_CODE, nal.slice())
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

    private appendFuA(payload: Uint8Array, sequenceNumber: number): void {
        if (payload.length < 2) return
        const indicator = payload[0]
        const header = payload[1]
        const start = (header & 0x80) !== 0
        const end = (header & 0x40) !== 0
        const nalType = header & 0x1f
        if (start) {
            for (const part of this.fuParts) this.bufferedBytes -= part.length
            this.fuParts = [new Uint8Array([(indicator & 0xe0) | nalType]), payload.slice(2)]
            this.fuNalType = nalType
            this.fuLastSequence = sequenceNumber
            this.bufferedBytes += payload.length - 1
        } else if (this.fuNalType === nalType) {
            if (sequenceNumber === (this.fuLastSequence + 1) % SEQUENCE_MODULUS) {
                this.fuParts.push(payload.slice(2))
                this.fuLastSequence = sequenceNumber
                this.bufferedBytes += payload.length - 2
            } else {
                /**
                 * Same NAL type as the run in flight, but not the next sequence
                 * number after the last fragment it appended: a fragment between
                 * the two was lost or reordered away. Matching on type alone is
                 * not enough here, because consecutive NALs commonly share a
                 * type (slices are all type 1), so the very next run can look
                 * like a continuation of this one. Abandon the run instead of
                 * splicing this fragment onto it, or the decoder gets a corrupt
                 * NAL under the wrong header.
                 */
                for (const part of this.fuParts) this.bufferedBytes -= part.length
                this.fuParts = []
                this.fuNalType = H264Depacketizer.NO_FU_RUN
                this.fuLastSequence = H264Depacketizer.NO_FU_RUN
                return
            }
        } else {
            /**
             * A continuation fragment whose type does not match the run in
             * flight: its start fragment was lost or reordered away. Appending
             * it to whatever run happens to be open would splice one NAL into
             * another and hand the decoder a corrupt unit under the wrong
             * header. The run already in flight is left untouched, since this
             * fragment does not prove anything about it.
             */
            return
        }
        if (end) {
            this.parts.push(START_CODE, ...this.fuParts)
            this.nalHeaders.push(this.fuParts[0][0])
            this.fuParts = []
            this.fuNalType = H264Depacketizer.NO_FU_RUN
            this.fuLastSequence = H264Depacketizer.NO_FU_RUN
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
        let keyFrame = false
        for (let index = 0; index < this.nalHeaders.length; index++) {
            if ((this.nalHeaders[index] & 0x1f) === NAL_TYPE_IDR) {
                keyFrame = true
                break
            }
        }
        const result = { timestamp: this.timestamp, data, keyFrame }
        this.reset()
        return result
    }
}
