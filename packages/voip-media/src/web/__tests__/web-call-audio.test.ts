import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import type { WaCallMediaPlane } from '../../call/WaCallMediaPlane.js'
import {
    WA_CALL_AUDIO_PROCESSOR,
    WA_CALL_AUDIO_STOP_MESSAGE,
    WA_CALL_AUDIO_WORKLET_SOURCE
} from '../call-audio-worklet.js'
import { type WaCallAudioSink, WaWebCallAudio } from '../WaWebCallAudio.js'

/** One capture block: 20 ms at 16 kHz. */
const WA_CALL_AUDIO_BLOCK_SAMPLES = 320

/** The plane is the sink the adapter is written for; this stops compiling if they part. */
const planeIsASink: WaCallMediaPlane extends WaCallAudioSink ? true : never = true
void planeIsASink

/** Rate a context runs at when it is not asked for one: the device's. */
const DEVICE_RATE = 48_000

class FakeNode {
    readonly connections: unknown[] = []
    disconnects = 0

    connect(destination: unknown): unknown {
        this.connections.push(destination)
        return destination
    }

    disconnect(): void {
        this.disconnects++
    }
}

/** The main thread's worklet port; posts go through `structuredClone`, so transfers detach. */
class FakePort {
    onmessage: ((event: MessageEvent) => void) | null = null
    readonly posted: unknown[] = []

    postMessage(message: unknown, transfer: ArrayBuffer[] = []): void {
        this.posted.push(structuredClone(message, { transfer }))
    }

    /** A message from the processor. */
    emit(data: unknown): void {
        this.onmessage?.({ data } as MessageEvent)
    }
}

/** A gain node that keeps the ramps scheduled on its gain. */
class FakeGainNode extends FakeNode {
    readonly ramps: { target: number; startTime: number; timeConstant: number }[] = []
    readonly gain = {
        setTargetAtTime: (target: number, startTime: number, timeConstant: number): void => {
            this.ramps.push({ target, startTime, timeConstant })
        }
    }
}

class FakeTrack {
    stops = 0

    stop(): void {
        this.stops++
    }
}

class FakeMicrophone {
    readonly track = new FakeTrack()
    /** Every context refuses a source on it, as Firefox does a microphone at a foreign rate. */
    refused = false

    getTracks(): FakeTrack[] {
        return [this.track]
    }
}

class FakeSourceNode extends FakeNode {
    constructor(readonly stream: FakeMicrophone) {
        super()
    }
}

interface FakeBrowserOptions {
    /** A context at this rate throws when asked for a microphone source, as Firefox's does. */
    readonly refuseSourceAtRate?: number
    /** `addModule` rejects. */
    readonly failModule?: boolean
    /**
     * Contexts start suspended and resume only inside the user activation, which the
     * microphone prompt outlasts; a later `resume()` never settles.
     */
    readonly activationEndsAtPrompt?: boolean
    /**
     * How a context picks its output device: `sinkId` in its constructor and `setSinkId`, as
     * Chrome's (the default); `setSinkId` alone; or neither, as Firefox's and Safari's.
     */
    readonly outputSelection?: 'constructor' | 'setSinkId' | 'none'
    /** Settles each `setSinkId` call, which switches the output only if it resolves. */
    readonly switchOutput?: (sinkId: string) => Promise<void>
}

interface FakeContext {
    readonly options: AudioContextOptions | undefined
    readonly sampleRate: number
    readonly state: AudioContextState
    currentTime: number
    readonly destination: object
    readonly modules: readonly string[]
    readonly sources: readonly FakeSourceNode[]
    readonly gains: readonly FakeGainNode[]
    /** The output device; `undefined` where the browser has no output selection. */
    readonly sinkId: string | undefined
    /** The `setSinkId` calls, in order. */
    readonly sinkIds: readonly string[]
    readonly closes: number
}

interface FakeWorkletNode extends FakeNode {
    readonly context: FakeContext
    readonly name: string
    readonly options: AudioWorkletNodeOptions
    readonly port: FakePort
}

