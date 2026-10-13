import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { encodeReactionPayload } from '../../app-data/protocol.js'
import { bytesToHex, readUInt32BE } from '../../bytes.js'
import { SrtcpContext, type SrtcpSession, SrtpSession } from '../../crypto/srtp.js'
import { createNoopLogger, type Logger } from '../../logger.js'
import type { AudioReceiveSet, AudioStreamDecoder } from '../../media/audio-receive-set.js'
import { MLowCodec, writeMlowRed } from '../../media/mlow-codec.js'
import { buildSenderReportWithSdes } from '../../media/rtcp.js'
import { RtpHeader, RtpPacket } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import {
    type InboundVideoFrame,
    type InboundVideoRtpPacket,
    SRTP_RECV_AUTH_TAG_LEN,
    SRTP_SEND_AUTH_TAG_LEN,
    type SrtpKeyingMaterial
} from '../../types.js'
import {
    WA_VIDEO_QUALITY,
    type WaCallMediaGroup,
    type WaCallMediaKeys,
    type WaCallMediaRelays,
    type WaCallMediaSender,
    type WaCallMediaSsrcs,
    type WaCallMediaStreamLayer
} from '../plan.js'
import { WaCallMediaPlane, type WaCallMediaPlaneOptions } from '../WaCallMediaPlane.js'

const SELF_AUDIO = 0x11111111
const SELF_APP_DATA = 0x66666666
const A_AUDIO = 0x0a0a0a01
const A_FEC = 0x0a0a0a02
const B_AUDIO = 0x0b0b0b01
const B_FEC = 0x0b0b0b02
const NOBODY = 0x0c0c0c01

const FRAME = 960
const MLOW_RED_PAYLOAD_TYPE = 121
const PAYLOAD = Uint8Array.of(0x58, 0x01, 0x02, 0x03)

const SSRCS: WaCallMediaSsrcs = {
    selfAudio: SELF_AUDIO,
    selfVideo: 0x22222222,
    selfAppData: SELF_APP_DATA,
    selfStreams: [SELF_AUDIO, SELF_APP_DATA],
    selfVideoStreams: [0x22222222],
    peerAudio: 0,
    peerStreams: [],
    peerVideoStreams: [],
    peerAppData: []
}

const LAYERS: readonly WaCallMediaStreamLayer[] = [
    { layer: 0, ssrcs: [SELF_AUDIO, 0x11110001, 0x11110004] },
    { layer: 5, ssrcs: [SELF_APP_DATA] }
]

function material(fill: number): SrtpKeyingMaterial {
    return { masterKey: new Uint8Array(16).fill(fill), masterSalt: new Uint8Array(14).fill(fill) }
}

function keys(epoch: number): WaCallMediaKeys {
    return { epoch, send: material(epoch), recv: material(epoch) }
}

const SENDER_A: WaCallMediaSender = {
    id: 'a',
    audio: A_AUDIO,
    streams: [A_AUDIO, A_FEC],
    recv: material(0xa1)
}
const SENDER_B: WaCallMediaSender = {
    id: 'b',
    audio: B_AUDIO,
    streams: [B_AUDIO, B_FEC],
    recv: material(0xb2)
}

function group(...senders: WaCallMediaSender[]): WaCallMediaGroup {
    return { senders }
}

function relays(generation: number, ip = '10.0.0.1'): WaCallMediaRelays {
    return {
        endpoints: [
            {
                ip,
                port: 3478,
                token: 'token',
                rawToken: new Uint8Array([1, 2, 3]),
                key: 'relay-key',
                relayId: generation,
                name: `relay-${generation}`,
                transport: generation > 0 ? 'raw-udp' : undefined
            }
        ],
        generation
    }
}

interface Dial {
    readonly generation: number | undefined
    readonly transports: (string | undefined)[]
}

