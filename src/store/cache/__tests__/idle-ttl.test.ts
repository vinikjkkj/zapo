import assert from 'node:assert/strict'
import test from 'node:test'

import type {
    SenderKeyDistributionRecord,
    SenderKeyRecord,
    SignalAddress,
    SignalSessionRecord
} from '@signal/types'
import { withIdentityCache } from '@store/cache/identity.cache'
import { withPrivacyTokenCache } from '@store/cache/privacy-token.cache'
import { withSenderKeyCache } from '@store/cache/sender-key.cache'
import { withSessionCache } from '@store/cache/session.cache'
import type { WaStoredPrivacyTokenRecord } from '@store/contracts/privacy-token.store'
import { WaIdentityMemoryStore } from '@store/memory/identity.store'
import { WaPrivacyTokenMemoryStore } from '@store/memory/privacy-token.store'
import { SenderKeyMemoryStore } from '@store/memory/sender-key.store'
import { WaSessionMemoryStore } from '@store/memory/session.store'
import { type IdleExpiry, IdleSweepClock } from '@util/collections'

// Each test empties the backend behind the cache before probing it, so a
// non-null read can only come from the L1. With ttlMs = 1_000 the clock ticks
// every second and an entry goes once it misses two ticks.

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

test('session L1: reads, batch reads, has and writes refresh an entry; idle ones expire', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const backend = new WaSessionMemoryStore()
    const cache = withSessionCache(backend, undefined, {
        clock: new IdleSweepClock(1_000),
        ttlMs: 1_000
    })
    for (const user of ['read', 'batch', 'has', 'written', 'idle']) {
        await cache.setSession(addr(user), sess(1))
    }

    t.mock.timers.tick(1_000)
    await cache.getSession(addr('read'))
    await cache.getSessionsBatch([addr('batch'), addr('missing')])
    assert.equal(await cache.hasSession(addr('has')), true)
    await cache.setSessionsBatch([{ address: addr('written'), session: sess(2) }])

    t.mock.timers.tick(1_000)
    await backend.clear()
    assert.deepEqual(
        await cache.getSessionsBatch(
            ['read', 'batch', 'has', 'written', 'idle'].map((u) => addr(u))
        ),
        [sess(1), sess(1), sess(1), sess(2), null]
    )
    await cache.destroy?.()
})

test('identity, sender-key and privacy-token L1s: hits refresh an entry; idle ones expire', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const expiry: IdleExpiry = { clock: new IdleSweepClock(1_000), ttlMs: 1_000 }
    const identityBackend = new WaIdentityMemoryStore()
    const senderKeyBackend = new SenderKeyMemoryStore()
    const privacyTokenBackend = new WaPrivacyTokenMemoryStore()
    const identity = withIdentityCache(identityBackend, undefined, expiry)
    const senderKey = withSenderKeyCache(senderKeyBackend, undefined, expiry)
    const privacyToken = withPrivacyTokenCache(privacyTokenBackend, undefined, expiry)

    await identity.setRemoteIdentities([
        { address: addr('read'), identityKey: new Uint8Array([1]) },
        { address: addr('batch'), identityKey: new Uint8Array([2]) },
        { address: addr('idle'), identityKey: new Uint8Array([3]) }
    ])
    await senderKey.upsertSenderKey(skRecord('g', 'read'))
    await senderKey.upsertSenderKey(skRecord('g', 'idle'))
    await senderKey.upsertSenderKeyDistributions([
        skDistribution('g', 'read'),
        skDistribution('g', 'idle')
    ])
    await privacyTokenBackend.upsertBatch([tok('read'), tok('idle')])
    await privacyToken.getByJid('read') // invalidate-on-write: only a read fills this L1
    await privacyToken.getByJid('idle')

    t.mock.timers.tick(1_000)
    await identity.getRemoteIdentity(addr('read'))
    await identity.getRemoteIdentities([addr('batch')])
    await senderKey.getDeviceSenderKey('g', addr('read'))
    await senderKey.getDeviceSenderKeyDistributions('g', [addr('read')])
    await privacyToken.getByJid('read')

    t.mock.timers.tick(1_000)
    await identityBackend.clear()
    await senderKeyBackend.clear()
    await privacyTokenBackend.clear()
    assert.deepEqual(
        await identity.getRemoteIdentities([addr('read'), addr('batch'), addr('idle')]),
        [new Uint8Array([1]), new Uint8Array([2]), null]
    )
    assert.ok(await senderKey.getDeviceSenderKey('g', addr('read')))
    assert.equal(await senderKey.getDeviceSenderKey('g', addr('idle')), null)
    assert.deepEqual(
        (await senderKey.getDeviceSenderKeyDistributions('g', [addr('read'), addr('idle')])).map(
            (record) => record?.sender.user ?? null
        ),
        ['read', null]
    )
    assert.ok(await privacyToken.getByJid('read'))
    assert.equal(await privacyToken.getByJid('idle'), null)
    await Promise.all([identity.destroy?.(), senderKey.destroy?.(), privacyToken.destroy?.()])
})

