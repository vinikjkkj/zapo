import assert from 'node:assert/strict'
import test from 'node:test'

import { BackgroundQueue } from '@infra/perf/BackgroundQueue'
import { PromiseDedup } from '@infra/perf/PromiseDedup'
import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
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

test('store lock serializes writes for the same key in fifo order', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const lock = new StoreLock()
    const order: string[] = []
    let running = 0
    let maxRunning = 0

    const run = (label: string, waitMs: number) =>
        lock.run('k', async () => {
            running += 1
            maxRunning = Math.max(maxRunning, running)
            order.push(`${label}:start`)
            await delay(waitMs)
            order.push(`${label}:end`)
            running -= 1
        })

    const done = Promise.all([run('a', 15), run('b', 5), run('c', 1)])
    await settleWithMockTimers(t, done, 5, 30)
    await done
    assert.equal(maxRunning, 1)
    assert.deepEqual(order, ['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end'])
})

test('store lock allows parallel writes for different keys', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const lock = new StoreLock()
    let running = 0
    let maxRunning = 0

    const done = Promise.all([
        lock.run('a', async () => {
            running += 1
            maxRunning = Math.max(maxRunning, running)
            await delay(20)
            running -= 1
        }),
        lock.run('b', async () => {
            running += 1
            maxRunning = Math.max(maxRunning, running)
            await delay(20)
            running -= 1
        })
    ])
    await settleWithMockTimers(t, done, 10, 10)
    await done

    assert.equal(maxRunning, 2)
})

test('store lock runMany avoids deadlock for inverted key ordering', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const lock = new StoreLock()
    const completed: string[] = []

    const done = Promise.all([
        lock.runMany(['b', 'a'], async () => {
            await delay(10)
            completed.push('first')
        }),
        lock.runMany(['a', 'b'], async () => {
            await delay(10)
            completed.push('second')
        })
    ])
    await settleWithMockTimers(t, done, 10, 20)
    await done

    assert.equal(completed.length, 2)
})

test('store lock runMany handles large key sets without stack overflow', async () => {
    const lock = new StoreLock()
    const keyCount = 8_000
    const keys = new Array<string>(keyCount)
    for (let index = 0; index < keyCount; index += 1) {
        keys[index] = `k-${index}`
    }

    let ran = false
    await lock.runMany(keys, async () => {
        ran = true
    })

    assert.equal(ran, true)
})

test('store lock continues after task failure', async () => {
    const lock = new StoreLock()

    await assert.rejects(
        () =>
            lock.run('k', async () => {
                throw new Error('boom')
            }),
        /boom/
    )

    const value = await lock.run('k', async () => 42)
    assert.equal(value, 42)
})

test('store lock shutdown rejects new operations after draining', async () => {
    const lock = new StoreLock()
    await lock.shutdown()
    assert.throws(
        () =>
            lock.run('k', async () => {
                return 1
            }),
        /store lock is closed/
    )
})

test('shared-exclusive gate allows concurrent shared operations', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const gate = new SharedExclusiveGate()
    let running = 0
    let maxRunning = 0

    const done = Promise.all([
        gate.runShared(async () => {
            running += 1
            maxRunning = Math.max(maxRunning, running)
            await delay(20)
            running -= 1
        }),
        gate.runShared(async () => {
            running += 1
            maxRunning = Math.max(maxRunning, running)
            await delay(20)
            running -= 1
        })
    ])
    await settleWithMockTimers(t, done, 10, 10)
    await done

    assert.equal(maxRunning, 2)
})

test('shared-exclusive gate blocks shared operations while exclusive is pending', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const gate = new SharedExclusiveGate()
    const order: string[] = []

    const firstShared = gate.runShared(async () => {
        order.push('shared-1:start')
        await delay(20)
        order.push('shared-1:end')
    })
    await flushMicrotasks(4)
    const exclusive = gate.runExclusive(async () => {
        order.push('exclusive')
    })
    await flushMicrotasks(4)
    const secondShared = gate.runShared(async () => {
        order.push('shared-2')
    })

    const done = Promise.all([firstShared, exclusive, secondShared])
    await settleWithMockTimers(t, done, 10, 20)
    await done

    assert.deepEqual(order, ['shared-1:start', 'shared-1:end', 'exclusive', 'shared-2'])
})

test('promise dedup shares one in-flight task per key', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const dedup = new PromiseDedup()
    let calls = 0

    const run = () =>
        dedup.run('same', async () => {
            calls += 1
            await delay(10)
            return 7
        })

    const done = Promise.all([run(), run(), run()])
    await settleWithMockTimers(t, done, 10, 10)
    const [a, b, c] = await done
    assert.equal(a, 7)
    assert.equal(b, 7)
    assert.equal(c, 7)
    assert.equal(calls, 1)
})

test('promise dedup retries after a rejected task', async () => {
    const dedup = new PromiseDedup()
    let attempts = 0

    await assert.rejects(
        () =>
            dedup.run('same', async () => {
                attempts += 1
                throw new Error('failed')
            }),
        /failed/
    )

    const value = await dedup.run('same', async () => {
        attempts += 1
        return 9
    })
    assert.equal(value, 9)
    assert.equal(attempts, 2)
})

