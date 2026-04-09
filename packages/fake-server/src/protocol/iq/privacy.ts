/**
 * Builders + per-server state for the `privacy` and `blocklist` IQs.
 *
 * Sources:
 *   /deobfuscated/WAWebPrivacy/WAWebPrivacySettings.js
 *   /deobfuscated/WAWebBlocklist/WAWebBlocklistResponse.js
 *
 * Cross-checked against the lib's `parsePrivacySettings`,
 * `parseDisallowedList`, `parseBlocklist`
 * (`src/client/coordinators/WaPrivacyCoordinator.ts`).
 *
 * Wire layouts the lib expects:
 *
 *   <iq type="result" id="<echo>" from="s.whatsapp.net">
 *     <privacy>
 *       <category name="readreceipts" value="all"/>
 *       <category name="last" value="contacts"/>
 *       ...
 *     </privacy>
 *   </iq>
 *
 *   <iq type="result" id="<echo>" from="s.whatsapp.net">
 *     <list dhash="<string>">
 *       <item jid="5511...@s.whatsapp.net"/>
 *       ...
 *     </list>
 *   </iq>
 *
 *   <iq type="result" id="<echo>" from="s.whatsapp.net">
 *     <privacy>
 *       <list name="status" value="contact_blacklist" dhash="<string>">
 *         <user jid="5511...@s.whatsapp.net"/>
 *         ...
 *       </list>
 *     </privacy>
 *   </iq>
 */

import type { BinaryNode } from '../../transport/codec'

import { buildIqResult } from './router'

/** WhatsApp privacy categories the lib understands. */
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

/** Default values the lib accepts; not enforced here. */
export type FakePrivacyValue = string

export interface FakePrivacySettingsState {
    readonly settings: Readonly<Record<FakePrivacyCategoryName, FakePrivacyValue>>
    /** Per-category disallowed list (jids the user explicitly blocks for that category). */
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

/**
 * Builds the `<iq><privacy><category .../></privacy></iq>` response
 * for an inbound `<iq xmlns="privacy" type="get"><privacy/></iq>`.
 */
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

/**
 * Builds the `<iq><privacy><list ...><user .../></list></privacy></iq>`
 * response for an inbound `<iq xmlns="privacy" type="get">` carrying a
 * `<privacy><list name="<category>" value="contact_blacklist"/>` query.
 */
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

/**
 * Builds the `<iq><list dhash=...><item jid=.../></list></iq>` response
 * for an inbound `<iq xmlns="blocklist" type="get"/>` query.
 */
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

/**
 * Parses the inbound `<iq xmlns="privacy" type="set"><privacy><category name=... value=.../></privacy></iq>`
 * stanza into a structured mutation. Returns `null` if the stanza
 * doesn't carry a category change.
 */
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

/**
 * Parses the inbound `<iq xmlns="blocklist" type="set"><item jid=... action="block|unblock"/></iq>`
 * stanza.
 */
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

/**
 * Parses the inbound `<iq xmlns="privacy" type="get"><privacy><list name=... value="contact_blacklist"/></privacy></iq>`
 * disallowed-list query and returns the requested category.
 */
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
