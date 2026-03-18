import assert from 'node:assert/strict'
import test from 'node:test'

import {
    WA_APP_STATE_CHAT_MUTATION_SPECS,
    getWaCompanionPlatformId,
    WA_COMPANION_PLATFORM_IDS,
    WA_DEFAULTS,
    WA_MEDIA_HKDF_INFO,
    getWaMediaHkdfInfo
} from '@protocol/constants'
import {
    getLoginIdentity,
    isBroadcastJid,
    isGroupJid,
    isGroupOrBroadcastJid,
    normalizeDeviceJid,
    normalizeRecipientJid,
    parsePhoneJid,
    parseSignalAddressFromJid,
    splitJid,
    toUserJid
} from '@protocol/jid'

test('jid split and normalization helpers', () => {
    assert.deepEqual(splitJid('123@s.whatsapp.net'), {
        user: '123',
        server: 's.whatsapp.net'
    })
    assert.throws(() => splitJid('invalid'), /invalid jid/)

    assert.equal(normalizeRecipientJid('5511999999999'), '5511999999999@s.whatsapp.net')
    assert.equal(normalizeRecipientJid('12345-6789'), '12345-6789@g.us')
    assert.equal(normalizeRecipientJid('abc+55 11'), '5511@s.whatsapp.net')
    assert.throws(() => normalizeRecipientJid('   '), /recipient cannot be empty/)

    assert.equal(parsePhoneJid('+55 (11) 9999-0000'), '551199990000@s.whatsapp.net')
    assert.throws(() => parsePhoneJid('()'), /phone number is empty/)
})

test('jid type detection and device handling', () => {
    assert.equal(isGroupJid('123@g.us'), true)
    assert.equal(isBroadcastJid('abc@broadcast'), true)
    assert.equal(isGroupOrBroadcastJid('abc@broadcast'), true)

    assert.deepEqual(parseSignalAddressFromJid('5511:3@s.whatsapp.net'), {
        user: '5511',
        server: 's.whatsapp.net',
        device: 3
    })
    assert.deepEqual(parseSignalAddressFromJid('5511@s.whatsapp.net'), {
        user: '5511',
        server: 's.whatsapp.net',
        device: 0
    })
    assert.throws(() => parseSignalAddressFromJid('5511:x@s.whatsapp.net'), /invalid jid device/)

    assert.equal(toUserJid('5511:3@s.whatsapp.net'), '5511@s.whatsapp.net')
    assert.equal(normalizeDeviceJid('5511:0@s.whatsapp.net'), '5511@s.whatsapp.net')
    assert.equal(normalizeDeviceJid('5511:5@s.whatsapp.net'), '5511:5@s.whatsapp.net')
})

test('login identity parsing and protocol constants', () => {
    assert.deepEqual(getLoginIdentity('5511:2@s.whatsapp.net'), {
        username: 5511,
        device: 2
    })
    assert.deepEqual(getLoginIdentity('5511.0:0@s.whatsapp.net'), {
        username: 5511,
        device: 0
    })
    assert.throws(() => getLoginIdentity('abc:0@s.whatsapp.net'), /invalid numeric username/)

    assert.equal(getWaCompanionPlatformId('Chrome'), WA_COMPANION_PLATFORM_IDS.CHROME)
    assert.equal(
        getWaCompanionPlatformId('unknown-browser'),
        WA_COMPANION_PLATFORM_IDS.OTHER_WEB_CLIENT
    )

    assert.equal(getWaMediaHkdfInfo('image'), WA_MEDIA_HKDF_INFO.image)
    assert.equal(typeof WA_DEFAULTS.HOST_DOMAIN, 'string')
    assert.equal(WA_APP_STATE_CHAT_MUTATION_SPECS.STAR.action, 'star')
    assert.equal(WA_APP_STATE_CHAT_MUTATION_SPECS.MUTE.action, 'mute')
    assert.equal(WA_APP_STATE_CHAT_MUTATION_SPECS.DELETE_MESSAGE_FOR_ME.version, 3)
    assert.equal(WA_APP_STATE_CHAT_MUTATION_SPECS.LOCK_CHAT.version, 7)
})
