import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import { createNoopLogger } from '../../logger.js'
import { nodeCrypto } from '../../node/crypto.js'
import { type RawUdpLegOptions, WaSctpRelay, type WaSctpRelayOptions } from '../WaSctpRelay.js'

/** A fake raw UDP leg: records every datagram, pongs every STUN message, and can be held or killed. */
interface FakeLeg {
    readonly ip: string
    readonly port: number
    readonly sent: Uint8Array[]
    closed: boolean
    release(): void
    fail(reason: string): void
    deliver(data: Uint8Array): void
}

const MEDIA = new Uint8Array([
    0x80, 0x78, 0x00, 0x2a, 0x00, 0x00, 0x03, 0xc0, 0x11, 0x22, 0x33, 0x44, 0xaa, 0xbb, 0xcc, 0xdd
])
const PONG = new Uint8Array([0x08, 0x02, 0x00, 0x00, 0x21, 0x12, 0xa4, 0x42, ...new Uint8Array(12)])
const WA_PING = 0x0801
const STUN_ALLOCATE = 0x0003
const ATTR_RELAY_CREDENTIAL = 0x4000

/** The port every `<te2>` advertises, which raw legs dial. */
const ADVERTISED_PORT = 3478

function isMedia(datagram: Uint8Array): boolean {
    return (datagram[0] & 0xc0) === 0x80
}

function typeOf(datagram: Uint8Array): number {
    return (datagram[0] << 8) | datagram[1]
}

function readStunAttribute(packet: Uint8Array, wanted: number): Uint8Array | null {
    const end = 20 + ((packet[2] << 8) | packet[3])
    for (let at = 20; at + 4 <= end; ) {
        const type = (packet[at] << 8) | packet[at + 1]
        const length = (packet[at + 2] << 8) | packet[at + 3]
        if (type === wanted) return packet.subarray(at + 4, at + 4 + length)
        at += 4 + length + ((4 - (length % 4)) % 4)
    }
    return null
}

interface Harness {
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

interface HarnessOptions {
    readonly held?: readonly string[]
    readonly rawUdpLegs?: WaSctpRelayOptions['rawUdpLegs']
    readonly createPeerConnection?: WaSctpRelayOptions['createPeerConnection']
}

function createHarness(t: TestContext, options: HarnessOptions = {}): Harness {
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

function createFakeLeg(options: RawUdpLegOptions, legs: FakeLeg[], held: Set<string>) {
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

interface EndpointOverrides {
    readonly token?: string
    readonly rawToken?: Uint8Array
    readonly transport?: 'raw-udp'
    readonly relayId?: number
}

function endpoint(ip: string, overrides: EndpointOverrides = {}) {
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
function idOf(ip: string): string {
    return ip.includes(':') ? `[${ip}]:${ADVERTISED_PORT}` : `${ip}:${ADVERTISED_PORT}`
}

async function flush(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve))
}

const OFFER = ['10.0.0.1', '10.0.0.2'] as const
const REISSUE = ['10.1.0.1', '2001:db8::1'] as const

/** The offer's two relays (generation 0), open and answering. */
async function dialOffer(harness: Harness): Promise<void> {
    harness.relay.setSsrc(0x11223344)
    await harness.relay.configureRelays(OFFER.map((ip, i) => endpoint(ip, { relayId: i + 1 })))
    await flush()
    assert.equal(harness.relay.getConnectedCount(), 2, 'the offer legs opened')
}

async function dialReissue(harness: Harness, generation = 1): Promise<void> {
    await harness.relay.configureRelays(
        REISSUE.map((ip) => endpoint(ip, { transport: 'raw-udp' })),
        { generation }
    )
    await flush()
}

test('a newer generation is dialled while the legs of the older one are open', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)

    await dialReissue(harness)

    for (const ip of REISSUE) assert.equal(harness.legsTo(ip).length, 1, `${ip} was dialled`)
    assert.equal(harness.relay.getConnectedCount(), 4)
    assert.deepEqual(harness.lost, [])
})

test('media moves to the newest generation and the older legs stay up without it', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])

    await dialReissue(harness)
    for (let i = 0; i < 3; i++) assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])

    for (const ip of OFFER) harness.leg(ip).sent.length = 0
    harness.relay.setMediaFlowing()
    harness.relay.resendSubscriptions()
    for (const ip of OFFER) {
        const types = harness.leg(ip).sent.map(typeOf)
        assert.ok(types.includes(WA_PING), `${ip} keeps its keepalive`)
        assert.ok(types.includes(STUN_ALLOCATE), `${ip} keeps its registration`)
        assert.equal(harness.leg(ip).sent.filter(isMedia).length, 0, `${ip} got no media`)
    }
})

