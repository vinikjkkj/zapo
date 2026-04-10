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
