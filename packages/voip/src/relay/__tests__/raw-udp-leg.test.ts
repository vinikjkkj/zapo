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

interface FakeRelay {
    readonly port: number
    readonly received: Uint8Array[]
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

function createLeg(port: number, returnPathTimeoutMs?: number): LegHarness {
    const inbound: Uint8Array[] = []
    const failures: string[] = []
    let open = false

    const leg = new WaRawUdpLeg({
        ip: '127.0.0.1',
        port,
        logger: createNoopLogger(),
        returnPathTimeoutMs,
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
