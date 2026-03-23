import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaMessageStore, WaStoredMessageRecord } from '@store/contracts/message.store'
import { withMessageLock } from '@store/locks/message.lock'
import { delay } from '@util/async'

async function flushMicrotasks(turns = 3): Promise<void> {
    for (let index = 0; index < turns; index += 1) {
        await Promise.resolve()
    }
}

async function settleWithMockTimers(
    t: { readonly mock: { readonly timers: { tick: (ms: number) => void } } },
    target: Promise<unknown>,
    stepMs = 10,
    maxSteps = 100
): Promise<void> {
    let settled = false
    let rejected: unknown = null
    let didReject = false
    void target.then(
        () => {
            settled = true
        },
        (error) => {
            rejected = error
            didReject = true
            settled = true
        }
    )
    for (let step = 0; step < maxSteps && !settled; step += 1) {
        t.mock.timers.tick(stepMs)
        await flushMicrotasks(8)
        await new Promise<void>((resolve) => setImmediate(resolve))
    }
    if (!settled) {
        throw new Error('mock timer steps exhausted before promise settled')
    }
    if (didReject) {
        throw rejected
    }
}

function createMessageStore(
    onUpsert: (record: WaStoredMessageRecord) => Promise<void>
): WaMessageStore {
    const records = new Map<string, WaStoredMessageRecord>()

    return {
        upsert: async (record) => {
            await onUpsert(record)
            records.set(record.id, record)
        },
        upsertBatch: async (batch) => {
            for (const record of batch) {
                await onUpsert(record)
                records.set(record.id, record)
            }
        },
        getById: async (id) => records.get(id) ?? null,
        listByThread: async (threadJid) =>
            [...records.values()].filter((record) => record.threadJid === threadJid),
        deleteById: async (id) => (records.delete(id) ? 1 : 0),
        clear: async () => {
            records.clear()
        }
    }
}

test('message lock serializes writes on the same key', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    let inFlight = 0
    let maxInFlightForSameKey = 0

    const store = withMessageLock(
        createMessageStore(async (record) => {
            if (record.id !== 'same') {
                return
            }
            inFlight += 1
            maxInFlightForSameKey = Math.max(maxInFlightForSameKey, inFlight)
            await delay(20)
            inFlight -= 1
        })
    )

    const done = Promise.all([
        store.upsert({ id: 'same', threadJid: 't', fromMe: true }),
        store.upsert({ id: 'same', threadJid: 't', fromMe: true }),
        store.upsert({ id: 'same', threadJid: 't', fromMe: true })
    ])
    await settleWithMockTimers(t, done, 10, 20)
    await done

    assert.equal(maxInFlightForSameKey, 1)
})

test('message lock allows parallel writes for different keys', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    let inFlight = 0
    let maxInFlight = 0

    const store = withMessageLock(
        createMessageStore(async () => {
            inFlight += 1
            maxInFlight = Math.max(maxInFlight, inFlight)
            await delay(20)
            inFlight -= 1
        })
    )

    const done = Promise.all([
        store.upsert({ id: 'a', threadJid: 't', fromMe: true }),
        store.upsert({ id: 'b', threadJid: 't', fromMe: true })
    ])
    await settleWithMockTimers(t, done, 10, 10)
    await done

    assert.equal(maxInFlight, 2)
})

test('message lock keeps reads as passthrough', async () => {
    let reads = 0
    const store = withMessageLock({
        ...createMessageStore(async () => undefined),
        getById: async (_id) => {
            reads += 1
            return null
        }
    })

    await store.getById('x')
    assert.equal(reads, 1)
})
