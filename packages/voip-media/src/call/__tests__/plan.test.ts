import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { SrtpSession } from '../../crypto/srtp.js'
import { createNoopLogger } from '../../logger.js'
import { RtpHeader, RtpPacket } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import { SRTP_RECV_AUTH_TAG_LEN, SRTP_SEND_AUTH_TAG_LEN } from '../../types.js'
import type { WaCallMediaKeys, WaCallMediaRelays, WaCallMediaSsrcs } from '../plan.js'
import { WaCallMediaPlane, type WaCallMediaPlaneEvents } from '../WaCallMediaPlane.js'

const SELF_AUDIO = 0x11111111
const SELF_VIDEO = 0x22222222
const SELF_APP_DATA = 0x66666666
const PEER_AUDIO = 0x33333333
const PEER_VIDEO = 0x44444444
const PEER_APP_DATA = 0x77777777
const UNKNOWN_PEER = 0x99999999
const OTHER_PEER = 0x88888888

const SSRCS: WaCallMediaSsrcs = {
    selfAudio: SELF_AUDIO,
    selfVideo: SELF_VIDEO,
    selfAppData: SELF_APP_DATA,
    selfStreams: [SELF_AUDIO, SELF_APP_DATA],
    selfVideoStreams: [SELF_VIDEO],
    peerAudio: PEER_AUDIO,
    peerStreams: [PEER_AUDIO, PEER_APP_DATA],
    peerVideoStreams: [PEER_VIDEO],
    peerAppData: [PEER_APP_DATA]
}

function keys(epoch: number, fill = epoch): WaCallMediaKeys {
    const material = {
        masterKey: new Uint8Array(16).fill(fill),
        masterSalt: new Uint8Array(14).fill(fill)
    }
    return { epoch, send: material, recv: material }
}

const RELAYS: WaCallMediaRelays = {
    endpoints: [
        {
            ip: '10.0.0.1',
            port: 3478,
            token: 'token',
            rawToken: new Uint8Array([1, 2, 3]),
            key: 'relay-key',
            relayId: 1,
            name: 'relay-a'
        }
    ],
    selfPid: 1,
    peerPid: 2
}

/** A relay that records what the plane asks of it and connects when told to. */
class FakeRelay {
    connected = false
    readonly dials: number[] = []
    readonly subscriptions: number[] = []
    readonly streamSets: { self: number[]; peer: number[] }[] = []
    readonly sent: Uint8Array[] = []
    resends = 0
    selfSsrc = 0
    /** Resolves a dial only when released, so ordering can be observed. */
    holdDials = false
    private releaseDial: (() => void) | null = null

    setSsrc(ssrc: number): void {
        this.selfSsrc = ssrc
    }
    setSubscriptionSsrc(ssrc: number): void {
        this.subscriptions.push(ssrc)
    }
    setStreamSsrcs(self: number[], peer: number[]): void {
        this.streamSets.push({ self: [...self], peer: [...peer] })
    }
    setParticipantIds(): void {}
    resendSubscriptions(): void {
        this.resends++
    }
    async configureRelays(relays: readonly unknown[]): Promise<void> {
        this.dials.push(relays.length)
        if (this.holdDials) {
            await new Promise<void>((resolve) => {
                this.releaseDial = resolve
            })
        }
    }
    release(): void {
        this.releaseDial?.()
    }
    hasConnection(): boolean {
        return this.connected
    }
    getConnectedCount(): number {
        return this.connected ? 1 : 0
    }
    sendMedia(data: ArrayBuffer): boolean {
        this.sent.push(new Uint8Array(data))
        return this.connected
    }
    cleanup(): void {}
}

/** A codec that records the frames it is asked to encode. */
function createCodec(): { codec: unknown; encoded: Float32Array[] } {
    const encoded: Float32Array[] = []
    const codec = {
        getFrameSize: () => 960,
        encode: (frame: Float32Array) => {
            encoded.push(frame.slice())
            return new Uint8Array([0xf8, 0xff, 0xfe])
        },
        resetSequence: () => {},
        decodeSequenced: () => {},
        setExpectedPacketLossPercent: () => {},
        getStats: () => ({ success: 0, errors: 0, plc: 0, fec: 0, late: 0 }),
        destroy: () => {}
    }
    return { codec, encoded }
}

interface PlaneInternals {
    sctpRelay: FakeRelay
    codec: unknown
    srtpSession: unknown
    rtpSession: { getSsrc(): number } | null
    videoRtpSession: { getSsrc(): number } | null
    appDataStream: { ssrc: number } | null
    onRelayConnected(): void
    onRelayData(data: Uint8Array): void
}

