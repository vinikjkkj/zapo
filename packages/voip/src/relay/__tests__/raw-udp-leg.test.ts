import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'

import { RAW_UDP_NO_RETURN_PATH, WaRawUdpLeg } from '../WaRawUdpLeg.js'

/**
 * A 20-byte STUN keepalive answer, written out here instead of built: method
 * `0x0802`, zero attribute length, then the magic cookie `0x2112a442` and a
 * transaction id. The bytes are the thing under test - a leg must not accept
 * this as proof that media flows - so the test states them rather than asking
 * the package to produce them.
 */
const STUN_PONG = new Uint8Array([
    0x08, 0x02, 0x00, 0x00, 0x21, 0x12, 0xa4, 0x42, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
    0x99, 0xaa, 0xbb, 0xcc
])

/**
 * The first two bytes of an RTP packet: version 2 in the top bits, payload
 * type 120, which is the one WhatsApp's opus stream rides on. What matters to
 * the leg is only that the leading bits are `10`, which no STUN message has.
 */
const RTP_PACKET = new Uint8Array([
    0x80, 0x78, 0x00, 0x2a, 0x00, 0x00, 0x03, 0xc0, 0xce, 0x88, 0x6e, 0x56, 0xde, 0xad, 0xbe, 0xef
])

/** Long enough to prove a window did not close, short enough to prove one did. */
const SHORT_RETURN_PATH_TIMEOUT_MS = 150

/** The same, for the window a confirmed leg slides along. */
const SHORT_STALL_MS = 200

interface FakeRelay {
    readonly port: number
    readonly received: Uint8Array[]
    /** Port the leg's datagrams came from, or 0 before any arrived. */
    senderPort(): number
    reply(data: Uint8Array): void
    close(): Promise<void>
}

/** A socket standing in for the relay: records what arrives, answers on demand. */
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
        senderPort: () => lastPort,
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

interface LegHarness {
    readonly leg: WaRawUdpLeg
    readonly inbound: Uint8Array[]
    readonly failures: string[]
    readonly opened: () => boolean
}

function createLeg(
    port: number,
    returnPathTimeoutMs?: number,
    stallTimeoutMs?: number
): LegHarness {
    const inbound: Uint8Array[] = []
    const failures: string[] = []
    let open = false

    const leg = new WaRawUdpLeg({
        ip: '127.0.0.1',
        port,
        logger: createNoopLogger(),
        returnPathTimeoutMs,
        stallTimeoutMs,
        onOpen: () => {
            open = true
        },
        onMessage: (data) => {
            inbound.push(new Uint8Array(data))
        },
        onFailure: (reason) => {
            failures.push(reason)
        }
    })

    return { leg, inbound, failures, opened: () => open }
}

test('a raw leg carries datagrams to the relay and back verbatim', async () => {
    const relay = await startFakeRelay()
    const harness = createLeg(relay.port)

    try {
        harness.leg.open()
        assert.ok(await waitFor(harness.opened, 2_000), 'leg never opened')

        assert.equal(harness.leg.send(RTP_PACKET), true)
        assert.ok(await waitFor(() => relay.received.length >= 1, 2_000), 'relay got nothing')
        assert.deepEqual([...relay.received[0]], [...RTP_PACKET])

        relay.reply(STUN_PONG)
        assert.ok(await waitFor(() => harness.inbound.length >= 1, 2_000), 'leg received nothing')
        assert.deepEqual([...harness.inbound[0]], [...STUN_PONG])
    } finally {
        harness.leg.close()
        await relay.close()
    }
})

test('a closed raw leg stops sending and closing it again is harmless', async () => {
    const relay = await startFakeRelay()
    const harness = createLeg(relay.port)

    try {
        harness.leg.open()
        assert.ok(await waitFor(harness.opened, 2_000), 'leg never opened')

        harness.leg.close()
        harness.leg.close()

        assert.equal(harness.leg.isOpen, false)
        assert.equal(harness.leg.send(RTP_PACKET), false)
        assert.deepEqual(harness.failures, [], 'closing is not a failure')
    } finally {
        await relay.close()
    }
})

