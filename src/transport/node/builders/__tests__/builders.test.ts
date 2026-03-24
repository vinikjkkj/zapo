import assert from 'node:assert/strict'
import test from 'node:test'

import {
    WA_DEFAULTS,
    WA_NODE_TAGS,
    WA_PRIVACY_CATEGORIES,
    WA_PRIVACY_TAGS,
    WA_PRIVACY_TOKEN_TAGS,
    WA_PRIVACY_TOKEN_TYPES,
    WA_XMLNS,
    WA_USYNC_CONTEXTS,
    WA_USYNC_MODES
} from '@protocol/constants'
import {
    buildAccountBlocklistSyncIq,
    buildAccountDevicesSyncIq,
    buildAccountPictureSyncIq,
    buildAckNode,
    buildAccountPrivacySyncIq,
    buildClearDirtyBitsIq,
    buildCompanionFinishRequestNode,
    buildCompanionHelloRequestNode,
    buildCreateGroupIq,
    buildGetCountryCodeRequestNode,
    buildGroupParticipantChangeIq,
    buildGroupSenderKeyMessageNode,
    buildGroupsDirtySyncIq,
    buildIqResultNode,
    buildLeaveGroupIq,
    buildNewsletterMetadataSyncIq,
    buildReceiptNode,
    buildSignedPreKeyRotateIq,
    buildUsyncIq,
    buildUsyncUserNode
} from '@transport/node/builders'
import {
    buildDirectMessageFanoutNode,
    buildGroupRetryMessageNode
} from '@transport/node/builders/message'
import { buildMissingPreKeysFetchIq, buildPreKeyUploadIq } from '@transport/node/builders/prekeys'
import {
    buildBlocklistChangeIq,
    buildGetBlocklistIq,
    buildGetPrivacyDisallowedListIq,
    buildGetPrivacySettingsIq,
    buildSetPrivacyCategoryIq
} from '@transport/node/builders/privacy'
import {
    buildCsTokenMessageNode,
    buildPrivacyTokenIqNode,
    buildTcTokenMessageNode
} from '@transport/node/builders/privacy-token'
import { buildRetryReceiptNode } from '@transport/node/builders/retry'
import type { BinaryNode } from '@transport/types'

test('builders barrel exports stable constructors', () => {
    assert.equal(typeof buildAccountDevicesSyncIq, 'function')
    assert.equal(typeof buildCompanionHelloRequestNode, 'function')
    assert.equal(typeof buildGroupSenderKeyMessageNode, 'function')
    assert.equal(typeof buildSignedPreKeyRotateIq, 'function')
    assert.equal(typeof buildUsyncIq, 'function')
    assert.equal(typeof buildUsyncUserNode, 'function')
})

test('usync builder composes query/list nodes with defaults and overrides', () => {
    const customUserNode = buildUsyncUserNode({
        jid: '5511888888888@s.whatsapp.net',
        attrs: {
            pn_jid: '5511888888888@s.whatsapp.net'
        },
        content: [
            {
                tag: 'contact',
                attrs: {}
            }
        ]
    })
    const iq = buildUsyncIq({
        sid: 'sid-2',
        mode: WA_USYNC_MODES.QUERY,
        context: WA_USYNC_CONTEXTS.INTERACTIVE,
        queryProtocolNodes: [
            {
                tag: WA_NODE_TAGS.DEVICES,
                attrs: {
                    version: '2'
                }
            }
        ],
        users: [
            {
                jid: '5511999999999@s.whatsapp.net'
            },
            {
                jid: customUserNode.attrs.jid,
                attrs: {
                    pn_jid: customUserNode.attrs.pn_jid
                },
                content: customUserNode.content
            }
        ]
    })

    assert.equal(iq.attrs.type, 'get')
    assert.equal(iq.attrs.xmlns, 'usync')
    assert.equal(iq.attrs.to, WA_DEFAULTS.HOST_DOMAIN)
    assert.ok(Array.isArray(iq.content))
    const usyncNode = iq.content[0]
    assert.equal(usyncNode.tag, WA_NODE_TAGS.USYNC)
    assert.equal(usyncNode.attrs.sid, 'sid-2')
    assert.equal(usyncNode.attrs.index, '0')
    assert.equal(usyncNode.attrs.last, 'true')
    assert.equal(usyncNode.attrs.mode, WA_USYNC_MODES.QUERY)
    assert.equal(usyncNode.attrs.context, WA_USYNC_CONTEXTS.INTERACTIVE)
    assert.ok(Array.isArray(usyncNode.content))

    const queryNode = usyncNode.content.find(
        (child: BinaryNode) => child.tag === WA_NODE_TAGS.QUERY
    )
    assert.ok(queryNode)
    assert.ok(Array.isArray(queryNode.content))
    assert.equal(queryNode.content[0].tag, WA_NODE_TAGS.DEVICES)
    assert.equal(queryNode.content[0].attrs.version, '2')

    const listNode = usyncNode.content.find((child: BinaryNode) => child.tag === WA_NODE_TAGS.LIST)
    assert.ok(listNode)
    assert.ok(Array.isArray(listNode.content))
    assert.equal(listNode.content.length, 2)
    assert.equal(listNode.content[1].attrs.pn_jid, '5511888888888@s.whatsapp.net')
    assert.ok(Array.isArray(listNode.content[1].content))
    assert.equal(listNode.content[1].content[0].tag, 'contact')

    assert.throws(
        () =>
            buildUsyncIq({
                sid: 'invalid',
                queryProtocolNodes: [],
                users: []
            }),
        /must include at least one protocol node/
    )
})

