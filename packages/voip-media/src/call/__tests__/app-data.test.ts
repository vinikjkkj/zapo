import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { encodeReactionPayload, type WaCallReaction } from '../../app-data/protocol.js'
import { WA_APP_DATA_PAYLOAD_TYPE } from '../../app-data/WaAppDataStream.js'
import { SrtpSession } from '../../crypto/srtp.js'
import { createNoopLogger } from '../../logger.js'
import { RtpHeader, RtpPacket } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import {
    SRTP_RECV_AUTH_TAG_LEN,
    SRTP_SEND_AUTH_TAG_LEN,
    type SrtpKeyingMaterial
} from '../../types.js'
import type { WaCallMediaRelay, WaCallMediaRelays, WaCallMediaSsrcs } from '../plan.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

const PEER_PAYLOAD_TYPE = 108
const THUMBS_UP = '\u{1F44D}'

const SELF_AUDIO_SSRC = 0x11111111
const SELF_VIDEO_SSRC = 0x22222222
const SELF_APP_DATA_SSRC = 0x66666666
const PEER_AUDIO_SSRC = 0x33333333
const PEER_APP_DATA_SSRC = 0x77777777

/** The streams of an audio call, already derived by signaling. */
const SSRCS: WaCallMediaSsrcs = {
    selfAudio: SELF_AUDIO_SSRC,
    selfVideo: SELF_VIDEO_SSRC,
    selfAppData: SELF_APP_DATA_SSRC,
    selfStreams: [SELF_AUDIO_SSRC, SELF_APP_DATA_SSRC],
    selfVideoStreams: [SELF_VIDEO_SSRC],
    peerAudio: PEER_AUDIO_SSRC,
    peerStreams: [PEER_AUDIO_SSRC, PEER_APP_DATA_SSRC],
    peerVideoStreams: [],
    peerAppData: [PEER_APP_DATA_SSRC]
}

/** SRTP keys of each side, distinct so a direction mixed up cannot decrypt. */
const SELF_KEY: SrtpKeyingMaterial = {
    masterKey: new Uint8Array(16).fill(7),
    masterSalt: new Uint8Array(14).fill(8)
}
const PEER_KEY: SrtpKeyingMaterial = {
    masterKey: new Uint8Array(16).fill(9),
    masterSalt: new Uint8Array(14).fill(10)
}

/** One `setStreamSsrcs` the plane handed the relay. */
interface DeclaredStreams {
    readonly self: readonly number[]
    readonly peer: readonly number[]
}

interface RelayStub {
    cleanup: () => void
    setMediaFlowing: () => void
    sendMedia: (data: ArrayBuffer) => boolean
    hasConnection: () => boolean
    setSsrc: (ssrc: number) => void
    setStreamSsrcs: (self: number[], peer: number[]) => void
    setSubscriptionSsrc: (ssrc: number) => void
    setParticipantIds: (self?: number, peer?: number) => void
    resendSubscriptions: () => void
    configureRelays: (relays: readonly unknown[]) => Promise<void>
    getConnectedCount: () => number
}

interface Harness {
    readonly plane: WaCallMediaPlane
    readonly reactions: WaCallReaction[]
    readonly sent: Uint8Array[]
    /** What the relay was actually told, in order, rather than what the plane holds. */
    readonly declared: DeclaredStreams[]
    readonly internals: {
        sctpRelay: RelayStub
        actualPeerSsrc: number | null
        peerAppDataSsrcs: Set<number>
        appDataStream: { readonly ssrc: number } | null
        onRelayData: (data: Uint8Array) => void
        connectRelays: (relays: WaCallMediaRelays) => Promise<void>
    }
}

/**
 * A plane whose relay is inert, so only the app-data path is exercised.
 * `relayAccepts: false` stands for a call with no relay connection open.
 */
async function createPlane(options: { relayAccepts?: boolean } = {}): Promise<Harness> {
    const reactions: WaCallReaction[] = []
    const sent: Uint8Array[] = []
    const declared: DeclaredStreams[] = []
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        onReaction: (reaction) => {
            reactions.push(reaction)
        }
    })

    const internals = plane as unknown as Harness['internals']
    internals.sctpRelay = {
        cleanup: () => {},
        setMediaFlowing: () => {},
        sendMedia: (data) => {
            if (options.relayAccepts === false) return false
            sent.push(new Uint8Array(data))
            return true
        },
        hasConnection: () => false,
        setSsrc: () => {},
        setStreamSsrcs: (self, peer) => {
            declared.push({ self: [...self], peer: [...peer] })
        },
        setSubscriptionSsrc: () => {},
        setParticipantIds: () => {},
        resendSubscriptions: () => {},
        configureRelays: async () => {},
        getConnectedCount: () => 1
    }

    await plane.apply({ ssrcs: SSRCS, keys: { epoch: 1, send: SELF_KEY, recv: PEER_KEY } })
    // The plan's own registration is setup; tests count declarations from here.
    declared.length = 0

    return { plane, reactions, sent, declared, internals }
}

/** Media flowing, the way an accepted call with a leg up has it. */
async function startMedia(harness: Harness): Promise<void> {
    harness.internals.sctpRelay.hasConnection = () => true
    await harness.plane.apply({ accepted: true })
}

