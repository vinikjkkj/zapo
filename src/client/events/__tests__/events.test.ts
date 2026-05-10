import assert from 'node:assert/strict'
import test from 'node:test'

import { parseChatEventFromAppStateMutation } from '@client/events/chat'
import { parseChatstateNode } from '@client/events/chatstate'
import { parseGroupNotificationEvents } from '@client/events/group'
import { parsePresenceNode } from '@client/events/presence'
import { parsePrivacyTokenNotification } from '@client/events/privacy-token'
import { aggregateReceiptTargets } from '@client/events/receipt'
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

test('chatstate parser extracts state, media and participant', () => {
    const composing = parseChatstateNode({
        tag: 'chatstate',
        attrs: { from: 'group@g.us', participant: 'peer@s.whatsapp.net' },
        content: [{ tag: 'composing', attrs: {} }]
    })
    assert.deepEqual(composing, {
        state: 'composing',
        participantJid: 'peer@s.whatsapp.net'
    })

    const recording = parseChatstateNode({
        tag: 'chatstate',
        attrs: { from: 'peer@s.whatsapp.net' },
        content: [{ tag: 'composing', attrs: { media: 'audio' } }]
    })
    assert.deepEqual(recording, { state: 'composing', media: 'audio' })

    const paused = parseChatstateNode({
        tag: 'chatstate',
        attrs: { from: 'peer@s.whatsapp.net' },
        content: [{ tag: 'paused', attrs: {} }]
    })
    assert.deepEqual(paused, { state: 'paused' })

    assert.equal(
        parseChatstateNode({
            tag: 'chatstate',
            attrs: { from: 'peer@s.whatsapp.net' }
        }),
        null
    )
    assert.equal(
        parseChatstateNode({
            tag: 'chatstate',
            attrs: { from: 'peer@s.whatsapp.net' },
            content: [{ tag: 'unknown', attrs: {} }]
        }),
        null
    )
})

test('presence parser distinguishes user/group variants and last-seen flavors', () => {
    assert.deepEqual(
        parsePresenceNode({
            tag: 'presence',
            attrs: { from: 'peer@s.whatsapp.net', type: 'available' }
        }),
        { type: 'available' }
    )

    assert.deepEqual(
        parsePresenceNode({
            tag: 'presence',
            attrs: { from: 'peer@s.whatsapp.net' }
        }),
        { type: 'available' }
    )

    assert.deepEqual(
        parsePresenceNode({
            tag: 'presence',
            attrs: { from: 'peer@s.whatsapp.net', type: 'unavailable', last: '1700000000' }
        }),
        { type: 'unavailable', lastSeen: { kind: 'timestamp', unixSeconds: 1700000000 } }
    )

    assert.deepEqual(
        parsePresenceNode({
            tag: 'presence',
            attrs: { from: 'peer@s.whatsapp.net', type: 'unavailable', last: '0' }
        }),
        { type: 'unavailable', lastSeen: { kind: 'timestamp', unixSeconds: 0 } }
    )

    assert.deepEqual(
        parsePresenceNode({
            tag: 'presence',
            attrs: { from: 'peer@s.whatsapp.net', type: 'unavailable', last: 'deny' }
        }),
        { type: 'unavailable', lastSeen: { kind: 'privacy_denied' } }
    )

    assert.deepEqual(
        parsePresenceNode({
            tag: 'presence',
            attrs: { from: 'peer@s.whatsapp.net', type: 'unavailable', last: 'none' }
        }),
        { type: 'unavailable', lastSeen: { kind: 'never_online' } }
    )

    assert.deepEqual(
        parsePresenceNode({
            tag: 'presence',
            attrs: { from: 'peer@s.whatsapp.net', type: 'unavailable', last: 'error' }
        }),
        { type: 'unavailable', lastSeen: { kind: 'unknown' } }
    )

    assert.deepEqual(
        parsePresenceNode({
            tag: 'presence',
            attrs: { from: 'group@g.us', count: '7' }
        }),
        { type: 'available', groupOnlineCount: 7 }
    )

    assert.deepEqual(
        parsePresenceNode({
            tag: 'presence',
            attrs: { from: 'group@g.us', type: 'unavailable' }
        }),
        { type: 'unavailable', groupOnlineCount: 0 }
    )

    assert.deepEqual(
        parsePresenceNode({
            tag: 'presence',
            attrs: { from: 'peer@s.whatsapp.net', type: 'unavailable', last: '10foo' }
        }),
        { type: 'unavailable', lastSeen: { kind: 'unknown' } }
    )

    assert.deepEqual(
        parsePresenceNode({
            tag: 'presence',
            attrs: { from: 'peer@s.whatsapp.net', type: 'unavailable', last: '-1' }
        }),
        { type: 'unavailable', lastSeen: { kind: 'unknown' } }
    )

    assert.deepEqual(
        parsePresenceNode({
            tag: 'presence',
            attrs: {
                from: 'peer@s.whatsapp.net',
                type: 'unavailable',
                last: '99999999999999999999'
            }
        }),
        { type: 'unavailable', lastSeen: { kind: 'unknown' } }
    )

    assert.deepEqual(
        parsePresenceNode({
            tag: 'presence',
            attrs: { from: 'group@g.us', count: '7foo' }
        }),
        { type: 'available' }
    )
})