test('account sync builders generate expected iq structure', () => {
    const devices = buildAccountDevicesSyncIq(
        ['5511999999999@s.whatsapp.net', '5511888888888@s.whatsapp.net'],
        'sid-1'
    )
    assert.equal(devices.attrs.type, 'get')
    assert.equal(devices.attrs.to, WA_DEFAULTS.HOST_DOMAIN)
    assert.ok(Array.isArray(devices.content))
    const usync = devices.content[0]
    assert.equal(usync.tag, WA_NODE_TAGS.USYNC)
    assert.equal(usync.attrs.sid, 'sid-1')
    assert.ok(Array.isArray(usync.content))
    const listNode = usync.content.find((child: BinaryNode) => child.tag === WA_NODE_TAGS.LIST)
    assert.ok(listNode)
    assert.ok(Array.isArray(listNode.content))
    assert.equal(listNode.content.length, 2)

    const picture = buildAccountPictureSyncIq('5511999999999@s.whatsapp.net')
    assert.equal(picture.attrs.type, 'get')
    assert.equal(picture.attrs.target, '5511999999999@s.whatsapp.net')

    const privacy = buildAccountPrivacySyncIq()
    assert.equal(privacy.attrs.type, 'get')
    assert.ok(Array.isArray(privacy.content))
    assert.equal(privacy.content[0].tag, WA_NODE_TAGS.PRIVACY)

    const blocklist = buildAccountBlocklistSyncIq()
    assert.equal(blocklist.attrs.type, 'get')
    assert.equal(blocklist.content, undefined)

    const groupsDirty = buildGroupsDirtySyncIq()
    assert.equal(groupsDirty.attrs.type, 'get')
    assert.ok(Array.isArray(groupsDirty.content))
    const participating = groupsDirty.content[0]
    assert.equal(participating.tag, WA_NODE_TAGS.PARTICIPATING)
    assert.ok(Array.isArray(participating.content))
    assert.equal(participating.content.length, 2)

    const newsletter = buildNewsletterMetadataSyncIq()
    assert.equal(newsletter.attrs.type, 'get')
    assert.ok(Array.isArray(newsletter.content))
    assert.equal(newsletter.content[0].tag, WA_NODE_TAGS.MY_ADDONS)

    const clearDirty = buildClearDirtyBitsIq([
        { type: 'groups', timestamp: 11 },
        { type: 'account_sync', timestamp: 22 }
    ])
    assert.equal(clearDirty.attrs.type, 'set')
    assert.ok(Array.isArray(clearDirty.content))
    assert.equal(clearDirty.content[0].attrs.type, 'groups')
    assert.equal(clearDirty.content[1].attrs.timestamp, '22')
})

test('group builders support create participant updates and leave', () => {
    const withDescription = buildCreateGroupIq({
        subject: 'new group',
        participants: ['5511999999999@s.whatsapp.net'],
        description: 'hello'
    })
    assert.equal(withDescription.attrs.type, 'set')
    assert.ok(Array.isArray(withDescription.content))
    const createWithDescription = withDescription.content[0]
    assert.equal(createWithDescription.tag, 'create')
    assert.ok(Array.isArray(createWithDescription.content))
    assert.ok(
        createWithDescription.content.some((entry: BinaryNode) => entry.tag === 'description')
    )

    const withoutDescription = buildCreateGroupIq({
        subject: 'no description',
        participants: ['5511888888888@s.whatsapp.net']
    })
    assert.ok(Array.isArray(withoutDescription.content))
    const createWithoutDescription = withoutDescription.content[0]
    assert.ok(Array.isArray(createWithoutDescription.content))
    assert.equal(
        createWithoutDescription.content.some((entry: BinaryNode) => entry.tag === 'description'),
        false
    )

    const participantChange = buildGroupParticipantChangeIq({
        groupJid: '1234@g.us',
        action: 'remove',
        participants: ['5511777777777@s.whatsapp.net', '5511666666666@s.whatsapp.net']
    })
    assert.equal(participantChange.attrs.to, '1234@g.us')
    assert.ok(Array.isArray(participantChange.content))
    const remove = participantChange.content[0]
    assert.equal(remove.tag, 'remove')
    assert.ok(Array.isArray(remove.content))
    assert.equal(remove.content.length, 2)

    const leave = buildLeaveGroupIq(['1@g.us', '2@g.us'])
    assert.equal(leave.attrs.type, 'set')
    assert.ok(Array.isArray(leave.content))
    assert.equal(leave.content[0].tag, 'leave')
})

