import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { nodeCrypto } from '../../node/crypto.js'
import { WaSctpRelay } from '../WaSctpRelay.js'

/** A fake raw UDP leg: records every datagram handed to it, and can be opened late or killed. */
interface FakeLeg {
    readonly ip: string
    readonly sent: Uint8Array[]
    /** Opens a leg that was created held. */
    release(): void
    fail(reason: string): void
}

/** Two relays, each on an IPv4 and an IPv6 leg, listed in the order they are dialled. */
const RELAY_A = 3
const RELAY_B = 8
const ENDPOINTS = [
    { ip: '10.0.3.1', relayId: RELAY_A },
    { ip: '2001:db8::3', relayId: RELAY_A },
    { ip: '10.0.8.1', relayId: RELAY_B },
    { ip: '2001:db8::8', relayId: RELAY_B }
] as const

/** An SRTP packet as the plane hands it over: RTP version 2, PT 120. */
const MEDIA = new Uint8Array([
    0x80, 0x78, 0x00, 0x2a, 0x00, 0x00, 0x03, 0xc0, 0x11, 0x22, 0x33, 0x44, 0xaa, 0xbb, 0xcc, 0xdd
])

const STUN_ALLOCATE = 0x0003
const WA_PING = 0x0801

/** RTP and RTCP carry version 2 in the top two bits; STUN carries zeros there. */
function mediaOn(leg: FakeLeg): number {
    return leg.sent.filter((datagram) => (datagram[0] & 0xc0) === 0x80).length
}

/** Media datagrams per leg, by address. */
function mediaByLeg(legs: readonly FakeLeg[]): Record<string, number> {
    return Object.fromEntries(legs.map((leg) => [leg.ip, mediaOn(leg)]))
}

function leg(legs: readonly FakeLeg[], ip: string): FakeLeg {
    const found = legs.find((candidate) => candidate.ip === ip)
    assert.ok(found, `a leg was dialled to ${ip}`)
    return found
}

function createRelay(legs: FakeLeg[], held: readonly string[] = []): WaSctpRelay {
    return new WaSctpRelay({
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        createRawUdpLeg: (options) => {
            let open = false
            let closed = false
            const openNow = (): void => {
                if (open || closed) return
                open = true
                options.onOpen()
            }
            legs.push({
                ip: options.ip,
                sent: [],
                release: openNow,
                fail: (reason) => {
                    closed = true
                    options.onFailure(reason)
                }
            })
            const sent = legs[legs.length - 1].sent
            return {
                get isOpen() {
                    return open && !closed
                },
                open: () => {
                    if (!held.includes(options.ip)) queueMicrotask(openNow)
                },
                send: (data) => {
                    if (!open || closed) return false
                    sent.push(data.slice())
                    return true
                },
                close: () => {
                    closed = true
                }
            }
        }
    })
}

/** Dials the four legs and waits for every one not held to open. */
async function dialLegs(relay: WaSctpRelay, held: readonly string[] = []): Promise<void> {
    relay.setSsrc(0x11223344)
    relay.setSubscriptionSsrc(0x55667788)
    await relay.configureRelays(
        ENDPOINTS.map((ep) => ({
            ip: ep.ip,
            port: 3480,
            originalPort: 3478,
            token: 'token',
            rawToken: new Uint8Array([1, 2, 3]),
            key: 'relay-key',
            relayId: ep.relayId,
            authTokenId: String(ep.relayId)
        }))
    )
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(relay.getConnectedCount(), ENDPOINTS.length - held.length, 'the legs opened')
}

function sendMedia(relay: WaSctpRelay): boolean {
    return relay.sendMedia(MEDIA.slice().buffer)
}

/** Every copy past the first reaches the peer as an SRTP replay, so media rides one leg. */
test('media leaves through a single leg, the first ready in dial order', async (t) => {
    const legs: FakeLeg[] = []
    const relay = createRelay(legs)
    t.after(() => relay.cleanup())
    await dialLegs(relay)

    for (let i = 0; i < 3; i++) assert.equal(sendMedia(relay), true)

    assert.deepEqual(mediaByLeg(legs), {
        '10.0.3.1': 3,
        '2001:db8::3': 0,
        '10.0.8.1': 0,
        '2001:db8::8': 0
    })
})

