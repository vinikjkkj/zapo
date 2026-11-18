import assert from 'node:assert/strict'
import test from 'node:test'

import { isMlKemSupported } from '@crypto/kem/MlKem'
import { createLegacyPreKeyStore } from '@signal/__tests__/_legacy-pre-key-store'
import {
    createSignalPqPolicy,
    deleteSessionScopes,
    isPqSessionAddress,
    toClassicSessionAddress,
    toPqSessionAddress
} from '@signal/session/pq-scope'
import type { SignalAddress } from '@signal/types'
import { hasPqPreKeyStore, type WaPreKeyStore } from '@store/contracts/pre-key.store'
import { WaPreKeyMemoryStore } from '@store/memory/pre-key.store'

test('only a regular LID device has a post-quantum twin address', () => {
    assert.deepEqual(toPqSessionAddress({ user: '55', server: 'lid', device: 2 }), {
        user: '55',
        server: 'lid_pq',
        device: 2
    })
    assert.deepEqual(toPqSessionAddress({ user: '55', server: 'lid', device: 0 }), {
        user: '55',
        server: 'lid_pq',
        device: 0
    })

    assert.equal(toPqSessionAddress({ user: '55', server: 's.whatsapp.net', device: 0 }), null)
    assert.equal(toPqSessionAddress({ user: '55', server: 'hosted.lid', device: 0 }), null)
    assert.equal(toPqSessionAddress({ user: '55', server: 'lid', device: 99 }), null)
    assert.equal(toPqSessionAddress({ user: '55', server: 'bot', device: 0 }), null)
    assert.equal(toPqSessionAddress({ user: '55', server: 'lid_pq', device: 0 }), null)
})

test('the post-quantum address maps back to the classic one', () => {
    const classic: SignalAddress = { user: '55', server: 'lid', device: 4 }
    const twin = toPqSessionAddress(classic)!

    assert.equal(isPqSessionAddress(twin), true)
    assert.equal(isPqSessionAddress(classic), false)
    assert.deepEqual(toClassicSessionAddress(twin), classic)
    assert.equal(toClassicSessionAddress(classic), classic)
})

test('deleting the scopes removes the classic session and the post-quantum twin', async () => {
    const deleted: string[] = []
    const store = {
        deleteSession: async (address: SignalAddress) => {
            deleted.push(`${address.user}|${address.server}|${address.device}`)
        }
    }

    await deleteSessionScopes(store, { user: '55', server: 'lid', device: 1 })
    await deleteSessionScopes(store, { user: '66', server: 's.whatsapp.net', device: 0 })

    assert.deepEqual(deleted, ['55|lid|1', '55|lid_pq|1', '66|s.whatsapp.net|0'])
})

test('the policy needs the server flags, ML-KEM support and a post-quantum store', () => {
    const flags = { pq_keys_upload: false, pq_1on1_message_enabled: false }
    const policy = createSignalPqPolicy((name) => flags[name], new WaPreKeyMemoryStore())
    assert.equal(policy.isKeyUploadEnabled(), false)
    assert.equal(policy.isOneToOneEnabled(), false)

    flags.pq_1on1_message_enabled = true
    assert.equal(policy.isOneToOneEnabled(), false)

    flags.pq_keys_upload = true
    assert.equal(policy.isKeyUploadEnabled(), isMlKemSupported())
    assert.equal(policy.isOneToOneEnabled(), isMlKemSupported())

    flags.pq_1on1_message_enabled = false
    assert.equal(policy.isKeyUploadEnabled(), isMlKemSupported())
    assert.equal(policy.isOneToOneEnabled(), false)
})

test('a store without the post-quantum methods keeps the policy off whatever the flags say', () => {
    const policy = createSignalPqPolicy(() => true, createLegacyPreKeyStore())

    assert.equal(policy.isKeyUploadEnabled(), false)
    assert.equal(policy.isOneToOneEnabled(), false)
})

test('a store counts as post-quantum only with every method present', () => {
    assert.equal(hasPqPreKeyStore(new WaPreKeyMemoryStore()), true)
    assert.equal(hasPqPreKeyStore(createLegacyPreKeyStore()), false)

    const full = new WaPreKeyMemoryStore()
    const pqMethods = [
        'putKyberPreKeys',
        'getKyberPreKeyById',
        'consumeKyberPreKeyById',
        'removeKyberPreKeys',
        'getLatestKyberLastResortKey',
        'reserveKyberPreKeyIds',
        'getPqMigrated',
        'setPqMigrated'
    ] as const
    for (const missing of pqMethods) {
        const partial: Record<string, unknown> = { ...createLegacyPreKeyStore() }
        for (const method of pqMethods) {
            if (method !== missing) {
                partial[method] = full[method].bind(full)
            }
        }
        assert.equal(hasPqPreKeyStore(partial as unknown as WaPreKeyStore), false, missing)
    }
})
