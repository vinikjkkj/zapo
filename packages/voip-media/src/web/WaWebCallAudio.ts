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
     * `samples` is only valid during the call: its buffer is reused for the playout.
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
     * A context passed in is neither closed by `stop()`, resumed nor routed to an `output`.
     */
    readonly audioContext?: AudioContext
    /**
     * Output device id, from `enumerateDevices()`, for the context the adapter creates: passed as
     * its constructor's `sinkId`, or to `setSinkId` where that is ignored (Chrome, Edge). Where
     * neither applies, any but the default, `''`, fails `start`. Refused with `audioContext`.
     */
    readonly output?: string
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

/** Time constant of the mute ramp, in seconds: 99% of the way in 23 ms, too slow to click. */
const PLAYOUT_MUTE_TIME_CONSTANT_S = 0.005

const STOPPED_ERROR = 'the call audio has stopped'
const CALLER_CONTEXT_OUTPUT_ERROR =
    'an audioContext passed in keeps its own output: call its setSinkId instead'

/** `sinkId` in the `AudioContext` constructor; Chrome and Edge read it, others ignore it. */
interface CallAudioContextOptions extends AudioContextOptions {
    readonly sinkId?: string
}

/** Output routing of an `AudioContext`: Chrome and Edge only, and not in TypeScript's DOM lib. */
interface AudioOutputRouting {
    readonly sinkId?: unknown
    setSinkId?(sinkId: string): Promise<void>
}

interface WaWebCallAudioParts {
    readonly sink: WaCallAudioSink
    readonly context: AudioContext
    readonly ownsContext: boolean
    readonly microphone: MediaStream
    readonly ownsMicrophone: boolean
    readonly source: MediaStreamAudioSourceNode
    readonly node: AudioWorkletNode
    readonly gain: GainNode
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
    private readonly node: AudioWorkletNode
    private readonly gain: GainNode
    private microphone: MediaStream
    private ownsMicrophone: boolean
    private source: MediaStreamAudioSourceNode
    private playoutMuted = false
    private stopping: Promise<void> | null = null

    private constructor(parts: WaWebCallAudioParts) {
        this.sink = parts.sink
        this.context = parts.context
        this.ownsContext = parts.ownsContext
        this.node = parts.node
        this.gain = parts.gain
        this.microphone = parts.microphone
        this.ownsMicrophone = parts.ownsMicrophone
        this.source = parts.source
        this.node.port.onmessage = this.onCaptureBlock
    }

    /**
     * Opens the microphone and speaker and carries audio to and from `sink`, releasing all on
     * failure. The context is created and resumed before the first `await`, inside the gesture.
     */
    static async start(
        sink: WaCallAudioSink,
        options: WaWebCallAudioOptions = {}
    ): Promise<WaWebCallAudio> {
        const { output } = options
        const ownsContext = options.audioContext === undefined
        if (!ownsContext && output !== undefined) throw new Error(CALLER_CONTEXT_OUTPUT_ERROR)
        let context = options.audioContext ?? createCallAudioContext(output)
        const ownsMicrophone = options.microphone === undefined
        let microphone = options.microphone ?? null

        try {
            await routeOutput(context, output)
            microphone ??= await navigator.mediaDevices.getUserMedia(DEFAULT_MICROPHONE_CONSTRAINTS)

            let source: MediaStreamAudioSourceNode
            try {
                source = context.createMediaStreamSource(microphone)
            } catch (error) {
                // Firefox refuses a mic at a foreign rate: fall back to the device rate.
                if (!ownsContext || context.sampleRate !== WA_CALL_AUDIO_SAMPLE_RATE) throw error
                await closeContext(context)
                context = openAudioContext(outputOption(output))
                await routeOutput(context, output)
                source = context.createMediaStreamSource(microphone)
            }

            await loadWorkletModule(context, options.workletUrl)
            const node = new AudioWorkletNode(
                context,
                WA_CALL_AUDIO_PROCESSOR,
                WORKLET_NODE_OPTIONS
            )
            const gain = context.createGain()
            const audio = new WaWebCallAudio({
                sink,
                context,
                ownsContext,
                microphone,
                ownsMicrophone,
                source,
                node,
                gain
            })
            source.connect(node)
            node.connect(gain)
            gain.connect(context.destination)
            return audio
        } catch (error) {
            if (ownsMicrophone && microphone) stopTracks(microphone)
            if (ownsContext) await closeContext(context)
            throw error
        }
    }

