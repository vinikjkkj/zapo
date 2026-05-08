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
