import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { encodeReactionPayload } from '../../app-data/protocol.js'
import { type SrtcpSession, SrtpSession } from '../../crypto/srtp.js'
import { createNoopLogger, type Logger } from '../../logger.js'
import type { AudioReceiveSet, AudioStreamDecoder } from '../../media/audio-receive-set.js'
import { MLowCodec } from '../../media/mlow-codec.js'
import { RtpHeader, RtpPacket } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import type { SrtpKeyingMaterial } from '../../types.js'
import type {
    WaCallMediaGroup,
    WaCallMediaKeys,
    WaCallMediaRelays,
    WaCallMediaSender,
    WaCallMediaSsrcs,
    WaCallMediaStreamLayer
} from '../plan.js'
import { WaCallMediaPlane, type WaCallMediaPlaneOptions } from '../WaCallMediaPlane.js'

export const SELF_AUDIO = 0x11111111
export const SELF_APP_DATA = 0x66666666
export const A_AUDIO = 0x0a0a0a01
export const A_FEC = 0x0a0a0a02
export const B_AUDIO = 0x0b0b0b01
export const B_FEC = 0x0b0b0b02
export const NOBODY = 0x0c0c0c01

export const FRAME = 960
export const MLOW_RED_PAYLOAD_TYPE = 121
export const PAYLOAD = Uint8Array.of(0x58, 0x01, 0x02, 0x03)