    /**
     * Silences the speaker, as for a hold, over a few ms. Playout is still pulled while muted,
     * so the jitter buffer keeps draining and the call resumes in step. No-op after `stop()`.
     */
    setPlayoutMuted(muted: boolean): void {
        if (this.stopping !== null || muted === this.playoutMuted) return
        this.playoutMuted = muted
        this.gain.gain.setTargetAtTime(
            muted ? 0 : 1,
            this.context.currentTime,
            PLAYOUT_MUTE_TIME_CONSTANT_S
        )
    }

    /**
     * Captures from `stream`, swapping only the source node. `stream` stays the caller's to
     * stop; if the context refuses it, this throws and the current microphone keeps running.
     */
    setMicrophone(stream: MediaStream): void {
        if (this.stopping !== null) throw new Error(STOPPED_ERROR)
        const source = this.context.createMediaStreamSource(stream)
        source.connect(this.node)
        this.source.disconnect()
        if (this.ownsMicrophone) stopTracks(this.microphone)
        this.source = source
        this.microphone = stream
        this.ownsMicrophone = false
    }

    /**
     * Plays to the output device `sinkId`, `''` the default. Rejects on an `audioContext` passed
     * in, and with a `NotSupportedError` for another device where there is no `setSinkId`.
     * Resolves if `stop()` ends the call mid-switch, whatever the switch did. Await it before
     * asking for another output: overlapping switches have no guaranteed order.
     */
    async setOutput(sinkId: string): Promise<void> {
        if (this.stopping !== null) throw new Error(STOPPED_ERROR)
        if (!this.ownsContext) throw new Error(CALLER_CONTEXT_OUTPUT_ERROR)
        try {
            await routeOutput(this.context, sinkId)
        } catch (error) {
            if (this.stopping === null) throw error
        }
    }

    /** Stops and releases what the adapter acquired; a repeat call returns the same promise. */
    stop(): Promise<void> {
        this.stopping ??= this.teardown()
        return this.stopping
    }

    /** Detaches the graph, ends the processor and releases what the adapter owns. */
    private async teardown(): Promise<void> {
        this.node.port.onmessage = null
        this.source.disconnect()
        this.node.disconnect()
        this.gain.disconnect()
        // On a shared context the node outlives us; this lets its processor end.
        this.node.port.postMessage(WA_CALL_AUDIO_STOP_MESSAGE)
        if (this.ownsMicrophone) stopTracks(this.microphone)
        if (this.ownsContext) await closeContext(this.context)
    }

    /**
     * Answers a capture block with as many playout samples, written over the block itself and
     * transferred back, pulling even if the push throws.
     */
    private readonly onCaptureBlock = (event: MessageEvent): void => {
        const block: unknown = event.data
        if (this.stopping !== null || !(block instanceof Float32Array)) return
        try {
            this.sink.pushCapture(block)
        } finally {
            this.sink.pullPlayout(block)
            this.node.port.postMessage(block, [block.buffer])
        }
    }
}

/** A 16 kHz context, so the browser resamples; the device rate where 16 kHz is refused. */
function createCallAudioContext(output: string | undefined): AudioContext {
    try {
        return openAudioContext({ sampleRate: WA_CALL_AUDIO_SAMPLE_RATE, ...outputOption(output) })
    } catch {
        return openAudioContext(outputOption(output))
    }
}

/** A new context, resumed at once: past the first `await` the user activation may be gone. */
function openAudioContext(options?: CallAudioContextOptions): AudioContext {
    const context = new AudioContext(options)
    resumeContext(context)
    return context
}

/** The constructor options that ask for `output`, none without one. */
function outputOption(output: string | undefined): CallAudioContextOptions | undefined {
    return output === undefined ? undefined : { sinkId: output }
}

/**
 * Sends `context` to the output device `sinkId`, unless its constructor already did. Without
 * `setSinkId` a context already plays to the default device, `''`.
 */
async function routeOutput(context: AudioContext, sinkId: string | undefined): Promise<void> {
    const routing = context as AudioOutputRouting
    if (sinkId === undefined || routing.sinkId === sinkId) return
    if (routing.setSinkId !== undefined) {
        await routing.setSinkId(sinkId)
    } else if (sinkId !== '') {
        throw new DOMException(
            'this browser cannot choose the output of an AudioContext',
            'NotSupportedError'
        )
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
