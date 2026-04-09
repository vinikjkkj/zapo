/**
 * Builders + parsers for `<iq xmlns="w:biz">` business profile IQs.
 *
 * Source:
 *   /deobfuscated/WAWebBusiness/WAWebBusinessProfileResponse.js
 *
 * Cross-checked against `src/transport/node/builders/business.ts` and
 * `src/client/coordinators/WaBusinessCoordinator.ts`.
 *
 * Wire layout (get):
 *   <iq type="result" id="<echo>">
 *     <business_profile v="116">
 *       <profile jid="5511...@s.whatsapp.net" tag="<id>">
 *         <address>...</address>
 *         <description>...</description>
 *         <email>...</email>
 *         <website>https://...</website>
 *         <categories>
 *           <category id="..."/>
 *         </categories>
 *         <business_hours timezone="America/Sao_Paulo">
 *           <business_hours_config day_of_week="mon" mode="open_24h"/>
 *           ...
 *         </business_hours>
 *       </profile>
 *     </business_profile>
 *   </iq>
 */

import type { BinaryNode } from '../../transport/codec'

import { buildIqResult } from './router'

export interface FakeBusinessProfile {
    readonly jid: string
    readonly description?: string
    readonly address?: string
    readonly email?: string
    readonly websites?: readonly string[]
    readonly categoryIds?: readonly string[]
}

export function buildBusinessProfileResult(
    iq: BinaryNode,
    profiles: readonly FakeBusinessProfile[]
): BinaryNode {
    const result = buildIqResult(iq)
    return {
        ...result,
        content: [
            {
                tag: 'business_profile',
                attrs: { v: '116' },
                content: profiles.map((profile) => ({
                    tag: 'profile',
                    attrs: { jid: profile.jid, tag: 'fake-profile-tag' },
                    content: buildBusinessProfileChildren(profile)
                }))
            }
        ]
    }
}

function buildBusinessProfileChildren(profile: FakeBusinessProfile): BinaryNode[] {
    const out: BinaryNode[] = []
    if (profile.address !== undefined) {
        out.push({ tag: 'address', attrs: {}, content: profile.address })
    }
    if (profile.description !== undefined) {
        out.push({ tag: 'description', attrs: {}, content: profile.description })
    }
    if (profile.email !== undefined) {
        out.push({ tag: 'email', attrs: {}, content: profile.email })
    }
    for (const website of profile.websites ?? []) {
        out.push({ tag: 'website', attrs: {}, content: website })
    }
    if (profile.categoryIds && profile.categoryIds.length > 0) {
        out.push({
            tag: 'categories',
            attrs: {},
            content: profile.categoryIds.map((id) => ({
                tag: 'category',
                attrs: { id }
            }))
        })
    }
    return out
}

/**
 * Parses the inbound `<iq><business_profile v="116"><profile jid=...>` query
 * IQ and returns the list of jids the lib is asking about.
 */
export function parseGetBusinessProfileIq(iq: BinaryNode): readonly string[] | null {
    if (!Array.isArray(iq.content)) return null
    const profile = iq.content.find((child) => child.tag === 'business_profile')
    if (!profile || !Array.isArray(profile.content)) return null
    const jids: string[] = []
    for (const child of profile.content) {
        if (child.tag === 'profile' && child.attrs.jid) {
            jids.push(child.attrs.jid)
        }
    }
    return jids
}
