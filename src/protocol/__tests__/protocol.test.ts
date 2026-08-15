import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveAbPropNameByCode, WA_ABPROPS } from '@abprops-spec'
import { WA_APPSTATE_SCHEMAS } from '@appstate-spec'
import { AB_PROP_CONFIGS } from '@protocol/abprops'
import { WA_BOT_KNOWN_JIDS, WA_BOT_MSG_EDIT_TYPES, WA_BOT_NODE_ATTRS } from '@protocol/bot'
import {
    getWaCompanionPlatformId,
    getWaMediaHkdfInfo,
    WA_COMPANION_PLATFORM_IDS,
    WA_DEFAULTS,
    WA_MEDIA_HKDF_INFO,
    WA_PRIVACY_ACCOUNT_SYNC_DISALLOWED_LISTS,
    WA_PRIVACY_CATEGORIES,
    WA_PRIVACY_CATEGORY_TO_SETTING,
    WA_PRIVACY_DISALLOWED_LIST_CATEGORIES,
    WA_PRIVACY_SETTING_TO_CATEGORY,
    WA_PRIVACY_VALUES
} from '@protocol/constants'
import {
    applyDeviceToJid,
    buildDeviceJid,
    canonicalizeOwnAccountJid,
    canonicalizeSignalJid,
    canonicalizeSignalServer,
    getLoginIdentity,
    isBotJid,
    isBroadcastJid,
    isGroupJid,
    isGroupOrBroadcastJid,
    isHostedDeviceId,
    isHostedDeviceJid,
    isHostedServer,
    isNewsletterJid,
    isOwnAccountJid,
    isStatusBroadcastJid,
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
import {
    displayUsername,
    isUsernameKey,
    normalizeUsername,
    parseUsernameHandle,
    splitUsernameHandle,
    validateUsernameLocally,
    WA_USERNAME_LIMITS,
    WA_USERNAME_VALIDATION_ERRORS
} from '@protocol/username'
import { TEXT_DECODER } from '@util/bytes'

test('canonicalizeOwnAccountJid maps own PN device JIDs to LID', () => {
    const meJid = '5512988950329:15@s.whatsapp.net'
    const meLid = '91379841634519:15@lid'
    assert.equal(
        canonicalizeOwnAccountJid('5512988950329@s.whatsapp.net', meJid, meLid),
        '91379841634519@lid'
    )
    assert.equal(
        canonicalizeOwnAccountJid('5512988950329:0@s.whatsapp.net', meJid, meLid),
        '91379841634519@lid'
    )
    assert.equal(
        canonicalizeOwnAccountJid('5512988950329:12@s.whatsapp.net', meJid, meLid),
        '91379841634519:12@lid'
    )
    assert.equal(
        canonicalizeOwnAccountJid('91379841634519@lid', meJid, meLid),
        '91379841634519@lid'
    )
    assert.equal(
        canonicalizeOwnAccountJid('5511999999999@s.whatsapp.net', meJid, meLid),
        '5511999999999@s.whatsapp.net'
    )
    assert.equal(
        canonicalizeOwnAccountJid('5512988950329@s.whatsapp.net', meJid, null),
        '5512988950329@s.whatsapp.net'
    )
})

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

test('jid parsing interns known servers and passes unknown ones through', () => {
    assert.strictEqual(splitJid('123@s.whatsapp.net').server, WA_DEFAULTS.HOST_DOMAIN)
    assert.strictEqual(splitJid('123@lid').server, WA_DEFAULTS.LID_SERVER)
    assert.strictEqual(parseSignalAddressFromJid('120@g.us').server, WA_DEFAULTS.GROUP_SERVER)
    assert.strictEqual(
        parseSignalAddressFromJid('123:4@hosted.lid').server,
        WA_DEFAULTS.HOSTED_LID_SERVER
    )

    assert.equal(splitJid('123@lid.example').server, 'lid.example')
    assert.equal(splitJid('123@li').server, 'li')
    assert.equal(parseSignalAddressFromJid('123:2@custom').server, 'custom')
})

test('toUserJid returns the input verbatim only when the rewrite is a no-op', () => {
    const canonical = { canonicalizeSignalServer: true }

    const lid = '5511900000123@lid'
    const pn = '5511900000123@s.whatsapp.net'
    assert.strictEqual(toUserJid(lid, canonical), lid)
    assert.strictEqual(toUserJid(pn, canonical), pn)
    assert.strictEqual(toUserJid(lid), lid)

    assert.equal(toUserJid('5511900000123:0@lid', canonical), '5511900000123@lid')
    assert.equal(toUserJid('5511900000123:0@lid'), '5511900000123@lid')

    assert.equal(toUserJid('5511900000123:4@lid', canonical), '5511900000123@lid')
    assert.equal(toUserJid('5511900000123@hosted', canonical), '5511900000123@s.whatsapp.net')
    assert.equal(toUserJid('5511900000123@hosted.lid', canonical), '5511900000123@lid')
    assert.equal(toUserJid('5511900000123:2@hosted', canonical), '5511900000123@s.whatsapp.net')
})

test('jid type detection and device handling', () => {
    assert.equal(isGroupJid('123@g.us'), true)
    assert.equal(isBroadcastJid('abc@broadcast'), true)
    assert.equal(isGroupOrBroadcastJid('abc@broadcast'), true)
    assert.equal(isNewsletterJid('120363025343298869@newsletter'), true)
    assert.equal(isNewsletterJid('120363025343298869@s.whatsapp.net'), false)
    assert.equal(isNewsletterJid('@newsletter'), false)
    assert.equal(isStatusBroadcastJid('status@broadcast'), true)
    assert.equal(isStatusBroadcastJid('120@broadcast'), false)
    assert.equal(isStatusBroadcastJid('status@s.whatsapp.net'), false)

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

    assert.equal(isOwnAccountJid('5511:7@s.whatsapp.net', '5511@s.whatsapp.net', null), true)
    assert.equal(isOwnAccountJid('1330@lid', '5511@s.whatsapp.net', '1330@lid'), true)
    assert.equal(isOwnAccountJid('5599@s.whatsapp.net', '5511@s.whatsapp.net', '1330@lid'), false)
    assert.equal(isOwnAccountJid('5511@s.whatsapp.net', null, null), false)

    // A hosted device of the account is the account (wa-web isSameAccountAndAddressingMode).
    assert.equal(isOwnAccountJid('1330:99@hosted.lid', '5511@s.whatsapp.net', '1330@lid'), true)
    assert.equal(isOwnAccountJid('5511:99@hosted', '5511@s.whatsapp.net', '1330@lid'), true)
    assert.equal(isOwnAccountJid('1330:99@hosted.lid', '5511@s.whatsapp.net', null), false)
    assert.equal(isOwnAccountJid('9999:99@hosted.lid', '5511@s.whatsapp.net', '1330@lid'), false)
    assert.equal(isOwnAccountJid('1330@lid', '5511:99@hosted', '1330:99@hosted.lid'), true)

    assert.equal(normalizeDeviceJid('5511:0@s.whatsapp.net'), '5511@s.whatsapp.net')
    assert.equal(normalizeDeviceJid('5511:5@s.whatsapp.net'), '5511:5@s.whatsapp.net')

    assert.equal(applyDeviceToJid('5511@s.whatsapp.net', undefined), '5511@s.whatsapp.net')
    assert.equal(applyDeviceToJid('5511@s.whatsapp.net', 0), '5511@s.whatsapp.net')
    assert.equal(applyDeviceToJid('5511@s.whatsapp.net', 5), '5511:5@s.whatsapp.net')
    assert.equal(applyDeviceToJid('5511@lid', 65), '5511:65@lid')
    assert.equal(applyDeviceToJid('5511@s.whatsapp.net', 99), '5511:99@s.whatsapp.net')

    assert.equal(canonicalizeSignalServer('hosted'), 's.whatsapp.net')
    assert.equal(canonicalizeSignalServer('hosted.lid'), 'lid')
    assert.equal(canonicalizeSignalJid('5511:99@hosted.lid'), '5511:99@lid')
    assert.equal(canonicalizeSignalJid('5511:99@hosted'), '5511:99@s.whatsapp.net')
    assert.equal(toUserJid('5511:99@hosted.lid', { canonicalizeSignalServer: true }), '5511@lid')

    assert.equal(isHostedServer('hosted'), true)
    assert.equal(isHostedServer('hosted.lid'), true)
    assert.equal(isHostedServer('lid'), false)

    assert.equal(isBotJid('867051314767696@bot'), true)
    assert.equal(isBotJid('867051314767696:0@bot'), true)
    assert.equal(isBotJid('123@s.whatsapp.net'), false)
    assert.equal(WA_BOT_KNOWN_JIDS.META_AI_FBID, '867051314767696@bot')
    assert.equal(WA_BOT_KNOWN_JIDS.META_AI_PN, '13135550002@s.whatsapp.net')
    assert.equal(WA_BOT_MSG_EDIT_TYPES.FIRST, 'first')
    assert.equal(WA_BOT_MSG_EDIT_TYPES.LAST, 'last')
    assert.equal(WA_BOT_NODE_ATTRS.EDIT_TARGET_ID, 'edit_target_id')
    assert.equal(isHostedDeviceId(99), true)
    assert.equal(isHostedDeviceId(3), false)
    assert.equal(isHostedDeviceJid('5511:99@hosted.lid'), true)
    assert.equal(isHostedDeviceJid('5511:99@lid'), true)
    assert.equal(isHostedDeviceJid('5511:1@lid'), false)
    // Detected by server alone, and malformed shapes still rejected.
    assert.equal(isHostedDeviceJid('5511@hosted'), true)
    assert.equal(isHostedDeviceJid('5511@hosted.lid'), true)
    assert.equal(isHostedDeviceJid('a@b@hosted'), false)
    assert.equal(isHostedDeviceJid('@hosted'), false)
    assert.equal(isHostedDeviceJid('5511@hostedd'), false)
    assert.equal(isHostedDeviceJid('5511@hosted.li'), false)

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
    assert.equal(TEXT_DECODER.decode(getWaMediaHkdfInfo('group-history')), 'Group History')
    assert.equal(TEXT_DECODER.decode(getWaMediaHkdfInfo('history')), 'WhatsApp History Keys')
    assert.equal(typeof WA_DEFAULTS.HOST_DOMAIN, 'string')
    assert.equal(WA_APPSTATE_SCHEMAS.Star.name, 'star')
    assert.equal(WA_APPSTATE_SCHEMAS.Mute.name, 'mute')
    assert.equal(WA_APPSTATE_SCHEMAS.DeleteMessageForMe.version, 3)
    assert.equal(WA_APPSTATE_SCHEMAS.LockChat.version, 7)
})

test('privacy protocol constants keep mapping invariants', () => {
    const disallowedSettingsTypeCheck: Record<WaPrivacyDisallowedListSettingName, true> = {
        about: true,
        groupAdd: true,
        lastSeen: true,
        profilePicture: true,
        linkedProfiles: true,
        pix: true
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
    assert.deepEqual(disallowedSettings.sort(), [
        'about',
        'groupAdd',
        'lastSeen',
        'linkedProfiles',
        'pix',
        'profilePicture'
    ])
    assert.deepEqual(WA_PRIVACY_ACCOUNT_SYNC_DISALLOWED_LISTS, [
        'about',
        'groupAdd',
        'lastSeen',
        'profilePicture'
    ])
})

test('ab props expose the group and trusted-contact configs the client reads', () => {
    assert.equal(WA_ABPROPS.group_size_limit.code, 1304)
    assert.equal(WA_ABPROPS.group_size_limit.type, 'int')
    assert.equal(WA_ABPROPS.community_announcement_group_size_limit.code, 2774)
    assert.equal(WA_ABPROPS.tctoken_duration.code, 865)
    assert.equal(WA_ABPROPS.tctoken_duration_sender.code, 996)

    assert.equal(resolveAbPropNameByCode(1304), 'group_size_limit')
    assert.equal(resolveAbPropNameByCode(2774), 'community_announcement_group_size_limit')
    assert.equal(resolveAbPropNameByCode(865), 'tctoken_duration')
    assert.equal(resolveAbPropNameByCode(996), 'tctoken_duration_sender')
})

test('ab props reverse map drops codes this bundle does not know', () => {
    assert.equal(resolveAbPropNameByCode(0), undefined)
    assert.equal(resolveAbPropNameByCode(Number.MAX_SAFE_INTEGER), undefined)
})

test('deprecated AB_PROP_CONFIGS view still exposes configCode over the spec table', () => {
    assert.deepEqual(AB_PROP_CONFIGS.group_size_limit, {
        configCode: 1304,
        type: 'int',
        defaultValue: 257
    })
    assert.deepEqual(AB_PROP_CONFIGS.tctoken_duration, {
        configCode: 865,
        type: 'int',
        defaultValue: 604_800
    })
    assert.deepEqual(AB_PROP_CONFIGS.wa_web_contact_and_chat_fuzzy_search_distance_threshold, {
        configCode: 26731,
        type: 'float',
        defaultValue: 0.30000001192092896
    })
    assert.deepEqual(
        Object.keys(AB_PROP_CONFIGS).sort(),
        Object.keys(WA_ABPROPS).sort(),
        'the compatibility view must cover the whole catalogue'
    )
})

test('username validation applies the wa-web rule order', () => {
    assert.deepEqual(validateUsernameLocally('joao.silva_1'), { isValid: true })
    assert.deepEqual(validateUsernameLocally('jo ao'), {
        isValid: false,
        errorType: WA_USERNAME_VALIDATION_ERRORS.INVALID_CHARACTER
    })
    assert.deepEqual(validateUsernameLocally('ab'), {
        isValid: false,
        errorType: WA_USERNAME_VALIDATION_ERRORS.INVALID_LENGTH
    })
    assert.deepEqual(validateUsernameLocally('a'.repeat(WA_USERNAME_LIMITS.MAX_LENGTH + 1)), {
        isValid: false,
        errorType: WA_USERNAME_VALIDATION_ERRORS.INVALID_LENGTH
    })
    assert.deepEqual(validateUsernameLocally('1234'), {
        isValid: false,
        errorType: WA_USERNAME_VALIDATION_ERRORS.INVALID_NO_LETTERS
    })
    assert.deepEqual(validateUsernameLocally('.joao'), {
        isValid: false,
        errorType: WA_USERNAME_VALIDATION_ERRORS.INVALID_PERIODS
    })
    assert.deepEqual(validateUsernameLocally('joao.'), {
        isValid: false,
        errorType: WA_USERNAME_VALIDATION_ERRORS.INVALID_PERIODS
    })
    assert.deepEqual(validateUsernameLocally('jo..ao'), {
        isValid: false,
        errorType: WA_USERNAME_VALIDATION_ERRORS.INVALID_PERIODS
    })
    assert.deepEqual(validateUsernameLocally('www.joao'), {
        isValid: false,
        errorType: WA_USERNAME_VALIDATION_ERRORS.INVALID_WWW_PREFIX
    })
    assert.deepEqual(validateUsernameLocally('joao.com'), {
        isValid: false,
        errorType: WA_USERNAME_VALIDATION_ERRORS.INVALID_DOMAIN_SUFFIX
    })
    assert.deepEqual(validateUsernameLocally('myWhatsAppName'), {
        isValid: false,
        errorType: WA_USERNAME_VALIDATION_ERRORS.INVALID_WORD
    })
})

test('username key and handle parsing', () => {
    assert.equal(isUsernameKey('1234'), true)
    assert.equal(isUsernameKey('123'), false)
    assert.equal(isUsernameKey('12a4'), false)
    assert.equal(normalizeUsername('@joao'), 'joao')
    assert.equal(normalizeUsername('joao'), 'joao')
    assert.equal(displayUsername('joao'), '@joao')

    assert.deepEqual(parseUsernameHandle('@joao'), { username: 'joao', usernameKey: null })
    assert.deepEqual(parseUsernameHandle('  joao  '), { username: 'joao', usernameKey: null })
    assert.deepEqual(parseUsernameHandle('@joao:1234'), { username: 'joao', usernameKey: '1234' })
    assert.equal(parseUsernameHandle('@joao:12'), null)
    assert.equal(parseUsernameHandle('@ab'), null)
    assert.equal(parseUsernameHandle('   '), null)
})

test('splitUsernameHandle separates the parts without validating them', () => {
    assert.deepEqual(splitUsernameHandle('@joao:1234'), { username: 'joao', usernameKey: '1234' })
    assert.deepEqual(splitUsernameHandle('  @ab:x  '), { username: 'ab', usernameKey: 'x' })
    assert.deepEqual(splitUsernameHandle('joao'), { username: 'joao', usernameKey: null })
})
