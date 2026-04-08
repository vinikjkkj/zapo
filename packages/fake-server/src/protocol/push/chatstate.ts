/**
 * Builder for inbound `<chatstate/>` stanzas pushed by the server.
 *
 * Source:
 *   /deobfuscated/WASmaxInChatstate/WASmaxInChatstateServerNotificationRequest.js
 *   /deobfuscated/WASmaxInChatstate/WASmaxInChatstateComposingMixin.js
 *   /deobfuscated/WASmaxInChatstate/WASmaxInChatstatePausedMixin.js
 *   /deobfuscated/WASmaxInChatstateFrom/WASmaxInChatstateFromUserMixin.js
 *
 * Wire layout
 * -----------
 *   <chatstate from="<user-jid>" [participant="<participant-jid>"]>
 *       <composing [media="audio"]/>     ← typing
 *       <paused/>                        ← stopped typing
 *   </chatstate>
 *
 * Only one of `composing` / `paused` is present per stanza. The optional
 * `media="audio"` attribute on `composing` distinguishes recording-audio
 * from typing-text.
 *
 * The lib's incoming dispatcher (`WaIncomingNodeCoordinator`, tag
 * `'chatstate'`) forwards the raw `BinaryNode` to the consumer via the
 * `incoming_chatstate` event without parsing the inner state, so this
 * builder simply needs to construct a wire-correct stanza.
 */

import type { BinaryNode } from '../../transport/codec'

export type FakeChatstateState =
    | { readonly kind: 'composing'; readonly media?: 'audio' }
    | { readonly kind: 'paused' }

export interface BuildChatstateInput {
    /** JID of the user the chatstate applies to. */
    readonly from: string
    /** Optional participant JID — set when the chatstate comes from inside a group. */
    readonly participant?: string
    /** Inner state — composing or paused. */
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