function createPlane(events: WaCallMediaPlaneEvents = {}): {
    plane: WaCallMediaPlane
    relay: FakeRelay
    internals: PlaneInternals
    encoded: Float32Array[]
} {
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        ...events
    })
    const internals = plane as unknown as PlaneInternals
    const relay = new FakeRelay()
    internals.sctpRelay = relay
    const { codec, encoded } = createCodec()
    internals.codec = codec
    return { plane, relay, internals, encoded }
}

function inboundRtp(ssrc: number, payloadType = 120): RtpPacket {
    return new RtpPacket(new RtpHeader(payloadType, 1, 960, ssrc), new Uint8Array([1, 2, 3]))
}

/** A peer packet under the keys of `keys(1)`, so it authenticates. */
function protectedRtp(ssrc: number, payloadType?: number): Uint8Array {
    const { send } = keys(1)
    const peer = new SrtpSession(
        nodeCrypto,
        send,
        send,
        SRTP_SEND_AUTH_TAG_LEN,
        SRTP_RECV_AUTH_TAG_LEN
    )
    return peer.protect(inboundRtp(ssrc, payloadType))
}

test('the ssrcs section names our streams and the peer stream to the relay', async () => {
    const { plane, relay, internals } = createPlane()

    await plane.apply({ ssrcs: SSRCS })

    assert.equal(relay.selfSsrc, SELF_AUDIO)
    assert.equal(relay.subscriptions.at(-1), PEER_AUDIO)
    assert.deepEqual(relay.streamSets.at(-1), {
        self: [SELF_AUDIO, SELF_APP_DATA],
        peer: [PEER_AUDIO, PEER_APP_DATA]
    })
    assert.equal(internals.rtpSession?.getSsrc(), SELF_AUDIO)
    assert.equal(internals.appDataStream?.ssrc, SELF_APP_DATA)
    assert.equal(internals.videoRtpSession, null, 'an audio call opens no video stream')
    plane.stop()
})

test('a video call opens its video stream from the same section', async () => {
    const { plane, internals } = createPlane()

    await plane.apply({ mediaType: 'video', ssrcs: SSRCS })

    assert.equal(internals.videoRtpSession?.getSsrc(), SELF_VIDEO)
    plane.stop()
})

/** A rebuild restarts rollover counters and replay windows, which a peer reads as a rewind. */
test('the srtp contexts are rebuilt when the key epoch moves and only then', async () => {
    const { plane, internals } = createPlane()

    await plane.apply({ keys: keys(1) })
    const first = internals.srtpSession
    assert.ok(first, 'the first keys build the contexts')

    await plane.apply({ keys: keys(1, 9) })
    assert.equal(internals.srtpSession, first, 'the same epoch keeps the contexts')

    await plane.apply({ keys: keys(2) })
    assert.notEqual(internals.srtpSession, first, 'a new epoch rebuilds them')
    plane.stop()
})

test('relays are dialled while no leg is open', async () => {
    const { plane, relay } = createPlane()

    await plane.apply({ ssrcs: SSRCS, relays: RELAYS })

    assert.deepEqual(relay.dials, [1])
    plane.stop()
})

/** An open leg carries the call; relays listed later wait until it is lost. */
test('relays that arrive while a leg is open are not dialled', async () => {
    const { plane, relay } = createPlane()
    relay.connected = true

    await plane.apply({ relays: RELAYS })

    assert.deepEqual(relay.dials, [])
    plane.stop()
})

test('media starts once the call is accepted and a leg is up, whichever comes last', async () => {
    let active = 0
    const onActive = (): void => {
        active++
    }

    const legFirst = createPlane({ onActive })
    legFirst.relay.connected = true
    legFirst.internals.onRelayConnected()
    assert.equal(active, 0, 'a leg alone does not start media')
    await legFirst.plane.apply({ accepted: true })
    assert.equal(active, 1)
    assert.equal(legFirst.plane.isFlowing, true)
    legFirst.plane.stop()

    const acceptFirst = createPlane({ onActive })
    await acceptFirst.plane.apply({ relays: RELAYS, accepted: true })
    assert.equal(active, 1, 'an accept alone does not start media')
    acceptFirst.relay.connected = true
    acceptFirst.internals.onRelayConnected()
    assert.equal(active, 2)
    acceptFirst.internals.onRelayConnected()
    assert.equal(active, 2, 'a second leg does not start it again')
    acceptFirst.plane.stop()
})

