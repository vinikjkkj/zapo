/**
 * Builder for inbound `<receipt/>` stanzas pushed by the server.
 *
 * Source:
 *   /deobfuscated/WAWebHandleMsgReceipt/WAWebHandleMsgReceipt.js
 *   /deobfuscated/WAWebHandleDir/WAWebHandleDirectChatReceipt.js
 *   /deobfuscated/WAWebHandleGroupC/WAWebHandleGroupChatReceipt.js
 *   /deobfuscated/WASmaxInReceipt/WASmaxInReceipt*Mixin.js
 *
 * Wire layout
 * -----------
 *   <receipt
 *      id="<message-id>"          (required)
 *      from="<chat-jid>"          (required)
 *      type="<receipt-type>"      (omitted = delivery; "read", "retry",
 *                                  "server-error", "played", "enc_rekey_retry"...)
 *      t="<unix-seconds>"         (optional timestamp)
 *      participant="<participant-jid>"  (optional, group context)
 *      recipient="<recipient-jid>"      (optional, peer context)
 *   />
 *
 * Inner content varies by type — for plain delivery / read receipts the
 * stanza is attribute-only. Aggregate receipts include `<list/>` children
 * with `<item id="..."/>` rows; we keep the builder simple and let callers
 * pass an extra `content` array if they need to model that.
 *
 * Receipt acks are sent back automatically by the lib's incoming receipt
 * handler — the fake server doesn't need to do anything special after the
 * push.
 */

import type { BinaryNode } from '../../transport/codec'

export type FakeReceiptType =
    | 'delivery'
    | 'read'
    | 'played'
    | 'retry'
    | 'enc_rekey_retry'
    | 'server-error'
    | 'inactive'

export interface BuildReceiptInput {
    /** Required `id` — the message id this receipt refers to. */
    readonly id: string
    /** Required `from` — the chat JID. */
    readonly from: string
    /** Receipt type. Omit for plain delivery. */
    readonly type?: FakeReceiptType
    /** Optional timestamp in unix seconds. */
    readonly t?: number
    /** Group/broadcast participant. */
    readonly participant?: string
    /** Peer recipient (used for outbound receipts the server bridges to us). */
    readonly recipient?: string
    /** Optional inner children — e.g. `<list>` for aggregate receipts. */
    readonly content?: readonly BinaryNode[]
}

export function buildReceipt(input: BuildReceiptInput): BinaryNode {
    const attrs: Record<string, string> = {
        id: input.id,
        from: input.from
    }
    if (input.type !== undefined && input.type !== 'delivery') {
        attrs.type = input.type
    }
    if (input.t !== undefined) attrs.t = String(input.t)
    if (input.participant !== undefined) attrs.participant = input.participant
    if (input.recipient !== undefined) attrs.recipient = input.recipient

    return {
        tag: 'receipt',
        attrs,
        ...(input.content ? { content: input.content } : {})
    }
}
