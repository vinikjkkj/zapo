import assert from 'node:assert/strict'
import test from 'node:test'

import { WaChatMetadataMemoryStore } from '@store/memory/chat-metadata.store'

const JID = '5511999999999@lid'

test('chat metadata memory store round-trips the disappearing settings', async () => {
    const store = new WaChatMetadataMemoryStore(60_000)
    await store.upsertChatMetadata({
        chatJid: JID,
        ephemeralExpiration: 86_400,
        ephemeralSettingTimestamp: 1_751_808_692,
        updatedAtMs: Date.now()
    })

    const snapshot = await store.getChatMetadata(JID)
    assert.ok(snapshot)
    assert.equal(snapshot.ephemeralExpiration, 86_400)
    assert.equal(snapshot.ephemeralSettingTimestamp, 1_751_808_692)
    await store.destroy()
})

test('chat metadata memory store expires entries past the ttl', async () => {
    const store = new WaChatMetadataMemoryStore(1_000)
    const updatedAtMs = 10_000
    await store.upsertChatMetadata({ chatJid: JID, ephemeralExpiration: 60, updatedAtMs })

    assert.ok(await store.getChatMetadata(JID, updatedAtMs + 500))
    assert.equal(await store.getChatMetadata(JID, updatedAtMs + 1_500), null)
    await store.destroy()
})

test('chat metadata memory store evicts the oldest entry at capacity', async () => {
    const store = new WaChatMetadataMemoryStore(60_000, { maxChats: 2 })
    const updatedAtMs = Date.now()
    for (const jid of ['a@lid', 'b@lid', 'c@lid']) {
        await store.upsertChatMetadata({ chatJid: jid, ephemeralExpiration: 60, updatedAtMs })
    }

    assert.equal(await store.getChatMetadata('a@lid'), null, 'oldest entry should be evicted')
    assert.ok(await store.getChatMetadata('b@lid'))
    assert.ok(await store.getChatMetadata('c@lid'))
    await store.destroy()
})

test('chat metadata memory store rejects a non-positive ttl', () => {
    assert.throws(() => new WaChatMetadataMemoryStore(0), /positive finite number/)
})

test('chat metadata memory store deletes and clears', async () => {
    const store = new WaChatMetadataMemoryStore(60_000)
    await store.upsertChatMetadata({
        chatJid: JID,
        ephemeralExpiration: 60,
        updatedAtMs: Date.now()
    })

    assert.equal(await store.deleteChatMetadata(JID), 1)
    assert.equal(await store.deleteChatMetadata(JID), 0)

    await store.upsertChatMetadata({
        chatJid: JID,
        ephemeralExpiration: 60,
        updatedAtMs: Date.now()
    })
    await store.clear()
    assert.equal(await store.getChatMetadata(JID), null)
    await store.destroy()
})
