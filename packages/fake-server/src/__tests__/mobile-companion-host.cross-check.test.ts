import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import type { WaFakeConnectionPipeline } from '../infra/WaFakeConnectionPipeline'

import { createZapoClient } from './helpers/zapo-client'
import { createZapoMobileClient } from './helpers/zapo-mobile-client'

const PHONE = '5511970001111'

/** Resolves with the connection of the next client that logs in unregistered. */
function waitForCompanionPipeline(
    server: FakeWaServer,
    timeoutMs = 30_000
): Promise<WaFakeConnectionPipeline> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('companion pipeline timed out')),
            timeoutMs
        )
        const unregister = server.onAuthenticatedPipeline((pipeline) => {
            if (pipeline.clientPayload?.kind !== 'registration') {
                return
            }
            clearTimeout(timer)
            unregister()
            resolve(pipeline)
        })
    })
}

test('mobile primary links a real companion client end to end', async () => {
    const server = await FakeWaServer.start({ tcp: true })
    const { client: primary } = await createZapoMobileClient(server, {
        sessionId: 'companion-host-primary',
        phoneNumber: PHONE
    })
    const { client: companion } = createZapoClient(server, {
        sessionId: 'companion-host-companion'
    })

    const companionPipelinePromise = waitForCompanionPipeline(server)
    const qrPromise = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('auth_qr timed out')), 30_000)
        companion.once('auth_qr', (event: Parameters<WaClientEventMap['auth_qr']>[0]) => {
            clearTimeout(timer)
            resolve(event.qr)
        })
    })
    const pairedPromise = new Promise<Parameters<WaClientEventMap['auth_paired']>[0]>(
        (resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('auth_paired timed out')), 30_000)
            companion.once('auth_paired', (event) => {
                clearTimeout(timer)
                resolve(event)
            })
        }
    )

    try {
        await primary.connect()
        await companion.connect()

        const companionPipeline = await companionPipelinePromise
        const refs = await server.offerCompanionPairing(companionPipeline)
        assert.equal(refs.length, 6, 'a pair-device push carries six rotating refs')

        const qr = await qrPromise
        const linked = await primary.mobile.linkCompanion(qr)

        assert.match(
            linked.deviceJid,
            new RegExp(`^${PHONE}:\\d+@s\\.whatsapp\\.net$`),
            'the server mints the companion jid under the primary account'
        )
        assert.ok(linked.keyIndex >= 1, 'the primary allocates a fresh adv key index')

        // The companion accepts the identity the primary signed, which only
        // verifies if the relayed pair-success carried it untouched.
        const paired = await pairedPromise
        assert.equal(paired.credentials.meJid, linked.deviceJid)
        assert.equal(paired.credentials.platform, 'android', 'linked by a phone')

        const companions = server.companionHost.linkedCompanions()
        assert.equal(companions.length, 1)
        assert.equal(companions[0].deviceJid, linked.deviceJid)
        assert.equal(companions[0].keyIndex, linked.keyIndex)
        assert.equal(companions[0].ref, qr.split(',')[0])

        const keyIndexList = server.companionHost.publishedKeyIndexList()
        assert.ok(keyIndexList, 'the pair-device upload publishes a key-index list')
        assert.ok(
            keyIndexList.validIndexes.includes(linked.keyIndex),
            'the published list keeps the new companion valid'
        )
    } finally {
        await companion.disconnect().catch(() => undefined)
        await primary.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('primary revoking a companion is not read as its own logout', async () => {
    const server = await FakeWaServer.start({ tcp: true })
    const { client: primary } = await createZapoMobileClient(server, {
        sessionId: 'companion-host-revoke-primary',
        phoneNumber: PHONE
    })
    const { client: companion } = createZapoClient(server, {
        sessionId: 'companion-host-revoke-companion'
    })

    const companionPipelinePromise = waitForCompanionPipeline(server)
    const qrPromise = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('auth_qr timed out')), 30_000)
        companion.once('auth_qr', (event: Parameters<WaClientEventMap['auth_qr']>[0]) => {
            clearTimeout(timer)
            resolve(event.qr)
        })
    })

    let logoutFired = 0
    server.onLogout(() => {
        logoutFired += 1
    })

    try {
        await primary.connect()
        await companion.connect()
        await server.offerCompanionPairing(await companionPipelinePromise)
        const linked = await primary.mobile.linkCompanion(await qrPromise)

        await primary.mobile.revokeCompanion(linked.deviceJid, 'test_revoke')

        assert.equal(logoutFired, 0, 'unlinking a companion must not end the primary session')
        assert.deepEqual(server.companionHost.linkedCompanions(), [])
        const keyIndexList = server.companionHost.publishedKeyIndexList()
        assert.ok(keyIndexList, 'the revoke republishes the key-index list')
        assert.ok(
            !keyIndexList.validIndexes.includes(linked.keyIndex),
            'the revoked index drops out of the published list'
        )
    } finally {
        await companion.disconnect().catch(() => undefined)
        await primary.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('pair-device upload with an unknown ref is rejected', async () => {
    const server = await FakeWaServer.start({ tcp: true })
    const { client: primary } = await createZapoMobileClient(server, {
        sessionId: 'companion-host-unknown-ref',
        phoneNumber: PHONE
    })

    try {
        await primary.connect()
        await server.waitForAuthenticatedPipeline(5_000)

        const qr = [
            'ref-that-was-never-issued',
            'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            'CHROME'
        ].join(',')

        await assert.rejects(() => primary.mobile.linkCompanion(qr))
        assert.equal(server.companionHost.linkedCompanions().length, 0)
    } finally {
        await primary.disconnect().catch(() => undefined)
        await server.stop()
    }
})
