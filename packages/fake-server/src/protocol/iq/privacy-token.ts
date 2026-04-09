/**
 * Builders + parsers for the trusted-contact privacy-token IQs.
 *
 * Source:
 *   /deobfuscated/WAWebPrivacyToken/WAWebPrivacyTokenIqResponse.js
 *
 * Cross-checked against:
 *   src/transport/node/builders/privacy-token.ts (`buildPrivacyTokenIqNode`)
 *   src/client/coordinators/WaTrustedContactTokenCoordinator.ts
 *
 * Wire layout the lib emits:
 *
 *   <iq type="set" to="s.whatsapp.net" xmlns="privacy">
 *     <tokens>
 *       <token jid="<peer-jid>" t="<unix-seconds>" type="trusted_contact"/>
 *     </tokens>
 *   </iq>
 *
 * The lib's `issuePrivacyToken` only awaits `queryWithContext` and does
 * not parse the response, so a bare `<iq type="result"/>` ack is enough
 * to satisfy it. We still parse the inbound stanza so tests can capture
 * the issued tokens via `onOutboundPrivacyTokenIssue`.
 */

import type { BinaryNode } from '../../transport/codec'

export interface FakePrivacyTokenIssue {
    readonly jid: string
    readonly timestampS: number
    readonly type: string
}

/**
 * Parses the inbound `<iq xmlns="privacy" type="set"><tokens><token .../></tokens></iq>`
 * stanza into the list of token entries the lib is publishing. Returns
 * `null` if the stanza doesn't carry a `<tokens>` envelope.
 */
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
