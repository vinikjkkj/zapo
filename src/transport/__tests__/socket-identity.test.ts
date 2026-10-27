import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import test, { type TestContext } from 'node:test'

import { X25519 } from '@crypto'
import { createNoopLogger, type Logger, type LogLevel } from '@infra/log/types'
import { WA_READY_STATES } from '@protocol/constants'
import { WaMobileTcpSocketCtor } from '@transport/node/WaMobileTcpSocket'
import { WaNoiseSession } from '@transport/noise/WaNoiseSession'
import type {
    RawWebSocket,
    RawWebSocketConstructor,
    SocketCloseInfo,
    WaNoiseConfig,
    WebSocketEventLike
} from '@transport/types'
import { WaComms } from '@transport/WaComms'
import { WaWebSocket } from '@transport/WaWebSocket'

class FakeSocket implements RawWebSocket {
    public binaryType = 'arraybuffer'
    public readyState: number = WA_READY_STATES.CONNECTING
    public onopen: ((event: WebSocketEventLike) => void) | null = null
    public onclose: ((event: WebSocketEventLike) => void) | null = null
    public onerror: ((event: WebSocketEventLike) => void) | null = null
    public onmessage: ((event: WebSocketEventLike) => void) | null = null
    public readonly sent: Uint8Array[] = []
    public readonly closeCalls: { readonly code?: number; readonly reason?: string }[] = []
    /** When false the socket stays in CLOSING until the test calls {@link serverClose}. */
    public autoClose = true

    public open(): void {
        this.readyState = WA_READY_STATES.OPEN
        this.onopen?.({})
    }

    public receive(data: unknown): void {
        this.onmessage?.({ data })
    }

    public serverClose(code = 1000): void {
        this.readyState = WA_READY_STATES.CLOSED
        this.onclose?.({ code, reason: '', wasClean: true })
    }

    public close(code?: number, reason?: string): void {
        this.closeCalls.push({ code, reason })
        this.readyState = WA_READY_STATES.CLOSING
        if (this.autoClose) {
            setImmediate(() => this.serverClose(code))
        }
    }

    public send(data: string | ArrayBuffer | Uint8Array): void {
        this.sent.push(data as Uint8Array)
    }
}

interface RecordedLog {
    readonly level: LogLevel
    readonly message: string
    readonly context?: Readonly<Record<string, unknown>>
}

function createRecordingLogger(): { readonly logger: Logger; readonly records: RecordedLog[] } {
    const records: RecordedLog[] = []
    const record =
        (level: LogLevel) =>
        (message: string, context?: Readonly<Record<string, unknown>>): void => {
            records.push({ level, message, context })
        }
    const logger: Logger = {
        level: 'trace',
        trace: record('trace'),
        debug: record('debug'),
        info: record('info'),
        warn: record('warn'),
        error: record('error'),
        child: () => logger
    }
    return { logger, records }
}

function createSocketFactory(): {
    readonly ctor: RawWebSocketConstructor
    readonly sockets: FakeSocket[]
} {
    const sockets: FakeSocket[] = []
    const ctor = class extends FakeSocket {
        public constructor() {
            super()
            sockets.push(this)
        }
    } as unknown as RawWebSocketConstructor
    return { ctor, sockets }
}

async function waitUntil(condition: () => boolean, label: string): Promise<void> {
    const deadline = Date.now() + 2_000
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error(`timed out waiting for ${label}`)
        }
        await new Promise<void>((resolve) => setImmediate(resolve))
    }
}

async function flush(): Promise<void> {
    for (let i = 0; i < 3; i += 1) {
        await new Promise<void>((resolve) => setImmediate(resolve))
    }
}

