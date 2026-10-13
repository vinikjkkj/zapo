import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SrtcpContext } from '../../crypto/srtp.js'
import { buildSenderReportWithSdes } from '../../media/rtcp.js'
import { nodeCrypto } from '../../node/crypto.js'

import {
    A_AUDIO,
    B_AUDIO,
    createPlane,
    FRAME,
    framed,
    group,
    keys,
    LAYERS,
    MLOW_RED_PAYLOAD_TYPE,
    protectedRtp,
    relays,
    SENDER_A,
    SSRCS
} from './_group-harness.js'

test('a 1:1 plan never touches the layered declaration, a group plan hands it over', async (t) => {
    const { plane, relay } = createPlane()
    t.after(() => plane.stop())

    await plane.apply({ ssrcs: SSRCS })
    assert.deepEqual(relay.layers, [])

    await plane.apply({ ssrcs: { ...SSRCS, selfLayers: LAYERS } })
    await plane.apply({ ssrcs: SSRCS })
    await plane.apply({ ssrcs: SSRCS })

    assert.deepEqual(relay.layers, [LAYERS, null])
})

test('the relay frame comes off group media of either header size before it is read', async (t) => {
    const { plane, internals, decoders } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A) })

    internals.onRelayData(
        framed(protectedRtp(SENDER_A.recv, A_AUDIO, 1, MLOW_RED_PAYLOAD_TYPE), 0x02)
    )
    internals.onRelayData(
        framed(protectedRtp(SENDER_A.recv, A_AUDIO, 2, MLOW_RED_PAYLOAD_TYPE), 0x07)
    )
    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 3, MLOW_RED_PAYLOAD_TYPE))

    assert.deepEqual(decoders[0].seqs, [1, 2, 3])
    const stats = plane.getStats()
    assert.equal(stats.warpFrames, 2)
    assert.equal(stats.srtpErrors, 0)
})

test('a framed sender report is read as rtcp and reaches its sender', async (t) => {
    const { plane, internals } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A) })
    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 1))
    const report = buildSenderReportWithSdes(A_AUDIO, 1, 4, FRAME)

    internals.onRelayData(
        framed(new SrtcpContext(nodeCrypto, SENDER_A.recv).protect(report, A_AUDIO), 0x02)
    )

    const [block] = internals.group.audio!.receptionReports(Date.now())
    assert.notEqual(block.lastSenderReport, 0)
    const stats = plane.getStats()
    assert.equal(stats.warpFrames, 1)
    assert.equal(stats.srtpErrors, 0, 'never handed to the rtp path')
})

test('a 1:1 call takes the frame off as well', async (t) => {
    const { plane, relay, internals } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1) })

    internals.onRelayData(framed(protectedRtp(keys(1).recv, B_AUDIO, 1), 0x02))

    assert.equal(plane.getStats().audioReceived, 1)
    assert.equal(relay.subscriptions.at(-1), B_AUDIO)
})

test('a frame with no media, or a header past the datagram, is counted and dropped', async (t) => {
    const { plane, internals, decoders } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A) })

    internals.onRelayData(framed(new Uint8Array(0), 0x02))
    internals.onRelayData(framed(Uint8Array.of(0x00, 0x01, 0x02), 0x02))
    internals.onRelayData(Uint8Array.of(0x09, 0x7f, 0x00, 0x01, 0x80, 0x78))

    const stats = plane.getStats()
    assert.equal(stats.warpControlFrames, 2)
    assert.equal(stats.warpOverruns, 1)
    assert.equal(stats.srtpErrors, 0)
    assert.deepEqual(decoders[0].seqs, [])
})

test('a relay pong is still read as STUN, never as media', async (t) => {
    const { plane, internals } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A) })

    internals.onRelayData(
        Uint8Array.of(0x08, 0x02, 0x00, 0x00, 0x21, 0x12, 0xa4, 0x42, ...new Uint8Array(12))
    )

    const stats = plane.getStats()
    assert.equal(stats.srtpErrors, 0)
    assert.equal(stats.warpFrames, 0)
    assert.equal(stats.audioReceived, 0)
})

test('relays of a newer generation are dialled even with a leg open', async (t) => {
    const { plane, relay } = createPlane()
    t.after(() => plane.stop())
    relay.connected = true

    await plane.apply({ relays: relays(0) })
    await plane.apply({ relays: relays(1, '10.0.0.2') })

    assert.deepEqual(relay.dials, [{ generation: 1, transports: ['raw-udp'] }])
})

test('relays of the generation held wait for a redial while a leg is open', async (t) => {
    const { plane, relay } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ relays: relays(1) })
    relay.connected = true

    await plane.apply({ relays: relays(1, '10.0.0.3') })

    assert.deepEqual(relay.dials, [{ generation: 1, transports: ['raw-udp'] }])
})

test('relays of an older generation are ignored, and a redial uses the newest', async (t) => {
    const { plane, relay, internals } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ relays: relays(1, '10.0.0.2') })

    await plane.apply({ relays: relays(0) })
    await plane.apply({ accepted: true })

    assert.equal(internals.relays?.generation, 1)
    assert.deepEqual(
        relay.dials.map((dial) => dial.generation),
        [1, 1]
    )
})

test('a plan without generations dials as generation 0', async (t) => {
    const { plane, relay } = createPlane()
    t.after(() => plane.stop())

    await plane.apply({ relays: { endpoints: relays(0).endpoints } })

    assert.deepEqual(relay.dials, [{ generation: 0, transports: [undefined] }])
})
