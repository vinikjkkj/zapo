import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import { test } from 'node:test'

import { WaSctpRelay } from '../WaSctpRelay.js'

/**
 * The first eight bytes of a relay ALLOCATE: STUN method `0x0003` in the type,
 * then the attribute length, then the magic cookie `0x2112a442`. The length is
 * left out of the constant because it depends on what the allocate carries;
 * everything else is fixed and is written out here rather than rebuilt, so the
 * assertion describes the wire instead of echoing the builder.
 */
const STUN_ALLOCATE_TYPE = new Uint8Array([0x00, 0x03])

/**
 * The whole 0x0801 keepalive but for its transaction id: type, a zero
 * attribute length, and the magic cookie. A ping is header and nothing else,
 * so these eight bytes plus twelve of transaction id are the entire packet.
 */
const STUN_PING_PREFIX = new Uint8Array([0x08, 0x01, 0x00, 0x00, 0x21, 0x12, 0xa4, 0x42])

const STUN_HEADER_LENGTH = 20
const STUN_MAGIC_COOKIE = new Uint8Array([0x21, 0x12, 0xa4, 0x42])

/** The attribute the relay token rides in on an allocate. */
const ATTR_RELAY_CREDENTIAL = 0x4000

/** A port the relay would be dialled on if the web client rewrite leaked in. */
const WEB_CLIENT_PORT = 3480

const RELAY_TOKEN_BYTES = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04])

const RTP_PACKET = new Uint8Array([
    0x80, 0x78, 0x00, 0x2a, 0x00, 0x00, 0x03, 0xc0, 0xce, 0x88, 0x6e, 0x56, 0x11, 0x22, 0x33, 0x44
])

const PEER_MEDIA = new Uint8Array([0x80, 0x78, 0x00, 0x2b, 0x00, 0x00, 0x07, 0x80, 0xce, 0x88])

interface FakeRelay {
    readonly port: number
    readonly received: Uint8Array[]
    reply(data: Uint8Array): void
    close(): Promise<void>
}

async function startFakeRelay(): Promise<FakeRelay> {
    const socket = dgram.createSocket('udp4')
    const received: Uint8Array[] = []
    let lastPort = 0
    let lastAddress = ''

    socket.on('message', (msg, rinfo) => {
        received.push(new Uint8Array(msg))
        lastPort = rinfo.port
        lastAddress = rinfo.address
    })

    await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve))

    return {
        port: socket.address().port,
        received,
        reply: (data) => {
            if (lastPort) socket.send(data, lastPort, lastAddress)
        },
        close: () => new Promise<void>((resolve) => socket.close(resolve))
    }
}

async function waitFor(done: () => boolean, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (!done() && Date.now() < deadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, 5))
    }
    return done()
}

/**
 * Walks the attributes of a STUN message with an independent reader: a 20-byte
 * header, then type/length/value triplets padded to the 32-bit word. Written
 * out here so a defect shared by encoder and decoder cannot make a test pass.
 */
function readStunAttribute(packet: Uint8Array, wanted: number): Uint8Array | null {
    const messageLength = (packet[2] << 8) | packet[3]
    let offset = STUN_HEADER_LENGTH

    while (offset + 4 <= STUN_HEADER_LENGTH + messageLength && offset + 4 <= packet.length) {
        const type = (packet[offset] << 8) | packet[offset + 1]
        const length = (packet[offset + 2] << 8) | packet[offset + 3]
        const end = offset + 4 + length
        if (end > packet.length) return null
        if (type === wanted) return packet.subarray(offset + 4, end)
        offset = end + ((4 - (length % 4)) % 4)
    }

    return null
}

function isAllocate(packet: Uint8Array): boolean {
    return packet[0] === STUN_ALLOCATE_TYPE[0] && packet[1] === STUN_ALLOCATE_TYPE[1]
}

function isPing(packet: Uint8Array): boolean {
    if (packet.length !== STUN_HEADER_LENGTH) return false
    for (let i = 0; i < STUN_PING_PREFIX.length; i++) {
        if (packet[i] !== STUN_PING_PREFIX[i]) return false
    }
    return true
}

/**
 * Configures one relay over the raw UDP transport. `port` is what the WebRTC
 * path would dial and `originalPort` what the relay advertised for itself, so
 * the two can be told apart by which socket the datagrams land on.
 */
async function configureRawRelay(relay: WaSctpRelay, advertisedPort: number): Promise<void> {
    relay.setSsrc(0x11223344)
    relay.setSubscriptionSsrc(0x55667788)
    await relay.configureRelays([
        {
            ip: '127.0.0.1',
            port: WEB_CLIENT_PORT,
            originalPort: advertisedPort,
            token: 'relay-token',
            rawToken: RELAY_TOKEN_BYTES,
            key: 'relay-key',
            relayId: 1,
            name: 'raw-probe'
        }
    ])
}

/**
 * The relay advertises where it listens and the raw transport takes it at its
 * word. The rewrite to the web client port is a WhatsApp Web preference for
 * its own legs, not a property of the relay, and a raw leg that inherited it
 * would dial a port nothing answers on. The fake relay binds an ephemeral port
 * that can never be the rewritten one, so this only passes if the advertised
 * port was used.
 */
