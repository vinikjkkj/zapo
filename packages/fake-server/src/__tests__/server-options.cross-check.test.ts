import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import type { BinaryNode } from '../transport/codec'

import { createZapoClient } from './helpers/zapo-client'

test('successNodeAttributes reach the client success node and onPipeline fans out', async () => {
    const server = await FakeWaServer.start({
        successNodeAttributes: {
            lid: '5511999999999@lid',
            displayName: 'Fake Display',
            abprops: 42
        }
    })
    const pipelineHits: string[] = []
    server.onPipeline(() => {
        pipelineHits.push('first')
    })
    const unregisterSecond = server.onPipeline(() => {
        pipelineHits.push('second')
    })

    const { client } = createZapoClient(server, { sessionId: 'server-options' })
    const successNodePromise = new Promise<BinaryNode>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('success node timeout')), 15_000)
        client.once(
            'debug_connection_success',
            (event: Parameters<WaClientEventMap['debug_connection_success']>[0]) => {
                clearTimeout(timer)
                resolve(event.node)
            }
        )
    })

    try {
        await client.connect()
        const successNode = await successNodePromise

        assert.equal(successNode.attrs.lid, '5511999999999@lid')
        assert.equal(successNode.attrs.display_name, 'Fake Display')
        assert.equal(successNode.attrs.abprops, '42')

        // Both onPipeline listeners must have seen the same connection.
        assert.deepEqual(pipelineHits, ['first', 'second'])

        unregisterSecond()
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