/** A relay that records what the plane asks of it; it is open while `connected` is set. */
class FakeRelay {
    connected = false
    readonly dials: Dial[] = []
    readonly sent: Uint8Array[] = []
    readonly layers: (readonly WaCallMediaStreamLayer[] | null)[] = []
    readonly subscriptions: number[] = []
    readonly rxSubscriptions: (Uint8Array | null)[] = []

    setSsrc(): void {}
    setSubscriptionSsrc(ssrc: number): void {
        this.subscriptions.push(ssrc)
    }
    setStreamSsrcs(): void {}
    setParticipantIds(): void {}
    setSelfLayers(layers: readonly WaCallMediaStreamLayer[] | null): void {
        this.layers.push(layers)
    }
    setRxSubscriptions(bytes: Uint8Array | null): void {
        this.rxSubscriptions.push(bytes)
    }
    resendSubscriptions(): void {}
    async configureRelays(
        configs: readonly { transport?: string }[],
        options: { generation?: number } = {}
    ): Promise<void> {
        this.dials.push({
            generation: options.generation,
            transports: configs.map((config) => config.transport)
        })
    }
    hasConnection(): boolean {
        return this.connected
    }
    getConnectedCount(): number {
        return this.connected ? 1 : 0
    }
    setMediaFlowing(): void {}
    notePeerMedia(): void {}
    sendMedia(data: ArrayBuffer): boolean {
        this.sent.push(new Uint8Array(data))
        return this.connected
    }
    cleanup(): void {}
}

/** What one stand-in decoder was handed. */
interface Handled {
    readonly seqs: number[]
    readonly streams: number[]
}

interface PlaneInternals {
    sctpRelay: FakeRelay
    codec: unknown
    srtpSession: SrtpSession | null
    srtcpRecvSession: SrtcpSession | null
    groupAudio: AudioReceiveSet | null
    relays: WaCallMediaRelays | null
    createSenderDecoder: () => AudioStreamDecoder | Promise<AudioStreamDecoder>
    sendAudioReceiverEstimate: (ssrc: number) => void
    onRelayData: (data: Uint8Array, connectionId?: string) => void
    peerAppDataSsrcs: Set<number>
    inboundVideoStreams: Map<number, unknown>
    maxVideoStreams: number
}

interface Harness {
    readonly plane: WaCallMediaPlane
    readonly relay: FakeRelay
    readonly internals: PlaneInternals
    /** One record per sender decoder, in creation order. */
    readonly decoders: Handled[]
}

/** A plane on a recording relay whose group decoders are stand-ins answering at once. */
function createPlane(
    events: Partial<WaCallMediaPlaneOptions> = {},
    logger: Logger = createNoopLogger()
): Harness {
    const plane = new WaCallMediaPlane({
        logger,
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        ...events
    })
    const internals = plane as unknown as PlaneInternals
    const relay = new FakeRelay()
    internals.sctpRelay = relay
    internals.codec = {
        getFrameSize: () => FRAME,
        encodeInto: () => 0,
        resetSequence: () => {},
        decodeSequenced: () => 'decoded',
        setExpectedPacketLossPercent: () => {},
        getStats: () => ({ success: 0, errors: 0, plc: 0, fec: 0, late: 0 }),
        destroy: () => {}
    }
    const decoders: Handled[] = []
    internals.createSenderDecoder = () => {
        const handled: Handled = { seqs: [], streams: [] }
        decoders.push(handled)
        return {
            decodeSequenced: (seq, _packet, onFrame, _timestamp, stream = 0) => {
                handled.seqs.push(seq)
                handled.streams.push(stream)
                onFrame(new Float32Array(FRAME).fill(0.1))
                return 'decoded'
            },
            getStats: () => ({ success: handled.seqs.length, errors: 0, plc: 0, late: 0 }),
            resetSequence: () => {},
            destroy: () => {}
        }
    }
    return { plane, relay, internals, decoders }
}

