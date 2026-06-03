import assert from 'node:assert/strict'
import test from 'node:test'

import { parseAppStateMutationEvent } from '@client/events/appstate-mutation'
import { parseBusinessNotificationEvents } from '@client/events/business'
import { parseCallNode } from '@client/events/call'
import { parseChatstateNode } from '@client/events/chatstate'
import { parseGroupNotificationEvents } from '@client/events/group'
import { parseMexNotification } from '@client/events/mex-notification'
import { parsePresenceNode } from '@client/events/presence'
import { parsePrivacyTokenNotification } from '@client/events/privacy-token'
import { aggregateReceiptTargets, extractReceiptIds } from '@client/events/receipt'
import { parseRegistrationNotification } from '@client/events/registration'
import { proto } from '@proto'
import {
    WA_BUSINESS_NOTIFICATION_TAGS,
    WA_NOTIFICATION_TYPES,
    WA_PRIVACY_TOKEN_TAGS,
    WA_REGISTRATION_NOTIFICATION_TAGS
} from '@protocol/constants'
import type { BinaryNode } from '@transport/types'

test('appstate mutation parser decodes Mute schema', () => {
    const parsed = parseAppStateMutationEvent({
        collection: 'regular_high',
        operation: 'set',
        source: 'patch',
        index: JSON.stringify(['mute', '5511@s.whatsapp.net']),
        value: { muteAction: { muted: true, muteEndTimestamp: 1200 } },
        version: 1,
        indexMac: new Uint8Array([1]),
        valueMac: new Uint8Array([2]),
        keyId: new Uint8Array([3]),
        timestamp: 100
    })

    assert.ok(parsed)
    assert.equal(parsed?.schema, 'Mute')
    if (parsed?.schema === 'Mute' && parsed.operation === 'set') {
        assert.equal(parsed.chatJid, '5511@s.whatsapp.net')
        assert.equal(parsed.muted, true)
        assert.equal(parsed.muteEndTimestamp, 1200)
    }
})

test('appstate mutation parser decodes Star schema (message scope, boolString + jidOrZero)', () => {
    const parsed = parseAppStateMutationEvent({
        collection: 'regular_high',
        operation: 'set',
        source: 'patch',
        index: JSON.stringify(['star', 'group@g.us', 'MSG123', '0', 'peer@s.whatsapp.net']),
        value: { starAction: { starred: true } },
        version: 2,
        indexMac: new Uint8Array(),
        valueMac: new Uint8Array(),
        keyId: new Uint8Array(),
        timestamp: 5
    })

    assert.ok(parsed && parsed.schema === 'Star')
    if (parsed?.schema === 'Star' && parsed.operation === 'set') {
        assert.equal(parsed.remote, 'group@g.us')
        assert.equal(parsed.id, 'MSG123')
        assert.equal(parsed.fromMe, false)
        assert.equal(parsed.participant, 'peer@s.whatsapp.net')
        assert.equal(parsed.starred, true)
    }
})

test('appstate mutation parser decodes Star with jidOrZero "0" → null', () => {
    const parsed = parseAppStateMutationEvent({
        collection: 'regular_high',
        operation: 'set',
        source: 'patch',
        index: JSON.stringify(['star', '5511@s.whatsapp.net', 'MSG456', '1', '0']),
        value: { starAction: { starred: false } },
        version: 2,
        indexMac: new Uint8Array(),
        valueMac: new Uint8Array(),
        keyId: new Uint8Array(),
        timestamp: 6
    })

    assert.ok(parsed && parsed.schema === 'Star')
    if (parsed?.schema === 'Star' && parsed.operation === 'set') {
        assert.equal(parsed.fromMe, true)
        assert.equal(parsed.participant, null)
    }
})

