import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { SrtpSession } from '../../crypto/srtp.js'
import { createNoopLogger } from '../../logger.js'
import { RtpHeader, RtpPacket } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import type { RawUdpLegOptions } from '../../relay/WaSctpRelay.js'
import {
    PayloadType,
    SRTP_RECV_AUTH_TAG_LEN,
    SRTP_SEND_AUTH_TAG_LEN,
    type SrtpKeyingMaterial
} from '../../types.js'
import type { WaCallMediaRelay, WaCallMediaSsrcs } from '../plan.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

/** A raw UDP leg that records what it sends and lets the test deliver what the relay forwards. */
interface FakeLeg {
    readonly ip: string
    readonly sent: Uint8Array[]
    deliver(datagram: Uint8Array): void
}

const SELF_AUDIO = 0x11111111
const SELF_VIDEO = 0x22222222
const PEER_AUDIO = 0x33333333

const SSRCS: WaCallMediaSsrcs = {
    selfAudio: SELF_AUDIO,
    selfVideo: SELF_VIDEO,
    selfAppData: 0x66666666,
    selfStreams: [SELF_AUDIO, SELF_VIDEO],
    selfVideoStreams: [],
    peerAudio: PEER_AUDIO,
    peerStreams: [PEER_AUDIO],
    peerVideoStreams: [],
    peerAppData: []
}

const SELF_KEY: SrtpKeyingMaterial = {
    masterKey: new Uint8Array(16).fill(7),
    masterSalt: new Uint8Array(14).fill(8)
}
const PEER_KEY: SrtpKeyingMaterial = {
    masterKey: new Uint8Array(16).fill(9),
    masterSalt: new Uint8Array(14).fill(10)
}

function endpoint(ip: string, relayId: number): WaCallMediaRelay {
    return {
        ip,
        port: 3480,
        token: 'token',
        rawToken: new Uint8Array([1, 2, 3]),
        key: 'relay-key',
        relayId,
        authTokenId: String(relayId)
    }
}

const KEY_FRAME = new Uint8Array([0, 0, 0, 1, 0x65, 0x88, 0x84, 0x00])
const DELTA_FRAME = new Uint8Array([0, 0, 0, 1, 0x41, 0x9a, 0x02, 0x00])

const FAKE_CODEC = {
    getFrameSize: () => 960,
    encode: () => new Uint8Array([0xf8, 0xff, 0xfe]),
    resetSequence: () => {},
    decodeSequenced: () => {},
    setExpectedPacketLossPercent: () => {},
    getStats: () => ({ success: 0, errors: 0, plc: 0, fec: 0, late: 0 }),
    destroy: () => {}
}

/** One 20 ms audio packet of the peer, protected with the peer's own key. */
function peerAudio(peer: SrtpSession, sequence: number): Uint8Array {
    const header = new RtpHeader(PayloadType.WhatsAppOpus, sequence, sequence * 320, PEER_AUDIO)
    return peer.protect(new RtpPacket(header, new Uint8Array([0xf8, 0xff, 0xfe, 0x01])))
}

function mediaOn(leg: FakeLeg): number {
    return leg.sent.filter((datagram) => (datagram[0] & 0xc0) === 0x80).length
}

interface Call {
    readonly plane: WaCallMediaPlane
    /** Relay A's leg, first in dial order, then relay B's. */
    readonly a: FakeLeg
    readonly b: FakeLeg
    /** The peer's next audio packet, `ms` after the previous one. */
    nextPeerPacket(ms?: number): Uint8Array
    /** The leg one of our video frames leaves through. */
    sendFrameVia(): FakeLeg
    /** Moves the clock, and with `t` given to `startCall` the relay's timers too. */
    idle(ms: number): Promise<void>
}

/** A relay's answer to a ping: the same header with the 0x0802 type, transaction id echoed. */
function pongTo(datagram: Uint8Array): Uint8Array | null {
    if (((datagram[0] << 8) | datagram[1]) !== 0x0801) return null
    const pong = datagram.slice()
    pong[1] = 0x02
    return pong
}

/**
 * A video call over two relays, A and B, both answering pings, with media flowing and nothing
 * heard from the peer. With `t`, the relay's intervals run on the mock clock `idle` moves.
 */
