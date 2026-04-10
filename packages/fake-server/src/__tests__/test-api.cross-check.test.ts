import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'
import { buildIncomingPresence } from '../protocol/push/presence'

import { createZapoClient } from './helpers/zapo-client'

test('waitForAuthenticatedPipeline resolves once the noise handshake completes', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'wait-auth' })

    try {
        const pipelinePromise = server.waitForAuthenticatedPipeline(5_000)
        await client.connect()
        const pipeline = await pipelinePromise
        assert.equal(pipeline.isAuthenticated(), true)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('expectStanza resolves with the next matching non-iq stanza', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'expect-stanza' })

    server.scenario((s) => {
        s.afterAuth(async (pipeline) => {
            await pipeline.sendStanza(
                buildIncomingPresence({
                    from: '5511999999999@s.whatsapp.net',
                    type: 'available'
                })
            )
        })
    })

    try {
        await client.connect()
        await assert.rejects(
            () => server.expectStanza({ tag: 'message' }, { timeoutMs: 200 }),
            /expectStanza timed out/
        )
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('broadcastStanza pushes to all authenticated pipelines and returns the count', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'broadcast-1' })

    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()
        const count = await server.broadcastStanza(
            buildIncomingPresence({
                from: '5511999999999@s.whatsapp.net',
                type: 'available'
            })
        )
        assert.equal(count, 1, 'one client connected = one push')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