interface FakeBrowser {
    readonly contexts: FakeContext[]
    readonly nodes: FakeWorkletNode[]
    readonly blobs: { readonly parts: readonly unknown[]; readonly type: string | undefined }[]
    readonly createdUrls: string[]
    readonly revokedUrls: string[]
    readonly userMediaRequests: MediaStreamConstraints[]
    readonly microphone: FakeMicrophone
    /** A context built the way a page would, on the fake constructor. */
    newContext(options?: AudioContextOptions): AudioContext
}

/** Installs a fake browser audio surface on `globalThis` for one test, restored after. */
function installFakeBrowser(t: TestContext, options: FakeBrowserOptions = {}): FakeBrowser {
    let activation = true
    const browser: FakeBrowser = {
        contexts: [],
        nodes: [],
        blobs: [],
        createdUrls: [],
        revokedUrls: [],
        userMediaRequests: [],
        microphone: new FakeMicrophone(),
        newContext: (contextOptions) =>
            new FakeAudioContext(contextOptions) as unknown as AudioContext
    }

    class FakeAudioContext implements FakeContext {
        readonly options: AudioContextOptions | undefined
        readonly sampleRate: number
        state: AudioContextState = options.activationEndsAtPrompt ? 'suspended' : 'running'
        currentTime = 0
        readonly destination = { destination: true }
        readonly modules: string[] = []
        readonly sources: FakeSourceNode[] = []
        readonly gains: FakeGainNode[] = []
        sinkId: string | undefined
        readonly sinkIds: string[] = []
        readonly setSinkId?: (sinkId: string) => Promise<void>
        closes = 0
        readonly audioWorklet = {
            addModule: async (url: string): Promise<void> => {
                if (options.failModule) throw new Error('module failed to load')
                this.modules.push(url)
            }
        }

        constructor(contextOptions?: AudioContextOptions & { readonly sinkId?: string }) {
            this.options = contextOptions
            this.sampleRate = contextOptions?.sampleRate ?? DEVICE_RATE
            const selection = options.outputSelection ?? 'constructor'
            if (selection !== 'none') {
                this.sinkId = selection === 'constructor' ? (contextOptions?.sinkId ?? '') : ''
                this.setSinkId = async (sinkId) => {
                    this.sinkIds.push(sinkId)
                    await options.switchOutput?.(sinkId)
                    this.sinkId = sinkId
                }
            }
            browser.contexts.push(this)
        }

        createMediaStreamSource(stream: FakeMicrophone): FakeSourceNode {
            if (this.sampleRate === options.refuseSourceAtRate || stream.refused) {
                throw new Error('NotSupportedError: different sample-rate')
            }
            const source = new FakeSourceNode(stream)
            this.sources.push(source)
            return source
        }

        createGain(): FakeGainNode {
            const gain = new FakeGainNode()
            this.gains.push(gain)
            return gain
        }

        async close(): Promise<void> {
            if (this.state === 'closed') throw new Error('InvalidStateError: already closed')
            this.closes++
            this.state = 'closed'
        }

        resume(): Promise<void> {
            if (!activation) return new Promise(() => undefined)
            this.state = 'running'
            return Promise.resolve()
        }
    }

    class FakeAudioWorkletNodeImpl extends FakeNode implements FakeWorkletNode {
        readonly port = new FakePort()

        constructor(
            readonly context: FakeContext,
            readonly name: string,
            readonly options: AudioWorkletNodeOptions
        ) {
            super()
            browser.nodes.push(this)
        }
    }

    class FakeBlob {
        constructor(parts: unknown[], blobOptions?: BlobPropertyBag) {
            browser.blobs.push({ parts, type: blobOptions?.type })
        }
    }

    const getUserMedia = async (constraints: MediaStreamConstraints): Promise<unknown> => {
        browser.userMediaRequests.push(constraints)
        if (options.activationEndsAtPrompt) activation = false
        return browser.microphone
    }

    replaceGlobal(t, globalThis, 'AudioContext', FakeAudioContext)
    replaceGlobal(t, globalThis, 'AudioWorkletNode', FakeAudioWorkletNodeImpl)
    replaceGlobal(t, globalThis, 'navigator', { mediaDevices: { getUserMedia } })
    replaceGlobal(t, globalThis, 'Blob', FakeBlob)
    replaceGlobal(t, URL, 'createObjectURL', () => {
        const url = `blob:fake/${browser.createdUrls.length}`
        browser.createdUrls.push(url)
        return url
    })
    replaceGlobal(t, URL, 'revokeObjectURL', (url: string) => {
        browser.revokedUrls.push(url)
    })
    return browser
}

