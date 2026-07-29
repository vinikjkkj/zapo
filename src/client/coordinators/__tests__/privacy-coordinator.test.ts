import assert from 'node:assert/strict'
import test from 'node:test'

import { createPrivacyCoordinator } from '@client/coordinators/WaPrivacyCoordinator'
import { createNoopLogger } from '@infra/log/types'
import { WA_DEFAULTS, WA_PRIVACY_CATEGORIES, WA_PRIVACY_TAGS } from '@protocol/constants'
import type { SignalUserJidPair } from '@signal/api/SignalDeviceSyncApi'
import type { BinaryNode } from '@transport/types'

function createIqResult(content?: readonly BinaryNode[]): BinaryNode {
    return {
        tag: 'iq',
        attrs: { type: 'result' },
        content
    }
}

function createBlocklistDeps(
    resolveUserJidPair?: (userJid: string) => Promise<SignalUserJidPair>,
    selfLid: string | null = null
) {
    return {
        logger: createNoopLogger(),
        resolveUserJidPair:
            resolveUserJidPair ??
            (async (userJid: string): Promise<SignalUserJidPair> =>
                userJid.endsWith('@lid')
                    ? { lidJid: userJid, pnJid: null }
                    : { lidJid: null, pnJid: userJid }),
        getSelfLid: () => selfLid,
        emitPrivacy: () => undefined
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
                            attrs: { name: WA_PRIVACY_CATEGORIES.MESSAGES, value: 'known' }
                        },
                        {
                            tag: WA_PRIVACY_TAGS.CATEGORY,
                            attrs: { name: 'stickers', value: 'all' }
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

test('privacy coordinator declares lid addressing on disallowed list reads', async () => {
    const envelopeAttrs: Array<Readonly<Record<string, string>>> = []
    const queryWithContext = async (_context: string, node: BinaryNode) => {
        if (!Array.isArray(node.content)) {
            throw new Error('expected disallowed list content array')
        }
        envelopeAttrs.push(node.content[0].attrs)
        return createIqResult()
    }

    const migrated = createPrivacyCoordinator({
        ...createBlocklistDeps(undefined, '50062877036657:34@lid'),
        queryWithContext
    })
    await migrated.getDisallowedList('lastSeen')

    const plain = createPrivacyCoordinator({
        ...createBlocklistDeps(),
        queryWithContext
    })
    await plain.getDisallowedList('lastSeen')

    assert.equal(envelopeAttrs[0].addressing_mode, 'lid')
    assert.equal(envelopeAttrs[1].addressing_mode, undefined)
})

test('privacy coordinator refresh returns the settings plus only the reported lists', async () => {
    const contexts: string[] = []
    const categories: string[] = []

    const coordinator = createPrivacyCoordinator({
        ...createBlocklistDeps(undefined, '1@lid'),
        queryWithContext: async (context, node, _timeoutMs, contextData) => {
            contexts.push(context)
            if (context === 'privacy.getSettings') {
                return createIqResult([
                    {
                        tag: 'privacy',
                        attrs: {},
                        content: [
                            {
                                tag: WA_PRIVACY_TAGS.CATEGORY,
                                attrs: { name: WA_PRIVACY_CATEGORIES.PIX, value: 'contacts' }
                            }
                        ]
                    }
                ])
            }
            const category = String(contextData?.category)
            categories.push(category)
            if (category !== WA_PRIVACY_CATEGORIES.LAST_SEEN) {
                return createIqResult([{ tag: 'privacy', attrs: {} }])
            }
            return createIqResult([
                {
                    tag: 'privacy',
                    attrs: {},
                    content: [
                        {
                            tag: WA_PRIVACY_TAGS.LIST,
                            attrs: { dhash: 'list-hash' },
                            content: [
                                { tag: WA_PRIVACY_TAGS.USER, attrs: { jid: 'a@s.whatsapp.net' } }
                            ]
                        }
                    ]
                }
            ])
        }
    })

    const result = await coordinator.refreshFromAccountSync()

    assert.deepEqual(result.settings, { pix: 'contacts' })
    assert.deepEqual(result.disallowedLists, [
        { setting: 'lastSeen', jids: ['a@s.whatsapp.net'], dhash: 'list-hash' }
    ])
    assert.deepEqual(
        categories.sort(),
        [
            WA_PRIVACY_CATEGORIES.ABOUT,
            WA_PRIVACY_CATEGORIES.GROUP_ADD,
            WA_PRIVACY_CATEGORIES.LAST_SEEN,
            WA_PRIVACY_CATEGORIES.PROFILE_PICTURE
        ].sort()
    )
    assert.equal(contexts.filter((context) => context === 'privacy.getSettings').length, 1)
})

test('privacy coordinator debounces scheduled refreshes and drops them on stop', async () => {
    const emitted: unknown[] = []
    let settingsQueries = 0

    const create = () =>
        createPrivacyCoordinator({
            ...createBlocklistDeps(undefined, '1@lid'),
            emitPrivacy: (event) => emitted.push(event),
            queryWithContext: async (context) => {
                if (context === 'privacy.getSettings') {
                    settingsQueries += 1
                }
                return createIqResult([{ tag: 'privacy', attrs: {} }])
            }
        })

    const debounced = create()
    debounced.scheduleAccountSyncRefresh()
    debounced.scheduleAccountSyncRefresh()
    debounced.scheduleAccountSyncRefresh()
    assert.equal(settingsQueries, 0)

    await new Promise((resolve) =>
        setTimeout(resolve, WA_DEFAULTS.PRIVACY_ACCOUNT_SYNC_DEBOUNCE_MS + 250)
    )
    assert.equal(settingsQueries, 1)
    assert.equal(emitted.length, 1)

    const stopped = create()
    stopped.scheduleAccountSyncRefresh()
    stopped.stopAccountSyncRefresh()
    await new Promise((resolve) =>
        setTimeout(resolve, WA_DEFAULTS.PRIVACY_ACCOUNT_SYNC_DEBOUNCE_MS + 250)
    )
    assert.equal(settingsQueries, 1)
    assert.equal(emitted.length, 1)
})

test('privacy coordinator deduplicates a refresh overlapping an in-flight one', async () => {
    let releaseFirst: () => void = () => undefined
    let settingsQueries = 0
    let emits = 0

    const coordinator = createPrivacyCoordinator({
        ...createBlocklistDeps(undefined, '1@lid'),
        emitPrivacy: () => {
            emits += 1
        },
        queryWithContext: async (context) => {
            if (context === 'privacy.getSettings') {
                settingsQueries += 1
                await new Promise<void>((resolve) => {
                    releaseFirst = resolve
                })
            }
            return createIqResult([{ tag: 'privacy', attrs: {} }])
        }
    })

    coordinator.scheduleAccountSyncRefresh()
    await new Promise((resolve) =>
        setTimeout(resolve, WA_DEFAULTS.PRIVACY_ACCOUNT_SYNC_DEBOUNCE_MS + 150)
    )
    assert.equal(settingsQueries, 1)

    const direct = coordinator.refreshFromAccountSync()
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(settingsQueries, 1)

    releaseFirst()
    await direct
    await new Promise((resolve) => setTimeout(resolve, 100))

    assert.equal(settingsQueries, 1)
    assert.equal(emits, 1)
})

test('privacy coordinator retries a disallowed list write once on a stale dhash', async () => {
    const calls: Array<{ readonly context: string; readonly node: BinaryNode }> = []
    let dhash = 'stale-hash'
    let writes = 0

    const coordinator = createPrivacyCoordinator({
        ...createBlocklistDeps(
            async () => ({ lidJid: '999@lid', pnJid: '5511@s.whatsapp.net' }),
            '1@lid'
        ),
        queryWithContext: async (context, node) => {
            calls.push({ context, node })
            if (context === 'privacy.getDisallowedList') {
                return createIqResult([
                    {
                        tag: 'privacy',
                        attrs: {},
                        content: [{ tag: WA_PRIVACY_TAGS.LIST, attrs: { dhash } }]
                    }
                ])
            }
            writes += 1
            if (writes === 1) {
                dhash = 'fresh-hash'
                return {
                    tag: 'iq',
                    attrs: { type: 'error' },
                    content: [{ tag: 'error', attrs: { code: '409', text: 'conflict' } }]
                }
            }
            return createIqResult([
                {
                    tag: 'privacy',
                    attrs: {},
                    content: [
                        {
                            tag: WA_PRIVACY_TAGS.CATEGORY,
                            attrs: {
                                name: WA_PRIVACY_CATEGORIES.LAST_SEEN,
                                value: 'contact_blacklist',
                                dhash: 'new-hash'
                            }
                        }
                    ]
                }
            ])
        }
    })

    const result = await coordinator.setDisallowedList('lastSeen', {
        add: ['5511@s.whatsapp.net']
    })

    assert.equal(result, 'new-hash')
    assert.deepEqual(
        calls.map((call) => call.context),
        [
            'privacy.getDisallowedList',
            'privacy.setDisallowedList',
            'privacy.getDisallowedList',
            'privacy.setDisallowedList'
        ]
    )

    const categoryOf = (index: number) => {
        const privacyNode = calls[index].node.content
        if (!Array.isArray(privacyNode) || !Array.isArray(privacyNode[0].content)) {
            throw new Error('expected disallowed list write payload')
        }
        return privacyNode[0].content[0]
    }
    assert.equal(categoryOf(1).attrs.dhash, 'stale-hash')
    assert.equal(categoryOf(3).attrs.dhash, 'fresh-hash')
    const users = categoryOf(3).content
    if (!Array.isArray(users)) {
        throw new Error('expected disallowed list user array')
    }
    assert.deepEqual(users[0].attrs, {
        action: 'add',
        jid: '999@lid',
        pn_jid: '5511@s.whatsapp.net'
    })
})

test('privacy coordinator rejects an empty disallowed list write', async () => {
    const coordinator = createPrivacyCoordinator({
        ...createBlocklistDeps(),
        queryWithContext: async () => {
            throw new Error('must not query for an empty mutation')
        }
    })

    await assert.rejects(() => coordinator.setDisallowedList('lastSeen', {}), {
        message: /at least one add\/remove entry/
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
