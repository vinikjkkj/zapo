import { parseParticipants as parseGroupEventParticipants } from '@client/events/group'
import type { WaMexOperationResponses } from '@mex'
import { WA_DEFAULTS } from '@protocol/defaults'
import { WA_GROUP_PARTICIPANT_TYPES, type WaGroupSetting } from '@protocol/group'
import { parseJidFull } from '@protocol/jid'
import { WA_IQ_TYPES, WA_NODE_TAGS, WA_XMLNS } from '@protocol/nodes'
import { WA_GROUP_NOTIFICATION_TAGS } from '@protocol/notification'
import { buildListParticipatingGroupsIq } from '@transport/node/builders/account-sync'
import {
    buildDeactivateCommunityIq,
    buildLinkedGroupsParticipantsIq,
    buildLinkSubGroupsIq,
    buildUnlinkSubGroupsIq
} from '@transport/node/builders/community'
import {
    buildCancelMembershipRequestsIq,
    buildCreateGroupIq,
    buildGetMembershipApprovalRequestsIq,
    buildGroupParticipantChangeIq,
    buildJoinLinkedGroupIq,
    buildLeaveGroupIq,
    buildMembershipRequestsActionIq
} from '@transport/node/builders/group'
import {
    findNodeChild,
    getNodeChildrenByTag,
    getNodeChildrenByTagFromChildren,
    getNodeTextContent,
    hasNodeChild
} from '@transport/node/helpers'
import { runMexQuery, type WaMexQuerySocket } from '@transport/node/mex/client'
import { assertIqResult, buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'
import { tryAsNumber, tryAsRecord, tryAsString } from '@util/coercion'

export interface WaGroupParticipant {
    readonly jid: string
    readonly type: string
    readonly isAdmin: boolean
    readonly isSuperAdmin: boolean
    readonly lid?: string
    readonly phoneNumber?: string
    readonly displayName?: string
    readonly username?: string
    readonly expirationSeconds?: number
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
    readonly ephemeralTrigger?: number
    readonly size?: number
    readonly addressingMode?: 'lid' | 'pn'
    readonly isParentGroup: boolean
    readonly isClosedCommunity: boolean
    readonly defaultSubgroup: boolean
    readonly generalSubgroup: boolean
    readonly hiddenSubgroup: boolean
    readonly allowNonAdminSubGroupCreation: boolean
    readonly membershipApprovalEnabled: boolean
    readonly noFrequentlyForwarded: boolean
    readonly support: boolean
    readonly suspended: boolean
    readonly incognito: boolean
    readonly allowAdminReports: boolean
    readonly autoAddDisabled: boolean
    readonly groupHistory: boolean
    readonly capi: boolean
    readonly groupSafetyCheck: boolean
    readonly participantLabelEnabled: boolean
    readonly limitSharingEnabled: boolean
    readonly evolutionVersion?: number
    readonly memberAddMode?: string
    readonly memberLinkMode?: string
    readonly memberShareGroupHistoryMode?: string
    readonly growthLockedExpiration?: number
    readonly appealStatus?: 'approved' | 'in_review' | 'none' | 'rejected'
    readonly appealUpdateTime?: number
    readonly linkedParentJid?: string
    readonly participants: readonly WaGroupParticipant[]
}

export interface WaMembershipRequest {
    readonly jid: string
    readonly requestor?: string
    readonly requestorPhone?: string
    readonly requestorUsername?: string
    readonly parentGroupJid?: string
    readonly requestTime: number
    readonly requestMethod?: string
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

export interface WaCommunitySubGroupSuggestion {
    readonly jid: string
    readonly subject: string | null
    readonly description: string | null
    readonly creator: string | null
    readonly creationTime: number | null
    readonly participantCount: number | null
    readonly isExistingGroup: boolean
    readonly hiddenGroup: boolean
}

export interface WaCommunitySubGroupsResult {
    readonly communityJid: string
    readonly announcementGroup: WaCommunitySubGroup | null
    readonly subGroups: readonly WaCommunitySubGroup[]
}

export interface WaGroupSuspensionAppealResult {
    readonly success: boolean
    readonly responseCode: string | null
    readonly errorMessage: string | null
    readonly appealCreationTime: number | null
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

/**
 * Coordinates group and community queries/mutations. Accessed via
 * {@link WaClient.group}. Community sub-APIs (`fetchSubGroups`,
 * `isInternalGroup`, `transferCommunityOwnership`, `fetchSubgroupSuggestions`,
 * `submitGroupSuspensionAppeal`) require an active MEX transport and throw
 * when unavailable.
 */
export interface WaGroupCoordinator {
    /** Fetches the full metadata for `groupJid`. */
    readonly queryGroupMetadata: (groupJid: string) => Promise<WaGroupMetadata>
    /** Lists every group the current account participates in. */
    readonly queryAllGroups: () => Promise<readonly WaGroupMetadata[]>
    /** Resolves the IQ result for a group invite `code` – returns the raw node. */
    readonly queryGroupInviteInfo: (code: string) => Promise<BinaryNode>
    /**
     * Creates a new group with `subject` and the given participant JIDs.
     * The creator is auto-added as admin; do **not** include your own JID
     * in `participants`. Same partial-failure shape as
     * {@link addParticipants} for individual invitees - inspect the result
     * for `<participant ... error="..."/>` entries.
     */
    readonly createGroup: (
        subject: string,
        participants: readonly string[],
        options?: WaGroupCreateOptions
    ) => Promise<BinaryNode>
    /** Renames the group. */
    readonly setSubject: (groupJid: string, subject: string) => Promise<void>
    /** Sets or clears the group description; pass `null` to remove it. */
    readonly setDescription: (
        groupJid: string,
        description: string | null,
        prevDescId?: string
    ) => Promise<void>
    /** Toggles a named group setting (announce / restrict / ephemeral / ...). */
    readonly setSetting: (
        groupJid: string,
        setting: WaGroupSetting,
        enabled: boolean
    ) => Promise<void>
    /**
     * Adds the given participant JIDs to the group. Returns the raw IQ
     * result - **per-participant outcome is encoded inside** as a list of
     * `<participant jid="..." error="..."/>` children. The IQ as a whole
     * succeeds even when some participants fail (e.g. blocked you, privacy
     * settings disallow add); parse the children to surface partial errors.
     */
    readonly addParticipants: (
        groupJid: string,
        participants: readonly string[]
    ) => Promise<BinaryNode>
    /** Removes the given participant JIDs. Same partial-failure shape as {@link addParticipants}. */
    readonly removeParticipants: (
        groupJid: string,
        participants: readonly string[]
    ) => Promise<BinaryNode>
    /** Promotes participants to admins. Same partial-failure shape as {@link addParticipants}. */
    readonly promoteParticipants: (
        groupJid: string,
        participants: readonly string[]
    ) => Promise<BinaryNode>
    /** Demotes admins back to regular participants. Same partial-failure shape as {@link addParticipants}. */
    readonly demoteParticipants: (
        groupJid: string,
        participants: readonly string[]
    ) => Promise<BinaryNode>
    /** Leaves one or more groups (batched in a single IQ). */
    readonly leaveGroup: (groupJids: readonly string[]) => Promise<BinaryNode>
    /**
     * Revokes the current invite link. The server rotates the code
     * immediately - every previously-shared `chat.whatsapp.com/<code>` link
     * stops working, and the next call to {@link queryGroupInviteInfo}
     * returns the new code.
     */
    readonly revokeInvite: (groupJid: string) => Promise<BinaryNode>
    /**
     * Joins a group using its invite `code` (the path segment of a
     * `chat.whatsapp.com/<code>` URL). Throws if the code is expired,
     * revoked, the group is full, or the current account is already a
     * member.
     */
    readonly joinGroupViaInvite: (code: string) => Promise<BinaryNode>
    /**
     * Creates a community (parent group). Defaults to request-required
     * membership unless `membershipApprovalMode === 'open'`.
     */
    readonly createCommunity: (
        subject: string,
        options?: WaCommunityCreateOptions
    ) => Promise<WaGroupMetadata>
    /** Deactivates (deletes) a community. */
    readonly deactivateCommunity: (communityJid: string) => Promise<void>
    /** Links existing groups as sub-groups of `communityJid`. */
    readonly linkSubGroups: (
        communityJid: string,
        subGroupJids: readonly string[]
    ) => Promise<WaLinkSubGroupsResult>
    /**
     * Unlinks sub-groups from a community. Set `removeOrphanedMembers` to
     * also evict members that no longer belong to any linked group.
     */
    readonly unlinkSubGroups: (
        communityJid: string,
        subGroupJids: readonly string[],
        options?: { readonly removeOrphanedMembers?: boolean }
    ) => Promise<WaUnlinkSubGroupsResult>
    /** Returns the merged participant list across all groups in a community. */
    readonly queryLinkedGroupsParticipants: (
        communityJid: string
    ) => Promise<readonly WaGroupParticipant[]>
    /** Lists sub-groups (and announcement group) of a community via MEX. */
    readonly fetchSubGroups: (communityJid: string) => Promise<WaCommunitySubGroupsResult>
    /** Lists pending membership-approval requests for the group. */
    readonly queryMembershipApprovalRequests: (
        groupJid: string
    ) => Promise<readonly WaMembershipRequest[]>
    /** Approves the listed pending join requests. */
    readonly approveMembershipRequests: (
        groupJid: string,
        participantJids: readonly string[]
    ) => Promise<void>
    /** Rejects the listed pending join requests. */
    readonly rejectMembershipRequests: (
        groupJid: string,
        participantJids: readonly string[]
    ) => Promise<void>
    /** Cancels the current account's own pending join requests in the group. */
    readonly cancelMembershipRequests: (
        groupJid: string,
        participantJids: readonly string[]
    ) => Promise<void>
    /** Joins a linked sub-group of a community the account already belongs to. */
    readonly joinLinkedGroup: (
        communityJid: string,
        subGroupJid: string,
        options?: { readonly type?: string }
    ) => Promise<BinaryNode>
    /** Returns `true` when the group is flagged as an internal WhatsApp group. */
    readonly isInternalGroup: (groupJid: string) => Promise<boolean>
    /** Transfers community ownership to `newOwnerJid` (superadmin handoff). */
    readonly transferCommunityOwnership: (
        communityJid: string,
        newOwnerJid: string
    ) => Promise<void>
    /** Lists suggested sub-groups for a community, anchored on a hint group. */
    readonly fetchSubgroupSuggestions: (
        communityJid: string,
        hintSubgroupJid: string
    ) => Promise<readonly WaCommunitySubGroupSuggestion[]>
    /**
     * Submits a suspension appeal for the group. `responseCode === 'SUCCESS'`
     * or `'APPEAL_ALREADY_EXISTS'` are reported as successful.
     */
    readonly submitGroupSuspensionAppeal: (
        groupJid: string,
        options?: { readonly reason?: string | null; readonly debugInfo?: string }
    ) => Promise<WaGroupSuspensionAppealResult>
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
            isSuperAdmin: type === WA_GROUP_PARTICIPANT_TYPES.SUPERADMIN,
            lid: participant.lidJid,
            phoneNumber: participant.phoneJid,
            displayName: participant.displayName,
            username: participant.username,
            expirationSeconds: participant.expirationSeconds
        }
        participantsCount += 1
    }
    participants.length = participantsCount
    return participants
}

const APPEAL_STATUSES = new Set(['approved', 'in_review', 'none', 'rejected'])

function parseMembershipApprovalRequests(node: BinaryNode): readonly WaMembershipRequest[] {
    const container = findNodeChild(node, 'membership_approval_requests')
    if (!container) return []
    const requestNodes = getNodeChildrenByTag(container, 'membership_approval_request')
    const requests: WaMembershipRequest[] = []
    for (const requestNode of requestNodes) {
        const jid = requestNode.attrs.jid
        if (!jid) continue
        const requestTime = requestNode.attrs.request_time
            ? Number(requestNode.attrs.request_time)
            : 0
        requests.push({
            jid,
            requestor: requestNode.attrs.requestor,
            requestorPhone: requestNode.attrs.requestor_pn,
            requestorUsername: requestNode.attrs.requestor_username,
            parentGroupJid: requestNode.attrs.parent_group_jid,
            requestTime,
            requestMethod: requestNode.attrs.request_method
        })
    }
    return requests
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
    const ephemeralTrigger = ephemeralNode?.attrs.trigger
        ? Number(ephemeralNode.attrs.trigger)
        : undefined

    const parentNode = findNodeChild(target, 'parent')
    const linkedParentNode = findNodeChild(target, 'linked_parent')

    const membershipApprovalNode = findNodeChild(target, WA_NODE_TAGS.MEMBERSHIP_APPROVAL_MODE)
    const groupJoinNode = membershipApprovalNode
        ? findNodeChild(membershipApprovalNode, WA_NODE_TAGS.GROUP_JOIN)
        : undefined

    const growthLockedNode = findNodeChild(target, 'growth_locked')
    const appealStatusNode = findNodeChild(target, 'appeal_status')
    const appealStatusType = appealStatusNode?.attrs.type
    const appealUpdateTimeNode = findNodeChild(target, 'appeal_update_time')
    const evolutionVersionNode = findNodeChild(target, 'evolution_version')
    const memberAddModeNode = findNodeChild(target, 'member_add_mode')
    const memberLinkModeNode = findNodeChild(target, 'member_link_mode')
    const memberShareNode = findNodeChild(target, 'member_share_group_history_mode')

    const addressingModeRaw = attrs.addressing_mode
    const addressingMode: 'lid' | 'pn' | undefined =
        addressingModeRaw === 'lid' ? 'lid' : addressingModeRaw === 'pn' ? 'pn' : undefined

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
        ephemeralTrigger,
        size: attrs.size ? Number(attrs.size) : undefined,
        addressingMode,
        isParentGroup: parentNode !== undefined,
        isClosedCommunity:
            parentNode?.attrs.default_membership_approval_mode === 'request_required',
        defaultSubgroup: hasNodeChild(target, 'default_sub_group'),
        generalSubgroup: hasNodeChild(target, 'general_chat'),
        hiddenSubgroup: hasNodeChild(target, 'hidden_group'),
        allowNonAdminSubGroupCreation: hasNodeChild(target, 'allow_non_admin_sub_group_creation'),
        membershipApprovalEnabled: groupJoinNode?.attrs.state === 'on',
        noFrequentlyForwarded: hasNodeChild(target, 'no_frequently_forwarded'),
        support: hasNodeChild(target, 'support'),
        suspended: hasNodeChild(target, 'suspended'),
        incognito: hasNodeChild(target, 'incognito'),
        allowAdminReports: hasNodeChild(target, 'allow_admin_reports'),
        autoAddDisabled: hasNodeChild(target, 'auto_add_disabled'),
        groupHistory: hasNodeChild(target, 'group_history'),
        capi: hasNodeChild(target, 'capi'),
        groupSafetyCheck: hasNodeChild(target, 'group_safety_check'),
        participantLabelEnabled: hasNodeChild(target, 'participant_label_enabled'),
        limitSharingEnabled: hasNodeChild(target, 'limit_sharing_enabled'),
        evolutionVersion: evolutionVersionNode?.attrs.value
            ? Number(evolutionVersionNode.attrs.value)
            : undefined,
        memberAddMode: memberAddModeNode ? getNodeTextContent(memberAddModeNode) : undefined,
        memberLinkMode: memberLinkModeNode ? getNodeTextContent(memberLinkModeNode) : undefined,
        memberShareGroupHistoryMode: memberShareNode
            ? getNodeTextContent(memberShareNode)
            : undefined,
        growthLockedExpiration: growthLockedNode?.attrs.expiration
            ? Number(growthLockedNode.attrs.expiration)
            : undefined,
        appealStatus:
            appealStatusType && APPEAL_STATUSES.has(appealStatusType)
                ? (appealStatusType as 'approved' | 'in_review' | 'none' | 'rejected')
                : undefined,
        appealUpdateTime: appealUpdateTimeNode?.attrs.value
            ? Number(appealUpdateTimeNode.attrs.value)
            : undefined,
        linkedParentJid: linkedParentNode?.attrs.jid ?? parentNode?.attrs.jid,
        participants: parseGroupParticipants(target)
    }
}

