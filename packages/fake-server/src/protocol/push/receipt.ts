/** Builder for inbound `<receipt/>` stanzas. */

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
    readonly id: string
    readonly from: string
    readonly type?: FakeReceiptType
    readonly t?: number
    readonly participant?: string
    readonly recipient?: string
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
