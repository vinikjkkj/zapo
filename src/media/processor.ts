import type { Readable } from 'node:stream'

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

export interface WaMediaProcessor {
    readonly generateImageThumbnail?: (
        input: WaMediaProcessorInput,
        maxEdge: number
    ) => Promise<WaMediaProcessorImageResult>

    readonly generateVideoThumbnail?: (
        input: WaMediaProcessorInput,
        maxEdge: number
    ) => Promise<WaMediaProcessorImageResult | null>

    readonly probeMedia?: (input: WaMediaProcessorInput) => Promise<WaMediaProcessorProbeResult>

    readonly computeWaveform?: (
        input: WaMediaProcessorInput
    ) => Promise<WaMediaProcessorWaveformResult | null>

    readonly generateStickerThumbnail?: (
        input: WaMediaProcessorInput,
        maxEdge: number
    ) => Promise<WaMediaProcessorStickerThumbnailResult>
}
