import assert from 'node:assert/strict'
import test from 'node:test'

import { parseChatEventFromAppStateMutation } from '@client/events/chat'
import { parseGroupNotificationEvents } from '@client/events/group'
import { parsePrivacyTokenNotification } from '@client/events/privacy-token'
import { WA_NOTIFICATION_TYPES, WA_PRIVACY_TOKEN_TAGS } from '@protocol/constants'

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
