/** IQ matcher/dispatcher used by the fake server. */

import type { BinaryNode } from '../../transport/codec'

export type WaFakeIqType = 'get' | 'set'

export interface WaFakeIqMatcher {
    readonly id?: string
    readonly type?: WaFakeIqType
    readonly xmlns?: string
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
    /** High-priority handlers override default ones for a test case. */
    private readonly highPriorityHandlers: WaFakeIqHandler[] = []
    private readonly handlers: WaFakeIqHandler[] = []
    private events: WaFakeIqRouterEvents = {}

    public register(
        handler: WaFakeIqHandler,
        options: { readonly priority?: 'high' | 'default' } = {}
    ): () => void {
        const list =
            options.priority === 'high' ? this.highPriorityHandlers : this.handlers
        list.push(handler)
        return () => {
            const index = list.indexOf(handler)
            if (index >= 0) {
                list.splice(index, 1)
            }
        }
    }

    public setEvents(events: WaFakeIqRouterEvents): void {
        this.events = events
    }

    public async route(iq: BinaryNode): Promise<BinaryNode | null> {
        if (iq.tag !== 'iq') {
            return null
        }
        for (const handler of this.highPriorityHandlers) {
            if (matches(iq, handler.matcher)) {
                return handler.respond(iq)
            }
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
    if (matcher.id !== undefined) {
        if (iq.attrs.id !== matcher.id) return false
    }
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
        attrs.from = inbound.attrs.to
    }
    return {
        tag: 'iq',
        attrs,
        ...(options.content ? { content: options.content } : {})
    }
}

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