function replaceGlobal(t: TestContext, target: object, name: string, value: unknown): void {
    const original = Object.getOwnPropertyDescriptor(target, name)
    Object.defineProperty(target, name, { value, configurable: true, writable: true })
    t.after(() => {
        if (original) Object.defineProperty(target, name, original)
        else Reflect.deleteProperty(target, name)
    })
}

interface RecordingSink extends WaCallAudioSink {
    readonly calls: { readonly method: 'push' | 'pull'; readonly samples: Float32Array }[]
}

/** A sink that records its calls and plays `index / 1000` so the answer is recognizable. */
function createRecordingSink(): RecordingSink {
    const calls: RecordingSink['calls'] = []
    return {
        calls,
        pushCapture: (samples) => {
            calls.push({ method: 'push', samples })
        },
        pullPlayout: (out) => {
            for (let i = 0; i < out.length; i++) out[i] = i / 1_000
            calls.push({ method: 'pull', samples: out })
            return out.length
        }
    }
}

function asStream(microphone: FakeMicrophone): MediaStream {
    return microphone as unknown as MediaStream
}

test('start opens a 16 kHz context and wires microphone, worklet, gain and speaker', async (t) => {
    const browser = installFakeBrowser(t)
    const audio = await WaWebCallAudio.start(createRecordingSink())
    t.after(() => audio.stop())

    assert.deepEqual(browser.userMediaRequests, [
        {
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        }
    ])
    assert.equal(browser.contexts.length, 1)
    const [context] = browser.contexts
    assert.deepEqual(context.options, { sampleRate: 16_000 })

    assert.deepEqual(browser.blobs, [
        { parts: [WA_CALL_AUDIO_WORKLET_SOURCE], type: 'text/javascript' }
    ])
    assert.deepEqual(context.modules, ['blob:fake/0'])
    assert.deepEqual(browser.revokedUrls, ['blob:fake/0'], 'the Blob URL is revoked once loaded')

    assert.equal(browser.nodes.length, 1)
    const [node] = browser.nodes
    assert.equal(node.context, context)
    assert.equal(node.name, WA_CALL_AUDIO_PROCESSOR)
    assert.equal(node.options.channelCount, 1)
    assert.deepEqual(node.options.outputChannelCount, [1])
    assert.deepEqual(context.sources[0].connections, [node])
    assert.equal(context.gains.length, 1)
    const [gain] = context.gains
    assert.deepEqual(node.connections, [gain], 'the playout goes through the gain')
    assert.deepEqual(gain.connections, [context.destination])
    assert.deepEqual(gain.ramps, [], 'the speaker starts unmuted')
})

test('the context is resumed inside the user gesture, before the microphone prompt ends it', async (t) => {
    const browser = installFakeBrowser(t, { activationEndsAtPrompt: true })
    const audio = await WaWebCallAudio.start(createRecordingSink())
    t.after(() => audio.stop())

    assert.equal(browser.contexts[0].state, 'running')
})

