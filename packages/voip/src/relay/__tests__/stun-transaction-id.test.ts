import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import { test } from 'node:test'

import { bytesToHex, hexToBytes } from 'zapo-js/util'

import { TEXT_ENCODER } from '../../bytes.js'
import {
    buildAllocateForRelay,
    buildSSRCSubscriptionList,
    createStunTransactionId,
    parseStunResponse,
    type StunResponseInfo
} from '../stun.js'
import { type Connection, WaSctpRelay } from '../WaSctpRelay.js'

const ATTR_USERNAME = 0x0006
const ATTR_XOR_RELAYED_ADDRESS = 0x0016

const MAGIC_COOKIE_BYTES = new Uint8Array([0x21, 0x12, 0xa4, 0x42])

const IPV6_ADDRESS_BYTES = 16

/** `initial` plus the four retries the registration ladder schedules. */
const LADDER_POSITIONS = 5

const RELAY_CREDENTIAL = new Uint8Array([0x0a, 0x0b, 0x0c, 0x0d])

const IPV6_SAMPLE = '2a03:2880:f234:1c:face:b00c:0:1'

const IPV6_SAMPLE_BYTES = new Uint8Array([
    0x2a, 0x03, 0x28, 0x80, 0xf2, 0x34, 0x00, 0x1c, 0xfa, 0xce, 0xb0, 0x0c, 0x00, 0x00, 0x00, 0x01
])

/**
 * The key the relay applies: the header transaction id with the bytes of every
 * 32-bit word reversed. Recomputed here instead of imported so the test states
 * the relation on its own.
 */
function relayKeyByteOrder(transactionId: Uint8Array): Uint8Array {
    const key = new Uint8Array(transactionId.length)
    for (let word = 0; word < transactionId.length; word += 4) {
        for (let i = 0; i < 4; i++) key[word + i] = transactionId[word + 3 - i]
    }
    return key
}

interface Listener {
    readonly port: number
    readonly packets: Uint8Array[]
    close(): void
}

async function bindListener(): Promise<Listener> {
    const socket = dgram.createSocket('udp4')
    const packets: Uint8Array[] = []

    socket.on('message', (message) => {
        packets.push(Uint8Array.from(message))
    })

    await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve))

    return {
        port: socket.address().port,
        packets,
        close: () => socket.close()
    }
}

function relayInfoFor(port: number, index: number) {
    return {
        id: `relay-${index}`,
        ip: '127.0.0.1',
        port,
        token: `token-${index}`,
        authToken: `auth-token-${index}`,
        rawToken: new Uint8Array([0xa0, index, 0x5c, 0x11]),
        key: `relay-key-${index}`,
        relayId: index,
        name: `probe-${index}`,
        isFna: true
    }
}

async function waitUntil(done: () => boolean, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!done() && Date.now() < deadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, 20))
    }
}

function parseAll(packets: Uint8Array[]): StunResponseInfo[] {
    return packets.map((packet) => {
        const info = parseStunResponse(packet)
        assert.ok(info, `unparseable packet ${bytesToHex(packet.subarray(0, 8))}`)
        return info
    })
}

function countAllocates(packets: Uint8Array[]): number {
    let total = 0
    for (const packet of packets) {
        if (parseStunResponse(packet)?.method === 'allocate') total++
    }
    return total
}

function relayedAddressOf(info: StunResponseInfo): Uint8Array {
    const attribute = info.attributes.find((attr) => attr.type === ATTR_XOR_RELAYED_ADDRESS)
    assert.ok(attribute)
    assert.equal(attribute.length, 4 + IPV6_ADDRESS_BYTES)
    assert.equal(attribute.data[1], 0x02)
    return attribute.data
}

function buildIpv6Allocate(ip: string, transactionId?: Uint8Array): Uint8Array {
    return buildAllocateForRelay(
        RELAY_CREDENTIAL,
        buildSSRCSubscriptionList([0x01020304], [], 1, 2),
        TEXT_ENCODER.encode('relay-key'),
        ip,
        3480,
        transactionId
    )
}