test('media stays on an older leg while the newest generation dials, then moves', async (t) => {
    const harness = createHarness(t, { held: [...REISSUE] })
    await dialOffer(harness)
    await dialReissue(harness)

    assert.equal(harness.sendMediaVia()?.ip, OFFER[0], 'no gap while the new legs dial')
    harness.leg(REISSUE[1]).release()
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[1], 'the first newest leg to open takes it')
    harness.leg(REISSUE[0]).release()
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[1], 'and keeps it')
    assert.deepEqual(harness.warnings, [], 'dialling is not a degraded path')
})

test('peer media on an older leg does not pull the media back within the hold', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])

    harness.setNow(300)
    harness.relay.notePeerMedia(idOf(OFFER[0]))
    harness.relay.notePeerMedia(idOf(OFFER[1]))

    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], 'the newest generation keeps the send')
})

test('once the newest generation hears the peer, older legs are gone and cannot pull back', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    harness.relay.notePeerMedia(idOf(REISSUE[0]))

    harness.setNow(5_000)
    harness.relay.notePeerMedia(idOf(OFFER[0]))

    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
    for (const ip of OFFER) assert.equal(harness.legsTo(ip)[0].closed, true, `${ip} retired`)
})

test('peer media on a newest leg takes the media off an older leg at once', async (t) => {
    const harness = createHarness(t, { held: [...REISSUE] })
    await dialOffer(harness)
    harness.relay.notePeerMedia(idOf(OFFER[0]))
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])

    await dialReissue(harness)
    for (const ip of REISSUE) harness.leg(ip).release()
    harness.setNow(50)
    harness.relay.notePeerMedia(idOf(REISSUE[1]))

    assert.equal(
        harness.sendMediaVia()?.ip,
        REISSUE[1],
        'the leg that hears the peer, not the hold'
    )
})

test('within the newest generation the peer is followed after the 400 ms hold', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    harness.relay.notePeerMedia(idOf(REISSUE[0]))
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])

    harness.setNow(300)
    harness.relay.notePeerMedia(idOf(REISSUE[1]))
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], 'held while the leg heard the peer')

    harness.setNow(500)
    harness.relay.notePeerMedia(idOf(REISSUE[1]))
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[1])
})

test('with every newest leg gone, media falls back to an older leg and says so once', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])

    for (const ip of REISSUE) harness.leg(ip).fail('raw_udp_no_return_path')
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])

    const fallbacks = harness.warnings.filter((message) => message.includes('falls back'))
    assert.equal(fallbacks.length, 1, 'one warning for the transition, none per packet')
    assert.deepEqual(harness.lost, [])

    harness.relay.notePeerMedia(idOf(OFFER[1]))
    assert.equal(harness.sendMediaVia()?.ip, OFFER[1], 'the fallback follows the peer as 1:1 does')
})

test('redialling the newest generation takes the media back from the fallback', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    for (const ip of REISSUE) harness.leg(ip).fail('raw_udp_no_return_path')
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])

    await dialReissue(harness)

    assert.equal(harness.legsTo(REISSUE[0]).length, 2, 'redialled under the same generation')
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
})

test('a batch of an older generation is ignored', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness, 2)

    await harness.relay.configureRelays([endpoint('10.9.0.1')], { generation: 1 })
    await flush()

    assert.equal(harness.legsTo('10.9.0.1').length, 0)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
})

test('relays of an older generation are not redialled once a newer one is configured', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    harness.leg(OFFER[1]).fail('raw_udp_no_return_path')

    await dialReissue(harness)
    await dialReissue(harness)

    assert.equal(harness.legsTo(OFFER[1]).length, 1, 'the dead offer leg stayed dead')
    for (const ip of REISSUE) assert.equal(harness.legsTo(ip).length, 1, `${ip} dialled once`)
})

test('a batch with no generation keeps the current one and dials only relays with no leg', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)

    await harness.relay.configureRelays([
        ...REISSUE.map((ip) => endpoint(ip, { transport: 'raw-udp' })),
        endpoint('10.1.0.2', { transport: 'raw-udp' })
    ])
    await flush()

    for (const ip of REISSUE) assert.equal(harness.legsTo(ip).length, 1, `${ip} not redialled`)
    assert.equal(harness.legsTo('10.1.0.2').length, 1)
    harness.leg(REISSUE[0]).fail('raw_udp_no_return_path')
    harness.leg(REISSUE[1]).fail('raw_udp_no_return_path')
    assert.equal(
        harness.sendMediaVia()?.ip,
        '10.1.0.2',
        'the added relay is of the newest generation'
    )
})

test('an address re-issued with the same credentials keeps its leg in the new generation', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])

    await harness.relay.configureRelays(
        [endpoint(OFFER[1], { relayId: 2 }), endpoint(REISSUE[0])],
        {
            generation: 1
        }
    )
    await flush()

    assert.equal(harness.legsTo(OFFER[1]).length, 1, 'not redialled')
    assert.equal(harness.sendMediaVia()?.ip, OFFER[1], 'it is a leg of the newest generation now')
})