/**
 * The property the measurement forced into the design. A relay that takes the
 * uplink and forwards nothing back does not merely fail to carry the call: the
 * act of sending moves the peer's stream onto this leg, so the media that was
 * arriving elsewhere stops arriving at all. The leg has to notice and undo it
 * itself; there is no passive fallback once the uplink has re-elected the
 * relay.
 */
test('a leg that sends media and gets none back rolls itself back', async () => {
    const relay = await startFakeRelay()
    const harness = createLeg(relay.port, SHORT_RETURN_PATH_TIMEOUT_MS)

    try {
        harness.leg.open()
        assert.ok(await waitFor(harness.opened, 2_000), 'leg never opened')

        harness.leg.send(RTP_PACKET)

        assert.ok(
            await waitFor(() => harness.failures.length >= 1, 2_000),
            'the return-path window never closed'
        )
        assert.deepEqual(harness.failures, [RAW_UDP_NO_RETURN_PATH])
        assert.equal(harness.leg.isOpen, false, 'a rolled back leg stops carrying traffic')
        assert.equal(harness.leg.hasReturnPath, false)
    } finally {
        harness.leg.close()
        await relay.close()
    }
})

/**
 * On the relay that took 1761 uplink packets and returned no media, 34 pongs
 * came back. A leg that counted any inbound datagram would have declared that
 * one healthy, kept sending, and kept the call dead.
 */
test('keepalive answers do not satisfy the return path', async () => {
    const relay = await startFakeRelay()
    const harness = createLeg(relay.port, SHORT_RETURN_PATH_TIMEOUT_MS)

    try {
        harness.leg.open()
        assert.ok(await waitFor(harness.opened, 2_000), 'leg never opened')

        harness.leg.send(RTP_PACKET)
        await waitFor(() => relay.received.length >= 1, 2_000)
        relay.reply(STUN_PONG)
        assert.ok(await waitFor(() => harness.inbound.length >= 1, 2_000), 'pong never arrived')

        assert.ok(
            await waitFor(() => harness.failures.length >= 1, 2_000),
            'a pong kept the window open'
        )
        assert.deepEqual(harness.failures, [RAW_UDP_NO_RETURN_PATH])
        assert.equal(harness.leg.hasReturnPath, false)
    } finally {
        harness.leg.close()
        await relay.close()
    }
})

test('media coming back confirms the leg and keeps it alive', async () => {
    const relay = await startFakeRelay()
    const harness = createLeg(relay.port, SHORT_RETURN_PATH_TIMEOUT_MS)

    try {
        harness.leg.open()
        assert.ok(await waitFor(harness.opened, 2_000), 'leg never opened')

        harness.leg.send(RTP_PACKET)
        await waitFor(() => relay.received.length >= 1, 2_000)
        relay.reply(RTP_PACKET)
        assert.ok(await waitFor(() => harness.leg.hasReturnPath, 2_000), 'return path not seen')

        await new Promise<void>((resolve) => setTimeout(resolve, SHORT_RETURN_PATH_TIMEOUT_MS * 3))

        assert.deepEqual(harness.failures, [], 'a confirmed leg is never rolled back')
        assert.equal(harness.leg.isOpen, true)
    } finally {
        harness.leg.close()
        await relay.close()
    }
})

/**
 * The allocate and the keepalive ask the relay for nothing it has to forward,
 * so they must not start the clock: a leg that registers and waits for the
 * call to connect before it has media to send would otherwise kill itself
 * while doing exactly the right thing.
 */
