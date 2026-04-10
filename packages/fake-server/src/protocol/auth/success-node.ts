/** Builder for the post-handshake `<success/>` stanza. */

import type { BinaryNode } from '../../transport/codec'

export interface BuildSuccessNodeInput {
    readonly t?: number
    readonly props?: number
    readonly companionEncStatic?: string | null
    readonly lid?: string
    readonly displayName?: string
    readonly abprops?: number
    readonly groupAbprops?: number
    readonly location?: string
    readonly creation?: number
}

export function buildSuccessNode(input: BuildSuccessNodeInput = {}): BinaryNode {
    const t = input.t ?? Math.floor(Date.now() / 1_000)
    const props = input.props ?? 0

    const attrs: Record<string, string> = {
        t: String(t),
        props: String(props),
        companion_enc_static: input.companionEncStatic ?? 'NULL'
    }
    if (input.lid !== undefined) attrs.lid = input.lid
    if (input.displayName !== undefined) attrs.display_name = input.displayName
    if (input.abprops !== undefined) attrs.abprops = String(input.abprops)
    if (input.groupAbprops !== undefined) attrs.group_abprops = String(input.groupAbprops)
    if (input.location !== undefined) attrs.location = input.location
    if (input.creation !== undefined) attrs.creation = String(input.creation)

    return {
        tag: 'success',
        attrs
    }
}
