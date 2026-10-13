/** The packetizer and key-frame scan as they stood before the single-scan rewrite, kept as an oracle. */

const NAL_TYPE_IDR = 5
const NAL_TYPE_SPS = 7
const NAL_TYPE_STAP_A = 24
const STAP_A_MAX_NAL = 0xffff

export function referencePacketize(data: Uint8Array, maxPayload = 1100): Uint8Array[] {
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
    const keyFrameSps = keyFrameSpsIndex(nals)
    if (keyFrameSps >= 0) {
        const aggregated = stapA(nals, maxPayload)
        if (aggregated) return [aggregated]
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
    return payloads
}

function keyFrameSpsIndex(nals: readonly Uint8Array[]): number {
    let sps = -1
    for (let i = 0; i < nals.length; i++) {
        const type = nals[i][0] & 0x1f
        if (type === NAL_TYPE_IDR) return sps
        if (type === NAL_TYPE_SPS && sps < 0) sps = i
    }
    return -1
}

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

export function referenceIsKeyFrame(data: Uint8Array): boolean {
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
