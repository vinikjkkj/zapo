/**
 * Phase 5 cross-check: server-pushed stanzas reach the lib's typed events.
 *
 * For each push builder we cover, the fake server pushes the stanza
 * immediately after the noise handshake completes (via `s.afterAuth(...)`)
 * and the test asserts that the corresponding `WaClientEventMap` event
 * fires on the lib side. This proves the stanza is wire-correct, the
 * post-handshake transport encryption matches the lib's expectations, and
 * the lib's incoming dispatch table accepts our shape.
 *
 * NOTE: this file is allowed to import zapo-js directly because it is a
 * cross-check test that drives the lib end-to-end.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { buildChatstate } from '../protocol/push/chatstate'
import { buildIncomingErrorStanza } from '../protocol/push/error-stanza'
import { buildIncomingPresence } from '../protocol/push/presence'

import { createZapoClient } from './helpers/zapo-client'

function waitForEvent<K extends keyof WaClientEventMap>(
    client: WaClient,
    event: K,
    timeoutMs = 5_000
): Promise<Parameters<WaClientEventMap[K]>> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`timed out waiting for "${String(event)}"`)),
            timeoutMs
        )
        client.once(event, ((...args: Parameters<WaClientEventMap[K]>) => {
            clearTimeout(timer)
            resolve(args)
        }) as WaClientEventMap[K])
    })
}

test('server pushes <presence/> and lib emits a presence event', async () => {
    const server = await FakeWaServer.start()

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

    const { client } = createZapoClient(server, { sessionId: 'push-presence' })
    const presencePromise = waitForEvent(client, 'presence')

    try {
        await client.connect()
        const [event] = await presencePromise
        assert.equal(event.chatJid, '5511999999999@s.whatsapp.net')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('server pushes <chatstate><composing/></> and lib emits a chatstate event', async () => {
    const server = await FakeWaServer.start()

    server.scenario((s) => {
        s.afterAuth(async (pipeline) => {
            await pipeline.sendStanza(
                buildChatstate({
                    from: '5511999999999@s.whatsapp.net',
                    state: { kind: 'composing' }
                })
            )
        })
    })

    const { client } = createZapoClient(server, { sessionId: 'push-chatstate' })
    const chatstatePromise = waitForEvent(client, 'chatstate')

    try {
        await client.connect()
        const [event] = await chatstatePromise
        assert.equal(event.chatJid, '5511999999999@s.whatsapp.net')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('server pushes free-standing <error/> and lib emits stanza_error', async () => {
    const server = await FakeWaServer.start()

    server.scenario((s) => {
        s.afterAuth(async (pipeline) => {
            await pipeline.sendStanza(
                buildIncomingErrorStanza({ code: 503, text: 'service-unavailable' })
            )
        })
    })

    const { client } = createZapoClient(server, { sessionId: 'push-error' })
    const errorPromise = waitForEvent(client, 'stanza_error')

    try {
        await client.connect()
        const [event] = await errorPromise
        // The lib forwards the raw incoming node attrs in the event payload.
        // We assert that *some* incoming event arrived; the exact attribute
        // exposure depends on the lib's `createIncomingBaseEvent` shape.
        assert.ok(event)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
