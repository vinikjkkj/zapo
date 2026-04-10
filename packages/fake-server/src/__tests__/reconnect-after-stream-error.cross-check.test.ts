import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'
import { buildStreamErrorCode } from '../protocol/stream/stream-error'

import { createZapoClient } from './helpers/zapo-client'

test('client reconnects after a stream:error and the fake server sees a fresh pipeline', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'reconnect-after-error' })

    try {
        await client.connect()
        const firstPipeline = await server.waitForAuthenticatedPipeline()

        const secondPipelinePromise = server.waitForNextAuthenticatedPipeline()

        await firstPipeline.sendStanza(buildStreamErrorCode(515))

        const secondPipeline = await secondPipelinePromise
        assert.notEqual(
            secondPipeline,
            firstPipeline,
            'second pipeline should be a fresh instance'
        )
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
