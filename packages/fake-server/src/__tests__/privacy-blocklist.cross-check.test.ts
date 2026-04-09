/**
 * Phase 39 cross-check: privacy + blocklist auto-handlers.
 *
 * Drives `client.privacy.*` against the global handlers and asserts
 * the round-trip:
 *   - `getPrivacySettings` returns the default state.
 *   - `setPrivacySetting` mutates the server-side state and the next
 *     `getPrivacySettings` reflects the change.
 *   - `getBlocklist` reflects `blockUser` / `unblockUser` round-trips.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'

import { createZapoClient } from './helpers/zapo-client'

test('client.privacy.getPrivacySettings returns the default fake state', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'privacy-get' })
    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()
        const settings = await client.privacy.getPrivacySettings()
        assert.equal(settings.readReceipts, 'all')
        assert.equal(settings.lastSeen, 'all')
        assert.equal(settings.online, 'all')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('client.privacy.setPrivacySetting mutates the registry and is observable', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'privacy-set' })
    const captured: Array<{ category: string; value: string }> = []
    server.onOutboundPrivacySet((op) => {
        captured.push({ category: op.category, value: op.value })
    })

    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()
        await client.privacy.setPrivacySetting('readReceipts', 'none')

        // Listener saw the mutation.
        assert.equal(captured.length, 1, 'expected onOutboundPrivacySet to fire')
        assert.equal(captured[0].category, 'readreceipts')
        assert.equal(captured[0].value, 'none')

        // The registry reflects the change.
        const snapshot = server.privacySettingsSnapshot()
        assert.equal(snapshot.settings.readreceipts, 'none')

        // A subsequent get returns the new value.
        const settings = await client.privacy.getPrivacySettings()
        assert.equal(settings.readReceipts, 'none')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('client.privacy.getBlocklist + blockUser + unblockUser round-trip via the registry', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'blocklist-roundtrip' })
    const peerJid = '5511777777777@s.whatsapp.net'

    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()

        // Empty initially.
        const empty = await client.privacy.getBlocklist()
        assert.deepEqual(empty.jids, [])

        // Block.
        await client.privacy.blockUser(peerJid)
        assert.deepEqual(server.blocklistSnapshot(), [peerJid])
        const afterBlock = await client.privacy.getBlocklist()
        assert.deepEqual(afterBlock.jids, [peerJid])

        // Unblock.
        await client.privacy.unblockUser(peerJid)
        assert.deepEqual(server.blocklistSnapshot(), [])
        const afterUnblock = await client.privacy.getBlocklist()
        assert.deepEqual(afterUnblock.jids, [])
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
