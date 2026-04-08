/**
 * IQ router for the fake server.
 *
 * Source: dispatch model derived from
 *   /deobfuscated/WAWebHandleI/WAWebHandleIqResponse.js (request/response pairing)
 *   /deobfuscated/WAWebOpenC/WAWebOpenChatSocket.js (post-handshake stanza loop)
 *
 * The WhatsApp Web client sends IQ stanzas with the following minimum shape:
 *
 *   <iq id="<unique>" type="get|set" xmlns="<namespace>" to="<jid>">
 *      ...child...
 *   </iq>
 *
 * The server is expected to reply with an IQ that echoes the same `id` and
 * has type `result` or `error`. Until a response arrives the client may
 * block on the request (most IQs in the bootstrap path are blocking).
 *
 * The router is a thin matcher list. Each handler declares the (xmlns, child
 * tag, type) tuple it cares about and produces a response BinaryNode (or a
 * promise of one). Handlers are matched in registration order; the first
 * match wins.
 *
 * IQs that match no handler are reported via `onUnhandled` so tests can fail
 * loudly during bring-up of new flows.
 */

import type { BinaryNode } from '../../transport/codec'

export type WaFakeIqType = 'get' | 'set'

export interface WaFakeIqMatcher {
    /** IQ type to match (`get` or `set`). Omit to match any. */
    readonly type?: WaFakeIqType
    /** `xmlns` attribute on the IQ stanza. */
    readonly xmlns?: string
    /** First child tag inside the IQ. Omit to match any. */
    readonly childTag?: string
}

export type WaFakeIqResponder = (iq: BinaryNode) => BinaryNode | Promise<BinaryNode>

export interface WaFakeIqHandler {
    readonly matcher: WaFakeIqMatcher
    readonly respond: WaFakeIqResponder
    readonly label?: string
}

export interface WaFakeIqRouterEvents {
    readonly onUnhandled?: (iq: BinaryNode) => void
}

export class WaFakeIqRouter {
    private readonly handlers: WaFakeIqHandler[] = []
    private events: WaFakeIqRouterEvents = {}

    public register(handler: WaFakeIqHandler): () => void {
        this.handlers.push(handler)
        return () => {
            const index = this.handlers.indexOf(handler)
            if (index >= 0) {
                this.handlers.splice(index, 1)
            }
        }
    }

    public setEvents(events: WaFakeIqRouterEvents): void {
        this.events = events
    }

    /** Returns the response stanza, or null if no handler matched. */
    public async route(iq: BinaryNode): Promise<BinaryNode | null> {
        if (iq.tag !== 'iq') {
            return null
        }
        for (const handler of this.handlers) {
            if (matches(iq, handler.matcher)) {
                return handler.respond(iq)
            }
        }
        this.events.onUnhandled?.(iq)
        return null
    }
}

function matches(iq: BinaryNode, matcher: WaFakeIqMatcher): boolean {
    if (matcher.type !== undefined) {
        if (iq.attrs.type !== matcher.type) return false
    }
    if (matcher.xmlns !== undefined) {
        if (iq.attrs.xmlns !== matcher.xmlns) return false
    }
    if (matcher.childTag !== undefined) {
        const children = Array.isArray(iq.content) ? iq.content : null
        if (!children || children.length === 0) return false
        if (children[0].tag !== matcher.childTag) return false
    }
    return true
}

/**
 * Builds a generic `<iq type="result" id="<echo>" from="..."/>` response that
 * echoes the inbound id and optionally carries a payload.
 */
export function buildIqResult(
    inbound: BinaryNode,
    options: { readonly from?: string; readonly content?: BinaryNode[] } = {}
): BinaryNode {
    const id = inbound.attrs.id
    if (!id) {
        throw new Error('cannot build iq result for inbound iq without an id')
    }
    const attrs: Record<string, string> = {
        type: 'result',
        id
    }
    if (options.from !== undefined) {
        attrs.from = options.from
    } else if (typeof inbound.attrs.to === 'string') {
        // Echo "to" back as "from" by default — matches WhatsApp Web server behavior.
        attrs.from = inbound.attrs.to
    }
    return {
        tag: 'iq',
        attrs,
        ...(options.content ? { content: options.content } : {})
    }
}

/**
 * Builds a generic `<iq type="error" id="<echo>" code="<n>" text="<msg>"/>`
 * response.
 */
export function buildIqError(
    inbound: BinaryNode,
    options: { readonly code: number; readonly text?: string; readonly from?: string }
): BinaryNode {
    const id = inbound.attrs.id
    if (!id) {
        throw new Error('cannot build iq error for inbound iq without an id')
    }
    const attrs: Record<string, string> = {
        type: 'error',
        id
    }
    if (options.from !== undefined) {
        attrs.from = options.from
    } else if (typeof inbound.attrs.to === 'string') {
        attrs.from = inbound.attrs.to
    }
    return {
        tag: 'iq',
        attrs,
        content: [
            {
                tag: 'error',
                attrs: {
                    code: String(options.code),
                    ...(options.text !== undefined ? { text: options.text } : {})
                }
            }
        ]
    }
}
