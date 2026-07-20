import assert from 'node:assert/strict'
import test from 'node:test'

import { createPrivacyCoordinator } from '@client/coordinators/WaPrivacyCoordinator'
import { WA_PRIVACY_CATEGORIES, WA_PRIVACY_TAGS } from '@protocol/constants'
import type { SignalUserJidPair } from '@signal/api/SignalDeviceSyncApi'
import type { BinaryNode } from '@transport/types'

function createIqResult(content?: readonly BinaryNode[]): BinaryNode {
    return {
        tag: 'iq',
        attrs: { type: 'result' },
        content
    }
}

function createBlocklistDeps(resolveUserJidPair?: (userJid: string) => Promise<SignalUserJidPair>) {
    return {
        resolveUserJidPair:
            resolveUserJidPair ??
            (async (userJid: string): Promise<SignalUserJidPair> =>
                userJid.endsWith('@lid')
                    ? { lidJid: userJid, pnJid: null }
                    : { lidJid: null, pnJid: userJid })
    }
}

test('privacy coordinator parses settings and ignores error/ignored categories', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
        readonly contextData?: Readonly<Record<string, unknown>>
    }> = []

    const coordinator = createPrivacyCoordinator({
        ...createBlocklistDeps(),
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
        ...createBlocklistDeps(),
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
        ...createBlocklistDeps(),
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
    assert.deepEqual(calls[1].node.content[0].attrs, {
        action: 'block',
        jid: '123@s.whatsapp.net'
    })
    assert.equal(calls[2].context, 'privacy.unblockUser')
    assert.ok(Array.isArray(calls[2].node.content))
    if (!Array.isArray(calls[2].node.content)) {
        throw new Error('expected unblock content array')
    }
    assert.deepEqual(calls[2].node.content[0].attrs, {
        jid: '123@s.whatsapp.net',
        action: 'unblock'
    })
})

test('privacy coordinator resolves lid addressing for block/unblock', async () => {
    const calls: Array<{ readonly context: string; readonly node: BinaryNode }> = []
    const queryWithContext = async (context: string, node: BinaryNode) => {
        calls.push({ context, node })
        return createIqResult()
    }
    const itemAttrs = (index: number) => {
        const content = calls[index].node.content
        if (!Array.isArray(content)) {
            throw new Error('expected blocklist change content array')
        }
        return content[0].attrs
    }

    const migrated = createPrivacyCoordinator({
        ...createBlocklistDeps(async () => ({
            lidJid: '999@lid',
            pnJid: '123@s.whatsapp.net'
        })),
        queryWithContext
    })
    await migrated.blockUser('123@s.whatsapp.net')
    await migrated.unblockUser('123')
    assert.deepEqual(itemAttrs(0), {
        action: 'block',
        jid: '999@lid',
        pn_jid: '123@s.whatsapp.net'
    })
    assert.deepEqual(itemAttrs(1), { jid: '999@lid', action: 'unblock' })

    const lidInputUnknownPn = createPrivacyCoordinator({
        ...createBlocklistDeps(),
        queryWithContext
    })
    await lidInputUnknownPn.blockUser('999@lid')
    assert.deepEqual(itemAttrs(2), {
        action: 'block',
        jid: '999@lid',
        unknown_identifier: 'true'
    })

    const correctedPn = createPrivacyCoordinator({
        ...createBlocklistDeps(async () => ({
            lidJid: '888@lid',
            pnJid: '5511987654321@s.whatsapp.net'
        })),
        queryWithContext
    })
    await correctedPn.blockUser('551187654321')
    assert.deepEqual(itemAttrs(3), {
        action: 'block',
        jid: '888@lid',
        pn_jid: '5511987654321@s.whatsapp.net'
    })

    const rejecting = createPrivacyCoordinator({
        ...createBlocklistDeps(async () => {
            throw new Error('resolver must not run for non-user jids')
        }),
        queryWithContext
    })
    await assert.rejects(() => rejecting.blockUser('123-456@g.us'), {
        message: /blocklist target must be a user jid/
    })
})
