import assert from 'node:assert/strict'
import test from 'node:test'

import { WaFrameCodec } from '@transport/noise/WaFrameCodec'
import { bytesToHex, concatBytes } from '@util/bytes'

function frame(length: number, seed: number): Uint8Array {
    const out = new Uint8Array(length)
    for (let i = 0; i < length; i += 1) {
        out[i] = (seed * 31 + i * 7 + 3) & 0xff
    }
    return out
}

test('frame codec reassembles frames identically across every chunking pattern', () => {
    const frames = [
        frame(1, 1),
        frame(3, 2),
        frame(10, 3),
        frame(100, 4),
        frame(4095, 5),
        frame(4096, 6),
        frame(5000, 7),
        frame(100_000, 8)
    ]
    const encoder = new WaFrameCodec()
    const wire = concatBytes(frames.map((f) => encoder.encodeFrame(f)))

    for (const chunkSize of [1, 2, 3, 5, 7, 13, 64, 4096, 8192, wire.length]) {
        const codec = new WaFrameCodec()
        const received: Uint8Array[] = []
        for (let repeat = 0; repeat < 2; repeat += 1) {
            for (let offset = 0; offset < wire.length; offset += chunkSize) {
                const chunk = wire.subarray(offset, Math.min(offset + chunkSize, wire.length))
                for (const out of codec.pushWireChunk(chunk)) {
                    received.push(out.slice())
                }
            }
        }
        assert.equal(received.length, frames.length * 2, `chunkSize=${chunkSize}`)
        for (let i = 0; i < received.length; i += 1) {
            assert.equal(
                bytesToHex(received[i]),
                bytesToHex(frames[i % frames.length]),
                `chunkSize=${chunkSize} frame=${i}`
            )
        }
    }
})