test('a STUN-only uplink does not arm the return-path window', async () => {
    const relay = await startFakeRelay()
    const harness = createLeg(relay.port, SHORT_RETURN_PATH_TIMEOUT_MS)

    try {
        harness.leg.open()
        assert.ok(await waitFor(harness.opened, 2_000), 'leg never opened')

        harness.leg.send(STUN_PONG)
        await new Promise<void>((resolve) => setTimeout(resolve, SHORT_RETURN_PATH_TIMEOUT_MS * 3))

        assert.deepEqual(harness.failures, [])
        assert.equal(harness.leg.isOpen, true)
    } finally {
        harness.leg.close()
        await relay.close()
    }
})

/**
 * The connected socket is the identity of the leg: the relay pairs the peer's
 * stream against the 5-tuple it last saw, so a datagram from any other source
 * is not this leg's media and must neither be delivered nor confirm the return
 * path. The relay's own answer is the clock here - it proves the stranger's
 * datagram had time to arrive and was dropped, rather than that the assertion
 * ran early.
 */
test('a datagram from anywhere but the relay never reaches the leg', async () => {
    const relay = await startFakeRelay()
    const stranger = dgram.createSocket('udp4')
    const harness = createLeg(relay.port, SHORT_RETURN_PATH_TIMEOUT_MS)

    try {
        harness.leg.open()
        assert.ok(await waitFor(harness.opened, 2_000), 'leg never opened')

        /** STUN reveals the ephemeral port without arming the window. */
        harness.leg.send(STUN_PONG)
        assert.ok(await waitFor(() => relay.senderPort() !== 0, 2_000), 'relay saw no datagram')

        await new Promise<void>((resolve, reject) => {
            stranger.send(RTP_PACKET, relay.senderPort(), '127.0.0.1', (err) =>
                err ? reject(err) : resolve()
            )
        })
        relay.reply(STUN_PONG)

        assert.ok(await waitFor(() => harness.inbound.length >= 1, 2_000), 'nothing arrived at all')
        assert.equal(harness.inbound.length, 1)
        assert.deepEqual([...harness.inbound[0]], [...STUN_PONG], 'the stranger got through')
        assert.equal(harness.leg.hasReturnPath, false)
        assert.deepEqual(harness.failures, [])
    } finally {
        harness.leg.close()
        stranger.close()
        await relay.close()
    }
})

/**
 * `dgram.Socket.connect` hands its failure to the callback and emits no
 * `error` event, so a leg that ignored the argument would announce a socket
 * that never connected. The failure is injected rather than provoked with an
 * unreachable address: connecting a UDP socket asks the far end for nothing and
 * succeeds against addresses no packet ever reaches.
 */
test('a connect that fails in its callback never opens the leg', async (t) => {
    const closes: number[] = []
    const socket = {
        on: () => undefined,
        connect: (_port: number, _address: string, callback: (err?: Error) => void) => {
            setImmediate(() => callback(new Error('EADDRNOTAVAIL')))
        },
        send: () => undefined,
        close: () => closes.push(1)
    }
    t.mock.method(dgram, 'createSocket', () => socket as unknown as dgram.Socket)

    const harness = createLeg(9999)
    harness.leg.open()

    assert.ok(await waitFor(() => harness.failures.length >= 1, 2_000), 'the error was swallowed')
    assert.deepEqual(harness.failures, ['raw_udp_connect_failed'])
    assert.equal(harness.opened(), false, 'a leg that never connected must not open')
    assert.equal(harness.leg.isOpen, false)
    assert.deepEqual(closes, [1], 'the socket is closed on the way out')
})

/**
 * A relay that forwards for a while and then stops leaves the call mute with
 * every socket still healthy, so the window has to keep watching after it is
 * first satisfied. The pings answered throughout are the point: a relay that
 * forwards nothing still pongs, so only media may slide the window.
 */
