import {
    WA_CALL_AUDIO_PROCESSOR,
    WA_CALL_AUDIO_SAMPLE_RATE,
    WA_CALL_AUDIO_STOP_MESSAGE,
    WA_CALL_AUDIO_WORKLET_SOURCE
} from './call-audio-worklet.js'

/** The two plane methods the adapter drives; a `WaCallMediaPlane` satisfies it. */
export interface WaCallAudioSink {
    /**
     * Takes microphone samples, 16 kHz mono, at any length. `capturedAtMs` is the
     * `performance.now()` instant of `samples[0]`; absent, the block is taken as just captured.
     */
    pushCapture(samples: Float32Array, capturedAtMs?: number): void
    /** Fills `out` with speaker samples, 16 kHz mono, and returns how many were real audio. */
    pullPlayout(out: Float32Array): number
}

export interface WaWebCallAudioOptions {
    /**
     * Microphone to capture. Default: `getUserMedia` with echo cancellation, noise suppression
     * and auto gain. A stream passed in is not stopped by `stop()`.
     */
    readonly microphone?: MediaStream
    /**
     * Context to run in. Default: a new 16 kHz `AudioContext`, or the device rate if refused.
     * A context passed in is neither closed by `stop()` nor resumed.
     */
    readonly audioContext?: AudioContext
    /**
     * URL of the worklet module; default a Blob URL. For a CSP that forbids `blob:`, serve
     * `WA_CALL_AUDIO_WORKLET_SOURCE` as a file and pass its URL.
     */
    readonly workletUrl?: string
}

/** Echo cancellation, noise suppression and gain come from the browser; the codec does none. */
const DEFAULT_MICROPHONE_CONSTRAINTS: MediaStreamConstraints = {
    audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    }
}

/** Mono in and out: the browser down- and upmixes, so the processor handles one channel. */
const WORKLET_NODE_OPTIONS: AudioWorkletNodeOptions = {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers'
}

interface WaWebCallAudioParts {
    readonly sink: WaCallAudioSink
    readonly context: AudioContext
    readonly ownsContext: boolean
    readonly microphone: MediaStream
    readonly ownsMicrophone: boolean
    readonly source: MediaStreamAudioSourceNode
    readonly node: AudioWorkletNode
}

/**
 * Carries a call's audio between the browser's microphone and speaker and a sink. The audio
 * device's clock paces both directions, so a throttled background tab does not starve it.
 * Call {@link start} from a user gesture, or `getUserMedia` and the context may stall.
 */
export class WaWebCallAudio {
    private readonly sink: WaCallAudioSink
    private readonly context: AudioContext
    private readonly ownsContext: boolean
    private readonly microphone: MediaStream
    private readonly ownsMicrophone: boolean
    private readonly source: MediaStreamAudioSourceNode
    private readonly node: AudioWorkletNode
    private stopping: Promise<void> | null = null

    private constructor(parts: WaWebCallAudioParts) {
        this.sink = parts.sink
        this.context = parts.context
        this.ownsContext = parts.ownsContext
        this.microphone = parts.microphone
        this.ownsMicrophone = parts.ownsMicrophone
        this.source = parts.source
        this.node = parts.node
        this.node.port.onmessage = this.onCaptureBlock
    }

    /**
     * Opens the microphone and speaker and carries audio to and from `sink`, releasing all on
     * failure. The context is created before the first `await`, inside the user gesture.
     */
    static async start(
        sink: WaCallAudioSink,
        options: WaWebCallAudioOptions = {}
    ): Promise<WaWebCallAudio> {
        const ownsContext = options.audioContext === undefined
        let context = options.audioContext ?? createCallAudioContext()
        const ownsMicrophone = options.microphone === undefined
        let microphone = options.microphone ?? null

        try {
            microphone ??= await navigator.mediaDevices.getUserMedia(DEFAULT_MICROPHONE_CONSTRAINTS)

            let source: MediaStreamAudioSourceNode
            try {
                source = context.createMediaStreamSource(microphone)
            } catch (error) {
                // Firefox refuses a mic at a foreign rate: fall back to the device rate.
                if (!ownsContext || context.sampleRate !== WA_CALL_AUDIO_SAMPLE_RATE) throw error
                await closeContext(context)
                context = new AudioContext()
                source = context.createMediaStreamSource(microphone)
            }

            await loadWorkletModule(context, options.workletUrl)
            const node = new AudioWorkletNode(
                context,
                WA_CALL_AUDIO_PROCESSOR,
                WORKLET_NODE_OPTIONS
            )
            const audio = new WaWebCallAudio({
                sink,
                context,
                ownsContext,
                microphone,
                ownsMicrophone,
                source,
                node
            })
            source.connect(node)
            node.connect(context.destination)
            if (ownsContext) resumeContext(context)
            return audio
        } catch (error) {
            if (ownsMicrophone && microphone) stopTracks(microphone)
            if (ownsContext) await closeContext(context)
            throw error
        }
    }

    /** Stops and releases what the adapter acquired; a repeat call returns the same promise. */
    stop(): Promise<void> {
        this.stopping ??= this.teardown()
        return this.stopping
    }

    private async teardown(): Promise<void> {
        this.node.port.onmessage = null
        this.source.disconnect()
        this.node.disconnect()
        // On a shared context the node outlives us; this lets its processor end.
        this.node.port.postMessage(WA_CALL_AUDIO_STOP_MESSAGE)
        if (this.ownsMicrophone) stopTracks(this.microphone)
        if (this.ownsContext) await closeContext(this.context)
    }

    /** Answers a capture block with as many playout samples, pulling even if the push throws. */
    private readonly onCaptureBlock = (event: MessageEvent): void => {
        const block: unknown = event.data
        if (this.stopping !== null || !(block instanceof Float32Array)) return
        try {
            this.sink.pushCapture(block)
        } finally {
            const out = new Float32Array(block.length)
            this.sink.pullPlayout(out)
            this.node.port.postMessage(out, [out.buffer])
        }
    }
}

/** A 16 kHz context, so the browser resamples; the device rate where 16 kHz is refused. */
function createCallAudioContext(): AudioContext {
    try {
        return new AudioContext({ sampleRate: WA_CALL_AUDIO_SAMPLE_RATE })
    } catch {
        return new AudioContext()
    }
}

/**
 * Loads the processor into `context`. The Blob URL is revoked as soon as the
 * module is loaded: the context keeps the module, not the URL.
 */
async function loadWorkletModule(
    context: BaseAudioContext,
    workletUrl: string | undefined
): Promise<void> {
    if (workletUrl !== undefined) {
        await context.audioWorklet.addModule(workletUrl)
        return
    }
    const url = URL.createObjectURL(
        new Blob([WA_CALL_AUDIO_WORKLET_SOURCE], { type: 'text/javascript' })
    )
    try {
        await context.audioWorklet.addModule(url)
    } finally {
        URL.revokeObjectURL(url)
    }
}

/** Resumes a suspended context without awaiting: without a user activation it never settles. */
function resumeContext(context: AudioContext): void {
    if (context.state !== 'suspended') return
    context.resume().catch(() => undefined)
}

/** Closes `context` unless it already is: a second `close()` rejects. */
async function closeContext(context: AudioContext): Promise<void> {
    if (context.state === 'closed') return
    await context.close()
}

function stopTracks(stream: MediaStream): void {
    for (const track of stream.getTracks()) track.stop()
}
