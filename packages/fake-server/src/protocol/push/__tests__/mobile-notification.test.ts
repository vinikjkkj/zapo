import assert from 'node:assert/strict'
import test from 'node:test'

import type { BinaryNode } from '../../../transport/codec'
import {
    buildAccountSyncDevicesNotification,
    buildAccountTakeoverNotice,
    buildRegistrationCodeNotification
} from '../mobile-notification'

function firstChild(node: BinaryNode): BinaryNode {
    const children = node.content as BinaryNode[]
    return children[0]
}

test('buildAccountSyncDevicesNotification lists every device of the account', () => {
    const notification = buildAccountSyncDevicesNotification({
        devices: [
            { deviceJid: '5511999999999@s.whatsapp.net', keyIndex: 0 },
            { deviceJid: '5511999999999:3@s.whatsapp.net', keyIndex: 4, deviceLid: '123:3@lid' }
        ],
        timestampSeconds: 1_700_000_000
    })

    assert.equal(notification.tag, 'notification')
    assert.equal(notification.attrs.type, 'account_sync')
    assert.equal(notification.attrs.from, 's.whatsapp.net')
    assert.equal(notification.attrs.t, '1700000000')

    const devices = firstChild(notification)
    assert.equal(devices.tag, 'devices')
    const entries = devices.content as BinaryNode[]
    assert.equal(entries.length, 2)
    assert.equal(entries[0].attrs.jid, '5511999999999@s.whatsapp.net')
    assert.equal(entries[0].attrs['key-index'], '0')
    assert.equal(entries[0].attrs.lid, undefined)
    assert.equal(entries[1].attrs['key-index'], '4')
    assert.equal(entries[1].attrs.lid, '123:3@lid')
})

test('buildAccountSyncDevicesNotification omits key-index when it is unknown', () => {
    const notification = buildAccountSyncDevicesNotification({
        devices: [{ deviceJid: '5511999999999:1@s.whatsapp.net' }]
    })

    const entry = (firstChild(notification).content as BinaryNode[])[0]
    assert.equal(entry.attrs['key-index'], undefined)
})

test('buildRegistrationCodeNotification carries the code, expiry and requesting device', () => {
    const notification = buildRegistrationCodeNotification({
        code: '123456',
        fromDeviceId: 'device-7',
        expirySeconds: 1_700_000_300
    })

    assert.equal(notification.attrs.type, 'registration')
    const registration = firstChild(notification)
    assert.equal(registration.tag, 'wa_old_registration')
    assert.equal(registration.attrs.code, '123456')
    assert.equal(registration.attrs.expiry_t, '1700000300')
    assert.equal(registration.attrs.device_id, 'device-7')
})

test('buildAccountTakeoverNotice carries the token and only the fields it was given', () => {
    const full = buildAccountTakeoverNotice({
        serverToken: 'token-42',
        attemptTimestampSeconds: 1_700_000_000,
        newDeviceName: 'Pixel 9',
        newDevicePlatform: 'android',
        newDeviceAppVersion: '2.26.27.70'
    })
    const logout = firstChild(full)
    assert.equal(logout.tag, 'device_logout')
    assert.equal(logout.attrs.id, 'token-42')
    assert.equal(logout.attrs.t, '1700000000')
    assert.equal(logout.attrs.device, 'Pixel 9')
    assert.equal(logout.attrs.new_device_platform, 'android')
    assert.equal(logout.attrs.new_device_app_version, '2.26.27.70')

    const minimal = firstChild(buildAccountTakeoverNotice({ serverToken: 'token-1' }))
    assert.equal(minimal.attrs.device, undefined)
    assert.equal(minimal.attrs.new_device_platform, undefined)
    assert.equal(minimal.attrs.new_device_app_version, undefined)
    assert.ok(minimal.attrs.t, 'the attempt timestamp defaults to now')
})
