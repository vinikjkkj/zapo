import assert from 'node:assert/strict'
import type { Agent } from 'node:http'
import { createServer } from 'node:net'
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

test('WaMobileTcpSocket tunnels mobile TCP through an authenticated HTTP CONNECT proxy', async (t) => {
    let request = ''
    const server = createServer((peer) => {
        let pending = Buffer.alloc(0)
        peer.on('data', (chunk) => {
            if (request) {
                peer.write(chunk)
                return
            }
            pending = Buffer.concat([pending, chunk])
            const end = pending.indexOf('\r\n\r\n')
            if (end === -1) return
            request = pending.subarray(0, end).toString('latin1')
            const remaining = pending.subarray(end + 4)
            peer.write('HTTP/1.1 200 Connection Established\r\n\r\n')
            if (remaining.byteLength > 0) peer.write(remaining)
        })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const agent = {
        proxy: new URL(`http://proxy-user:proxy-pass@127.0.0.1:${address.port}`)
    } as unknown as Agent
    const socket = new WaMobileTcpSocket('tcp://g.whatsapp.net:443', undefined, { agent })
    t.after(() => {
        socket.close()
        server.close()
    })
    socket.onerror = (event) => assert.fail(`unexpected proxy socket error: ${event.reason}`)

    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.close()
            reject(new Error(`proxy open timeout; request=${request}`))
        }, 2_000)
        socket.onopen = () => {
            clearTimeout(timer)
            resolve()
        }
    })
    assert.match(request, /^CONNECT g\.whatsapp\.net:443 HTTP\/1\.1/m)
    assert.match(request, /Proxy-Authorization: Basic cHJveHktdXNlcjpwcm94eS1wYXNz/i)

    const received = new Promise<Uint8Array>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('proxy echo timeout')), 2_000)
        socket.onmessage = (event) => {
            clearTimeout(timer)
            resolve(event.data as Uint8Array)
        }
    })
    socket.send(new Uint8Array([1, 2, 3]))
    assert.deepEqual(await received, new Uint8Array([1, 2, 3]))
})
