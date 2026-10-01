import assert from 'node:assert/strict'
import test from 'node:test'

import type {
    SenderKeyDistributionRecord,
    SenderKeyRecord,
    SignalAddress,
    SignalSessionRecord
} from '@signal/types'
import type { WaStoredPrivacyTokenRecord } from '@store/contracts/privacy-token.store'
import { WaIdentityMemoryStore } from '@store/memory/identity.store'
import { WaPrivacyTokenMemoryStore } from '@store/memory/privacy-token.store'
import { SenderKeyMemoryStore } from '@store/memory/sender-key.store'
import { WaSessionMemoryStore } from '@store/memory/session.store'

const addr = (user: string, device = 0): SignalAddress => ({ user, device })
const sess = (marker: number): SignalSessionRecord => ({ marker }) as unknown as SignalSessionRecord
const skRecord = (groupId: string, user: string): SenderKeyRecord => ({
    groupId,
    sender: addr(user),
    keyId: 1,
    iteration: 0,
    chainKey: new Uint8Array([1]),
    signingPublicKey: new Uint8Array([2])
})
const skDistribution = (groupId: string, user: string): SenderKeyDistributionRecord => ({
    groupId,
    sender: addr(user),
    keyId: 1,
    timestampMs: 1
})
const tok = (jid: string): WaStoredPrivacyTokenRecord => ({
    jid,
    tcToken: new Uint8Array([1]),
    updatedAtMs: 1
})

// With ttlMs <= 1s the sweep interval equals the ttl, so the sweeps below
// fire at t = 1_000, 2_000, ...
const TTL_MS = 1_000

test('session memory store: sweep evicts sessions idle past ttlMs, reads and writes refresh', async (t) => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 0 })
    const store = new WaSessionMemoryStore({ ttlMs: TTL_MS })
    await store.setSession(addr('read'), sess(1))
    await store.setSession(addr('batch-read'), sess(2))
    await store.setSession(addr('has'), sess(3))
    await store.setSession(addr('written'), sess(4))
    await store.setSession(addr('idle'), sess(5))

    t.mock.timers.tick(600)
    assert.ok(await store.getSession(addr('read')))
    await store.getSessionsBatch([addr('batch-read'), addr('missing')])
    assert.deepEqual(await store.hasSessions([addr('has')]), [true])
    await store.setSessionsBatch([{ address: addr('written'), session: sess(6) }])

    t.mock.timers.tick(400) // sweep at t=1_000
    assert.equal(await store.getSession(addr('idle')), null)
    assert.deepEqual(
        await store.hasSessions([addr('read'), addr('batch-read'), addr('has'), addr('written')]),
        [true, true, true, true]
    )

    t.mock.timers.tick(TTL_MS) // sweep at t=2_000: everything last touched at t=1_000
    assert.deepEqual(
        await store.hasSessions([addr('read'), addr('batch-read'), addr('has'), addr('written')]),
        [false, false, false, false]
    )
    await store.destroy()
})

test('session memory store: cap eviction and deletes leave no stale idle entries', async () => {
    const store = new WaSessionMemoryStore({ maxSessions: 2, ttlMs: 60_000 })
    await store.setSession(addr('a'), sess(1))
    await store.setSession(addr('b'), sess(2))
    await store.setSession(addr('c'), sess(3)) // the cap evicts 'a'
    await store.deleteSession(addr('b'))

    assert.equal(await store.cleanupExpired(Date.now() + 60_000), 1) // only 'c' was indexed
    assert.equal(await store.getSession(addr('c')), null)
    await store.destroy()
})

test('identity memory store: sweep evicts identities idle past ttlMs, reads refresh', async (t) => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 0 })
    const store = new WaIdentityMemoryStore({ ttlMs: TTL_MS })
    await store.setRemoteIdentity(addr('read'), new Uint8Array([1]))
    await store.setRemoteIdentities([
        { address: addr('batch-read'), identityKey: new Uint8Array([2]) },
        { address: addr('idle'), identityKey: new Uint8Array([3]) }
    ])

    t.mock.timers.tick(600)
    assert.ok(await store.getRemoteIdentity(addr('read')))
    await store.getRemoteIdentities([addr('batch-read')])

    t.mock.timers.tick(400) // sweep at t=1_000
    assert.deepEqual(await store.getRemoteIdentities([addr('read'), addr('idle')]), [
        new Uint8Array([1]),
        null
    ])
    assert.ok(await store.getRemoteIdentity(addr('batch-read')))
    await store.destroy()
})