test('message builders create fanout nodes and validate participant requirements', () => {
    const participant = {
        jid: '5511999999999:2@s.whatsapp.net',
        encType: 'msg' as const,
        ciphertext: new Uint8Array([1, 2, 3])
    }

    const node = buildDirectMessageFanoutNode({
        to: '5511999999999@s.whatsapp.net',
        type: 'text',
        id: 'm1',
        participants: [participant],
        reportingNode: {
            tag: 'reporting',
            attrs: {},
            content: [
                {
                    tag: 'reporting_token',
                    attrs: { v: '2' },
                    content: new Uint8Array([9])
                }
            ]
        },
        privacyTokenNode: {
            tag: WA_PRIVACY_TOKEN_TAGS.TC_TOKEN,
            attrs: {},
            content: new Uint8Array([4])
        }
    })

    assert.equal(node.tag, 'message')
    assert.equal(node.attrs.id, 'm1')
    const participantsNode = Array.isArray(node.content)
        ? node.content.find((child) => child.tag === WA_NODE_TAGS.PARTICIPANTS)
        : null
    assert.ok(participantsNode)
    const reportingNode = Array.isArray(node.content)
        ? node.content.find((child) => child.tag === 'reporting')
        : null
    assert.ok(reportingNode)
    const tcTokenNode = Array.isArray(node.content)
        ? node.content.find((child) => child.tag === WA_PRIVACY_TOKEN_TAGS.TC_TOKEN)
        : null
    assert.ok(tcTokenNode)

    assert.throws(
        () =>
            buildDirectMessageFanoutNode({
                to: 'x@s.whatsapp.net',
                type: 'text',
                participants: []
            }),
        /requires at least one participant/
    )

    const retryNode = buildGroupRetryMessageNode({
        to: '123@g.us',
        type: 'text',
        id: 'id-1',
        requesterJid: '5511:3@s.whatsapp.net',
        addressingMode: 'pn',
        encType: 'msg',
        ciphertext: new Uint8Array([9]),
        retryCount: 2
    })
    assert.equal(retryNode.attrs.participant, '5511:3@s.whatsapp.net')
    assert.ok(Array.isArray(retryNode.content))
    assert.equal(retryNode.content[0].tag, 'enc')
    assert.equal(retryNode.content[0].attrs.type, 'msg')
    assert.equal(retryNode.content[0].attrs.count, '2')

    const inboundRetry = buildReceiptNode({
        kind: 'retry',
        node: {
            tag: 'message',
            attrs: { t: '10', participant: '5511:2@s.whatsapp.net' }
        },
        id: 'msg-1',
        to: '5511@s.whatsapp.net',
        retryCount: 2
    })
    assert.equal(inboundRetry.attrs.type, 'retry')
    assert.ok(Array.isArray(inboundRetry.content))
    if (!Array.isArray(inboundRetry.content)) {
        throw new Error('expected retry receipt content array')
    }
    assert.equal(inboundRetry.content[0].attrs.t, '10')
})

