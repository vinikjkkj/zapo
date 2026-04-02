import assert from 'node:assert/strict'
import test from 'node:test'

import { AB_PROP_CONFIGS, resolveAbPropNameByCode } from '@protocol/abprops'
import {
    WA_APP_STATE_CHAT_MUTATION_SPECS,
    getWaCompanionPlatformId,
    WA_COMPANION_PLATFORM_IDS,
    WA_DEFAULTS,
    WA_PRIVACY_CATEGORIES,
    WA_PRIVACY_CATEGORY_TO_SETTING,
    WA_PRIVACY_DISALLOWED_LIST_CATEGORIES,
    WA_PRIVACY_SETTING_TO_CATEGORY,
    WA_PRIVACY_VALUES,
    WA_MEDIA_HKDF_INFO,
    getWaMediaHkdfInfo
} from '@protocol/constants'
import {
    buildDeviceJid,
    canonicalizeSignalJid,
    canonicalizeSignalServer,
    getLoginIdentity,
    isHostedDeviceId,
    isHostedDeviceJid,
    isHostedServer,
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
import type {
    WaPrivacyDisallowedListSettingName,
    WaPrivacySettingValueMap
} from '@protocol/privacy'

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

    assert.equal(canonicalizeSignalServer('hosted'), 's.whatsapp.net')
    assert.equal(canonicalizeSignalServer('hosted.lid'), 'lid')
    assert.equal(canonicalizeSignalJid('5511:99@hosted.lid'), '5511:99@lid')
    assert.equal(canonicalizeSignalJid('5511:99@hosted'), '5511:99@s.whatsapp.net')
    assert.equal(toUserJid('5511:99@hosted.lid', { canonicalizeSignalServer: true }), '5511@lid')

    assert.equal(isHostedServer('hosted'), true)
    assert.equal(isHostedServer('hosted.lid'), true)
    assert.equal(isHostedServer('lid'), false)
    assert.equal(isHostedDeviceId(99), true)
    assert.equal(isHostedDeviceId(3), false)
    assert.equal(isHostedDeviceJid('5511:99@hosted.lid'), true)
    assert.equal(isHostedDeviceJid('5511:99@lid'), true)
    assert.equal(isHostedDeviceJid('5511:1@lid'), false)

    assert.equal(
        buildDeviceJid('6116570308623', 'lid', 99, {
            rawServer: 'hosted.lid',
            isHosted: true
        }),
        '6116570308623:99@hosted.lid'
    )
    assert.equal(
        buildDeviceJid('5511999999999', 's.whatsapp.net', 99, {
            rawServer: 'hosted',
            isHosted: true
        }),
        '5511999999999:99@hosted'
    )
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

test('privacy protocol constants keep mapping invariants', () => {
    const disallowedSettingsTypeCheck: Record<WaPrivacyDisallowedListSettingName, true> = {
        about: true,
        groupAdd: true,
        lastSeen: true,
        profilePicture: true
    }
    const validGroupAddValue: WaPrivacySettingValueMap['groupAdd'] = 'contact_blacklist'
    void disallowedSettingsTypeCheck
    void validGroupAddValue

    assert.equal(WA_PRIVACY_VALUES.ERROR, 'error')
    assert.equal(WA_PRIVACY_SETTING_TO_CATEGORY.groupAdd, WA_PRIVACY_CATEGORIES.GROUP_ADD)
    assert.equal(WA_PRIVACY_CATEGORY_TO_SETTING[WA_PRIVACY_CATEGORIES.GROUP_ADD], 'groupAdd')

    const disallowedSettings = Object.values(WA_PRIVACY_DISALLOWED_LIST_CATEGORIES).map(
        (category) => WA_PRIVACY_CATEGORY_TO_SETTING[category]
    )
    assert.deepEqual(disallowedSettings.sort(), ['about', 'groupAdd', 'lastSeen', 'profilePicture'])
})

test('ab props keep protocol-specific group and trusted-contact mappings', () => {
    assert.deepEqual(AB_PROP_CONFIGS.group_size_limit, {
        configCode: 1304,
        type: 'int',
        defaultValue: 257
    })
    assert.deepEqual(AB_PROP_CONFIGS.community_announcement_group_size_limit, {
        configCode: 2774,
        type: 'int',
        defaultValue: 5000
    })
    assert.deepEqual(AB_PROP_CONFIGS.tctoken_duration, {
        configCode: 865,
        type: 'int',
        defaultValue: 604800
    })
    assert.deepEqual(AB_PROP_CONFIGS.tctoken_duration_sender, {
        configCode: 996,
        type: 'int',
        defaultValue: 604800
    })
    assert.equal(resolveAbPropNameByCode(1304), 'group_size_limit')
    assert.equal(resolveAbPropNameByCode(2774), 'community_announcement_group_size_limit')
    assert.equal(resolveAbPropNameByCode(865), 'tctoken_duration')
    assert.equal(resolveAbPropNameByCode(996), 'tctoken_duration_sender')
})
