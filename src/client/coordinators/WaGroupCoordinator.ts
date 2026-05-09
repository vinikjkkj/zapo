import { parseParticipants as parseGroupEventParticipants } from '@client/events/group'
import { WA_DEFAULTS } from '@protocol/defaults'
import { WA_GROUP_PARTICIPANT_TYPES, type WaGroupSetting } from '@protocol/group'
import { WA_NODE_TAGS, WA_XMLNS } from '@protocol/nodes'
import {
    buildDeactivateCommunityIq,
    buildLinkedGroupsParticipantsIq,
    buildLinkSubGroupsIq,
    buildUnlinkSubGroupsIq
} from '@transport/node/builders/community'
import {
    buildCreateGroupIq,
    buildGroupParticipantChangeIq,
    buildLeaveGroupIq
} from '@transport/node/builders/group'
import {
    findNodeChild,
    getNodeChildrenByTag,
    getNodeChildrenByTagFromChildren,
    hasNodeChild
} from '@transport/node/helpers'
import { dispatchMexQuery, type WaMexQuerySocket } from '@transport/node/mex/client'
import { WA_MEX_PERSIST_IDS } from '@transport/node/mex/persist-ids'
import { assertIqResult, buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export interface WaGroupParticipant {
    readonly jid: string
    readonly type: string
    readonly isAdmin: boolean
    readonly isSuperAdmin: boolean
}

export interface WaGroupMetadata {
    readonly jid: string
    readonly subject: string
    readonly subjectOwner?: string
    readonly subjectTime?: number
    readonly owner?: string
    readonly creation?: number
    readonly desc?: string
    readonly descId?: string
    readonly descOwner?: string
    readonly restrict: boolean
    readonly announce: boolean
    readonly ephemeral?: number
    readonly size?: number
    readonly isParentGroup: boolean
    readonly isClosedCommunity: boolean
    readonly defaultSubgroup: boolean
    readonly generalSubgroup: boolean
    readonly hiddenSubgroup: boolean
    readonly allowNonAdminSubGroupCreation: boolean
    readonly linkedParentJid?: string
    readonly participants: readonly WaGroupParticipant[]
}

export interface WaGroupCreateOptions {
    readonly description?: string
    readonly linkedParentJid?: string
}

export interface WaCommunityCreateOptions {
    readonly description?: string
    readonly membershipApprovalMode?: 'open' | 'request_required'
    readonly allowNonAdminSubGroupCreation?: boolean
    readonly createGeneralChat?: boolean
}

export interface WaCommunitySubGroupResult {
    readonly jid: string
    readonly error?: number
}

export interface WaLinkSubGroupsResult {
    readonly linkedJids: readonly string[]
    readonly failed: readonly WaCommunitySubGroupResult[]
}

export interface WaUnlinkSubGroupsResult {
    readonly unlinkedJids: readonly string[]
    readonly failed: readonly WaCommunitySubGroupResult[]
}

export interface WaCommunitySubGroup {
    readonly jid: string
    readonly subject?: string
    readonly subjectTime?: number
    readonly defaultSubgroup: boolean
    readonly generalSubgroup: boolean
    readonly hiddenSubgroup: boolean
    readonly membershipApprovalEnabled: boolean
    readonly pendingMembershipRequests: number
}

export interface WaCommunitySubGroupsResult {
    readonly communityJid: string
    readonly announcementGroup: WaCommunitySubGroup | null
    readonly subGroups: readonly WaCommunitySubGroup[]
}

interface WaGroupCoordinatorOptions {
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
    readonly mexSocket?: WaMexQuerySocket
}

export interface WaGroupCoordinator {
    readonly queryGroupMetadata: (groupJid: string) => Promise<WaGroupMetadata>
    readonly queryAllGroups: () => Promise<readonly WaGroupMetadata[]>
    readonly queryGroupInviteInfo: (code: string) => Promise<BinaryNode>
    readonly createGroup: (
        subject: string,
        participants: readonly string[],
        options?: WaGroupCreateOptions
    ) => Promise<BinaryNode>
    readonly setSubject: (groupJid: string, subject: string) => Promise<void>
    readonly setDescription: (
        groupJid: string,
        description: string | null,
        prevDescId?: string
    ) => Promise<void>
    readonly setSetting: (
        groupJid: string,
        setting: WaGroupSetting,
        enabled: boolean
    ) => Promise<void>
    readonly addParticipants: (
        groupJid: string,
        participants: readonly string[]
    ) => Promise<BinaryNode>
    readonly removeParticipants: (
        groupJid: string,
        participants: readonly string[]
    ) => Promise<BinaryNode>
    readonly promoteParticipants: (
        groupJid: string,
        participants: readonly string[]
    ) => Promise<BinaryNode>
    readonly demoteParticipants: (
        groupJid: string,
        participants: readonly string[]
    ) => Promise<BinaryNode>
    readonly leaveGroup: (groupJids: readonly string[]) => Promise<BinaryNode>
    readonly revokeInvite: (groupJid: string) => Promise<BinaryNode>
    readonly joinGroupViaInvite: (code: string) => Promise<BinaryNode>
    readonly createCommunity: (
        subject: string,
        options?: WaCommunityCreateOptions
    ) => Promise<WaGroupMetadata>
    readonly deactivateCommunity: (communityJid: string) => Promise<void>
    readonly linkSubGroups: (
        communityJid: string,
        subGroupJids: readonly string[]
    ) => Promise<WaLinkSubGroupsResult>
    readonly unlinkSubGroups: (
        communityJid: string,
        subGroupJids: readonly string[],
        options?: { readonly removeOrphanedMembers?: boolean }
    ) => Promise<WaUnlinkSubGroupsResult>
    readonly queryLinkedGroupsParticipants: (
        communityJid: string
    ) => Promise<readonly WaGroupParticipant[]>
    readonly fetchSubGroups: (communityJid: string) => Promise<WaCommunitySubGroupsResult>
}

type WaGroupParticipantChangeAction = 'add' | 'remove' | 'promote' | 'demote'

function parseGroupParticipants(node: BinaryNode): readonly WaGroupParticipant[] {
    const parsed = parseGroupEventParticipants(node)
    const participants = new Array<WaGroupParticipant>(parsed.length)
    let participantsCount = 0
    for (let index = 0; index < parsed.length; index += 1) {
        const participant = parsed[index]
        if (!participant.jid) {
            continue
        }
        const type = participant.role ?? WA_GROUP_PARTICIPANT_TYPES.REGULAR
        participants[participantsCount] = {
            jid: participant.jid,
            type,
            isAdmin:
                type === WA_GROUP_PARTICIPANT_TYPES.ADMIN ||
                type === WA_GROUP_PARTICIPANT_TYPES.SUPERADMIN,
            isSuperAdmin: type === WA_GROUP_PARTICIPANT_TYPES.SUPERADMIN
        }
        participantsCount += 1
    }
    participants.length = participantsCount
    return participants
}

function parseGroupMetadata(node: BinaryNode): WaGroupMetadata {
    const groupNode =
        node.tag === WA_NODE_TAGS.GROUP ? node : findNodeChild(node, WA_NODE_TAGS.GROUP)
    const target = groupNode ?? node
    const attrs = target.attrs

    const descNode = findNodeChild(target, WA_NODE_TAGS.DESCRIPTION)
    let desc: string | undefined
    if (descNode) {
        const bodyNode = findNodeChild(descNode, WA_NODE_TAGS.BODY)
        if (bodyNode && typeof bodyNode.content === 'string') {
            desc = bodyNode.content
        }
    }

    const ephemeralNode = findNodeChild(target, WA_NODE_TAGS.EPHEMERAL)
    const ephemeral = ephemeralNode?.attrs.expiration
        ? Number(ephemeralNode.attrs.expiration)
        : undefined

    const parentNode = findNodeChild(target, 'parent')
    const linkedParentNode = findNodeChild(target, 'linked_parent')

    const rawJid = attrs.id ?? attrs.jid ?? ''
    const jid = rawJid && !rawJid.includes('@') ? `${rawJid}@${WA_DEFAULTS.GROUP_SERVER}` : rawJid

    return {
        jid,
        subject: attrs.subject ?? '',
        subjectOwner: attrs.s_o ?? attrs.subject_owner,
        subjectTime: attrs.s_t ? Number(attrs.s_t) : undefined,
        owner: attrs.creator ?? attrs.owner,
        creation: attrs.creation ? Number(attrs.creation) : undefined,
        desc,
        descId: descNode?.attrs.id,
        descOwner: descNode?.attrs.participant,
        restrict: hasNodeChild(target, WA_NODE_TAGS.LOCKED),
        announce: hasNodeChild(target, WA_NODE_TAGS.ANNOUNCEMENT),
        ephemeral,
        size: attrs.size ? Number(attrs.size) : undefined,
        isParentGroup: parentNode !== undefined,
        isClosedCommunity:
            parentNode?.attrs.default_membership_approval_mode === 'request_required',
        defaultSubgroup: hasNodeChild(target, 'default_sub_group'),
        generalSubgroup: hasNodeChild(target, 'general_chat'),
        hiddenSubgroup: hasNodeChild(target, 'hidden_group'),
        allowNonAdminSubGroupCreation: hasNodeChild(target, 'allow_non_admin_sub_group_creation'),
        linkedParentJid: linkedParentNode?.attrs.jid ?? parentNode?.attrs.jid,
        participants: parseGroupParticipants(target)
    }
}

const SETTING_TAGS: Readonly<
    Record<WaGroupSetting, { readonly on: string; readonly off: string }>
> = {
    announcement: { on: 'announcement', off: 'not_announcement' },
    restrict: { on: 'locked', off: 'unlocked' },
    ephemeral: { on: 'ephemeral', off: 'not_ephemeral' },
    membership_approval_mode: { on: 'membership_approval_mode', off: 'membership_approval_mode' },
    allow_non_admin_sub_group_creation: {
        on: 'allow_non_admin_sub_group_creation',
        off: 'not_allow_non_admin_sub_group_creation'
    }
}

interface MexSubGroupNode {
    readonly id?: string
    readonly subject?: { readonly value?: string; readonly creation_time?: string | number }
    readonly properties?: {
        readonly general_chat?: boolean | null
        readonly membership_approval_mode_enabled?: boolean | null
        readonly hidden_group?: boolean | null
    } | null
    readonly membership_approval_requests?: { readonly total_count?: string | number } | null
}

interface MexFetchAllSubgroupsResult {
    readonly xwa2_group_query_by_id?: {
        readonly default_sub_group?: MexSubGroupNode | null
        readonly sub_groups?: { readonly edges?: readonly { readonly node?: MexSubGroupNode }[] }
    } | null
}

function parseSubGroupNode(node: MexSubGroupNode, defaultSubgroup: boolean): WaCommunitySubGroup {
    const totalCount = node.membership_approval_requests?.total_count
    const creationTime = node.subject?.creation_time
    return {
        jid: node.id ?? '',
        subject: node.subject?.value,
        subjectTime: creationTime !== undefined ? Number(creationTime) : undefined,
        defaultSubgroup,
        generalSubgroup: node.properties?.general_chat === true,
        hiddenSubgroup: node.properties?.hidden_group === true,
        membershipApprovalEnabled: node.properties?.membership_approval_mode_enabled === true,
        pendingMembershipRequests: totalCount !== undefined ? Number(totalCount) : 0
    }
}

export function createGroupCoordinator(options: WaGroupCoordinatorOptions): WaGroupCoordinator {
    const { queryWithContext, mexSocket } = options

    const changeParticipants = async (
        action: WaGroupParticipantChangeAction,
        groupJid: string,
        participants: readonly string[]
    ): Promise<BinaryNode> => {
        const context = `group.${action}Participants`
        const node = buildGroupParticipantChangeIq({
            groupJid,
            action,
            participants
        })
        const result = await queryWithContext(context, node)
        assertIqResult(result, context)
        return result
    }

    return {
        queryGroupMetadata: async (groupJid) => {
            const node = buildIqNode('get', groupJid, WA_XMLNS.GROUPS, [
                {
                    tag: WA_NODE_TAGS.QUERY,
                    attrs: {}
                }
            ])
            const result = await queryWithContext('group.metadata', node)
            assertIqResult(result, 'group.metadata')
            return parseGroupMetadata(result)
        },

        queryAllGroups: async () => {
            const node = buildIqNode('get', WA_DEFAULTS.GROUP_SERVER, WA_XMLNS.GROUPS, [
                {
                    tag: WA_NODE_TAGS.PARTICIPATING,
                    attrs: {},
                    content: [
                        { tag: WA_NODE_TAGS.PARTICIPANTS, attrs: {} },
                        { tag: WA_NODE_TAGS.DESCRIPTION, attrs: {} }
                    ]
                }
            ])
            const result = await queryWithContext('group.list', node)
            assertIqResult(result, 'group.list')
            const groupNodes = getNodeChildrenByTagFromChildren(result, WA_NODE_TAGS.GROUP)
            const metadata = new Array<WaGroupMetadata>(groupNodes.length)
            for (let index = 0; index < groupNodes.length; index += 1) {
                metadata[index] = parseGroupMetadata(groupNodes[index])
            }
            return metadata
        },

        queryGroupInviteInfo: async (code) => {
            const node = buildIqNode('get', WA_DEFAULTS.GROUP_SERVER, WA_XMLNS.GROUPS, [
                { tag: WA_NODE_TAGS.INVITE, attrs: { code } }
            ])
            const result = await queryWithContext('group.invite.info', node)
            assertIqResult(result, 'group.invite.info')
            return result
        },

        createGroup: async (subject, participants, opts) => {
            const node = buildCreateGroupIq({
                subject,
                participants,
                description: opts?.description,
                linkedParentJid: opts?.linkedParentJid
            })
            const result = await queryWithContext('group.create', node)
            assertIqResult(result, 'group.create')
            return result
        },

        setSubject: async (groupJid, subject) => {
            const node = buildIqNode('set', groupJid, WA_XMLNS.GROUPS, [
                { tag: WA_NODE_TAGS.SUBJECT, attrs: {}, content: subject }
            ])
            const result = await queryWithContext('group.setSubject', node)
            assertIqResult(result, 'group.setSubject')
        },

        setDescription: async (groupJid, description, prevDescId) => {
            const descId = `${Date.now()}`
            const attrs: Record<string, string> = { id: descId }
            if (prevDescId) attrs.prev = prevDescId

            let content: BinaryNode['content']
            if (description === null) {
                attrs.delete = 'true'
            } else {
                content = [{ tag: WA_NODE_TAGS.BODY, attrs: {}, content: description }]
            }

            const node = buildIqNode('set', groupJid, WA_XMLNS.GROUPS, [
                { tag: WA_NODE_TAGS.DESCRIPTION, attrs, content }
            ])
            const result = await queryWithContext('group.setDescription', node)
            assertIqResult(result, 'group.setDescription')
        },

        setSetting: async (groupJid, setting, enabled) => {
            const tags = SETTING_TAGS[setting]
            const tag = enabled ? tags.on : tags.off

            let content: BinaryNode[] | undefined
            if (setting === 'membership_approval_mode') {
                content = [
                    {
                        tag: WA_NODE_TAGS.GROUP_JOIN,
                        attrs: { state: enabled ? 'on' : 'off' }
                    }
                ]
            }

            const node = buildIqNode('set', groupJid, WA_XMLNS.GROUPS, [
                { tag, attrs: {}, ...(content ? { content } : {}) }
            ])
            const result = await queryWithContext('group.setSetting', node)
            assertIqResult(result, 'group.setSetting')
        },

        addParticipants: async (groupJid, participants) =>
            changeParticipants('add', groupJid, participants),

        removeParticipants: async (groupJid, participants) =>
            changeParticipants('remove', groupJid, participants),

        promoteParticipants: async (groupJid, participants) =>
            changeParticipants('promote', groupJid, participants),

        demoteParticipants: async (groupJid, participants) =>
            changeParticipants('demote', groupJid, participants),

        leaveGroup: async (groupJids) => {
            const node = buildLeaveGroupIq(groupJids)
            const result = await queryWithContext('group.leave', node)
            assertIqResult(result, 'group.leave')
            return result
        },

        revokeInvite: async (groupJid) => {
            const node = buildIqNode('set', groupJid, WA_XMLNS.GROUPS, [
                { tag: WA_NODE_TAGS.INVITE, attrs: {} }
            ])
            const result = await queryWithContext('group.revokeInvite', node)
            assertIqResult(result, 'group.revokeInvite')
            return result
        },

        joinGroupViaInvite: async (code) => {
            const node = buildIqNode('set', WA_DEFAULTS.GROUP_SERVER, WA_XMLNS.GROUPS, [
                { tag: WA_NODE_TAGS.INVITE, attrs: { code } }
            ])
            const result = await queryWithContext('group.joinViaInvite', node)
            assertIqResult(result, 'group.joinViaInvite')
            return result
        },

        createCommunity: async (subject, opts) => {
            const node = buildCreateGroupIq({
                subject,
                participants: [],
                description: opts?.description,
                parent:
                    opts?.membershipApprovalMode === 'open'
                        ? true
                        : { defaultMembershipApprovalMode: 'request_required' },
                allowNonAdminSubGroupCreation: opts?.allowNonAdminSubGroupCreation,
                createGeneralChat: opts?.createGeneralChat
            })
            const result = await queryWithContext('community.create', node)
            assertIqResult(result, 'community.create')
            return parseGroupMetadata(result)
        },

        deactivateCommunity: async (communityJid) => {
            const node = buildDeactivateCommunityIq(communityJid)
            const result = await queryWithContext('community.deactivate', node)
            assertIqResult(result, 'community.deactivate')
        },

        linkSubGroups: async (communityJid, subGroupJids) => {
            const node = buildLinkSubGroupsIq({
                communityJid,
                subGroups: subGroupJids.map((jid) => ({ jid }))
            })
            const result = await queryWithContext('community.linkSubGroups', node)
            assertIqResult(result, 'community.linkSubGroups')

            const linksNode = findNodeChild(result, 'links')
            const linkNode = linksNode ? findNodeChild(linksNode, 'link') : undefined
            const groupNodes = linkNode ? getNodeChildrenByTag(linkNode, 'group') : []
            const linkedJids: string[] = []
            const failed: WaCommunitySubGroupResult[] = []
            for (const groupNode of groupNodes) {
                const jid = groupNode.attrs.jid
                if (!jid) continue
                const errorAttr = findNodeChild(groupNode, 'error')?.attrs.code
                if (errorAttr !== undefined) {
                    failed.push({ jid, error: Number(errorAttr) })
                } else {
                    linkedJids.push(jid)
                }
            }
            return { linkedJids, failed }
        },

        unlinkSubGroups: async (communityJid, subGroupJids, options) => {
            const node = buildUnlinkSubGroupsIq({
                communityJid,
                subGroupJids,
                removeOrphanedMembers: options?.removeOrphanedMembers
            })
            const result = await queryWithContext('community.unlinkSubGroups', node)
            assertIqResult(result, 'community.unlinkSubGroups')

            const unlinkNode = findNodeChild(result, 'unlink')
            const groupNodes = unlinkNode ? getNodeChildrenByTag(unlinkNode, 'group') : []
            const unlinkedJids: string[] = []
            const failed: WaCommunitySubGroupResult[] = []
            for (const groupNode of groupNodes) {
                const jid = groupNode.attrs.jid
                if (!jid) continue
                const errorAttr = findNodeChild(groupNode, 'error')?.attrs.code
                if (errorAttr !== undefined) {
                    failed.push({ jid, error: Number(errorAttr) })
                } else {
                    unlinkedJids.push(jid)
                }
            }
            return { unlinkedJids, failed }
        },

        queryLinkedGroupsParticipants: async (communityJid) => {
            const node = buildLinkedGroupsParticipantsIq(communityJid)
            const result = await queryWithContext('community.linkedGroupsParticipants', node)
            assertIqResult(result, 'community.linkedGroupsParticipants')
            const container = findNodeChild(result, 'linked_groups_participants')
            return container ? parseGroupParticipants(container) : []
        },

        fetchSubGroups: async (communityJid) => {
            if (!mexSocket) {
                throw new Error('community.fetchSubGroups requires a mex transport')
            }
            const { data } = await dispatchMexQuery(mexSocket, {
                docId: WA_MEX_PERSIST_IDS.CommunityFetchAllSubgroups.docId,
                clientDocId: WA_MEX_PERSIST_IDS.CommunityFetchAllSubgroups.clientDocId,
                opName: 'CommunityFetchAllSubgroups',
                variables: {
                    group_id: communityJid,
                    query_context: 'INTERACTIVE',
                    sub_group_hint_id: undefined
                }
            })
            const envelope = (data ?? {}) as MexFetchAllSubgroupsResult
            const groupQuery = envelope.xwa2_group_query_by_id
            const announcementNode = groupQuery?.default_sub_group
            const announcementGroup = announcementNode
                ? parseSubGroupNode(announcementNode, true)
                : null
            const edges = groupQuery?.sub_groups?.edges ?? []
            const subGroups: WaCommunitySubGroup[] = []
            for (const edge of edges) {
                if (!edge?.node) continue
                subGroups.push(parseSubGroupNode(edge.node, false))
            }
            return { communityJid, announcementGroup, subGroups }
        }
    }
}
