import assert from 'node:assert/strict'
import test from 'node:test'

import type { Logger } from '@infra/log/types'
import { WaKeepAlive } from '@transport/keepalive/WaKeepAlive'

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

test('keepalive issues ping queries when connected and idle', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    let queryCount = 0
    const keepAlive = new WaKeepAlive({
        logger: createLogger(),
        nodeOrchestrator: {
            hasPending: () => false,
            query: async () => {
                queryCount += 1
                return { tag: 'iq', attrs: { type: 'result' } }
            }
        },
        getComms: () =>
            ({
                getCommsState: () => ({ connected: true })
            }) as never,
        intervalMs: 5,
        timeoutMs: 5,
        jitterRatio: 0,
        minJitterMs: 0
    })

    keepAlive.start()
    t.mock.timers.tick(5)
    await Promise.resolve()
    await Promise.resolve()
    keepAlive.stop()

    assert.ok(queryCount >= 1)
})

test('keepalive asks comms to resume when ping fails', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    let resumed = 0
    const keepAlive = new WaKeepAlive({
        logger: createLogger(),
        nodeOrchestrator: {
            hasPending: () => false,
            query: async () => {
                throw new Error('timeout')
            }
        },
        getComms: () =>
            ({
                getCommsState: () => ({ connected: true }),
                closeSocketAndResume: async () => {
                    resumed += 1
                }
            }) as never,
        intervalMs: 5,
        timeoutMs: 5,
        jitterRatio: 0,
        minJitterMs: 0
    })

    keepAlive.start()
    t.mock.timers.tick(5)
    await Promise.resolve()
    await Promise.resolve()
    keepAlive.stop()

    assert.ok(resumed >= 1)
})

test('keepalive reports clock skew from ping response with half-RTT compensation', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const skewUpdates: number[] = []
    let nowMs = 1_700_000_000_000
    const originalNow = Date.now
    Date.now = () => nowMs
    t.after(() => {
        Date.now = originalNow
    })

    const serverTSeconds = 1_700_000_001
    const latencyMs = 200

    const keepAlive = new WaKeepAlive({
        logger: createLogger(),
        nodeOrchestrator: {
            hasPending: () => false,
            query: async () => {
                nowMs += latencyMs
                return {
                    tag: 'iq',
                    attrs: { type: 'result', t: String(serverTSeconds) }
                }
            }
        },
        getComms: () =>
            ({
                getCommsState: () => ({ connected: true })
            }) as never,
        intervalMs: 5,
        timeoutMs: 5,
        jitterRatio: 0,
        minJitterMs: 0,
        onClockSkewMs: (value) => skewUpdates.push(value)
    })

    keepAlive.start()
    t.mock.timers.tick(5)
    await Promise.resolve()
    await Promise.resolve()
    keepAlive.stop()

    assert.equal(skewUpdates.length, 1)
    const sentMs = 1_700_000_000_000
    const halfRtt = latencyMs / 2
    const expected = serverTSeconds * 1_000 - (sentMs + halfRtt)
    assert.equal(skewUpdates[0], expected)
})

test('keepalive skips clock skew update when ping response has no t', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const skewUpdates: number[] = []
    const keepAlive = new WaKeepAlive({
        logger: createLogger(),
        nodeOrchestrator: {
            hasPending: () => false,
            query: async () => ({ tag: 'iq', attrs: { type: 'result' } })
        },
        getComms: () =>
            ({
                getCommsState: () => ({ connected: true })
            }) as never,
        intervalMs: 5,
        timeoutMs: 5,
        jitterRatio: 0,
        minJitterMs: 0,
        onClockSkewMs: (value) => skewUpdates.push(value)
    })

    keepAlive.start()
    t.mock.timers.tick(5)
    await Promise.resolve()
    await Promise.resolve()
    keepAlive.stop()

    assert.equal(skewUpdates.length, 0)
})

test('keepalive ignores invalid t attribute', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const skewUpdates: number[] = []
    const keepAlive = new WaKeepAlive({
        logger: createLogger(),
        nodeOrchestrator: {
            hasPending: () => false,
            query: async () => ({
                tag: 'iq',
                attrs: { type: 'result', t: 'not-a-number' }
            })
        },
        getComms: () =>
            ({
                getCommsState: () => ({ connected: true })
            }) as never,
        intervalMs: 5,
        timeoutMs: 5,
        jitterRatio: 0,
        minJitterMs: 0,
        onClockSkewMs: (value) => skewUpdates.push(value)
    })

    keepAlive.start()
    t.mock.timers.tick(5)
    await Promise.resolve()
    await Promise.resolve()
    keepAlive.stop()

    assert.equal(skewUpdates.length, 0)
})