test('a capture block is pushed, answered by a pull of the same length, and posted back', async (t) => {
    const browser = installFakeBrowser(t)
    const sink = createRecordingSink()
    const audio = await WaWebCallAudio.start(sink)
    t.after(() => audio.stop())
    const { port } = browser.nodes[0]

    const block = new Float32Array(WA_CALL_AUDIO_BLOCK_SAMPLES).fill(0.25)
    port.emit(block)

    assert.deepEqual(
        sink.calls.map((call) => call.method),
        ['push', 'pull']
    )
    assert.equal(sink.calls[0].samples, block, 'the block reaches the sink as it came')
    assert.equal(sink.calls[1].samples, block, 'the capture block is reused for the playout')
    assert.equal(port.posted.length, 1)
    const answer = port.posted[0]
    assert.ok(answer instanceof Float32Array)
    assert.equal(answer.length, WA_CALL_AUDIO_BLOCK_SAMPLES)
    assert.equal(answer[7], Math.fround(7 / 1_000), 'what went back is what the sink played')
    assert.equal(block.byteLength, 0, 'the playout buffer was transferred, not copied')
})

test('a capture path that throws still answers the block', async (t) => {
    const browser = installFakeBrowser(t)
    const sink = createRecordingSink()
    const audio = await WaWebCallAudio.start({
        pushCapture: () => {
            throw new Error('capture failed')
        },
        pullPlayout: sink.pullPlayout
    })
    t.after(() => audio.stop())
    const { port } = browser.nodes[0]

    assert.throws(() => port.emit(new Float32Array(WA_CALL_AUDIO_BLOCK_SAMPLES)), /capture failed/)
    assert.equal(port.posted.length, 1, 'the speaker still got its block')
})

test('stop releases what start acquired, once', async (t) => {
    const browser = installFakeBrowser(t)
    const sink = createRecordingSink()
    const audio = await WaWebCallAudio.start(sink)
    const [context] = browser.contexts
    const [node] = browser.nodes

    const first = audio.stop()
    const second = audio.stop()
    assert.equal(first, second, 'a second stop is the same stop')
    await first
    await audio.stop()

    assert.equal(context.sources[0].disconnects, 1)
    assert.equal(node.disconnects, 1)
    assert.equal(context.gains[0].disconnects, 1)
    assert.deepEqual(node.port.posted, [WA_CALL_AUDIO_STOP_MESSAGE])
    assert.equal(browser.microphone.track.stops, 1)
    assert.equal(context.closes, 1)

    node.port.emit(new Float32Array(WA_CALL_AUDIO_BLOCK_SAMPLES))
    assert.equal(sink.calls.length, 0, 'a block arriving after stop reaches nothing')
})

test('stop leaves a microphone and a context handed in alone', async (t) => {
    const browser = installFakeBrowser(t)
    const context = browser.newContext()
    const audio = await WaWebCallAudio.start(createRecordingSink(), {
        microphone: asStream(browser.microphone),
        audioContext: context
    })
    const [node] = browser.nodes

    await audio.stop()

    assert.deepEqual(browser.userMediaRequests, [], 'no microphone was requested')
    assert.equal(browser.contexts.length, 1, 'no context was created')
    assert.equal(node.context, browser.contexts[0])
    assert.equal(node.disconnects, 1)
    assert.deepEqual(node.port.posted, [WA_CALL_AUDIO_STOP_MESSAGE])
    assert.equal(browser.microphone.track.stops, 0)
    assert.equal(browser.contexts[0].closes, 0)
    assert.equal(browser.contexts[0].state, 'running')
})

test('a 16 kHz context that refuses the microphone is closed and replaced at the device rate', async (t) => {
    const browser = installFakeBrowser(t, { refuseSourceAtRate: 16_000 })
    const audio = await WaWebCallAudio.start(createRecordingSink())

    assert.equal(browser.contexts.length, 2)
    const [refused, fallback] = browser.contexts
    assert.equal(refused.sampleRate, 16_000)
    assert.equal(refused.closes, 1, 'the context that refused is closed')
    assert.equal(fallback.options, undefined, 'the fallback asks for no rate')
    assert.equal(fallback.sampleRate, DEVICE_RATE)
    assert.equal(fallback.sources.length, 1)
    assert.equal(browser.nodes[0].context, fallback)
    assert.deepEqual(fallback.modules, ['blob:fake/0'])

    await audio.stop()
    assert.equal(fallback.closes, 1)
    assert.equal(refused.closes, 1)
})