test('an address re-issued with new credentials is re-registered on the same raw socket', async (t) => {
    const harness = createHarness(t)
    harness.relay.setSsrc(0x11223344)
    await harness.relay.configureRelays([endpoint(OFFER[0], { token: 'old' })])
    await flush()
    const [leg] = harness.legsTo(OFFER[0])
    leg.sent.length = 0

    const fresh = new Uint8Array([9, 8, 7, 6])
    await harness.relay.configureRelays(
        [endpoint(OFFER[0], { token: 'new', rawToken: fresh, transport: 'raw-udp' })],
        { generation: 1 }
    )
    await flush()

    assert.deepEqual(harness.legsTo(OFFER[0]), [leg], 'no new socket for the same address')
    assert.equal(leg.closed, false)
    const allocate = leg.sent.find((datagram) => typeOf(datagram) === STUN_ALLOCATE)
    assert.ok(allocate, 'the leg registered again at once')
    assert.deepEqual(readStunAttribute(allocate, ATTR_RELAY_CREDENTIAL), fresh)
    assert.deepEqual(harness.lost, [])
    assert.equal(harness.relay.getConnectedCount(), 1)
    assert.equal(harness.sendMediaVia(), leg, 'the leg is of the newest generation')
})

test('with raw udp legs only where required, the other relays stay on WebRTC', async (t) => {
    let webrtcDials = 0
    const harness = createHarness(t, {
        rawUdpLegs: 'required',
        createPeerConnection: () => {
            webrtcDials++
            return Promise.reject(new Error('no WebRTC here'))
        }
    })

    await harness.relay.configureRelays([
        { ...endpoint(OFFER[0]), originalPort: 3480 },
        endpoint(REISSUE[0], { transport: 'raw-udp' })
    ])
    await flush()

    assert.deepEqual(
        harness.legs.map((leg) => [leg.ip, leg.port]),
        [[REISSUE[0], ADVERTISED_PORT]],
        'only the relay that requires it rides raw udp, on its advertised port'
    )
    assert.equal(webrtcDials, 1, 'the offer relay went to WebRTC')
})

test('by default a host with raw udp legs dials every relay over raw udp', async (t) => {
    const harness = createHarness(t)

    await harness.relay.configureRelays([
        endpoint(OFFER[0]),
        endpoint(REISSUE[0], { transport: 'raw-udp' })
    ])
    await flush()

    assert.deepEqual(
        harness.legs.map((leg) => [leg.ip, leg.port]),
        [
            [OFFER[0], ADVERTISED_PORT],
            [REISSUE[0], ADVERTISED_PORT]
        ]
    )
})

test('a relay that requires raw udp is skipped by a host without it, in one warning', async (t) => {
    let webrtcDials = 0
    const warnings: string[] = []
    const logger = createNoopLogger()
    logger.warn = (message) => {
        warnings.push(message)
    }
    const relay = new WaSctpRelay({
        crypto: nodeCrypto,
        logger,
        createPeerConnection: () => {
            webrtcDials++
            return Promise.reject(new Error('no WebRTC here'))
        }
    })
    t.after(() => relay.cleanup())

    await relay.configureRelays(
        [
            { ...endpoint(OFFER[0]), originalPort: 3480 },
            endpoint(REISSUE[0], { transport: 'raw-udp' }),
            endpoint(REISSUE[1], { transport: 'raw-udp' })
        ],
        { generation: 1 }
    )

    assert.equal(webrtcDials, 1, 'only the relay that needs no raw udp was dialled')
    assert.equal(
        warnings.filter((message) => message.includes('need raw udp')).length,
        1,
        'the skipped relays are reported together'
    )
})

/** A WARP frame around the media packet, 8-byte header. */
const FRAMED_MEDIA = new Uint8Array([0x09, 0x02, 0x01, 0x93, 0x01, 0x00, 0x01, 0x93, ...MEDIA])

test('a warp-framed datagram reaches the owner untouched and is traced as a frame', async (t) => {
    const received: Array<[Uint8Array, string]> = []
    const traces: string[] = []
    const answered: string[] = []
    const logger = createNoopLogger()
    logger.trace = (message) => {
        traces.push(message)
    }
    logger.child = () => logger
    const legs: FakeLeg[] = []
    const relay = new WaSctpRelay({
        crypto: nodeCrypto,
        logger,
        createPeerConnection: () => Promise.reject(new Error('this test dials no WebRTC leg')),
        createRawUdpLeg: (options) => createFakeLeg(options, legs, new Set([OFFER[0]])),
        onReceive: (data, connectionId) => received.push([data, connectionId]),
        onRelayAnswered: (name) => answered.push(name)
    })
    t.after(() => relay.cleanup())
    await relay.configureRelays([endpoint(OFFER[0])])
    legs[0].release()

    legs[0].deliver(FRAMED_MEDIA)

    assert.deepEqual(received, [[FRAMED_MEDIA, idOf(OFFER[0])]])
    assert.deepEqual(answered, [OFFER[0]], 'a frame is the relay answering')
    assert.ok(traces.includes('warp frame received'))
    assert.ok(!traces.includes('stun response received'))
    assert.ok(!traces.includes('unparseable stun-like packet'))
})