test('sender-key memory store: sweep evicts idle keys and distributions, point reads refresh', async (t) => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 0 })
    const store = new SenderKeyMemoryStore({ ttlMs: TTL_MS })
    await store.upsertSenderKey(skRecord('g', 'read'))
    await store.upsertSenderKey(skRecord('g', 'scanned'))
    await store.upsertSenderKeyDistributions([
        skDistribution('g', 'read'),
        skDistribution('g', 'idle')
    ])

    t.mock.timers.tick(600)
    assert.ok(await store.getDeviceSenderKey('g', addr('read')))
    await store.getDeviceSenderKeyDistributions('g', [addr('read')])
    await store.getGroupSenderKeyList('g') // a scan, not a point read: refreshes nothing

    t.mock.timers.tick(400) // sweep at t=1_000
    assert.ok(await store.getDeviceSenderKey('g', addr('read')))
    assert.equal(await store.getDeviceSenderKey('g', addr('scanned')), null)
    assert.deepEqual(
        (await store.getDeviceSenderKeyDistributions('g', [addr('read'), addr('idle')])).map(
            (record) => record?.sender.user ?? null
        ),
        ['read', null]
    )
    await store.destroy()
})

test('sender-key memory store: matching deletes leave no stale idle entries', async () => {
    const store = new SenderKeyMemoryStore({ ttlMs: 60_000 })
    await store.upsertSenderKey(skRecord('g', 'a'))
    await store.upsertSenderKeyDistribution(skDistribution('g', 'a'))
    await store.upsertSenderKey(skRecord('g', 'b'))
    assert.equal(await store.deleteDeviceSenderKey(addr('a'), 'g'), 2)

    assert.equal(await store.cleanupExpired(Date.now() + 60_000), 1) // only 'b' was indexed
    await store.destroy()
})

test('privacy-token memory store: sweep evicts idle records, reads refresh, deletes unindex', async (t) => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 0 })
    const store = new WaPrivacyTokenMemoryStore(10, { ttlMs: TTL_MS })
    await store.upsert(tok('read'))
    await store.upsertBatch([tok('idle'), tok('deleted')])
    assert.equal(await store.deleteByJid('deleted'), 1)

    t.mock.timers.tick(600)
    assert.ok(await store.getByJid('read'))

    t.mock.timers.tick(400) // sweep at t=1_000
    assert.ok(await store.getByJid('read'))
    assert.equal(await store.getByJid('idle'), null)
    assert.equal(await store.cleanupExpired(Date.now() + TTL_MS), 1) // just 'read' left
    await store.destroy()
})

test('memory stores without ttlMs never expire entries', async () => {
    const session = new WaSessionMemoryStore()
    const identity = new WaIdentityMemoryStore()
    const senderKey = new SenderKeyMemoryStore()
    const privacyToken = new WaPrivacyTokenMemoryStore()
    await session.setSession(addr('a'), sess(1))
    await identity.setRemoteIdentity(addr('a'), new Uint8Array([1]))
    await senderKey.upsertSenderKey(skRecord('g', 'a'))
    await privacyToken.upsert(tok('a'))

    const farFuture = Number.MAX_SAFE_INTEGER
    assert.equal(await session.cleanupExpired(farFuture), 0)
    assert.equal(await identity.cleanupExpired(farFuture), 0)
    assert.equal(await senderKey.cleanupExpired(farFuture), 0)
    assert.equal(await privacyToken.cleanupExpired(farFuture), 0)
    assert.ok(await session.getSession(addr('a')))
    assert.ok(await identity.getRemoteIdentity(addr('a')))
    assert.ok(await senderKey.getDeviceSenderKey('g', addr('a')))
    assert.ok(await privacyToken.getByJid('a'))
})

test('memory stores reject a ttlMs that is not a positive safe integer', () => {
    assert.throws(
        () => new WaSessionMemoryStore({ ttlMs: 0 }),
        /WaSessionMemoryStoreOptions\.ttlMs must be a positive safe integer/
    )
    assert.throws(
        () => new WaIdentityMemoryStore({ ttlMs: -1 }),
        /WaIdentityMemoryStoreOptions\.ttlMs must be a positive safe integer/
    )
    assert.throws(
        () => new SenderKeyMemoryStore({ ttlMs: 1.5 }),
        /WaSenderKeyMemoryStoreOptions\.ttlMs must be a positive safe integer/
    )
    assert.throws(
        () => new WaPrivacyTokenMemoryStore(10, { ttlMs: Number.NaN }),
        /WaPrivacyTokenMemoryStoreOptions\.ttlMs must be a positive safe integer/
    )
})

test('memory store destroy stops the periodic sweep and clears entries', async (t) => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 0 })
    const session = new WaSessionMemoryStore({ ttlMs: TTL_MS })
    const stores = [
        session,
        new WaIdentityMemoryStore({ ttlMs: TTL_MS }),
        new SenderKeyMemoryStore({ ttlMs: TTL_MS }),
        new WaPrivacyTokenMemoryStore(10, { ttlMs: TTL_MS })
    ]
    const sweeps = stores.map((store) => t.mock.method(store, 'cleanupExpired'))

    t.mock.timers.tick(TTL_MS)
    assert.deepEqual(
        sweeps.map((sweep) => sweep.mock.callCount()),
        [1, 1, 1, 1]
    )

    await session.setSession(addr('a'), sess(1))
    for (const store of stores) await store.destroy()
    assert.equal(await session.getSession(addr('a')), null)

    t.mock.timers.tick(TTL_MS * 5)
    assert.deepEqual(
        sweeps.map((sweep) => sweep.mock.callCount()),
        [1, 1, 1, 1]
    )
})