/** One RTP packet as a sender keyed with `keying` puts it on the wire. */
function protectedRtp(
    keying: SrtpKeyingMaterial,
    ssrc: number,
    seq: number,
    payloadType = 120,
    payload: Uint8Array = PAYLOAD
): Uint8Array {
    const peer = new SrtpSession(
        nodeCrypto,
        keying,
        keying,
        SRTP_SEND_AUTH_TAG_LEN,
        SRTP_RECV_AUTH_TAG_LEN
    )
    return peer.protect(new RtpPacket(new RtpHeader(payloadType, seq, seq * FRAME, ssrc), payload))
}

function plainRtp(
    ssrc: number,
    seq: number,
    timestamp: number,
    payload: Uint8Array,
    payloadType = MLOW_RED_PAYLOAD_TYPE
): Uint8Array {
    return new RtpPacket(new RtpHeader(payloadType, seq, timestamp, ssrc), payload).encode()
}

function senderStats(plane: WaCallMediaPlane): Record<string, { recv: number; auth: number }> {
    const rows: Record<string, { recv: number; auth: number }> = {}
    for (const sender of plane.getStats().senders ?? []) {
        rows[sender.id] = { recv: sender.recv, auth: sender.authFailures }
    }
    return rows
}

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

    const blocks = internals.groupAudio!.receptionReports(Date.now())
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

test('every stream of a sender feeds its decoder, PT 121 numbered apart', async (t) => {
    const { plane, internals, decoders } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A) })

    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 1, MLOW_RED_PAYLOAD_TYPE))
    internals.onRelayData(protectedRtp(SENDER_A.recv, A_FEC, 9))

    assert.deepEqual(decoders[0].seqs, [1, 9])
    assert.deepEqual(decoders[0].streams, [1, 0])
})

test('the playout mixes the senders and each sender is heard on its own', async (t) => {
    const heard: string[] = []
    const { plane, relay, internals } = createPlane({
        onSenderAudio: (senderId) => heard.push(senderId)
    })
    t.after(() => plane.stop())
    relay.connected = true
    await plane.apply({
        ssrcs: SSRCS,
        keys: keys(1),
        group: group(SENDER_A, SENDER_B),
        accepted: true
    })

    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 1))
    internals.onRelayData(protectedRtp(SENDER_B.recv, B_AUDIO, 1))
    const out = new Float32Array(FRAME)

    assert.equal(plane.pullPlayout(out), FRAME)
    assert.ok(Math.abs(out[0] - 0.2) < 1e-6, 'two senders at 0.1 each')
    assert.deepEqual(heard, ['a', 'b'])
    assert.equal(plane.getStats().playout.buffered, 0)
})

/**
 * A flowing group plane with real sender decoders, loaded before it returns, and SRTP that
 * passes packets through; each sender's decoded frames are kept, copied.
 */
async function createDecodingPlane(
    t: { after(fn: () => void): void },
    senders: WaCallMediaSender[]
): Promise<{
    plane: WaCallMediaPlane
    internals: PlaneInternals
    perSender: Record<string, Float32Array[]>
}> {
    const perSender: Record<string, Float32Array[]> = {}
    for (const sender of senders) perSender[sender.id] = []
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        onSenderAudio: (senderId, pcm) => perSender[senderId].push(pcm.slice())
    })
    t.after(() => plane.stop())
    const internals = plane as unknown as PlaneInternals
    const relay = new FakeRelay()
    relay.connected = true
    internals.sctpRelay = relay
    const loading: Promise<unknown>[] = []
    const realDecoder = internals.createSenderDecoder.bind(plane)
    internals.createSenderDecoder = () => {
        const decoder = realDecoder()
        loading.push(decoder as Promise<unknown>)
        return decoder
    }
    await plane.start()
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: { senders }, accepted: true })
    await Promise.all(loading)
    await new Promise((resolve) => setImmediate(resolve))
    internals.srtpSession = {
        unprotect: (data: Uint8Array) => RtpPacket.decode(data)
    } as unknown as SrtpSession
    return { plane, internals, perSender }
}

/**
 * Group audio arrives on PT 121 as in-band RED, the same container as a 1:1 call: each
 * sender's decoder plays the copy a loss left a hole for, so its played time matches the
 * RTP clock, and the mix is the two senders summed.
 */