test('a context handed in that refuses the microphone is not replaced', async (t) => {
    const browser = installFakeBrowser(t, { refuseSourceAtRate: 16_000 })
    const context = browser.newContext({ sampleRate: 16_000 })

    await assert.rejects(
        WaWebCallAudio.start(createRecordingSink(), { audioContext: context }),
        /different sample-rate/
    )

    assert.equal(browser.contexts.length, 1, 'no context of its own was created')
    assert.equal(browser.contexts[0].closes, 0, 'the caller keeps its context')
    assert.equal(browser.microphone.track.stops, 1, 'the microphone it acquired is released')
})

test('a start that fails releases what it acquired', async (t) => {
    const browser = installFakeBrowser(t, { failModule: true })

    await assert.rejects(WaWebCallAudio.start(createRecordingSink()), /module failed to load/)

    assert.equal(browser.microphone.track.stops, 1)
    assert.equal(browser.contexts[0].closes, 1)
    assert.deepEqual(browser.revokedUrls, browser.createdUrls, 'the Blob URL is revoked anyway')
    assert.equal(browser.nodes.length, 0)
})

test('a worklet URL is loaded as given, with no Blob', async (t) => {
    const browser = installFakeBrowser(t)
    const audio = await WaWebCallAudio.start(createRecordingSink(), {
        workletUrl: '/assets/wa-call-audio.js'
    })
    t.after(() => audio.stop())

    assert.deepEqual(browser.contexts[0].modules, ['/assets/wa-call-audio.js'])
    assert.deepEqual(browser.blobs, [])
    assert.deepEqual(browser.createdUrls, [])
})

test('muting the speaker ramps its gain down and back, once per change', async (t) => {
    const browser = installFakeBrowser(t)
    const audio = await WaWebCallAudio.start(createRecordingSink())
    t.after(() => audio.stop())
    const [context] = browser.contexts
    const [gain] = context.gains
    context.currentTime = 2.5

    audio.setPlayoutMuted(true)
    audio.setPlayoutMuted(true)
    audio.setPlayoutMuted(false)
    audio.setPlayoutMuted(false)

    assert.deepEqual(
        gain.ramps.map(({ target, startTime }) => ({ target, startTime })),
        [
            { target: 0, startTime: 2.5 },
            { target: 1, startTime: 2.5 }
        ]
    )
    for (const { timeConstant } of gain.ramps) {
        assert.ok(timeConstant > 0 && timeConstant <= 0.01, 'a ramp of a few ms, not a step')
    }
})

test('a muted speaker keeps pulling playout, so the jitter buffer drains', async (t) => {
    const browser = installFakeBrowser(t)
    const sink = createRecordingSink()
    const audio = await WaWebCallAudio.start(sink)
    t.after(() => audio.stop())
    const { port } = browser.nodes[0]

    audio.setPlayoutMuted(true)
    port.emit(new Float32Array(WA_CALL_AUDIO_BLOCK_SAMPLES))

    assert.deepEqual(
        sink.calls.map((call) => call.method),
        ['push', 'pull']
    )
    assert.equal(port.posted.length, 1, 'the worklet still got its block')
})

test('muting after stop does nothing', async (t) => {
    const browser = installFakeBrowser(t)
    const audio = await WaWebCallAudio.start(createRecordingSink())
    await audio.stop()

    audio.setPlayoutMuted(true)

    assert.deepEqual(browser.contexts[0].gains[0].ramps, [])
})

test('a new microphone replaces only the source, and the one the adapter opened is stopped', async (t) => {
    const browser = installFakeBrowser(t)
    const audio = await WaWebCallAudio.start(createRecordingSink())
    t.after(() => audio.stop())
    const [context] = browser.contexts
    const [node] = browser.nodes
    const headset = new FakeMicrophone()

    audio.setMicrophone(asStream(headset))

    const [opened, replacement] = context.sources
    assert.equal(replacement.stream, headset)
    assert.deepEqual(replacement.connections, [node])
    assert.equal(opened.disconnects, 1)
    assert.equal(browser.microphone.track.stops, 1)
    assert.equal(headset.track.stops, 0)
    assert.equal(browser.contexts.length, 1, 'the context is kept')
    assert.equal(browser.nodes.length, 1, 'the worklet is kept')
    assert.equal(node.disconnects, 0)
})