/** A STUN allocate success response: class success, method allocate, no attributes. */
const ALLOCATE_SUCCESS = new Uint8Array([
    0x01,
    0x03,
    0x00,
    0x00,
    0x21,
    0x12,
    0xa4,
    0x42,
    ...new Uint8Array(12)
])

const RETIRED = 'retired by a newer relay generation'

test('authenticated peer media on a newest leg retires every older leg for good', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    const older = OFFER.map((ip) => harness.leg(ip))

    harness.relay.notePeerMedia(idOf(REISSUE[0]))

    assert.deepEqual(
        older.map((leg) => leg.closed),
        [true, true]
    )
    assert.deepEqual(harness.infos, [RETIRED, RETIRED], 'one line per retired leg')
    assert.equal(harness.relay.getConnectedCount(), 2, 'the retired legs gave their count back')
    assert.deepEqual(harness.lost, [])

    for (const leg of older) leg.sent.length = 0
    harness.relay.setMediaFlowing()
    harness.relay.resendSubscriptions()
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
    assert.deepEqual(
        older.map((leg) => leg.sent.length),
        [0, 0],
        'no keepalive, registration or media reaches a retired leg'
    )
})

test('a newest generation that answers the allocate but hears no media retires nothing, and the peer is followed back', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    for (const ip of REISSUE) harness.leg(ip).deliver(ALLOCATE_SUCCESS)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], 'the newest generation is tried first')

    harness.setNow(399)
    harness.relay.notePeerMedia(idOf(OFFER[1]))
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], 'not before the hold')

    harness.setNow(400)
    harness.relay.notePeerMedia(idOf(OFFER[1]))
    assert.equal(harness.sendMediaVia()?.ip, OFFER[1], 'the leg that hears the peer')
    assert.equal(harness.sendMediaVia()?.ip, OFFER[1], 'and keeps it while it hears')
    assert.deepEqual(harness.infos, [], 'nothing retired on an allocate answer')
    for (const ip of OFFER) assert.equal(harness.leg(ip).closed, false)
})

test('peer media arriving later on the newest generation takes the send, older legs retire once quiet', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
    harness.setNow(500)
    harness.relay.notePeerMedia(idOf(OFFER[0]))
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])

    harness.setNow(2_000)
    harness.relay.notePeerMedia(idOf(REISSUE[1]))

    assert.equal(harness.sendMediaVia()?.ip, REISSUE[1])
    assert.equal(harness.legsTo(OFFER[1])[0].closed, true, 'the leg that never heard the peer')
    assert.equal(harness.legsTo(OFFER[0])[0].closed, false, 'heard the peer 1.5 s ago')

    harness.setNow(5_500)
    harness.sendMediaVia()
    assert.equal(harness.legsTo(OFFER[0])[0].closed, true, 'retired once quiet for 5 s')
    assert.deepEqual(harness.infos, [RETIRED, RETIRED])
})

/** The P3 shape: one sender still delivered by an older relay while the newest delivers another. */
test('an older leg still hearing another sender outlives the proof of the newest generation', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    harness.relay.notePeerMedia(idOf(OFFER[1]))

    harness.setNow(100)
    harness.relay.notePeerMedia(idOf(REISSUE[0]))

    assert.equal(harness.legsTo(OFFER[0])[0].closed, true, 'never heard anyone: retired')
    assert.equal(harness.legsTo(OFFER[1])[0].closed, false, 'still delivering a sender: kept')
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], 'the send stays on the newest generation')
})

test('an older leg that keeps hearing its sender is kept receive-only for as long as it hears', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    harness.relay.notePeerMedia(idOf(OFFER[1]))
    harness.relay.notePeerMedia(idOf(REISSUE[0]))
    const kept = harness.legsTo(OFFER[1])[0]

    for (let ms = 0; ms <= 20_000; ms += 100) {
        harness.setNow(ms)
        harness.relay.notePeerMedia(idOf(OFFER[1]))
        assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], `the send stays newest at ${ms} ms`)
    }
    assert.equal(kept.closed, false)

    harness.setNow(25_100)
    harness.relay.notePeerMedia(idOf(REISSUE[0]))
    assert.equal(kept.closed, true, 'quiet for 5 s, then retired')
})

test('an older leg that stops hearing the peer gives the send back to the newest generation', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
    harness.setNow(500)
    harness.relay.notePeerMedia(idOf(OFFER[0]))
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])

    harness.setNow(900)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], 'the newest generation stays preferred')
})

test('an offer relay outside the conference never pulls the send off the re-issued one', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])

    harness.setNow(10_000)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], 'silence on every leg moves nothing')
    harness.relay.notePeerMedia(idOf(REISSUE[1]))
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[1])
    for (const ip of OFFER) assert.equal(harness.legsTo(ip)[0].closed, true, `${ip} retired`)
})

