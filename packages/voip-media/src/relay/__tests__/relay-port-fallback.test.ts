import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { nodeCrypto } from '../../node/crypto.js'
import { WaSctpRelay } from '../WaSctpRelay.js'

/** The two ports a relay can be reached on: the web client's, and the one its `<te2>` advertises. */
const WEB_CLIENT_PORT = 3480
const ADVERTISED_PORT = 3478

/** The relay's whole 0x0802 keepalive answer: type, zero length, magic cookie, transaction id. */
const PONG = new Uint8Array([0x08, 0x02, 0x00, 0x00, 0x21, 0x12, 0xa4, 0x42, ...new Uint8Array(12)])

/** An SRTP packet as the plane hands it over: RTP version 2, PT 120. */
const MEDIA = new Uint8Array([
    0x80, 0x78, 0x00, 0x2a, 0x00, 0x00, 0x03, 0xc0, 0x11, 0x22, 0x33, 0x44, 0xaa, 0xbb, 0xcc, 0xdd
])

/** RTP and RTCP carry version 2 in the top two bits; STUN carries zeros there. */
function isMedia(datagram: Uint8Array): boolean {
    return (datagram[0] & 0xc0) === 0x80
}

/** One endpoint, dialled the way the plane hands it over: the web client port, the advertised one kept. */
const RELAY = {
    ip: '10.0.3.1',
    port: WEB_CLIENT_PORT,
    originalPort: ADVERTISED_PORT,
    token: 'token',
    rawToken: new Uint8Array([1, 2, 3]),
    key: 'relay-key',
    relayId: 3,
    authTokenId: '3'
}

/** One dial of the relay: the port it went to and every datagram sent on it. */
interface Dial {
    readonly port: number
    readonly sent: Uint8Array[]
    fail(reason: string): void
}

/** Lets the dials, opens and answers the fakes schedule run their course. */
async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) await new Promise<void>((resolve) => setImmediate(resolve))
}

function mediaOn(dial: Dial): number {
    return dial.sent.filter(isMedia).length
}

/** A relay over raw UDP legs, whose far end answers every STUN message only on `answering` ports. */
function createRawRelay(dials: Dial[], answering: ReadonlySet<number>): WaSctpRelay {
    return new WaSctpRelay({
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        createRawUdpLeg: (options) => {
            let open = false
            let closed = false
            const dial: Dial = {
                port: options.port,
                sent: [],
                fail: (reason) => {
                    closed = true
                    options.onFailure(reason)
                }
            }
            dials.push(dial)
            return {
                get isOpen() {
                    return open && !closed
                },
                open: () => {
                    queueMicrotask(() => {
                        open = true
                        options.onOpen()
                    })
                },
                send: (data) => {
                    if (!open || closed) return false
                    dial.sent.push(data.slice())
                    if (!isMedia(data) && answering.has(options.port)) {
                        queueMicrotask(() => {
                            if (!closed) options.onMessage(PONG.slice())
                        })
                    }
                    return true
                },
                close: () => {
                    closed = true
                }
            }
        }
    })
}

async function dialRaw(
    t: TestContext,
    answering: Set<number>
): Promise<{ relay: WaSctpRelay; dials: Dial[] }> {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
    const dials: Dial[] = []
    const relay = createRawRelay(dials, answering)
    t.after(() => relay.cleanup())
    await relay.configureRelays([RELAY])
    await settle()
    return { relay, dials }
}

/** The registration burst replays at 50, 150, 500 and 3000 ms from the open. */
test('an open leg the relay never answers is redialled once its burst had time to be answered', async (t) => {
    const { relay, dials } = await dialRaw(t, new Set([WEB_CLIENT_PORT]))
    assert.deepEqual(
        dials.map((d) => d.port),
        [ADVERTISED_PORT],
        'a raw leg dials the advertised port first'
    )

    t.mock.timers.tick(3_500)
    await settle()
    assert.equal(dials.length, 1, 'the last replay of the burst still gets its answer time')

    t.mock.timers.tick(1_000)
    await settle()

    assert.deepEqual(
        dials.map((d) => d.port),
        [ADVERTISED_PORT, WEB_CLIENT_PORT]
    )
    assert.equal(relay.getConnectedCount(), 1, 'only the redialled leg is up')

    assert.equal(relay.sendMedia(MEDIA.slice().buffer), true)
    assert.equal(mediaOn(dials[1]), 1, 'media leaves through the redialled leg')
    assert.equal(mediaOn(dials[0]), 0)
})

test('a leg the relay answers on its first port is never redialled', async (t) => {
    const { relay, dials } = await dialRaw(t, new Set([ADVERTISED_PORT]))

    t.mock.timers.tick(60_000)
    await settle()

    assert.deepEqual(
        dials.map((d) => d.port),
        [ADVERTISED_PORT]
    )
    assert.equal(relay.sendMedia(MEDIA.slice().buffer), true)
    assert.equal(mediaOn(dials[0]), 1)
})

test('a relay that answers only the last replay of the burst keeps its leg', async (t) => {
    const answering = new Set<number>()
    const { relay, dials } = await dialRaw(t, answering)

    t.mock.timers.tick(2_900)
    await settle()
    answering.add(ADVERTISED_PORT)
    t.mock.timers.tick(100)
    await settle()
    t.mock.timers.tick(10_000)
    await settle()

    assert.deepEqual(
        dials.map((d) => d.port),
        [ADVERTISED_PORT]
    )
    assert.equal(relay.getConnectedCount(), 1)
})

