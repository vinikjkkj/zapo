import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { createNoopLogger } from '../../logger.js'
import { nodeCrypto } from '../../node/crypto.js'
import { TRUE_WEB_CLIENT_RELAY_PORT } from '../../relay/WaSctpRelay.js'
import { dialableRelayEndpoints, type WaCallMediaRelay, type WaCallMediaRelays } from '../plan.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

interface ConfiguredRelay {
    readonly ip: string
    readonly port: number
    readonly originalPort?: number
    readonly name?: string
}

/** A plane whose relay configuration is captured instead of dialled. */
function createPlane(useOriginalRelayPort = false): {
    plane: WaCallMediaPlane
    configured: ConfiguredRelay[]
} {
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        useOriginalRelayPort
    })

    const configured: ConfiguredRelay[] = []
    ;(
        plane as unknown as {
            sctpRelay: {
                configureRelays: (relays: ConfiguredRelay[]) => Promise<void>
                setSsrc: (ssrc: number) => void
                setSubscriptionSsrc: (ssrc: number) => void
                setStreamSsrcs: (selfSsrcs: number[], peerSsrcs: number[]) => void
                setParticipantIds: (selfPid?: number, peerPid?: number) => void
                getConnectedCount: () => number
                cleanup: () => void
            }
        }
    ).sctpRelay = {
        configureRelays: async (relays) => {
            configured.push(...relays)
        },
        setSsrc: () => {},
        setSubscriptionSsrc: () => {},
        setStreamSsrcs: () => {},
        setParticipantIds: () => {},
        getConnectedCount: () => 0,
        cleanup: () => {}
    }

    return { plane, configured }
}

function connectRelays(plane: WaCallMediaPlane, endpoints: WaCallMediaRelay[]): Promise<void> {
    return (
        plane as unknown as {
            connectRelays: (relays: WaCallMediaRelays) => Promise<void>
        }
    ).connectRelays({ endpoints })
}

function endpoint(overrides: Partial<WaCallMediaRelay> = {}): WaCallMediaRelay {
    return {
        ip: '192.168.1.1',
        port: 3480,
        token: 'TOKEN',
        key: 'RELAYKEY',
        relayId: 0,
        rawToken: new Uint8Array([1, 2, 3]),
        ...overrides
    }
}

test('every relay is dialled on the web client port', async (t) => {
    const { plane, configured } = createPlane()
    t.after(() => plane.stop())

    await connectRelays(plane, [endpoint({ ip: '10.0.0.1', port: 3480 })])

    assert.equal(configured.length, 1)
    assert.equal(configured[0].ip, '10.0.0.1')
    assert.equal(configured[0].port, TRUE_WEB_CLIENT_RELAY_PORT)
})

test('an endpoint advertising the faux port is still dialled on the web client port', async (t) => {
    const { plane, configured } = createPlane()
    t.after(() => plane.stop())

    await connectRelays(plane, [endpoint({ ip: '10.0.0.1', port: 3478 })])

    assert.equal(configured[0].port, TRUE_WEB_CLIENT_RELAY_PORT)
})

test('a relay without a name is named for the address it dials', async (t) => {
    const { plane, configured } = createPlane()
    t.after(() => plane.stop())

    await connectRelays(plane, [endpoint({ ip: '10.0.0.1', port: 3478 })])

    assert.equal(configured[0].name, `10.0.0.1:${TRUE_WEB_CLIENT_RELAY_PORT}`)
})

test('the advertised port is dialled when the escape hatch is set', async (t) => {
    const { plane, configured } = createPlane(true)
    t.after(() => plane.stop())

    await connectRelays(plane, [endpoint({ ip: '10.0.0.1', port: 47001 })])

    assert.equal(configured[0].port, 47001)
    assert.equal(configured[0].name, '10.0.0.1:47001')
})

test('endpoints of one host on different ports stay distinct under the escape hatch', async (t) => {
    const { plane, configured } = createPlane(true)
    t.after(() => plane.stop())

    await connectRelays(plane, [
        endpoint({ ip: '10.0.0.1', port: 3478, relayId: 0 }),
        endpoint({ ip: '10.0.0.1', port: 3480, relayId: 1 })
    ])

    assert.deepEqual(
        configured.map((relay) => relay.port),
        [3478, 3480]
    )
})

/**
 * The dialled port and the advertised one travel together. The WebRTC legs
 * need the rewrite to the web client port, and a raw UDP leg needs the port
 * the relay actually advertised, so dropping either here leaves one of the two
 * transports dialling an address nothing answers on.
 */
test('the advertised port travels alongside the dialled one', async (t) => {
    const { plane, configured } = createPlane()
    t.after(() => plane.stop())

    await connectRelays(plane, [endpoint({ ip: '10.0.0.1', port: 3478 })])

    assert.equal(configured[0].port, TRUE_WEB_CLIENT_RELAY_PORT)
    assert.equal(configured[0].originalPort, 3478)
})

test('the advertised port is reported as itself when it is already dialled', async (t) => {
    const { plane, configured } = createPlane(true)
    t.after(() => plane.stop())

    await connectRelays(plane, [endpoint({ ip: '10.0.0.1', port: 47001 })])

    assert.equal(configured[0].port, 47001)
    assert.equal(configured[0].originalPort, 47001)
})

test('only udp endpoints carrying a key and a raw token are dialable', () => {
    const dialable = dialableRelayEndpoints([
        endpoint({ ip: '10.0.0.1', relayId: 1, protocol: 1 }),
        endpoint({ ip: '10.0.0.2', relayId: 2, rawToken: undefined }),
        endpoint({ ip: '10.0.0.3', relayId: 3, key: '' }),
        endpoint({ ip: '10.0.0.4', relayId: 4, protocol: 0 }),
        endpoint({ ip: '10.0.0.5', relayId: 5 })
    ])

    assert.deepEqual(
        dialable.map((ep) => ep.relayId),
        [4, 5]
    )
})

test('an address listed twice is dialable only through its first entry', () => {
    const dialable = dialableRelayEndpoints([
        endpoint({ ip: '10.0.0.1', port: 3478, relayId: 1 }),
        endpoint({ ip: '10.0.0.1', port: 3478, relayId: 2 }),
        endpoint({ ip: '10.0.0.2', port: 3478, relayId: 3, rawToken: undefined }),
        endpoint({ ip: '10.0.0.2', port: 3478, relayId: 4 })
    ])

    assert.deepEqual(
        dialable.map((ep) => ep.relayId),
        [1]
    )
})

test('the plane dials exactly the dialable endpoints', async (t) => {
    const { plane, configured } = createPlane(true)
    t.after(() => plane.stop())
    const endpoints = [
        endpoint({ ip: '10.0.0.1', protocol: 1 }),
        endpoint({ ip: '10.0.0.2', port: 3478, relayId: 0 }),
        endpoint({ ip: '10.0.0.2', port: 3478, relayId: 1 }),
        endpoint({ ip: '10.0.0.3', rawToken: undefined }),
        endpoint({ ip: '10.0.0.4', port: 47001 })
    ]

    await connectRelays(plane, endpoints)

    assert.deepEqual(
        configured.map((relay) => `${relay.ip}:${relay.port}`),
        ['10.0.0.2:3478', '10.0.0.4:47001']
    )
    assert.deepEqual(
        configured.map((relay) => `${relay.ip}:${relay.port}`),
        dialableRelayEndpoints(endpoints).map((ep) => `${ep.ip}:${ep.port}`)
    )
})