async function withinMs<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} not settled within ${ms}ms`)), ms)
    })
    try {
        return await Promise.race([promise, deadline])
    } finally {
        clearTimeout(timer)
    }
}

interface WebSocketHarness {
    readonly ws: WaWebSocket
    readonly sockets: FakeSocket[]
    readonly messages: number[]
    readonly closes: SocketCloseInfo[]
    readonly connect: (index: number) => Promise<FakeSocket>
}

function createWebSocketHarness(timeoutIntervalMs: number): WebSocketHarness {
    const { ctor, sockets } = createSocketFactory()
    const ws = new WaWebSocket(
        {
            url: 'wss://example.invalid/ws',
            rawWebSocketConstructor: ctor,
            timeoutIntervalMs
        },
        createNoopLogger()
    )
    const messages: number[] = []
    const closes: SocketCloseInfo[] = []
    ws.setHandlers({
        onMessage: (payload) => {
            messages.push(payload[0])
        },
        onClose: (info) => {
            closes.push(info)
        }
    })
    const connect = async (index: number): Promise<FakeSocket> => {
        const opening = ws.open()
        await waitUntil(() => Boolean(sockets[index]?.onopen), `socket ${index} handlers`)
        sockets[index].open()
        await opening
        return sockets[index]
    }
    return { ws, sockets, messages, closes, connect }
}

test('WaWebSocket ignores messages and close of a socket it already replaced', async () => {
    const { ws, messages, closes, connect } = createWebSocketHarness(30)
    const first = await connect(0)
    first.autoClose = false
    const closed = await ws.close()
    assert.equal(closed?.wasClean, false)

    const second = await connect(1)
    first.receive(new Uint8Array([1]))
    first.serverClose()
    await flush()

    assert.deepEqual(messages, [])
    assert.deepEqual(closes, [])
    assert.equal(ws.isOpen(), true)

    second.receive(new Uint8Array([2]))
    await flush()
    assert.deepEqual(messages, [2])
})

test('WaWebSocket drops messages delivered after close() was called', async () => {
    const { ws, messages, closes, connect } = createWebSocketHarness(1_000)
    const socket = await connect(0)
    socket.autoClose = false

    const closing = ws.close()
    assert.equal(socket.readyState, WA_READY_STATES.CLOSING)
    socket.receive(new Uint8Array([1]))
    await flush()
    assert.deepEqual(messages, [])

    socket.serverClose()
    const info = await closing
    assert.equal(info?.wasClean, true)
    assert.equal(closes.length, 1)
})

test('WaWebSocket drops a message still being normalized when close() is called', async () => {
    const { ws, messages, connect } = createWebSocketHarness(1_000)
    const socket = await connect(0)

    socket.receive({ arrayBuffer: () => Promise.resolve(new Uint8Array([9]).buffer) })
    const closing = ws.close()
    await closing
    await flush()

    assert.deepEqual(messages, [])
})

test('WaWebSocket resolves every concurrent close() on the same socket', async () => {
    const { ws, closes, connect } = createWebSocketHarness(1_000)
    const socket = await connect(0)
    socket.autoClose = false

    const first = ws.close(1000, 'first')
    const second = ws.close(1000, 'second')
    socket.serverClose()
    const [firstInfo, secondInfo] = await withinMs(
        Promise.all([first, second]),
        500,
        'concurrent close()'
    )

    assert.equal(firstInfo?.wasClean, true)
    assert.equal(secondInfo?.wasClean, true)
    assert.equal(socket.closeCalls.length, 1)
    assert.equal(closes.length, 1)
})

test('WaWebSocket stale close does not resolve the close waiter of the current socket', async () => {
    const { ws, connect } = createWebSocketHarness(150)
    const first = await connect(0)
    first.autoClose = false
    await ws.close()

    const second = await connect(1)
    second.autoClose = false
    let settled = false
    const closing = ws.close().then(() => {
        settled = true
    })
    first.serverClose()
    await flush()
    assert.equal(settled, false)

    second.serverClose()
    await withinMs(closing, 500, 'current close()')
    assert.equal(settled, true)
})

test('WaWebSocket over WaMobileTcpSocket drops data arriving after close() and still settles', async (t) => {
    const server = createServer({ allowHalfOpen: true }, (peer) => {
        peer.on('error', () => undefined)
        peer.on('end', () => {
            peer.write(Buffer.from([7]))
            peer.end()
        })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    t.after(() => server.close())
    const address = server.address()
    assert.ok(address && typeof address === 'object')

    const ws = new WaWebSocket(
        {
            url: `tcp://127.0.0.1:${address.port}`,
            rawWebSocketConstructor: WaMobileTcpSocketCtor,
            timeoutIntervalMs: 2_000
        },
        createNoopLogger()
    )
    const messages: number[] = []
    const closes: SocketCloseInfo[] = []
    ws.setHandlers({
        onMessage: (payload) => {
            messages.push(payload[0])
        },
        onClose: (info) => {
            closes.push(info)
        }
    })
    await ws.open()

    const info = await withinMs(ws.close(), 3_000, 'tcp close()')

    assert.ok(info)
    assert.deepEqual(messages, [])
    assert.equal(closes.length, 1)
    assert.equal(ws.isOpen(), false)
})

interface CommsInternals {
    noiseSession: WaNoiseSession | null
    resumeHandshakeFailures: number
}

