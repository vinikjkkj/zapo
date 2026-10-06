import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { createNoopLogger } from '../../logger.js'
import { nodeCrypto } from '../../node/crypto.js'
import type { RawUdpLegOptions } from '../../relay/WaSctpRelay.js'
import type { SrtpKeyingMaterial } from '../../types.js'
import type { WaCallMediaRelay, WaCallMediaSsrcs } from '../plan.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

interface FakeLeg {
    readonly ip: string
    readonly sent: Uint8Array[]
    fail(reason: string): void
}

const SELF_AUDIO = 0x11111111
const SELF_VIDEO = 0x22222222
const SELF_APP_DATA = 0x66666666
const PEER_AUDIO = 0x33333333

const SSRCS: WaCallMediaSsrcs = {
    selfAudio: SELF_AUDIO,
    selfVideo: SELF_VIDEO,
    selfAppData: SELF_APP_DATA,
    selfStreams: [SELF_AUDIO, SELF_VIDEO, SELF_APP_DATA],
    selfVideoStreams: [],
    peerAudio: PEER_AUDIO,
    peerStreams: [PEER_AUDIO],
    peerVideoStreams: [],
    peerAppData: []
}

const SEND_KEY: SrtpKeyingMaterial = {
    masterKey: new Uint8Array(16).fill(7),
    masterSalt: new Uint8Array(14).fill(8)
}
const RECV_KEY: SrtpKeyingMaterial = {
    masterKey: new Uint8Array(16).fill(9),
    masterSalt: new Uint8Array(14).fill(10)
}

function endpoint(ip: string, relayId: number): WaCallMediaRelay {
    return {
        ip,
        port: 3478,
        token: 'token',
        rawToken: new Uint8Array([1, 2, 3]),
        key: 'relay-key',
        relayId,
        authTokenId: String(relayId)
    }
}

/** Two relays, each on an IPv4 and an IPv6 leg. */
const ENDPOINTS = [
    endpoint('10.0.3.1', 3),
    endpoint('2001:db8::3', 3),
    endpoint('10.0.8.1', 8),
    endpoint('2001:db8::8', 8)
]
const RELAY_B_IPS = ['10.0.8.1', '2001:db8::8']

const KEY_FRAME = new Uint8Array([0, 0, 0, 1, 0x65, 0x88, 0x84, 0x00])
const DELTA_FRAME = new Uint8Array([0, 0, 0, 1, 0x41, 0x9a, 0x02, 0x00])
const FRAME_SAMPLES = 960

/** A codec that encodes any frame into the same few bytes. */
const FAKE_CODEC = {
    getFrameSize: () => FRAME_SAMPLES,
    encode: () => new Uint8Array([0xf8, 0xff, 0xfe]),
    resetSequence: () => {},
    decodeSequenced: () => {},
    setExpectedPacketLossPercent: () => {},
    getStats: () => ({ success: 0, errors: 0, plc: 0, fec: 0, late: 0 }),
    destroy: () => {}
}

/** RTP and RTCP carry version 2 in the top two bits; STUN carries zeros there. */
function mediaOn(leg: FakeLeg): number {
    return leg.sent.filter((datagram) => (datagram[0] & 0xc0) === 0x80).length
}

/** A video call over four in-memory raw UDP legs that record what they send. */
async function startVideoCall(legs: FakeLeg[]): Promise<WaCallMediaPlane> {
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        createRawUdpLeg: (options: RawUdpLegOptions) => {
            let open = false
            const leg: FakeLeg = {
                ip: options.ip,
                sent: [],
                fail: (reason) => {
                    open = false
                    options.onFailure(reason)
                }
            }
            legs.push(leg)
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
        keys: { epoch: 1, send: SEND_KEY, recv: RECV_KEY },
        relays: { endpoints: ENDPOINTS },
        accepted: true
    })
    assert.equal(plane.isFlowing, true, 'media is flowing')
    return plane
}

/**
 * The media datagrams a leg took, by kind: RTCP by its packet type (200-206, in the clear
 * under SRTCP), RTP by the SSRC its header carries in the clear.
 */
function mediaKinds(datagrams: readonly Uint8Array[]): Record<string, number> {
    const kinds: Record<string, number> = { audio: 0, video: 0, appData: 0, rtcp: 0, other: 0 }
    for (const datagram of datagrams) {
        if ((datagram[0] & 0xc0) !== 0x80) continue
        if (datagram[1] >= 200 && datagram[1] <= 206) {
            kinds.rtcp++
            continue
        }
        const ssrc = new DataView(datagram.buffer, datagram.byteOffset).getUint32(8)
        if (ssrc === SELF_AUDIO) kinds.audio++
        else if (ssrc === SELF_VIDEO) kinds.video++
        else if (ssrc === SELF_APP_DATA) kinds.appData++
        else kinds.other++
    }
    return kinds
}

/** Media datagrams each leg took while `run` ran. */
function mediaAdded(legs: readonly FakeLeg[], run: () => void): number[] {
    const before = legs.map(mediaOn)
    run()
    return legs.map((leg, i) => mediaOn(leg) - before[i])
}

test('audio, video and app data all leave through the same single relay leg', async (t) => {
    const legs: FakeLeg[] = []
    const plane = await startVideoCall(legs)
    t.after(() => plane.stop())

    const before = legs.map((leg) => leg.sent.length)
    const added = mediaAdded(legs, () => {
        plane.pushCapture(new Float32Array(FRAME_SAMPLES * 3).fill(0.1))
        assert.ok(plane.sendVideoFrame(KEY_FRAME, 0) > 0, 'the key frame went out')
        assert.equal(plane.sendReaction('\u{1F44D}'), true, 'the reaction went out')
    })

    const carrying = added.findIndex((n) => n > 0)
    assert.equal(added.filter((n) => n > 0).length, 1, 'one leg carried all of it')
    const kinds = mediaKinds(legs[carrying].sent.slice(before[carrying]))
    assert.equal(kinds.audio, 3, 'three audio packets, one per captured frame')
    assert.equal(kinds.video, 1, 'the key frame fits one packet')
    assert.equal(kinds.appData, 1, 'the reaction went out once')
    assert.equal(kinds.other, 0, 'nothing else rode RTP')
})

test('once the leg carrying media dies, the next frame leaves through one leg of the other relay', async (t) => {
    const legs: FakeLeg[] = []
    const plane = await startVideoCall(legs)
    t.after(() => plane.stop())

    const first = mediaAdded(legs, () => plane.sendVideoFrame(KEY_FRAME, 0))
    const lost = legs[first.findIndex((n) => n > 0)]
    lost.fail('raw_udp_no_return_path')

    const next = mediaAdded(legs, () => plane.sendVideoFrame(DELTA_FRAME, 33_333))

    const carrying = legs.filter((_leg, i) => next[i] > 0)
    assert.equal(carrying.length, 1, 'one leg carries the media again')
    assert.notEqual(carrying[0], lost)
    assert.ok(RELAY_B_IPS.includes(carrying[0].ip), `${carrying[0].ip} is a leg of the other relay`)
})
