import assert from 'node:assert/strict'
import test from 'node:test'

import type { WebSocket } from 'ws'

import { WaFakeConnection } from '../WaFakeConnection'
import {
    type WaFakeClientPrologue,
    WaFakeFrameSocket,
    type WaFakeFrameSocketHandlers
} from '../WaFakeFrameSocket'

class StubSocket {
    public readonly sent: Uint8Array[] = []
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>()

    public on(event: string, listener: (...args: unknown[]) => void): this {
        const arr = this.listeners.get(event) ?? []
        arr.push(listener)
        this.listeners.set(event, arr)
        return this
    }

    public send(data: Uint8Array): void {
        this.sent.push(data)
    }

    public close(): void {
        // no-op for tests
    }

    public emit(event: string, ...args: unknown[]): void {
        const arr = this.listeners.get(event) ?? []
        for (const listener of arr) {
            listener(...args)
        }
    }
}

function buildFrameSocket(): { stub: StubSocket; socket: WaFakeFrameSocket } {
    const stub = new StubSocket()
    const connection = new WaFakeConnection('c0', stub as unknown as WebSocket)
    const socket = new WaFakeFrameSocket(connection)
    return { stub, socket }
}

function pushBinary(stub: StubSocket, ...chunks: Uint8Array[]): void {
    for (const chunk of chunks) {
        stub.emit('message', chunk, true)
    }
}

test('parses bare version-header prologue and forwards subsequent frames', () => {
    const { stub, socket } = buildFrameSocket()

    let prologue: WaFakeClientPrologue | null = null
    const frames: Uint8Array[] = []
    const handlers: WaFakeFrameSocketHandlers = {
        onPrologue: (p) => {
            prologue = p
        },
        onFrame: (f) => frames.push(f)
    }
    socket.setHandlers(handlers)

    const versionHeader = Uint8Array.from([0x57, 0x41, 0x06, 0x03])
    const body = Uint8Array.from([0xaa, 0xbb, 0xcc])
    const frame = Uint8Array.from([0x00, 0x00, body.byteLength, ...body])

    pushBinary(stub, new Uint8Array([...versionHeader, ...frame]))

    const captured = prologue as WaFakeClientPrologue | null
    assert.ok(captured)
    assert.equal(captured.protocolVersion, 0x06)
    assert.equal(captured.dictVersion, 0x03)
    assert.equal(captured.routingInfo, null)

    assert.equal(frames.length, 1)
    assert.deepEqual(Array.from(frames[0]), Array.from(body))
})

test('parses routing-prefixed prologue', () => {
    const { stub, socket } = buildFrameSocket()

    let prologue: WaFakeClientPrologue | null = null
    socket.setHandlers({
        onPrologue: (p) => {
            prologue = p
        }
    })

    const routing = Uint8Array.from([0x10, 0x20, 0x30])
    const routingHeader = Uint8Array.from([
        0xed,
        (routing.byteLength >> 16) & 0xff,
        (routing.byteLength >> 8) & 0xff,
        routing.byteLength & 0xff
    ])
    const versionHeader = Uint8Array.from([0x57, 0x41, 0x06, 0x03])

    pushBinary(stub, new Uint8Array([...routingHeader, ...routing, ...versionHeader]))

    const captured = prologue as WaFakeClientPrologue | null
    assert.ok(captured)
    assert.deepEqual(Array.from(captured.routingInfo as Uint8Array), Array.from(routing))
})

test('handles split prologue across multiple chunks', () => {
    const { stub, socket } = buildFrameSocket()

    let prologue: WaFakeClientPrologue | null = null
    const frames: Uint8Array[] = []
    socket.setHandlers({
        onPrologue: (p) => {
            prologue = p
        },
        onFrame: (f) => frames.push(f)
    })

    pushBinary(stub, new Uint8Array([0x57, 0x41]))
    assert.equal(prologue, null)
    pushBinary(stub, new Uint8Array([0x06, 0x03, 0x00]))
    assert.ok(prologue)
    assert.equal(frames.length, 0)

    pushBinary(stub, new Uint8Array([0x00, 0x02]))
    assert.equal(frames.length, 0)
    pushBinary(stub, new Uint8Array([0xde, 0xad]))
    assert.equal(frames.length, 1)
    assert.deepEqual(Array.from(frames[0]), [0xde, 0xad])
})

test('drains multiple frames from a single buffer', () => {
    const { stub, socket } = buildFrameSocket()

    const frames: Uint8Array[] = []
    socket.setHandlers({ onFrame: (f) => frames.push(f) })

    const data = Uint8Array.from([
        0x57, 0x41, 0x06, 0x03, 0x00, 0x00, 0x02, 0x01, 0x02, 0x00, 0x00, 0x03, 0x0a, 0x0b, 0x0c
    ])
    pushBinary(stub, data)

    assert.equal(frames.length, 2)
    assert.deepEqual(Array.from(frames[0]), [0x01, 0x02])
    assert.deepEqual(Array.from(frames[1]), [0x0a, 0x0b, 0x0c])
})

test('sendFrame writes a 3-byte length prefix', () => {
    const { stub, socket } = buildFrameSocket()

    const body = Uint8Array.from([0xff, 0xee, 0xdd, 0xcc])
    socket.sendFrame(body)

    assert.equal(stub.sent.length, 1)
    const expected = Uint8Array.from([0x00, 0x00, body.byteLength, ...body])
    assert.deepEqual(Array.from(stub.sent[0]), Array.from(expected))
})

test('rejects invalid prologue magic with onError', () => {
    const { stub, socket } = buildFrameSocket()

    let captured: Error | null = null
    socket.setHandlers({
        onError: (err) => {
            captured = err
        }
    })

    pushBinary(stub, new Uint8Array([0x00, 0x00, 0x00, 0x00]))

    const err = captured as Error | null
    assert.ok(err)
    assert.match(err.message, /invalid prologue magic/)
})
