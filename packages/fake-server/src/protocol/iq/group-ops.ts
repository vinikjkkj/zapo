/** Builders/parsers for `w:g2` group IQ operations. */

import type { BinaryNode } from '../../transport/codec'

import { buildIqResult } from './router'

export type FakeGroupParticipantAction = 'add' | 'remove' | 'promote' | 'demote'

export function parseGroupParticipantChangeIq(iq: BinaryNode): {
    readonly action: FakeGroupParticipantAction
    readonly groupJid: string
    readonly participantJids: readonly string[]
} | null {
    if (!Array.isArray(iq.content)) return null
    for (const child of iq.content) {
        if (
            child.tag === 'add' ||
            child.tag === 'remove' ||
            child.tag === 'promote' ||
            child.tag === 'demote'
        ) {
            const groupJid = iq.attrs.to
            if (!groupJid) return null
            const participantJids: string[] = []
            if (Array.isArray(child.content)) {
                for (const participant of child.content) {
                    if (participant.tag === 'participant' && participant.attrs.jid) {
                        participantJids.push(participant.attrs.jid)
                    }
                }
            }
            return {
                action: child.tag as FakeGroupParticipantAction,
                groupJid,
                participantJids
            }
        }
    }
    return null
}

export function buildGroupParticipantChangeResult(
    iq: BinaryNode,
    action: FakeGroupParticipantAction,
    participantJids: readonly string[]
): BinaryNode {
    const result = buildIqResult(iq)
    return {
        ...result,
        content: [
            {
                tag: action,
                attrs: {},
                content: participantJids.map((jid) => ({
                    tag: 'participant',
                    attrs: { jid, error: '200' }
                }))
            }
        ]
    }
}

export function parseCreateGroupIq(iq: BinaryNode): {
    readonly subject: string
    readonly participantJids: readonly string[]
    readonly description?: string
} | null {
    if (!Array.isArray(iq.content)) return null
    const create = iq.content.find((child) => child.tag === 'create')
    if (!create) return null
    const subject = create.attrs.subject ?? ''
    const participantJids: string[] = []
    let description: string | undefined
    if (Array.isArray(create.content)) {
        for (const child of create.content) {
            if (child.tag === 'participant' && child.attrs.jid) {
                participantJids.push(child.attrs.jid)
            } else if (child.tag === 'description' && Array.isArray(child.content)) {
                const body = child.content.find((c: BinaryNode) => c.tag === 'body')
                if (body && typeof body.content === 'string') {
                    description = body.content
                } else if (body && body.content instanceof Uint8Array) {
                    description = new TextDecoder().decode(body.content)
                }
            }
        }
    }
    return { subject, participantJids, description }
}

export function parseSetSubjectIq(iq: BinaryNode): {
    readonly groupJid: string
    readonly subject: string
} | null {
    if (!Array.isArray(iq.content)) return null
    const subject = iq.content.find((child) => child.tag === 'subject')
    if (!subject) return null
    const groupJid = iq.attrs.to
    if (!groupJid) return null
    return {
        groupJid,
        subject: decodeNodeContentToString(subject.content) ?? ''
    }
}

export function parseSetDescriptionIq(iq: BinaryNode): {
    readonly groupJid: string
    readonly description: string | null
    readonly descriptionId: string | undefined
} | null {
    if (!Array.isArray(iq.content)) return null
    const desc = iq.content.find((child) => child.tag === 'description')
    if (!desc) return null
    const groupJid = iq.attrs.to
    if (!groupJid) return null
    if (desc.attrs.delete === 'true') {
        return { groupJid, description: null, descriptionId: desc.attrs.id }
    }
    let body: string | null = null
    if (Array.isArray(desc.content)) {
        const bodyNode = desc.content.find((c: BinaryNode) => c.tag === 'body')
        if (bodyNode) {
            body = decodeNodeContentToString(bodyNode.content) ?? ''
        }
    }
    return { groupJid, description: body, descriptionId: desc.attrs.id }
}

export function parseLeaveGroupIq(iq: BinaryNode): readonly string[] | null {
    if (!Array.isArray(iq.content)) return null
    const leave = iq.content.find((child) => child.tag === 'leave')
    if (!leave || !Array.isArray(leave.content)) return null
    const out: string[] = []
    for (const child of leave.content) {
        if (child.tag === 'group' && child.attrs.id) {
            out.push(child.attrs.id)
        }
    }
    return out
}

export function buildGroupMetadataNode(input: {
    readonly groupJid: string
    readonly subject: string
    readonly creator: string
    readonly creationSeconds: number
    readonly participantJids: readonly string[]
    readonly description?: string
    readonly descriptionId?: string
}): BinaryNode {
    const children: BinaryNode[] = input.participantJids.map((jid) => ({
        tag: 'participant',
        attrs: { jid }
    }))
    if (input.description !== undefined) {
        children.push({
            tag: 'description',
            attrs: { id: input.descriptionId ?? `${Date.now()}` },
            content: [{ tag: 'body', attrs: {}, content: input.description }]
        })
    }
    return {
        tag: 'group',
        attrs: {
            id: input.groupJid,
            subject: input.subject,
            creation: String(input.creationSeconds),
            creator: input.creator,
            s_t: String(input.creationSeconds),
            s_o: input.creator
        },
        content: children
    }
}

function decodeNodeContentToString(content: BinaryNode['content']): string | undefined {
    if (typeof content === 'string') return content
    if (content instanceof Uint8Array) return new TextDecoder().decode(content)
    return undefined
}
