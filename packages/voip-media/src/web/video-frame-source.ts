/** Turns a video track into a pull stream of VideoFrames. */

export interface VideoFrameSource {
    /** The next frame, or `null` once the track ended or the source was closed. */
    next(): Promise<VideoFrame | null>
    close(): void
}

/** Chrome's `MediaStreamTrackProcessor`, which TypeScript's DOM library does not carry. */
interface TrackProcessorConstructor {
    new (init: { readonly track: MediaStreamTrack }): {
        readonly readable: ReadableStream<VideoFrame>
    }
}

/** Opens a frame source: Chrome's track processor if present, else a sampled video element. */
export async function openFrameSource(
    track: MediaStreamTrack,
    frameRate: number
): Promise<VideoFrameSource> {
    const Processor = (globalThis as { MediaStreamTrackProcessor?: TrackProcessorConstructor })
        .MediaStreamTrackProcessor
    if (Processor) return openProcessorSource(new Processor({ track }).readable)
    return openElementSource(track, frameRate)
}

function openProcessorSource(readable: ReadableStream<VideoFrame>): VideoFrameSource {
    const reader = readable.getReader()
    let closed = false
    return {
        async next() {
            if (closed) return null
            const { value, done } = await reader.read()
            if (done || !value) return null
            if (closed) {
                value.close()
                return null
            }
            return value
        },
        close() {
            if (closed) return
            closed = true
            reader.cancel().catch(() => undefined)
        }
    }
}

/** Samples a muted video element playing the track; throttled while the tab is hidden. */
async function openElementSource(
    track: MediaStreamTrack,
    frameRate: number
): Promise<VideoFrameSource> {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = new MediaStream([track])
    await video.play()

    const intervalMs = 1000 / frameRate
    let closed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let wake: (() => void) | null = null
    return {
        async next() {
            while (!closed) {
                await new Promise<void>((resolve) => {
                    wake = resolve
                    timer = setTimeout(resolve, intervalMs)
                })
                wake = null
                if (closed) return null
                if (track.readyState === 'ended') return null
                if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                    return new VideoFrame(video, { timestamp: 0 })
                }
            }
            return null
        },
        close() {
            if (closed) return
            closed = true
            if (timer !== null) clearTimeout(timer)
            wake?.()
            video.pause()
            video.srcObject = null
        }
    }
}
