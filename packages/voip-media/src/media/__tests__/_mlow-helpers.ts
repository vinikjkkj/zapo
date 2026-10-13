import { createNoopLogger, type Logger } from '../../logger.js'
import { MLowCodec } from '../mlow-codec.js'
import { MLOW_MAX_SUBFRAMES, mlowPacketSamples, readMlowRed, writeMlowRed } from '../mlow-packet.js'

import { ANDROID_PT121_STREAM, WEB_PT121_STREAM } from './_mlow-captures.js'

export function voicedFrame(offset = 0): Float32Array {
    const frame = new Float32Array(960)
    for (let i = 0; i < frame.length; i++) {
        frame[i] = Math.sin((2 * Math.PI * 440 * (i + offset)) / 16_000) * 0.25
    }
    return frame
}

export function captureWarnings(): { logger: Logger; warnings: string[] } {
    const warnings: string[] = []
    const logger: Logger = {
        ...createNoopLogger(),
        warn: (message: string) => {
            warnings.push(message)
        },
        child: () => logger
    }
    return { logger, warnings }
}

export interface RedundantPacket {
    readonly sequenceNumber: number
    readonly timestamp: number
    readonly payload: Uint8Array
    readonly primary: Uint8Array
    readonly copy: Uint8Array | null
}

/** RED as the plane sends it: the copy of the frame before, then the frame, at the copy's slot. */
export async function redundantPackets(count: number): Promise<RedundantPacket[]> {
    const sender = await MLowCodec.create({ red: true })
    try {
        const packets: RedundantPacket[] = []
        let copy: Uint8Array | null = null
        for (let index = 0; index < count; index++) {
            const primary = sender.encode(voicedFrame(index * 960))
            packets.push({
                sequenceNumber: index + 1,
                timestamp: copy ? (index - 1) * 960 : 0,
                payload: copy ? sender.packFrames([copy, primary]) : primary,
                primary,
                copy
            })
            copy = sender.lastSecondary
        }
        return packets
    } finally {
        sender.destroy()
    }
}

/** The PT 121 check the receive path made before the shared read: two reads into one array. */
export function parsesAsMlow(payload: Uint8Array): boolean {
    const bounds = new Int32Array(MLOW_MAX_SUBFRAMES * 2)
    return mlowPacketSamples(payload, bounds) > 0 || readMlowRed(payload, bounds) >= 0
}

/** Captured PT 121 audio, in-band RED of it, multiframes and malformed packets, in that order. */
export async function pt121Corpus(): Promise<Uint8Array[]> {
    const captured = [...ANDROID_PT121_STREAM.packets, ...WEB_PT121_STREAM.packets].map(
        ({ payload }) => payload
    )
    const red = captured.slice(1).map((primary, index) => {
        const target = new Uint8Array(512)
        return target.slice(0, writeMlowRed(target, primary, 1920, [captured[index]], [960]))
    })
    const sender = await MLowCodec.create()
    const multiframes: Uint8Array[] = []
    try {
        for (let packet = 0; packet < 4; packet++) {
            const a = sender.encode(voicedFrame(packet * 1920))
            const b = sender.encode(voicedFrame(packet * 1920 + 960))
            multiframes.push(sender.packFrames([a, b]))
        }
    } finally {
        sender.destroy()
    }
    const malformed = [
        new Uint8Array(0),
        Uint8Array.of(0xfc, 0xff, 0xfe),
        Uint8Array.of(0x92, 0x02, 0xff, 0x50),
        Uint8Array.of(0x92, 0x02, 0x01, 0x50, 0xc0),
        Uint8Array.of(0x92, 0x02, 0x01, 0xfc, 0x50, 0x50)
    ]
    let seed = 0x2545f491
    const random: Uint8Array[] = []
    for (let index = 0; index < 4000; index++) {
        seed = (seed * 1103515245 + 12345) >>> 0
        const packet = new Uint8Array(seed % 24)
        for (let byte = 0; byte < packet.length; byte++) {
            seed = (seed * 1103515245 + 12345) >>> 0
            packet[byte] = byte < 3 && seed & 1 ? 0x80 | (seed >>> 8) : seed >>> 16
        }
        random.push(packet)
    }
    return [...captured, ...red, ...multiframes, ...malformed, ...random]
}
