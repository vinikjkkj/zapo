/**
 * Phase 4 cross-check: IQ error responses end-to-end.
 *
 * Demonstrates the test pattern for asserting that the lib propagates an
 * IQ error response into the corresponding API rejection. The fake server
 * intercepts the privacy `getPrivacySettings` IQ and replies with a 401
 * error; the awaited promise on the lib side must reject.
 *
 * NOTE: this file is allowed to import zapo-js directly because it is a
 * cross-check test that drives the lib end-to-end.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'
import { buildIqError } from '../protocol/iq/router'

import { createZapoClient } from './helpers/zapo-client'

test('lib privacy.getPrivacySettings rejects when fake server replies with iq error', async () => {
    const server = await FakeWaServer.start()

    server.scenario((s) => {
        s.onIq({ xmlns: 'privacy', type: 'get' }).respond((iq) =>
            buildIqError(iq, { code: 401, text: 'unauthorized' })
        )
    })

    const { client } = createZapoClient(server, { sessionId: 'iq-error-test' })

    // The lib emits `connection { status: open }` *during* client.connect(),
    // so the listener must be attached before connecting.
    const openPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('connection timeout')), 5_000)
        client.on('connection', (event) => {
            if (event.status === 'open') {
                clearTimeout(timer)
                resolve()
            }
        })
    })

    try {
        await client.connect()
        await openPromise

        await assert.rejects(
            () => client.privacy.getPrivacySettings(),
            // The lib reports IQ errors with the response code in the message.
            /401/
        )
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