test('two senders on in-band RED each recover their own loss and mix into one playout', async (t) => {
    const { plane, internals, perSender } = await createDecodingPlane(t, [SENDER_A, SENDER_B])

    const packets = 8
    const streams = [
        { id: 'a', ssrc: A_AUDIO, tone: 440, lost: 3, firstSeq: 100, firstTs: 48_000 },
        { id: 'b', ssrc: B_AUDIO, tone: 660, lost: 5, firstSeq: 7, firstTs: 1_920 }
    ]
    const encoded: Uint8Array[][] = []
    for (const stream of streams) {
        const encoder = await MLowCodec.create({ red: true })
        t.after(() => encoder.destroy())
        const target = new Uint8Array(8_192)
        const wire: Uint8Array[] = []
        let copy: Uint8Array | null = null
        for (let index = 0; index < packets; index++) {
            const frame = new Float32Array(FRAME).map(
                (_, sample) =>
                    Math.sin((2 * Math.PI * stream.tone * (index * FRAME + sample)) / 16_000) * 0.2
            )
            const timestamp = stream.firstTs + index * FRAME
            const primary = encoder.encode(frame)
            const length = copy
                ? writeMlowRed(target, primary, timestamp, [copy], [timestamp - FRAME])
                : writeMlowRed(target, primary, timestamp, [], [])
            wire.push(
                plainRtp(stream.ssrc, stream.firstSeq + index, timestamp, target.slice(0, length))
            )
            copy = encoder.lastSecondary
        }
        encoded.push(wire)
    }

    for (let index = 0; index < packets; index++) {
        streams.forEach((stream, which) => {
            if (index !== stream.lost) internals.onRelayData(encoded[which][index])
        })
    }

    for (const stream of streams) {
        const played = perSender[stream.id].reduce((sum, pcm) => sum + pcm.length, 0)
        assert.equal(played, packets * FRAME, `sender ${stream.id} plays its whole timeline`)
    }
    const rows = plane.getStats().senders ?? []
    assert.deepEqual(
        rows.map((row) => [row.id, row.plc, row.late, row.decodeErrors]),
        [
            ['a', 0, 0, 0],
            ['b', 0, 0, 0]
        ],
        'the copies filled the holes, nothing concealed'
    )

    const out = new Float32Array(packets * FRAME)
    assert.equal(plane.pullPlayout(out), packets * FRAME)
    const a = concat(perSender.a)
    const b = concat(perSender.b)
    let worst = 0
    for (let i = 0; i < out.length; i++) {
        const expected = Math.max(-1, Math.min(1, a[i] + b[i]))
        worst = Math.max(worst, Math.abs(out[i] - expected))
    }
    assert.ok(worst < 1e-6, `the mix is the sum of the senders, off by ${worst}`)
})

function concat(chunks: readonly Float32Array[]): Float32Array {
    const out = new Float32Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
    let offset = 0
    for (const chunk of chunks) {
        out.set(chunk, offset)
        offset += chunk.length
    }
    return out
}

test('one audio REMB stream is followed, the first sender heard until it leaves', async (t) => {
    const { plane, internals } = createPlane()
    t.after(() => plane.stop())
    const named: number[] = []
    internals.sendAudioReceiverEstimate = (ssrc) => named.push(ssrc)
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A, SENDER_B) })

    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 1))
    internals.onRelayData(protectedRtp(SENDER_B.recv, B_AUDIO, 1))
    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 2))
    await plane.apply({ group: group(SENDER_B) })
    internals.onRelayData(protectedRtp(SENDER_B.recv, B_AUDIO, 2))

    assert.deepEqual(named, [A_AUDIO, A_AUDIO, B_AUDIO])
})