const SETTING_TAGS: Readonly<
    Record<WaGroupSetting, { readonly on: string; readonly off: string }>
> = {
    announcement: {
        on: WA_GROUP_NOTIFICATION_TAGS.ANNOUNCEMENT,
        off: WA_GROUP_NOTIFICATION_TAGS.NOT_ANNOUNCEMENT
    },
    restrict: { on: WA_GROUP_NOTIFICATION_TAGS.LOCKED, off: WA_GROUP_NOTIFICATION_TAGS.UNLOCKED },
    ephemeral: {
        on: WA_GROUP_NOTIFICATION_TAGS.EPHEMERAL,
        off: WA_GROUP_NOTIFICATION_TAGS.NOT_EPHEMERAL
    },
    membership_approval_mode: {
        on: WA_GROUP_NOTIFICATION_TAGS.MEMBERSHIP_APPROVAL_MODE,
        off: WA_GROUP_NOTIFICATION_TAGS.MEMBERSHIP_APPROVAL_MODE
    },
    allow_non_admin_sub_group_creation: {
        on: WA_GROUP_NOTIFICATION_TAGS.ALLOW_NON_ADMIN_SUB_GROUP_CREATION,
        off: WA_GROUP_NOTIFICATION_TAGS.NOT_ALLOW_NON_ADMIN_SUB_GROUP_CREATION
    }
}