test('session L1: with expiry the cap evicts the least recently used entry, without it the oldest write', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const survivors = async (expiry?: IdleExpiry): Promise<(string | null)[]> => {
        const backend = new WaSessionMemoryStore()
        const cache = withSessionCache(backend, 2, expiry)
        await cache.setSession(addr('hot'), sess(1))
        t.mock.timers.tick(1_000)
        await cache.setSession(addr('cold'), sess(2))
        t.mock.timers.tick(1_000)
        await cache.getSession(addr('hot'))
        await cache.setSession(addr('new'), sess(3))

        await backend.clear()
        const found = await cache.getSessionsBatch([addr('hot'), addr('cold'), addr('new')])
        await cache.destroy?.()
        return found.map((record, i) => (record ? ['hot', 'cold', 'new'][i] : null))
    }

    assert.deepEqual(await survivors({ clock: new IdleSweepClock(1_000), ttlMs: 60_000 }), [
        'hot',
        null,
        'new'
    ])
    assert.deepEqual(await survivors(), [null, 'cold', 'new'])
})

test('session L1: wall-clock jumps neither expire nor keep an entry', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    let nowMs = 1_700_000_000_000
    t.mock.method(Date, 'now', () => nowMs)
    const backend = new WaSessionMemoryStore()
    const cache = withSessionCache(backend, undefined, {
        clock: new IdleSweepClock(1_000),
        ttlMs: 1_000
    })
    await cache.setSession(addr('a'), sess(1))
    await backend.clear()

    nowMs += 24 * 3_600_000
    t.mock.timers.tick(1_000)
    assert.deepEqual(await cache.getSession(addr('a')), sess(1))

    nowMs -= 2 * 24 * 3_600_000
    t.mock.timers.tick(1_000)
    assert.deepEqual(await cache.getSession(addr('a')), sess(1))
    t.mock.timers.tick(2_000)
    assert.equal(await cache.getSession(addr('a')), null)
    await cache.destroy?.()
})

test('destroy takes each of the four L1s off the clock and empties it', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const clock = new IdleSweepClock(1_000)
    const expiry: IdleExpiry = { clock, ttlMs: 60_000 }
    const sessionBackend = new WaSessionMemoryStore()
    const identityBackend = new WaIdentityMemoryStore()
    const senderKeyBackend = new SenderKeyMemoryStore()
    const privacyTokenBackend = new WaPrivacyTokenMemoryStore()
    const session = withSessionCache(sessionBackend, undefined, expiry)
    const identity = withIdentityCache(identityBackend, undefined, expiry)
    const senderKey = withSenderKeyCache(senderKeyBackend, undefined, expiry)
    const privacyToken = withPrivacyTokenCache(privacyTokenBackend, undefined, expiry)

    await session.setSession(addr('a'), sess(1))
    await identity.setRemoteIdentity(addr('a'), new Uint8Array([1]))
    await senderKey.upsertSenderKey(skRecord('g', 'a'))
    await senderKey.upsertSenderKeyDistribution(skDistribution('g', 'a'))
    await privacyTokenBackend.upsert(tok('a'))
    await privacyToken.getByJid('a')
    await Promise.all([
        sessionBackend.clear(),
        identityBackend.clear(),
        senderKeyBackend.clear(),
        privacyTokenBackend.clear()
    ])
    const probe = async (): Promise<boolean[]> => [
        (await session.getSession(addr('a'))) !== null,
        (await identity.getRemoteIdentity(addr('a'))) !== null,
        (await senderKey.getDeviceSenderKey('g', addr('a'))) !== null,
        (await senderKey.getDeviceSenderKeyDistributions('g', [addr('a')]))[0] !== null,
        (await privacyToken.getByJid('a')) !== null
    ]
    assert.deepEqual(await probe(), [true, true, true, true, true])

    await session.destroy?.()
    await identity.destroy?.()
    await senderKey.destroy?.()
    t.mock.timers.tick(1_000)
    assert.equal(clock.tick, 1) // privacyToken still holds the timer

    await privacyToken.destroy?.()
    t.mock.timers.tick(5_000)
    assert.equal(clock.tick, 1)
    assert.deepEqual(await probe(), [false, false, false, false, false])
})
