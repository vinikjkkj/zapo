import assert from 'node:assert/strict'
import test from 'node:test'

import { WA_READY_STATES } from '@protocol/constants'
import { WaMobileTcpSocket, WaMobileTcpSocketCtor } from '@transport/node/WaMobileTcpSocket'

test('WaMobileTcpSocketCtor exposes the class identity for RawWebSocketConstructor wiring', () => {
    assert.equal(WaMobileTcpSocketCtor, WaMobileTcpSocket)
})

test('WaMobileTcpSocket starts in CONNECTING and marks binaryType=arraybuffer', () => {
    const socket = new WaMobileTcpSocket('tcp://127.0.0.1:1')
    assert.equal(socket.readyState, WA_READY_STATES.CONNECTING)
    assert.equal(socket.binaryType, 'arraybuffer')
    socket.close()
})

test('WaMobileTcpSocket.send throws when readyState is not OPEN', () => {
    const socket = new WaMobileTcpSocket('tcp://127.0.0.1:1')
    assert.throws(() => socket.send(new Uint8Array([0])), /non-OPEN/)
    assert.throws(() => socket.send('hello'), /non-OPEN/)
    socket.close()
})

test('WaMobileTcpSocket rejects malformed port in url', () => {
    assert.throws(() => new WaMobileTcpSocket('tcp://127.0.0.1:notaport'), /invalid port/)
    assert.throws(() => new WaMobileTcpSocket('tcp://127.0.0.1:123abc'), /invalid port/)
    assert.throws(() => new WaMobileTcpSocket('tcp://127.0.0.1:-1'), /invalid port/)
    assert.throws(() => new WaMobileTcpSocket('tcp://127.0.0.1:0'), /port out of range/)
    assert.throws(() => new WaMobileTcpSocket('tcp://127.0.0.1:70000'), /port out of range/)
})

test('WaMobileTcpSocket rejects empty host', () => {
    assert.throws(() => new WaMobileTcpSocket('tcp://:443'), /invalid host/)
    assert.throws(() => new WaMobileTcpSocket('tcp://'), /invalid host/)
})

test('WaMobileTcpSocket accepts tcp:// scheme, bare host:port, trailing slash and query string', () => {
    const unreachable = (url: string): void => {
        const sock = new WaMobileTcpSocket(url)
        sock.onerror = () => undefined
        sock.close()
    }
    unreachable('tcp://127.0.0.1:1')
    unreachable('127.0.0.1:1')
    unreachable('tcp://127.0.0.1:1/ignored')
    unreachable('tcp://127.0.0.1:1?ED=CAUIAggS')
})

test('WaMobileTcpSocket.close is idempotent when already CLOSED', () => {
    const socket = new WaMobileTcpSocket('tcp://127.0.0.1:1')
    socket.onerror = () => undefined
    socket.close()
    socket.close()
    assert.ok(
        socket.readyState === WA_READY_STATES.CLOSING ||
            socket.readyState === WA_READY_STATES.CLOSED
    )
})
