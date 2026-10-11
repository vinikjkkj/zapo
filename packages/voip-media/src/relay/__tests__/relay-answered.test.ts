import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { nodeCrypto } from '../../node/crypto.js'
import { WaSctpRelay } from '../WaSctpRelay.js'

/** The relay's whole 0x0802 keepalive answer: type, zero length, magic cookie, transaction id. */
const PONG = new Uint8Array([0x08, 0x02, 0x00, 0x00, 0x21, 0x12, 0xa4, 0x42, ...new Uint8Array(12)])

/** A raw leg to `ip`, whose answers the test hands in itself. */
interface Leg {
    readonly ip: string
    answer(): void
}

function endpoint(ip: string, name: string, rawToken?: Uint8Array) {
    return {
        ip,
        port: 3478,
        originalPort: 3478,
        token: 'token',
        rawToken,
        key: 'relay-key',
        relayId: 1,
        name
    }
}

async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) await new Promise<void>((resolve) => setImmediate(resolve))
}

function createRelay(t: TestContext): {
    relay: WaSctpRelay
    legs: Leg[]
    answered: Array<[string, number | undefined]>
    clock: { now: number }
} {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
    const legs: Leg[] = []
    const answered: Array<[string, number | undefined]> = []
    const clock = { now: 1_000 }
    const relay = new WaSctpRelay({
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        now: () => clock.now,
        onRelayAnswered: (name, rttMs) => {
            answered.push([name, rttMs])
        },
        createRawUdpLeg: (options) => {
            let open = false
            legs.push({ ip: options.ip, answer: () => options.onMessage(PONG.slice()) })
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
                send: () => open,
                close: () => {
                    open = false
                }
            }
        }
    })
    t.after(() => relay.cleanup())
    return { relay, legs, answered, clock }
}

function legTo(legs: Leg[], ip: string): Leg {
    const leg = legs.find((candidate) => candidate.ip === ip)
    assert.ok(leg, `no leg to ${ip}`)
    return leg
}

test('a relay is reported once when it first answers, with the time since its first allocate', async (t) => {
    const { relay, legs, answered, clock } = createRelay(t)
    const token = new Uint8Array([1, 2, 3])
    await relay.configureRelays([
        endpoint('10.0.0.1', 'gru1c01', token),
        endpoint('10.0.0.2', 'gru1c01', token),
        endpoint('10.0.0.3', 'fcgh68c01', token)
    ])
    await settle()

    clock.now = 1_037
    legTo(legs, '10.0.0.1').answer()
    legTo(legs, '10.0.0.1').answer()
    clock.now = 1_090
    legTo(legs, '10.0.0.2').answer()

    assert.deepEqual(answered, [['gru1c01', 37]])
})

test('a relay that never answers is never reported', async (t) => {
    const { relay, answered } = createRelay(t)
    await relay.configureRelays([endpoint('10.0.0.3', 'fcgh68c01', new Uint8Array([1]))])
    await settle()

    t.mock.timers.tick(10_000)
    await settle()

    assert.deepEqual(answered, [])
})

test('a relay answering a leg that sent no allocate is reported without a round trip', async (t) => {
    const { relay, legs, answered } = createRelay(t)
    await relay.configureRelays([endpoint('10.0.0.1', 'gru1c01')])
    await settle()

    legTo(legs, '10.0.0.1').answer()

    assert.deepEqual(answered, [['gru1c01', undefined]])
})
