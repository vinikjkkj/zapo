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

        await assert.rejects(() => client.privacy.getPrivacySettings(), /401/)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