test('appstate mutation parser decodes StatusPrivacy with enum field as string', () => {
    const parsed = parseAppStateMutationEvent({
        collection: 'regular_high',
        operation: 'set',
        source: 'patch',
        index: JSON.stringify(['status_privacy']),
        value: {
            statusPrivacy: { mode: 1, modes: [0, 2], userJid: ['a@lid'], shareToFB: true }
        },
        version: 7,
        indexMac: new Uint8Array(),
        valueMac: new Uint8Array(),
        keyId: new Uint8Array(),
        timestamp: 1
    })

    assert.ok(parsed && parsed.schema === 'StatusPrivacy')
    if (parsed?.schema === 'StatusPrivacy' && parsed.operation === 'set') {
        assert.equal(parsed.mode, 'DENY_LIST')
        assert.deepEqual(parsed.modes, ['ALLOW_LIST', 'CONTACTS'])
        assert.deepEqual(parsed.userJid, ['a@lid'])
        assert.equal(parsed.shareToFB, true)
    }
})

test('appstate mutation parser decodes BusinessBroadcastList remove (value=null)', () => {
    const parsed = parseAppStateMutationEvent({
        collection: 'regular',
        operation: 'remove',
        source: 'patch',
        index: JSON.stringify(['business_broadcast_list', 'list-2']),
        value: null,
        version: 1,
        indexMac: new Uint8Array(),
        valueMac: new Uint8Array(),
        keyId: new Uint8Array(),
        timestamp: 4
    })

    assert.ok(parsed && parsed.schema === 'BusinessBroadcastList')
    if (parsed?.schema === 'BusinessBroadcastList' && parsed.operation === 'remove') {
        assert.equal(parsed.id, 'list-2')
    }
})

