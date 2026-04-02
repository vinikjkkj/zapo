import assert from 'node:assert/strict'
import test from 'node:test'

import { WaOfflineResumeCoordinator } from '@client/coordinators/WaOfflineResumeCoordinator'
import type { WaOfflineResumeEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import { buildOfflineBatchNode } from '@transport/node/builders/offline'
import type { BinaryNode } from '@transport/types'

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

async function flushMicrotasks(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
}

test('offline resume coordinator emits preview event and requests offline batches', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const sentNodes: BinaryNode[] = []
    const emittedEvents: WaOfflineResumeEvent[] = []
    const coordinator = new WaOfflineResumeCoordinator({
        logger: createLogger(),
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

    assert.equal(coordinator.isResuming, true)
    assert.deepEqual(emittedEvents, [
        {
            status: 'resuming',
            totalMessages: 3,
            remainingMessages: 3,
            forced: false
        }
    ])

    t.mock.timers.tick(100)
    await flushMicrotasks()

    assert.deepEqual(sentNodes, [buildOfflineBatchNode(200)])
})

test('offline resume coordinator decrements pending messages and force completes on timeout', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const emittedEvents: WaOfflineResumeEvent[] = []
    const coordinator = new WaOfflineResumeCoordinator({
        logger: createLogger(),
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
        totalMessages: 2,
        remainingMessages: 1,
        forced: true
    })
})

test('offline resume coordinator completes when offline completion bulletin arrives', () => {
    const emittedEvents: WaOfflineResumeEvent[] = []
    const coordinator = new WaOfflineResumeCoordinator({
        logger: createLogger(),
        runtime: {
            sendNode: async () => undefined,
            emitOfflineResume: (event) => {
                emittedEvents.push(event)
            }
        }
    })

    coordinator.handleOfflinePreview(1)
    coordinator.trackOfflineStanza()
    coordinator.handleOfflineComplete()

    assert.equal(coordinator.isComplete, true)
    assert.deepEqual(emittedEvents[1], {
        status: 'complete',
        totalMessages: 1,
        remainingMessages: 0,
        forced: false
    })
})
