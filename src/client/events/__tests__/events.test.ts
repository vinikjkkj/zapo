import assert from 'node:assert/strict'
import test from 'node:test'

import { parseChatEventFromAppStateMutation } from '@client/events/chat'
import { parseGroupNotificationEvents } from '@client/events/group'
import { parsePrivacyTokenNotification } from '@client/events/privacy-token'
import { parseRegistrationNotification } from '@client/events/registration'
import {
    WA_NOTIFICATION_TYPES,
    WA_PRIVACY_TOKEN_TAGS,
    WA_REGISTRATION_NOTIFICATION_TAGS
} from '@protocol/constants'

test('chat event parser maps app-state mutation to chat actions', () => {
    const parsed = parseChatEventFromAppStateMutation({
        collection: 'regular',
        operation: 'set',
        source: 'patch',
        index: JSON.stringify(['mute', '5511@s.whatsapp.net']),
        value: {
            muteAction: {
                muted: true,
                muteEndTimestamp: 1200
            }
        },
        version: 1,
        indexMac: new Uint8Array([1]),
        valueMac: new Uint8Array([2]),
        keyId: new Uint8Array([3]),
        timestamp: 100
    })

    assert.ok(parsed)
    assert.equal(parsed?.action, 'mute')
    assert.equal(parsed?.chatJid, '5511@s.whatsapp.net')
    assert.equal(parsed?.muted, true)
})

test('group notification parser handles supported and unsupported actions', () => {
    const node = {
        tag: 'notification',
        attrs: {
            type: WA_NOTIFICATION_TYPES.GROUP,
            id: '1',
            from: 'group@g.us',
            participant: 'owner@s.whatsapp.net',
            t: '10'
        },
        content: [
            {
                tag: 'add',
                attrs: {},
                content: [
                    {
                        tag: 'participant',
                        attrs: { jid: 'user@s.whatsapp.net', type: 'member' }
                    }
                ]
            },
            {
                tag: 'unsupported_action',
                attrs: {}
            }
        ]
    }

    const parsed = parseGroupNotificationEvents(node)
    assert.equal(parsed.events.length, 1)
    assert.equal(parsed.events[0].action, 'add')
    assert.equal(parsed.unhandled.length, 1)
    assert.match(parsed.unhandled[0].reason, /not_supported/)
})

test('privacy token parser keeps valid token entries and skips malformed payloads', () => {
    const validTokenBytes = new Uint8Array([1, 2, 3])
    const parsed = parsePrivacyTokenNotification({
        tag: 'notification',
        attrs: {},
        content: [
            {
                tag: WA_PRIVACY_TOKEN_TAGS.TOKENS,
                attrs: {},
                content: [
                    {
                        tag: WA_PRIVACY_TOKEN_TAGS.TOKEN,
                        attrs: {
                            type: 'trusted_contact',
                            t: '42'
                        },
                        content: validTokenBytes
                    },
                    {
                        tag: WA_PRIVACY_TOKEN_TAGS.TOKEN,
                        attrs: {
                            type: 'trusted_contact'
                        },
                        content: new Uint8Array([9])
                    },
                    {
                        tag: WA_PRIVACY_TOKEN_TAGS.TOKEN,
                        attrs: {
                            t: '99'
                        },
                        content: new Uint8Array([9])
                    },
                    {
                        tag: WA_PRIVACY_TOKEN_TAGS.TOKEN,
                        attrs: {
                            type: 'trusted_contact',
                            t: '100'
                        },
                        content: 'invalid'
                    },
                    {
                        tag: 'ignored',
                        attrs: {}
                    }
                ]
            }
        ]
    })

    assert.equal(parsed.length, 1)
    assert.equal(parsed[0].type, 'trusted_contact')
    assert.equal(parsed[0].timestampS, 42)
    assert.deepEqual(parsed[0].tokenBytes, validTokenBytes)
})

test('registration parser extracts wa_old_registration code with expiry and from-device id', () => {
    const parsed = parseRegistrationNotification({
        tag: 'notification',
        attrs: {
            type: WA_NOTIFICATION_TYPES.REGISTRATION,
            id: 'r-1',
            from: 's.whatsapp.net'
        },
        content: [
            {
                tag: WA_REGISTRATION_NOTIFICATION_TAGS.WA_OLD_REGISTRATION,
                attrs: {
                    code: '123456',
                    expiry_t: '1730000000',
                    device_id: 'AAAAAAAAAAAAAAAAAAAAAA'
                }
            }
        ]
    })

    assert.ok(parsed)
    assert.equal(parsed?.kind, 'registration_code')
    if (parsed?.kind === 'registration_code') {
        assert.equal(parsed.code, '123456')
        assert.equal(parsed.expiryTimestampMs, 1730000000 * 1000)
        assert.equal(parsed.fromDeviceId, 'AAAAAAAAAAAAAAAAAAAAAA')
    }
})

test('registration parser extracts account_takeover_notice from device_logout child', () => {
    const parsed = parseRegistrationNotification({
        tag: 'notification',
        attrs: { type: WA_NOTIFICATION_TYPES.REGISTRATION },
        content: [
            {
                tag: WA_REGISTRATION_NOTIFICATION_TAGS.DEVICE_LOGOUT,
                attrs: {
                    id: 'logout-1',
                    t: '1700000000',
                    device: 'iPhone 15',
                    new_device_platform: 'iphone',
                    new_device_app_version: '24.10.0'
                }
            }
        ]
    })

    assert.ok(parsed)
    assert.equal(parsed?.kind, 'account_takeover_notice')
    if (parsed?.kind === 'account_takeover_notice') {
        assert.equal(parsed.serverToken, 'logout-1')
        assert.equal(parsed.attemptTimestampMs, 1700000000 * 1000)
        assert.equal(parsed.newDeviceName, 'iPhone 15')
        assert.equal(parsed.newDevicePlatform, 'iphone')
        assert.equal(parsed.newDeviceAppVersion, '24.10.0')
    }
})

test('registration parser returns null when child tag is unknown or attrs are missing', () => {
    assert.equal(
        parseRegistrationNotification({
            tag: 'notification',
            attrs: { type: WA_NOTIFICATION_TYPES.REGISTRATION },
            content: [{ tag: 'unknown_child', attrs: {} }]
        }),
        null
    )

    assert.equal(
        parseRegistrationNotification({
            tag: 'notification',
            attrs: { type: WA_NOTIFICATION_TYPES.REGISTRATION },
            content: [
                {
                    tag: WA_REGISTRATION_NOTIFICATION_TAGS.WA_OLD_REGISTRATION,
                    attrs: { code: '123456', expiry_t: '1' }
                }
            ]
        }),
        null
    )

    assert.equal(
        parseRegistrationNotification({
            tag: 'notification',
            attrs: { type: WA_NOTIFICATION_TYPES.REGISTRATION }
        }),
        null
    )
})

test('privacy token parser rejects non-numeric token timestamp', () => {
    assert.throws(
        () =>
            parsePrivacyTokenNotification({
                tag: 'notification',
                attrs: {},
                content: [
                    {
                        tag: WA_PRIVACY_TOKEN_TAGS.TOKENS,
                        attrs: {},
                        content: [
                            {
                                tag: WA_PRIVACY_TOKEN_TAGS.TOKEN,
                                attrs: {
                                    type: 'trusted_contact',
                                    t: 'invalid'
                                },
                                content: new Uint8Array([1])
                            }
                        ]
                    }
                ]
            }),
        /privacy_token\.t/
    )
})
