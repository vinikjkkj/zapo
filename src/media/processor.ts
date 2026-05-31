import type { Readable } from 'node:stream'

import type { Logger } from '@infra/log/types'

export interface WaMediaProcessorImageResult {
    readonly jpegThumbnail: Uint8Array
    readonly width: number
    readonly height: number
}

export interface WaMediaProcessorStickerThumbnailResult {
    readonly pngThumbnail: Uint8Array
    readonly width: number
    readonly height: number
}

export interface WaMediaProcessorProbeResult {
    readonly durationSeconds?: number
    readonly width?: number
    readonly height?: number
}

export interface WaMediaProcessorWaveformResult {
    readonly waveform: Uint8Array
    readonly durationSeconds: number
}

export type WaMediaProcessorInput = Uint8Array | Readable | string

/**
 * Per-call context the runtime passes to every {@link WaMediaProcessor}
 * method. Currently carries an optional `logger` so the processor can
 * emit warnings (missing binary, probe failure, ...) through the same
 * `Logger` the caller is using - including any session/scope bindings
 * the caller has already attached. The processor must stay stateless
 * with respect to the logger: a single processor instance shared across
 * multiple `WaClient` sessions receives a different `ctx.logger` per
 * call and must not cache it.
 */
export interface WaMediaProcessorCallContext {
    readonly logger?: Logger
}

export interface WaMediaProcessor {
    readonly generateImageThumbnail?: (
        input: WaMediaProcessorInput,
        maxEdge: number,
        ctx?: WaMediaProcessorCallContext
    ) => Promise<WaMediaProcessorImageResult>

    readonly generateVideoThumbnail?: (
        input: WaMediaProcessorInput,
        maxEdge: number,
        ctx?: WaMediaProcessorCallContext
    ) => Promise<WaMediaProcessorImageResult | null>

    readonly probeMedia?: (
        input: WaMediaProcessorInput,
        ctx?: WaMediaProcessorCallContext
    ) => Promise<WaMediaProcessorProbeResult>

    readonly computeWaveform?: (
        input: WaMediaProcessorInput,
        ctx?: WaMediaProcessorCallContext
    ) => Promise<WaMediaProcessorWaveformResult | null>

    readonly normalizeVoiceNote?: (
        input: WaMediaProcessorInput,
        ctx?: WaMediaProcessorCallContext
    ) => Promise<Readable | null>

    readonly generateStickerThumbnail?: (
        input: WaMediaProcessorInput,
        maxEdge: number,
        ctx?: WaMediaProcessorCallContext
    ) => Promise<WaMediaProcessorStickerThumbnailResult>

    /**
     * Infers the input's mime type (e.g. via magic-byte sniffing). Accepts the
     * resolved on-disk shape: a path or a buffer; the message builder always
     * stages streams to a temp file before calling this. Returns `null` when
     * the type can't be determined.
     */
    readonly detectMimetype?: (
        input: string | Uint8Array,
        ctx?: WaMediaProcessorCallContext
    ) => Promise<string | null>
}