test('privacy token builders create iq and message token nodes', () => {
    const iq = buildPrivacyTokenIqNode({
        jid: '5511999999999@s.whatsapp.net',
        timestampS: 123
    })
    assert.equal(iq.tag, WA_NODE_TAGS.IQ)
    assert.equal(iq.attrs.type, 'set')
    assert.ok(Array.isArray(iq.content))
    if (!Array.isArray(iq.content)) {
        throw new Error('expected privacy token iq content array')
    }
    assert.equal(iq.content[0].tag, WA_PRIVACY_TOKEN_TAGS.TOKENS)
    assert.ok(Array.isArray(iq.content[0].content))
    if (!Array.isArray(iq.content[0].content)) {
        throw new Error('expected privacy token list content array')
    }
    assert.equal(iq.content[0].content[0].attrs.type, WA_PRIVACY_TOKEN_TYPES.TRUSTED_CONTACT)
    assert.equal(iq.content[0].content[0].attrs.t, '123')

    const customTypeIq = buildPrivacyTokenIqNode({
        jid: '5511888888888@s.whatsapp.net',
        timestampS: 456,
        type: 'custom_type'
    })
    assert.ok(Array.isArray(customTypeIq.content))
    if (!Array.isArray(customTypeIq.content)) {
        throw new Error('expected custom privacy token iq content array')
    }
    assert.ok(Array.isArray(customTypeIq.content[0].content))
    if (!Array.isArray(customTypeIq.content[0].content)) {
        throw new Error('expected custom privacy token list content array')
    }
    assert.equal(customTypeIq.content[0].content[0].attrs.type, 'custom_type')

    const tcNode = buildTcTokenMessageNode(new Uint8Array([7]))
    assert.equal(tcNode.tag, WA_PRIVACY_TOKEN_TAGS.TC_TOKEN)
    assert.ok(tcNode.content instanceof Uint8Array)

    const csNode = buildCsTokenMessageNode(new Uint8Array([8]))
    assert.equal(csNode.tag, WA_PRIVACY_TOKEN_TAGS.CS_TOKEN)
    assert.ok(csNode.content instanceof Uint8Array)
})

test('privacy builders generate expected iq payloads', () => {
    const getSettings = buildGetPrivacySettingsIq()
    assert.equal(getSettings.attrs.type, 'get')
    assert.equal(getSettings.attrs.xmlns, WA_XMLNS.PRIVACY)
    assert.ok(Array.isArray(getSettings.content))
    if (!Array.isArray(getSettings.content)) {
        throw new Error('expected get privacy settings content array')
    }
    assert.equal(getSettings.content[0].tag, WA_NODE_TAGS.PRIVACY)

    const setCategory = buildSetPrivacyCategoryIq(WA_PRIVACY_CATEGORIES.ONLINE, 'match_last_seen')
    assert.equal(setCategory.attrs.type, 'set')
    assert.equal(setCategory.attrs.xmlns, WA_XMLNS.PRIVACY)
    assert.ok(Array.isArray(setCategory.content))
    if (!Array.isArray(setCategory.content)) {
        throw new Error('expected set privacy category content array')
    }
    assert.equal(setCategory.content[0].tag, WA_NODE_TAGS.PRIVACY)
    assert.ok(Array.isArray(setCategory.content[0].content))
    if (!Array.isArray(setCategory.content[0].content)) {
        throw new Error('expected set privacy category payload array')
    }
    assert.equal(setCategory.content[0].content[0].tag, WA_PRIVACY_TAGS.CATEGORY)
    assert.equal(setCategory.content[0].content[0].attrs.name, WA_PRIVACY_CATEGORIES.ONLINE)
    assert.equal(setCategory.content[0].content[0].attrs.value, 'match_last_seen')

    const disallowed = buildGetPrivacyDisallowedListIq(WA_PRIVACY_CATEGORIES.ABOUT)
    assert.equal(disallowed.attrs.type, 'get')
    assert.equal(disallowed.attrs.xmlns, WA_XMLNS.PRIVACY)
    assert.ok(Array.isArray(disallowed.content))
    if (!Array.isArray(disallowed.content)) {
        throw new Error('expected get disallowed list content array')
    }
    assert.equal(disallowed.content[0].tag, WA_NODE_TAGS.PRIVACY)
    assert.ok(Array.isArray(disallowed.content[0].content))
    if (!Array.isArray(disallowed.content[0].content)) {
        throw new Error('expected get disallowed list payload array')
    }
    assert.equal(disallowed.content[0].content[0].tag, WA_PRIVACY_TAGS.LIST)
    assert.equal(disallowed.content[0].content[0].attrs.name, WA_PRIVACY_CATEGORIES.ABOUT)
    assert.equal(disallowed.content[0].content[0].attrs.value, 'contact_blacklist')

    const blocklist = buildGetBlocklistIq()
    assert.equal(blocklist.attrs.type, 'get')
    assert.equal(blocklist.attrs.xmlns, WA_XMLNS.BLOCKLIST)
    assert.equal(blocklist.content, undefined)

    const block = buildBlocklistChangeIq('5511999999999@s.whatsapp.net', 'block')
    assert.equal(block.attrs.type, 'set')
    assert.equal(block.attrs.xmlns, WA_XMLNS.BLOCKLIST)
    assert.ok(Array.isArray(block.content))
    if (!Array.isArray(block.content)) {
        throw new Error('expected blocklist change content array')
    }
    assert.equal(block.content[0].tag, 'item')
    assert.equal(block.content[0].attrs.jid, '5511999999999@s.whatsapp.net')
    assert.equal(block.content[0].attrs.action, 'block')
})

