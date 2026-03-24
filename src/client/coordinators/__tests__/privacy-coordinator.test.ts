import assert from 'node:assert/strict'
import test from 'node:test'

import { createPrivacyCoordinator } from '@client/coordinators/WaPrivacyCoordinator'
import { WA_PRIVACY_CATEGORIES, WA_PRIVACY_TAGS } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'

function createIqResult(content?: readonly BinaryNode[]): BinaryNode {
    return {
        tag: 'iq',
        attrs: { type: 'result' },
        content
    }
}

test('privacy coordinator parses settings and ignores error/ignored categories', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
        readonly contextData?: Readonly<Record<string, unknown>>
    }> = []

    const coordinator = createPrivacyCoordinator({
        queryWithContext: async (context, node, _timeoutMs, contextData) => {
            calls.push({ context, node, contextData })
            return createIqResult([
                {
                    tag: 'privacy',
                    attrs: {},
                    content: [
                        {
                            tag: WA_PRIVACY_TAGS.CATEGORY,
                            attrs: { name: WA_PRIVACY_CATEGORIES.READ_RECEIPTS, value: 'all' }
                        },
                        {
                            tag: WA_PRIVACY_TAGS.CATEGORY,
                            attrs: { name: WA_PRIVACY_CATEGORIES.LAST_SEEN, value: 'contacts' }
                        },
                        {
                            tag: WA_PRIVACY_TAGS.CATEGORY,
                            attrs: { name: WA_PRIVACY_CATEGORIES.CALL_ADD, value: 'known' }
                        },
                        {
                            tag: WA_PRIVACY_TAGS.CATEGORY,
                            attrs: {
                                name: WA_PRIVACY_CATEGORIES.DEFENSE_MODE,
                                value: 'on_standard'
                            }
                        },
                        {
                            tag: WA_PRIVACY_TAGS.CATEGORY,
                            attrs: { name: WA_PRIVACY_CATEGORIES.GROUP_ADD, value: 'error' }
                        },
                        {
                            tag: WA_PRIVACY_TAGS.CATEGORY,
                            attrs: { name: 'pix', value: 'all' }
                        }
                    ]
                }
            ])
        }
    })

    const settings = await coordinator.getPrivacySettings()

    assert.deepEqual(settings, {
        readReceipts: 'all',
        lastSeen: 'contacts',
        callAdd: 'known',
        defenseMode: 'on_standard'
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].context, 'privacy.getSettings')
    assert.equal(calls[0].node.attrs.type, 'get')
    assert.equal(calls[0].node.attrs.xmlns, 'privacy')
})

test('privacy coordinator maps setting/category for set and disallowed list queries', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
        readonly contextData?: Readonly<Record<string, unknown>>
    }> = []

    const coordinator = createPrivacyCoordinator({
        queryWithContext: async (context, node, _timeoutMs, contextData) => {
            calls.push({ context, node, contextData })
            if (context === 'privacy.getDisallowedList') {
                return createIqResult([
                    {
                        tag: 'privacy',
                        attrs: {},
                        content: [
                            {
                                tag: WA_PRIVACY_TAGS.LIST,
                                attrs: { dhash: 'dhash-1' },
                                content: [
                                    {
                                        tag: WA_PRIVACY_TAGS.USER,
                                        attrs: { jid: 'a@s.whatsapp.net' }
                                    },
                                    {
                                        tag: WA_PRIVACY_TAGS.USER,
                                        attrs: { jid: 'b@s.whatsapp.net' }
                                    },
                                    { tag: WA_PRIVACY_TAGS.USER, attrs: {} }
                                ]
                            }
                        ]
                    }
                ])
            }
            return createIqResult()
        }
    })

    await coordinator.setPrivacySetting('readReceipts', 'none')
    const disallowed = await coordinator.getDisallowedList('about')

    assert.deepEqual(disallowed, {
        jids: ['a@s.whatsapp.net', 'b@s.whatsapp.net'],
        dhash: 'dhash-1'
    })

    assert.equal(calls.length, 2)
    assert.equal(calls[0].context, 'privacy.setSetting')
    assert.deepEqual(calls[0].contextData, {
        category: WA_PRIVACY_CATEGORIES.READ_RECEIPTS,
        value: 'none'
    })
    assert.ok(Array.isArray(calls[0].node.content))
    if (!Array.isArray(calls[0].node.content)) {
        throw new Error('expected set privacy node content array')
    }
    assert.equal(calls[0].node.content[0].tag, 'privacy')
    assert.ok(Array.isArray(calls[0].node.content[0].content))
    if (!Array.isArray(calls[0].node.content[0].content)) {
        throw new Error('expected set privacy category content array')
    }
    assert.equal(
        calls[0].node.content[0].content[0].attrs.name,
        WA_PRIVACY_CATEGORIES.READ_RECEIPTS
    )
    assert.equal(calls[0].node.content[0].content[0].attrs.value, 'none')

    assert.equal(calls[1].context, 'privacy.getDisallowedList')
    assert.deepEqual(calls[1].contextData, {
        category: WA_PRIVACY_CATEGORIES.ABOUT
    })
    assert.ok(Array.isArray(calls[1].node.content))
    if (!Array.isArray(calls[1].node.content)) {
        throw new Error('expected disallowed list query content array')
    }
    assert.ok(Array.isArray(calls[1].node.content[0].content))
    if (!Array.isArray(calls[1].node.content[0].content)) {
        throw new Error('expected disallowed list payload content array')
    }
    assert.equal(calls[1].node.content[0].content[0].attrs.name, WA_PRIVACY_CATEGORIES.ABOUT)
    assert.equal(calls[1].node.content[0].content[0].attrs.value, 'contact_blacklist')
})

test('privacy coordinator parses blocklist and sends block/unblock actions', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
        readonly contextData?: Readonly<Record<string, unknown>>
    }> = []

    const coordinator = createPrivacyCoordinator({
        queryWithContext: async (context, node, _timeoutMs, contextData) => {
            calls.push({ context, node, contextData })
            if (context === 'privacy.getBlocklist') {
                return createIqResult([
                    {
                        tag: 'list',
                        attrs: { dhash: 'block-hash' },
                        content: [
                            { tag: 'item', attrs: { jid: 'x@s.whatsapp.net' } },
                            { tag: 'item', attrs: { jid: 'y@s.whatsapp.net' } },
                            { tag: 'item', attrs: {} }
                        ]
                    }
                ])
            }
            return createIqResult()
        }
    })

    const blocklist = await coordinator.getBlocklist()
    await coordinator.blockUser('123@s.whatsapp.net')
    await coordinator.unblockUser('123@s.whatsapp.net')

    assert.deepEqual(blocklist, {
        jids: ['x@s.whatsapp.net', 'y@s.whatsapp.net'],
        dhash: 'block-hash'
    })
    assert.equal(calls.length, 3)
    assert.equal(calls[0].context, 'privacy.getBlocklist')
    assert.equal(calls[1].context, 'privacy.blockUser')
    assert.deepEqual(calls[1].contextData, { jid: '123@s.whatsapp.net' })
    assert.ok(Array.isArray(calls[1].node.content))
    if (!Array.isArray(calls[1].node.content)) {
        throw new Error('expected blocklist change content array')
    }
    assert.equal(calls[1].node.content[0].attrs.action, 'block')
    assert.equal(calls[2].context, 'privacy.unblockUser')
    assert.ok(Array.isArray(calls[2].node.content))
    if (!Array.isArray(calls[2].node.content)) {
        throw new Error('expected unblock content array')
    }
    assert.equal(calls[2].node.content[0].attrs.action, 'unblock')
})
