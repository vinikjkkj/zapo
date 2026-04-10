import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'

import { createZapoClient } from './helpers/zapo-client'

test('scenario.afterAuth fires once the noise handshake completes', async () => {
    const server = await FakeWaServer.start()
    let authHits = 0

    server.scenario((s) => {
        s.afterAuth(() => {
            authHits += 1
        })
    })

    const { client } = createZapoClient(server, { sessionId: 'scenario-after-auth' })
    try {
        await client.connect()
        await new Promise((resolve) => setTimeout(resolve, 100))
        assert.equal(authHits, 1)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('capturedStanzaSnapshot starts empty for the pairing flow', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'snapshot-empty' })
    try {
        await client.connect()
        await new Promise((resolve) => setTimeout(resolve, 200))
        assert.equal(server.capturedStanzaSnapshot().length, 0)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('expectIq rejects with a clear timeout when no IQ matches', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'expect-iq-timeout' })
    try {
        await client.connect()
        await assert.rejects(
            () => server.expectIq({ xmlns: 'usync' }, { timeoutMs: 200 }),
            /expectIq timed out/
        )
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
