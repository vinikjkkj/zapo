import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import { hexToBytes } from '../../__tests__/_helpers.js'
import type { Logger, LogLevel } from '../../logger.js'
import { nodeCrypto } from '../../node/crypto.js'
import { WaSctpRelay } from '../WaSctpRelay.js'

import { CALL_TIMELINE, TRACE_TIMELINE } from './_relay-timeline.expected.js'

const PONG = new Uint8Array([0x08, 0x02, 0x00, 0x00, 0x21, 0x12, 0xa4, 0x42, ...new Uint8Array(12)])
const MEDIA = new Uint8Array([
    0x80, 0x78, 0x00, 0x2a, 0x00, 0x00, 0x03, 0xc0, 0x11, 0x22, 0x33, 0x44, 0xaa, 0xbb, 0xcc, 0xdd
])
const FRAMED_MEDIA = new Uint8Array([0x09, 0x02, 0x01, 0x93, 0x01, 0x00, 0x01, 0x93, ...MEDIA])
const ALLOCATE_SUCCESS = hexToBytes(`01030000 2112a442 ${'00'.repeat(12)}`.replace(/ /g, ''))
/** An allocate error response whose ERROR-CODE is 401, with no reason. */
const ALLOCATE_ERROR = hexToBytes(
    `01130008 2112a442 ${'00'.repeat(12)} 00090004 00000401`.replace(/ /g, '')
)
/** STUN's clear high bits with no magic cookie. */
const NOT_STUN = new Uint8Array([0x00, 0x01, 0x00, 0x00, ...new Uint8Array(16)])
/** Neither STUN nor RTP: the top two bits are 01. */
const UNKNOWN = new Uint8Array([0x46, 0xfe, 0xfd, 0x00, 0x00, 0x00, 0x00, 0x00])

/** How a fake relay endpoint behaves, by `ip:port`. */
interface EndpointPolicy {
    open: boolean
    answer: boolean
}

function describe(data: Uint8Array): string {
    const type = (data[0] << 8) | data[1]
    return `stun:0x${type.toString(16).padStart(4, '0')}:${data.length}`
}

/**
 * Runs of the same line collapse into one, suffixed with their count. Media is noted only when
 * it moves to another leg.
 */
class Timeline {
    readonly lines: string[] = []
    private last = ''
    private repeats = 0
    private mediaVia = ''

    sent(label: string, data: Uint8Array): void {
        if ((data[0] & 0xc0) !== 0x80) {
            this.push(`send ${label} ${describe(data)}`)
            return
        }
        if (label === this.mediaVia) return
        this.mediaVia = label
        this.push(`media via ${label}`)
    }

    push(line: string): void {
        if (line === this.last) {
            this.repeats++
            this.lines[this.lines.length - 1] = `${line} x${this.repeats + 1}`
            return
        }
        this.last = line
        this.repeats = 0
        this.lines.push(line)
    }
}

function recordingLogger(timeline: Timeline, level: LogLevel): Logger {
    const withContext = level !== 'trace'
    const entry =
        (name: LogLevel) =>
        (message: string, context?: Readonly<Record<string, unknown>>): void => {
            if (name === 'trace' || !withContext) {
                timeline.push(`${name} ${message}`)
                return
            }
            timeline.push(`${name} ${message} ${JSON.stringify(context ?? {})}`)
        }
    const logger: Logger = {
        level,
        trace: entry('trace'),
        debug: entry('debug'),
        info: entry('info'),
        warn: entry('warn'),
        error: entry('error'),
        child: () => logger
    }
    return logger
}

interface Hosts {
    readonly policies: Map<string, EndpointPolicy>
    readonly pcs: FakePeerConnection[]
    readonly raws: FakeRawLeg[]
}

function policyOf(hosts: Hosts, ip: string, port: number): EndpointPolicy {
    return hosts.policies.get(`${ip}:${port}`) ?? { open: true, answer: true }
}

