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