test('a microphone handed in is left running when replaced', async (t) => {
    const browser = installFakeBrowser(t)
    const audio = await WaWebCallAudio.start(createRecordingSink(), {
        microphone: asStream(browser.microphone)
    })
    t.after(() => audio.stop())

    audio.setMicrophone(asStream(new FakeMicrophone()))

    assert.equal(browser.contexts[0].sources[0].disconnects, 1)
    assert.equal(browser.microphone.track.stops, 0)
})

test('a microphone the context refuses throws and leaves the current one running', async (t) => {
    const browser = installFakeBrowser(t)
    const audio = await WaWebCallAudio.start(createRecordingSink())
    const [context] = browser.contexts
    const refused = new FakeMicrophone()
    refused.refused = true

    assert.throws(() => audio.setMicrophone(asStream(refused)), /different sample-rate/)

    assert.equal(context.sources.length, 1)
    assert.equal(context.sources[0].disconnects, 0)
    assert.equal(browser.microphone.track.stops, 0)
    await audio.stop()
    assert.equal(browser.microphone.track.stops, 1, 'the adapter still owns what it opened')
})

test('stop leaves a microphone set later alone', async (t) => {
    const browser = installFakeBrowser(t)
    const audio = await WaWebCallAudio.start(createRecordingSink())
    const headset = new FakeMicrophone()
    audio.setMicrophone(asStream(headset))

    await audio.stop()

    assert.equal(browser.contexts[0].sources[1].disconnects, 1)
    assert.equal(headset.track.stops, 0)
    assert.equal(browser.microphone.track.stops, 1, 'the one the adapter opened, stopped once')
})

test('a microphone set after stop is refused', async (t) => {
    const browser = installFakeBrowser(t)
    const audio = await WaWebCallAudio.start(createRecordingSink())
    await audio.stop()

    assert.throws(() => audio.setMicrophone(asStream(new FakeMicrophone())), /stopped/)
    assert.equal(browser.contexts[0].sources.length, 1)
})

test('setOutput routes the context to the device', async (t) => {
    const browser = installFakeBrowser(t)
    const audio = await WaWebCallAudio.start(createRecordingSink())
    t.after(() => audio.stop())

    await audio.setOutput('headset')

    assert.deepEqual(browser.contexts[0].sinkIds, ['headset'])
})

test('setOutput rejects where the browser cannot choose the output', async (t) => {
    installFakeBrowser(t, { outputSelection: 'none' })
    const audio = await WaWebCallAudio.start(createRecordingSink())
    t.after(() => audio.stop())

    await assert.rejects(audio.setOutput('headset'), { name: 'NotSupportedError' })
})

for (const outcome of ['resolves', 'rejects'] as const) {
    test(`setOutput resolves when stop ends the call while setSinkId ${outcome}`, async (t) => {
        let settle = (): void => undefined
        const switching = new Promise<void>((resolve, reject) => {
            settle =
                outcome === 'resolves'
                    ? resolve
                    : () => reject(new DOMException('the context is closed', 'InvalidStateError'))
        })
        const browser = installFakeBrowser(t, { switchOutput: () => switching })
        const audio = await WaWebCallAudio.start(createRecordingSink())

        const output = audio.setOutput('headset')
        await audio.stop()
        settle()

        await output
        assert.equal(browser.contexts[0].closes, 1)
        await assert.rejects(audio.setOutput('speaker'), /stopped/)
        assert.deepEqual(browser.contexts[0].sinkIds, ['headset'], 'nothing after the stop')
    })
}