interface FakeChannel {
    binaryType: string
    readyState: string
    label: string
    id: number
    onopen: (() => void) | null
    onclose: (() => void) | null
    onmessage: ((event: { data: ArrayBuffer }) => void) | null
    onerror: (() => void) | null
    send(data: ArrayBuffer): void
    close(): void
}

class FakePeerConnection {
    closed = false
    label = 'webrtc ?'
    ip = ''
    port = 0
    iceConnectionState = 'new'
    iceGatheringState = 'new'
    signalingState = 'stable'
    connectionState = 'new'
    oniceconnectionstatechange: (() => void) | null = null
    onconnectionstatechange: (() => void) | null = null
    onicegatheringstatechange: (() => void) | null = null
    onsignalingstatechange: (() => void) | null = null
    ondatachannel: ((event: { channel: FakeChannel }) => void) | null = null
    readonly channel: FakeChannel

    constructor(
        private readonly hosts: Hosts,
        private readonly timeline: Timeline,
        private readonly index: number
    ) {
        this.channel = {
            binaryType: 'blob',
            readyState: 'connecting',
            label: 'wa-web-call',
            id: 0,
            onopen: null,
            onclose: null,
            onmessage: null,
            onerror: null,
            send: (data: ArrayBuffer) => {
                const bytes = new Uint8Array(data)
                this.timeline.sent(this.label, bytes)
                if ((bytes[0] & 0xc0) === 0x80) return
                if (!policyOf(this.hosts, this.ip, this.port).answer) return
                queueMicrotask(() => this.deliver(PONG))
            },
            close: () => {
                this.channel.readyState = 'closed'
            }
        }
    }

    createDataChannel(): FakeChannel {
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
        const candidate = /a=candidate:\S+ \S+ udp \S+ (\S+) (\d+) typ/.exec(description.sdp)
        this.ip = candidate?.[1] ?? '?'
        this.port = Number(candidate?.[2] ?? 0)
        this.label = `webrtc ${this.ip}:${this.port} #${this.index}`
        this.timeline.push(`dial ${this.label}`)
        if (policyOf(this.hosts, this.ip, this.port).open) {
            queueMicrotask(() => {
                if (this.closed) return
                this.channel.readyState = 'open'
                this.channel.onopen?.()
            })
        }
        return Promise.resolve()
    }

    getStats() {
        return Promise.resolve(
            new Map([
                [
                    'pair',
                    {
                        type: 'candidate-pair',
                        state: 'succeeded',
                        localCandidateId: 'l',
                        remoteCandidateId: 'r'
                    }
                ]
            ])
        )
    }

    setIce(state: string): void {
        this.iceConnectionState = state
        this.oniceconnectionstatechange?.()
    }

    deliver(data: Uint8Array): void {
        if (this.closed || this.channel.readyState !== 'open') return
        this.channel.onmessage?.({ data: data.slice().buffer })
    }

    close(): void {
        this.closed = true
        this.timeline.push(`close ${this.label}`)
        this.channel.readyState = 'closed'
    }
}

interface FakeRawLeg {
    readonly label: string
    deliver(data: Uint8Array): void
    fail(reason: string): void
}

function createRawLeg(
    hosts: Hosts,
    timeline: Timeline,
    options: {
        ip: string
        port: number
        onOpen(): void
        onMessage(data: Uint8Array): void
        onFailure(reason: string): void
    }
) {
    let open = false
    let closed = false
    const label = `raw ${options.ip}:${options.port} #${hosts.raws.length}`
    const policy = () => policyOf(hosts, options.ip, options.port)
    const leg: FakeRawLeg = {
        label,
        deliver: (data) => {
            if (open && !closed) options.onMessage(data.slice())
        },
        fail: (reason) => {
            closed = true
            options.onFailure(reason)
        }
    }
    hosts.raws.push(leg)
    timeline.push(`dial ${label}`)
    return {
        get isOpen() {
            return open && !closed
        },
        open: () => {
            if (!policy().open) return
            queueMicrotask(() => {
                if (closed) return
                open = true
                options.onOpen()
            })
        },
        send: (data: Uint8Array) => {
            if (!open || closed) return false
            timeline.sent(label, data)
            if ((data[0] & 0xc0) !== 0x80 && policy().answer) {
                queueMicrotask(() => leg.deliver(PONG))
            }
            return true
        },
        close: () => {
            if (closed) return
            closed = true
            timeline.push(`close ${label}`)
        }
    }
}

