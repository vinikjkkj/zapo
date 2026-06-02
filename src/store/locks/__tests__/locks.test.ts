import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaMessageStore, WaStoredMessageRecord } from '@store/contracts/message.store'
import type { WaPreKeyStore } from '@store/contracts/pre-key.store'
import type {
    WaPrivacyTokenStore,
    WaStoredPrivacyTokenRecord
} from '@store/contracts/privacy-token.store'
import { withMessageLock } from '@store/locks/message.lock'
import { withPreKeyLock } from '@store/locks/pre-key.lock'
import { withPrivacyTokenLock } from '@store/locks/privacy-token.lock'
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

function createPrivacyTokenStore(
    onUpsert: (record: WaStoredPrivacyTokenRecord) => Promise<void>
): WaPrivacyTokenStore {
    const records = new Map<string, WaStoredPrivacyTokenRecord>()

    return {
        upsert: async (record) => {
            await onUpsert(record)
            records.set(record.jid, record)
        },
        upsertBatch: async (batch) => {
            for (const record of batch) {
                await onUpsert(record)
                records.set(record.jid, record)
            }
        },
        getByJid: async (jid) => records.get(jid) ?? null,
        deleteByJid: async (jid) => (records.delete(jid) ? 1 : 0),
        clear: async () => {
            records.clear()
        }
    }
}

function createPreKeyStore(handlers: {
    readonly onGenerate?: () => Promise<void>
    readonly onConsume?: () => Promise<void>
}): WaPreKeyStore {
    return {
        putPreKey: async () => undefined,
        getOrGenPreKeys: async () => {
            if (handlers.onGenerate) {
                await handlers.onGenerate()
            }
            return []
        },
        getPreKeyById: async () => null,
        getPreKeysById: async () => [],
        consumePreKeyById: async () => {
            if (handlers.onConsume) {
                await handlers.onConsume()
            }
            return null
        },
        getOrGenSinglePreKey: async () => {
            throw new Error('unused')
        },
        markKeyAsUploaded: async () => undefined,
        setServerHasPreKeys: async () => undefined,
        getServerHasPreKeys: async () => false,
        clear: async () => undefined
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

test('privacy token lock serializes writes on the same jid', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    let inFlight = 0
    let maxInFlightForSameKey = 0

    const store = withPrivacyTokenLock(
        createPrivacyTokenStore(async (record) => {
            if (record.jid !== 'same@s.whatsapp.net') {
                return
            }
            inFlight += 1
            maxInFlightForSameKey = Math.max(maxInFlightForSameKey, inFlight)
            await delay(20)
            inFlight -= 1
        })
    )

    const done = Promise.all([
        store.upsert({ jid: 'same@s.whatsapp.net', updatedAtMs: 1 }),
        store.upsert({ jid: 'same@s.whatsapp.net', updatedAtMs: 2 }),
        store.upsert({ jid: 'same@s.whatsapp.net', updatedAtMs: 3 })
    ])
    await settleWithMockTimers(t, done, 10, 20)
    await done

    assert.equal(maxInFlightForSameKey, 1)
})

test('privacy token lock allows parallel writes for different jids', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    let inFlight = 0
    let maxInFlight = 0

    const store = withPrivacyTokenLock(
        createPrivacyTokenStore(async () => {
            inFlight += 1
            maxInFlight = Math.max(maxInFlight, inFlight)
            await delay(20)
            inFlight -= 1
        })
    )

    const done = Promise.all([
        store.upsert({ jid: 'a@s.whatsapp.net', updatedAtMs: 1 }),
        store.upsert({ jid: 'b@s.whatsapp.net', updatedAtMs: 2 })
    ])
    await settleWithMockTimers(t, done, 10, 10)
    await done

    assert.equal(maxInFlight, 2)
})

test(
    'prekey lock lets consume run while a generation holds the lock',
    { timeout: 5_000 },
    async () => {
        let releaseGeneration: () => void = () => undefined
        const generationBlocked = new Promise<void>((resolve) => {
            releaseGeneration = resolve
        })
        let signalGenerationStarted: () => void = () => undefined
        const generationStarted = new Promise<void>((resolve) => {
            signalGenerationStarted = resolve
        })

        const store = withPreKeyLock(
            createPreKeyStore({
                onGenerate: async () => {
                    signalGenerationStarted()
                    await generationBlocked
                }
            })
        )

        const generation = store.getOrGenPreKeys(8, (keyId) => ({
            keyId,
            keyPair: { pubKey: new Uint8Array(32), privKey: new Uint8Array(32) },
            uploaded: false
        }))
        await generationStarted

        // Shared with the generation lock this would deadlock; per-id it resolves now.
        assert.equal(await store.consumePreKeyById(5), null)

        releaseGeneration()
        await generation
    }
)