function parseSubGroupNode(node: unknown, defaultSubgroup: boolean): WaCommunitySubGroup {
    const n = tryAsRecord(node)
    const subject = tryAsRecord(n?.subject)
    const properties = tryAsRecord(n?.properties)
    const approvals = tryAsRecord(n?.membership_approval_requests)
    return {
        jid: tryAsString(n?.id) ?? '',
        subject: tryAsString(subject?.value) ?? undefined,
        subjectTime: tryAsNumber(subject?.creation_time) ?? undefined,
        defaultSubgroup,
        generalSubgroup: properties?.general_chat === true,
        hiddenSubgroup: properties?.hidden_group === true,
        membershipApprovalEnabled: properties?.membership_approval_mode_enabled === true,
        pendingMembershipRequests: tryAsNumber(approvals?.total_count) ?? 0
    }
}

function parseGroupIsInternalMexResponse(
    data: WaMexOperationResponses['FetchGroupIsInternal'] | null
): boolean {
    return data?.xwa2_group_query_by_id?.properties?.internal === true
}

function parseGroupSuspensionAppealMexResponse(
    data: WaMexOperationResponses['GroupSuspensionAppeal'] | null
): WaGroupSuspensionAppealResult {
    const root = data?.wa_create_group_suspension_appeal
    const responseCode = tryAsString(root?.response_code)
    return {
        success: responseCode === 'SUCCESS' || responseCode === 'APPEAL_ALREADY_EXISTS',
        responseCode,
        errorMessage: tryAsString(root?.error_message),
        appealCreationTime: tryAsNumber(root?.appeal_creation_time)
    }
}

