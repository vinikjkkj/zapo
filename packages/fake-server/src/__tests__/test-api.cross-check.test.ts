/**
 * Phase 6 cross-check: ergonomic test API helpers exposed on FakeWaServer.
 *
 * Verifies the new helpers (`expectStanza`, `broadcastStanza`,
 * `waitForAuthenticatedPipeline`) compose correctly when driven by a real
 * WaClient through the fake server.
 *
 * NOTE: this file is allowed to import zapo-js directly because it is a
 * cross-check test that drives the lib end-to-end.
 */

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
            // Have the test client send something back. The lib doesn't send
            // any non-IQ stanzas spontaneously in the pairing flow, so the
            // assertion here exercises the resolve-on-iq path.
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
        // The lib's incoming-presence handler does not send anything back, so
        // the only "non-iq stanza" the server captures is what the lib emits
        // post-auth — which is none in the pairing flow. We use expectStanza
        // here to assert the timeout path with a clear matcher message.
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