test('message builders cover group and inbound receipt branches', () => {
    const groupWithParticipants = buildGroupSenderKeyMessageNode({
        to: '123@g.us',
        type: 'text',
        id: 'm-1',
        phash: 'p1',
        addressingMode: 'pn',
        groupCiphertext: new Uint8Array([7, 8, 9]),
        participants: [
            {
                jid: '5511999999999:2@s.whatsapp.net',
                encType: 'msg',
                ciphertext: new Uint8Array([1])
            }
        ],
        deviceIdentity: new Uint8Array([2, 3]),
        reportingNode: {
            tag: 'reporting',
            attrs: {},
            content: [
                {
                    tag: 'reporting_token',
                    attrs: { v: '2' },
                    content: new Uint8Array([1, 2])
                }
            ]
        }
    })
    assert.equal(groupWithParticipants.attrs.addressing_mode, 'pn')
    assert.ok(Array.isArray(groupWithParticipants.content))
    assert.equal(groupWithParticipants.content[0].tag, WA_NODE_TAGS.PARTICIPANTS)
    assert.equal(
        groupWithParticipants.content[groupWithParticipants.content.length - 1].tag,
        'reporting'
    )

    const groupWithoutParticipants = buildGroupSenderKeyMessageNode({
        to: '123@g.us',
        type: 'text',
        groupCiphertext: new Uint8Array([1]),
        participants: []
    })
    assert.ok(Array.isArray(groupWithoutParticipants.content))
    assert.equal(groupWithoutParticipants.content[0].tag, 'enc')

    const groupDirect = buildDirectMessageFanoutNode({
        to: '123@g.us',
        type: 'text',
        id: 'gd-1',
        phash: 'ph',
        addressingMode: 'lid',
        participants: [
            {
                jid: '5511999999999:2@s.whatsapp.net',
                encType: 'pkmsg',
                ciphertext: new Uint8Array([4, 5])
            }
        ],
        deviceIdentity: new Uint8Array([6])
    })
    assert.equal(groupDirect.attrs.addressing_mode, 'lid')
    assert.ok(Array.isArray(groupDirect.content))
    assert.equal(groupDirect.content.length, 2)
    assert.throws(
        () =>
            buildDirectMessageFanoutNode({
                to: '123@g.us',
                type: 'text',
                participants: []
            }),
        /requires at least one participant/
    )

    const messageAck = buildAckNode({
        kind: 'message',
        node: {
            tag: 'message',
            attrs: { type: 'text', participant: '5511:2@s.whatsapp.net' }
        },
        id: 'm1',
        to: '5511@s.whatsapp.net',
        from: 'me@s.whatsapp.net'
    })
    assert.equal(messageAck.tag, 'ack')
    assert.equal(messageAck.attrs.type, 'text')
    assert.equal(messageAck.attrs.participant, '5511:2@s.whatsapp.net')
    assert.equal(messageAck.attrs.from, 'me@s.whatsapp.net')

    const delivery = buildReceiptNode({
        kind: 'delivery',
        node: {
            tag: 'message',
            attrs: { participant: '5511:2@s.whatsapp.net', category: 'peer' }
        },
        id: 'm1',
        to: '5511@s.whatsapp.net'
    })
    assert.equal(delivery.tag, 'receipt')
    assert.equal(delivery.attrs.type, 'peer_msg')
    assert.equal('participant' in delivery.attrs, false)

    const groupDelivery = buildReceiptNode({
        kind: 'delivery',
        node: {
            tag: 'message',
            attrs: { participant: '5511:2@s.whatsapp.net' }
        },
        id: 'm1',
        to: '12345@g.us'
    })
    assert.equal(groupDelivery.attrs.participant, '5511:2@s.whatsapp.net')

    const retryNoTimestamp = buildReceiptNode({
        kind: 'retry',
        node: {
            tag: 'message',
            attrs: {}
        },
        id: 'm2',
        to: '5511@s.whatsapp.net',
        retryCount: 0
    })
    assert.equal(retryNoTimestamp.attrs.type, 'retry')
    assert.ok(Array.isArray(retryNoTimestamp.content))
    assert.equal(retryNoTimestamp.content[0].attrs.count, '1')
    assert.equal('from' in retryNoTimestamp.attrs, false)

    const retryPeer = buildReceiptNode({
        kind: 'retry',
        node: {
            tag: 'message',
            attrs: { category: 'peer' }
        },
        id: 'm3',
        to: '5511@s.whatsapp.net',
        retryCount: 1
    })
    assert.equal(retryPeer.attrs.category, 'peer')

    const retryAck = buildAckNode({
        kind: 'receipt',
        retryType: true,
        node: {
            tag: 'receipt',
            attrs: {
                id: 'r1',
                from: '5511@s.whatsapp.net',
                participant: '5511:2@s.whatsapp.net'
            }
        }
    })
    assert.equal(retryAck.attrs.type, 'retry')
    assert.equal(retryAck.attrs.to, '5511@s.whatsapp.net')
    assert.equal(retryAck.attrs.participant, '5511:2@s.whatsapp.net')

    const receiptAckWithParticipant = buildAckNode({
        kind: 'receipt',
        node: {
            tag: 'receipt',
            attrs: {
                id: 'r2',
                from: '5511@s.whatsapp.net',
                type: 'sender',
                participant: '5511:3@s.whatsapp.net'
            }
        }
    })
    assert.equal(receiptAckWithParticipant.attrs.participant, '5511:3@s.whatsapp.net')

    const receiptAckWithoutParticipant = buildAckNode({
        kind: 'receipt',
        node: {
            tag: 'receipt',
            attrs: {
                id: 'r3',
                from: '5511@s.whatsapp.net',
                participant: '5511@s.whatsapp.net'
            }
        }
    })
    assert.equal('participant' in receiptAckWithoutParticipant.attrs, false)

    const serverErrorAckWithoutParticipant = buildAckNode({
        kind: 'receipt',
        includeParticipant: false,
        node: {
            tag: 'receipt',
            attrs: {
                id: 'r4',
                from: '5511@s.whatsapp.net',
                type: 'server-error',
                participant: '5511:9@s.whatsapp.net'
            }
        }
    })
    assert.equal('participant' in serverErrorAckWithoutParticipant.attrs, false)

    const aggregateAck = buildAckNode({
        kind: 'aggregate_message',
        to: '5511@s.whatsapp.net',
        ids: ['m1', 'm2', 'm3'],
        type: 'text',
        recipient: '5511@s.whatsapp.net',
        participant: '5511:2@s.whatsapp.net'
    })
    assert.equal(aggregateAck.attrs.class, 'message')
    assert.equal(aggregateAck.attrs.id, 'm1')
    assert.equal(aggregateAck.attrs.type, 'text')
    assert.equal(aggregateAck.attrs.recipient, '5511@s.whatsapp.net')
    assert.equal(aggregateAck.attrs.participant, '5511:2@s.whatsapp.net')
    assert.ok(Array.isArray(aggregateAck.content))
    if (!Array.isArray(aggregateAck.content)) {
        throw new Error('expected aggregate ack content array')
    }
    assert.equal(aggregateAck.content[0].tag, WA_NODE_TAGS.LIST)
    assert.ok(Array.isArray(aggregateAck.content[0].content))
    assert.equal(aggregateAck.content[0].content.length, 2)
    assert.equal(aggregateAck.content[0].content[0].attrs.id, 'm2')

    const nack = buildAckNode({
        kind: 'nack',
        stanzaTag: 'message',
        id: 'msg-nack-1',
        to: '5511@s.whatsapp.net',
        type: 'text',
        participant: '5511:2@s.whatsapp.net',
        error: 491,
        failureReason: 12
    })
    assert.equal(nack.attrs.class, 'message')
    assert.equal(nack.attrs.error, '491')
    assert.ok(Array.isArray(nack.content))
    if (!Array.isArray(nack.content)) {
        throw new Error('expected nack content array')
    }
    assert.equal(nack.content[0].tag, 'meta')
    assert.equal(nack.content[0].attrs.failure_reason, '12')
})

