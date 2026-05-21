import type { WaMediaProcessor, WaMediaProcessorInput } from 'zapo-js/media'

import {
    computeWaveformWithFfmpeg,
    generateVideoThumbnailWithFfmpeg,
    normalizeVoiceNoteWithFfmpeg,
    probeWithFfmpeg
} from './ffmpeg'
import { generateImageThumbnail, generateStickerThumbnail } from './sharp'
import type { WaMediaProcessorOptions } from './types'

export type { WaMediaProcessorOptions } from './types'

export function createMediaProcessor(options?: WaMediaProcessorOptions): WaMediaProcessor {
    const opts = options ?? {}
    const warn = opts.onWarning

    return {
        async generateImageThumbnail(input: WaMediaProcessorInput, maxEdge: number) {
            return generateImageThumbnail(
                input,
                opts.imageThumbMaxEdge ?? maxEdge,
                opts.imageThumbQuality
            )
        },

        async generateVideoThumbnail(input: WaMediaProcessorInput, maxEdge: number) {
            return generateVideoThumbnailWithFfmpeg(
                input,
                opts.imageThumbMaxEdge ?? maxEdge,
                opts.ffmpegPath,
                warn
            )
        },

        async probeMedia(input: WaMediaProcessorInput) {
            return (await probeWithFfmpeg(input, opts.ffprobePath, warn)) ?? {}
        },

        async computeWaveform(input: WaMediaProcessorInput) {
            return computeWaveformWithFfmpeg(input, opts.ffmpegPath, opts.waveformPoints, warn)
        },

        async normalizeVoiceNote(input: WaMediaProcessorInput) {
            return normalizeVoiceNoteWithFfmpeg(input, {
                bitRate: opts.voiceNoteBitRate,
                sampleRate: opts.voiceNoteSampleRate,
                application: opts.voiceNoteApplication,
                ffmpegPath: opts.ffmpegPath,
                onWarning: warn
            })
        },

        async generateStickerThumbnail(input: WaMediaProcessorInput, maxEdge: number) {
            return generateStickerThumbnail(input, maxEdge)
        }
    }
}