test('losing the newest generation while an older leg hears the peer does not lose the call', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    for (const ip of REISSUE) harness.leg(ip).deliver(ALLOCATE_SUCCESS)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
    harness.setNow(500)
    harness.relay.notePeerMedia(idOf(OFFER[0]))

    for (const ip of REISSUE) harness.leg(ip).fail('raw_udp_no_return_path')

    assert.deepEqual(harness.lost, [], 'the older generation still carries the call')
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])
})

test('pongs on the newest legs and peer media on an older one retire nothing', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    harness.relay.setMediaFlowing()
    await flush()

    harness.relay.notePeerMedia(idOf(OFFER[0]))
    harness.leg(OFFER[1]).deliver(ALLOCATE_SUCCESS)

    for (const ip of OFFER) assert.equal(harness.leg(ip).closed, false, `${ip} kept`)
    assert.deepEqual(harness.infos, [])
})

test('an older leg still dialling when the newest generation proves itself is cancelled', async (t) => {
    const harness = createHarness(t, { held: [OFFER[1]] })
    harness.relay.setSsrc(0x11223344)
    await harness.relay.configureRelays(OFFER.map((ip, i) => endpoint(ip, { relayId: i + 1 })))
    await flush()
    await dialReissue(harness)

    harness.relay.notePeerMedia(idOf(REISSUE[0]))
    const dialling = harness.legsTo(OFFER[1])[0]
    assert.equal(dialling.closed, true, 'the dial was abandoned')

    dialling.release()
    assert.equal(
        harness.relay.getConnectedCount(),
        2,
        'a late open of the cancelled leg counts nothing'
    )
    assert.deepEqual(harness.lost, [])
})

test('a WebRTC leg still negotiating when the newest generation proves itself is cancelled', async (t) => {
    let resolveFactory: (pc: RTCPeerConnection) => void = () => {}
    let lateClosed = false
    const harness = createHarness(t, {
        rawUdpLegs: 'required',
        createPeerConnection: () =>
            new Promise<RTCPeerConnection>((resolve) => {
                resolveFactory = resolve
            })
    })
    harness.relay.setSsrc(0x11223344)
    const offerDial = harness.relay.configureRelays([{ ...endpoint(OFFER[0]), originalPort: 3480 }])
    await dialReissue(harness)

    harness.relay.notePeerMedia(idOf(REISSUE[0]))

    await offerDial
    resolveFactory({
        close: () => {
            lateClosed = true
        }
    } as unknown as RTCPeerConnection)
    await flush()
    assert.equal(lateClosed, true, 'the peer connection resolved after the cancel is closed')
    assert.deepEqual(harness.infos, [RETIRED])
})

test('with the newest legs lost after the retirement, no older relay is redialled', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    harness.relay.notePeerMedia(idOf(REISSUE[0]))

    for (const ip of REISSUE) harness.leg(ip).fail('raw_udp_no_return_path')

    assert.equal(harness.sendMediaVia(), null, 'nothing reopens the offer relays')
    assert.deepEqual(harness.lost, ['raw_udp_no_return_path'])
    assert.equal(
        harness.warnings.filter((message) => message.includes('falls back')).length,
        0,
        'no fallback is announced once the older legs are gone'
    )

    await harness.relay.configureRelays(
        OFFER.map((ip) => endpoint(ip)),
        { generation: 0 }
    )
    await dialReissue(harness)

    for (const ip of OFFER) assert.equal(harness.legsTo(ip).length, 1, `${ip} never redialled`)
    for (const ip of REISSUE) assert.equal(harness.legsTo(ip).length, 2, `${ip} redialled`)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
})

test('a call with a single generation never retires a leg', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)

    harness.relay.notePeerMedia(idOf(OFFER[0]))
    harness.leg(OFFER[1]).deliver(ALLOCATE_SUCCESS)
    harness.leg(OFFER[0]).deliver(ALLOCATE_SUCCESS)

    for (const ip of OFFER) assert.equal(harness.leg(ip).closed, false, `${ip} kept`)
    assert.equal(harness.relay.getConnectedCount(), 2)
    assert.deepEqual(harness.infos, [])
})

function debugContexts(harness: Harness, message: string) {
    return harness.debugs.filter(([logged]) => logged === message).map(([, context]) => context)
}

/** A relay that answers pings and never the allocate: the leg is answered, nothing is proved. */
test('a leg answered only by pongs says so, retires nothing, and its loss falls back', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)

    const answered = debugContexts(harness, 'relay leg answered').filter(
        (context) => context?.connectionId === idOf(REISSUE[0])
    )
    assert.match(String(answered[0]?.firstPacket), /wa-pong/)
    assert.deepEqual(harness.infos, [], 'a pong is no proof of the newest relays')

    for (const ip of REISSUE) harness.leg(ip).fail('raw_udp_no_return_path')
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0], 'the unretired offer leg takes the media')
    assert.ok(harness.warnings.some((message) => message.includes('falls back')))
})

