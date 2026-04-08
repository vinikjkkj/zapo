/**
 * Builder for top-level `<error/>` stanzas pushed by the server.
 *
 * Source: indirect — `WaIncomingNodeCoordinator` (the lib) registers a
 * handler for the `'error'` tag that emits the raw `BinaryNode` to the
 * consumer via `incoming_error_stanza`. The deobfuscated codebase reuses
 * the same `<error/>` shape inside `<iq type="error"/>` and as a free
 * stanza, with `code` and optional `text` attributes:
 *
 *   <error code="<int>" text="<message>"/>
 *
 * Optional `from` echoes the originating peer when relevant.
 */

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
