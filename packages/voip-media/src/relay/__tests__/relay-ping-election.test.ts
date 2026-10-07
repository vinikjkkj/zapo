import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { nodeCrypto } from '../../node/crypto.js'
import { WaSctpRelay } from '../WaSctpRelay.js'

/** A raw UDP leg whose relay answers each 0x0801 ping with a 0x0802 pong while `answering`. */
interface FakeLeg {
    readonly ip: string
    /** The id the relay gives the leg, as `onReceive` reports it. */
    readonly id: string
    readonly sent: Uint8Array[]
    answering: boolean
}

const WA_PING = 0x0801

/** The relay's answer to a ping: the same header with the 0x0802 type, transaction id echoed. */
function pongTo(ping: Uint8Array): Uint8Array {
    const pong = ping.slice()
    pong[1] = 0x02
    return pong
}

const MEDIA = new Uint8Array([
    0x80, 0x78, 0x00, 0x2a, 0x00, 0x00, 0x03, 0xc0, 0x11, 0x22, 0x33, 0x44, 0xaa, 0xbb, 0xcc, 0xdd
])

function isPing(datagram: Uint8Array): boolean {
    return ((datagram[0] << 8) | datagram[1]) === WA_PING
}

function mediaOn(leg: FakeLeg): number {
    return leg.sent.filter((datagram) => (datagram[0] & 0xc0) === 0x80).length
}

interface Harness {
    readonly relay: WaSctpRelay
    /** Relay A's leg, first in dial order, then relay B's. */
    readonly a: FakeLeg
    readonly b: FakeLeg
    /** Moves the relay's clock and its timers forward together. */
    advance(ms: number): Promise<void>
    /** The leg one media packet sent now leaves through. */
    sendMediaVia(): FakeLeg
}

async function flush(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve))
}

/** Two legs, on relays A and B unless told otherwise, both up and answering pings. */
async function dial(
    t: TestContext,
    relayIds: readonly [number, number] = [3, 8]
): Promise<Harness> {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
    let now = 0
    const legs: FakeLeg[] = []
    const relay = new WaSctpRelay({
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        now: () => now,
        createRawUdpLeg: (options) => {
            let open = false
            const leg: FakeLeg = {
                ip: options.ip,
                id: `${options.ip}:${options.port}#${relayIds[legs.length]}`,
                sent: [],
                answering: true
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
                    if (isPing(data) && leg.answering) {
                        const pong = pongTo(data)
                        queueMicrotask(() => options.onMessage(pong))
                    }
                    return true
                },
                close: () => {
                    open = false
                }
            }
        }
    })
    t.after(() => relay.cleanup())

    await relay.configureRelays(
        [
            { ip: '10.0.3.1', relayId: relayIds[0] },
            { ip: '10.0.8.1', relayId: relayIds[1] }
        ].map((ep) => ({
            ...ep,
            port: 3480,
            token: 'token',
            rawToken: new Uint8Array([1, 2, 3]),
            key: 'relay-key',
            authTokenId: String(ep.relayId)
        }))
    )
    await flush()
    assert.equal(relay.getConnectedCount(), 2)

    const [a, b] = legs
    return {
        relay,
        a,
        b,
        advance: async (ms) => {
            for (let elapsed = 0; elapsed < ms; elapsed += 100) {
                now += 100
                t.mock.timers.tick(100)
                await flush()
            }
        },
        sendMediaVia: () => {
            const before = legs.map(mediaOn)
            assert.equal(relay.sendMedia(MEDIA.slice().buffer), true, 'the media went out')
            const carrying = legs.filter((leg, i) => mediaOn(leg) > before[i])
            assert.equal(carrying.length, 1, 'one leg carries the media')
            return carrying[0]
        }
    }
}

/** Relay pings run every 5000 ms while the call sets up, every 1000 ms once it is accepted. */
test('the keepalive pings every 5 s before the accept and every 1 s after it', async (t) => {
    const { relay, a, advance } = await dial(t)

    a.sent.length = 0
    await advance(10_000)
    assert.equal(a.sent.filter(isPing).length, 2, 'two pings in 10 s of setup')

    relay.setMediaFlowing()
    await flush()
    a.sent.length = 0
    await advance(5_000)
    assert.equal(a.sent.filter(isPing).length, 5, 'five pings in 5 s of call')
})

/** A relay that stops answering pings leaves the election after `relay_unresponsive_timeout`. */
test('an elected leg whose relay stops answering pings is replaced, and kept open', async (t) => {
    const { relay, a, b, advance, sendMediaVia } = await dial(t)
    relay.setMediaFlowing()
    assert.equal(sendMediaVia(), a)

    a.answering = false
    await advance(3_000)
    assert.equal(sendMediaVia(), a, 'three seconds without a pong is not yet unresponsive')

    await advance(3_000)
    assert.equal(sendMediaVia(), b)
    assert.equal(relay.getConnectedCount(), 2, 'the silent leg stays open')
})

test('a leg whose relay answers pings again returns to the election', async (t) => {
    const { relay, a, b, advance, sendMediaVia } = await dial(t)
    relay.setMediaFlowing()
    assert.equal(sendMediaVia(), a)

    a.answering = false
    await advance(6_000)
    assert.equal(sendMediaVia(), b)

    a.answering = true
    b.answering = false
    await advance(6_000)
    assert.equal(sendMediaVia(), a)
})

/** Pongs are the only health signal: with none anywhere, sending somewhere beats going mute. */
test('with no leg answering pings, media still goes out', async (t) => {
    const { relay, a, b, advance, sendMediaVia } = await dial(t)
    relay.setMediaFlowing()

    a.answering = false
    b.answering = false
    await advance(6_000)

    assert.ok([a, b].includes(sendMediaVia()))
})

/**
 * Measured live against WhatsApp Web: moving our media off a leg that stopped hearing the
 * peer does not make the official client follow, and leaves that relay without our uplink.
 * Only the side that loses its leg recovers it, by following the peer.
 */
test('an elected leg that stops hearing the peer keeps our media, and hears it again', async (t) => {
    const { relay, a, advance, sendMediaVia } = await dial(t)
    relay.setMediaFlowing()
    relay.notePeerMedia(a.id)
    assert.equal(sendMediaVia(), a)

    for (let i = 0; i < 5; i++) {
        await advance(4_000)
        assert.equal(sendMediaVia(), a, `still on the leg ${(i + 1) * 4} s into the silence`)
    }

    relay.notePeerMedia(a.id)
    assert.equal(sendMediaVia(), a)
})
