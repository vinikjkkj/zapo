/** Builders/parsers for `privacy` and `blocklist` IQs. */

import type { BinaryNode } from '../../transport/codec'

import { buildIqResult } from './router'

export type FakePrivacyCategoryName =
    | 'readreceipts'
    | 'last'
    | 'online'
    | 'profile'
    | 'status'
    | 'groupadd'
    | 'calladd'
    | 'messages'
    | 'defense'

export type FakePrivacyValue = string

export interface FakePrivacySettingsState {
    readonly settings: Readonly<Record<FakePrivacyCategoryName, FakePrivacyValue>>
    readonly disallowed: Readonly<Record<FakePrivacyCategoryName, readonly string[]>>
}

export const FAKE_DEFAULT_PRIVACY_SETTINGS: FakePrivacySettingsState = {
    settings: {
        readreceipts: 'all',
        last: 'all',
        online: 'all',
        profile: 'all',
        status: 'contacts',
        groupadd: 'all',
        calladd: 'all',
        messages: 'all',
        defense: 'off'
    },
    disallowed: {
        readreceipts: [],
        last: [],
        online: [],
        profile: [],
        status: [],
        groupadd: [],
        calladd: [],
        messages: [],
        defense: []
    }
}

export function buildPrivacySettingsResult(
    iq: BinaryNode,
    state: FakePrivacySettingsState
): BinaryNode {
    const result = buildIqResult(iq)
    return {
        ...result,
        content: [
            {
                tag: 'privacy',
                attrs: {},
                content: (Object.keys(state.settings) as FakePrivacyCategoryName[]).map(
                    (name) => ({
                        tag: 'category',
                        attrs: { name, value: state.settings[name] }
                    })
                )
            }
        ]
    }
}

export function buildPrivacyDisallowedListResult(
    iq: BinaryNode,
    category: FakePrivacyCategoryName,
    jids: readonly string[]
): BinaryNode {
    const result = buildIqResult(iq)
    return {
        ...result,
        content: [
            {
                tag: 'privacy',
                attrs: {},
                content: [
                    {
                        tag: 'list',
                        attrs: {
                            name: category,
                            value: 'contact_blacklist',
                            dhash: 'fake-dhash'
                        },
                        content: jids.map((jid) => ({
                            tag: 'user',
                            attrs: { jid }
                        }))
                    }
                ]
            }
        ]
    }
}

export function buildBlocklistResult(iq: BinaryNode, jids: readonly string[]): BinaryNode {
    const result = buildIqResult(iq)
    return {
        ...result,
        content: [
            {
                tag: 'list',
                attrs: { dhash: 'fake-blocklist-dhash' },
                content: jids.map((jid) => ({
                    tag: 'item',
                    attrs: { jid }
                }))
            }
        ]
    }
}

export function parsePrivacySetCategoryIq(iq: BinaryNode): {
    readonly category: FakePrivacyCategoryName
    readonly value: string
} | null {
    if (!Array.isArray(iq.content)) return null
    const privacy = iq.content.find((child) => child.tag === 'privacy')
    if (!privacy || !Array.isArray(privacy.content)) return null
    const category = privacy.content.find((child: BinaryNode) => child.tag === 'category')
    if (!category) return null
    const name = category.attrs.name as FakePrivacyCategoryName | undefined
    const value = category.attrs.value
    if (!name || !value) return null
    return { category: name, value }
}

export function parseBlocklistChangeIq(iq: BinaryNode): {
    readonly jid: string
    readonly action: 'block' | 'unblock'
} | null {
    if (!Array.isArray(iq.content)) return null
    const item = iq.content.find((child) => child.tag === 'item')
    if (!item) return null
    const jid = item.attrs.jid
    const action = item.attrs.action
    if (!jid || (action !== 'block' && action !== 'unblock')) return null
    return { jid, action }
}

export function parsePrivacyDisallowedListGetIq(
    iq: BinaryNode
): FakePrivacyCategoryName | null {
    if (!Array.isArray(iq.content)) return null
    const privacy = iq.content.find((child) => child.tag === 'privacy')
    if (!privacy || !Array.isArray(privacy.content)) return null
    const list = privacy.content.find((child: BinaryNode) => child.tag === 'list')
    if (!list) return null
    const name = list.attrs.name as FakePrivacyCategoryName | undefined
    return name ?? null
}
