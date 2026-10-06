import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { SrtpSession } from '../../crypto/srtp.js'
import { createNoopLogger } from '../../logger.js'
import { RtpHeader, RtpPacket } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import {
    PayloadType,
    SRTP_RECV_AUTH_TAG_LEN,
    SRTP_SEND_AUTH_TAG_LEN,
    type SrtpKeyingMaterial
} from '../../types.js'
import type { WaCallMediaSsrcs } from '../plan.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

const SELF_AUDIO = 0x11111111
const PEER_AUDIO = 0x33333333

const SSRCS: WaCallMediaSsrcs = {
    selfAudio: SELF_AUDIO,
    selfVideo: 0x22222222,
    selfAppData: 0x66666666,
    selfStreams: [SELF_AUDIO],
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

interface Harness {
    readonly plane: WaCallMediaPlane
    /** Feeds one datagram to the plane as if a relay leg had received it. */
    readonly receive: (data: Uint8Array) => void
    /** The peer's sender, keyed apart from the plane so it encrypts what the plane decrypts. */
    readonly peer: SrtpSession
}

async function createHarness(): Promise<Harness> {
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled
    })
    await plane.apply({ ssrcs: SSRCS, keys: { epoch: 1, send: SELF_KEY, recv: PEER_KEY } })
    const internals = plane as unknown as { onRelayData: (data: Uint8Array) => void }
    return {
        plane,
        receive: (data) => internals.onRelayData(data),
        peer: new SrtpSession(
            nodeCrypto,
            PEER_KEY,
            SELF_KEY,
            SRTP_SEND_AUTH_TAG_LEN,
            SRTP_RECV_AUTH_TAG_LEN
        )
    }
}

function peerAudio(peer: SrtpSession, sequence: number): Uint8Array {
    const header = new RtpHeader(PayloadType.WhatsAppOpus, sequence, sequence * 960, PEER_AUDIO)
    return peer.protect(new RtpPacket(header, new Uint8Array([0xf8, 0xff, 0xfe, 0x01])))
}

function errorCounters(plane: WaCallMediaPlane) {
    const stats = plane.getStats()
    return {
        srtpErrors: stats.srtpErrors,
        srtpReplays: stats.srtpReplays,
        srtpAuthFailures: stats.srtpAuthFailures,
        srtpOtherErrors: stats.srtpOtherErrors
    }
}

/** The same packet arriving over a second relay leg is a replay, nothing worse. */
test('a packet delivered twice counts as a replay', async (t) => {
    const { plane, receive, peer } = await createHarness()
    t.after(() => plane.stop())

    const packet = peerAudio(peer, 10)
    receive(packet)
    receive(packet.slice())

    assert.deepEqual(errorCounters(plane), {
        srtpErrors: 1,
        srtpReplays: 1,
        srtpAuthFailures: 0,
        srtpOtherErrors: 0
    })
})

test('a packet whose auth tag does not verify counts as an auth failure', async (t) => {
    const { plane, receive, peer } = await createHarness()
    t.after(() => plane.stop())

    receive(peerAudio(peer, 10))
    const tampered = peerAudio(peer, 11)
    tampered[tampered.length - 1] ^= 0xff
    receive(tampered)

    assert.deepEqual(errorCounters(plane), {
        srtpErrors: 1,
        srtpReplays: 0,
        srtpAuthFailures: 1,
        srtpOtherErrors: 0
    })
})

test('a packet failing for any other reason counts apart from replays and auth failures', async (t) => {
    const { plane, receive } = await createHarness()
    t.after(() => plane.stop())

    receive(new Uint8Array([0x80, PayloadType.WhatsAppOpus, 0, 1, 0, 0, 0, 0, 0, 0]))

    assert.deepEqual(errorCounters(plane), {
        srtpErrors: 1,
        srtpReplays: 0,
        srtpAuthFailures: 0,
        srtpOtherErrors: 1
    })
})
