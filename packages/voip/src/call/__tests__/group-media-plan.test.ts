import assert from 'node:assert/strict'
import { test } from 'node:test'

import { derivePerJidSrtpKey } from '../../crypto/encryption.js'
import { generateSecureSsrc, WA_SSRC_SLOT } from '../../crypto/ssrc.js'
import type { RelayEndpoint } from '../../types.js'
import {
    adoptableRelayEndpoints,
    adoptedRelayTransport,
    buildGroupSection,
    electRelayEndpoints,
    groupDevicePids,
    groupSenderDeviceJids,
    relayEndpointKey,
    sameRelayCredentials,
    sameRelayEndpointSet,
    selectVideoSubscriptions,
    selfStreamLayers,
    senderStreamsOf
} from '../group-media-plan.js'
import { createGroupComposition, WA_CALL_PARTICIPANT_STATE } from '../group-participants.js'

const CALL_ID = '00EDC41F288B7E1A52CC461DBDD168BB'
const SELF = '112984198234339@lid'
const SELF_DEVICE = '112984198234339:0@lid'
const PEER_DEVICE = '50062877036657:76@lid'
const PEER_SECOND_DEVICE = '50062877036657:12@lid'
const THIRD_DEVICE = '184478207058035:0@lid'

function endpoint(fields: Partial<RelayEndpoint> & Pick<RelayEndpoint, 'ip'>): RelayEndpoint {
    return {
        port: 3478,
        token: 'TOKEN',
        rawToken: Uint8Array.of(1, 2, 3),
        key: 'KEY',
        relayId: 0,
        relayName: 'gru2c01',
        ...fields
    }
}

/** Two relays, each listed under `protocol=1` first and then dialable, over both families. */
const GRU_V4 = endpoint({ ip: '10.2.2.2', relayId: 0, relayName: 'gru2c01', c2rRtt: 19 })
const GRU_V6 = endpoint({ ip: 'fd00::2', relayId: 0, relayName: 'gru2c01', c2rRtt: 19 })
const GIG_V4 = endpoint({ ip: '10.3.3.3', relayId: 1, relayName: 'gig4c02', c2rRtt: 27 })
const GIG_V6 = endpoint({ ip: 'fd00::3', relayId: 1, relayName: 'gig4c02', c2rRtt: 27 })
const POOL: readonly RelayEndpoint[] = [
    { ...GRU_V4, protocol: 1 },
    { ...GRU_V6, protocol: 1 },
    { ...GIG_V4, protocol: 1 },
    { ...GIG_V6, protocol: 1 },
    GRU_V4,
    GRU_V6,
    GIG_V4,
    GIG_V6
]

test('the election takes the lowest round trip among dialable endpoints, both families of it', () => {
    assert.deepEqual(electRelayEndpoints(POOL), [GRU_V4, GRU_V6])
    // The order of the pool does not decide it.
    assert.deepEqual(electRelayEndpoints([...POOL].reverse()), [GRU_V6, GRU_V4])
})

test('the election never picks an endpoint the media cannot dial', () => {
    const fasterButUnspeakable = { ...GIG_V4, c2rRtt: 1, protocol: 1 }
    assert.deepEqual(electRelayEndpoints([fasterButUnspeakable, GRU_V4]), [GRU_V4])

    const noToken = { ...GIG_V4, c2rRtt: 1, rawToken: undefined }
    assert.deepEqual(electRelayEndpoints([noToken, GRU_V4]), [GRU_V4])

    assert.deepEqual(electRelayEndpoints(POOL.filter((ep) => ep.protocol === 1)), [])
})

test('a tie, or no round trip at all, keeps the first relay listed', () => {
    const tied = { ...GIG_V4, c2rRtt: 19 }
    assert.deepEqual(electRelayEndpoints([GRU_V4, tied]), [GRU_V4])

    const unmeasured = [
        { ...GIG_V4, c2rRtt: undefined },
        { ...GRU_V4, c2rRtt: undefined }
    ]
    assert.deepEqual(electRelayEndpoints(unmeasured), [unmeasured[0]])
})

test('a relay endpoint is its address: a re-minted token is the same endpoint', () => {
    const reminted: RelayEndpoint = { ...GRU_V4, token: 'OTHER', rawToken: Uint8Array.of(9) }
    assert.equal(relayEndpointKey(GRU_V4), relayEndpointKey(reminted))
    assert.notEqual(relayEndpointKey(GRU_V4), relayEndpointKey({ ...GRU_V4, port: 3480 }))

    assert.equal(sameRelayEndpointSet([GRU_V4, GRU_V6], [GRU_V6, GRU_V4]), true)
    assert.equal(sameRelayEndpointSet([GRU_V4], [reminted]), true)
    assert.equal(sameRelayEndpointSet([GRU_V4, GRU_V6], [GIG_V4, GIG_V6]), false)
    assert.equal(sameRelayEndpointSet([GRU_V4], [GRU_V4, GRU_V6]), false)
})