/** One app-data packet as the peer would put it on the wire. */
function peerAppDataPacket(reaction: string, transactionId: bigint, sequence: number): Uint8Array {
    const peerSrtp = new SrtpSession(
        nodeCrypto,
        PEER_KEY,
        SELF_KEY,
        SRTP_SEND_AUTH_TAG_LEN,
        SRTP_RECV_AUTH_TAG_LEN
    )
    const header = new RtpHeader(PEER_PAYLOAD_TYPE, sequence, 0, PEER_APP_DATA_SSRC)
    return peerSrtp.protect(
        new RtpPacket(header, encodeReactionPayload({ transactionId, reaction }))
    )
}

/** One relay endpoint, complete enough for the plane to dial it. */
const RELAY_ENDPOINT: WaCallMediaRelay = {
    ip: '203.0.113.7',
    port: 3478,
    token: 'token',
    rawToken: new Uint8Array([1, 2, 3]),
    key: 'key',
    relayId: 1
}

test('an audio call declares its own app-data ssrc', async (t) => {
    const { plane, declared, internals } = await createPlane()
    t.after(() => plane.stop())

    assert.equal(
        internals.appDataStream?.ssrc,
        SELF_APP_DATA_SSRC,
        'the stream opened on the app-data ssrc the plan names'
    )

    // Asserted on what the relay was handed, not on the field behind it: the relay drops
    // what it was never told about, so holding the ssrc is not declaring it.
    await internals.connectRelays({ endpoints: [RELAY_ENDPOINT] })

    assert.equal(declared.length, 1, 'configuring the relays declared the streams once')
    assert.ok(declared[0].self.includes(SELF_APP_DATA_SSRC), 'the app-data ssrc reached the relay')
    assert.ok(
        declared[0].peer.includes(PEER_APP_DATA_SSRC),
        'the peer app-data stream is subscribed'
    )
    assert.ok(internals.peerAppDataSsrcs.has(PEER_APP_DATA_SSRC))
})

test('an inbound app-data packet surfaces one reaction', async (t) => {
    const { plane, reactions, internals } = await createPlane()
    t.after(() => plane.stop())

    internals.onRelayData(peerAppDataPacket(THUMBS_UP, 1234n, 1))

    assert.equal(reactions.length, 1)
    assert.equal(reactions[0].reaction, THUMBS_UP)
    assert.equal(reactions[0].transactionId, 1234n)
})

test('a retransmitted reaction reaches onReaction once', async (t) => {
    const { plane, reactions, internals } = await createPlane()
    t.after(() => plane.stop())

    internals.onRelayData(peerAppDataPacket(THUMBS_UP, 55n, 1))
    internals.onRelayData(peerAppDataPacket(THUMBS_UP, 55n, 2))
    internals.onRelayData(peerAppDataPacket(THUMBS_UP, 55n, 3))

    assert.equal(reactions.length, 1)
})

test('app data does not become the peer media ssrc', async (t) => {
    const { plane, internals } = await createPlane()
    t.after(() => plane.stop())

    internals.onRelayData(peerAppDataPacket(THUMBS_UP, 1n, 1))

    assert.equal(
        internals.actualPeerSsrc,
        null,
        'latching the app-data ssrc would resubscribe the call to a stream with no audio'
    )
})

test('a reaction is sent on an active call without waiting for the peer', async (t) => {
    const harness = await createPlane()
    const { plane, sent } = harness
    t.after(() => plane.stop())

    assert.equal(plane.sendReaction(THUMBS_UP), false, 'the call is not active yet')
    assert.equal(sent.length, 0)

    await startMedia(harness)

    assert.equal(plane.sendReaction('\u{1F602}'), true)
    assert.ok(sent.length >= 1)

    const sentSsrc = (sent[0][8] << 24) | (sent[0][9] << 16) | (sent[0][10] << 8) | sent[0][11]
    assert.equal(
        sentSsrc >>> 0,
        SELF_APP_DATA_SSRC,
        'a reaction leaves on this device app-data ssrc'
    )
    assert.equal(
        sent[0][1] & 0x7f,
        WA_APP_DATA_PAYLOAD_TYPE,
        'the type stamped is this side own, not one taken from the peer'
    )
})

/**
 * With no relay connection open nothing leaves, and reporting success there tells a caller
 * the peer saw a reaction that was never sent.
 */
test('a reaction reports failure when no relay connection took it', async (t) => {
    const harness = await createPlane({ relayAccepts: false })
    const { plane, sent } = harness
    t.after(() => plane.stop())

    await startMedia(harness)

    assert.equal(plane.sendReaction(THUMBS_UP), false)
    assert.equal(sent.length, 0)
})

test('a reaction handler that throws is logged, and the next reaction still arrives', async (t) => {
    const { plane, internals } = await createPlane()
    t.after(() => plane.stop())
    const warnings: string[] = []
    const delivered: bigint[] = []
    const planeInternals = plane as unknown as {
        logger: ReturnType<typeof createNoopLogger>
        events: { onReaction: (reaction: WaCallReaction) => void }
    }
    planeInternals.logger = {
        ...createNoopLogger(),
        warn: (message: string) => {
            warnings.push(message)
        }
    }
    planeInternals.events = {
        onReaction: (reaction) => {
            if (reaction.transactionId === 1n) throw new Error('transport down')
            delivered.push(reaction.transactionId)
        }
    }

    internals.onRelayData(peerAppDataPacket(THUMBS_UP, 1n, 1))
    internals.onRelayData(peerAppDataPacket(THUMBS_UP, 2n, 2))

    assert.deepEqual(warnings, ['reaction handler failed'])
    assert.deepEqual(delivered, [2n])
})
