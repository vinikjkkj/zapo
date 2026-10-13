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
    group,
    keys,
    material,
    NOBODY,
    protectedRtp,
    SENDER_A,
    SENDER_B,
    senderStats,
    SSRCS
} from './_group-harness.js'

test('each sender authenticates under its own key, and a packet under another is counted to it', async (t) => {
    const { plane, internals, decoders } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A, SENDER_B) })

    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 1))
    internals.onRelayData(protectedRtp(SENDER_B.recv, B_AUDIO, 7))
    internals.onRelayData(protectedRtp(SENDER_B.recv, A_AUDIO, 2))

    assert.deepEqual(decoders[0].seqs, [1])
    assert.deepEqual(decoders[1].seqs, [7])
    assert.deepEqual(senderStats(plane), { a: { recv: 1, auth: 1 }, b: { recv: 1, auth: 0 } })
    assert.equal(plane.getStats().srtpAuthFailures, 1)
})

test('a sender report authenticates under its sender key and reaches that sender only', async (t) => {
    const { plane, internals } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A, SENDER_B) })
    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 1))
    internals.onRelayData(protectedRtp(SENDER_B.recv, B_AUDIO, 1))
    const report = buildSenderReportWithSdes(A_AUDIO, 1, 4, FRAME)

    internals.onRelayData(new SrtcpContext(nodeCrypto, SENDER_A.recv).protect(report, A_AUDIO))
    internals.onRelayData(new SrtcpContext(nodeCrypto, keys(1).recv).protect(report, A_AUDIO))

    const blocks = internals.group.audio!.receptionReports(Date.now())
    assert.deepEqual(
        blocks.map((block) => [block.ssrc, block.lastSenderReport !== 0]),
        [
            [A_AUDIO, true],
            [B_AUDIO, false]
        ]
    )
    assert.equal(senderStats(plane).a.auth, 1, 'the report under the call key failed')
})

/** Re-keying an unchanged sender would restart its rollover counter and replay window. */
test('the group again keeps unchanged senders keyed as they were and drops the ones left out', async (t) => {
    const { plane, internals } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A, SENDER_B) })
    const first = protectedRtp(SENDER_A.recv, A_AUDIO, 5)
    internals.onRelayData(first)

    await plane.apply({ group: group({ ...SENDER_A, recv: material(0xa1) }) })
    internals.onRelayData(first)
    internals.onRelayData(protectedRtp(SENDER_B.recv, B_AUDIO, 1))

    const stats = plane.getStats()
    assert.equal(stats.srtpReplays, 1, 'the same context saw the packet again')
    assert.equal(stats.unplannedPackets, 1, 'the sender left out is no longer let in')
    assert.deepEqual(
        stats.senders?.map((sender) => sender.id),
        ['a']
    )
    assert.equal(internals.srtpSession?.recvContextCount, 2)
    assert.equal(internals.srtcpRecvSession?.recvContextCount, 2)
})

test('new key material for a sender replaces its contexts', async (t) => {
    const { plane, internals, decoders } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A) })

    await plane.apply({ group: group({ ...SENDER_A, recv: material(0xa9) }) })
    internals.onRelayData(protectedRtp(material(0xa9), A_AUDIO, 1))
    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 2))

    assert.deepEqual(decoders[0].seqs, [1])
    assert.equal(plane.getStats().srtpAuthFailures, 1)
})

test('a new key epoch rebuilds the sessions and keys every sender again', async (t) => {
    const { plane, internals, decoders } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A) })
    const before = internals.srtpSession

    await plane.apply({ keys: keys(2) })
    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 1))

    assert.notEqual(internals.srtpSession, before)
    assert.deepEqual(decoders[0].seqs, [1])
})

test('senders listed before the keys are keyed when the keys arrive', async (t) => {
    const { plane, internals, decoders } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, group: group(SENDER_A) })

    await plane.apply({ keys: keys(1) })
    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 1))

    assert.deepEqual(decoders[0].seqs, [1])
})

/** The compiled bound of 32 contexts would evict planned streams with a dozen senders. */
test('the receive context bound covers every planned stream with room to spare', async (t) => {
    const { plane, internals } = createPlane()
    t.after(() => plane.stop())
    const senders = Array.from({ length: 12 }, (_, index) => {
        const base = 0x1000 * (index + 1)
        return {
            id: `s${index}`,
            audio: base,
            streams: [base, base + 1, base + 4, base + 6],
            recv: material(index + 10)
        }
    })

    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: { senders } })

    assert.equal(internals.srtpSession?.recvContextCount, 48)
    assert.equal(internals.srtcpRecvSession?.recvContextCount, 48)
    assert.ok((internals.srtpSession?.maxRecvContexts ?? 0) >= 48 + 32)

    await plane.apply({ group: group(SENDER_A) })
    assert.equal(internals.srtpSession?.recvContextCount, 2)
    assert.equal(internals.srtpSession?.maxRecvContexts, 2 + 32)
})

test('a null group leaves group mode and drops the senders keys', async (t) => {
    const { plane, relay, internals } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A) })

    await plane.apply({ group: null })
    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 1))
    internals.onRelayData(protectedRtp(keys(1).recv, B_AUDIO, 1))

    const stats = plane.getStats()
    assert.equal(stats.senders, undefined)
    assert.equal(stats.srtpAuthFailures, 1)
    assert.equal(relay.subscriptions.at(-1), B_AUDIO, 'the 1:1 path latches again')
    assert.equal(internals.srtpSession?.maxRecvContexts, 32)
})

test('group audio latches nothing, and audio no sender owns is dropped', async (t) => {
    const { plane, relay, internals, decoders } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A) })
    const subscriptions = relay.subscriptions.length

    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 1))
    internals.onRelayData(protectedRtp(keys(1).recv, NOBODY, 1))

    assert.equal(relay.subscriptions.length, subscriptions)
    assert.deepEqual(decoders[0].seqs, [1])
    const stats = plane.getStats()
    assert.equal(stats.audioReceived, 1)
    assert.equal(stats.unplannedPackets, 1)
    assert.equal(stats.srtpErrors, 0, 'dropped before SRTP was asked')
})

/** A context keyed lazily with the call key would take a slot a sender's stream may need. */
test('rtp and rtcp on an unplanned ssrc never reach srtp, so they key no context', async (t) => {
    const { plane, internals } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A) })
    const report = buildSenderReportWithSdes(NOBODY, 1, 4, FRAME)

    internals.onRelayData(protectedRtp(keys(1).recv, NOBODY, 1))
    internals.onRelayData(new SrtcpContext(nodeCrypto, keys(1).recv).protect(report, NOBODY))

    assert.equal(internals.srtpSession?.recvContextCount, 2)
    assert.equal(internals.srtcpRecvSession?.recvContextCount, 2)
    assert.equal(plane.getStats().unplannedPackets, 2)
})

test('a group plan still lets in the app data of every device it lists', async (t) => {
    const { plane, internals } = createPlane()
    t.after(() => plane.stop())
    const appData = 0x0d0d0d06
    await plane.apply({
        ssrcs: { ...SSRCS, peerAppData: [appData] },
        keys: keys(1),
        group: group(SENDER_A)
    })

    internals.onRelayData(protectedRtp(keys(1).recv, appData, 1, 119))

    assert.equal(plane.getStats().unplannedPackets, 0)
})