function parseSubGroupSuggestionsMexResponse(
    data: WaMexOperationResponses['FetchSubgroupSuggestions'] | null
): readonly WaCommunitySubGroupSuggestion[] {
    const edges = data?.xwa2_group_query_by_id?.sub_group_suggestions?.edges ?? []
    const results: WaCommunitySubGroupSuggestion[] = []
    for (const edge of edges) {
        const node = edge?.node
        if (!node?.id) continue
        results.push({
            jid: node.id,
            subject: node.subject?.value ?? null,
            description: node.description?.value ?? null,
            creator: node.creator?.id ?? null,
            creationTime: tryAsNumber(node.creation_time),
            participantCount: node.total_participants_count ?? null,
            isExistingGroup: node.is_existing_group === true,
            hiddenGroup: node.hidden_group === true
        })
    }
    return results
}

/** Builds a {@link WaGroupCoordinator} backed by the given IQ query function and optional MEX socket. */
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
            const node = buildIqNode(WA_IQ_TYPES.GET, groupJid, WA_XMLNS.GROUPS, [
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
            const result = await queryWithContext('group.list', buildListParticipatingGroupsIq())
            assertIqResult(result, 'group.list')
            const groupNodes = getNodeChildrenByTagFromChildren(result, WA_NODE_TAGS.GROUP)
            const metadata = new Array<WaGroupMetadata>(groupNodes.length)
            for (let index = 0; index < groupNodes.length; index += 1) {
                metadata[index] = parseGroupMetadata(groupNodes[index])
            }
            return metadata
        },

        queryGroupInviteInfo: async (code) => {
            const node = buildIqNode(WA_IQ_TYPES.GET, WA_DEFAULTS.GROUP_SERVER, WA_XMLNS.GROUPS, [
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
            const node = buildIqNode(WA_IQ_TYPES.SET, groupJid, WA_XMLNS.GROUPS, [
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

            const node = buildIqNode(WA_IQ_TYPES.SET, groupJid, WA_XMLNS.GROUPS, [
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

            const node = buildIqNode(WA_IQ_TYPES.SET, groupJid, WA_XMLNS.GROUPS, [
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
            const node = buildIqNode(WA_IQ_TYPES.SET, groupJid, WA_XMLNS.GROUPS, [
                { tag: WA_NODE_TAGS.INVITE, attrs: {} }
            ])
            const result = await queryWithContext('group.revokeInvite', node)
            assertIqResult(result, 'group.revokeInvite')
            return result
        },

        joinGroupViaInvite: async (code) => {
            const node = buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.GROUP_SERVER, WA_XMLNS.GROUPS, [
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
            const groupNodes = linkNode ? getNodeChildrenByTag(linkNode, WA_NODE_TAGS.GROUP) : []
            const linkedJids: string[] = []
            const failed: WaCommunitySubGroupResult[] = []
            for (const groupNode of groupNodes) {
                const jid = groupNode.attrs.jid
                if (!jid) continue
                const errorAttr = findNodeChild(groupNode, WA_NODE_TAGS.ERROR)?.attrs.code
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
            const groupNodes = unlinkNode
                ? getNodeChildrenByTag(unlinkNode, WA_NODE_TAGS.GROUP)
                : []
            const unlinkedJids: string[] = []
            const failed: WaCommunitySubGroupResult[] = []
            for (const groupNode of groupNodes) {
                const jid = groupNode.attrs.jid
                if (!jid) continue
                const errorAttr = findNodeChild(groupNode, WA_NODE_TAGS.ERROR)?.attrs.code
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
            const data = await runMexQuery(mexSocket, 'FetchAllSubgroups', {
                group_id: communityJid,
                query_context: 'INTERACTIVE',
                sub_group_hint_id: undefined
            })
            const groupQuery = data?.xwa2_group_query_by_id
            const announcementGroup = groupQuery?.default_sub_group
                ? parseSubGroupNode(groupQuery.default_sub_group, true)
                : null
            const edges = (groupQuery?.sub_groups?.edges ?? []) as readonly {
                readonly node?: unknown
            }[]
            const subGroups: WaCommunitySubGroup[] = []
            for (const edge of edges) {
                if (!edge?.node) continue
                subGroups.push(parseSubGroupNode(edge.node, false))
            }
            return { communityJid, announcementGroup, subGroups }
        },

        queryMembershipApprovalRequests: async (groupJid) => {
            const node = buildGetMembershipApprovalRequestsIq(groupJid)
            const result = await queryWithContext('group.membershipRequests', node)
            assertIqResult(result, 'group.membershipRequests')
            return parseMembershipApprovalRequests(result)
        },

        approveMembershipRequests: async (groupJid, participantJids) => {
            const node = buildMembershipRequestsActionIq({ groupJid, approve: participantJids })
            const result = await queryWithContext('group.membershipRequests.approve', node)
            assertIqResult(result, 'group.membershipRequests.approve')
        },

        rejectMembershipRequests: async (groupJid, participantJids) => {
            const node = buildMembershipRequestsActionIq({ groupJid, reject: participantJids })
            const result = await queryWithContext('group.membershipRequests.reject', node)
            assertIqResult(result, 'group.membershipRequests.reject')
        },

        cancelMembershipRequests: async (groupJid, participantJids) => {
            const node = buildCancelMembershipRequestsIq({ groupJid, participantJids })
            const result = await queryWithContext('group.membershipRequests.cancel', node)
            assertIqResult(result, 'group.membershipRequests.cancel')
        },

        joinLinkedGroup: async (communityJid, subGroupJid, options) => {
            const node = buildJoinLinkedGroupIq({
                groupJid: communityJid,
                subGroupJid,
                type: options?.type
            })
            const result = await queryWithContext('community.joinLinkedGroup', node)
            assertIqResult(result, 'community.joinLinkedGroup')
            return result
        },

        isInternalGroup: async (groupJid) => {
            if (!mexSocket) {
                throw new Error('group.isInternalGroup requires a mex transport')
            }
            const data = await runMexQuery(mexSocket, 'FetchGroupIsInternal', { id: groupJid })
            return parseGroupIsInternalMexResponse(data)
        },

        transferCommunityOwnership: async (communityJid, newOwnerJid) => {
            if (!mexSocket) {
                throw new Error('community.transferOwnership requires a mex transport')
            }
            await runMexQuery(mexSocket, 'TransferCommunityOwnership', {
                input: {
                    group_id: communityJid,
                    role_updates: [{ new_role: 'SUPERADMIN_MEMBER', user_jid: newOwnerJid }]
                }
            })
        },

        fetchSubgroupSuggestions: async (communityJid, hintSubgroupJid) => {
            if (!mexSocket) {
                throw new Error('community.fetchSubgroupSuggestions requires a mex transport')
            }
            const data = await runMexQuery(mexSocket, 'FetchSubgroupSuggestions', {
                group_id: communityJid,
                query_context: 'INTERACTIVE',
                sub_group_hint_id: hintSubgroupJid
            })
            return parseSubGroupSuggestionsMexResponse(data)
        },

        submitGroupSuspensionAppeal: async (groupJid, options) => {
            if (!mexSocket) {
                throw new Error('group.submitSuspensionAppeal requires a mex transport')
            }
            const data = await runMexQuery(mexSocket, 'GroupSuspensionAppeal', {
                input: {
                    group_jid: parseJidFull(groupJid).address.user,
                    appeal_reason: options?.reason ?? undefined,
                    debug_info: options?.debugInfo ?? '{}'
                }
            })
            return parseGroupSuspensionAppealMexResponse(data)
        }
    }
}