async function createCommsHarness(
    t: TestContext,
    options: { readonly resume?: boolean; readonly timeoutIntervalMs?: number } = {}
): Promise<{
    readonly comms: WaComms
    readonly internals: CommsInternals
    readonly sockets: FakeSocket[]
    readonly records: RecordedLog[]
    readonly connect: (index: number) => Promise<FakeSocket>
}> {
    const { ctor, sockets } = createSocketFactory()
    const { logger, records } = createRecordingLogger()
    const clientStaticKeyPair = await X25519.generateKeyPair()
    const serverStaticKey = options.resume ? (await X25519.generateKeyPair()).pubKey : undefined
    const noise: WaNoiseConfig = {
        clientStaticKeyPair,
        isRegistered: false,
        registrationPayload: new Uint8Array([1]),
        verifyCertificateChain: false,
        serverStaticKey
    }
    const comms = new WaComms(
        {
            urls: ['wss://example.invalid/ws'],
            rawWebSocketConstructor: ctor,
            timeoutIntervalMs: options.timeoutIntervalMs ?? 50,
            reconnectIntervalMs: 60_000,
            noise
        },
        logger
    )
    t.after(() => withinMs(comms.stopComms(), 2_000, 'stopComms'))
    const connect = async (index: number): Promise<FakeSocket> => {
        await waitUntil(() => Boolean(sockets[index]?.onopen), `socket ${index} handlers`)
        sockets[index].open()
        return sockets[index]
    }
    return { comms, internals: comms as unknown as CommsInternals, sockets, records, connect }
}

function stubInstantHandshake(t: TestContext): void {
    t.mock.method(WaNoiseSession.prototype, 'start', () => Promise.resolve())
}

function droppedPayloadWarnings(records: readonly RecordedLog[]): RecordedLog[] {
    return records.filter(
        (record) =>
            record.level === 'warn' &&
            (record.message.startsWith('socket payload dropped') ||
                record.message.includes('before noise session init'))
    )
}

test('WaComms keeps the new connection alive when a replaced socket closes late', async (t) => {
    stubInstantHandshake(t)
    const { comms, sockets, records, connect } = await createCommsHarness(t)
    comms.startComms(() => undefined)
    const first = await connect(0)
    await comms.waitForConnection()

    first.autoClose = false
    await comms.closeSocketAndResume()
    const second = await connect(1)
    await comms.waitForConnection()

    first.serverClose()
    first.receive(new Uint8Array([1, 2, 3]))
    await flush()

    assert.equal(comms.getCommsState().connected, true)
    assert.equal(sockets.length, 2)
    assert.deepEqual(second.closeCalls, [])
    assert.deepEqual(droppedPayloadWarnings(records), [])
})

test('WaComms does not warn nor feed the next session with the burst after a decode failure', async (t) => {
    stubInstantHandshake(t)
    const pushed: { readonly session: WaNoiseSession; readonly chunk: Uint8Array }[] = []
    t.mock.method(
        WaNoiseSession.prototype,
        'pushWireChunk',
        function (this: WaNoiseSession, chunk: Uint8Array) {
            if (chunk.byteLength === 0) {
                return Promise.resolve([])
            }
            pushed.push({ session: this, chunk })
            return chunk[0] === 1 ? Promise.reject(new Error('bad mac')) : Promise.resolve([])
        }
    )
    const { comms, sockets, records, connect } = await createCommsHarness(t)
    comms.startComms(() => undefined)
    const first = await connect(0)
    await comms.waitForConnection()

    first.receive(new Uint8Array([1]))
    first.receive(new Uint8Array([2]))
    first.receive(new Uint8Array([3]))
    await waitUntil(() => sockets.length === 2, 'resume to reopen the socket')
    first.receive(new Uint8Array([4]))
    const second = await connect(1)
    await comms.waitForConnection()
    second.receive(new Uint8Array([5]))
    await flush()

    assert.equal(pushed.length, 2)
    assert.deepEqual(
        pushed.map((entry) => entry.chunk[0]),
        [1, 5]
    )
    assert.notEqual(pushed[0].session, pushed[1].session)
    assert.deepEqual(droppedPayloadWarnings(records), [])
})

test('WaComms logs a payload without a noise session as a warning only when unexpected', async (t) => {
    const { comms, internals, sockets, records, connect } = await createCommsHarness(t)
    stubInstantHandshake(t)
    comms.startComms(() => undefined)
    const socket = await connect(0)
    await comms.waitForConnection()
    internals.noiseSession = null

    socket.receive(new Uint8Array([1, 2, 3, 4]))
    await flush()
    const unexpected = droppedPayloadWarnings(records)
    assert.equal(unexpected.length, 1)
    assert.deepEqual(unexpected[0].context, {
        byteLength: 4,
        started: true,
        preventRetry: false,
        resumeInFlight: false
    })

    records.length = 0
    ;(comms as unknown as { started: boolean }).started = false
    socket.receive(new Uint8Array([1, 2, 3, 4]))
    await flush()
    assert.deepEqual(droppedPayloadWarnings(records), [])
    assert.ok(
        records.some(
            (record) =>
                record.level === 'debug' && record.message.startsWith('socket payload dropped')
        )
    )
    assert.equal(sockets.length, 1)
})

