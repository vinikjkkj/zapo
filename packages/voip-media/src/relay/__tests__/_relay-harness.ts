import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'

import { createNoopLogger } from '../../logger.js'
import { nodeCrypto } from '../../node/crypto.js'
import type { RawUdpLegOptions } from '../leg.js'
import { WaSctpRelay, type WaSctpRelayOptions } from '../WaSctpRelay.js'

/** A fake raw UDP leg: records every datagram, pongs every STUN message, and can be held or killed. */
export interface FakeLeg {
    readonly ip: string
    readonly port: number
    readonly sent: Uint8Array[]
    closed: boolean
    release(): void
    fail(reason: string): void
    deliver(data: Uint8Array): void
}

export const MEDIA = new Uint8Array([
    0x80, 0x78, 0x00, 0x2a, 0x00, 0x00, 0x03, 0xc0, 0x11, 0x22, 0x33, 0x44, 0xaa, 0xbb, 0xcc, 0xdd
])
export const PONG = new Uint8Array([
    0x08,
    0x02,
    0x00,
    0x00,
    0x21,
    0x12,
    0xa4,
    0x42,
    ...new Uint8Array(12)
])
export const WA_PING = 0x0801
export const STUN_ALLOCATE = 0x0003
export const ATTR_RELAY_CREDENTIAL = 0x4000

/** The port every `<te2>` advertises, which raw legs dial. */
export const ADVERTISED_PORT = 3478

export function isMedia(datagram: Uint8Array): boolean {
    return (datagram[0] & 0xc0) === 0x80
}

export function typeOf(datagram: Uint8Array): number {
    return (datagram[0] << 8) | datagram[1]
}

export function readStunAttribute(packet: Uint8Array, wanted: number): Uint8Array | null {
    const end = 20 + ((packet[2] << 8) | packet[3])
    for (let at = 20; at + 4 <= end; ) {
        const type = (packet[at] << 8) | packet[at + 1]
        const length = (packet[at + 2] << 8) | packet[at + 3]
        if (type === wanted) return packet.subarray(at + 4, at + 4 + length)
        at += 4 + length + ((4 - (length % 4)) % 4)
    }
    return null
}

export interface Harness {
    readonly relay: WaSctpRelay
    readonly legs: FakeLeg[]
    readonly warnings: string[]
    readonly infos: string[]
    readonly debugs: Array<readonly [string, Readonly<Record<string, unknown>> | undefined]>
    readonly lost: string[]
    /** Every leg dialled to `ip`, oldest first. */
    legsTo(ip: string): FakeLeg[]
    /** The live leg dialled to `ip`. */
    leg(ip: string): FakeLeg
    /** The leg one media packet sent now leaves through, or `null` if none took it. */
    sendMediaVia(): FakeLeg | null
    setNow(ms: number): void
}

export interface HarnessOptions {
    readonly held?: readonly string[]
    readonly rawUdpLegs?: WaSctpRelayOptions['rawUdpLegs']
    readonly createPeerConnection?: WaSctpRelayOptions['createPeerConnection']
}

export function createHarness(t: TestContext, options: HarnessOptions = {}): Harness {
    const legs: FakeLeg[] = []
    const warnings: string[] = []
    const infos: string[] = []
    const debugs: Array<readonly [string, Readonly<Record<string, unknown>> | undefined]> = []
    const lost: string[] = []
    const held = new Set(options.held ?? [])
    let now = 0
    const logger = createNoopLogger()
    logger.warn = (message) => {
        warnings.push(message)
    }
    logger.info = (message) => {
        infos.push(message)
    }
    logger.debug = (message, context) => {
        debugs.push([message, context])
    }

    const relay = new WaSctpRelay({
        crypto: nodeCrypto,
        logger,
        now: () => now,
        rawUdpLegs: options.rawUdpLegs,
        onLost: (reason) => lost.push(reason),
        createPeerConnection:
            options.createPeerConnection ??
            (() => Promise.reject(new Error('this test dials no WebRTC leg'))),
        createRawUdpLeg: (legOptions: RawUdpLegOptions) => createFakeLeg(legOptions, legs, held)
    })
    t.after(() => relay.cleanup())

    const legsTo = (ip: string) => legs.filter((leg) => leg.ip === ip)
    return {
        relay,
        legs,
        warnings,
        infos,
        debugs,
        lost,
        legsTo,
        leg: (ip) => {
            const live = legsTo(ip).filter((leg) => !leg.closed)
            assert.equal(live.length, 1, `one live leg to ${ip}`)
            return live[0]
        },
        sendMediaVia: () => {
            const before = legs.map((leg) => leg.sent.filter(isMedia).length)
            if (!relay.sendMedia(MEDIA.slice().buffer)) return null
            const carrying = legs.filter((leg, i) => leg.sent.filter(isMedia).length > before[i])
            assert.equal(carrying.length, 1, 'one leg carries the media')
            return carrying[0]
        },
        setNow: (ms) => {
            now = ms
        }
    }
}

export function createFakeLeg(options: RawUdpLegOptions, legs: FakeLeg[], held: Set<string>) {
    let open = false
    const leg: FakeLeg = {
        ip: options.ip,
        port: options.port,
        sent: [],
        closed: false,
        release: () => {
            if (open || leg.closed) return
            open = true
            options.onOpen()
        },
        fail: (reason) => {
            leg.closed = true
            options.onFailure(reason)
        },
        deliver: (data) => options.onMessage(data)
    }
    legs.push(leg)
    return {
        get isOpen() {
            return open && !leg.closed
        },
        open: () => {
            if (!held.has(options.ip)) queueMicrotask(leg.release)
        },
        send: (data: Uint8Array) => {
            if (!open || leg.closed) return false
            leg.sent.push(data.slice())
            if (!isMedia(data)) {
                queueMicrotask(() => {
                    if (!leg.closed) options.onMessage(PONG.slice())
                })
            }
            return true
        },
        close: () => {
            leg.closed = true
        }
    }
}

