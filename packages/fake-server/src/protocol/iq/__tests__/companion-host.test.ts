import assert from 'node:assert/strict'
import test from 'node:test'

import type { BinaryNode } from '../../../transport/codec'
import { TEXT_ENCODER } from '../../../transport/util'
import {
    parseKeyIndexListPublish,
    parsePairDeviceUpload,
    parseRemoveCompanionDevice
} from '../companion-host'
import { buildLinkCodeNotification, parseLinkCodeStanza } from '../link-code'

const DEVICE_IDENTITY = new Uint8Array([1, 2, 3])
const KEY_INDEX_LIST = new Uint8Array([4, 5, 6])
const NOISE_PUB = new Uint8Array(32).fill(7)

function buildPairDeviceIq(children: BinaryNode[]): BinaryNode {
    return {
        tag: 'iq',
        attrs: { id: 'iq-1', type: 'set', xmlns: 'md', to: 's.whatsapp.net' },
        content: [{ tag: 'pair-device', attrs: {}, content: children }]
    }
}

const VALID_CHILDREN: BinaryNode[] = [
    { tag: 'ref', attrs: {}, content: 'ref-abc' },
    { tag: 'pub-key', attrs: {}, content: NOISE_PUB },
    { tag: 'device-identity', attrs: {}, content: DEVICE_IDENTITY },
    { tag: 'key-index-list', attrs: { ts: '1700000000' }, content: KEY_INDEX_LIST }
]

test('parsePairDeviceUpload reads every element of the primary upload', () => {
    const parsed = parsePairDeviceUpload(buildPairDeviceIq(VALID_CHILDREN))

    assert.ok(parsed)
    assert.equal(parsed.ref, 'ref-abc')
    assert.deepEqual(parsed.companionNoisePublicKey, NOISE_PUB)
    assert.deepEqual(parsed.deviceIdentityBytes, DEVICE_IDENTITY)
    assert.deepEqual(parsed.keyIndexListBytes, KEY_INDEX_LIST)
    assert.equal(parsed.keyIndexListTimestampSeconds, 1_700_000_000)
    assert.equal(parsed.clientPropsBytes, null)
    assert.equal(parsed.pemKeyBytes, null)
})

test('parsePairDeviceUpload accepts a ref delivered as bytes', () => {
    const children = VALID_CHILDREN.map((child) =>
        child.tag === 'ref' ? { ...child, content: TEXT_ENCODER.encode('ref-bytes') } : child
    )

    assert.equal(parsePairDeviceUpload(buildPairDeviceIq(children))?.ref, 'ref-bytes')
})

test('parsePairDeviceUpload reads the optional client-props and nested pem key', () => {
    const clientProps = new Uint8Array([9, 9])
    const pemKey = new Uint8Array([8, 8])
    const parsed = parsePairDeviceUpload(
        buildPairDeviceIq([
            ...VALID_CHILDREN,
            { tag: 'client-props', attrs: {}, content: clientProps },
            {
                tag: 'pem',
                attrs: { version: '1', algorithm: 'rsa2048' },
                content: [
                    { tag: 'pem', attrs: {}, content: pemKey },
                    { tag: 'ttl', attrs: { ts_s: '432000' } }
                ]
            }
        ])
    )

    assert.deepEqual(parsed?.clientPropsBytes, clientProps)
    assert.deepEqual(parsed?.pemKeyBytes, pemKey)
})

test('parsePairDeviceUpload returns null when a required element is missing', () => {
    for (const dropped of ['ref', 'pub-key', 'device-identity', 'key-index-list']) {
        const children = VALID_CHILDREN.filter((child) => child.tag !== dropped)
        assert.equal(
            parsePairDeviceUpload(buildPairDeviceIq(children)),
            null,
            `expected null without <${dropped}>`
        )
    }
})

test('parsePairDeviceUpload returns null for a stanza carrying no pair-device', () => {
    assert.equal(
        parsePairDeviceUpload({
            tag: 'iq',
            attrs: { id: 'iq-1', type: 'set', xmlns: 'md' },
            content: [{ tag: 'key-index-list', attrs: {}, content: KEY_INDEX_LIST }]
        }),
        null
    )
})