async function flush(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve))
}

function createRelay(t: TestContext, level: LogLevel) {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
    const timeline = new Timeline()
    const hosts: Hosts = { policies: new Map(), pcs: [], raws: [] }
    let now = 0
    let received = 0
    const relay = new WaSctpRelay({
        crypto: nodeCrypto,
        logger: recordingLogger(timeline, level),
        now: () => now,
        rawUdpLegs: 'required',
        createPeerConnection: () => {
            const pc = new FakePeerConnection(hosts, timeline, hosts.pcs.length)
            hosts.pcs.push(pc)
            return Promise.resolve(pc as unknown as RTCPeerConnection)
        },
        createRawUdpLeg: (options) => createRawLeg(hosts, timeline, options),
        onConnected: () => timeline.push('event connected'),
        onLost: (reason) => timeline.push(`event lost ${reason}`),
        onRelayAnswered: (name, rttMs) => timeline.push(`event answered ${name} ${rttMs}`),
        onReceive: () => {
            received++
        }
    })
    const step = (name: string) => timeline.push(`== ${name} t=${now} received=${received}`)
    /** Moves time on in 10 ms ticks, running `each` every 100 ms. */
    const advance = async (ms: number, each?: () => void): Promise<void> => {
        for (let elapsed = 0; elapsed < ms; elapsed += 10) {
            now += 10
            t.mock.timers.tick(10)
            if (each && now % 100 === 0) each()
            await flush()
        }
    }
    const send = () => {
        if (!relay.sendMedia(MEDIA.slice().buffer)) timeline.push('sendMedia false')
    }
    return { relay, timeline, hosts, step, advance, send }
}

function endpoint(ip: string, id: number, overrides: Record<string, unknown> = {}) {
    return {
        ip,
        port: 3480,
        originalPort: 3478,
        token: `token-${id}`,
        authToken: `ufrag-${id}`,
        rawToken: new Uint8Array([id, 2, 3]),
        key: `key-${id}`,
        relayId: id,
        name: `relay-${id}`,
        authTokenId: String(id),
        ...overrides
    }
}

const W1 = '10.0.0.1'
const W2 = '10.0.0.2'
const W3 = '10.0.0.3'
const R1 = '10.0.0.4'
const R2 = '10.1.0.1'