/** RC above one drops the packet trailer, which only a single block carries. */
test('our audio sender report carries a block per sender heard', async (t) => {
    const { plane, relay, internals } = createPlane()
    t.after(() => plane.stop())
    relay.connected = true
    await plane.apply({
        ssrcs: SSRCS,
        keys: keys(1),
        group: group(SENDER_A, SENDER_B),
        accepted: true
    })
    const passThrough = internals as unknown as {
        srtpSession: unknown
        srtcpContext: unknown
        audioReportSchedule: unknown
        sendOpusFrame: (frame: Uint8Array, ts: number, marker: boolean, captureMs: number) => void
    }
    passThrough.srtpSession = {
        protect: (packet: RtpPacket) => packet.encode(),
        unprotect: (data: Uint8Array) => RtpPacket.decode(data)
    }
    passThrough.srtcpContext = { protect: (rtcp: Uint8Array) => rtcp }
    passThrough.audioReportSchedule = { shouldReport: () => true }
    const reports = (): Uint8Array[] => relay.sent.filter((packet) => packet[1] === 200)

    internals.onRelayData(plainRtp(A_AUDIO, 1, FRAME, PAYLOAD))
    passThrough.sendOpusFrame(PAYLOAD, FRAME, false, 0)
    internals.onRelayData(plainRtp(B_AUDIO, 1, FRAME, PAYLOAD))
    passThrough.sendOpusFrame(PAYLOAD, 2 * FRAME, false, 0)

    const [one, two] = reports()
    assert.equal(one[0] & 0x1f, 1)
    assert.equal(one.length, 28 + 32 + 16 + 32, 'one block keeps the trailer')
    assert.equal(two[0] & 0x1f, 2)
    assert.equal(two.length, 28 + 2 * 32 + 32, 'two blocks and no trailer')
    assert.deepEqual([readUInt32BE(two, 28), readUInt32BE(two, 60)], [A_AUDIO, B_AUDIO])
})

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

test('the stats carry the senders on a group call only', async (t) => {
    const oneToOne = createPlane()
    t.after(() => oneToOne.plane.stop())
    await oneToOne.plane.apply({ ssrcs: SSRCS, keys: keys(1) })
    const groupCall = createPlane()
    t.after(() => groupCall.plane.stop())
    await groupCall.plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A) })

    assert.equal(oneToOne.plane.getStats().senders, undefined)
    assert.deepEqual(groupCall.plane.getStats().senders, [
        {
            id: 'a',
            recv: 0,
            decoded: 0,
            decodeErrors: 0,
            late: 0,
            plc: 0,
            lossPercent: 0,
            authFailures: 0,
            decoderPending: 0,
            pt122Received: 0,
            pt122Decoded: 0,
            pt122Rejected: 0
        }
    ])
})

/** A relay frame around the media: marker 0x09, `4 + n * 2` header bytes, then the packet. */
function framed(rtp: Uint8Array, lengthByte: number): Uint8Array {
    const headerLength = 4 + (lengthByte & 0x7f) * 2
    const out = new Uint8Array(headerLength + rtp.length)
    out[0] = 0x09
    out[1] = lengthByte
    out[3] = 1
    out.set(rtp, headerLength)
    return out
}

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

    const [block] = internals.groupAudio!.receptionReports(Date.now())
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

/** `count` consecutive 60 ms MLow frames of one tone, as one sender's encoder emits them. */
async function encodeFrames(
    t: { after(fn: () => void): void },
    count: number
): Promise<Uint8Array[]> {
    const encoder = await MLowCodec.create()
    t.after(() => encoder.destroy())
    const frames: Uint8Array[] = []
    for (let index = 0; index < count; index++) {
        const pcm = new Float32Array(FRAME).map(
            (_, sample) => Math.sin((2 * Math.PI * 440 * (index * FRAME + sample)) / 16_000) * 0.2
        )
        frames.push(encoder.encode(pcm))
    }
    return frames
}

function playedSamples(frames: readonly Float32Array[]): number {
    return frames.reduce((sum, pcm) => sum + pcm.length, 0)
}

