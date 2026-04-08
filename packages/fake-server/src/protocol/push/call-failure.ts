/**
 * Builders for `<call/>` and `<failure/>` push stanzas.
 *
 * Source: indirect — the lib's `WaIncomingNodeCoordinator` registers a
 * generic handler for both tags that emits the raw `BinaryNode` to the
 * consumer via `call` and `failure` events. The fake server only needs
 * to construct wire-correct stanzas; the consumer chooses what attrs to
 * inspect.
 *
 * `<call/>` wire layout (typical):
 *
 *   <call id="<unique>" from="<peer-jid>" to="<self-jid>" t="<unix-seconds>">
 *      <offer call-id="..." call-creator="..." .../>     ← or <accept/>, <reject/>, ...
 *   </call>
 *
 * `<failure/>` wire layout:
 *
 *   <failure reason="<short>" location="<context>"/>
 */

import type { BinaryNode } from '../../transport/codec'

export interface BuildCallInput {
    readonly id: string
    readonly from: string
    readonly to?: string
    readonly t?: number
    readonly children?: readonly BinaryNode[]
}

export function buildCall(input: BuildCallInput): BinaryNode {
    const attrs: Record<string, string> = {
        id: input.id,
        from: input.from
    }
    if (input.to !== undefined) attrs.to = input.to
    if (input.t !== undefined) attrs.t = String(input.t)
    return {
        tag: 'call',
        attrs,
        ...(input.children ? { content: input.children } : {})
    }
}

export interface BuildFailureInput {
    readonly reason: string
    readonly location?: string
    readonly extraAttrs?: Readonly<Record<string, string>>
}

export function buildFailure(input: BuildFailureInput): BinaryNode {
    const attrs: Record<string, string> = {
        reason: input.reason,
        ...(input.extraAttrs ?? {})
    }
    if (input.location !== undefined) attrs.location = input.location
    return {
        tag: 'failure',
        attrs
    }
}
