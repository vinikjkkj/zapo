import type {
    WaIgnoreKey,
    WaIgnoreKeyContext,
    WaIgnoreKeyPredicate,
    WaIgnoreStanzaKind,
    WaIncomingStanzaFilter
} from '@client/types'
import { parseJidFull } from '@protocol/jid'
import { WA_MESSAGE_TAGS } from '@protocol/message'
import { WA_NODE_TAGS } from '@protocol/nodes'
import type { BinaryNode } from '@transport/types'

const TAG_TO_KIND: Readonly<Record<string, WaIgnoreStanzaKind>> = {
    [WA_MESSAGE_TAGS.MESSAGE]: 'message',
    [WA_MESSAGE_TAGS.RECEIPT]: 'receipt',
    [WA_NODE_TAGS.NOTIFICATION]: 'notification',
    [WA_NODE_TAGS.PRESENCE]: 'presence',
    [WA_NODE_TAGS.CHATSTATE]: 'chatstate',
    [WA_NODE_TAGS.CALL]: 'call'
}

export function validateIgnoreKey(d: WaIgnoreKey): void {
    if (
        d.remoteJid === undefined &&
        d.fromMe === undefined &&
        d.id === undefined &&
        d.participant === undefined
    ) {
        throw new Error('ignoreKey: at least one match field required')
    }
    if (Array.isArray(d.remoteJid) && d.remoteJid.length === 0) {
        throw new Error('ignoreKey: remoteJid array is empty')
    }
    if (d.only !== undefined && d.only.length === 0) {
        throw new Error('ignoreKey: only array is empty')
    }
}

function tryParseJid(jid: string | null | undefined) {
    if (!jid) return null
    try {
        return parseJidFull(jid)
    } catch {
        return null
    }
}

function matchesAnyJid(actual: string | undefined, candidates: readonly string[]): boolean {
    const a = tryParseJid(actual)
    if (a === null) return false
    for (const c of candidates) {
        if (tryParseJid(c)?.userJid === a.userJid) return true
    }
    return false
}

function collectFromCandidates(kind: WaIgnoreStanzaKind, attrs: BinaryNode['attrs']): string[] {
    const list: string[] = []
    if (attrs.from) list.push(attrs.from)
    if (kind === 'message') {
        if (attrs.sender_pn) list.push(attrs.sender_pn)
        if (attrs.sender_lid) list.push(attrs.sender_lid)
    } else if (kind === 'call' && attrs.sender_lid) {
        list.push(attrs.sender_lid)
    }
    return list
}

function collectParticipantCandidates(
    kind: WaIgnoreStanzaKind,
    attrs: BinaryNode['attrs']
): string[] {
    const list: string[] = []
    if (attrs.participant) list.push(attrs.participant)
    if (kind === 'message') {
        if (attrs.participant_pn) list.push(attrs.participant_pn)
        if (attrs.participant_lid) list.push(attrs.participant_lid)
    }
    return list
}

/**
 * Builds the parsed context handed to a {@link WaIgnoreKeyPredicate}. Returns
 * `null` when the node's tag is not one of the addressable kinds (`<iq>`, etc.).
 */
export function extractIgnoreKeyContext(
    node: BinaryNode,
    meJid: string | null | undefined
): WaIgnoreKeyContext | null {
    const kind = TAG_TO_KIND[node.tag]
    if (kind === undefined) return null
    const a = node.attrs
    const me = tryParseJid(meJid)
    const fromCandidates = collectFromCandidates(kind, a)
    const fromMe =
        me !== null && fromCandidates.some((f) => tryParseJid(f)?.address.user === me.address.user)
    // Device-stripped to match the JID form used by events/keys; a userless
    // server `from` like `s.whatsapp.net` is unparseable, so fall back to raw.
    return {
        kind,
        remoteJid: tryParseJid(a.from)?.userJid ?? a.from ?? null,
        fromMe,
        id: a.id,
        participant: tryParseJid(a.participant)?.userJid ?? a.participant ?? null
    }
}

/** Pure matcher. Exported for direct testing without a coordinator. */
export function matchesIgnoreKey(
    node: BinaryNode,
    d: WaIgnoreKey,
    meJid: string | null | undefined
): boolean {
    const ctx = extractIgnoreKeyContext(node, meJid)
    if (ctx === null) return false
    if (d.only !== undefined && !d.only.includes(ctx.kind)) return false

    const a = node.attrs
    const fromCandidates = collectFromCandidates(ctx.kind, a)

    if (d.remoteJid !== undefined) {
        const candidates = Array.isArray(d.remoteJid) ? d.remoteJid : [d.remoteJid]
        if (!fromCandidates.some((f) => matchesAnyJid(f, candidates))) return false
    }

    if (d.participant !== undefined) {
        const pCandidates = collectParticipantCandidates(ctx.kind, a)
        if (!pCandidates.some((p) => matchesAnyJid(p, [d.participant!]))) return false
    }

    if (d.id !== undefined && ctx.id !== d.id) return false

    if (d.fromMe !== undefined && d.fromMe !== ctx.fromMe) return false

    return true
}

export function createIgnoreKeyFilter(
    input: WaIgnoreKey | WaIgnoreKeyPredicate,
    getMeJid: () => string | null | undefined
): WaIncomingStanzaFilter {
    if (typeof input === 'function') {
        return (node) => {
            const ctx = extractIgnoreKeyContext(node, getMeJid())
            return ctx !== null && input(ctx)
        }
    }
    return (node) => matchesIgnoreKey(node, input, getMeJid())
}