test('a leg that dies before the relay ever answered is redialled at once', async (t) => {
    const { dials } = await dialRaw(t, new Set([WEB_CLIENT_PORT]))

    dials[0].fail('raw_udp_socket_error')
    await settle()

    assert.deepEqual(
        dials.map((d) => d.port),
        [ADVERTISED_PORT, WEB_CLIENT_PORT]
    )
})

test('a leg unanswered on both ports is redialled only once', async (t) => {
    const { dials } = await dialRaw(t, new Set())

    t.mock.timers.tick(4_500)
    await settle()
    t.mock.timers.tick(60_000)
    await settle()

    assert.deepEqual(
        dials.map((d) => d.port),
        [ADVERTISED_PORT, WEB_CLIENT_PORT]
    )
})

/** A WebRTC leg whose relay port does not answer never opens: ICE never completes. */
class FakePeerConnection {
    static readonly all: FakePeerConnection[] = []
    iceConnectionState = 'new'
    iceGatheringState = 'new'
    signalingState = 'stable'
    oniceconnectionstatechange: (() => void) | null = null
    onconnectionstatechange: (() => void) | null = null
    onicegatheringstatechange: (() => void) | null = null
    onsignalingstatechange: (() => void) | null = null
    ondatachannel: ((event: unknown) => void) | null = null
    closed = false
    port = 0
    readonly sent: Uint8Array[] = []
    private channel: FakeChannel | null = null

    /** `openAfterMs` stands for ICE, DTLS and SCTP taking that long on a port that answers. */
    constructor(
        private readonly answering: readonly number[],
        private readonly openAfterMs?: number
    ) {
        FakePeerConnection.all.push(this)
    }

    createDataChannel(): FakeChannel {
        this.channel = new FakeChannel(this)
        return this.channel
    }

    async createOffer(): Promise<{ type: 'offer'; sdp: string }> {
        return {
            type: 'offer',
            sdp: 'v=0\r\na=ice-ufrag:abcd\r\na=ice-pwd:local-password\r\na=setup:actpass\r\n'
        }
    }

    async setLocalDescription(): Promise<void> {}

    async setRemoteDescription(description: { sdp: string }): Promise<void> {
        const candidate = /a=candidate:\S+ \d+ udp \d+ \S+ (\d+) typ/.exec(description.sdp)
        this.port = Number(candidate?.[1])
        if (!this.answering.includes(this.port)) return
        if (this.openAfterMs === undefined) setImmediate(() => this.channel?.open())
        else setTimeout(() => this.channel?.open(), this.openAfterMs)
    }

    close(): void {
        this.closed = true
    }

    receive(data: Uint8Array): void {
        if (!this.closed) this.channel?.onmessage?.({ data } as MessageEvent)
    }
}

class FakeChannel {
    binaryType = 'blob'
    readyState = 'connecting'
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: (() => void) | null = null

    constructor(private readonly pc: FakePeerConnection) {}

    open(): void {
        if (this.pc.closed) return
        this.readyState = 'open'
        this.onopen?.()
    }

    send(data: ArrayBuffer): void {
        const bytes = new Uint8Array(data).slice()
        this.pc.sent.push(bytes)
        if (!isMedia(bytes)) queueMicrotask(() => this.pc.receive(PONG.slice()))
    }

    close(): void {
        this.readyState = 'closed'
    }
}

async function dialWebRtc(
    t: TestContext,
    answering: readonly number[],
    openAfterMs?: number
): Promise<WaSctpRelay> {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
    FakePeerConnection.all.length = 0
    const relay = new WaSctpRelay({
        crypto: nodeCrypto,
        createPeerConnection: async () =>
            new FakePeerConnection(answering, openAfterMs) as unknown as RTCPeerConnection
    })
    t.after(() => relay.cleanup())
    await relay.configureRelays([RELAY])
    await settle()
    return relay
}

test('on the WebRTC path a leg that never opens on 3480 is redialled on the advertised port', async (t) => {
    const relay = await dialWebRtc(t, [ADVERTISED_PORT])
    assert.equal(relay.getConnectedCount(), 0, 'nothing answers on 3480')

    t.mock.timers.tick(4_000)
    await settle()
    assert.equal(FakePeerConnection.all.length, 1, 'a slow leg is given time to open')

    t.mock.timers.tick(1_500)
    await settle()

    const [first, second] = FakePeerConnection.all
    assert.equal(FakePeerConnection.all.length, 2)
    assert.equal(first.port, WEB_CLIENT_PORT)
    assert.equal(first.closed, true, 'the unanswered leg is closed, not kept beside the new one')
    assert.equal(second.port, ADVERTISED_PORT)
    assert.equal(relay.getConnectedCount(), 1)

    assert.equal(relay.sendMedia(MEDIA.slice().buffer), true)
    assert.equal(second.sent.filter(isMedia).length, 1, 'media leaves through the redialled leg')
})

/** ICE, DTLS and SCTP taking a few seconds on the right port is a slow leg, not a wrong port. */
test('on the WebRTC path a leg that opens slowly on the right port is not redialled', async (t) => {
    const relay = await dialWebRtc(t, [WEB_CLIENT_PORT], 3_500)

    t.mock.timers.tick(3_500)
    await settle()
    t.mock.timers.tick(15_000)
    await settle()

    assert.equal(FakePeerConnection.all.length, 1)
    assert.equal(FakePeerConnection.all[0].port, WEB_CLIENT_PORT)
    assert.equal(relay.getConnectedCount(), 1)
})
