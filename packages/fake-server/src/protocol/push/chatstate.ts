/** Builder for inbound `<chatstate/>` stanzas. */

import type { BinaryNode } from '../../transport/codec'

export type FakeChatstateState =
    | { readonly kind: 'composing'; readonly media?: 'audio' }
    | { readonly kind: 'paused' }

export interface BuildChatstateInput {
    readonly from: string
    readonly participant?: string
    readonly state: FakeChatstateState
}

export function buildChatstate(input: BuildChatstateInput): BinaryNode {
    const attrs: Record<string, string> = { from: input.from }
    if (input.participant !== undefined) {
        attrs.participant = input.participant
    }

    let stateChild: BinaryNode
    if (input.state.kind === 'composing') {
        const childAttrs: Record<string, string> = {}
        if (input.state.media !== undefined) {
            childAttrs.media = input.state.media
        }
        stateChild = { tag: 'composing', attrs: childAttrs }
    } else {
        stateChild = { tag: 'paused', attrs: {} }
    }

    return {
        tag: 'chatstate',
        attrs,
        content: [stateChild]
    }
}
