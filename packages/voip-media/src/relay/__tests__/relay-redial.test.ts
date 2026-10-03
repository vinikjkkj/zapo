import assert from 'node:assert/strict'
import { test } from 'node:test'

import { nodeCrypto } from '../../node/crypto.js'
import { type Connection, WaSctpRelay } from '../WaSctpRelay.js'

/** `RFC 5245`'s ceiling for an `ice-ufrag`, which a browser enforces on the answer. */
const MAX_ICE_UFRAG = 256

class BrowserLikeChannel {
    binaryType = 'blob'
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: (() => void) | null = null
    private closed = false

    /** A browser fires `close` a task after the call, not inside it. */
    close(): void {
        if (this.closed) return
        this.closed = true
        setImmediate(() => this.onclose?.())
    }
}

/**
 * A browser-like `RTCPeerConnection`: refuses an answer with a too-long `ice-ufrag`, and
 * once closed never settles a pending operation.
 */
class BrowserLikePeerConnection {
    static readonly all: BrowserLikePeerConnection[] = []
    iceConnectionState = 'new'
    iceGatheringState = 'new'
    signalingState = 'stable'
    oniceconnectionstatechange: (() => void) | null = null
    onconnectionstatechange: (() => void) | null = null
    onicegatheringstatechange: (() => void) | null = null
    onsignalingstatechange: (() => void) | null = null
    ondatachannel: ((event: unknown) => void) | null = null
    closed = false
    readonly channels: BrowserLikeChannel[] = []

    constructor() {
        BrowserLikePeerConnection.all.push(this)
    }

    createDataChannel(): BrowserLikeChannel {
        const channel = new BrowserLikeChannel()
        this.channels.push(channel)
        return channel
    }

    createOffer(): Promise<{ type: 'offer'; sdp: string }> {
        return this.operation(() => ({
            type: 'offer',
            sdp: 'v=0\r\na=ice-ufrag:abcd\r\na=ice-pwd:local-password\r\na=setup:actpass\r\n'
        }))
    }

    setLocalDescription(): Promise<void> {
        return this.operation(() => undefined)
    }

    setRemoteDescription(description: { sdp: string }): Promise<void> {
        return this.operation(() => {
            const ufrag = /a=ice-ufrag:([^\r\n]*)/.exec(description.sdp)?.[1] ?? ''
            if (ufrag.length > MAX_ICE_UFRAG) {
                throw new Error(
                    'Invalid ICE parameters: ICE ufrag must be between 4 and 256 characters long.'
                )
            }
        })
    }

    close(): void {
        this.closed = true
        for (const channel of this.channels) channel.close()
    }

    private operation<T>(run: () => T): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            setImmediate(() => {
                if (this.closed) return
                try {
                    resolve(run())
                } catch (error) {
                    reject(error)
                }
            })
        })
    }
}

function relayConfig(ip: string, tokenLength: number, relayId: number) {
    return {
        ip,
        port: 3480,
        token: 'A'.repeat(tokenLength),
        key: 'k'.repeat(24),
        rawToken: new Uint8Array(30).fill(1),
        relayId,
        authTokenId: String(relayId)
    }
}

function createRelay(lost: string[] = []): WaSctpRelay {
    return new WaSctpRelay({
        crypto: nodeCrypto,
        createPeerConnection: () =>
            Promise.resolve(new BrowserLikePeerConnection() as unknown as RTCPeerConnection),
        onLost: (reason) => lost.push(reason)
    })
}

async function settles(operation: Promise<unknown>, withinMs = 1_000): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), withinMs)
    })
    try {
        return await Promise.race([operation.then(() => true), timeout])
    } finally {
        clearTimeout(timer)
    }
}

/** A stale channel's late close used to hit the redialled leg and hang every queued update. */
test('redialling a leg that failed while its old channel is still closing settles', async (t) => {
    BrowserLikePeerConnection.all.length = 0
    const relay = createRelay()
    t.after(() => relay.cleanup())
    const relays = [relayConfig('192.0.2.3', 40, 3), relayConfig('192.0.2.4', 300, 4)]

    assert.equal(await settles(relay.configureRelays(relays)), true, 'the first batch settles')
    assert.equal(await settles(relay.configureRelays(relays)), true, 'the redial settles too')

    const internals = relay as unknown as { connections: Map<string, Connection> }
    assert.equal(
        internals.connections.get('192.0.2.3:3480#3')?.state,
        'Connecting',
        'the healthy leg is still dialling, untouched by the redial'
    )
    assert.equal(
        BrowserLikePeerConnection.all.filter((pc) => !pc.closed).length,
        1,
        'only the healthy leg holds a peer connection'
    )
})

interface RelayInternals {
    connections: Map<string, Connection>
    failConnection: (conn: Connection, reason: string) => void
    closeConnection: (conn: Connection) => void
}

function leg(id: string, state: string): Connection {
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
        abortDial: null,
        hasReceivedFirstPacket: false,
        localUfrag: 'local-ufrag',
        stableRoutingConnId: 0n,
        stunTransactionId: new Uint8Array(12),
        stats: { sentPackets: 0, receivedPackets: 0, sentBytes: 0, receivedBytes: 0 }
    } as unknown as Connection
}

test('a late close or failure of an old leg leaves the leg now holding its id alone', () => {
    const lost: string[] = []
    const relay = createRelay(lost)
    const internals = relay as unknown as RelayInternals
    const other = leg('relay-2', 'Open')
    internals.connections.set(other.id, other)

    const failed = leg('relay-1', 'Connecting')
    internals.connections.set(failed.id, failed)
    internals.failConnection(failed, 'connection_error')
    const closed = leg('relay-1', 'Open')
    internals.connections.set(closed.id, closed)
    internals.closeConnection(closed)

    const fresh = leg('relay-1', 'Connecting')
    internals.connections.set(fresh.id, fresh)
    internals.closeConnection(failed)
    internals.closeConnection(closed)
    internals.failConnection(closed, 'ice_connection_failed')

    assert.equal(internals.connections.get('relay-1'), fresh)
    assert.equal(fresh.state, 'Connecting')
    assert.deepEqual(lost, [])
})

test('a leg ended while it dials stops waiting on its peer connection', async (t) => {
    BrowserLikePeerConnection.all.length = 0
    const relay = createRelay()
    const configuring = relay.configureRelays([relayConfig('192.0.2.9', 40, 9)])
    // Tear the batch down while the offer is still pending.
    await new Promise((resolve) => setImmediate(resolve))
    relay.cleanup()
    t.after(() => relay.cleanup())

    assert.equal(await settles(configuring), true)
    assert.equal(BrowserLikePeerConnection.all[0]?.closed, true)
})