test('the senders are every device of every participant on the call, ourselves left out', () => {
    const composition = createGroupComposition([
        { jid: SELF, devices: [SELF_DEVICE], state: WA_CALL_PARTICIPANT_STATE.Connected },
        { jid: '50062877036657@lid', devices: [PEER_DEVICE, PEER_SECOND_DEVICE] },
        { jid: '184478207058035@lid', devices: ['184478207058035@lid'] },
        {
            jid: '999@lid',
            devices: ['999:0@lid'],
            state: WA_CALL_PARTICIPANT_STATE.Terminated
        },
        { jid: '50062877036657:76@lid', devices: [PEER_DEVICE] }
    ])

    assert.deepEqual(groupSenderDeviceJids(composition, `${SELF}`), [
        PEER_DEVICE,
        PEER_SECOND_DEVICE,
        THIRD_DEVICE
    ])
    // Our own account is left out whichever device of it we are.
    assert.equal(groupSenderDeviceJids(composition, '112984198234339:7@lid').length, 3)
})

test('our streams are declared as four layers of ten ssrcs, video whether or not it is on', () => {
    const layers = selfStreamLayers(CALL_ID, SELF_DEVICE)
    const ssrc = (jid: string, slot: number) => generateSecureSsrc(CALL_ID, jid, slot)

    assert.deepEqual(layers, [
        {
            layer: 0,
            ssrcs: [
                ssrc(SELF_DEVICE, WA_SSRC_SLOT.AUDIO.MAIN),
                ssrc(SELF_DEVICE, WA_SSRC_SLOT.AUDIO.FEC),
                ssrc(SELF_DEVICE, WA_SSRC_SLOT.AUDIO.OOB_NACK)
            ]
        },
        {
            layer: 1,
            ssrcs: [
                ssrc(SELF_DEVICE, WA_SSRC_SLOT.VIDEO.MAIN),
                ssrc(SELF_DEVICE, WA_SSRC_SLOT.VIDEO.FEC),
                ssrc(SELF_DEVICE, WA_SSRC_SLOT.VIDEO.OOB_NACK)
            ]
        },
        {
            layer: 2,
            ssrcs: [
                ssrc(`${SELF_DEVICE}_1`, WA_SSRC_SLOT.VIDEO.MAIN),
                ssrc(`${SELF_DEVICE}_1`, WA_SSRC_SLOT.VIDEO.FEC),
                ssrc(`${SELF_DEVICE}_1`, WA_SSRC_SLOT.VIDEO.OOB_NACK)
            ]
        },
        { layer: 5, ssrcs: [ssrc(SELF_DEVICE, WA_SSRC_SLOT.APP_DATA.MAIN)] }
    ])
    assert.equal(layers.flatMap((entry) => entry.ssrcs).length, 10)
    assert.equal(new Set(layers.flatMap((entry) => entry.ssrcs)).size, 10)
})

test("a sender's audio covers its main stream, FEC, out-of-band NACK and app data", () => {
    assert.deepEqual(senderStreamsOf(CALL_ID, PEER_DEVICE, false), [
        generateSecureSsrc(CALL_ID, PEER_DEVICE, WA_SSRC_SLOT.AUDIO.MAIN),
        generateSecureSsrc(CALL_ID, PEER_DEVICE, WA_SSRC_SLOT.AUDIO.FEC),
        generateSecureSsrc(CALL_ID, PEER_DEVICE, WA_SSRC_SLOT.AUDIO.OOB_NACK),
        generateSecureSsrc(CALL_ID, PEER_DEVICE, WA_SSRC_SLOT.APP_DATA.MAIN)
    ])
})

test('covering video adds both video layers of the sender, main audio still first', () => {
    const streams = senderStreamsOf(CALL_ID, PEER_DEVICE, true)

    assert.equal(streams.length, 10)
    assert.equal(streams[0], generateSecureSsrc(CALL_ID, PEER_DEVICE, WA_SSRC_SLOT.AUDIO.MAIN))
    for (const slot of [
        WA_SSRC_SLOT.AUDIO.FEC,
        WA_SSRC_SLOT.AUDIO.OOB_NACK,
        WA_SSRC_SLOT.APP_DATA.MAIN,
        WA_SSRC_SLOT.VIDEO.MAIN,
        WA_SSRC_SLOT.VIDEO.FEC,
        WA_SSRC_SLOT.VIDEO.OOB_NACK
    ]) {
        assert.ok(streams.includes(generateSecureSsrc(CALL_ID, PEER_DEVICE, slot)), String(slot))
    }
    for (const slot of [WA_SSRC_SLOT.VIDEO.MAIN, WA_SSRC_SLOT.VIDEO.FEC]) {
        assert.ok(streams.includes(generateSecureSsrc(CALL_ID, `${PEER_DEVICE}_1`, slot)))
    }
})