test('pairing builders generate link-code nodes and ack helpers', () => {
    const hello = buildCompanionHelloRequestNode({
        phoneJid: '5511999999999@s.whatsapp.net',
        shouldShowPushNotification: true,
        wrappedCompanionEphemeralPub: new Uint8Array([1]),
        companionServerAuthKeyPub: new Uint8Array([2]),
        companionPlatformId: 'android',
        companionPlatformDisplay: 'Android'
    })
    assert.equal(hello.tag, 'iq')
    assert.ok(Array.isArray(hello.content))
    const helloReg = hello.content[0]
    assert.equal(helloReg.attrs.stage, 'companion_hello')
    assert.equal(helloReg.attrs.should_show_push_notification, 'true')

    const countryCode = buildGetCountryCodeRequestNode()
    assert.equal(countryCode.attrs.type, 'get')
    assert.ok(Array.isArray(countryCode.content))
    assert.equal(countryCode.content[0].attrs.stage, 'get_country_code')

    const finish = buildCompanionFinishRequestNode({
        phoneJid: '5511999999999@s.whatsapp.net',
        wrappedKeyBundle: new Uint8Array([4]),
        companionIdentityPublic: new Uint8Array([5]),
        ref: new Uint8Array([6])
    })
    assert.equal(finish.attrs.type, 'set')
    assert.ok(Array.isArray(finish.content))
    assert.equal(finish.content[0].attrs.stage, 'companion_finish')

    const ackDefault = buildAckNode({
        kind: 'notification',
        node: {
            tag: 'notification',
            attrs: { from: 's.whatsapp.net', type: 'encrypt', id: 'ack-1' }
        }
    })
    assert.equal(ackDefault.tag, 'ack')
    assert.equal(ackDefault.attrs.to, 's.whatsapp.net')
    assert.equal(ackDefault.attrs.type, 'encrypt')
    assert.equal(ackDefault.attrs.id, 'ack-1')

    const ackOverridden = buildAckNode({
        kind: 'notification',
        node: {
            tag: 'notification',
            attrs: {}
        },
        typeOverride: 'custom'
    })
    assert.equal(ackOverridden.attrs.to, WA_DEFAULTS.HOST_DOMAIN)
    assert.equal(ackOverridden.attrs.type, 'custom')
    assert.equal('id' in ackOverridden.attrs, false)

    const ackWithoutType = buildAckNode({
        kind: 'notification',
        node: {
            tag: 'notification',
            attrs: { from: 's.whatsapp.net', type: 'encrypt', id: 'ack-1b' }
        },
        includeParticipant: false,
        includeType: false
    })
    assert.equal(ackWithoutType.attrs.to, 's.whatsapp.net')
    assert.equal('type' in ackWithoutType.attrs, false)
    assert.equal(ackWithoutType.attrs.id, 'ack-1b')

    const groupAckWithoutParticipant = buildAckNode({
        kind: 'notification',
        node: {
            tag: 'notification',
            attrs: {
                from: '12345@g.us',
                type: 'w:gp2',
                id: 'ack-2',
                participant: '5511999999999@s.whatsapp.net'
            }
        }
    })
    assert.equal('participant' in groupAckWithoutParticipant.attrs, false)

    const groupAckWithParticipant = buildAckNode({
        kind: 'notification',
        node: {
            tag: 'notification',
            attrs: {
                from: '12345@g.us',
                type: 'w:gp2',
                id: 'ack-3',
                participant: '5511999999999@s.whatsapp.net'
            }
        },
        includeParticipant: true
    })
    assert.equal(groupAckWithParticipant.attrs.participant, '5511999999999@s.whatsapp.net')

    const iqResultWithId = buildIqResultNode({
        tag: 'iq',
        attrs: { id: 'iq-1', from: 's.whatsapp.net' }
    })
    assert.equal(iqResultWithId.attrs.id, 'iq-1')
    assert.equal(iqResultWithId.attrs.type, 'result')

    const iqResultWithoutId = buildIqResultNode({
        tag: 'iq',
        attrs: {}
    })
    assert.equal(iqResultWithoutId.attrs.to, WA_DEFAULTS.HOST_DOMAIN)
    assert.equal('id' in iqResultWithoutId.attrs, false)
})

