/**
 * Phase 21 cross-check: real `WaClient` uploads an outbound app-state
 * patch that the fake server decrypts + verifies.
 *
 * Scenario:
 *   1. Real WaClient connects + completes the noise handshake.
 *   2. Test mints a fresh sync key, registers it on the fake server
 *      (via `registerAppStateSyncKey`), and ships it to the lib via
 *      `peer.sendAppStateSyncKeyShare`. The lib auto-imports the key
 *      and auto-triggers a sync.
 *   3. Test seeds a `FakeAppStateCollection` for `regular_high` with a
 *      throwaway placeholder mutation, ships it as an inline `<patches>`
 *      payload via `provideAppStateCollection`, and waits for the lib's
 *      auto-sync to apply it. After the apply the lib treats
 *      `regular_high` as persisted at version 1, which is the
 *      precondition for it to upload its own patches in subsequent
 *      sync rounds.
 *   4. Test calls `client.chat.setChatMute(jid, true, muteEnd)`. The
 *      lib's `WaAppStateMutationCoordinator` queues the mutation and
 *      flushes it via `syncAppState({ pendingMutations })`, which
 *      builds an encrypted `SyncdPatch` and ships it inside the next
 *      app-state sync IQ.
 *   5. The fake server's `consumeOutboundAppStatePatches` decrypts the
 *      patch with the registered sync key, verifies the value MAC and
 *      index MAC, decodes the inner `SyncActionData`, and notifies
 *      `expectAppStateMutation` listeners.
 *   6. Test asserts the captured mutation matches the input
 *      (`action='mute'`, `muteAction.muted=true`).
 *
 * The whole pipeline runs against the lib's real `WaAppStateCrypto`
 * (encrypt + LTHash + MAC chain) — no stubbing on either side.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'
import { FakeAppStateCollection } from '../state/fake-app-state-collection'

import { createZapoClient } from './helpers/zapo-client'

test('client.chat.setChatMute uploads an encrypted patch the fake server decrypts', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'app-state-outgoing' })

    const targetChatJid = '5511777777777@s.whatsapp.net'
    const placeholderChatJid = '5511555555555@s.whatsapp.net'
    const muteEnd = Date.now() + 60 * 60 * 1_000
    const syncKeyId = new Uint8Array(randomBytes(16))
    const syncKeyData = new Uint8Array(randomBytes(32))

    // The fake server needs to know the key so it can decrypt patches
    // the lib uploads. Tests that only need a one-way push (server →
    // client) can skip this step.
    server.registerAppStateSyncKey(syncKeyId, syncKeyData)

    const collection = new FakeAppStateCollection({
        name: 'regular_high',
        keyId: syncKeyId,
        keyData: syncKeyData
    })
    // Bootstrap the collection with a placeholder mutation so the lib
    // initializes its `regular_high` state at version 1. After the
    // bootstrap the lib is allowed to upload its own patches.
    await collection.applyMutation({
        operation: 'set',
        index: JSON.stringify(['mute', placeholderChatJid]),
        value: {
            timestamp: Date.now(),
            muteAction: { muted: false }
        },
        version: 2
    })
    const bootstrapPatch = await collection.encodePendingPatch()
    const bootstrapVersion = collection.version

    let bootstrapShipped = false
    server.provideAppStateCollection('regular_high', () => {
        if (bootstrapShipped) {
            return {
                name: 'regular_high',
                version: bootstrapVersion
            }
        }
        bootstrapShipped = true
        return {
            name: 'regular_high',
            version: bootstrapVersion,
            patches: [bootstrapPatch]
        }
    })

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.triggerPreKeyUpload(pipeline)

        const peer = await server.createFakePeer(
            { jid: '5511888888888@s.whatsapp.net', displayName: 'Primary Device' },
            pipeline
        )

        // First, hand the lib the sync key + wait for the placeholder
        // mutation to be applied. We watch for the placeholder
        // `chat_event` so we know the bootstrap round finished.
        const bootstrapEventPromise = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('placeholder mutation never applied')),
                8_000
            )
            const handler = (event: { readonly chatJid?: string }): void => {
                if (event.chatJid === placeholderChatJid) {
                    clearTimeout(timer)
                    client.off('chat_event', handler)
                    resolve()
                }
            }
            client.on('chat_event', handler)
        })

        await peer.sendAppStateSyncKeyShare({
            keys: [{ keyId: syncKeyId, keyData: syncKeyData, timestamp: Date.now() }]
        })

        await bootstrapEventPromise

        // Now the collection is initialized at version 1. Trigger a
        // mute mutation; the coordinator will flush it via syncAppState
        // which ships an encrypted patch the fake server decrypts.
        const mutationPromise = server.expectAppStateMutation(
            (mutation) =>
                mutation.collection === 'regular_high' &&
                mutation.action === 'mute' &&
                mutation.index.includes(targetChatJid),
            8_000
        )

        await client.chat.setChatMute(targetChatJid, true, muteEnd)

        const captured = await mutationPromise
        assert.equal(captured.collection, 'regular_high')
        assert.equal(captured.operation, 'set')
        assert.equal(captured.action, 'mute')
        assert.ok(captured.value, 'captured mutation should carry a value')
        assert.equal(captured.value?.muteAction?.muted, true)
        // The lib normalises muteEndTimestamp to a Long; coerce both
        // sides to a primitive number for the assertion.
        const capturedMuteEnd = Number(captured.value?.muteAction?.muteEndTimestamp)
        assert.equal(capturedMuteEnd, muteEnd)
        // patchVersion is metadata-only — the real assertion is the
        // mutation contents above. We just sanity-check it's a finite
        // number.
        assert.ok(
            Number.isFinite(captured.patchVersion),
            `patch version should be a finite number, got ${captured.patchVersion}`
        )
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