export interface EndpointOverrides {
    readonly token?: string
    readonly rawToken?: Uint8Array
    readonly transport?: 'raw-udp'
    readonly relayId?: number
}

export function endpoint(ip: string, overrides: EndpointOverrides = {}) {
    return {
        ip,
        port: 3480,
        originalPort: ADVERTISED_PORT,
        token: overrides.token ?? 'token',
        rawToken: overrides.rawToken ?? new Uint8Array([1, 2, 3]),
        key: 'relay-key',
        relayId: overrides.relayId ?? 1,
        name: ip,
        transport: overrides.transport
    }
}

/** The id `onReceive` names a raw leg by: advertised port, no auth token id. */
export function idOf(ip: string): string {
    return ip.includes(':') ? `[${ip}]:${ADVERTISED_PORT}` : `${ip}:${ADVERTISED_PORT}`
}

export async function flush(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve))
}

export const OFFER = ['10.0.0.1', '10.0.0.2'] as const
export const REISSUE = ['10.1.0.1', '2001:db8::1'] as const

/** The offer's two relays (generation 0), open and answering. */
export async function dialOffer(harness: Harness): Promise<void> {
    harness.relay.setSsrc(0x11223344)
    await harness.relay.configureRelays(OFFER.map((ip, i) => endpoint(ip, { relayId: i + 1 })))
    await flush()
    assert.equal(harness.relay.getConnectedCount(), 2, 'the offer legs opened')
}

export async function dialReissue(harness: Harness, generation = 1): Promise<void> {
    await harness.relay.configureRelays(
        REISSUE.map((ip) => endpoint(ip, { transport: 'raw-udp' })),
        { generation }
    )
    await flush()
}

export function debugContexts(harness: Harness, message: string) {
    return harness.debugs.filter(([logged]) => logged === message).map(([, context]) => context)
}

/** A peer connection whose data channel opens on demand and records what goes through it. */
export class FakePeerConnection {
    closed = false
    remoteSdp = ''
    readonly channelSent: Uint8Array[] = []
    iceConnectionState = 'new'
    iceGatheringState = 'new'
    signalingState = 'stable'
    oniceconnectionstatechange: (() => void) | null = null
    onconnectionstatechange: (() => void) | null = null
    onicegatheringstatechange: (() => void) | null = null
    onsignalingstatechange: (() => void) | null = null
    ondatachannel: ((event: unknown) => void) | null = null
    private readonly channel = {
        binaryType: 'blob',
        readyState: 'connecting',
        onopen: null as (() => void) | null,
        onclose: null as (() => void) | null,
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as (() => void) | null,
        send: (data: ArrayBuffer) => {
            this.channelSent.push(new Uint8Array(data).slice())
        },
        close: () => {
            this.channel.readyState = 'closed'
        }
    }

    createDataChannel() {
        return this.channel
    }

    createOffer() {
        return Promise.resolve({
            type: 'offer',
            sdp: 'v=0\r\na=ice-ufrag:local\r\na=ice-pwd:local-password\r\na=setup:actpass\r\n'
        })
    }

    setLocalDescription() {
        return Promise.resolve()
    }

    setRemoteDescription(description: { sdp: string }) {
        this.remoteSdp = description.sdp
        return Promise.resolve()
    }

    openChannel(): void {
        this.channel.readyState = 'open'
        this.channel.onopen?.()
    }

    close(): void {
        this.closed = true
        this.channel.close()
    }
}

export async function dialWebRtcLeg(t: TestContext) {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
    const dialled: FakePeerConnection[] = []
    const warnings: string[] = []
    const infos: Array<readonly [string, Readonly<Record<string, unknown>> | undefined]> = []
    const logger = createNoopLogger()
    logger.warn = (message) => {
        warnings.push(message)
    }
    logger.info = (message, context) => {
        infos.push([message, context])
    }
    let now = 0
    const relay = new WaSctpRelay({
        crypto: nodeCrypto,
        logger,
        now: () => now,
        createPeerConnection: () => {
            const pc = new FakePeerConnection()
            dialled.push(pc)
            return Promise.resolve(pc as unknown as RTCPeerConnection)
        }
    })
    t.after(() => relay.cleanup())
    relay.setSsrc(0x11223344)
    const descriptor = (
        authToken: string,
        rawToken: Uint8Array,
        overrides: { readonly key?: string; readonly authTokenId?: string } = {}
    ) => ({
        ip: REISSUE[0],
        port: 3478,
        originalPort: 3478,
        token: 'token-text',
        authToken,
        rawToken,
        key: overrides.key ?? 'relay-key',
        relayId: 0,
        authTokenId: overrides.authTokenId ?? '0'
    })
    await relay.configureRelays([descriptor('ufrag-13', new Uint8Array(194).fill(0x13))], {
        generation: 1
    })
    await flush()
    dialled[0].openChannel()
    const setNow = (ms: number): void => {
        now = ms
    }
    return { relay, dialled, descriptor, warnings, infos, setNow }
}

export function allocateCredentials(pc: FakePeerConnection): Uint8Array[] {
    return pc.channelSent
        .filter((datagram) => typeOf(datagram) === STUN_ALLOCATE)
        .map((allocate) => readStunAttribute(allocate, ATTR_RELAY_CREDENTIAL) ?? new Uint8Array())
}
