/** Builders/parsers for `w:biz` business profile IQs. */

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
