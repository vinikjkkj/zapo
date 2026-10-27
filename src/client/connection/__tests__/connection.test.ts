import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

import { WaConnectionManager } from '@client/connection/WaConnectionManager'
import { WaReceiptQueue } from '@client/connection/WaReceiptQueue'
import { createNoopLogger } from '@infra/log/types'
import { WA_DEFAULTS } from '@protocol/constants'

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
        logger: createNoopLogger(),
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
        },
        onPostPairReconnected: () => undefined
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

    manager.setClockSkewMs(1_234, 'test')
    assert.equal(manager.getClockSkewMs(), 1_234)

    manager.setClockSkewMs(Number.NaN, 'test')
    assert.equal(manager.getClockSkewMs(), 1_234)

    manager.setClockSkewMs(Number.POSITIVE_INFINITY, 'test')
    assert.equal(manager.getClockSkewMs(), 1_234)

    manager.setClockSkewMs(-500, 'test')
    assert.equal(manager.getClockSkewMs(), -500)

    await manager.clearStoredCredentials()
    assert.equal(clearedCredentialsCalls, 1)
})

interface PairRestartHarness {
    readonly manager: WaConnectionManager
    readonly oldComms: { readonly stopCalls: number; readonly serverClose: () => void }
    readonly counts: { readonly restarts: number; readonly postPair: number }
}

function createPairRestartHarness(t: TestContext): PairRestartHarness {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    let stopCalls = 0
    let hold: (() => void) | null = null
    const comms = {
        stopComms: async () => {
            stopCalls += 1
        },
        holdForServerRestart: (onClosed: () => void) => {
            hold = onClosed
        }
    }
    const counts = { restarts: 0, postPair: 0 }
    const manager = new WaConnectionManager({
        logger: createNoopLogger(),
        options: {} as never,
        authClient: {
            clearTransientState: async () => undefined,
            getCurrentCredentials: () => ({ meJid: '5511999999999@s.whatsapp.net' })
        } as never,
        keepAlive: { stop: () => undefined } as never,
        nodeOrchestrator: { clearPending: () => undefined } as never,
        nodeTransport: { bindComms: () => undefined } as never,
        getPassiveTasks: () => null,
        clearStoredCredentials: async () => undefined,
        onPostPairReconnected: () => {
            counts.postPair += 1
        }
    })
    const internals = manager as unknown as {
        comms: unknown
        frameHandler: unknown
        startCommsWithCredentials: () => Promise<void>
    }
    internals.comms = comms
    internals.frameHandler = async () => undefined
    internals.startCommsWithCredentials = async () => {
        counts.restarts += 1
    }
    return {
        manager,
        oldComms: {
            get stopCalls() {
                return stopCalls
            },
            serverClose: () => hold?.()
        },
        counts
    }
}

async function settle(): Promise<void> {
    for (let i = 0; i < 5; i += 1) {
        await new Promise<void>((resolve) => setImmediate(resolve))
    }
}

test('pairing waits for the server and does not stop comms by itself', async (t) => {
    const { manager, oldComms, counts } = createPairRestartHarness(t)

    manager.awaitServerRestartAfterPairing()
    await settle()

    assert.equal(oldComms.stopCalls, 0)
    assert.equal(counts.restarts, 0)
    assert.equal(counts.postPair, 0)
})

test('stream:error 515 after pairing restarts once and is claimed from the generic path', async (t) => {
    const { manager, oldComms, counts } = createPairRestartHarness(t)
    manager.awaitServerRestartAfterPairing()

    assert.equal(manager.handleServerRestartRequest(), true)
    assert.equal(manager.handleServerRestartRequest(), true)
    oldComms.serverClose()
    t.mock.timers.tick(WA_DEFAULTS.PAIRING_RESTART_WAIT_MS)
    await settle()

    assert.equal(oldComms.stopCalls, 1)
    assert.equal(counts.restarts, 1)
    assert.equal(counts.postPair, 1)
})

test('a server close after pairing restarts once', async (t) => {
    const { manager, oldComms, counts } = createPairRestartHarness(t)
    manager.awaitServerRestartAfterPairing()

    oldComms.serverClose()
    oldComms.serverClose()
    t.mock.timers.tick(WA_DEFAULTS.PAIRING_RESTART_WAIT_MS)
    await settle()

    assert.equal(oldComms.stopCalls, 1)
    assert.equal(counts.restarts, 1)
    assert.equal(counts.postPair, 1)
})

test('the fallback timer restarts after pairing once when the server stays silent', async (t) => {
    const { manager, oldComms, counts } = createPairRestartHarness(t)
    manager.awaitServerRestartAfterPairing()

    t.mock.timers.tick(WA_DEFAULTS.PAIRING_RESTART_WAIT_MS - 1)
    await settle()
    assert.equal(counts.restarts, 0)

    t.mock.timers.tick(1)
    await settle()
    oldComms.serverClose()
    await settle()

    assert.equal(oldComms.stopCalls, 1)
    assert.equal(counts.restarts, 1)
    assert.equal(counts.postPair, 1)
})

test('disconnecting while waiting for the server restart cancels it', async (t) => {
    const { manager, oldComms, counts } = createPairRestartHarness(t)
    manager.awaitServerRestartAfterPairing()

    await manager.disconnect()
    assert.equal(manager.handleServerRestartRequest(), false)
    oldComms.serverClose()
    t.mock.timers.tick(WA_DEFAULTS.PAIRING_RESTART_WAIT_MS)
    await settle()

    assert.equal(oldComms.stopCalls, 1)
    assert.equal(counts.restarts, 0)
    assert.equal(counts.postPair, 0)
})

test('stream:error 515 outside the pairing window is left to the generic path', (t) => {
    const { manager } = createPairRestartHarness(t)

    assert.equal(manager.handleServerRestartRequest(), false)
})
