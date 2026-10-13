import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bytesToHex } from '../../bytes.js'
import { SrtcpContext } from '../../crypto/srtp.js'
import { buildSenderReportWithSdes } from '../../media/rtcp.js'
import { nodeCrypto } from '../../node/crypto.js'
import { WA_VIDEO_QUALITY, type WaCallMediaSender } from '../plan.js'

import {
    A_APP,
    A_AUDIO,
    B_APP,
    B_AUDIO,
    createPlane,
    FRAME,
    FULL_A,
    FULL_B,
    FULL_SSRCS,
    group,
    keys,
    protectedRtp,
    reactionPacket,
    SENDER_B,
    SSRCS
} from './_group-harness.js'

test('a group reaction names the sender whose app-data stream carried it', async (t) => {
    const reactions: [string, string | undefined][] = []
    const { plane, internals } = createPlane({
        onReaction: (reaction, senderId) => reactions.push([reaction.reaction, senderId])
    })
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: FULL_SSRCS, keys: keys(1), group: group(FULL_A, FULL_B) })

    internals.onRelayData(reactionPacket(FULL_B, B_APP, '👍'))
    internals.onRelayData(reactionPacket(FULL_A, A_APP, '🔥'))

    assert.deepEqual(reactions, [
        ['👍', 'b'],
        ['🔥', 'a']
    ])
})

test('a group plan replaces the app-data streams it recognizes, past the bound of a 1:1 call', async (t) => {
    const many = Array.from({ length: 40 }, (_, index) => 0x5000 + index)
    const groupCall = createPlane()
    t.after(() => groupCall.plane.stop())
    await groupCall.plane.apply({
        ssrcs: { ...SSRCS, peerAppData: many },
        keys: keys(1),
        group: group(FULL_A)
    })
    assert.equal(groupCall.internals.peerAppDataSsrcs.size, 40)

    await groupCall.plane.apply({ ssrcs: { ...SSRCS, peerAppData: [A_APP] } })
    assert.deepEqual([...groupCall.internals.peerAppDataSsrcs], [A_APP])

    const oneToOne = createPlane()
    t.after(() => oneToOne.plane.stop())
    await oneToOne.plane.apply({ ssrcs: { ...SSRCS, peerAppData: many } })
    await oneToOne.plane.apply({ ssrcs: { ...SSRCS, peerAppData: [A_APP] } })
    assert.equal(oneToOne.internals.peerAppDataSsrcs.size, 32, 'a 1:1 call only adds, bounded')
})

test('a sender is heard on its first authenticated packet and silent after the silence', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const time = { ms: 0 }
    const edges: [string, boolean][] = []
    const { plane, internals } = createPlane({
        now: () => time.ms,
        senderSilenceMs: 3_000,
        onSenderMedia: (senderId, receiving) => edges.push([senderId, receiving])
    })
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: FULL_SSRCS, keys: keys(1), group: group(FULL_A, FULL_B) })

    internals.onRelayData(protectedRtp(SENDER_B.recv, A_AUDIO, 1))
    internals.onRelayData(protectedRtp(FULL_A.recv, A_AUDIO, 2))
    internals.onRelayData(protectedRtp(FULL_A.recv, A_AUDIO, 3))
    internals.onRelayData(
        new SrtcpContext(nodeCrypto, FULL_B.recv).protect(
            buildSenderReportWithSdes(B_AUDIO, 1, 4, FRAME),
            B_AUDIO
        )
    )
    assert.deepEqual(edges, [
        ['a', true],
        ['b', true]
    ])

    time.ms = 2_000
    internals.onRelayData(protectedRtp(FULL_A.recv, A_APP, 4, 119))
    time.ms = 3_500
    t.mock.timers.tick(3_500)
    assert.deepEqual(edges.at(-1), ['b', false], 'a was heard again on its app data')

    time.ms = 6_000
    t.mock.timers.tick(2_500)
    internals.onRelayData(protectedRtp(FULL_A.recv, A_AUDIO, 5))
    assert.deepEqual(edges.slice(2), [
        ['b', false],
        ['a', false],
        ['a', true]
    ])

    await plane.apply({ group: group(FULL_B) })
    assert.deepEqual(edges.at(-1), ['a', false], 'a sender that leaves while heard goes silent')
})

test('the plan subscriptions reach the relay by pid when the plane asks for them', async (t) => {
    const { plane, relay } = createPlane({ videoSubscriptions: true })
    t.after(() => plane.stop())
    const noPid: WaCallMediaSender = { ...SENDER_B, id: 'c', audio: 0x0c0c0c01, streams: [] }

    await plane.apply({
        ssrcs: FULL_SSRCS,
        keys: keys(1),
        group: {
            senders: [FULL_A, FULL_B, noPid],
            videoSubscriptions: [
                { senderId: 'a', quality: WA_VIDEO_QUALITY.Medium },
                { senderId: 'b', quality: WA_VIDEO_QUALITY.Medium },
                { senderId: 'c', quality: WA_VIDEO_QUALITY.Medium }
            ]
        }
    })
    await plane.apply({ group: group(FULL_A, FULL_B) })
    await plane.apply({ group: group(FULL_A, FULL_B) })

    assert.equal(
        bytesToHex(relay.rxSubscriptions[0]!),
        '12021002120408021002',
        'pid 0 written as the default, pid 2 written, both at quality 2'
    )
    assert.deepEqual(relay.rxSubscriptions.slice(1), [null], 'cleared once, then left alone')
})

test('the plan subscriptions stay off the relay unless the plane asks for them', async (t) => {
    const { plane, relay } = createPlane()
    t.after(() => plane.stop())

    await plane.apply({
        ssrcs: FULL_SSRCS,
        keys: keys(1),
        group: { senders: [FULL_A], videoSubscriptions: [{ senderId: 'a', quality: 2 }] }
    })

    assert.deepEqual(relay.rxSubscriptions, [])
})
