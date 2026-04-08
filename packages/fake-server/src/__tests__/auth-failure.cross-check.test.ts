/**
 * Phase 4 cross-check: server-side handshake / auth failure.
 *
 * The fake server is put into reject mode so it closes every websocket
 * immediately after accepting it. The lib's `client.connect()` should
 * reject because the noise handshake never completes (the underlying
 * websocket dies before the first noise message arrives).
 *
 * NOTE: this file is allowed to import zapo-js directly because it is a
 * cross-check test that drives the lib end-to-end.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'

import { createZapoClient } from './helpers/zapo-client'

test('client.connect() rejects when fake server is in reject mode', async () => {
    const server = await FakeWaServer.start()
    server.setRejectMode({ code: 1011, reason: 'simulated auth failure' })

    const { client } = createZapoClient(server, {
        sessionId: 'auth-failure',
        connectTimeoutMs: 2_000
    })

    try {
        await assert.rejects(() => client.connect())
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
