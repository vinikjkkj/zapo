import { WA_DEFAULTS } from '@protocol/defaults'
import { WA_XMLNS } from '@protocol/nodes'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export interface BuildCreateGroupIqInput {
    readonly subject: string
    readonly participants: readonly string[]
    readonly description?: string
    readonly linkedParentJid?: string
    readonly parent?:
        | true
        | { readonly defaultMembershipApprovalMode?: 'request_required' | undefined }
    readonly allowNonAdminSubGroupCreation?: boolean
    readonly createGeneralChat?: boolean
}

export function buildCreateGroupIq(input: BuildCreateGroupIqInput): BinaryNode {
    const children: BinaryNode[] = input.participants.map((jid) => ({
        tag: 'participant',
        attrs: { jid }
    }))

    if (input.description) {
        children.push({
            tag: 'description',
            attrs: { id: `${Date.now()}` },
            content: [{ tag: 'body', attrs: {}, content: input.description }]
        })
    }

    if (input.parent !== undefined) {
        const parentAttrs: Record<string, string> = {}
        if (
            input.parent !== true &&
            input.parent.defaultMembershipApprovalMode === 'request_required'
        ) {
            parentAttrs.default_membership_approval_mode = 'request_required'
        }
        children.push({ tag: 'parent', attrs: parentAttrs })
    }

    if (input.linkedParentJid) {
        children.push({ tag: 'linked_parent', attrs: { jid: input.linkedParentJid } })
    }

    if (input.allowNonAdminSubGroupCreation) {
        children.push({ tag: 'allow_non_admin_sub_group_creation', attrs: {} })
    }

    if (input.createGeneralChat) {
        children.push({ tag: 'create_general_chat', attrs: {} })
    }

    return buildIqNode('set', WA_DEFAULTS.GROUP_SERVER, WA_XMLNS.GROUPS, [
        {
            tag: 'create',
            attrs: { subject: input.subject },
            content: children
        }
    ])
}

type GroupParticipantAction = 'add' | 'remove' | 'promote' | 'demote'

export function buildGroupParticipantChangeIq(input: {
    readonly groupJid: string
    readonly action: GroupParticipantAction
    readonly participants: readonly string[]
}): BinaryNode {
    return buildIqNode('set', input.groupJid, WA_XMLNS.GROUPS, [
        {
            tag: input.action,
            attrs: {},
            content: input.participants.map((jid) => ({
                tag: 'participant',
                attrs: { jid }
            }))
        }
    ])
}

export function buildLeaveGroupIq(groupJids: readonly string[]): BinaryNode {
    return buildIqNode('set', WA_DEFAULTS.GROUP_SERVER, WA_XMLNS.GROUPS, [
        {
            tag: 'leave',
            attrs: {},
            content: groupJids.map((jid) => ({
                tag: 'group',
                attrs: { id: jid }
            }))
        }
    ])
}

export function buildGetMembershipApprovalRequestsIq(groupJid: string): BinaryNode {
    return buildIqNode('get', groupJid, WA_XMLNS.GROUPS, [
        { tag: 'membership_approval_requests', attrs: {} }
    ])
}

export function buildMembershipRequestsActionIq(input: {
    readonly groupJid: string
    readonly approve?: readonly string[]
    readonly reject?: readonly string[]
}): BinaryNode {
    const approve = input.approve ?? []
    const reject = input.reject ?? []
    if (approve.length === 0 && reject.length === 0) {
        throw new Error('membership_requests_action requires at least one approve or reject jid')
    }
    const children: BinaryNode[] = []
    if (approve.length > 0) {
        children.push({
            tag: 'approve',
            attrs: {},
            content: approve.map((jid) => ({ tag: 'participant', attrs: { jid } }))
        })
    }
    if (reject.length > 0) {
        children.push({
            tag: 'reject',
            attrs: {},
            content: reject.map((jid) => ({ tag: 'participant', attrs: { jid } }))
        })
    }
    return buildIqNode('set', input.groupJid, WA_XMLNS.GROUPS, [
        { tag: 'membership_requests_action', attrs: {}, content: children }
    ])
}

export function buildCancelMembershipRequestsIq(input: {
    readonly groupJid: string
    readonly participantJids: readonly string[]
}): BinaryNode {
    if (input.participantJids.length === 0) {
        throw new Error('cancel_membership_requests requires at least one participant')
    }
    return buildIqNode('set', input.groupJid, WA_XMLNS.GROUPS, [
        {
            tag: 'cancel_membership_requests',
            attrs: {},
            content: input.participantJids.map((jid) => ({
                tag: 'participant',
                attrs: { jid }
            }))
        }
    ])
}

export function buildJoinLinkedGroupIq(input: {
    readonly groupJid: string
    readonly subGroupJid: string
    readonly type?: string
}): BinaryNode {
    const attrs: Record<string, string> = { jid: input.subGroupJid }
    if (input.type) {
        attrs.type = input.type
    }
    return buildIqNode('set', input.groupJid, WA_XMLNS.GROUPS, [
        { tag: 'join_linked_group', attrs }
    ])
}