test('a relay connection stamps one transaction id on every STUN message it emits', async () => {
    const listeners = [await bindListener(), await bindListener()]
    const relay = new WaSctpRelay()
    relay.setSsrc(0x11223344)
    relay.setSubscriptionSsrc(0x55667788)
    /**
     * `connectToRelay` registers the connection in `connections`
     * synchronously, before its returned promise ever settles: the FNA/UDP
     * branch `relayInfoFor`'s `isFna: true` selects calls `setupUdpRelay`
     * and returns before any `await`. Reaching in here only checks that
     * registration invariant, typed against the real `Connection` shape so
     * a field rename breaks this test at compile time instead of silently
     * matching a stale structural type.
     */
    const internals = relay as unknown as { connections: Map<string, Connection> }

    try {
        for (let i = 0; i < listeners.length; i++) {
            const before = new Set(internals.connections.keys())
            const pending = relay.connectToRelay(relayInfoFor(listeners[i].port, i + 1))
            const addedKey = [...internals.connections.keys()].find((key) => !before.has(key))
            assert.ok(addedKey, 'connectToRelay must register the connection before it returns')
            assert.ok(
                internals.connections.get(addedKey),
                'the registered connection must still be present'
            )

            const conn = await pending
            assert.ok(conn)
        }

        await waitUntil(
            () => listeners.every((l) => countAllocates(l.packets) >= LADDER_POSITIONS),
            8_000
        )
    } finally {
        relay.cleanup()
        for (const listener of listeners) listener.close()
    }

    const perConnectionIds: string[] = []

    for (const listener of listeners) {
        const infos = parseAll(listener.packets)
        const ids = new Set(infos.map((info) => info.transactionId))

        assert.equal(ids.size, 1, `expected one transaction id, saw ${[...ids].join(', ')}`)

        const allocates = infos.filter((info) => info.method === 'allocate')
        const bindings = infos.filter((info) => info.method === 'binding')
        const credentialled = bindings.filter((info) =>
            info.attributes.some((attr) => attr.type === ATTR_USERNAME)
        )
        const pings = infos.filter((info) => info.method === 'wa-ping')

        assert.ok(
            allocates.length >= LADDER_POSITIONS,
            `expected every ladder position to allocate, saw ${allocates.length}`
        )
        assert.ok(
            bindings.length >= LADDER_POSITIONS,
            `expected the no-MI binding check of every ladder position, saw ${bindings.length}`
        )
        /**
         * `sendStunAllocateOnOpen` only stamps a binding with the ufrag pair
         * (`v1`/`v2`) when `conn.localUfrag` is set. `setupUdpRelay`, the
         * branch this FNA connection takes, never assigns `localUfrag`:
         * that only happens in the WebRTC branch's SDP offer, which an FNA
         * connection never reaches. A credentialled binding here would mean
         * the FNA registration ladder started depending on a ufrag it
         * cannot have.
         */
        assert.equal(
            credentialled.length,
            0,
            `expected no ufrag-credentialled binding on an FNA connection, saw ${credentialled.length}`
        )
        assert.ok(pings.length >= 1, 'expected at least the first keepalive ping')

        const [id] = [...ids]
        assert.equal(id.length, 24)
        perConnectionIds.push(id)
    }

    assert.notEqual(perConnectionIds[0], perConnectionIds[1])
})

test('the IPv6 XOR key of an allocate is its header transaction id in relay byte order', () => {
    const packet = buildIpv6Allocate(IPV6_SAMPLE)
    const info = parseStunResponse(packet)
    assert.ok(info)

    const data = relayedAddressOf(info)
    const key = new Uint8Array(IPV6_ADDRESS_BYTES)
    for (let i = 0; i < IPV6_ADDRESS_BYTES; i++) key[i] = data[4 + i] ^ IPV6_SAMPLE_BYTES[i]

    assert.deepEqual([...key.subarray(0, 4)], [...MAGIC_COOKIE_BYTES])
    assert.deepEqual([...key.subarray(4)], [...relayKeyByteOrder(packet.subarray(8, 20))])
    assert.notDeepEqual([...key.subarray(4)], [...packet.subarray(8, 20)])
})

test('a known transaction id reconstructs the IPv6 address through the relay byte order', () => {
    const transactionId = createStunTransactionId()
    const packet = buildIpv6Allocate('2a03:2880::177', transactionId)

    assert.deepEqual([...packet.subarray(8, 20)], [...transactionId])

    const info = parseStunResponse(packet)
    assert.ok(info)
    const data = relayedAddressOf(info)

    const mask = new Uint8Array(IPV6_ADDRESS_BYTES)
    mask.set(MAGIC_COOKIE_BYTES, 0)
    mask.set(relayKeyByteOrder(transactionId), 4)

    const address = new Uint8Array(IPV6_ADDRESS_BYTES)
    for (let i = 0; i < IPV6_ADDRESS_BYTES; i++) address[i] = data[4 + i] ^ mask[i]

    assert.deepEqual(
        [...address],
        [0x2a, 0x03, 0x28, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0x77]
    )
    assert.equal(((data[2] << 8) | data[3]) ^ 0x2112, 3480)
})

/**
 * The only measured evidence for the relay byte order: two live connections
 * where the 452 error echoed the address the relay had decoded, so
 * `decoded XOR real XOR header id` recovers the key it actually applied. Both
 * samples land on the 32-bit word swap, and neither a full 12-byte reverse nor
 * a 16-bit swap fits either of them. Pinned literally so the swap cannot be
 * "simplified" back into the plain header id.
 */
test('the relay key of two real connections is the header transaction id word by word', () => {
    const samples: readonly (readonly [string, string])[] = [
        ['4e765a5f68f30d827bc49890', '5f5a764e820df3689098c47b'],
        ['b3d76c427f041581917b1192', '426cd7b38115047f92117b91']
    ]

    for (const [headerId, relayKey] of samples) {
        const transactionId = hexToBytes(headerId)
        const packet = buildIpv6Allocate(IPV6_SAMPLE, transactionId)

        assert.equal(bytesToHex(packet.subarray(8, 20)), headerId)

        const info = parseStunResponse(packet)
        assert.ok(info)
        const data = relayedAddressOf(info)

        const key = new Uint8Array(IPV6_ADDRESS_BYTES)
        for (let i = 0; i < IPV6_ADDRESS_BYTES; i++) key[i] = data[4 + i] ^ IPV6_SAMPLE_BYTES[i]

        assert.deepEqual([...key.subarray(0, 4)], [...MAGIC_COOKIE_BYTES])
        assert.equal(bytesToHex(key.subarray(4)), relayKey, headerId)
    }
})