test('setOutput rejects with the error of a setSinkId that fails without a stop', async (t) => {
    const browser = installFakeBrowser(t, {
        switchOutput: () => Promise.reject(new DOMException('no such device', 'NotFoundError'))
    })
    const audio = await WaWebCallAudio.start(createRecordingSink())
    t.after(() => audio.stop())

    await assert.rejects(audio.setOutput('gone'), { name: 'NotFoundError' })
    assert.equal(browser.contexts[0].sinkId, '', 'the output is unchanged')
})

test('the default output needs no setSinkId: a context without one already plays to it', async (t) => {
    const browser = installFakeBrowser(t, { outputSelection: 'none' })
    const audio = await WaWebCallAudio.start(createRecordingSink(), { output: '' })
    t.after(() => audio.stop())

    await audio.setOutput('')

    assert.equal(browser.nodes.length, 1, 'the call started')
    assert.equal(browser.contexts[0].closes, 0)
    await assert.rejects(audio.setOutput('headset'), { name: 'NotSupportedError' })
})

test('start passes an output to the context constructor', async (t) => {
    const browser = installFakeBrowser(t)
    const audio = await WaWebCallAudio.start(createRecordingSink(), { output: 'headset' })
    t.after(() => audio.stop())

    const [context] = browser.contexts
    assert.deepEqual(context.options, { sampleRate: 16_000, sinkId: 'headset' })
    assert.equal(context.sinkId, 'headset')
    assert.deepEqual(context.sinkIds, [], 'the constructor took it, so setSinkId is not called')
})

test('start routes an output the constructor ignores through setSinkId', async (t) => {
    const browser = installFakeBrowser(t, { outputSelection: 'setSinkId' })
    const audio = await WaWebCallAudio.start(createRecordingSink(), { output: 'headset' })
    t.after(() => audio.stop())

    assert.deepEqual(browser.contexts[0].sinkIds, ['headset'])
})

test('the device-rate fallback keeps the output', async (t) => {
    const browser = installFakeBrowser(t, { refuseSourceAtRate: 16_000 })
    const audio = await WaWebCallAudio.start(createRecordingSink(), { output: 'headset' })
    t.after(() => audio.stop())

    const [refused, fallback] = browser.contexts
    assert.equal(refused.closes, 1)
    assert.deepEqual(fallback.options, { sinkId: 'headset' })
    assert.equal(fallback.sinkId, 'headset')
    assert.equal(browser.nodes[0].context, fallback)
})

test('a fallback whose constructor ignores the output is routed through setSinkId', async (t) => {
    const browser = installFakeBrowser(t, {
        refuseSourceAtRate: 16_000,
        outputSelection: 'setSinkId'
    })
    const audio = await WaWebCallAudio.start(createRecordingSink(), { output: 'headset' })
    t.after(() => audio.stop())

    const [refused, fallback] = browser.contexts
    assert.deepEqual(refused.sinkIds, ['headset'])
    assert.deepEqual(fallback.sinkIds, ['headset'])
})

test('a start whose output cannot be chosen fails and releases what it acquired', async (t) => {
    const browser = installFakeBrowser(t, { outputSelection: 'none' })

    await assert.rejects(WaWebCallAudio.start(createRecordingSink(), { output: 'headset' }), {
        name: 'NotSupportedError'
    })

    assert.equal(browser.contexts.length, 1)
    assert.equal(browser.contexts[0].closes, 1)
    assert.deepEqual(browser.userMediaRequests, [], 'it fails before asking for the microphone')
    assert.equal(browser.nodes.length, 0)
})

test('a context handed in keeps its own output', async (t) => {
    const browser = installFakeBrowser(t)
    const context = browser.newContext()

    await assert.rejects(
        WaWebCallAudio.start(createRecordingSink(), { audioContext: context, output: 'headset' }),
        /keeps its own output/
    )
    assert.deepEqual(browser.userMediaRequests, [], 'nothing was acquired')

    const audio = await WaWebCallAudio.start(createRecordingSink(), { audioContext: context })
    t.after(() => audio.stop())
    await assert.rejects(audio.setOutput('headset'), /keeps its own output/)

    assert.deepEqual(browser.contexts[0].sinkIds, [])
    assert.equal(browser.contexts[0].closes, 0)
})