async function startCall(t?: TestContext): Promise<Call> {
    t?.mock.timers.enable({ apis: ['setInterval'] })
    let now = 1_000
    const legs: FakeLeg[] = []
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        now: () => now,
        createRawUdpLeg: (options: RawUdpLegOptions) => {
            let open = false
            legs.push({
                ip: options.ip,
                sent: [],
                deliver: (datagram) => options.onMessage(datagram)
            })
            const leg = legs[legs.length - 1]
            return {
                get isOpen() {
                    return open
                },
                open: () => {
                    queueMicrotask(() => {
                        open = true
                        options.onOpen()
                    })
                },
                send: (data) => {
                    if (!open) return false
                    leg.sent.push(data.slice())
                    const pong = pongTo(data)
                    if (pong) queueMicrotask(() => options.onMessage(pong))
                    return true
                },
                close: () => {
                    open = false
                }
            }
        }
    })
    ;(plane as unknown as { codec: unknown }).codec = FAKE_CODEC
    await plane.apply({
        mediaType: 'video',
        ssrcs: SSRCS,
        keys: { epoch: 1, send: SELF_KEY, recv: PEER_KEY },
        relays: { endpoints: [endpoint('10.0.3.1', 3), endpoint('10.0.8.1', 8)] },
        accepted: true
    })
    assert.equal(plane.isFlowing, true)

    const peer = new SrtpSession(
        nodeCrypto,
        PEER_KEY,
        SELF_KEY,
        SRTP_SEND_AUTH_TAG_LEN,
        SRTP_RECV_AUTH_TAG_LEN
    )
    let sequence = 0
    let frames = 0
    const [a, b] = legs
    return {
        plane,
        a,
        b,
        nextPeerPacket: (ms = 20) => {
            now += ms
            return peerAudio(peer, ++sequence)
        },
        sendFrameVia: () => {
            const before = legs.map(mediaOn)
            const frame = frames === 0 ? KEY_FRAME : DELTA_FRAME
            assert.ok(plane.sendVideoFrame(frame, frames++ * 33_333) > 0, 'the frame went out')
            const carrying = legs.filter((leg, i) => mediaOn(leg) > before[i])
            assert.equal(carrying.length, 1, 'one leg carries the frame')
            return carrying[0]
        },
        idle: async (ms) => {
            for (let elapsed = 0; elapsed < ms; elapsed += 100) {
                now += 100
                t?.mock.timers.tick(100)
                await new Promise<void>((resolve) => setImmediate(resolve))
            }
        }
    }
}

/**
 * M-d: the peer's leg to relay A died and it moved to relay B. Relay A is alive and keeps
 * taking our media, but forwards none of the peer's: our media has to follow the peer.
 */
test('when the peer moves to another relay, our media follows it', async (t) => {
    const call = await startCall()
    t.after(() => call.plane.stop())

    for (let i = 0; i < 10; i++) call.a.deliver(call.nextPeerPacket())
    assert.equal(call.sendFrameVia(), call.a, 'we send where the peer sends')

    for (let i = 0; i < 25; i++) call.b.deliver(call.nextPeerPacket())

    assert.equal(call.sendFrameVia(), call.b, 'half a second later we send where the peer moved')
})

/** Before any of the peer's media, nothing holds our pick: the first packet decides at once. */
test('the first authenticated packet of the peer elects its leg at once', async (t) => {
    const call = await startCall()
    t.after(() => call.plane.stop())
    assert.equal(call.sendFrameVia(), call.a, 'the first leg in dial order carries media first')

    call.b.deliver(call.nextPeerPacket())

    assert.equal(call.sendFrameVia(), call.b)
})

test('a packet that fails SRTP does not move our media', async (t) => {
    const call = await startCall()
    t.after(() => call.plane.stop())

    const forged = call.nextPeerPacket()
    forged[forged.length - 1] ^= 0xff
    call.b.deliver(forged)

    assert.equal(call.sendFrameVia(), call.a)
})

/**
 * An older peer still sends every packet through every leg, and whichever copy lands first
 * is the one that authenticates. Both legs keep hearing the peer, so neither is abandoned.
 */
test('a peer that still sends through every leg does not make our media hop', async (t) => {
    const call = await startCall()
    t.after(() => call.plane.stop())

    const used = new Set<FakeLeg>()
    for (let i = 1; i <= 100; i++) {
        const packet = call.nextPeerPacket()
        const order = i % 2 === 1 ? [call.a, call.b] : [call.b, call.a]
        for (const leg of order) leg.deliver(packet.slice())
        if (i % 10 === 0) used.add(call.sendFrameVia())
    }

    assert.deepEqual([...used], [call.a])
})

/**
 * Live, against WhatsApp Web: our leg stopped getting the peer's media while its relay kept
 * answering pings. The official client does not follow our media elsewhere, so it stays put,
 * and the peer's media that comes back on that leg reaches the plane.
 */
test('a leg that stops hearing the peer keeps our media and delivers the peer when it returns', async (t) => {
    const call = await startCall(t)
    t.after(() => call.plane.stop())
    for (let i = 0; i < 10; i++) call.a.deliver(call.nextPeerPacket())
    assert.equal(call.sendFrameVia(), call.a)
    const heardBefore = call.plane.getStats().audioReceived

    for (let second = 0; second < 20; second++) {
        for (let i = 0; i < 50; i++) call.nextPeerPacket(0)
        await call.idle(1_000)
        assert.equal(
            call.sendFrameVia(),
            call.a,
            `still on the leg ${second + 1} s into the silence`
        )
    }

    for (let i = 0; i < 10; i++) call.a.deliver(call.nextPeerPacket())

    assert.equal(call.plane.getStats().audioReceived, heardBefore + 10)
    assert.equal(call.sendFrameVia(), call.a)
})