/** The sender's numbering runs on from PT 120 into PT 122, which the relay leaves unframed. */
test('PT 122 continues a sender PT 120 stream on its decoder with no gap', async (t) => {
    const { plane, internals, perSender } = await createDecodingPlane(t, [SENDER_A])
    const frames = await encodeFrames(t, 8)

    frames.forEach((frame, index) => {
        const seq = 1085 + index
        const timestamp = 96_000 + index * FRAME
        internals.onRelayData(
            index < 4
                ? framed(plainRtp(A_AUDIO, seq, timestamp, frame, 120), 0x02)
                : plainRtp(A_AUDIO, seq, timestamp, frame, 122)
        )
    })

    assert.equal(playedSamples(perSender.a), 8 * FRAME)
    const [row] = plane.getStats().senders ?? []
    assert.deepEqual(
        [row.plc, row.late, row.decodeErrors, row.decoded],
        [0, 0, 0, 8],
        'one timeline across the switch'
    )
    assert.deepEqual([row.pt122Received, row.pt122Decoded, row.pt122Rejected], [4, 4, 0])
})

test('a PT 122 payload the decoder rejects is counted, plays nothing, and the stream goes on', async (t) => {
    const { plane, internals, perSender } = await createDecodingPlane(t, [SENDER_A])
    const frames = await encodeFrames(t, 6)
    const invalid = Uint8Array.of(0xff, 0xff, 0xff, 0xff)

    frames.forEach((frame, index) => {
        const payloadType = index < 3 ? 120 : 122
        internals.onRelayData(
            plainRtp(A_AUDIO, index + 1, index * FRAME, index === 3 ? invalid : frame, payloadType)
        )
    })

    assert.equal(
        playedSamples(perSender.a),
        6 * FRAME,
        'the rejected slot is concealed in place, never decoded from the payload'
    )
    const [row] = plane.getStats().senders ?? []
    assert.deepEqual([row.pt122Received, row.pt122Decoded, row.pt122Rejected], [3, 2, 1])
    assert.equal(row.late, 0)
    assert.equal(row.decodeErrors, 1)
})

test('a 1:1 call decodes PT 122 on the peer stream PT 120 numbers', async (t) => {
    const { plane, relay, internals } = createPlane()
    t.after(() => plane.stop())
    const streams: number[] = []
    ;(internals.codec as { decodeSequenced: unknown }).decodeSequenced = (
        _seq: number,
        _packet: Uint8Array,
        _onFrame: unknown,
        _timestamp: number,
        stream: number
    ) => {
        streams.push(stream)
        return 'decoded'
    }
    await plane.apply({ ssrcs: SSRCS, keys: keys(1) })

    internals.onRelayData(protectedRtp(keys(1).recv, B_AUDIO, 1, 122))

    assert.deepEqual(streams, [0])
    assert.equal(relay.subscriptions.at(-1), B_AUDIO)
    assert.equal(plane.getStats().audioReceived, 1)
})

test('PT 122 is described in the log: first bytes, sizes and timestamp steps', async (t) => {
    const logged: Record<string, unknown>[] = []
    const logger: Logger = {
        ...createNoopLogger(),
        debug: (message: string, context?: Record<string, unknown>) => {
            if (message === 'pt 122 audio received' && context) logged.push(context)
        },
        child: () => logger
    }
    const { plane, internals } = createPlane({}, logger)
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A) })

    for (let seq = 1; seq <= 10; seq++) {
        internals.onRelayData(
            protectedRtp(SENDER_A.recv, A_AUDIO, seq, 122, Uint8Array.of(0x58, seq, 0, 0, 0))
        )
    }

    assert.equal(logged.length, 2, 'at the first packet and the tenth')
    assert.deepEqual(logged[1], {
        ssrc: `0x${A_AUDIO.toString(16)}`,
        packets: 10,
        decoded: 10,
        rejected: 0,
        firstBytes: { '0x58': 10 },
        minBytes: 5,
        maxBytes: 5,
        meanBytes: 5,
        timestampSteps: { '960': 9 }
    })
})

