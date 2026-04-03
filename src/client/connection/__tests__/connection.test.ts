import assert from 'node:assert/strict'
import test from 'node:test'

import { WaConnectionManager } from '@client/connection/WaConnectionManager'
import { WaReceiptQueue } from '@client/connection/WaReceiptQueue'
import type { Logger } from '@infra/log/types'

function createLogger(): Logger {
    return {
        level: 'trace',
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
    }
}

test('receipt queue enforces max size and drains in insertion order', () => {
    const queue = new WaReceiptQueue({ maxSize: 2 })

    queue.enqueue({ tag: 'receipt', attrs: { id: 'r1' } })
    queue.enqueue({ tag: 'receipt', attrs: { id: 'r2' } })
    queue.enqueue({ tag: 'receipt', attrs: { id: 'r3' } })

    const drained = queue.take()
    assert.equal(drained.length, 2)
    assert.equal(drained[0].attrs.id, 'r2')
    assert.equal(drained[1].attrs.id, 'r3')
    assert.equal(queue.size(), 0)
    assert.equal(
        queue.shouldQueue(
            { tag: 'receipt', attrs: { id: 'r4' } },
            new Error('socket closed (1006)')
        ),
        true
    )
    assert.equal(
        queue.shouldQueue({ tag: 'message', attrs: {} }, new Error('socket closed')),
        false
    )
})

test('receipt queue ignores enqueues when max size is zero', () => {
    const queue = new WaReceiptQueue({ maxSize: 0 })
    for (let index = 0; index < 70; index += 1) {
        queue.enqueue({ tag: 'receipt', attrs: { id: `r${index}` } })
    }
    assert.equal(queue.size(), 0)
    assert.deepEqual(queue.take(), [])
})

test('connection manager exposes media cache and clock skew helpers', async () => {
    let clearedCredentialsCalls = 0

    const manager = new WaConnectionManager({
        logger: createLogger(),
        options: {} as never,
        authClient: {
            clearTransientState: async () => undefined
        } as never,
        keepAlive: {
            stop: () => undefined
        } as never,
        nodeOrchestrator: {
            clearPending: () => undefined
        } as never,
        nodeTransport: {
            bindComms: () => undefined
        } as never,
        getPassiveTasks: () => null,
        clearStoredCredentials: async () => {
            clearedCredentialsCalls += 1
        }
    })

    const mediaConn = {
        auth: 'a',
        ttl: 60,
        expiresAtMs: Date.now() + 60_000,
        hosts: [
            {
                hostname: 'mmg.whatsapp.net',
                maxContentLengthBytes: 1_000,
                isFallback: false
            }
        ]
    }
    manager.setMediaConnCache(mediaConn)

    assert.equal(manager.getMediaConnCache(), mediaConn)
    manager.updateClockSkewFromSuccess(Math.floor((Date.now() + 2_000) / 1_000))
    assert.notEqual(manager.getClockSkewMs(), null)
    assert.equal(manager.isConnected(), false)

    await manager.clearStoredCredentials()
    assert.equal(clearedCredentialsCalls, 1)
})
