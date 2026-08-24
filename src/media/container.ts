import { CONTAINER_SCAN_MAX_BYTES } from '@media/constants'

/**
 * Verdict of {@link scanStreamable}: `true` when the payload can be played
 * back while it downloads, `false` when it cannot, `null` while the leading
 * bytes seen so far are not enough to decide.
 */
export type WaStreamableVerdict = boolean | null

const BOX_HEADER_SIZE = 8
const LARGE_BOX_HEADER_SIZE = 16
const LARGE_BOX_SIZE_MARKER = 1
const BOX_TYPE_FTYP = 0x66747970
const BOX_TYPE_MOOV = 0x6d6f6f76
const BOX_TYPE_MDAT = 0x6d646174

function readU32(bytes: Uint8Array, offset: number): number {
    return (
        ((bytes[offset] << 24) |
            (bytes[offset + 1] << 16) |
            (bytes[offset + 2] << 8) |
            bytes[offset + 3]) >>>
        0
    )
}

/**
 * Decides whether a media payload supports progressive playback, by walking
 * the top-level ISO base media file format (mp4/mov/3gp/m4a) boxes over the
 * leading bytes.
 *
 * An ISO-BMFF file is streamable only when its `moov` index box precedes the
 * `mdat` payload box. With `mdat` first, a player has to reach the end of the
 * download before it can start decoding, so advertising the file as seekable
 * (by attaching a streaming sidecar) makes the recipient fail to open it
 * instead of falling back to a plain download.
 *
 * Anything that is not ISO-BMFF - Ogg/Opus voice notes, for instance - is
 * reported as streamable: those containers carry their index inline and have
 * no equivalent failure mode.
 *
 * @param head - Leading bytes of the payload, starting at offset 0.
 * @returns `true` when streamable, `false` when not, `null` when `head` is
 *   too short to tell and the caller should retry with more bytes.
 */
export function scanStreamable(head: Uint8Array): WaStreamableVerdict {
    if (head.byteLength < BOX_HEADER_SIZE) {
        return null
    }
    if (readU32(head, 4) !== BOX_TYPE_FTYP) {
        return true
    }

    let offset = 0
    while (offset + BOX_HEADER_SIZE <= head.byteLength) {
        const type = readU32(head, offset + 4)
        if (type === BOX_TYPE_MOOV) return true
        if (type === BOX_TYPE_MDAT) return false

        let size = readU32(head, offset)
        let headerSize = BOX_HEADER_SIZE
        if (size === LARGE_BOX_SIZE_MARKER) {
            if (offset + LARGE_BOX_HEADER_SIZE > head.byteLength) return null
            if (readU32(head, offset + BOX_HEADER_SIZE) !== 0) return true
            size = readU32(head, offset + BOX_HEADER_SIZE + 4)
            headerSize = LARGE_BOX_HEADER_SIZE
        } else if (size === 0) {
            return true
        }
        if (size < headerSize) return true
        offset += size
        if (offset > CONTAINER_SCAN_MAX_BYTES) return true
    }
    return offset > CONTAINER_SCAN_MAX_BYTES ? true : null
}

/**
 * Incremental front-end for {@link scanStreamable}, for callers that see the
 * payload as a sequence of chunks. Buffers at most
 * {@link CONTAINER_SCAN_MAX_BYTES} leading bytes and settles on `true` once
 * that budget is spent without a verdict.
 */
export class WaStreamableScanner {
    private readonly head = new Uint8Array(CONTAINER_SCAN_MAX_BYTES)
    private headLength = 0
    private settled: WaStreamableVerdict = null

    /** Verdict so far; `null` until enough leading bytes have been seen. */
    get verdict(): WaStreamableVerdict {
        return this.settled
    }

    /** Feeds the next payload chunk. Ignored once the verdict has settled. */
    push(chunk: Uint8Array): void {
        if (this.settled !== null || chunk.byteLength === 0) {
            return
        }
        const room = this.head.byteLength - this.headLength
        if (room > 0) {
            const copied = Math.min(room, chunk.byteLength)
            this.head.set(chunk.subarray(0, copied), this.headLength)
            this.headLength += copied
        }
        this.settled = scanStreamable(this.head.subarray(0, this.headLength))
        if (this.settled === null && this.headLength === this.head.byteLength) {
            this.settled = true
        }
    }

    /** Verdict to use once the payload has ended, defaulting to streamable. */
    finish(): boolean {
        return this.settled ?? true
    }
}