test('each sender is keyed from its own device jid, and no jid crosses the plan', () => {
    const callKey = new Uint8Array(32).fill(0x5a)
    const section = buildGroupSection(CALL_ID, callKey, [PEER_DEVICE, THIRD_DEVICE], false)

    assert.equal(section.senders.length, 2)
    const [peer, third] = section.senders
    assert.deepEqual(peer.recv, derivePerJidSrtpKey(callKey, PEER_DEVICE))
    assert.deepEqual(third.recv, derivePerJidSrtpKey(callKey, THIRD_DEVICE))
    assert.notDeepEqual(peer.recv, third.recv)

    assert.equal(peer.audio, generateSecureSsrc(CALL_ID, PEER_DEVICE, WA_SSRC_SLOT.AUDIO.MAIN))
    assert.deepEqual(peer.streams, senderStreamsOf(CALL_ID, PEER_DEVICE, false))
    assert.notEqual(peer.id, third.id)
    assert.ok(!peer.id.includes('@'), 'the sender id is opaque')

    // Stable for the device: the same call derives the same id.
    assert.equal(buildGroupSection(CALL_ID, callKey, [PEER_DEVICE], true).senders[0].id, peer.id)
})

test('the same addresses under another token, auth token or key are other credentials', () => {
    assert.equal(sameRelayCredentials([GRU_V4, GRU_V6], [GRU_V6, GRU_V4]), true)
    assert.equal(sameRelayCredentials([GRU_V4], [{ ...GRU_V4, token: 'OTHER' }]), false)
    assert.equal(sameRelayCredentials([GRU_V4], [{ ...GRU_V4, authToken: 'AUTH' }]), false)
    assert.equal(sameRelayCredentials([GRU_V4], [{ ...GRU_V4, key: 'OTHERKEY' }]), false)
    // The election's own fields are not credentials.
    const remeasured: RelayEndpoint = { ...GRU_V4, c2rRtt: 99 }
    assert.equal(sameRelayCredentials([GRU_V4], [remeasured]), true)
})

test('an adopted endpoint goes raw with no auth token, and the ordinary way with one', () => {
    assert.equal(adoptedRelayTransport(GRU_V4), 'raw-udp')
    assert.equal(adoptedRelayTransport({ ...GRU_V4, authToken: 'AUTH' }), undefined)
})

test('an adopted descriptor brings every dialable relay, elected first, each over both families', () => {
    const lis = endpoint({ ip: '10.5.5.5', relayId: 2, relayName: 'lis1c01', c2rRtt: 44 })
    assert.deepEqual(adoptableRelayEndpoints([lis, ...POOL]), [GRU_V4, GRU_V6, GIG_V4, GIG_V6, lis])
    assert.deepEqual(adoptableRelayEndpoints(POOL.filter((ep) => ep.protocol === 1)), [])
})

test('video is asked for every camera that is on, at most four, once more than two are connected', () => {
    const senders = ['a', 'b', 'c', 'd', 'e', 'f'].map((senderId, index) => ({
        senderId,
        videoEnabled: index !== 1
    }))

    assert.deepEqual(selectVideoSubscriptions(senders, 3), [
        { senderId: 'a', quality: 0 },
        { senderId: 'c', quality: 0 },
        { senderId: 'd', quality: 0 },
        { senderId: 'e', quality: 0 }
    ])
    assert.deepEqual(selectVideoSubscriptions(senders, 2), [])
})

test('each sender carries its roster pid, 0 included, and the section the video asked for', () => {
    const composition = createGroupComposition([
        { jid: '50062877036657@lid', devices: [PEER_DEVICE], devicePids: { [PEER_DEVICE]: 0 } },
        { jid: '184478207058035@lid', devices: ['184478207058035@lid'] }
    ])
    const pids = groupDevicePids(composition)
    assert.deepEqual([...pids], [[PEER_DEVICE, 0]])

    const callKey = new Uint8Array(32).fill(1)
    const subscriptions = [{ senderId: 'x', quality: 2 }]
    const section = buildGroupSection(
        CALL_ID,
        callKey,
        [PEER_DEVICE, THIRD_DEVICE],
        false,
        pids,
        subscriptions
    )
    assert.equal(section.senders[0].pid, 0)
    assert.equal('pid' in section.senders[1], false)
    assert.deepEqual(section.videoSubscriptions, subscriptions)
    assert.equal('videoSubscriptions' in buildGroupSection(CALL_ID, callKey, [], false), false)
    // A reaction finds its sender through the app data among the sender's streams.
    assert.ok(
        section.senders[0].streams.includes(
            generateSecureSsrc(CALL_ID, PEER_DEVICE, WA_SSRC_SLOT.APP_DATA.MAIN)
        )
    )
})
