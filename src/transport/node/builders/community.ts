import { WA_XMLNS } from '@protocol/nodes'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export interface BuildLinkSubGroupsIqInput {
    readonly communityJid: string
    readonly subGroups: readonly { readonly jid: string; readonly hidden?: boolean }[]
}

export function buildLinkSubGroupsIq(input: BuildLinkSubGroupsIqInput): BinaryNode {
    if (input.subGroups.length === 0) {
        throw new Error('linkSubGroups requires at least one subgroup')
    }
    return buildIqNode('set', input.communityJid, WA_XMLNS.GROUPS, [
        {
            tag: 'links',
            attrs: {},
            content: [
                {
                    tag: 'link',
                    attrs: { link_type: 'sub_group' },
                    content: input.subGroups.map(({ jid, hidden }) => ({
                        tag: 'group',
                        attrs: { jid },
                        ...(hidden ? { content: [{ tag: 'hidden_group', attrs: {} }] } : {})
                    }))
                }
            ]
        }
    ])
}

export interface BuildUnlinkSubGroupsIqInput {
    readonly communityJid: string
    readonly subGroupJids: readonly string[]
    readonly removeOrphanedMembers?: boolean
}

export function buildUnlinkSubGroupsIq(input: BuildUnlinkSubGroupsIqInput): BinaryNode {
    if (input.subGroupJids.length === 0) {
        throw new Error('unlinkSubGroups requires at least one subgroup')
    }
    const groupAttrs: Record<string, string> = {}
    if (input.removeOrphanedMembers) {
        groupAttrs.remove_orphaned_members = 'true'
    }
    return buildIqNode('set', input.communityJid, WA_XMLNS.GROUPS, [
        {
            tag: 'unlink',
            attrs: { unlink_type: 'sub_group' },
            content: input.subGroupJids.map((jid) => ({
                tag: 'group',
                attrs: { jid, ...groupAttrs }
            }))
        }
    ])
}

export function buildDeactivateCommunityIq(communityJid: string): BinaryNode {
    return buildIqNode('set', communityJid, WA_XMLNS.GROUPS, [{ tag: 'delete_parent', attrs: {} }])
}

export function buildLinkedGroupsParticipantsIq(communityJid: string): BinaryNode {
    return buildIqNode('get', communityJid, WA_XMLNS.GROUPS, [
        { tag: 'linked_groups_participants', attrs: {} }
    ])
}