test('the allocate layout is logged per leg when it changes, as attribute types and lengths', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    harness.relay.resendSubscriptions()
    harness.relay.resendSubscriptions()

    const layoutsOf = (ip: string) =>
        debugContexts(harness, 'relay allocate layout')
            .filter((context) => context?.connectionId === idOf(ip))
            .map((context) => String(context?.attributes))
    const v4 = layoutsOf(REISSUE[0])
    const v6 = layoutsOf(REISSUE[1])
    assert.equal(v4.length, 1, 'repeats of the same allocate are not logged again')
    assert.match(v4[0], /^RELAY-CREDENTIAL:3,0x4024:\d+,0x0016:8,MESSAGE-INTEGRITY:20$/)
    assert.match(v6[0], /,0x0016:20,/)

    harness.relay.setSelfLayers([{ layer: 0, ssrcs: [0x11223344, 0x11223345] }])
    assert.equal(layoutsOf(REISSUE[0]).length, 2, 'a new descriptor is a new layout')
    assert.match(layoutsOf(REISSUE[0])[1], /^RELAY-CREDENTIAL:3,0x4024:\d+,/)
})

/** A re-issue that keeps the address and changes only the token (the same `token_id` flip). */
test('a newer generation that changes only the token re-allocates on the same socket', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const harness = createHarness(t, { rawUdpLegs: 'required' })
    harness.relay.setSsrc(0x11223344)
    const reissued = (rawToken: Uint8Array, token: string) => ({
        ...endpoint(REISSUE[0], { transport: 'raw-udp', rawToken, token }),
        authTokenId: '0'
    })
    const first = new Uint8Array(194).fill(0x13)
    const second = new Uint8Array(187).fill(0x14)
    await harness.relay.configureRelays([reissued(first, 'tid-13')], { generation: 1 })
    await flush()
    const [leg] = harness.legsTo(REISSUE[0])
    harness.relay.notePeerMedia(idOf(REISSUE[0]))
    leg.sent.length = 0

    await harness.relay.configureRelays([reissued(second, 'tid-14')], { generation: 2 })
    await flush()
    t.mock.timers.tick(3_000)
    harness.relay.resendSubscriptions()

    assert.deepEqual(harness.legsTo(REISSUE[0]), [leg], 'the 5-tuple is kept')
    const credentials = leg.sent
        .filter((datagram) => typeOf(datagram) === STUN_ALLOCATE)
        .map((allocate) => readStunAttribute(allocate, ATTR_RELAY_CREDENTIAL))
    assert.ok(credentials.length >= 2, 'the reissue and its replays went out')
    for (const credential of credentials) {
        assert.deepEqual(credential, second, 'no allocate carries the old token after the reissue')
    }
    assert.deepEqual(harness.lost, [])
    assert.equal(harness.sendMediaVia(), leg)
})

test('a change of address still opens a new socket', async (t) => {
    const harness = createHarness(t)
    harness.relay.setSsrc(0x11223344)
    await harness.relay.configureRelays([endpoint(OFFER[0])])
    await flush()

    await harness.relay.configureRelays([endpoint(REISSUE[0], { token: 'new' })], {
        generation: 1
    })
    await flush()

    assert.equal(harness.legsTo(REISSUE[0]).length, 1)
    assert.equal(harness.legsTo(OFFER[0])[0].closed, false, 'the older leg waits for retirement')
})

