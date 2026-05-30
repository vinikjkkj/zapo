import type { WaIgnoreKey, WaIgnoreStanzaKind, WaIncomingStanzaFilter } from '@client/types'
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

/** Pure matcher. Exported for direct testing without a coordinator. */
export function matchesIgnoreKey(
    node: BinaryNode,
    d: WaIgnoreKey,
    meJid: string | null | undefined
): boolean {
    const kind = TAG_TO_KIND[node.tag]
    if (kind === undefined) return false
    if (d.only !== undefined && !d.only.includes(kind)) return false

    const a = node.attrs
    const fromCandidates: string[] = []
    if (a.from) fromCandidates.push(a.from)
    if (kind === 'message') {
        if (a.sender_pn) fromCandidates.push(a.sender_pn)
        if (a.sender_lid) fromCandidates.push(a.sender_lid)
    } else if (kind === 'call' && a.sender_lid) {
        fromCandidates.push(a.sender_lid)
    }

    if (d.remoteJid !== undefined) {
        const candidates = Array.isArray(d.remoteJid) ? d.remoteJid : [d.remoteJid]
        if (!fromCandidates.some((f) => matchesAnyJid(f, candidates))) return false
    }

    if (d.participant !== undefined) {
        const pCandidates: string[] = []
        if (a.participant) pCandidates.push(a.participant)
        if (kind === 'message') {
            if (a.participant_pn) pCandidates.push(a.participant_pn)
            if (a.participant_lid) pCandidates.push(a.participant_lid)
        }
        if (!pCandidates.some((p) => matchesAnyJid(p, [d.participant!]))) return false
    }

    if (d.id !== undefined && a.id !== d.id) return false

    if (d.fromMe !== undefined) {
        const me = tryParseJid(meJid)
        const isFromMe =
            me !== null &&
            fromCandidates.some((f) => tryParseJid(f)?.address.user === me.address.user)
        if (d.fromMe !== isFromMe) return false
    }

    return true
}

export function createIgnoreKeyFilter(
    descriptor: WaIgnoreKey,
    getMeJid: () => string | null | undefined
): WaIncomingStanzaFilter {
    return (node) => matchesIgnoreKey(node, descriptor, getMeJid())
}
