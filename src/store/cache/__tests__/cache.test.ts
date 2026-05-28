import assert from 'node:assert/strict'
import test from 'node:test'

import type { SenderKeyRecord, SignalAddress, SignalSessionRecord } from '@signal/types'
import { withIdentityCache } from '@store/cache/identity.cache'
import { withPrivacyTokenCache } from '@store/cache/privacy-token.cache'
import { withSenderKeyCache } from '@store/cache/sender-key.cache'
import { withSessionCache } from '@store/cache/session.cache'
import type { WaStoredPrivacyTokenRecord } from '@store/contracts/privacy-token.store'
import { WaIdentityMemoryStore } from '@store/memory/identity.store'
import { WaPrivacyTokenMemoryStore } from '@store/memory/privacy-token.store'
import { SenderKeyMemoryStore } from '@store/memory/sender-key.store'
import { WaSessionMemoryStore } from '@store/memory/session.store'

/** Wraps a real store, counting calls to the named methods, leaving the rest delegating. */
function spy<T extends object>(
    inner: T,
    ...counted: (keyof T)[]
): { readonly store: T; readonly counts: Map<keyof T, number> } {
    const counts = new Map<keyof T, number>()
    for (const method of counted) counts.set(method, 0)
    const store = new Proxy(inner, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver)
            if (typeof value !== 'function') return value
            const bound = (value as (...args: unknown[]) => unknown).bind(target)
            if (!counts.has(prop as keyof T)) return bound
            return (...args: unknown[]) => {
                counts.set(prop as keyof T, (counts.get(prop as keyof T) ?? 0) + 1)
                return bound(...args)
            }
        }
    })
    return { store, counts }
}

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
const tok = (
    jid: string,
    fields: Partial<WaStoredPrivacyTokenRecord> = {}
): WaStoredPrivacyTokenRecord => ({ jid, updatedAtMs: 1, ...fields })

test('session cache: read-through populates L1 and avoids repeat backend reads', async () => {
    const { store: backend, counts } = spy(new WaSessionMemoryStore(), 'getSession')
    await backend.setSession(addr('a'), sess(1))
    const cache = withSessionCache(backend)

    assert.deepEqual(await cache.getSession(addr('a')), sess(1))
    assert.equal(counts.get('getSession'), 1)
    assert.deepEqual(await cache.getSession(addr('a')), sess(1))
    assert.equal(counts.get('getSession'), 1)
})

test('session cache: write-through serves sets from L1 without a backend read', async () => {
    const { store: backend, counts } = spy(new WaSessionMemoryStore(), 'getSession')
    const cache = withSessionCache(backend)

    await cache.setSession(addr('a'), sess(2))
    assert.deepEqual(await cache.getSession(addr('a')), sess(2))
    assert.equal(counts.get('getSession'), 0)
})

test('session cache: delete clears the L1 entry', async () => {
    const { store: backend, counts } = spy(new WaSessionMemoryStore(), 'getSession')
    const cache = withSessionCache(backend)

    await cache.setSession(addr('a'), sess(3))
    await cache.deleteSession(addr('a'))
    assert.equal(await cache.getSession(addr('a')), null)
    assert.equal(counts.get('getSession'), 1)
})

test('session cache: no negative caching (a later-present key is seen)', async () => {
    const { store: backend, counts } = spy(new WaSessionMemoryStore(), 'getSession')
    const cache = withSessionCache(backend)

    assert.equal(await cache.getSession(addr('a')), null)
    assert.equal(counts.get('getSession'), 1)
    await backend.setSession(addr('a'), sess(4))
    assert.deepEqual(await cache.getSession(addr('a')), sess(4))
    assert.equal(counts.get('getSession'), 2)
})