const A_VIDEO = 0x0a0a0a03
const A_APP = 0x0a0a0a06
const B_VIDEO = 0x0b0b0b03
const B_APP = 0x0b0b0b06
const SELF_VIDEO = 0x22222222

/** Senders with every stream a group call carries, and the relay ids the roster gave them. */
const FULL_A: WaCallMediaSender = {
    id: 'a',
    audio: A_AUDIO,
    streams: [A_AUDIO, A_VIDEO, A_APP],
    recv: SENDER_A.recv,
    pid: 0
}
const FULL_B: WaCallMediaSender = {
    id: 'b',
    audio: B_AUDIO,
    streams: [B_AUDIO, B_VIDEO, B_APP],
    recv: SENDER_B.recv,
    pid: 2
}
const FULL_SSRCS: WaCallMediaSsrcs = { ...SSRCS, peerAppData: [A_APP, B_APP] }

function reactionPacket(sender: WaCallMediaSender, ssrc: number, reaction: string): Uint8Array {
    return protectedRtp(
        sender.recv,
        ssrc,
        1,
        119,
        encodeReactionPayload({ transactionId: BigInt(ssrc), reaction })
    )
}

/** One single-NAL key frame on `ssrc`, closed by the marker. */
function videoKeyFrame(sender: WaCallMediaSender, ssrc: number, seq = 1): Uint8Array {
    const peer = new SrtpSession(
        nodeCrypto,
        sender.recv,
        sender.recv,
        SRTP_SEND_AUTH_TAG_LEN,
        SRTP_RECV_AUTH_TAG_LEN
    )
    const header = new RtpHeader(97, seq, seq * 3000, ssrc)
    header.marker = true
    return peer.protect(new RtpPacket(header, Uint8Array.of(0x65, 0x88, 0x84)))
}

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

test('group video names its sender on the packets and on the frames', async (t) => {
    const packets: InboundVideoRtpPacket[] = []
    const frames: InboundVideoFrame[] = []
    const { plane, internals } = createPlane({
        onInboundVideoRtp: (packet) => packets.push(packet),
        onInboundVideo: (frame) => frames.push(frame)
    })
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: FULL_SSRCS, keys: keys(1), group: group(FULL_A, FULL_B) })

    internals.onRelayData(videoKeyFrame(FULL_A, A_VIDEO))
    internals.onRelayData(videoKeyFrame(FULL_B, B_VIDEO))

    assert.deepEqual(
        packets.map((packet) => [packet.ssrc, packet.senderId]),
        [
            [A_VIDEO, 'a'],
            [B_VIDEO, 'b']
        ]
    )
    assert.deepEqual(
        frames.map((frame) => [frame.ssrc, frame.senderId, frame.keyFrame]),
        [
            [A_VIDEO, 'a', true],
            [B_VIDEO, 'b', true]
        ]
    )
})

test('a 1:1 call names no sender on its video', async (t) => {
    const packets: InboundVideoRtpPacket[] = []
    const { plane, internals } = createPlane({
        onInboundVideoRtp: (packet) => packets.push(packet)
    })
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1) })

    internals.onRelayData(videoKeyFrame({ ...FULL_A, recv: keys(1).recv }, A_VIDEO))

    assert.equal(packets.length, 1)
    assert.equal(packets[0].senderId, undefined)
})

