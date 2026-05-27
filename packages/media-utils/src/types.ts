/**
 * Tuning knobs for the {@link createMediaProcessor} factory. Every field
 * is optional; defaults match what the official WhatsApp clients produce.
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
    /**
     * Callback for non-fatal warnings (missing ffmpeg/ffprobe, probe
     * field coercion failures, etc.). The processor never throws on
     * missing binaries - it skips the feature and forwards a warning.
     */
    readonly onWarning?: (message: string) => void
}