test('retry builder emits registration and key bundle payload', () => {
    const node = buildRetryReceiptNode({
        stanzaId: 'stanza-1',
        to: '5511@s.whatsapp.net',
        originalMsgId: 'msg-1',
        retryCount: 1,
        t: '100',
        registrationId: 321,
        keys: {
            identity: new Uint8Array(32),
            key: {
                id: 7,
                publicKey: new Uint8Array(32).fill(1)
            },
            skey: {
                id: 8,
                publicKey: new Uint8Array(32).fill(2),
                signature: new Uint8Array(64).fill(3)
            },
            deviceIdentity: new Uint8Array([1, 2, 3])
        }
    })

    assert.equal(node.tag, 'receipt')
    assert.equal(node.attrs.type, 'retry')
    assert.ok(Array.isArray(node.content))
    assert.ok(node.content.some((child) => child.tag === WA_NODE_TAGS.REGISTRATION))
    assert.ok(node.content.some((child) => child.tag === 'keys'))

    const nodeWithoutKeys = buildRetryReceiptNode({
        stanzaId: 'stanza-2',
        to: '5511@s.whatsapp.net',
        originalMsgId: 'msg-2',
        retryCount: 2,
        t: '200',
        registrationId: 777,
        participant: '5511:2@s.whatsapp.net',
        recipient: '5511:3@s.whatsapp.net',
        error: 409,
        categoryPeer: true
    })
    assert.equal(nodeWithoutKeys.attrs.participant, '5511:2@s.whatsapp.net')
    assert.equal(nodeWithoutKeys.attrs.recipient, '5511:3@s.whatsapp.net')
    assert.equal(nodeWithoutKeys.attrs.category, 'peer')
    assert.ok(Array.isArray(nodeWithoutKeys.content))
    assert.equal(
        nodeWithoutKeys.content.some((child) => child.tag === 'keys'),
        false
    )
    assert.equal(nodeWithoutKeys.content[0].attrs.error, '409')
})

