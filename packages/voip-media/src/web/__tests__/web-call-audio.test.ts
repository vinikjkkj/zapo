import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import type { WaCallMediaPlane } from '../../call/WaCallMediaPlane.js'
import {
    WA_CALL_AUDIO_BLOCK_SAMPLES,
    WA_CALL_AUDIO_PROCESSOR,
    WA_CALL_AUDIO_STOP_MESSAGE,
    WA_CALL_AUDIO_WORKLET_SOURCE
} from '../call-audio-worklet.js'
import { type WaCallAudioSink, WaWebCallAudio } from '../WaWebCallAudio.js'

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

class FakeTrack {
    stops = 0

    stop(): void {
        this.stops++
    }
}

class FakeMicrophone {
    readonly track = new FakeTrack()

    getTracks(): FakeTrack[] {
        return [this.track]
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
}

interface FakeContext {
    readonly options: AudioContextOptions | undefined
    readonly sampleRate: number
    readonly state: AudioContextState
    readonly destination: object
    readonly modules: readonly string[]
    readonly sources: readonly FakeNode[]
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
        readonly destination = { destination: true }
        readonly modules: string[] = []
        readonly sources: FakeNode[] = []
        closes = 0
        readonly audioWorklet = {
            addModule: async (url: string): Promise<void> => {
                if (options.failModule) throw new Error('module failed to load')
                this.modules.push(url)
            }
        }

        constructor(contextOptions?: AudioContextOptions) {
            this.options = contextOptions
            this.sampleRate = contextOptions?.sampleRate ?? DEVICE_RATE
            browser.contexts.push(this)
        }

        createMediaStreamSource(): FakeNode {
            if (this.sampleRate === options.refuseSourceAtRate) {
                throw new Error('NotSupportedError: different sample-rate')
            }
            const source = new FakeNode()
            this.sources.push(source)
            return source
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

function microphoneOf(browser: FakeBrowser): MediaStream {
    return browser.microphone as unknown as MediaStream
}

test('start opens a 16 kHz context and wires microphone, worklet and speaker', async (t) => {
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
    assert.deepEqual(node.connections, [context.destination])
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
    assert.equal(port.posted.length, 1)
    const answer = port.posted[0]
    assert.ok(answer instanceof Float32Array)
    assert.equal(answer.length, block.length)
    assert.equal(answer[7], Math.fround(7 / 1_000), 'what went back is what the sink played')
    assert.equal(
        sink.calls[1].samples.byteLength,
        0,
        'the playout buffer was transferred, not copied'
    )
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
        microphone: microphoneOf(browser),
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
