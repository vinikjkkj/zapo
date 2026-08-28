import assert from 'node:assert/strict'
import test from 'node:test'

import { WaOfflineResumeCoordinator } from '@client/coordinators/WaOfflineResumeCoordinator'
import type { WaOfflineResumeEvent } from '@client/types'
import { createNoopLogger } from '@infra/log/types'
import { buildOfflineBatchNode } from '@transport/node/builders/offline'
import type { BinaryNode } from '@transport/types'

async function flushMicrotasks(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
}

test('offline resume coordinator emits preview event and requests the first offline batch', async () => {
    const sentNodes: BinaryNode[] = []
    const emittedEvents: WaOfflineResumeEvent[] = []
    const coordinator = new WaOfflineResumeCoordinator({
        logger: createNoopLogger(),
        runtime: {
            sendNode: async (node) => {
                sentNodes.push(node)
            },
            emitOfflineResume: (event) => {
                emittedEvents.push(event)
            }
        }
    })

    coordinator.handleOfflinePreview(3)
    await flushMicrotasks()

    assert.equal(coordinator.isResuming, true)
    assert.deepEqual(emittedEvents, [
        {
            status: 'resuming',
            totalStanzas: 3,
            remainingStanzas: 3,
            forced: false
        }
    ])
    assert.deepEqual(sentNodes, [buildOfflineBatchNode(200)])

    coordinator.reset()
})

test('offline resume coordinator decrements pending stanzas and force completes on timeout', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })

    const emittedEvents: WaOfflineResumeEvent[] = []
    const coordinator = new WaOfflineResumeCoordinator({
        logger: createNoopLogger(),
        runtime: {
            sendNode: async () => undefined,
            emitOfflineResume: (event) => {
                emittedEvents.push(event)
            }
        }
    })

    coordinator.handleOfflinePreview(2)
    coordinator.trackOfflineStanza()
    t.mock.timers.tick(60_000)
    await flushMicrotasks()

    assert.equal(coordinator.isComplete, true)
    assert.deepEqual(emittedEvents[1], {
        status: 'complete',
        totalStanzas: 2,
        remainingStanzas: 1,
        forced: true
    })
})

test('offline resume coordinator completes when offline completion bulletin arrives', () => {
    const emittedEvents: WaOfflineResumeEvent[] = []
    const coordinator = new WaOfflineResumeCoordinator({
        logger: createNoopLogger(),
        runtime: {
            sendNode: async () => undefined,
            emitOfflineResume: (event) => {
                emittedEvents.push(event)
            }
        }
    })

    coordinator.handleOfflinePreview(1)
    coordinator.trackOfflineStanza()
    coordinator.handleOfflineComplete(1)

    assert.equal(coordinator.isComplete, true)
    assert.deepEqual(emittedEvents[1], {
        status: 'complete',
        totalStanzas: 1,
        remainingStanzas: 0,
        forced: false
    })
})

test('offline resume coordinator keeps requesting batches until the queue drains', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })

    const sentNodes: BinaryNode[] = []
    const coordinator = new WaOfflineResumeCoordinator({
        logger: createNoopLogger(),
        runtime: {
            sendNode: async (node) => {
                sentNodes.push(node)
            },
            emitOfflineResume: () => undefined
        }
    })

    coordinator.handleOfflinePreview(500)
    await flushMicrotasks()
    assert.equal(sentNodes.length, 1)

    for (let index = 0; index < 200; index += 1) {
        coordinator.trackOfflineStanza()
    }
    await flushMicrotasks()
    assert.equal(sentNodes.length, 1, 'no second request before the debounce elapses')

    t.mock.timers.tick(100)
    await flushMicrotasks()
    assert.equal(sentNodes.length, 2)

    for (let index = 0; index < 200; index += 1) {
        coordinator.trackOfflineStanza()
    }
    t.mock.timers.tick(100)
    await flushMicrotasks()
    assert.equal(sentNodes.length, 3)

    assert.deepEqual(sentNodes, [
        buildOfflineBatchNode(200),
        buildOfflineBatchNode(200),
        buildOfflineBatchNode(200)
    ])

    for (let index = 0; index < 100; index += 1) {
        coordinator.trackOfflineStanza()
    }
    t.mock.timers.tick(1_000)
    await flushMicrotasks()
    assert.equal(sentNodes.length, 4, 'one trailing request, then the loop winds down')

    t.mock.timers.tick(10_000)
    await flushMicrotasks()
    assert.equal(sentNodes.length, 4, 'no stanza arrives, so nothing else is scheduled')

    coordinator.reset()
})