test('capture is dropped before media flows and encoded after', async () => {
    const { plane, relay, encoded } = createPlane()
    relay.connected = true
    await plane.apply({ ssrcs: SSRCS, keys: keys(1) })

    plane.pushCapture(new Float32Array(960).fill(0.5))
    assert.equal(encoded.length, 0, 'nothing leaves an unaccepted call')

    await plane.apply({ accepted: true })
    plane.pushCapture(new Float32Array(960).fill(0.5))
    assert.equal(encoded.length, 1)
    assert.equal(encoded[0][0], 0.5)
    plane.stop()
})

test('capture is framed to the codec frame whatever length the host pushes', async () => {
    const { plane, relay, encoded } = createPlane()
    relay.connected = true
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), accepted: true })

    for (let i = 0; i < 12; i++) plane.pushCapture(new Float32Array(128).fill(i))

    assert.equal(encoded.length, 1, '1536 samples make one 960-sample frame and a remainder')
    assert.equal(encoded[0][0], 0)
    assert.equal(encoded[0][959], 7, 'the frame is the pushed samples in order')
    plane.stop()
})

test('a muted call keeps its stream alive with silence', async () => {
    const { plane, relay, encoded } = createPlane()
    relay.connected = true
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), accepted: true, muted: true })

    plane.pushCapture(new Float32Array(960).fill(0.5))

    assert.equal(encoded.length, 1, 'the frame still goes out')
    assert.ok(
        encoded[0].every((sample) => sample === 0),
        'as silence'
    )
    plane.stop()
})

test('a sample that is not a number is sent as silence without touching the host buffer', async () => {
    const { plane, relay, encoded } = createPlane()
    relay.connected = true
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), accepted: true })
    const capture = new Float32Array(960).fill(0.25)
    capture[3] = Number.NaN

    plane.pushCapture(capture)

    assert.equal(encoded[0][3], 0)
    assert.ok(Number.isNaN(capture[3]), 'the host keeps its own samples')
    plane.stop()
})

/** The caller's warmup: a leg up before the peer accepts carries silence. */
test('a leg that opens before the accept carries silence until media flows', async () => {
    const { plane, relay, encoded } = createPlane()
    relay.connected = true
    await plane.apply({ ssrcs: SSRCS, keys: keys(1) })
    relay.connected = false
    await plane.apply({ relays: RELAYS })
    assert.equal(encoded.length, 0)
    relay.connected = true
    await plane.apply({ relays: RELAYS })

    plane.pushCapture(new Float32Array(960).fill(0.5))

    assert.equal(encoded.length, 0, 'relays applied while a leg is open do not arm it')
    plane.stop()

    const warm = createPlane()
    await warm.plane.apply({ ssrcs: SSRCS, keys: keys(1) })
    warm.relay.configureRelays = async () => {
        warm.relay.connected = true
    }
    await warm.plane.apply({ relays: RELAYS })

    warm.plane.pushCapture(new Float32Array(960).fill(0.5))

    assert.equal(warm.encoded.length, 1)
    assert.ok(warm.encoded[0].every((sample) => sample === 0))
    warm.plane.stop()
})

/** A later plan update must not put the derived guess back. */
test('the first peer stream to arrive outranks the derived one', async () => {
    const { plane, relay, internals } = createPlane()
    await plane.apply({ ssrcs: SSRCS, keys: keys(1) })
    const resendsBefore = relay.resends

    internals.onRelayData(protectedRtp(UNKNOWN_PEER))

    assert.equal(relay.subscriptions.at(-1), UNKNOWN_PEER)
    assert.equal(relay.resends, resendsBefore + 1)

    await plane.apply({ ssrcs: SSRCS })
    assert.equal(relay.subscriptions.at(-1), UNKNOWN_PEER)
    plane.stop()
})

test('a packet that fails authentication does not move the subscription', async () => {
    const { plane, relay, internals } = createPlane()
    await plane.apply({ ssrcs: SSRCS, keys: keys(1) })

    internals.onRelayData(inboundRtp(UNKNOWN_PEER).encode())
    assert.equal(relay.subscriptions.at(-1), PEER_AUDIO)

    internals.onRelayData(protectedRtp(OTHER_PEER))
    assert.equal(relay.subscriptions.at(-1), OTHER_PEER, 'the first authentic stream still latches')
    plane.stop()
})

