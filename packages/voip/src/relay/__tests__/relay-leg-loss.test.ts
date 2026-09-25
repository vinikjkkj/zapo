import assert from 'node:assert/strict'
import { test } from 'node:test'

import { type Connection, WaSctpRelay } from '../WaSctpRelay.js'

interface RelayInternals {
    connections: Map<string, Connection>
    stats: { connected: number }
    failConnection: (conn: Connection, reason: string) => void
    closeConnection: (connectionId: string) => void
}

/**
 * A leg in the state both transports leave it in once they are carrying
 * traffic: `Open`, and already counted. What sits under it does not matter
 * here, because failing and closing a leg touch neither the data channel nor
 * the raw socket before they discount it.
 */
function countedConnection(id: string, state: string): Connection {
    return {
        state,
        peerConnection: null,
        channel: null,
        rawLeg: null,
        incomingChannels: [],
        buffer: [],
        bufferedBytes: 0,
        id,
        relayInfo: { id, ip: '127.0.0.1', port: 3480, token: 't', key: 'k', relayId: 1 },
        connectionTimeout: null,
        hasReceivedFirstPacket: false,
        localUfrag: 'local-ufrag',
        stableRoutingConnId: 0n,
        stunTransactionId: new Uint8Array(12),
        stats: { sentPackets: 0, receivedPackets: 0, sentBytes: 0, receivedBytes: 0 }
    } as unknown as Connection
}

/**
 * `getConnectedCount` is what the call layer reads to decide it still has a
 * path. A leg leaves `Open` by failing at least as often as by closing - a
 * socket error, an ICE drop, or a raw leg rolling itself back for want of a
 * return path - so the count has to come back on that route too, or it only
 * ever climbs.
 */
test('a failed leg gives back the connected count it took', () => {
    const relay = new WaSctpRelay()
    const internals = relay as unknown as RelayInternals
    const conn = countedConnection('relay-1', 'Open')

    internals.connections.set(conn.id, conn)
    internals.stats.connected = 1

    internals.failConnection(conn, 'raw_udp_no_return_path')

    assert.equal(relay.getConnectedCount(), 0)
    assert.equal(relay.hasConnection(), false)
})

/** A leg that never opened was never counted, so closing it discounts nothing. */
test('closing a leg that never opened leaves the count where it was', () => {
    const relay = new WaSctpRelay()
    const internals = relay as unknown as RelayInternals
    const open = countedConnection('relay-open', 'Open')
    const connecting = countedConnection('relay-connecting', 'Connecting')

    internals.connections.set(open.id, open)
    internals.connections.set(connecting.id, connecting)
    internals.stats.connected = 1

    internals.closeConnection(connecting.id)

    assert.equal(relay.getConnectedCount(), 1)
})

/**
 * With nothing left to carry media, the call is mute and nobody upstream knows
 * it: the legs are gone, no code redials them, and the send paths silently drop
 * everything. The announcement is what lets the owner end the call instead of
 * leaving it live and dumb.
 */
test('losing the last open leg is announced', () => {
    const relay = new WaSctpRelay()
    const internals = relay as unknown as RelayInternals
    const lost: string[] = []
    relay.on('relay_lost', (event: { reason: string }) => lost.push(event.reason))

    const conn = countedConnection('relay-1', 'Open')
    internals.connections.set(conn.id, conn)
    internals.stats.connected = 1

    internals.failConnection(conn, 'raw_udp_no_return_path')

    assert.deepEqual(lost, ['raw_udp_no_return_path'])
})

/** A call runs several legs and loses one routinely; only the last one counts. */
test('losing one leg of several is not announced', () => {
    const relay = new WaSctpRelay()
    const internals = relay as unknown as RelayInternals
    const lost: string[] = []
    relay.on('relay_lost', (event: { reason: string }) => lost.push(event.reason))

    const first = countedConnection('relay-1', 'Open')
    const second = countedConnection('relay-2', 'Open')
    internals.connections.set(first.id, first)
    internals.connections.set(second.id, second)
    internals.stats.connected = 2

    internals.failConnection(first, 'data_channel_error')

    assert.deepEqual(lost, [], 'a call with a leg left has not lost its media path')
    assert.equal(relay.getConnectedCount(), 1)
    assert.equal(relay.hasConnection(), true)
})

/**
 * A clean hangup closes every leg at once, and that is not the call losing its
 * media path - it is the call being over. Announcing there would end a call
 * that is already ending.
 */
test('tearing the relay down is not announced', () => {
    const relay = new WaSctpRelay()
    const internals = relay as unknown as RelayInternals
    const lost: string[] = []
    relay.on('relay_lost', (event: { reason: string }) => lost.push(event.reason))

    const conn = countedConnection('relay-1', 'Open')
    internals.connections.set(conn.id, conn)
    internals.stats.connected = 1

    relay.cleanup()

    assert.deepEqual(lost, [])
    assert.equal(relay.getConnectedCount(), 0)
})