/** Two senders through one reception restart it on every switch of SSRC. */
test('our video report and REMB carry each group sender apart', async (t) => {
    const { plane, relay, internals } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({
        mediaType: 'video',
        ssrcs: FULL_SSRCS,
        keys: keys(1),
        group: group(FULL_A, FULL_B),
        accepted: true
    })
    const rtcp = internals as unknown as {
        srtcpContext: unknown
        receiverEstimateSchedule: unknown
        sendSenderReport: (
            ssrc: number,
            packets: number,
            octets: number,
            timestamp: number,
            reception: unknown,
            video: boolean
        ) => void
    }
    rtcp.srtcpContext = { protect: (packet: Uint8Array) => packet }
    rtcp.receiverEstimateSchedule = { shouldReport: () => true }

    internals.onRelayData(videoKeyFrame(FULL_A, A_VIDEO, 1))
    internals.onRelayData(videoKeyFrame(FULL_A, A_VIDEO, 2))
    internals.onRelayData(videoKeyFrame(FULL_B, B_VIDEO, 1))
    rtcp.sendSenderReport(SELF_VIDEO, 1, 10, 0, internals.groupAudio, true)

    const rembs = relay.sent.filter((packet) => packet[1] === 206 && (packet[0] & 0x1f) === 15)
    const last = rembs.at(-1)!
    assert.equal(last[16], 2, 'two sources listed')
    assert.deepEqual([readUInt32BE(last, 20), readUInt32BE(last, 24)], [A_VIDEO, B_VIDEO])
    const report = relay.sent.filter((packet) => packet[1] === 200).at(-1)!
    assert.equal(report[0] & 0x0f, 2, 'a block per sender')
    assert.equal(report.length, 28 + 2 * 32 + 32, 'and no trailer')
    assert.deepEqual([readUInt32BE(report, 28), readUInt32BE(report, 60)], [A_VIDEO, B_VIDEO])
    assert.equal(readUInt32BE(report, 28 + 4) & 0xffffff, 0, 'the first sender lost nothing')
})

test('the plan sizes the video streams reassembled at once', async (t) => {
    const { plane, internals } = createPlane()
    t.after(() => plane.stop())
    const senders = Array.from({ length: 12 }, (_, index) => {
        const base = 0x1000 * (index + 1)
        return {
            id: `s${index}`,
            audio: base,
            streams: [base, base + 3],
            recv: material(index + 10)
        }
    })
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: { senders } })

    for (const sender of senders) {
        internals.onRelayData(videoKeyFrame(sender, sender.audio + 3))
    }

    assert.equal(internals.maxVideoStreams, 24)
    assert.equal(internals.inboundVideoStreams.size, 12, 'more than the 1:1 bound of 8')
    await plane.apply({ group: null })
    assert.equal(internals.maxVideoStreams, 8)
    assert.equal(internals.inboundVideoStreams.size, 0, 'the group streams leave with the plan')
})

/** Reassembly is evicted oldest first, so a departed sender's stream must not outlive the plan. */
test('a sender that leaves the plan takes its video streams, and the active ones keep theirs', async (t) => {
    const { plane, internals } = createPlane()
    t.after(() => plane.stop())
    const senders = Array.from({ length: 5 }, (_, index) => {
        const base = 0x1000 * (index + 1)
        return {
            id: `s${index}`,
            audio: base,
            streams: [base, base + 3, base + 4],
            recv: material(index + 10)
        }
    })
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: { senders } })
    for (const sender of senders) {
        internals.onRelayData(videoKeyFrame(sender, sender.audio + 3))
        internals.onRelayData(videoKeyFrame(sender, sender.audio + 4))
    }
    assert.equal(internals.inboundVideoStreams.size, 10)

    const staying = senders.filter((_, index) => index !== 2)
    await plane.apply({ group: { senders: staying } })

    assert.equal(internals.maxVideoStreams, 8)
    assert.deepEqual(
        [...internals.inboundVideoStreams.keys()],
        staying.flatMap((sender) => [sender.audio + 3, sender.audio + 4]),
        'the departed sender lost its streams, not the oldest active one'
    )
})

test('leaving group mode drops the group video streams and keeps the 1:1 ones', async (t) => {
    const { plane, internals } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1) })
    internals.onRelayData(videoKeyFrame({ ...FULL_A, recv: keys(1).recv }, NOBODY))
    await plane.apply({ ssrcs: FULL_SSRCS, group: group(FULL_A) })
    internals.onRelayData(videoKeyFrame(FULL_A, A_VIDEO))
    assert.equal(internals.inboundVideoStreams.size, 2)

    await plane.apply({ group: null })

    assert.deepEqual([...internals.inboundVideoStreams.keys()], [NOBODY])
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