test('the video fec stream does not become the subscription', async () => {
    const { plane, relay, internals } = createPlane()
    await plane.apply({ ssrcs: SSRCS, keys: keys(1) })

    internals.onRelayData(protectedRtp(UNKNOWN_PEER, 103))
    assert.equal(relay.subscriptions.at(-1), PEER_AUDIO)

    internals.onRelayData(protectedRtp(OTHER_PEER))
    assert.equal(relay.subscriptions.at(-1), OTHER_PEER)
    plane.stop()
})

test('peer video arriving before its audio does not become the subscription', async () => {
    const { plane, relay, internals } = createPlane()
    await plane.apply({ mediaType: 'video', ssrcs: SSRCS, keys: keys(1) })

    internals.onRelayData(protectedRtp(PEER_VIDEO, 97))
    assert.equal(relay.subscriptions.at(-1), PEER_AUDIO)

    internals.onRelayData(protectedRtp(OTHER_PEER))
    assert.equal(relay.subscriptions.at(-1), OTHER_PEER, 'the audio that follows still latches')
    plane.stop()
})

test('updates apply in the order they were handed in, one at a time', async () => {
    const { plane, relay } = createPlane()
    relay.holdDials = true
    const order: string[] = []

    const first = plane.apply({ ssrcs: SSRCS, relays: RELAYS }).then(() => order.push('relays'))
    const second = plane.apply({ keys: keys(1) }).then(() => order.push('keys'))
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(order, [], 'the second waits for the dial of the first')

    relay.release()
    await Promise.all([first, second])
    assert.deepEqual(order, ['relays', 'keys'])
    plane.stop()
})

test('a failed update rejects for its caller and the next one still applies', async () => {
    const { plane, internals } = createPlane()

    await assert.rejects(
        plane.apply({
            keys: {
                epoch: 1,
                send: { masterKey: new Uint8Array(3), masterSalt: new Uint8Array(14) },
                recv: { masterKey: new Uint8Array(3), masterSalt: new Uint8Array(14) }
            }
        })
    )
    await plane.apply({ keys: keys(2) })

    assert.ok(internals.srtpSession)
    plane.stop()
})

test('a stopped plane plays nothing, reports nothing and returns its stats again', async () => {
    let lost = 0
    const { plane, relay } = createPlane({
        onRelayLost: () => {
            lost++
        }
    })
    relay.connected = true
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), accepted: true })

    const stats = plane.stop()
    const out = new Float32Array(64).fill(1)

    assert.equal(plane.pullPlayout(out), 0)
    assert.ok(out.every((sample) => sample === 0))
    ;(plane as unknown as { onRelayLost(reason: string): void }).onRelayLost('closed')
    assert.equal(lost, 0)
    assert.deepEqual(plane.stop(), stats)
    assert.equal(plane.isFlowing, false)
})

/** Each replay goes out to every open leg, so it must be one per change. */
test('an update that moves the ssrcs and the video paths together replays once', async () => {
    const { plane, relay } = createPlane()
    await plane.apply({ ssrcs: SSRCS })
    const before = relay.resends

    await plane.apply({
        ssrcs: { ...SSRCS, peerAudio: UNKNOWN_PEER },
        video: { send: true, receive: true }
    })

    assert.equal(relay.resends, before + 1)
    assert.deepEqual(relay.streamSets.at(-1), {
        self: [SELF_AUDIO, SELF_APP_DATA, SELF_VIDEO],
        peer: [PEER_AUDIO, PEER_APP_DATA, PEER_VIDEO]
    })
    plane.stop()
})

test('ssrcs published again unchanged replay nothing', async () => {
    const { plane, relay } = createPlane()
    await plane.apply({ ssrcs: SSRCS })
    const resends = relay.resends
    const streamSets = relay.streamSets.length
    const subscriptions = relay.subscriptions.length

    await plane.apply({ ssrcs: { ...SSRCS } })

    assert.equal(relay.resends, resends)
    assert.equal(relay.streamSets.length, streamSets)
    assert.equal(relay.subscriptions.length, subscriptions)
    plane.stop()
})

/** The registration names the peer stream as well, so moving it alone is a change. */
test('a new peer stream alone replays the registrations once', async () => {
    const { plane, relay } = createPlane()
    await plane.apply({ ssrcs: SSRCS })
    const resends = relay.resends
    const streamSets = relay.streamSets.length

    await plane.apply({ ssrcs: { ...SSRCS, peerAudio: UNKNOWN_PEER } })

    assert.equal(relay.resends, resends + 1)
    assert.equal(relay.subscriptions.at(-1), UNKNOWN_PEER)
    assert.equal(relay.streamSets.length, streamSets, 'the stream lists did not move')
    plane.stop()
})
