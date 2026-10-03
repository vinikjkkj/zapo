import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { createNoopLogger } from '../../logger.js'
import { nodeCrypto } from '../../node/crypto.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

/** Samples the host pulls on each playout tick. */
const PLAYBACK_OUTPUT_SIZE = 960

interface AudioPlaneHarness {
    readonly plane: WaCallMediaPlane
    readonly decode: (pcm: Float32Array) => void
}

/** A plane with media flowing and a relay never dialled, so only playout runs. */
async function createPlane(): Promise<AudioPlaneHarness> {
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled
    })

    const internals = plane as unknown as {
        sctpRelay: { hasConnection: () => boolean }
        onDecodedAudio: (pcm: Float32Array) => void
    }
    internals.sctpRelay.hasConnection = () => true
    await plane.apply({ accepted: true })

    return { plane, decode: internals.onDecodedAudio }
}

function frame(value: number): Float32Array {
    return new Float32Array(PLAYBACK_OUTPUT_SIZE).fill(value)
}

/** One playout tick of the host: a buffer of its own, filled by the plane. */
function pull(plane: WaCallMediaPlane): { readonly real: number; readonly out: Float32Array } {
    const out = new Float32Array(PLAYBACK_OUTPUT_SIZE)
    return { real: plane.pullPlayout(out), out }
}

test('decoded audio reaches the host only once, on the playout tick', async (t) => {
    const { plane, decode } = await createPlane()
    t.after(() => plane.stop())

    decode(frame(0.5))

    const first = pull(plane)
    const second = pull(plane)
    plane.stop()

    assert.equal(second.real, 0, 'one queued frame is one playout tick')
    assert.equal(first.real, PLAYBACK_OUTPUT_SIZE)
    assert.equal(first.out[0], 0.5)
})

test('each playout tick hands over its own buffer', async (t) => {
    const { plane, decode } = await createPlane()
    t.after(() => plane.stop())

    decode(frame(0.25))
    const first = pull(plane)
    decode(frame(0.75))
    const second = pull(plane)
    plane.stop()

    assert.equal(first.real, PLAYBACK_OUTPUT_SIZE)
    assert.equal(second.real, PLAYBACK_OUTPUT_SIZE)
    assert.equal(first.out[0], 0.25, 'a retained frame must not alias the next tick')
    assert.equal(second.out[0], 0.75)
})

test('stopping the plane stops the playout stream', async (t) => {
    const { plane, decode } = await createPlane()
    t.after(() => plane.stop())

    decode(frame(0.5))
    assert.equal(pull(plane).real, PLAYBACK_OUTPUT_SIZE)

    plane.stop()
    decode(frame(0.9))

    const afterStop = pull(plane)

    assert.equal(afterStop.real, 0, 'no frame lands after stop')
    assert.ok(
        afterStop.out.every((sample) => sample === 0),
        'what the host plays after stop is silence'
    )
})
