/**
 * Phase 10 cross-check: full QR-pairing flow.
 *
 * The fake server drives a real `WaClient` from "fresh, no credentials"
 * through pairing all the way to `auth_paired` (with a populated
 * `meJid`) — entirely via the wire, no auth-store stubbing.
 *
 *   1. Client connects, completes Noise XX, receives `<success/>`.
 *   2. Server sends `<iq type="set" xmlns="md"><pair-device><ref/>x6></iq>`.
 *   3. Lib emits `auth_qr` with `ref,noisePub,identityPub,advSecret,platform`.
 *   4. Test parses the QR string, hands the `advSecretKey` back to the
 *      fake server.
 *   5. Server signs an `ADVSignedDeviceIdentityHMAC` with a fresh fake
 *      primary identity and pushes a `pair-success` IQ.
 *   6. Lib verifies HMAC + account signature, replies with
 *      `<pair-device-sign>`, persists credentials and emits `auth_paired`.
 *
 * NOTE: this file is allowed to import zapo-js directly because it is a
 * cross-check test that drives the lib end-to-end.
 */

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