test('receipt builders support outbound list and server-error payloads', () => {
    const aggregate = buildReceiptNode({
        kind: 'outbound',
        id: 'r-1',
        to: '5511@s.whatsapp.net',
        type: 'read',
        participant: '5511:2@s.whatsapp.net',
        recipient: '5511@s.whatsapp.net',
        t: '1000',
        peerParticipantPn: '5511888888888@s.whatsapp.net',
        listIds: ['r-1', 'r-2', 'r-3']
    })
    assert.equal(aggregate.attrs.type, 'read')
    assert.equal(aggregate.attrs.participant, '5511:2@s.whatsapp.net')
    assert.equal(aggregate.attrs.recipient, '5511@s.whatsapp.net')
    assert.equal(aggregate.attrs.t, '1000')
    assert.equal(aggregate.attrs.peer_participant_pn, '5511888888888@s.whatsapp.net')
    assert.ok(Array.isArray(aggregate.content))
    if (!Array.isArray(aggregate.content)) {
        throw new Error('expected aggregate receipt content array')
    }
    assert.equal(aggregate.content[0].tag, WA_NODE_TAGS.LIST)
    assert.ok(Array.isArray(aggregate.content[0].content))
    assert.equal(aggregate.content[0].content.length, 2)
    assert.equal(aggregate.content[0].content[1].attrs.id, 'r-3')

    const serverError = buildReceiptNode({
        kind: 'server_error',
        id: 'srv-1',
        to: '5511@s.whatsapp.net',
        categoryPeer: true,
        encryptCiphertext: new Uint8Array([1, 2]),
        encryptIv: new Uint8Array([3, 4]),
        rmrJid: '5511999999999@s.whatsapp.net',
        rmrFromMe: true,
        rmrParticipant: '5511:2@s.whatsapp.net'
    })
    assert.equal(serverError.attrs.type, 'server-error')
    assert.equal(serverError.attrs.category, 'peer')
    assert.ok(Array.isArray(serverError.content))
    if (!Array.isArray(serverError.content)) {
        throw new Error('expected server-error receipt content array')
    }
    assert.equal(serverError.content[0].tag, 'encrypt')
    assert.equal(serverError.content[1].tag, 'rmr')
    assert.equal(serverError.content[1].attrs.from_me, 'true')
    assert.equal(serverError.content[1].attrs.jid, '5511999999999@s.whatsapp.net')
})

test('prekeys builders include expected key material and targets', () => {
    const registrationInfo = {
        registrationId: 100,
        identityKeyPair: {
            pubKey: new Uint8Array(32).fill(1),
            privKey: new Uint8Array(32).fill(2)
        }
    }
    const signedPreKey = {
        keyId: 9,
        keyPair: {
            pubKey: new Uint8Array(32).fill(3),
            privKey: new Uint8Array(32).fill(4)
        },
        signature: new Uint8Array(64).fill(5),
        uploaded: false
    }

    const upload = buildPreKeyUploadIq(registrationInfo, signedPreKey, [
        {
            keyId: 11,
            keyPair: {
                pubKey: new Uint8Array(32).fill(7),
                privKey: new Uint8Array(32).fill(8)
            },
            uploaded: false
        }
    ])

    assert.equal(upload.tag, 'iq')
    assert.equal(upload.attrs.type, 'set')

    const fetch = buildMissingPreKeysFetchIq([
        {
            userJid: '5511@s.whatsapp.net',
            reasonIdentity: true,
            devices: [{ deviceId: 2, registrationId: 123 }]
        },
        {
            userJid: '5512@s.whatsapp.net',
            devices: [{ deviceId: 3, registrationId: 124 }]
        }
    ])
    assert.equal(fetch.attrs.type, 'get')
    assert.ok(Array.isArray(fetch.content))

    const rotate = buildSignedPreKeyRotateIq(signedPreKey)
    assert.equal(rotate.attrs.type, 'set')
    assert.ok(Array.isArray(rotate.content))
    assert.equal(rotate.content[0].tag, WA_NODE_TAGS.ROTATE)
})