test('aggregateReceiptTargets groups by chat and sender, batching same-author ids', () => {
    const groups = aggregateReceiptTargets([
        { chatJid: 'peer@s.whatsapp.net', id: 'A1', isGroupChat: false },
        { chatJid: 'peer@s.whatsapp.net', id: 'A2', isGroupChat: false }
    ])
    assert.deepEqual(groups, [
        { jid: 'peer@s.whatsapp.net', participant: undefined, ids: ['A1', 'A2'] }
    ])

    const groupReceipts = aggregateReceiptTargets([
        { chatJid: 'group@g.us', id: 'B1', senderJid: 'alice@s.whatsapp.net', isGroupChat: true },
        { chatJid: 'group@g.us', id: 'B2', senderJid: 'alice@s.whatsapp.net', isGroupChat: true },
        { chatJid: 'group@g.us', id: 'B3', senderJid: 'bob@s.whatsapp.net', isGroupChat: true }
    ])
    assert.deepEqual(groupReceipts, [
        { jid: 'group@g.us', participant: 'alice@s.whatsapp.net', ids: ['B1', 'B2'] },
        { jid: 'group@g.us', participant: 'bob@s.whatsapp.net', ids: ['B3'] }
    ])

    const mixed = aggregateReceiptTargets([
        { chatJid: 'peer@s.whatsapp.net', id: 'C1', isGroupChat: false },
        { chatJid: 'group@g.us', id: 'C2', senderJid: 'alice@s.whatsapp.net', isGroupChat: true }
    ])
    assert.deepEqual(mixed, [
        { jid: 'peer@s.whatsapp.net', participant: undefined, ids: ['C1'] },
        { jid: 'group@g.us', participant: 'alice@s.whatsapp.net', ids: ['C2'] }
    ])

    const inferred = aggregateReceiptTargets([
        { chatJid: 'group2@g.us', id: 'D1', senderJid: 'carol@s.whatsapp.net' }
    ])
    assert.equal(inferred[0].participant, 'carol@s.whatsapp.net')

    const noSender = aggregateReceiptTargets([
        { chatJid: 'group3@g.us', id: 'E1', isGroupChat: true }
    ])
    assert.equal(noSender[0].participant, undefined)

    const broadcastInferred = aggregateReceiptTargets([
        { chatJid: 'list@broadcast', id: 'F1', senderJid: 'dave@s.whatsapp.net' }
    ])
    assert.equal(broadcastInferred[0].participant, 'dave@s.whatsapp.net')

    const broadcastExplicit = aggregateReceiptTargets([
        {
            chatJid: 'list@broadcast',
            id: 'G1',
            senderJid: 'erin@s.whatsapp.net',
            isBroadcastChat: true,
            isGroupChat: false
        }
    ])
    assert.equal(broadcastExplicit[0].participant, 'erin@s.whatsapp.net')
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
