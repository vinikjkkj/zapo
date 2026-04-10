/** Builder for inbound encrypted `<message/>` stanzas. */

import type { BinaryNode } from '../../transport/codec'

export type FakeEncType = 'pkmsg' | 'msg' | 'skmsg'

export interface FakeEncChild {
    readonly type: FakeEncType
    readonly ciphertext: Uint8Array
    readonly mediatype?: string
}

export interface BuildMessageInput {
    readonly id: string
    readonly from: string
    readonly t?: number
    readonly type?: string
    readonly participant?: string
    readonly notify?: string
    readonly offline?: number
    readonly enc: readonly FakeEncChild[]
    readonly extraChildren?: readonly BinaryNode[]
}

export function buildMessage(input: BuildMessageInput): BinaryNode {
    const attrs: Record<string, string> = {
        id: input.id,
        from: input.from,
        t: String(input.t ?? Math.floor(Date.now() / 1_000)),
        type: input.type ?? 'text'
    }
    if (input.participant !== undefined) attrs.participant = input.participant
    if (input.notify !== undefined) attrs.notify = input.notify
    if (input.offline !== undefined) attrs.offline = String(input.offline)

    const children: BinaryNode[] = input.enc.map((enc) => {
        const encAttrs: Record<string, string> = {
            v: '2',
            type: enc.type
        }
        if (enc.mediatype !== undefined) encAttrs.mediatype = enc.mediatype
        return {
            tag: 'enc',
            attrs: encAttrs,
            content: enc.ciphertext
        }
    })
    if (input.extraChildren) {
        for (const extra of input.extraChildren) {
            children.push(extra)
        }
    }

    return {
        tag: 'message',
        attrs,
        content: children
    }
}