test('WaComms ignores the rejection of a handshake that a resume already replaced', async (t) => {
    const startedHandshakes: { readonly session: WaNoiseSession; readonly done: Promise<void> }[] =
        []
    const originalStart = WaNoiseSession.prototype.start
    t.mock.method(
        WaNoiseSession.prototype,
        'start',
        function (this: WaNoiseSession, config: WaNoiseConfig) {
            const done = originalStart.call(this, config)
            startedHandshakes.push({ session: this, done })
            return done
        }
    )
    const { comms, internals, sockets, connect } = await createCommsHarness(t, { resume: true })
    comms.startComms(() => undefined)
    const first = await connect(0)
    await waitUntil(() => first.sent.length === 1, 'first client hello')

    await comms.closeSocketAndResume()
    const second = await connect(1)
    await waitUntil(() => second.sent.length === 1, 'second client hello')

    await assert.rejects(
        withinMs(startedHandshakes[0].done, 1_000, 'replaced handshake'),
        /comms connection state reset/
    )
    await flush()

    assert.equal(startedHandshakes.length, 2)
    assert.equal(internals.noiseSession, startedHandshakes[1].session)
    assert.equal(internals.resumeHandshakeFailures, 0)
    assert.deepEqual(second.closeCalls, [])
    assert.equal(second.sent.length, 1)
    assert.equal(sockets.length, 2)
    assert.equal(comms.getCommsState().connected, false)
})

test('WaComms does not mark connected when a replaced session finishes its handshake', async (t) => {
    const releases: (() => void)[] = []
    t.mock.method(
        WaNoiseSession.prototype,
        'start',
        () => new Promise<void>((resolve) => releases.push(resolve))
    )
    const { comms, connect } = await createCommsHarness(t)
    comms.startComms(() => undefined)
    await connect(0)
    await waitUntil(() => releases.length === 1, 'first handshake')

    await comms.closeSocketAndResume()
    releases[0]()
    await flush()

    assert.equal(comms.getCommsState().connected, false)
})

test('WaComms closeSocketAndResume is a no-op while a resume is already in flight', async (t) => {
    stubInstantHandshake(t)
    const { comms, sockets, connect } = await createCommsHarness(t)
    comms.startComms(() => undefined)
    const first = await connect(0)
    await comms.waitForConnection()

    first.autoClose = false
    const firstResume = comms.closeSocketAndResume()
    await withinMs(comms.closeSocketAndResume(), 500, 'second resume')
    await withinMs(comms.closeSocketAndResume(), 500, 'third resume')
    assert.equal(first.closeCalls.length, 1)

    await withinMs(firstResume, 1_000, 'first resume')
    await connect(1)
    await comms.waitForConnection()
    await flush()
    assert.equal(sockets.length, 2)
})

function reconnectLogs(records: readonly RecordedLog[]): RecordedLog[] {
    return records.filter((record) => record.message === 'socket closed, scheduling reconnect')
}

test('WaComms hands a server close to the restart hold instead of scheduling a reconnect', async (t) => {
    stubInstantHandshake(t)
    const { comms, sockets, records, connect } = await createCommsHarness(t)
    comms.startComms(() => undefined)
    const socket = await connect(0)
    await comms.waitForConnection()
    let held = 0
    comms.holdForServerRestart(() => {
        held += 1
    })

    socket.serverClose()
    await flush()

    assert.equal(held, 1)
    assert.deepEqual(reconnectLogs(records), [])
    assert.equal(sockets.length, 1)
    assert.equal(comms.getCommsState().connected, false)
})

test('WaComms schedules a reconnect on a server close when nothing holds it', async (t) => {
    stubInstantHandshake(t)
    const { comms, records, connect } = await createCommsHarness(t)
    comms.startComms(() => undefined)
    const socket = await connect(0)
    await comms.waitForConnection()

    socket.serverClose()
    await flush()

    assert.equal(reconnectLogs(records).length, 1)
})

test('WaComms drops the restart hold on a resume', async (t) => {
    stubInstantHandshake(t)
    const { comms, records, connect } = await createCommsHarness(t)
    comms.startComms(() => undefined)
    await connect(0)
    await comms.waitForConnection()
    let held = 0
    comms.holdForServerRestart(() => {
        held += 1
    })

    await comms.closeSocketAndResume()
    const second = await connect(1)
    await comms.waitForConnection()
    second.serverClose()
    await flush()

    assert.equal(held, 0)
    assert.equal(reconnectLogs(records).length, 1)
})