test('offline resume coordinator stops requesting batches once the resume completes', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })

    const sentNodes: BinaryNode[] = []
    const coordinator = new WaOfflineResumeCoordinator({
        logger: createNoopLogger(),
        runtime: {
            sendNode: async (node) => {
                sentNodes.push(node)
            },
            emitOfflineResume: () => undefined
        }
    })

    coordinator.handleOfflinePreview(500)
    await flushMicrotasks()
    coordinator.trackOfflineStanza()
    coordinator.handleOfflineComplete(1)

    t.mock.timers.tick(60_000)
    await flushMicrotasks()

    assert.equal(coordinator.isComplete, true)
    assert.equal(sentNodes.length, 1, 'the pending debounce timer is cancelled on complete')
})

test('offline resume coordinator retries a rejected batch request', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })

    let attempts = 0
    const coordinator = new WaOfflineResumeCoordinator({
        logger: createNoopLogger(),
        runtime: {
            sendNode: async () => {
                attempts += 1
                if (attempts === 1) {
                    throw new Error('socket write failed')
                }
            },
            emitOfflineResume: () => undefined
        }
    })

    coordinator.handleOfflinePreview(500)
    await flushMicrotasks()
    assert.equal(attempts, 1)

    t.mock.timers.tick(100)
    await flushMicrotasks()

    assert.equal(attempts, 2, 'the failed request is retried after the debounce')
    assert.equal(coordinator.isResuming, true)

    coordinator.reset()
})

test('offline resume coordinator gives up after the retry budget is spent', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })

    let attempts = 0
    const coordinator = new WaOfflineResumeCoordinator({
        logger: createNoopLogger(),
        runtime: {
            sendNode: async () => {
                attempts += 1
                throw new Error('socket write failed')
            },
            emitOfflineResume: () => undefined
        }
    })

    coordinator.handleOfflinePreview(500)
    await flushMicrotasks()

    for (let index = 0; index < 10; index += 1) {
        t.mock.timers.tick(100)
        await flushMicrotasks()
    }

    assert.equal(attempts, 1 + 3, 'the initial request plus MAX_BATCH_RETRIES')

    coordinator.reset()
})

test('offline resume coordinator ignores a rejection from a torn-down resume', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })

    const pending: { reject?: () => void } = {}
    let attempts = 0
    const coordinator = new WaOfflineResumeCoordinator({
        logger: createNoopLogger(),
        runtime: {
            sendNode: async () => {
                attempts += 1
                if (attempts === 1) {
                    await new Promise<void>((_resolve, reject) => {
                        pending.reject = () => reject(new Error('stale socket'))
                    })
                }
            },
            emitOfflineResume: () => undefined
        }
    })

    coordinator.handleOfflinePreview(500)
    await flushMicrotasks()
    assert.equal(attempts, 1)

    coordinator.reset()
    coordinator.handleOfflinePreview(500)
    await flushMicrotasks()
    assert.equal(attempts, 2)

    assert.notEqual(pending.reject, undefined)
    pending.reject?.()
    await flushMicrotasks()

    t.mock.timers.tick(1_000)
    await flushMicrotasks()

    assert.equal(attempts, 2, 'the stale rejection neither retries nor clears the new request')

    coordinator.reset()
})