async function runCallScenario(t: TestContext): Promise<string[]> {
    const { relay, timeline, hosts, step, advance, send } = createRelay(t, 'debug')
    hosts.policies.set(`${W2}:3480`, { open: true, answer: false })
    hosts.policies.set(`${W3}:3480`, { open: false, answer: false })
    hosts.policies.set(`${W3}:3478`, { open: false, answer: false })

    step('ssrcs')
    relay.setSsrc(0x11223344)
    relay.setSubscriptionSsrc(0x55667788)
    relay.setStreamSsrcs([0x11223344, 0], [0x55667788])
    relay.setParticipantIds(1, 2)

    step('offer')
    await relay.configureRelays([
        endpoint(W1, 1),
        endpoint(W2, 2),
        endpoint(W3, 3),
        endpoint(R1, 4, { transport: 'raw-udp' })
    ])
    await flush()

    step('ladder')
    await advance(3_500)

    step('accepted')
    send()
    relay.notePeerMedia(`${W1}:3480#1`)
    relay.setMediaFlowing()
    await advance(1_600, send)

    step('layers')
    relay.setSelfLayers([{ layer: 0, ssrcs: [0x11223344, 0x11223345] }])
    relay.setRxSubscriptions(new Uint8Array([0x12, 0x02, 0x10, 0x02]))
    relay.setParticipantIds(1, 3)
    await flush()

    step('inbound')
    const raw = hosts.raws[0]
    for (const data of [MEDIA, FRAMED_MEDIA, ALLOCATE_SUCCESS, ALLOCATE_ERROR, NOT_STUN, UNKNOWN]) {
        raw.deliver(data)
    }
    hosts.pcs[0].setIce('connected')
    await flush()

    step('reissue')
    await relay.configureRelays(
        [
            endpoint(R1, 4, { transport: 'raw-udp', token: 'next', rawToken: new Uint8Array([9]) }),
            endpoint(W1, 1, { key: 'key-next' }),
            endpoint(R2, 5, { transport: 'raw-udp' })
        ],
        { generation: 1 }
    )
    await flush()
    await advance(100)

    step('newest')
    send()
    send()
    relay.notePeerMedia(`${W2}:3478#2`)
    relay.notePeerMedia(`${R2}:3478#5`)
    await advance(5_100, () => {
        send()
        relay.notePeerMedia(`${R2}:3478#5`)
    })

    step('unresponsive')
    hosts.policies.set(`${R2}:3478`, { open: true, answer: false })
    await advance(5_000, () => {
        send()
        relay.notePeerMedia(`${R2}:3478#5`)
    })
    hosts.policies.set(`${R2}:3478`, { open: true, answer: true })
    await advance(1_100, () => {
        send()
        relay.notePeerMedia(`${R2}:3478#5`)
    })

    step('watchdog')
    await advance(10_500, send)

    step('ice')
    const webrtc = hosts.pcs.filter((pc) => !pc.closed)
    for (const pc of webrtc) pc.setIce('disconnected')
    await advance(4_100, send)

    step('loss')
    for (const leg of hosts.raws) leg.fail('raw_udp_no_return_path')
    send()
    await advance(20_000)

    step('rejoin')
    await relay.configureRelays([endpoint('10.2.0.1', 6, { transport: 'raw-udp' })], {
        generation: 2
    })
    await advance(1_000, send)

    step('cleanup')
    relay.cleanup()
    await advance(5_000)
    step('end')
    return timeline.lines
}

async function runTraceScenario(t: TestContext): Promise<string[]> {
    const { relay, timeline, hosts, step, advance, send } = createRelay(t, 'trace')

    step('offer')
    relay.setSsrc(0x11223344)
    await relay.configureRelays([endpoint(W1, 1), endpoint(R1, 4, { transport: 'raw-udp' })])
    await flush()
    await advance(600)

    step('inbound')
    const pc = hosts.pcs[0]
    const incoming: FakeChannel = {
        binaryType: 'blob',
        readyState: 'open',
        label: 'relay-in',
        id: 7,
        onopen: null,
        onclose: null,
        onmessage: null,
        onerror: null,
        send: () => undefined,
        close: () => undefined
    }
    pc.ondatachannel?.({ channel: incoming })
    incoming.onopen?.()
    incoming.onmessage?.({ data: MEDIA.slice().buffer })
    for (const data of [MEDIA, MEDIA, FRAMED_MEDIA, ALLOCATE_SUCCESS, ALLOCATE_ERROR, NOT_STUN]) {
        pc.deliver(data)
        hosts.raws[0].deliver(data)
    }
    hosts.raws[0].deliver(UNKNOWN)
    incoming.onclose?.()
    pc.setIce('connected')
    await flush()

    step('media')
    for (let i = 0; i < 12; i++) send()
    await advance(3_000)

    step('cleanup')
    relay.cleanup()
    step('end')
    return timeline.lines
}

test('a call over relay legs keeps its timeline of datagrams, logs and events', async (t) => {
    assert.deepEqual(await runCallScenario(t), CALL_TIMELINE)
})

test('with trace enabled the relay keeps its timeline of traces', async (t) => {
    assert.deepEqual(await runTraceScenario(t), TRACE_TIMELINE)
})