export const SSRCS: WaCallMediaSsrcs = {
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

export const LAYERS: readonly WaCallMediaStreamLayer[] = [
    { layer: 0, ssrcs: [SELF_AUDIO, 0x11110001, 0x11110004] },
    { layer: 5, ssrcs: [SELF_APP_DATA] }
]

export function material(fill: number): SrtpKeyingMaterial {
    return { masterKey: new Uint8Array(16).fill(fill), masterSalt: new Uint8Array(14).fill(fill) }
}

export function keys(epoch: number): WaCallMediaKeys {
    return { epoch, send: material(epoch), recv: material(epoch) }
}

export const SENDER_A: WaCallMediaSender = {
    id: 'a',
    audio: A_AUDIO,
    streams: [A_AUDIO, A_FEC],
    recv: material(0xa1)
}
export const SENDER_B: WaCallMediaSender = {
    id: 'b',
    audio: B_AUDIO,
    streams: [B_AUDIO, B_FEC],
    recv: material(0xb2)
}

export function group(...senders: WaCallMediaSender[]): WaCallMediaGroup {
    return { senders }
}

export function relays(generation: number, ip = '10.0.0.1'): WaCallMediaRelays {
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

export interface Dial {
    readonly generation: number | undefined
    readonly transports: (string | undefined)[]
}

/** A relay that records what the plane asks of it; it is open while `connected` is set. */
export class FakeRelay {
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
export interface Handled {
    readonly seqs: number[]
    readonly streams: number[]
}

export interface PlaneInternals {
    sctpRelay: FakeRelay
    codec: unknown
    srtpSession: SrtpSession | null
    srtcpRecvSession: SrtcpSession | null
    group: {
        audio: AudioReceiveSet | null
        createSenderDecoder: () => AudioStreamDecoder | Promise<AudioStreamDecoder>
    }
    relays: WaCallMediaRelays | null
    sendAudioReceiverEstimate: (ssrc: number) => void
    onRelayData: (data: Uint8Array, connectionId?: string) => void
    peerAppDataSsrcs: Set<number>
    inboundVideo: { streams: Map<number, unknown>; maxStreams: number }
}

export interface Harness {
    readonly plane: WaCallMediaPlane
    readonly relay: FakeRelay
    readonly internals: PlaneInternals
    /** One record per sender decoder, in creation order. */
    readonly decoders: Handled[]
}

/** A plane on a recording relay whose group decoders are stand-ins answering at once. */
export function createPlane(
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
    internals.group.createSenderDecoder = () => {
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
export function protectedRtp(
    keying: SrtpKeyingMaterial,
    ssrc: number,
    seq: number,
    payloadType = 120,
    payload: Uint8Array = PAYLOAD
): Uint8Array {
    const peer = new SrtpSession(nodeCrypto, keying, keying)
    return peer.protect(new RtpPacket(new RtpHeader(payloadType, seq, seq * FRAME, ssrc), payload))
}

export function plainRtp(
    ssrc: number,
    seq: number,
    timestamp: number,
    payload: Uint8Array,
    payloadType = MLOW_RED_PAYLOAD_TYPE
): Uint8Array {
    return new RtpPacket(new RtpHeader(payloadType, seq, timestamp, ssrc), payload).encode()
}

export function senderStats(
    plane: WaCallMediaPlane
): Record<string, { recv: number; auth: number }> {
    const rows: Record<string, { recv: number; auth: number }> = {}
    for (const sender of plane.getStats().senders ?? []) {
        rows[sender.id] = { recv: sender.recv, auth: sender.authFailures }
    }
    return rows
}

/**
 * A flowing group plane with real sender decoders, loaded before it returns, and SRTP that
 * passes packets through; each sender's decoded frames are kept, copied.
 */
export async function createDecodingPlane(
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
    const realDecoder = internals.group.createSenderDecoder.bind(internals.group)
    internals.group.createSenderDecoder = () => {
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

export function concat(chunks: readonly Float32Array[]): Float32Array {
    const out = new Float32Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
    let offset = 0
    for (const chunk of chunks) {
        out.set(chunk, offset)
        offset += chunk.length
    }
    return out
}

/** A relay frame around the media: marker 0x09, `4 + n * 2` header bytes, then the packet. */
export function framed(rtp: Uint8Array, lengthByte: number): Uint8Array {
    const headerLength = 4 + (lengthByte & 0x7f) * 2
    const out = new Uint8Array(headerLength + rtp.length)
    out[0] = 0x09
    out[1] = lengthByte
    out[3] = 1
    out.set(rtp, headerLength)
    return out
}

/** `count` consecutive 60 ms MLow frames of one tone, as one sender's encoder emits them. */
export async function encodeFrames(
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

export function playedSamples(frames: readonly Float32Array[]): number {
    return frames.reduce((sum, pcm) => sum + pcm.length, 0)
}

export const A_VIDEO = 0x0a0a0a03
export const A_APP = 0x0a0a0a06
export const B_VIDEO = 0x0b0b0b03
export const B_APP = 0x0b0b0b06
export const SELF_VIDEO = 0x22222222

/** Senders with every stream a group call carries, and the relay ids the roster gave them. */
export const FULL_A: WaCallMediaSender = {
    id: 'a',
    audio: A_AUDIO,
    streams: [A_AUDIO, A_VIDEO, A_APP],
    recv: SENDER_A.recv,
    pid: 0
}
export const FULL_B: WaCallMediaSender = {
    id: 'b',
    audio: B_AUDIO,
    streams: [B_AUDIO, B_VIDEO, B_APP],
    recv: SENDER_B.recv,
    pid: 2
}
export const FULL_SSRCS: WaCallMediaSsrcs = { ...SSRCS, peerAppData: [A_APP, B_APP] }

export function reactionPacket(
    sender: WaCallMediaSender,
    ssrc: number,
    reaction: string
): Uint8Array {
    return protectedRtp(
        sender.recv,
        ssrc,
        1,
        119,
        encodeReactionPayload({ transactionId: BigInt(ssrc), reaction })
    )
}

/** One single-NAL key frame on `ssrc`, closed by the marker. */
export function videoKeyFrame(sender: WaCallMediaSender, ssrc: number, seq = 1): Uint8Array {
    const peer = new SrtpSession(nodeCrypto, sender.recv, sender.recv)
    const header = new RtpHeader(97, seq, seq * 3000, ssrc)
    header.marker = true
    return peer.protect(new RtpPacket(header, Uint8Array.of(0x65, 0x88, 0x84)))
}