test('appstate mutation parser returns null for unknown action name', () => {
    const parsed = parseAppStateMutationEvent({
        collection: 'regular',
        operation: 'set',
        source: 'patch',
        index: JSON.stringify(['totally_not_a_real_action', 'x']),
        value: null,
        version: 1,
        indexMac: new Uint8Array(),
        valueMac: new Uint8Array(),
        keyId: new Uint8Array(),
        timestamp: 0
    })
    assert.equal(parsed, null)
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

test('extractReceiptIds returns just the top-level id for a single receipt', () => {
    const node: BinaryNode = {
        tag: 'receipt',
        attrs: { id: 'A1', from: 'peer@s.whatsapp.net', type: 'read' }
    }
    assert.deepEqual(extractReceiptIds(node), ['A1'])
})

test('extractReceiptIds appends the top-level id after the <list><item> ids', () => {
    const node: BinaryNode = {
        tag: 'receipt',
        attrs: { id: 'TOP', from: 'peer@s.whatsapp.net', type: 'read' },
        content: [
            {
                tag: 'list',
                attrs: {},
                content: [
                    { tag: 'item', attrs: { id: 'A' } },
                    { tag: 'item', attrs: { id: 'B' } }
                ]
            }
        ]
    }
    assert.deepEqual(extractReceiptIds(node), ['A', 'B', 'TOP'])
})

test('extractReceiptIds uses server_id and omits the top-level id for view receipts', () => {
    const node: BinaryNode = {
        tag: 'receipt',
        attrs: { id: 'TOP', from: 'status@broadcast', type: 'view' },
        content: [
            {
                tag: 'list',
                attrs: {},
                content: [
                    { tag: 'item', attrs: { server_id: 'S1' } },
                    { tag: 'item', attrs: { server_id: 'S2' } }
                ]
            }
        ]
    }
    assert.deepEqual(extractReceiptIds(node), ['S1', 'S2'])
})

test('extractReceiptIds falls back to the top-level id for aggregated <participants> receipts', () => {
    const node: BinaryNode = {
        tag: 'receipt',
        attrs: { id: 'TOP', from: 'group@g.us', type: 'read' },
        content: [
            {
                tag: 'participants',
                attrs: { key: 'k1' },
                content: [{ tag: 'user', attrs: { jid: 'alice@s.whatsapp.net', t: '1' } }]
            }
        ]
    }
    assert.deepEqual(extractReceiptIds(node), ['TOP'])
})

function buildVerifiedNameCertBytes(opts: {
    serial?: number
    issuer?: string
    verifiedName?: string
}): Uint8Array {
    const details = proto.VerifiedNameCertificate.Details.encode({
        serial: opts.serial,
        issuer: opts.issuer,
        verifiedName: opts.verifiedName
    }).finish()
    return proto.VerifiedNameCertificate.encode({ details }).finish()
}

function bizNotification(content: readonly unknown[], extraAttrs: Record<string, string> = {}) {
    return {
        tag: 'notification',
        attrs: {
            type: WA_NOTIFICATION_TYPES.BUSINESS,
            id: 'n-1',
            from: '5511999999999@s.whatsapp.net',
            t: '1700000000',
            ...extraAttrs
        },
        content
    } as Parameters<typeof parseBusinessNotificationEvents>[0]
}

test('business parser returns empty when notification is not type=business', () => {
    const parsed = parseBusinessNotificationEvents({
        tag: 'notification',
        attrs: { type: 'other' }
    })
    assert.equal(parsed.events.length, 0)
    assert.equal(parsed.unhandled.length, 0)
})

test('business parser handles verified_name with jid + inline certificate', () => {
    const certBytes = buildVerifiedNameCertBytes({
        serial: 99,
        issuer: 'smb:wa',
        verifiedName: 'Acme'
    })
    const parsed = parseBusinessNotificationEvents(
        bizNotification([
            {
                tag: WA_BUSINESS_NOTIFICATION_TAGS.VERIFIED_NAME,
                attrs: {
                    jid: '5511999999999@s.whatsapp.net',
                    verified_level: 'high',
                    actual_actors: '0',
                    host_storage: '1',
                    privacy_mode_ts: '1700000000'
                },
                content: certBytes
            }
        ])
    )
    assert.equal(parsed.events.length, 1)
    const event = parsed.events[0]
    assert.equal(event.action, 'verified_name_update')
    assert.equal(event.bizJid, '5511999999999@s.whatsapp.net')
    assert.equal(event.timestampSeconds, 1700000000)
    assert.equal(event.verifiedName?.name, 'Acme')
    assert.equal(event.verifiedName?.isSmb, true)
    assert.equal(event.verifiedName?.isApi, false)
    assert.deepEqual(event.verifiedName?.privacyMode, {
        actualActors: 0,
        hostStorage: 1,
        privacyModeTs: 1700000000
    })
})

test('business parser handles verified_name with hash (stale)', () => {
    const parsed = parseBusinessNotificationEvents(
        bizNotification([
            {
                tag: WA_BUSINESS_NOTIFICATION_TAGS.VERIFIED_NAME,
                attrs: { hash: 'abc123' }
            }
        ])
    )
    assert.equal(parsed.events.length, 1)
    assert.equal(parsed.events[0].action, 'verified_name_stale')
    assert.equal(parsed.events[0].bizHash, 'abc123')
    assert.equal(parsed.events[0].bizJid, undefined)
})

test('business parser handles remove with jid and remove with hash', () => {
    const byJid = parseBusinessNotificationEvents(
        bizNotification([
            {
                tag: WA_BUSINESS_NOTIFICATION_TAGS.REMOVE,
                attrs: { jid: '5511999999999@s.whatsapp.net' }
            }
        ])
    )
    assert.equal(byJid.events[0].action, 'business_removed')
    assert.equal(byJid.events[0].bizJid, '5511999999999@s.whatsapp.net')

    const byHash = parseBusinessNotificationEvents(
        bizNotification([{ tag: WA_BUSINESS_NOTIFICATION_TAGS.REMOVE, attrs: { hash: 'xyz' } }])
    )
    assert.equal(byHash.events[0].action, 'business_removed')
    assert.equal(byHash.events[0].bizHash, 'xyz')
})

test('business parser handles profile (signal-only) and profile by hash', () => {
    const byFrom = parseBusinessNotificationEvents(
        bizNotification([{ tag: WA_BUSINESS_NOTIFICATION_TAGS.PROFILE, attrs: {} }])
    )
    assert.equal(byFrom.events[0].action, 'profile_update')
    assert.equal(byFrom.events[0].bizJid, '5511999999999@s.whatsapp.net')
    assert.equal(byFrom.events[0].bizHash, undefined)

    const byHash = parseBusinessNotificationEvents(
        bizNotification([{ tag: WA_BUSINESS_NOTIFICATION_TAGS.PROFILE, attrs: { hash: 'h1' } }])
    )
    assert.equal(byHash.events[0].action, 'profile_update')
    assert.equal(byHash.events[0].bizHash, 'h1')
    assert.equal(byHash.events[0].bizJid, undefined)
})

test('business parser handles product_catalog with product children', () => {
    const parsed = parseBusinessNotificationEvents(
        bizNotification([
            {
                tag: WA_BUSINESS_NOTIFICATION_TAGS.PRODUCT_CATALOG,
                attrs: {},
                content: [
                    {
                        tag: 'product',
                        attrs: {},
                        content: [{ tag: 'id', attrs: {}, content: 'P1' }]
                    },
                    {
                        tag: 'product',
                        attrs: {},
                        content: [{ tag: 'id', attrs: {}, content: 'P2' }]
                    }
                ]
            }
        ])
    )
    assert.equal(parsed.events.length, 1)
    assert.equal(parsed.events[0].action, 'product_update')
    assert.deepEqual(parsed.events[0].productIds, ['P1', 'P2'])
})

test('business parser handles product_catalog with collection children + status_info', () => {
    const parsed = parseBusinessNotificationEvents(
        bizNotification([
            {
                tag: WA_BUSINESS_NOTIFICATION_TAGS.PRODUCT_CATALOG,
                attrs: {},
                content: [
                    {
                        tag: 'collection',
                        attrs: { id: 'C1' },
                        content: [
                            {
                                tag: 'status_info',
                                attrs: {},
                                content: [
                                    { tag: 'status', attrs: {}, content: 'REJECTED' },
                                    { tag: 'reject_reason', attrs: {}, content: 'policy' },
                                    {
                                        tag: 'commerce_url',
                                        attrs: {},
                                        content: 'https://wa.me/c/1'
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ])
    )
    assert.equal(parsed.events[0].action, 'collection_update')
    assert.deepEqual(parsed.events[0].collections, [
        {
            id: 'C1',
            reviewStatus: 'REJECTED',
            rejectReason: 'policy',
            commerceUrl: 'https://wa.me/c/1'
        }
    ])
})

test('business parser handles subscriptions + feature_flags together', () => {
    const parsed = parseBusinessNotificationEvents(
        bizNotification([
            {
                tag: WA_BUSINESS_NOTIFICATION_TAGS.SUBSCRIPTIONS,
                attrs: {},
                content: [
                    {
                        tag: 'subscription',
                        attrs: {
                            id: 'AURA',
                            status: 'active',
                            subscription_tier: '1',
                            source: 'AURA',
                            subscription_start_time: '1700000000',
                            subscription_creation_time: '1699999000',
                            subscription_end_time: '1800000000'
                        }
                    }
                ]
            },
            {
                tag: WA_BUSINESS_NOTIFICATION_TAGS.FEATURE_FLAGS,
                attrs: {},
                content: [
                    {
                        tag: 'feature_flag',
                        attrs: {
                            name: 'NEW_CHATS_LIMIT',
                            enabled: 'true',
                            limit: '50',
                            expiration_time: '1800000000'
                        }
                    }
                ]
            }
        ])
    )
    assert.equal(parsed.events.length, 1)
    const event = parsed.events[0]
    assert.equal(event.action, 'subscriptions_update')
    assert.deepEqual(event.subscriptions, [
        {
            id: 'AURA',
            status: 'active',
            tier: 1,
            source: 'AURA',
            startTime: 1700000000,
            creationTime: 1699999000,
            expirationDate: 1800000000
        }
    ])
    assert.deepEqual(event.featureFlags, [
        {
            name: 'NEW_CHATS_LIMIT',
            enabled: true,
            limit: 50,
            expirationTime: 1800000000
        }
    ])
})

test('business parser emits unhandled for deferred smax-rpc subtypes', () => {
    const parsed = parseBusinessNotificationEvents(
        bizNotification([{ tag: 'ctwa_suggestion', attrs: {} }])
    )
    assert.equal(parsed.events.length, 0)
    assert.equal(parsed.unhandled.length, 1)
    assert.match(parsed.unhandled[0].reason, /ctwa_suggestion\.not_supported/)
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

function mexUpdate(opName: string, body: unknown): BinaryNode {
    return {
        tag: 'notification',
        attrs: { id: 'N1', type: 'mex', from: 's.whatsapp.net' },
        content: [
            {
                tag: 'update',
                attrs: { op_name: opName },
                content: JSON.stringify(body)
            }
        ]
    }
}

test('parseMexNotification: UsernameSetNotification → username_set', () => {
    const parsed = parseMexNotification(
        mexUpdate('UsernameSetNotification', {
            data: { xwa2_notify_username_on_change: { username: 'alice', lid: '12345@lid' } }
        })
    )
    assert.ok(parsed)
    assert.equal(parsed.kind, 'username_set')
    if (parsed.kind === 'username_set') {
        assert.equal(parsed.username, 'alice')
        assert.equal(parsed.lidJid, '12345@lid')
    }
})

test('parseMexNotification: UsernameDeleteNotification → username_delete', () => {
    const parsed = parseMexNotification(
        mexUpdate('UsernameDeleteNotification', {
            data: { xwa2_notify_username_delete: { lid: '12345@lid', display_name: 'Alice' } }
        })
    )
    assert.ok(parsed && parsed.kind === 'username_delete')
    assert.equal(parsed.lidJid, '12345@lid')
    assert.equal(parsed.displayName, 'Alice')
})

test('parseMexNotification: UsernameUpdateNotification → username_update_hint', () => {
    const parsed = parseMexNotification(
        mexUpdate('UsernameUpdateNotification', {
            data: { xwa2_notify_username_on_update_side_sub: { hash: 'abc123' } }
        })
    )
    assert.ok(parsed && parsed.kind === 'username_update_hint')
    assert.equal(parsed.contactHash, 'abc123')
})

test('parseMexNotification: AccountSyncUsernameNotification → own_username_sync', () => {
    const parsed = parseMexNotification(
        mexUpdate('AccountSyncUsernameNotification', {
            data: {
                xwa2_notify_wa_user: {
                    lid_jid: '999@lid',
                    username_info: { username: 'me', state: 'OWNED', pin: '1234' }
                }
            }
        })
    )
    assert.ok(parsed && parsed.kind === 'own_username_sync')
    assert.equal(parsed.ownLidJid, '999@lid')
    assert.equal(parsed.username, 'me')
    assert.equal(parsed.state, 'OWNED')
    assert.equal(parsed.pin, '1234')
})

test('parseMexNotification: TextStatusUpdateNotification → text_status_update', () => {
    const parsed = parseMexNotification(
        mexUpdate('TextStatusUpdateNotification', {
            data: {
                xwa2_notify_text_status_on_update: {
                    jid: '5511@s.whatsapp.net',
                    text: 'feeling great',
                    emoji: { content: '🚀' },
                    ephemeral_duration_sec: 3600,
                    last_update_time: '1779500000'
                }
            }
        })
    )
    assert.ok(parsed && parsed.kind === 'text_status_update')
    assert.equal(parsed.jid, '5511@s.whatsapp.net')
    assert.equal(parsed.text, 'feeling great')
    assert.equal(parsed.emoji, '🚀')
    assert.equal(parsed.ephemeralDurationSec, 3600)
    assert.equal(parsed.lastUpdateTime, 1779500000)
})

test('parseMexNotification: TextStatusUpdateNotificationSideSub → text_status_update_hint', () => {
    const parsed = parseMexNotification(
        mexUpdate('TextStatusUpdateNotificationSideSub', {
            data: { xwa2_notify_text_status_on_update_side_sub: { hash: 'xyz' } }
        })
    )
    assert.ok(parsed && parsed.kind === 'text_status_update_hint')
    assert.equal(parsed.contactHash, 'xyz')
})

test('parseMexNotification: LidChangeNotification → lid_change', () => {
    const parsed = parseMexNotification(
        mexUpdate('LidChangeNotification', {
            data: { xwa2_notify_lid_change: { old: '111@lid', new: '222@lid' } }
        })
    )
    assert.ok(parsed && parsed.kind === 'lid_change')
    assert.equal(parsed.oldLidJid, '111@lid')
    assert.equal(parsed.newLidJid, '222@lid')
})

test('parseMexNotification: MessageCappingInfoNotification → message_capping', () => {
    const parsed = parseMexNotification(
        mexUpdate('MessageCappingInfoNotification', {
            data: {
                xwa2_notify_new_chat_messages_capping_info_update: {
                    capping_status: 'CAPPED',
                    ote_status: 'EXHAUSTED',
                    mv_status: 'NOT_ACTIVE',
                    total_quota: 50,
                    used_quota: 50,
                    cycle_start_timestamp: '1779000000',
                    cycle_end_timestamp: '1779604800',
                    server_sent_timestamp: '1779500000'
                }
            }
        })
    )
    assert.ok(parsed && parsed.kind === 'message_capping')
    assert.equal(parsed.cappingStatus, 'CAPPED')
    assert.equal(parsed.oteStatus, 'EXHAUSTED')
    assert.equal(parsed.totalQuota, 50)
    assert.equal(parsed.usedQuota, 50)
    assert.equal(parsed.cycleEndTimestamp, 1779604800)
})

test('parseMexNotification: unknown op falls back to kind=unknown with raw data', () => {
    const parsed = parseMexNotification(
        mexUpdate('NotificationGroupPropertyUpdate', {
            data: { xwa2_group: { id: 'x' } },
            errors: [{ message: 'forbidden', extensions: { error_code: 403 } }]
        })
    )
    assert.ok(parsed && parsed.kind === 'unknown')
    assert.equal(parsed.operationName, 'NotificationGroupPropertyUpdate')
    assert.deepEqual(parsed.data, { xwa2_group: { id: 'x' } })
    assert.equal(parsed.errors[0].extensions?.error_code, 403)
})

test('parseMexNotification: known op with invalid payload shape falls back to unknown', () => {
    const parsed = parseMexNotification(mexUpdate('UsernameSetNotification', { data: {} }))
    assert.ok(parsed && parsed.kind === 'unknown')
    assert.equal(parsed.operationName, 'UsernameSetNotification')
})

test('parseMexNotification: accepts byte content (Uint8Array)', () => {
    const json = JSON.stringify({
        data: { xwa2_notify_lid_change: { old: 'a@lid', new: 'b@lid' } }
    })
    const node: BinaryNode = {
        tag: 'notification',
        attrs: { type: 'mex' },
        content: [
            {
                tag: 'update',
                attrs: { op_name: 'LidChangeNotification' },
                content: new TextEncoder().encode(json)
            }
        ]
    }
    const parsed = parseMexNotification(node)
    assert.ok(parsed && parsed.kind === 'lid_change')
    assert.equal(parsed.newLidJid, 'b@lid')
})

test('parseMexNotification: returns null for non-mex / missing update / invalid json', () => {
    assert.equal(parseMexNotification({ tag: 'notification', attrs: { type: 'group' } }), null)
    assert.equal(parseMexNotification({ tag: 'notification', attrs: { type: 'mex' } }), null)
    assert.equal(
        parseMexNotification({
            tag: 'notification',
            attrs: { type: 'mex' },
            content: [{ tag: 'update', attrs: {}, content: '{}' }]
        }),
        null
    )
    assert.equal(
        parseMexNotification({
            tag: 'notification',
            attrs: { type: 'mex' },
            content: [{ tag: 'update', attrs: { op_name: 'X' }, content: 'not-json' }]
        }),
        null
    )
})

test('parseMexNotification: returns null when JSON parses to a non-object', () => {
    for (const literal of ['null', '"foo"', '42', 'true', '[1,2]']) {
        assert.equal(
            parseMexNotification({
                tag: 'notification',
                attrs: { type: 'mex' },
                content: [{ tag: 'update', attrs: { op_name: 'X' }, content: literal }]
            }),
            null,
            `expected null for JSON payload ${literal}`
        )
    }
})

test('parseCallNode: extracts offer payload with video and caller metadata', () => {
    const parsed = parseCallNode({
        tag: 'call',
        attrs: {
            id: 'CALL1',
            from: '5511@s.whatsapp.net',
            t: '1700000000',
            e: '1700000060',
            platform: 'web',
            version: '2.3000.0'
        },
        content: [
            {
                tag: 'offer',
                attrs: {
                    'call-id': 'CID-1',
                    'call-creator': '5511:1@s.whatsapp.net',
                    caller_pn: '5511@s.whatsapp.net',
                    username: 'alice',
                    caller_country_code: '55',
                    notify: 'Alice'
                },
                content: [
                    { tag: 'video', attrs: {} },
                    { tag: 'silence', attrs: { reason: 'vc_wave_all' } }
                ]
            }
        ]
    })

    assert.equal(parsed.type, 'offer')
    assert.equal(parsed.payloadTag, 'offer')
    assert.equal(parsed.callId, 'CID-1')
    assert.equal(parsed.callCreatorJid, '5511:1@s.whatsapp.net')
    assert.equal(parsed.callerPnJid, '5511@s.whatsapp.net')
    assert.equal(parsed.callerUsername, 'alice')
    assert.equal(parsed.callerCountryCode, '55')
    assert.equal(parsed.callerPushName, 'Alice')
    assert.equal(parsed.peerPlatform, 'web')
    assert.equal(parsed.peerAppVersion, '2.3000.0')
    assert.equal(parsed.timestampSeconds, 1_700_000_000)
    assert.equal(parsed.endTimestampSeconds, 1_700_000_060)
    assert.equal(parsed.isVideo, true)
    assert.equal(parsed.silenceReason, 'vc_wave_all')
    assert.equal(parsed.groupInfo, undefined)
})

test('parseCallNode: extracts group_info participants and sender_lid', () => {
    const parsed = parseCallNode({
        tag: 'call',
        attrs: {
            id: 'CALL2',
            from: '5511@s.whatsapp.net',
            sender_lid: '99:1@lid'
        },
        content: [
            {
                tag: 'offer',
                attrs: {
                    'call-id': 'CID-2',
                    'call-creator': '5511:1@s.whatsapp.net',
                    'group-jid': '120@g.us'
                },
                content: [
                    {
                        tag: 'group_info',
                        attrs: {},
                        content: [
                            {
                                tag: 'participant',
                                attrs: {
                                    jid: '5522:0@lid',
                                    user_pn: '5522@s.whatsapp.net',
                                    username: 'bob',
                                    guest_name: 'Bob G.'
                                }
                            },
                            { tag: 'participant', attrs: { jid: '5533:0@lid' } }
                        ]
                    }
                ]
            }
        ]
    })

    assert.equal(parsed.type, 'offer')
    assert.equal(parsed.senderLidJid, '99:1@lid')
    assert.equal(parsed.groupJid, '120@g.us')
    assert.equal(parsed.isVideo, false)
    assert.equal(parsed.groupInfo?.length, 2)
    assert.deepEqual(parsed.groupInfo?.[0], {
        jid: '5522:0@lid',
        userPnJid: '5522@s.whatsapp.net',
        username: 'bob',
        guestName: 'Bob G.'
    })
    assert.deepEqual(parsed.groupInfo?.[1], {
        jid: '5533:0@lid',
        userPnJid: undefined,
        username: undefined,
        guestName: undefined
    })
})

test('parseCallNode: maps recognized payload tags to typed discriminator', () => {
    const tags = [
        'accept',
        'reject',
        'terminate',
        'transport',
        'mute',
        'preaccept',
        'video_state',
        'enc_rekey',
        'peer_state',
        'flow_control',
        'web_client',
        'group_update',
        'offer_notice'
    ] as const

    for (const tag of tags) {
        const parsed = parseCallNode({
            tag: 'call',
            attrs: { id: 'X', from: '5511@s.whatsapp.net' },
            content: [{ tag, attrs: { 'call-id': 'C', 'call-creator': '5511:1@s.whatsapp.net' } }]
        })
        assert.equal(parsed.type, tag)
        assert.equal(parsed.payloadTag, tag)
        assert.equal(parsed.callId, 'C')
    }
})

test('parseCallNode: returns unknown type for unrecognized or empty payload', () => {
    const unknownTag = parseCallNode({
        tag: 'call',
        attrs: { id: 'X', from: '5511@s.whatsapp.net' },
        content: [{ tag: 'frobnicate', attrs: { 'call-id': 'C' } }]
    })
    assert.equal(unknownTag.type, 'unknown')
    assert.equal(unknownTag.payloadTag, 'frobnicate')
    assert.equal(unknownTag.callId, 'C')

    const empty = parseCallNode({
        tag: 'call',
        attrs: { id: 'X', from: '5511@s.whatsapp.net' },
        content: []
    })
    assert.equal(empty.type, 'unknown')
    assert.equal(empty.payloadTag, undefined)
    assert.equal(empty.callId, undefined)
    assert.equal(empty.isVideo, false)
})
