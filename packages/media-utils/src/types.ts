/**
 * Tuning knobs for the {@link createMediaProcessor} factory. Every field
 * is optional; defaults match what the official WhatsApp clients produce.
 *
 * For logging, this package does not accept a callback. The runtime
 * passes a `Logger` per call via the `ctx` argument the
 * `WaMediaProcessor` methods receive, so all warnings flow into the same
 * `Logger` the rest of the runtime uses - including any per-session
 * bindings the caller has attached. Without a runtime-supplied `ctx`,
 * the processor stays silent.
 */
export interface WaMediaProcessorOptions {
    /**
     * Override path/command for `ffmpeg`. Defaults to `'ffmpeg'` resolved
     * from `PATH`. Set when shipping a vendored binary or sandboxing the
     * runtime.
     */
    readonly ffmpegPath?: string
    /** Override path/command for `ffprobe`. Defaults to `'ffprobe'` resolved from `PATH`. */
    readonly ffprobePath?: string
    /**
     * When set, overrides the per-call `maxEdge` from
     * `WaMediaProcessor.generateImageThumbnail` / `generateVideoThumbnail`
     * callers. Leave unset to honor the caller's request.
     */
    readonly imageThumbMaxEdge?: number
    /** JPEG quality (1-100) for image thumbnails generated via `sharp`. */
    readonly imageThumbQuality?: number
    /**
     * Number of waveform sample points generated for voice notes (drawn
     * as the play-bar visualization on the recipient side). WhatsApp's
     * default is 64.
     */
    readonly waveformPoints?: number
    /** Opus bit-rate (bps) for voice-note normalization. */
    readonly voiceNoteBitRate?: number
    /** Sample rate (Hz) for voice-note normalization. */
    readonly voiceNoteSampleRate?: number
    /** Opus `application` flag - `'voip'` favors speech, `'audio'` favors general audio. */
    readonly voiceNoteApplication?: 'voip' | 'audio'
}
