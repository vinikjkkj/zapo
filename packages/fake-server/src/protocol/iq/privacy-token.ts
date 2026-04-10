/** Parser helpers for outbound trusted-contact privacy token IQs. */

import type { BinaryNode } from '../../transport/codec'

export interface FakePrivacyTokenIssue {
    readonly jid: string
    readonly timestampS: number
    readonly type: string
}

export function parsePrivacyTokenIssueIq(
    iq: BinaryNode
): readonly FakePrivacyTokenIssue[] | null {
    if (!Array.isArray(iq.content)) return null
    const tokens = iq.content.find((child) => child.tag === 'tokens')
    if (!tokens || !Array.isArray(tokens.content)) return null
    const out: FakePrivacyTokenIssue[] = []
    for (const child of tokens.content) {
        if (child.tag !== 'token') continue
        const jid = child.attrs.jid
        const t = child.attrs.t
        if (!jid || !t) continue
        const timestampS = Number.parseInt(t, 10)
        if (!Number.isFinite(timestampS)) continue
        out.push({
            jid,
            timestampS,
            type: child.attrs.type ?? 'trusted_contact'
        })
    }
    return out
}
