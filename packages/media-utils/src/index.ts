import type {
    WaMediaProcessor,
    WaMediaProcessorCallContext,
    WaMediaProcessorInput
} from 'zapo-js/media'
import { toError } from 'zapo-js/util'

import {
    computeWaveformWithFfmpeg,
    generateVideoThumbnailWithFfmpeg,
    normalizeVoiceNoteWithFfmpeg,
    probeWithFfmpeg
} from './ffmpeg'
import { generateImageThumbnail, generateStickerThumbnail } from './sharp'
import type { WaMediaProcessorOptions } from './types'

export type { WaMediaProcessorOptions } from './types'

/**
 * Builds a {@link WaMediaProcessor} backed by `sharp` (image/sticker
 * thumbnails) and `ffmpeg` / `ffprobe` (video thumbnails, audio probing,
 * waveform extraction, voice-note normalization). Plug the result into
 * `WaClientOptions.media.processor` to enable automatic thumbnail/
 * waveform generation on outgoing media.
 *
 * Missing binaries are non-fatal: `ffmpeg`/`ffprobe` absence skips the
 * affected operation and emits a `warn` through `ctx.logger` (when set).
 *
 * Logging is wired automatically: each `WaClient` passes its own
 * `Logger` via the per-call `ctx` argument the runtime fills in. The
 * processor itself is **stateless with respect to logging**, so a single
 * processor instance can be safely shared across multiple `WaClient`
 * sessions - each invocation lands its warnings in the right session
 * logger (with the right `{ session }` binding).
 *
 * @example
 * ```ts
 * import { WaClient } from 'zapo-js'
 * import { createMediaProcessor } from '@zapo-js/media-utils'
 *
 * // One processor, multiple sessions - safe.
 * const processor = createMediaProcessor()
 * const a = new WaClient({ store, sessionId: 'a', media: { processor } })
 * const b = new WaClient({ store, sessionId: 'b', media: { processor } })
 * ```
 */
export function createMediaProcessor(options?: WaMediaProcessorOptions): WaMediaProcessor {
    const opts = options ?? {}

    return {
        async generateImageThumbnail(input: WaMediaProcessorInput, maxEdge: number) {
            return generateImageThumbnail(
                input,
                opts.imageThumbMaxEdge ?? maxEdge,
                opts.imageThumbQuality
            )
        },

        async generateVideoThumbnail(
            input: WaMediaProcessorInput,
            maxEdge: number,
            ctx?: WaMediaProcessorCallContext
        ) {
            return generateVideoThumbnailWithFfmpeg(
                input,
                opts.imageThumbMaxEdge ?? maxEdge,
                opts.ffmpegPath,
                ctx?.logger
            )
        },

        async probeMedia(input: WaMediaProcessorInput, ctx?: WaMediaProcessorCallContext) {
            return (await probeWithFfmpeg(input, opts.ffprobePath, ctx?.logger)) ?? {}
        },

        async computeWaveform(input: WaMediaProcessorInput, ctx?: WaMediaProcessorCallContext) {
            return computeWaveformWithFfmpeg(
                input,
                opts.ffmpegPath,
                opts.waveformPoints,
                ctx?.logger
            )
        },

        async normalizeVoiceNote(input: WaMediaProcessorInput, ctx?: WaMediaProcessorCallContext) {
            return normalizeVoiceNoteWithFfmpeg(input, {
                bitRate: opts.voiceNoteBitRate,
                sampleRate: opts.voiceNoteSampleRate,
                application: opts.voiceNoteApplication,
                ffmpegPath: opts.ffmpegPath,
                logger: ctx?.logger
            })
        },

        async generateStickerThumbnail(input: WaMediaProcessorInput, maxEdge: number) {
            return generateStickerThumbnail(input, maxEdge)
        },

        async detectMimetype(input: string | Uint8Array, ctx?: WaMediaProcessorCallContext) {
            try {
                const fileType = await import('file-type')
                const result =
                    typeof input === 'string'
                        ? await fileType.fileTypeFromFile(input)
                        : await fileType.fileTypeFromBuffer(input)
                return result?.mime ?? null
            } catch (error) {
                ctx?.logger?.warn('detectMimetype failed', {
                    message: toError(error).message
                })
                return null
            }
        }
    }
}