test('a raw leg dials the advertised port, not the web client rewrite', async () => {
    const fake = await startFakeRelay()
    const relay = new WaSctpRelay({ useRawUdpTransport: true })

    try {
        assert.notEqual(fake.port, WEB_CLIENT_PORT)
        await configureRawRelay(relay, fake.port)
        assert.ok(await waitFor(() => fake.received.length >= 1, 3_000), 'relay got nothing')
    } finally {
        relay.cleanup()
        await fake.close()
    }
})

test('a raw leg opens with an allocate carrying the relay token verbatim', async () => {
    const fake = await startFakeRelay()
    const relay = new WaSctpRelay({ useRawUdpTransport: true })

    try {
        await configureRawRelay(relay, fake.port)
        assert.ok(await waitFor(() => fake.received.some(isAllocate), 3_000), 'no allocate arrived')

        const allocate = fake.received.find(isAllocate)
        assert.ok(allocate)
        assert.deepEqual([...allocate.subarray(4, 8)], [...STUN_MAGIC_COOKIE])

        const credential = readStunAttribute(allocate, ATTR_RELAY_CREDENTIAL)
        assert.ok(credential, 'the allocate carries no relay credential')
        assert.deepEqual([...credential], [...RELAY_TOKEN_BYTES])
    } finally {
        relay.cleanup()
        await fake.close()
    }
})

/**
 * The keepalive of the raw path is the same 20-byte 0x0801 the data channel
 * path sends, and it carries the transaction id of the connection it keeps
 * alive - the same one the allocate stamped.
 */
test('a raw leg keeps the relay alive with the bare 0x0801 ping', async () => {
    const fake = await startFakeRelay()
    const relay = new WaSctpRelay({ useRawUdpTransport: true })

    try {
        await configureRawRelay(relay, fake.port)
        assert.ok(await waitFor(() => fake.received.some(isPing), 3_000), 'no ping arrived')

        const ping = fake.received.find(isPing)
        const allocate = fake.received.find(isAllocate)
        assert.ok(ping)
        assert.ok(allocate)
        assert.equal(ping.length, STUN_HEADER_LENGTH)
        assert.deepEqual([...ping.subarray(8, 20)], [...allocate.subarray(8, 20)])
    } finally {
        relay.cleanup()
        await fake.close()
    }
})

test('broadcast puts media on the raw socket byte for byte', async () => {
    const fake = await startFakeRelay()
    const relay = new WaSctpRelay({ useRawUdpTransport: true })

    try {
        await configureRawRelay(relay, fake.port)
        assert.ok(await waitFor(() => fake.received.length >= 1, 3_000), 'leg never registered')

        relay.broadcast(RTP_PACKET.slice().buffer)

        assert.ok(
            await waitFor(
                () => fake.received.some((packet) => packet.length === RTP_PACKET.length),
                3_000
            ),
            'the media packet never arrived'
        )
        const media = fake.received.find((packet) => packet.length === RTP_PACKET.length)
        assert.ok(media)
        assert.deepEqual([...media], [...RTP_PACKET])
    } finally {
        relay.cleanup()
        await fake.close()
    }
})

test('what the relay sends back reaches the media pipeline unchanged', async () => {
    const fake = await startFakeRelay()
    const relay = new WaSctpRelay({ useRawUdpTransport: true })
    const inbound: Uint8Array[] = []
    relay.on('relay_receive', (event: { data: Uint8Array }) => {
        inbound.push(new Uint8Array(event.data))
    })

    try {
        await configureRawRelay(relay, fake.port)
        assert.ok(await waitFor(() => fake.received.length >= 1, 3_000), 'leg never registered')

        fake.reply(PEER_MEDIA)

        assert.ok(await waitFor(() => inbound.length >= 1, 3_000), 'nothing reached the pipeline')
        assert.deepEqual([...inbound[0]], [...PEER_MEDIA])
    } finally {
        relay.cleanup()
        await fake.close()
    }
})

/**
 * Nothing selects the raw transport on its own. The relays a credential-length
 * heuristic would have picked - the ones WebRTC cannot reach - are the ones
 * measured to accept the allocate, answer every ping and forward none of the
 * peer's media, so the transport stays off until it is asked for by name.
 *
 * The enabled relay beside it is the clock: its registration is what proves the
 * default one had long enough to open a socket and opened none. A fixed sleep
 * would assume that instead, and would keep passing if the raw path only got
 * slower to register.
 */
test('the raw transport stays off unless it is asked for', async () => {
    const offFake = await startFakeRelay()
    const onFake = await startFakeRelay()
    const off = new WaSctpRelay()
    const on = new WaSctpRelay({ useRawUdpTransport: true })

    try {
        await Promise.all([
            configureRawRelay(off, offFake.port),
            configureRawRelay(on, onFake.port)
        ])
        assert.ok(
            await waitFor(() => onFake.received.length >= 1, 3_000),
            'the enabled transport never registered, so the comparison proves nothing'
        )
        assert.deepEqual(offFake.received, [], 'a default relay must not open a raw socket')
    } finally {
        off.cleanup()
        on.cleanup()
        await offFake.close()
        await onFake.close()
    }
})
