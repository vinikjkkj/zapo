import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'

import type { WaAudioEngine } from '../../media/WaAudioEngine.js'
import { CallMediaType, DEFAULT_AUDIO_CONFIG, type WaVoipDeps } from '../../types.js'
import { CallInfo } from '../call-state.js'
import { WaCallMediaSession, type WaCallMediaSessionDelegate } from '../WaCallMediaSession.js'

const ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

interface AudioSessionHarness {
    readonly session: WaCallMediaSession
    readonly emitted: Float32Array[]
    readonly engine: WaAudioEngine
    readonly decode: (pcm: Float32Array) => void
}

/** A session whose relay is inert, so only the playout path is exercised. */
function createSession(): AudioSessionHarness {
    const emitted: Float32Array[] = []
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Audio)
    const session = new WaCallMediaSession({
        deps: {} as unknown as WaVoipDeps,
        logger: createNoopLogger(),
        info: call,
        delegate: {
            emitState: () => {},
            emitIncoming: () => {},
            emitEnded: () => {},
            emitInboundAudio: (_call, pcm) => {
                emitted.push(pcm)
            },
            emitInboundVideoRtp: () => {},
            emitInboundVideo: () => {},
            emitOutboundAudioFinished: () => {}
        } satisfies WaCallMediaSessionDelegate
    })

    const internals = session as unknown as {
        sctpRelay: { cleanup: () => void }
        audioEngine: WaAudioEngine
        onDecodedAudio: (pcm: Float32Array) => void
    }
    internals.sctpRelay = { cleanup: () => {} }

    return {
        session,
        emitted,
        engine: internals.audioEngine,
        decode: internals.onDecodedAudio
    }
}

function frame(value: number): Float32Array {
    return new Float32Array(DEFAULT_AUDIO_CONFIG.playbackOutputSize).fill(value)
}

const TICK_MS = DEFAULT_AUDIO_CONFIG.intervalMs

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Waits for `count` playout ticks to land, so a slow timer cannot fail the run. */
async function waitForFrames(emitted: Float32Array[], count: number): Promise<void> {
    const deadline = Date.now() + 5_000
    while (emitted.length < count && Date.now() < deadline) {
        await delay(TICK_MS / 2)
    }
    assert.ok(emitted.length >= count, `expected ${count} playout ticks, got ${emitted.length}`)
}

test('decoded audio reaches the delegate only once, on the playout tick', async (t) => {
    const { session, emitted, engine, decode } = createSession()
    t.after(() => session.cleanup())

    engine.startPlayback()
    decode(frame(0.5))

    assert.equal(emitted.length, 0, 'decoding must not deliver ahead of the playout tick')

    await waitForFrames(emitted, 1)
    session.cleanup()

    assert.equal(emitted.length, 1, 'one queued frame is one playout tick')
    assert.equal(emitted[0].length, DEFAULT_AUDIO_CONFIG.playbackOutputSize)
    assert.equal(emitted[0][0], 0.5)
})

test('each playout tick hands over its own buffer', async (t) => {
    const { session, emitted, engine, decode } = createSession()
    t.after(() => session.cleanup())

    engine.startPlayback()
    decode(frame(0.25))
    await waitForFrames(emitted, 1)
    decode(frame(0.75))
    await waitForFrames(emitted, 2)
    session.cleanup()

    assert.equal(emitted.length, 2)
    assert.notEqual(emitted[0], emitted[1], 'a retained frame must not alias the next tick')
    assert.equal(emitted[0][0], 0.25)
    assert.equal(emitted[1][0], 0.75)
})

test('cleanup stops the playout stream', async (t) => {
    const { session, emitted, engine, decode } = createSession()
    t.after(() => session.cleanup())

    engine.startPlayback()
    decode(frame(0.5))
    await waitForFrames(emitted, 1)

    session.cleanup()
    const emittedAtCleanup = emitted.length
    decode(frame(0.9))

    await delay(TICK_MS * 3)

    assert.equal(emitted.length, emittedAtCleanup, 'no frame lands after cleanup')
})
