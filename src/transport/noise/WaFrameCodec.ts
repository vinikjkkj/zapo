import { EMPTY_BYTES } from '@util/bytes'

const WA_MAX_FRAME_LENGTH = (1 << 24) - 1

function frameLength(header: Uint8Array): number {
    return (header[0] << 16) | (header[1] << 8) | header[2]
}
export class WaFrameCodec {
    private readonly introFrame: Uint8Array | null
    private readonly maxFrameLength: number
    private introSent: boolean
    private buffered: Uint8Array
    private bufferedLength: number

    public constructor(introFrame?: Uint8Array, maxFrameLength = WA_MAX_FRAME_LENGTH) {
        if (!Number.isSafeInteger(maxFrameLength) || maxFrameLength <= 0) {
            throw new Error('maxFrameLength must be a positive safe integer')
        }
        if (maxFrameLength >= 1 << 24) {
            throw new Error('maxFrameLength must be lower than protocol limit (16777216)')
        }
        this.introFrame = introFrame && introFrame.length > 0 ? introFrame : null
        this.maxFrameLength = maxFrameLength
        this.introSent = false
        this.buffered = EMPTY_BYTES
        this.bufferedLength = 0
    }

    private assertFrameLength(length: number): void {
        if (length <= this.maxFrameLength) {
            return
        }
        throw new Error(
            `incoming frame is too large: ${length} bytes (max allowed: ${this.maxFrameLength})`
        )
    }

    private appendBuffered(chunk: Uint8Array): void {
        if (chunk.length === 0) {
            return
        }
        if (this.bufferedLength === 0) {
            this.buffered = chunk
        } else {
            const nextLength = this.bufferedLength + chunk.length
            if (this.buffered.length < nextLength) {
                const nextBuffered = new Uint8Array(Math.max(nextLength, this.bufferedLength * 2))
                nextBuffered.set(this.buffered.subarray(0, this.bufferedLength))
                this.buffered = nextBuffered
            }
            this.buffered.set(chunk, this.bufferedLength)
        }
        this.bufferedLength += chunk.length
    }

    public encodeFrame(frame: Uint8Array): Uint8Array {
        if (frame.length > this.maxFrameLength) {
            throw new Error(
                `frame is too large: ${frame.length} bytes (max allowed: ${this.maxFrameLength})`
            )
        }
        if (!this.introSent && this.introFrame) {
            this.introSent = true
            const out = new Uint8Array(this.introFrame.length + 3 + frame.length)
            out.set(this.introFrame, 0)
            const headerOffset = this.introFrame.length
            out[headerOffset] = (frame.length >> 16) & 0xff
            out[headerOffset + 1] = (frame.length >> 8) & 0xff
            out[headerOffset + 2] = frame.length & 0xff
            out.set(frame, headerOffset + 3)
            return out
        }

        this.introSent = true
        const out = new Uint8Array(3 + frame.length)
        out[0] = (frame.length >> 16) & 0xff
        out[1] = (frame.length >> 8) & 0xff
        out[2] = frame.length & 0xff
        out.set(frame, 3)
        return out
    }

    public pushWireChunk(chunk: Uint8Array): readonly Uint8Array[] {
        if (chunk.length === 0) {
            return []
        }
        const frames: Uint8Array[] = []
        let chunkOffset = 0
        if (this.bufferedLength > 0) {
            if (this.bufferedLength < 3) {
                const missingHeaderBytes = 3 - this.bufferedLength
                if (chunk.length < missingHeaderBytes) {
                    this.appendBuffered(chunk)
                    return frames
                }
                this.appendBuffered(chunk.subarray(0, missingHeaderBytes))
                const length = frameLength(this.buffered)
                this.assertFrameLength(length)
                const remainingAfterHeader = chunk.length - missingHeaderBytes
                if (remainingAfterHeader < length) {
                    this.appendBuffered(chunk.subarray(missingHeaderBytes))
                    return frames
                }
                frames.push(chunk.subarray(missingHeaderBytes, missingHeaderBytes + length))
                chunkOffset = missingHeaderBytes + length
            } else {
                const length = frameLength(this.buffered)
                this.assertFrameLength(length)
                const bufferedPayloadLength = this.bufferedLength - 3
                const missingPayloadBytes = length - bufferedPayloadLength
                if (missingPayloadBytes > chunk.length) {
                    this.appendBuffered(chunk)
                    return frames
                }
                if (missingPayloadBytes === 0) {
                    frames.push(this.buffered.subarray(3, 3 + length))
                } else if (bufferedPayloadLength === 0) {
                    frames.push(chunk.subarray(0, missingPayloadBytes))
                } else {
                    const frame = new Uint8Array(length)
                    frame.set(this.buffered.subarray(3, this.bufferedLength))
                    frame.set(chunk.subarray(0, missingPayloadBytes), bufferedPayloadLength)
                    frames.push(frame)
                }
                chunkOffset = missingPayloadBytes
            }
            this.buffered = EMPTY_BYTES
            this.bufferedLength = 0
        }
        const remainingChunk = chunk.subarray(chunkOffset)
        let offset = 0
        while (remainingChunk.length - offset >= 3) {
            const header = remainingChunk.subarray(offset, offset + 3)
            const length = frameLength(header)
            this.assertFrameLength(length)
            if (remainingChunk.length - offset - 3 < length) {
                break
            }
            const start = offset + 3
            const end = start + length
            frames.push(remainingChunk.subarray(start, end))
            offset = end
        }
        this.buffered =
            offset >= remainingChunk.length ? EMPTY_BYTES : remainingChunk.subarray(offset)
        this.bufferedLength = this.buffered.length
        return frames
    }
}
