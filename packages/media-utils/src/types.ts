export interface WaMediaProcessorOptions {
    readonly ffmpegPath?: string
    readonly ffprobePath?: string
    readonly imageThumbMaxEdge?: number
    readonly imageThumbQuality?: number
    readonly waveformPoints?: number
    readonly voiceNoteBitRate?: number
    readonly voiceNoteSampleRate?: number
    readonly voiceNoteApplication?: 'voip' | 'audio'
    readonly onWarning?: (message: string) => void
}
