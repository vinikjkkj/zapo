import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import {
    buildAccountTakeoverNotice,
    buildRegistrationCodeNotification
} from '../protocol/push/mobile-notification'

import { linkCompanionViaQr } from './helpers/companion-pipeline'
import { createZapoClient } from './helpers/zapo-client'
import { createZapoMobileClient } from './helpers/zapo-mobile-client'

const PHONE = '5511970003333'

test('account_sync prunes a companion the server no longer lists', async () => {
    const server = await FakeWaServer.start({ tcp: true })
    const { client: primary } = await createZapoMobileClient(server, {
        sessionId: 'account-sync-primary',
        phoneNumber: PHONE
    })
    const { client: companion } = createZapoClient(server, {
        sessionId: 'account-sync-companion'
    })

    try {
        await primary.connect()
        const primaryPipeline = await server.waitForAuthenticatedPipeline(5_000)
        const linked = await linkCompanionViaQr(server, primary, companion)
        assert.equal((await primary.mobile.listCompanions()).length, 1)

        const revokedPromise = new Promise<string>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('companion_host_revoked timed out')),
                15_000
            )
            primary.once('companion_host_revoked', (event) => {
                clearTimeout(timer)
                resolve(event.deviceJid)
            })
        })

        // The account lost the device while the primary was offline: the push
        // lists only the phone itself.
        await server.pushAccountSyncDevices(primaryPipeline, {
            devices: [{ deviceJid: `${PHONE}@s.whatsapp.net`, keyIndex: 0 }]
        })

        assert.equal(await revokedPromise, linked.deviceJid)
        assert.deepEqual(await primary.mobile.listCompanions(), [])
    } finally {
        await companion.disconnect().catch(() => undefined)
        await primary.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('account_sync keeps companions the server still lists', async () => {
    const server = await FakeWaServer.start({ tcp: true })
    const { client: primary } = await createZapoMobileClient(server, {
        sessionId: 'account-sync-keep-primary',
        phoneNumber: PHONE
    })
    const { client: companion } = createZapoClient(server, {
        sessionId: 'account-sync-keep-companion'
    })

    try {
        await primary.connect()
        const primaryPipeline = await server.waitForAuthenticatedPipeline(5_000)
        const linked = await linkCompanionViaQr(server, primary, companion)

        let revoked = 0
        primary.on('companion_host_revoked', () => {
            revoked += 1
        })

        // No explicit device list: the server pushes what it tracks.
        await server.pushAccountSyncDevices(primaryPipeline)
        await new Promise((resolve) => setTimeout(resolve, 500))

        assert.equal(revoked, 0, 'a device still listed must not be pruned')
        const companions = await primary.mobile.listCompanions()
        assert.equal(companions.length, 1)
        assert.equal(companions[0].deviceJid, linked.deviceJid)
    } finally {
        await companion.disconnect().catch(() => undefined)
        await primary.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('registration notifications surface the login code and takeover warning', async () => {
    const server = await FakeWaServer.start({ tcp: true })
    const { client: primary } = await createZapoMobileClient(server, {
        sessionId: 'registration-notifications',
        phoneNumber: PHONE
    })

    const codePromise = new Promise<Parameters<WaClientEventMap['mobile_registration_code']>[0]>(
        (resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('registration code timed out')), 15_000)
            primary.once('mobile_registration_code', (event) => {
                clearTimeout(timer)
                resolve(event)
            })
        }
    )
    const takeoverPromise = new Promise<
        Parameters<WaClientEventMap['mobile_account_takeover_notice']>[0]
    >((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('takeover notice timed out')), 15_000)
        primary.once('mobile_account_takeover_notice', (event) => {
            clearTimeout(timer)
            resolve(event)
        })
    })

    try {
        await primary.connect()
        const pipeline = await server.waitForAuthenticatedPipeline(5_000)

        await pipeline.sendStanza(
            buildRegistrationCodeNotification({ code: '123456', fromDeviceId: 'device-7' })
        )
        const code = await codePromise
        assert.equal(code.code, '123456')
        assert.equal(code.fromDeviceId, 'device-7')
        assert.ok(code.expiryTimestampMs > Date.now(), 'the code carries a future expiry')

        await pipeline.sendStanza(
            buildAccountTakeoverNotice({
                serverToken: 'token-42',
                newDeviceName: 'Pixel 9',
                newDevicePlatform: 'android'
            })
        )
        const takeover = await takeoverPromise
        assert.equal(takeover.serverToken, 'token-42')
        assert.equal(takeover.newDeviceName, 'Pixel 9')
        assert.equal(takeover.newDevicePlatform, 'android')
    } finally {
        await primary.disconnect().catch(() => undefined)
        await server.stop()
    }
})