test('session cache: batch fetches only the missing addresses from the backend', async () => {
    const { store: backend } = spy(new WaSessionMemoryStore())
    let lastBatch: readonly SignalAddress[] = []
    const tracking = new Proxy(backend, {
        get(target, prop, receiver) {
            if (prop === 'getSessionsBatch') {
                return (addresses: readonly SignalAddress[]) => {
                    lastBatch = addresses
                    return target.getSessionsBatch(addresses)
                }
            }
            return Reflect.get(target, prop, receiver)
        }
    })
    await backend.setSession(addr('a'), sess(1))
    await backend.setSession(addr('b'), sess(2))
    const cache = withSessionCache(tracking)

    await cache.getSession(addr('a')) // populate L1 for 'a'
    const out = await cache.getSessionsBatch([addr('a'), addr('b')])
    assert.deepEqual(out, [sess(1), sess(2)])
    assert.deepEqual(lastBatch, [addr('b')])
})

test('identity cache: read-through then write-through', async () => {
    const { store: backend, counts } = spy(new WaIdentityMemoryStore(), 'getRemoteIdentity')
    await backend.setRemoteIdentity(addr('a'), new Uint8Array([7]))
    const cache = withIdentityCache(backend)

    assert.deepEqual(await cache.getRemoteIdentity(addr('a')), new Uint8Array([7]))
    assert.equal(counts.get('getRemoteIdentity'), 1)
    assert.deepEqual(await cache.getRemoteIdentity(addr('a')), new Uint8Array([7]))
    assert.equal(counts.get('getRemoteIdentity'), 1)

    await cache.setRemoteIdentity(addr('b'), new Uint8Array([8]))
    assert.deepEqual(await cache.getRemoteIdentity(addr('b')), new Uint8Array([8]))
    assert.equal(counts.get('getRemoteIdentity'), 1)
})

test('sender-key cache: device key read-through, group list always hits backend', async () => {
    const { store: backend, counts } = spy(
        new SenderKeyMemoryStore(),
        'getDeviceSenderKey',
        'getGroupSenderKeyList'
    )
    await backend.upsertSenderKey(skRecord('g', 'a'))
    const cache = withSenderKeyCache(backend)

    assert.ok(await cache.getDeviceSenderKey('g', addr('a')))
    assert.ok(await cache.getDeviceSenderKey('g', addr('a')))
    assert.equal(counts.get('getDeviceSenderKey'), 1)

    await cache.getGroupSenderKeyList('g')
    await cache.getGroupSenderKeyList('g')
    assert.equal(counts.get('getGroupSenderKeyList'), 2)
})

test('sender-key cache: markForgetSenderKey invalidates the L1 entry', async () => {
    const { store: backend } = spy(new SenderKeyMemoryStore())
    await backend.upsertSenderKey(skRecord('g', 'a'))
    const cache = withSenderKeyCache(backend)

    await cache.getDeviceSenderKey('g', addr('a')) // populate L1
    const deleted = await cache.markForgetSenderKey('g', [addr('a')])
    assert.ok(deleted > 0)
    assert.equal(await cache.getDeviceSenderKey('g', addr('a')), null)
})

test('privacy-token cache: read-through', async () => {
    const { store: backend, counts } = spy(new WaPrivacyTokenMemoryStore(), 'getByJid')
    await backend.upsert(tok('j', { tcToken: new Uint8Array([1]) }))
    const cache = withPrivacyTokenCache(backend)

    assert.ok(await cache.getByJid('j'))
    assert.equal(counts.get('getByJid'), 1)
    assert.ok(await cache.getByJid('j'))
    assert.equal(counts.get('getByJid'), 1)
})

test('privacy-token cache: upsert invalidates so the merged backend record is read fresh', async () => {
    const { store: backend } = spy(new WaPrivacyTokenMemoryStore())
    await backend.upsert(tok('j', { tcToken: new Uint8Array([1]) }))
    const cache = withPrivacyTokenCache(backend)

    await cache.getByJid('j') // L1 now holds { tcToken }
    await cache.upsert(tok('j', { nctSalt: new Uint8Array([9]) })) // backend merges, L1 invalidated

    const merged = await cache.getByJid('j')
    // write-through of the partial would have dropped tcToken; invalidate-on-write keeps both
    assert.ok(merged?.tcToken)
    assert.ok(merged?.nctSalt)
})
