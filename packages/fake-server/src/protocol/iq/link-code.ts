/**
 * Link-code (pairing-code) relay stanzas.
 *
 * The handshake runs between two clients with the server in the middle: the
 * companion asks for a code (`companion_hello`), the primary answers with its
 * wrapped ephemeral (`primary_hello`), and the companion closes with the key
 * bundle (`companion_finish`). Each stage arrives as an IQ from one client and
 * leaves as a notification to the other; the server only routes and mints the
 * ref that ties the three together.
 */

import type { BinaryNode } from '../../transport/codec'
import { TEXT_DECODER } from '../../transport/util'

export type LinkCodeStage = 'companion_hello' | 'primary_hello' | 'companion_finish'

export interface ParsedLinkCodeStanza {
    readonly stage: LinkCodeStage
    /** Account the companion wants to link to, on the stages that carry it. */
    readonly phoneJid: string | null
    /** Ref the stage refers to; absent on `companion_hello`, which mints it. */
    readonly ref: string | null
    /** The stage's payload elements, relayed verbatim to the other client. */
    readonly children: readonly BinaryNode[]
}

const RELAYED_STAGES: ReadonlySet<string> = new Set<LinkCodeStage>([
    'companion_hello',
    'primary_hello',
    'companion_finish'
])

/**
 * Parses a `<link_code_companion_reg>` IQ. Returns `null` for a stage this
 * server does not relay (for example `get_country_code`), letting the router
 * fall through to another handler.
 */
export function parseLinkCodeStanza(iq: BinaryNode): ParsedLinkCodeStanza | null {
    const node = findChild(iq, 'link_code_companion_reg')
    const stage = node?.attrs.stage
    if (!node || typeof stage !== 'string' || !RELAYED_STAGES.has(stage)) {
        return null
    }
    const jid = node.attrs.jid
    return {
        stage: stage as LinkCodeStage,
        phoneJid: typeof jid === 'string' && jid.length > 0 ? jid : null,
        ref: readText(findChild(node, 'link_code_pairing_ref')),
        children: Array.isArray(node.content) ? node.content : []
    }
}

/**
 * Builds the `companion_hello` IQ result carrying the ref the server minted.
 * The companion keys its whole pairing session off it.
 */
export function buildCompanionHelloResultContent(ref: string): BinaryNode[] {
    return [
        {
            tag: 'link_code_companion_reg',
            attrs: { stage: 'companion_hello' },
            content: [{ tag: 'link_code_pairing_ref', attrs: {}, content: ref }]
        }
    ]
}

export interface BuildLinkCodeNotificationInput {
    readonly stage: LinkCodeStage
    readonly ref: string
    /** Payload elements copied from the originating stanza. */
    readonly children: readonly BinaryNode[]
    readonly id?: string
    readonly to?: string
}

/**
 * Wraps a relayed stage as the notification the receiving client handles. The
 * ref is (re)stamped so the receiver can match it against its pairing session,
 * replacing any copy carried by the source stanza.
 */
export function buildLinkCodeNotification(input: BuildLinkCodeNotificationInput): BinaryNode {
    const children = input.children.filter((child) => child.tag !== 'link_code_pairing_ref')
    return {
        tag: 'notification',
        attrs: {
            id: input.id ?? `link-code-${Math.random().toString(36).slice(2, 10)}`,
            from: 's.whatsapp.net',
            type: 'link_code_companion_reg',
            ...(input.to !== undefined ? { to: input.to } : {})
        },
        content: [
            {
                tag: 'link_code_companion_reg',
                attrs: { stage: input.stage },
                content: [
                    { tag: 'link_code_pairing_ref', attrs: {}, content: input.ref },
                    ...children
                ]
            }
        ]
    }
}

function findChild(parent: BinaryNode, tag: string): BinaryNode | null {
    if (!Array.isArray(parent.content)) {
        return null
    }
    return parent.content.find((child: BinaryNode) => child.tag === tag) ?? null
}

function readText(node: BinaryNode | null): string | null {
    if (!node) {
        return null
    }
    if (typeof node.content === 'string') {
        return node.content
    }
    return node.content instanceof Uint8Array ? TEXT_DECODER.decode(node.content) : null
}
