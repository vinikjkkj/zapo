import assert from 'node:assert/strict'
import test from 'node:test'

import { createFakeMobilePrimary } from '../FakeMobilePrimary'

test('createFakeMobilePrimary builds registered credentials for the number', async () => {
    const primary = await createFakeMobilePrimary({ phoneNumber: '5511999999999' })

    assert.equal(primary.meJid, '5511999999999@s.whatsapp.net')
    assert.equal(primary.meLid, null)
    assert.equal(primary.credentials.meJid, primary.meJid)
    assert.equal(primary.credentials.deviceInfo?.appVersion, primary.deviceInfo.appVersion)
    assert.equal(primary.credentials.signedPreKey.signature.byteLength, 64)
})

test('createFakeMobilePrimary rejects numbers that cannot be a numeric username', async () => {
    await assert.rejects(
        () => createFakeMobilePrimary({ phoneNumber: '0551199999' }),
        /digits only/
    )
    await assert.rejects(
        () => createFakeMobilePrimary({ phoneNumber: '12345678901234567890' }),
        /too long/,
        'past the safe-integer range the login payload would fail on connect'
    )
})

test('createFakeMobilePrimary makes the primary lid-native on request', async () => {
    const primary = await createFakeMobilePrimary({
        phoneNumber: '5511999999999',
        lidUser: '99887766',
        pushName: 'Fixture'
    })

    assert.equal(primary.meLid, '99887766@lid')
    assert.equal(primary.credentials.meLid, '99887766@lid')
    assert.equal(primary.credentials.pushName, 'Fixture')
})
