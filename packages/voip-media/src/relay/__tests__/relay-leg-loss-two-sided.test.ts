import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { nodeCrypto } from '../../node/crypto.js'
import { type RawUdpLegOptions, WaSctpRelay } from '../WaSctpRelay.js'

type Side = 'caller' | 'callee'

/** One side's leg to one relay, as the relays in between see it. */
interface SimLeg {
    readonly side: Side
    readonly relayId: number
    readonly id: string
    alive: boolean
    readonly options: RawUdpLegOptions
}

const RELAYS = [3, 8] as const
const MEDIA = new Uint8Array([
    0x80, 0x78, 0x00, 0x2a, 0x00, 0x00, 0x03, 0xc0, 0x11, 0x22, 0x33, 0x44, 0xaa, 0xbb, 0xcc, 0xdd
])

function other(side: Side): Side {
    return side === 'caller' ? 'callee' : 'caller'
}

/**
 * Two relays between two clients, forwarding as measured live: a side's media reaches the
 * other side's leg on the same relay that last sent media there, or else the one that
 * registered first. Each side's media that arrives stands for an authenticated packet.
 */
class RelayNetwork {
    now = 0
    readonly legs: SimLeg[] = []
    readonly heardAt: Record<Side, number[]> = { caller: [], callee: [] }
    private readonly targets = new Map<string, SimLeg>()
    private readonly clients = new Map<Side, WaSctpRelay>()

    client(side: Side): WaSctpRelay {
        const relay = new WaSctpRelay({
            crypto: nodeCrypto,
            createPeerConnection: peerConnectionNotDialled,
            now: () => this.now,
            createRawUdpLeg: (options) => this.leg(side, options)
        })
        this.clients.set(side, relay)
        return relay
    }

    private leg(side: Side, options: RawUdpLegOptions) {
        const relayId = RELAYS[this.legs.filter((leg) => leg.side === side).length]
        const leg: SimLeg = {
            side,
            relayId,
            id: `${options.ip}:${options.port}#${relayId}`,
            alive: true,
            options
        }
        this.legs.push(leg)
        let open = false
        return {
            get isOpen() {
                return open && leg.alive
            },
            open: () => {
                queueMicrotask(() => {
                    open = true
                    options.onOpen()
                })
            },
            send: (data: Uint8Array) => {
                if (!open || !leg.alive) return false
                this.carry(leg, data)
                return true
            },
            close: () => {
                leg.alive = false
            }
        }
    }

    private carry(leg: SimLeg, data: Uint8Array): void {
        const key = `${leg.relayId}:${leg.side}`
        const media = (data[0] & 0xc0) === 0x80
        if (!media) {
            if (!this.targets.has(key)) this.targets.set(key, leg)
            if (((data[0] << 8) | data[1]) === 0x0801) {
                const pong = data.slice()
                pong[1] = 0x02
                queueMicrotask(() => {
                    if (leg.alive) leg.options.onMessage(pong)
                })
            }
            return
        }
        this.targets.set(key, leg)
        const destination = this.targets.get(`${leg.relayId}:${other(leg.side)}`)
        if (!destination?.alive) return
        this.heardAt[destination.side].push(this.now)
        this.clients.get(destination.side)?.notePeerMedia(destination.id)
    }
}

async function flush(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve))
}

async function startCall(t: TestContext): Promise<{
    net: RelayNetwork
    caller: WaSctpRelay
    callee: WaSctpRelay
    /** Both sides send one packet every 20 ms for `ms`. */
    talk(ms: number): Promise<void>
}> {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
    const net = new RelayNetwork()
    const caller = net.client('caller')
    const callee = net.client('callee')
    t.after(() => {
        caller.cleanup()
        callee.cleanup()
    })
    for (const [side, relay] of [
        ['caller', caller],
        ['callee', callee]
    ] as const) {
        await relay.configureRelays(
            RELAYS.map((relayId) => ({
                ip: `10.${side === 'caller' ? 1 : 2}.${relayId}.1`,
                port: 3480,
                token: 'token',
                rawToken: new Uint8Array([1, 2, 3]),
                key: 'relay-key',
                relayId,
                authTokenId: String(relayId)
            }))
        )
    }
    await flush()
    caller.setMediaFlowing()
    callee.setMediaFlowing()
    await flush()

    return {
        net,
        caller,
        callee,
        talk: async (ms) => {
            for (let elapsed = 0; elapsed < ms; elapsed += 20) {
                caller.sendMedia(MEDIA.slice().buffer)
                callee.sendMedia(MEDIA.slice().buffer)
                net.now += 20
                t.mock.timers.tick(20)
                await flush()
            }
        }
    }
}

/** How long after `from` each side first heard the other again. */
function recovery(net: RelayNetwork, from: number): Record<Side, number> {
    const first = (side: Side) => net.heardAt[side].find((at) => at > from) ?? Infinity
    return { caller: first('caller') - from, callee: first('callee') - from }
}

/**
 * M-d on the callee: its leg carrying the media dies while the caller's stays up. The callee
 * moves to the other relay, the caller hears it there and follows, inside half a second.
 */
test('killing the leg the callee sends on recovers by following the peer, not by a timeout', async (t) => {
    const { net, talk } = await startCall(t)
    await talk(1_000)
    assert.ok(net.heardAt.caller.length > 0 && net.heardAt.callee.length > 0, 'media flows')

    const calleeLeg = net.legs.find((leg) => leg.side === 'callee' && leg.relayId === RELAYS[0])
    assert.ok(calleeLeg)
    const killedAt = net.now
    calleeLeg.alive = false
    calleeLeg.options.onFailure('killed')
    await talk(3_000)

    const after = recovery(net, killedAt)
    assert.ok(after.caller <= 100, `the caller heard the callee again after ${after.caller} ms`)
    assert.ok(after.callee <= 1_000, `the callee heard the caller again after ${after.callee} ms`)
})
