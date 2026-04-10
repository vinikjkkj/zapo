/** Builders for inbound notification stanzas. */

import type { BinaryNode } from '../../transport/codec'

export interface BuildNotificationInput {
    readonly id: string
    readonly type: string
    readonly from?: string
    readonly t?: number
    readonly participant?: string
    readonly content?: readonly BinaryNode[]
    readonly extraAttrs?: Readonly<Record<string, string>>
}

export function buildNotification(input: BuildNotificationInput): BinaryNode {
    const attrs: Record<string, string> = {
        id: input.id,
        type: input.type,
        from: input.from ?? 's.whatsapp.net',
        ...(input.extraAttrs ?? {})
    }
    if (input.t !== undefined) attrs.t = String(input.t)
    if (input.participant !== undefined) attrs.participant = input.participant
    return {
        tag: 'notification',
        attrs,
        ...(input.content ? { content: input.content } : {})
    }
}

export interface BuildGroupNotificationInput {
    readonly id: string
    readonly groupJid: string
    readonly participant?: string
    readonly t?: number
    readonly children: readonly BinaryNode[]
}

export function buildGroupNotification(input: BuildGroupNotificationInput): BinaryNode {
    // Group notifications use wire type `w:gp2`.
    return buildNotification({
        id: input.id,
        type: 'w:gp2',
        from: input.groupJid,
        participant: input.participant,
        t: input.t,
        content: input.children
    })
}
