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
        const requestedNames = collectionNodes.map((node) => node.attrs.name).sort()
        assert.ok(
            requestedNames.includes('regular_low'),
            `expected regular_low in sync IQ, got ${requestedNames.join(',')}`
        )
        assert.ok(
            requestedNames.includes('regular_high'),
            `expected regular_high in sync IQ, got ${requestedNames.join(',')}`
        )

        await client.syncAppState()
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