/** A peer connection whose data channel opens on demand and records what goes through it. */
class FakePeerConnection {
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

async function dialWebRtcLeg(t: TestContext) {
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

function allocateCredentials(pc: FakePeerConnection): Uint8Array[] {
    return pc.channelSent
        .filter((datagram) => typeOf(datagram) === STUN_ALLOCATE)
        .map((allocate) => readStunAttribute(allocate, ATTR_RELAY_CREDENTIAL) ?? new Uint8Array())
}

test('a WebRTC leg whose ICE credentials stay re-allocates over its data channel', async (t) => {
    const { relay, dialled, descriptor } = await dialWebRtcLeg(t)
    const fresh = new Uint8Array(187).fill(0x14)
    dialled[0].channelSent.length = 0
    assert.equal(relay.sendMedia(MEDIA.slice().buffer), true)

    await relay.configureRelays([descriptor('ufrag-13', fresh)], { generation: 2 })
    assert.equal(relay.sendMedia(MEDIA.slice().buffer), true, 'no gap in the send')
    await flush()
    t.mock.timers.tick(3_000)

    assert.equal(dialled[0].channelSent.filter(isMedia).length, 2, 'both on the same channel')

    assert.equal(dialled.length, 1, 'no new peer connection')
    assert.equal(dialled[0].closed, false)
    const credentials = allocateCredentials(dialled[0])
    assert.ok(credentials.length >= 2, 'the reissue and its replays went out on the channel')
    for (const credential of credentials) assert.deepEqual(credential, fresh)
})

test('a WebRTC leg whose auth token rotates keeps its connection and re-allocates', async (t) => {
    const { relay, dialled, descriptor, warnings, infos } = await dialWebRtcLeg(t)
    const fresh = new Uint8Array(187).fill(0x14)
    dialled[0].channelSent.length = 0
    assert.equal(relay.sendMedia(MEDIA.slice().buffer), true)

    await relay.configureRelays([descriptor('ufrag-14', fresh)], { generation: 2 })
    assert.equal(relay.sendMedia(MEDIA.slice().buffer), true, 'no gap in the send')
    await flush()
    t.mock.timers.tick(3_000)

    assert.equal(dialled.length, 1, 'the peer connection is kept')
    assert.equal(dialled[0].closed, false)
    assert.equal(dialled[0].channelSent.filter(isMedia).length, 2, 'both on the same channel')
    const credentials = allocateCredentials(dialled[0])
    assert.ok(credentials.length >= 2, 'the reissue and its replays went out on the channel')
    for (const credential of credentials) assert.deepEqual(credential, fresh)
    assert.deepEqual(warnings, [])

    const [message, context] = infos[0] ?? []
    assert.equal(message, 'relay ice credential rotated, kept the connection')
    assert.match(String(context?.from), /^[0-9a-f]{8}$/)
    assert.match(String(context?.to), /^[0-9a-f]{8}$/)
    assert.notEqual(context?.from, context?.to)
    assert.ok(!JSON.stringify(context).includes('ufrag-1'), 'never the credential itself')
})

test('a WebRTC leg whose relay key changes is redialled with a warning', async (t) => {
    const { relay, dialled, descriptor, warnings } = await dialWebRtcLeg(t)

    await relay.configureRelays(
        [descriptor('ufrag-13', new Uint8Array(187).fill(0x14), { key: 'other-key' })],
        { generation: 2 }
    )
    await flush()

    assert.equal(dialled.length, 2, 'a new peer connection for the new key')
    assert.equal(dialled[0].closed, true)
    assert.deepEqual(warnings, ['relay ice credentials changed at the same address, redialling'])
})

test('a WebRTC leg whose auth token id changes at the same address is redialled with a warning', async (t) => {
    const { relay, dialled, descriptor, warnings } = await dialWebRtcLeg(t)

    await relay.configureRelays(
        [descriptor('ufrag-14', new Uint8Array(187).fill(0x14), { authTokenId: '1' })],
        { generation: 2 }
    )
    await flush()

    assert.equal(dialled.length, 2)
    assert.equal(dialled[0].closed, true, 'the old connection is not left behind')
    assert.deepEqual(warnings, ['relay ice credentials changed at the same address, redialling'])
})

test('a raw leg whose auth token id changes at the same address keeps its socket', async (t) => {
    const harness = createHarness(t)
    harness.relay.setSsrc(0x11223344)
    await harness.relay.configureRelays([{ ...endpoint(REISSUE[0]), authTokenId: '0' }])
    await flush()
    const [leg] = harness.legsTo(REISSUE[0])

    await harness.relay.configureRelays(
        [{ ...endpoint(REISSUE[0], { token: 'next' }), authTokenId: '1' }],
        { generation: 1 }
    )
    await flush()

    assert.deepEqual(harness.legsTo(REISSUE[0]), [leg])
    assert.equal(leg.closed, false)
    assert.equal(harness.sendMediaVia(), leg)
})

test('a rebind keeps the leg elected for media, with no gap in the send', async (t) => {
    const harness = createHarness(t)
    harness.relay.setSsrc(0x11223344)
    await harness.relay.configureRelays(OFFER.map((ip, i) => endpoint(ip, { relayId: i + 1 })))
    await flush()
    harness.relay.notePeerMedia(idOf(OFFER[1]))
    const elected = harness.sendMediaVia()
    assert.equal(elected?.ip, OFFER[1])
    const electionsBefore = debugContexts(harness, 'sctp media leg elected').length

    const rebinding = harness.relay.configureRelays(
        OFFER.map((ip, i) =>
            endpoint(ip, { relayId: i + 1, token: 'next', rawToken: new Uint8Array([7, 7, 7]) })
        ),
        { generation: 1 }
    )
    assert.equal(harness.sendMediaVia(), elected, 'during the rebind')
    await rebinding
    await flush()
    assert.equal(harness.sendMediaVia(), elected, 'after the rebind')

    assert.equal(harness.legs.length, 2, 'no leg was redialled')
    assert.equal(debugContexts(harness, 'sctp media leg elected').length, electionsBefore)
    assert.deepEqual(harness.infos, [], 'a rebound leg is not retired')
})

test('a WebRTC leg carries the rx subscriptions in its allocate, and re-announces a change', async (t) => {
    const { relay, dialled } = await dialWebRtcLeg(t)
    dialled[0].channelSent.length = 0

    relay.setRxSubscriptions(new Uint8Array([0x12, 0x02, 0x10, 0x02]))

    const allocates = dialled[0].channelSent.filter(
        (datagram) => typeOf(datagram) === STUN_ALLOCATE
    )
    assert.equal(allocates.length, 1, 'announced at once')
    assert.deepEqual(
        readStunAttribute(allocates[0], 0x4021),
        new Uint8Array([0x12, 0x02, 0x10, 0x02])
    )
})

const WEBRTC_LEG_ID = `${REISSUE[0]}:3478#0`

/** Sends one media packet at `ms` and reports whether it went out. */
function sendAt(harness: Awaited<ReturnType<typeof dialWebRtcLeg>>, ms: number): boolean {
    harness.setNow(ms)
    return harness.relay.sendMedia(MEDIA.slice().buffer)
}

function stallWarnings(warnings: readonly string[]): string[] {
    return warnings.filter((message) => message.startsWith('relay downlink stalled'))
}

test('an accepted call with no downlink re-allocates its WebRTC legs after 5 s', async (t) => {
    const harness = await dialWebRtcLeg(t)
    harness.relay.setMediaFlowing()
    assert.equal(sendAt(harness, 0), true)
    harness.dialled[0].channelSent.length = 0

    sendAt(harness, 4_999)
    assert.deepEqual(allocateCredentials(harness.dialled[0]), [], 'not before 5 s')

    sendAt(harness, 5_000)
    assert.equal(allocateCredentials(harness.dialled[0]).length, 1, 're-allocated at once')
    assert.equal(harness.dialled.length, 1, 'on the same connection')
    assert.deepEqual(stallWarnings(harness.warnings), ['relay downlink stalled, re-allocating'])
})

test('still no downlink 5 s after the re-allocate, the WebRTC legs are redialled', async (t) => {
    const harness = await dialWebRtcLeg(t)
    harness.relay.setMediaFlowing()
    sendAt(harness, 0)
    sendAt(harness, 5_000)

    sendAt(harness, 9_999)
    assert.equal(harness.dialled.length, 1)
    sendAt(harness, 10_000)
    await flush()

    assert.equal(harness.dialled.length, 2, 'a new peer connection')
    assert.equal(harness.dialled[0].closed, true)
    assert.deepEqual(stallWarnings(harness.warnings), [
        'relay downlink stalled, re-allocating',
        'relay downlink stalled, redialling'
    ])
    harness.dialled[1].openChannel()
    assert.equal(sendAt(harness, 10_100), true, 'media resumes on the redialled leg')
    assert.equal(harness.dialled[1].channelSent.filter(isMedia).length, 1)
})

test('redials back off and stop at the limit of the call', async (t) => {
    const harness = await dialWebRtcLeg(t)
    harness.relay.setMediaFlowing()
    sendAt(harness, 0)

    const redialAt: number[] = []
    for (let ms = 100; ms <= 200_000; ms += 100) {
        const before = harness.dialled.length
        sendAt(harness, ms)
        if (harness.dialled.length > before) {
            redialAt.push(ms)
            await flush()
            harness.dialled[harness.dialled.length - 1].openChannel()
        }
    }

    assert.deepEqual(redialAt, [10_000, 25_000, 50_000], '10 s, then 5 + 10 s, then 5 + 20 s')
})

test('authenticated peer media on a leg cancels the watchdog', async (t) => {
    const harness = await dialWebRtcLeg(t)
    harness.relay.setMediaFlowing()
    sendAt(harness, 0)
    sendAt(harness, 4_000)
    harness.relay.notePeerMedia(WEBRTC_LEG_ID)

    for (let ms = 4_100; ms < 8_000; ms += 100) sendAt(harness, ms)

    assert.deepEqual(stallWarnings(harness.warnings), [], 'the stall restarted with the peer')
})

test('a peer heard only through its RTCP once a second keeps the watchdog quiet', async (t) => {
    const harness = await dialWebRtcLeg(t)
    harness.relay.setMediaFlowing()
    for (let ms = 0; ms <= 60_000; ms += 100) {
        if (ms % 1_000 === 0) harness.relay.notePeerMedia(WEBRTC_LEG_ID)
        sendAt(harness, ms)
    }

    assert.deepEqual(stallWarnings(harness.warnings), [])
    assert.equal(harness.dialled.length, 1)
})

test('before the call is accepted nothing is watched', async (t) => {
    const harness = await dialWebRtcLeg(t)
    for (let ms = 0; ms <= 30_000; ms += 100) sendAt(harness, ms)

    assert.deepEqual(stallWarnings(harness.warnings), [])
    assert.equal(harness.dialled.length, 1)
})

test('raw legs are left to their own return-path policy', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    harness.relay.setMediaFlowing()
    for (let ms = 0; ms <= 30_000; ms += 100) {
        harness.setNow(ms)
        harness.relay.sendMedia(MEDIA.slice().buffer)
    }

    assert.deepEqual(stallWarnings(harness.warnings), [])
    for (const ip of OFFER) assert.equal(harness.legsTo(ip).length, 1, `${ip} not redialled`)
})
