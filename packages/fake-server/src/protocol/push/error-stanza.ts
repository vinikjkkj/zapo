import type { BinaryNode } from '../../transport/codec'

export interface BuildIncomingErrorStanzaInput {
    readonly code: number
    readonly text?: string
    readonly from?: string
}

export function buildIncomingErrorStanza(input: BuildIncomingErrorStanzaInput): BinaryNode {
    const attrs: Record<string, string> = {
        code: String(input.code)
    }
    if (input.text !== undefined) attrs.text = input.text
    if (input.from !== undefined) attrs.from = input.from
    return {
        tag: 'error',
        attrs
    }
}