test('promise dedup deduplicates re-entrant calls for the same key', async () => {
    const dedup = new PromiseDedup()
    let calls = 0
    let nested: Promise<number> | null = null

    const outer = dedup.run('same', async () => {
        calls += 1
        nested = dedup.run('same', async () => {
            calls += 1
            return 2
        })
        return 1
    })

    const outerValue = await outer
    assert.equal(outerValue, 1)
    assert.equal(calls, 1)
    assert.ok(nested)
    const nestedValue = await nested
    assert.equal(nestedValue, 1)
})

test('background queue coalesces pending writes for the same key', async () => {
    let releaseBlockedKey: () => void = () => undefined
    const blocked = new Promise<void>((resolve) => {
        releaseBlockedKey = resolve
    })
    const writes: Array<{ readonly key: string; readonly value: number }> = []

    const queue = new BackgroundQueue<string, { readonly value: number }>(async (key, value) => {
        if (key === 'block') {
            await blocked
        }
        writes.push({ key, value: value.value })
    })

    const blockWrite = queue.enqueueAsync('block', { value: 0 })
    const first = queue.enqueueAsync('same', { value: 1 })
    const second = queue.enqueueAsync('same', { value: 2 })

    releaseBlockedKey()
    await Promise.all([blockWrite, first, second])

    assert.deepEqual(writes, [
        { key: 'block', value: 0 },
        { key: 'same', value: 2 }
    ])
})

test('background queue retries using the latest pending value', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const attempts: number[] = []
    let resolveErrorSignal: (() => void) | null = null
    const errorSignal = new Promise<void>((resolve) => {
        resolveErrorSignal = resolve
    })

    const queue = new BackgroundQueue<string, { readonly version: number }>(
        async (_key, value) => {
            attempts.push(value.version)
            if (attempts.length === 1) {
                throw new Error('transient')
            }
        },
        {
            onError: () => {
                resolveErrorSignal?.()
            }
        }
    )

    const first = queue.enqueueAsync('k', { version: 1 })
    await errorSignal
    const second = queue.enqueueAsync('k', { version: 2 })

    const done = Promise.all([first, second])
    await settleWithMockTimers(t, done, 20, 20)
    await done
    assert.deepEqual(attempts, [1, 2])
})

test('background queue keeps failed retry payload and rejects incompatible pending value', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    let releaseFirstAttempt: () => void = () => undefined
    const firstAttemptGate = new Promise<void>((resolve) => {
        releaseFirstAttempt = () => resolve()
    })
    const attempts: string[] = []

    const queue = new BackgroundQueue<string, { readonly kind: string }>(
        async (_key, value) => {
            attempts.push(value.kind)
            if (attempts.length === 1) {
                await firstAttemptGate
                throw new Error('transient')
            }
        },
        {
            coalesce: (previous, incoming) => {
                if (previous.kind !== incoming.kind) {
                    throw new Error('incompatible coalesce payload')
                }
                return incoming
            }
        }
    )

    const first = queue.enqueueAsync('k', { kind: 'first' })
    await flushMicrotasks(8)
    const second = queue.enqueueAsync('k', { kind: 'second' })

    releaseFirstAttempt()
    await flushMicrotasks(8)
    await assert.rejects(() => second, /incompatible coalesce payload/)

    t.mock.timers.tick(100)
    await flushMicrotasks(8)
    await first

    assert.deepEqual(attempts, ['first', 'first'])
})

test('background queue capacity accounts for keys waiting on retry timers', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const writes: string[] = []
    let shouldFailFirstAttempt = true
    const queue = new BackgroundQueue<string, { readonly value: number }>(
        async (key) => {
            if (key === 'a' && shouldFailFirstAttempt) {
                shouldFailFirstAttempt = false
                throw new Error('transient')
            }
            writes.push(key)
        },
        { maxPendingKeys: 1 }
    )

    const first = queue.enqueueAsync('a', { value: 1 })
    await flushMicrotasks(8)

    let secondSettled = false
    const second = queue.enqueueAsync('b', { value: 1 })
    void second.then(
        () => {
            secondSettled = true
        },
        () => {
            secondSettled = true
        }
    )
    await flushMicrotasks(8)
    assert.equal(secondSettled, false)

    const done = Promise.all([first, second])
    await settleWithMockTimers(t, done, 10, 40)
    await done

    assert.deepEqual(writes, ['a', 'b'])
})

test('background queue retries do not block unrelated keys', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    let badAttempts = 0
    const writes: string[] = []
    const queue = new BackgroundQueue<string, { readonly version: number }>(async (key) => {
        if (key === 'bad' && badAttempts === 0) {
            badAttempts += 1
            throw new Error('transient')
        }
        writes.push(key)
    })

    const bad = queue.enqueueAsync('bad', { version: 1 })
    await flushMicrotasks(4)
    const good = queue.enqueueAsync('good', { version: 1 })
    await flushMicrotasks(8)
    await good

    assert.deepEqual(writes, ['good'])

    t.mock.timers.tick(100)
    await flushMicrotasks(8)
    await bad

    assert.deepEqual(writes, ['good', 'bad'])
})

test('background queue validates constructor limits', () => {
    assert.throws(
        () => new BackgroundQueue(async () => undefined, { maxPendingKeys: 0 }),
        /maxPendingKeys/
    )
    assert.throws(
        () => new BackgroundQueue(async () => undefined, { flushTimeoutMs: 0 }),
        /flushTimeoutMs/
    )
})
