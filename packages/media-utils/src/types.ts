export interface WaMediaProcessorOptions {
    readonly ffmpegPath?: string
    readonly ffprobePath?: string
    readonly imageThumbMaxEdge?: number
    readonly imageThumbQuality?: number
    readonly waveformPoints?: number
    readonly onWarning?: (message: string) => void
}
