/**
 * Phase 38 cross-check: lifecycle handlers (logout / remove-companion-device).
 *
 * The other Tier 1 handlers (`abt get props`, `w:p get` ping,
 * `encrypt set rotate`) only fire from background lib code paths
 * (startup AB props sync, keepalive timer, signed-prekey rotation
 * timer). They don't have a public API hook so we can't drive them
 * cleanly here — we trust the matcher registration in the
 * `FakeWaServer` constructor and rely on every other cross-check to
 * fail loudly if any of them broke.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'

import { createZapoClient } from './helpers/zapo-client'

test('client.logout sends remove-companion-device and fires the logout listener', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'logout-handler' })

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
    const pairedPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('auth_paired timeout')), 60_000)
        client.once('auth_paired', () => {
            clearTimeout(timer)
            resolve()
        })
    })

    let logoutFired = 0
    server.onLogout(() => {
        logoutFired += 1
    })

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.runPairing(
            pipeline,
            { deviceJid: '5511999999999:1@s.whatsapp.net' },
            () => materialPromise
        )

        const pipelineAfterPairPromise = server.waitForNextAuthenticatedPipeline()
        await pairedPromise
        const pipelineAfterPair = await pipelineAfterPairPromise

        // Drive the post-pair prekey upload sync. Without this the lib
        // can still be in the middle of bring-up when we issue logout.
        await server.triggerPreKeyUpload(pipelineAfterPair)

        await client.logout()

        assert.equal(logoutFired, 1)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