test('a leg the relay stops forwarding to is rolled back mid-call', async () => {
    const relay = await startFakeRelay()
    const harness = createLeg(relay.port, SHORT_RETURN_PATH_TIMEOUT_MS, SHORT_STALL_MS)
    const pongs = setInterval(() => relay.reply(STUN_PONG), 40)

    try {
        harness.leg.open()
        assert.ok(await waitFor(harness.opened, 2_000), 'leg never opened')

        harness.leg.send(RTP_PACKET)
        await waitFor(() => relay.received.length >= 1, 2_000)
        relay.reply(RTP_PACKET)
        assert.ok(await waitFor(() => harness.leg.hasReturnPath, 2_000), 'return path not seen')

        assert.ok(
            await waitFor(() => harness.failures.length >= 1, 2_000),
            'the window never closed on a leg that stopped receiving'
        )
        assert.deepEqual(harness.failures, [RAW_UDP_NO_RETURN_PATH])
        assert.equal(harness.leg.isOpen, false)
        assert.ok(harness.inbound.length > 2, 'the relay answered pings throughout')
    } finally {
        clearInterval(pongs)
        harness.leg.close()
        await relay.close()
    }
})

/**
 * The other half of the same window: a leg still being fed must survive it.
 * Inbound RTCP is what carries this on a quiet call - measured arriving every
 * 1.0 to 1.1 s for a whole call, silent source included - and the leg counts it
 * for what it is, one more non-STUN datagram.
 */
test('media that keeps arriving keeps sliding the window', async () => {
    const relay = await startFakeRelay()
    const harness = createLeg(relay.port, SHORT_RETURN_PATH_TIMEOUT_MS, SHORT_STALL_MS)
    const feed = setInterval(() => relay.reply(RTP_PACKET), 40)

    try {
        harness.leg.open()
        assert.ok(await waitFor(harness.opened, 2_000), 'leg never opened')
        harness.leg.send(RTP_PACKET)

        await new Promise<void>((resolve) => setTimeout(resolve, SHORT_STALL_MS * 4))

        assert.deepEqual(harness.failures, [], 'a leg still receiving media was rolled back')
        assert.equal(harness.leg.isOpen, true)
        assert.equal(harness.leg.hasReturnPath, true)
    } finally {
        clearInterval(feed)
        harness.leg.close()
        await relay.close()
    }
})

/**
 * The window measures an elapsed time, and a system clock can be stepped in
 * either direction under a running call - by NTP, by a suspend, by hand. A
 * backward step is the half that hides: it makes the last datagram look like it
 * arrived in the future, so a window read off the wall clock re-arms itself for
 * however far the clock moved and a relay that stopped forwarding is never
 * caught. The leg is fed once and then left silent here, so the only thing that
 * moves is the clock.
 */
test('a wall-clock step back does not hold a stalled leg open', async (t) => {
    const relay = await startFakeRelay()
    const harness = createLeg(relay.port, SHORT_RETURN_PATH_TIMEOUT_MS, SHORT_STALL_MS)

    try {
        harness.leg.open()
        assert.ok(await waitFor(harness.opened, 2_000), 'leg never opened')

        harness.leg.send(RTP_PACKET)
        await waitFor(() => relay.received.length >= 1, 2_000)
        relay.reply(RTP_PACKET)
        assert.ok(await waitFor(() => harness.leg.hasReturnPath, 2_000), 'return path not seen')

        const steppedBack = Date.now() - 86_400_000
        t.mock.method(Date, 'now', () => steppedBack)

        /**
         * Slept rather than polled: `waitFor` reads the wall clock too, so on a
         * leg that wrongly survives it would never reach its own deadline.
         */
        await new Promise<void>((resolve) => setTimeout(resolve, SHORT_STALL_MS * 3))

        assert.deepEqual(
            harness.failures,
            [RAW_UDP_NO_RETURN_PATH],
            'a clock step kept a stalled leg alive'
        )
        assert.equal(harness.leg.isOpen, false)
    } finally {
        harness.leg.close()
        await relay.close()
    }
})