test('parseKeyIndexListPublish reads the list and defaults a missing timestamp', () => {
    const withTs = parseKeyIndexListPublish({
        tag: 'iq',
        attrs: { id: 'iq-2', type: 'set', xmlns: 'md' },
        content: [{ tag: 'key-index-list', attrs: { ts: '99' }, content: KEY_INDEX_LIST }]
    })
    assert.deepEqual(withTs?.keyIndexListBytes, KEY_INDEX_LIST)
    assert.equal(withTs?.timestampSeconds, 99)

    const withoutTs = parseKeyIndexListPublish({
        tag: 'iq',
        attrs: { id: 'iq-3', type: 'set', xmlns: 'md' },
        content: [{ tag: 'key-index-list', attrs: {}, content: KEY_INDEX_LIST }]
    })
    assert.equal(withoutTs?.timestampSeconds, 0)

    assert.equal(parseKeyIndexListPublish({ tag: 'iq', attrs: { id: 'iq-4' }, content: [] }), null)
})

test('parseRemoveCompanionDevice distinguishes a single device from revoke-all', () => {
    const single = parseRemoveCompanionDevice({
        tag: 'iq',
        attrs: { id: 'iq-5', type: 'set', xmlns: 'md' },
        content: [
            {
                tag: 'remove-companion-device',
                attrs: { jid: '5511999999999:3@s.whatsapp.net', reason: 'user_initiated' }
            }
        ]
    })
    assert.equal(single?.deviceJid, '5511999999999:3@s.whatsapp.net')
    assert.equal(single?.all, false)
    assert.equal(single?.reason, 'user_initiated')
    assert.equal(single?.excludeHostedCompanion, false)

    const all = parseRemoveCompanionDevice({
        tag: 'iq',
        attrs: { id: 'iq-6', type: 'set', xmlns: 'md' },
        content: [
            {
                tag: 'remove-companion-device',
                attrs: { all: 'true', reason: 'user_initiated', exclude_hosted_companion: 'true' }
            }
        ]
    })
    assert.equal(all?.deviceJid, null)
    assert.equal(all?.all, true)
    assert.equal(all?.excludeHostedCompanion, true)
})

test('parseLinkCodeStanza reads relayed stages and skips the others', () => {
    const hello = parseLinkCodeStanza({
        tag: 'iq',
        attrs: { id: 'iq-7', type: 'set', xmlns: 'md' },
        content: [
            {
                tag: 'link_code_companion_reg',
                attrs: { jid: '5511999999999@s.whatsapp.net', stage: 'companion_hello' },
                content: [{ tag: 'companion_server_auth_key_pub', attrs: {}, content: NOISE_PUB }]
            }
        ]
    })
    assert.equal(hello?.stage, 'companion_hello')
    assert.equal(hello?.phoneJid, '5511999999999@s.whatsapp.net')
    assert.equal(hello?.ref, null)
    assert.equal(hello?.children.length, 1)

    const countryCode = parseLinkCodeStanza({
        tag: 'iq',
        attrs: { id: 'iq-8', type: 'get', xmlns: 'md' },
        content: [{ tag: 'link_code_companion_reg', attrs: { stage: 'get_country_code' } }]
    })
    assert.equal(countryCode, null, 'a stage this server does not relay falls through')
})

test('buildLinkCodeNotification stamps the server ref over any copy in the payload', () => {
    const notification = buildLinkCodeNotification({
        stage: 'primary_hello',
        ref: 'server-ref',
        children: [
            { tag: 'link_code_pairing_ref', attrs: {}, content: 'stale-ref' },
            { tag: 'primary_identity_pub', attrs: {}, content: NOISE_PUB }
        ]
    })

    assert.equal(notification.tag, 'notification')
    assert.equal(notification.attrs.type, 'link_code_companion_reg')
    assert.equal(notification.attrs.from, 's.whatsapp.net')
    const linkCode = (notification.content as BinaryNode[])[0]
    assert.equal(linkCode.attrs.stage, 'primary_hello')
    const children = linkCode.content as BinaryNode[]
    const refs = children.filter((child) => child.tag === 'link_code_pairing_ref')
    assert.equal(refs.length, 1, 'exactly one ref survives')
    assert.equal(refs[0].content, 'server-ref')
    assert.ok(children.some((child) => child.tag === 'primary_identity_pub'))
})
