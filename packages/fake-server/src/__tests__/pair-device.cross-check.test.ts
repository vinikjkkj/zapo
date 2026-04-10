import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaAuthCredentials, WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'

import { createZapoClient } from './helpers/zapo-client'

test('client completes QR pairing end-to-end and emits auth_paired with meJid', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'pair-flow' })

    const materialPromise = new Promise<{
        readonly advSecretKey: Uint8Array
        readonly identityPublicKey: Uint8Array
    }>((resolve) => {
        client.once('auth_qr', (event: Parameters<WaClientEventMap['auth_qr']>[0]) => {
            const parsed = parsePairingQrString(event.qr)
            resolve({
                advSecretKey: parsed.advSecretKey,
                identityPublicKey: parsed.identityPublicKey
            })
        })
    })
    const pairedPromise = new Promise<WaAuthCredentials>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('timed out waiting for auth_paired')),
            60_000
        )
        client.once('auth_paired', (event: Parameters<WaClientEventMap['auth_paired']>[0]) => {
            clearTimeout(timer)
            resolve(event.credentials)
        })
    })

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()

        await server.runPairing(
            pipeline,
            { deviceJid: '5511999999999:1@s.whatsapp.net' },
            () => materialPromise
        )

        const credentials = await pairedPromise
        assert.equal(credentials.meJid, '5511999999999:1@s.whatsapp.net')
        assert.equal(credentials.platform, 'IOS')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