test('with no leg ready, no media goes out', async (t) => {
    const held = ENDPOINTS.map((ep) => ep.ip)
    const legs: FakeLeg[] = []
    const relay = createRelay(legs, held)
    t.after(() => relay.cleanup())
    await dialLegs(relay, held)

    assert.equal(sendMedia(relay), false)
    assert.equal(
        legs.reduce((sum, l) => sum + l.sent.length, 0),
        0
    )
})

/** Moving the media re-points the peer's stream, so a leg that opens late takes nothing over. */
test('a leg that becomes ready later does not take the media over', async (t) => {
    const legs: FakeLeg[] = []
    const relay = createRelay(legs, ['10.0.3.1'])
    t.after(() => relay.cleanup())
    await dialLegs(relay, ['10.0.3.1'])

    sendMedia(relay)
    leg(legs, '10.0.3.1').release()
    sendMedia(relay)

    assert.deepEqual(mediaByLeg(legs), {
        '10.0.3.1': 0,
        '2001:db8::3': 2,
        '10.0.8.1': 0,
        '2001:db8::8': 0
    })
})

/** A relay does not re-point its forwarding off a leg that died, so the sibling would be deaf. */
test('when the leg carrying media dies, a leg of another relay takes over', async (t) => {
    const legs: FakeLeg[] = []
    const relay = createRelay(legs)
    t.after(() => relay.cleanup())
    await dialLegs(relay)

    sendMedia(relay)
    leg(legs, '10.0.3.1').fail('raw_udp_no_return_path')
    assert.equal(sendMedia(relay), true)

    assert.deepEqual(mediaByLeg(legs), {
        '10.0.3.1': 1,
        '2001:db8::3': 0,
        '10.0.8.1': 1,
        '2001:db8::8': 0
    })
})

test('with no other relay left, the sibling of the lost leg takes over', async (t) => {
    const legs: FakeLeg[] = []
    const relay = createRelay(legs)
    t.after(() => relay.cleanup())
    await dialLegs(relay)

    leg(legs, '10.0.8.1').fail('raw_udp_no_return_path')
    leg(legs, '2001:db8::8').fail('raw_udp_no_return_path')
    sendMedia(relay)
    leg(legs, '10.0.3.1').fail('raw_udp_no_return_path')
    assert.equal(sendMedia(relay), true)

    assert.deepEqual(mediaByLeg(legs), {
        '10.0.3.1': 1,
        '2001:db8::3': 1,
        '10.0.8.1': 0,
        '2001:db8::8': 0
    })
})

/** The relay forwards only to a 5-tuple it keeps registered, so every leg stays ready to take over. */
test('legs the media does not take keep their registration and keepalive', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const legs: FakeLeg[] = []
    const relay = createRelay(legs)
    t.after(() => relay.cleanup())
    await dialLegs(relay)

    sendMedia(relay)
    for (const l of legs) l.sent.length = 0

    relay.resendSubscriptions()
    t.mock.timers.tick(5_000)

    for (const l of legs) {
        const types = l.sent.map((datagram) => (datagram[0] << 8) | datagram[1])
        assert.ok(types.includes(STUN_ALLOCATE), `${l.ip} got its allocate`)
        assert.ok(types.includes(WA_PING), `${l.ip} got its keepalive`)
        assert.equal(mediaOn(l), 0, `${l.ip} got no media`)
    }
})

test('broadcast still puts a datagram on every open leg', async (t) => {
    const legs: FakeLeg[] = []
    const relay = createRelay(legs)
    t.after(() => relay.cleanup())
    await dialLegs(relay)

    assert.equal(relay.broadcast(MEDIA.slice().buffer), true)

    assert.deepEqual(mediaByLeg(legs), {
        '10.0.3.1': 1,
        '2001:db8::3': 1,
        '10.0.8.1': 1,
        '2001:db8::8': 1
    })
})
