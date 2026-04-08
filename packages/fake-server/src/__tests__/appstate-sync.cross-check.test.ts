/**
 * Phase 17 cross-check: app-state sync IQ round-trip end-to-end.
 *
 * Scenario:
 *   1. Real WaClient connects + completes the noise handshake.
 *   2. Test pushes a `<notification type="server_sync"/>` listing
 *      `regular_low` and `regular_high`.
 *   3. The lib's incoming notification handler reacts by calling
 *      `appStateSync.sync()`, which builds an
 *      `<iq xmlns="w:sync:app:state" type="set">` carrying one
 *      `<collection name=... version=0 return_snapshot=true/>` per
 *      requested collection.
 *   4. The fake server's auto-registered `app-state-sync` IQ handler
 *      answers with an empty-success response that echoes each
 *      collection back as `<collection name=... version=0 type="result"/>`.
 *   5. The lib processes the response, marks each collection as
 *      initialised at version 0, and the sync round resolves cleanly.
 *
 * The test asserts that:
 *   - The lib actually sent the sync IQ.
 *   - The IQ contained the requested collections.
 *   - `client.syncAppState()` resolves without throwing.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'
import type { BinaryNode } from '../transport/codec'

import { createZapoClient } from './helpers/zapo-client'

function findChild(node: BinaryNode, tag: string): BinaryNode | undefined {
    if (!Array.isArray(node.content)) return undefined
    return node.content.find((child) => child.tag === tag)
}

function findAllChildren(node: BinaryNode, tag: string): readonly BinaryNode[] {
    if (!Array.isArray(node.content)) return []
    return node.content.filter((child) => child.tag === tag)
}

test('server_sync notification triggers a full app-state sync IQ round-trip', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'app-state-sync' })

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()

        const syncIqPromise = server.expectIq(
            { xmlns: 'w:sync:app:state', type: 'set' },
            { timeoutMs: 5_000 }
        )

        await server.pushServerSyncNotification(pipeline, {
            collections: ['regular_low', 'regular_high']
        })

        const syncIq = await syncIqPromise
        const syncNode = findChild(syncIq, 'sync')
        assert.ok(syncNode, 'sync IQ should contain a <sync> child')
        const collectionNodes = findAllChildren(syncNode, 'collection')
        const requestedNames = collectionNodes
            .map((node) => node.attrs.name)
            .sort()
        // The lib syncs all five default collections in a single round
        // when triggered, regardless of which collections were named in
        // the server_sync notification — assert at least the two we
        // asked for are present.
        assert.ok(
            requestedNames.includes('regular_low'),
            `expected regular_low in sync IQ, got ${requestedNames.join(',')}`
        )
        assert.ok(
            requestedNames.includes('regular_high'),
            `expected regular_high in sync IQ, got ${requestedNames.join(',')}`
        )

        // Explicitly invoke a second sync to confirm the round-trip
        // resolves cleanly via the auto-registered handler.
        await client.syncAppState()
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
