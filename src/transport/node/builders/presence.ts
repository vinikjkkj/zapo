import type { BinaryNode } from '@transport/types'

export interface BuildPresenceNodeInput {
    readonly type?: 'available' | 'unavailable'
    readonly name?: string
}

export function buildPresenceNode(input?: BuildPresenceNodeInput): BinaryNode {
    const attrs: Record<string, string> = {}
    if (input?.type) {
        attrs.type = input.type
    }
    if (input?.name) {
        attrs.name = input.name
    }
    return {
        tag: 'presence',
        attrs
    }
}
