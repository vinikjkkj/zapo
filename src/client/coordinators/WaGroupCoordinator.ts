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
    buildMembershipRequestsActionIq,
    buildSetGroupEphemeralIq,
    buildSetGroupMemberAddModeIq,
    buildSetGroupMemberLinkModeIq,
    buildSetGroupMemberShareGroupHistoryModeIq,
    type WaGroupMemberAddMode,
    type WaGroupMemberLinkMode,
    type WaGroupMemberShareGroupHistoryMode
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
    /** PN-form jid of the group creator when the group is LID-addressed (`creator_pn`). */
    readonly ownerPhoneNumber?: string
    /** Username handle of the group creator when set (`creator_username`). */
    readonly ownerUsername?: string
    /** ISO country code of the group creator when set (`creator_country_code`). */
    readonly ownerCountryCode?: string
    readonly creation?: number
    readonly desc?: string
    readonly descId?: string
    readonly descOwner?: string
    readonly descTime?: number
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

export interface WaGroupInviteParticipantSample {
    readonly jid: string
    readonly phoneNumber?: string
    readonly type?: string
}

export interface WaGroupInviteInfo extends GroupCommons {
    readonly hiddenGroup: boolean
    readonly defaultSubgroup: boolean
    readonly generalChat: boolean
    readonly hasCapi: boolean
    /**
     * Sample of participants returned alongside the invite preview - WhatsApp
     * trims this list (admins/recent members), it is not the full roster.
     * Call {@link WaGroupCoordinator.queryGroupMetadata} after joining for
     * the complete list.
     */
    readonly participants: readonly WaGroupInviteParticipantSample[]
}

export interface WaRevokeInviteResult {
    readonly code: string
    /**
     * Participants that joined via the now-revoked code and that the server
     * surfaced in the response (typically with `code: 404` meaning the
     * invite they used is gone). Empty when nobody was affected.
     */
    readonly affectedParticipants: readonly WaParticipantActionResult[]
}

export type WaParticipantActionStatus = 'ok' | 'error'

export interface WaParticipantActionResult {
    readonly jid: string
    readonly status: WaParticipantActionStatus
    /** HTTP-style numeric code returned by the server (`200`, `403`, `409`, ...). */
    readonly code: number
    /** PN-form JID the server resolved for the participant (when addressing-mode is LID). */
    readonly phoneNumber?: string
    /** Username (handle) the server resolved for the participant, when set. */
    readonly username?: string
    /**
     * Optional content children attached to the participant outcome. Some
     * partial failures (`409: gone`, `408: not-allowed`, ...) carry extra
     * tags that hint at how to recover.
     */
    readonly raw: BinaryNode
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
    /**
     * Resolves a group invite `code` (the path segment of a
     * `chat.whatsapp.com/<code>` URL) into a preview of the group: subject,
     * size, ephemeral timer, description, and a trimmed participant sample.
     * The sample is NOT the full roster - call {@link queryGroupMetadata}
     * after joining for the complete list.
     */
    readonly queryGroupInviteInfo: (code: string) => Promise<WaGroupInviteInfo>
    /**
     * Creates a new group with `subject` and the given participant JIDs.
     * The creator is auto-added as admin; do **not** include your own JID
     * in `participants`. The returned metadata includes the participant
     * list - partial failures surface as participants with `type: 'error'`
     * or are filtered out by the server; inspect against the original
     * `participants` to spot rejections.
     */
    readonly createGroup: (
        subject: string,
        participants: readonly string[],
        options?: WaGroupCreateOptions
    ) => Promise<WaGroupMetadata>
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
     * Sets who can add members to the group. `admin_add` restricts adds to
     * admins; `all_member_add` lets any participant add. Group admin
     * operation - non-admins receive a `403 not-authorized` error.
     */
    readonly setMemberAddMode: (groupJid: string, mode: WaGroupMemberAddMode) => Promise<void>
    /**
     * Sets who can share/forward the group invite link. `admin_link`
     * restricts to admins; `all_member_link` lets any participant share.
     * Group admin operation.
     */
    readonly setMemberLinkMode: (groupJid: string, mode: WaGroupMemberLinkMode) => Promise<void>
    /**
     * Sets whether new members see prior chat history. `admin_share` hides
     * history; `all_member_share` exposes the message backlog when someone
     * joins. Group admin operation.
     */
    readonly setMemberShareGroupHistoryMode: (
        groupJid: string,
        mode: WaGroupMemberShareGroupHistoryMode
    ) => Promise<void>
    /**
     * Sets the per-group disappearing-message lifetime in seconds (`0`
     * disables, `86400` = 24h, `604800` = 7d, `7776000` = 90d). Use this
     * to pick a duration; `setSetting('ephemeral', false)` is the explicit
     * disable path. `trigger` is the WhatsApp ephemeral-trigger code -
     * leave unset unless you know the protocol value to pass through.
     * Group admin operation.
     */
    readonly setEphemeralDuration: (
        groupJid: string,
        expirationSeconds: number,
        trigger?: number
    ) => Promise<void>
    /**
     * Adds the given participant JIDs to the group. The IQ as a whole
     * succeeds even when some invitees fail (blocked you, privacy settings
     * disallow add, already a member, etc.) - inspect the returned per-jid
     * results: `status: 'ok'` (code 200) means the invite landed,
     * everything else carries the server's HTTP-style `code`.
     */
    readonly addParticipants: (
        groupJid: string,
        participants: readonly string[]
    ) => Promise<readonly WaParticipantActionResult[]>
    /** Removes the given participant JIDs. Same per-jid result shape as {@link addParticipants}. */
    readonly removeParticipants: (
        groupJid: string,
        participants: readonly string[]
    ) => Promise<readonly WaParticipantActionResult[]>
    /** Promotes participants to admins. Same per-jid result shape as {@link addParticipants}. */
    readonly promoteParticipants: (
        groupJid: string,
        participants: readonly string[]
    ) => Promise<readonly WaParticipantActionResult[]>
    /** Demotes admins back to regular participants. Same per-jid result shape as {@link addParticipants}. */
    readonly demoteParticipants: (
        groupJid: string,
        participants: readonly string[]
    ) => Promise<readonly WaParticipantActionResult[]>
    /** Leaves one or more groups (batched in a single IQ). */
    readonly leaveGroup: (groupJids: readonly string[]) => Promise<void>
    /**
     * Fetches the current invite code for `groupJid` (the path segment of the
     * `chat.whatsapp.com/<code>` link) without rotating it. Group admin
     * operation - non-admins receive a `403 not-authorized` error. Use
     * {@link revokeInvite} to issue a fresh code and invalidate the old one.
     */
    readonly queryInviteCode: (groupJid: string) => Promise<string>
    /**
     * Revokes the current invite link. The server rotates the code
     * immediately - every previously-shared `chat.whatsapp.com/<code>` link
     * stops working. Returns the freshly-issued code.
     */
    readonly revokeInvite: (groupJid: string) => Promise<WaRevokeInviteResult>
    /**
     * Joins a group using its invite `code` (the path segment of a
     * `chat.whatsapp.com/<code>` URL). Throws if the code is expired,
     * revoked, the group is full, or the current account is already a
     * member. Returns the joined group's metadata.
     */
    readonly joinGroupViaInvite: (code: string) => Promise<WaGroupMetadata>
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
    /**
     * Joins a linked sub-group of a community the account already belongs
     * to. The IQ result carries no group payload (wa-web only validates the
     * envelope) - call {@link queryGroupMetadata} on `subGroupJid` after
     * this resolves to get the full metadata for the newly-joined group.
     */
    readonly joinLinkedGroup: (
        communityJid: string,
        subGroupJid: string,
        options?: { readonly type?: string }
    ) => Promise<void>
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

interface GroupCommons {
    readonly jid: string
    readonly subject: string
    readonly size?: number
    readonly creation?: number
    readonly subjectOwner?: string
    /** PN-form jid of the subject owner when the group is LID-addressed (`s_o_pn`). */
    readonly subjectOwnerPhoneNumber?: string
    /** Username handle of the subject owner when set (`s_o_username`). */
    readonly subjectOwnerUsername?: string
    readonly subjectTime?: number
    readonly addressingMode?: 'lid' | 'pn'
    readonly desc?: string
    readonly descId?: string
    readonly descOwner?: string
    readonly descTime?: number
    readonly ephemeral?: number
    readonly ephemeralTrigger?: number
    readonly linkedParentJid?: string
    readonly membershipApprovalEnabled: boolean
}

function findGroupTarget(node: BinaryNode): BinaryNode {
    if (node.tag === WA_NODE_TAGS.GROUP) return node
    const groupNode = findNodeChild(node, WA_NODE_TAGS.GROUP)
    if (!groupNode) {
        throw new Error(`expected <group> node in response, got <${node.tag}>`)
    }
    return groupNode
}

function parseGroupCommons(target: BinaryNode): GroupCommons {
    const attrs = target.attrs

    const descNode = findNodeChild(target, WA_NODE_TAGS.DESCRIPTION)
    const desc = descNode
        ? getNodeTextContent(findNodeChild(descNode, WA_NODE_TAGS.BODY))
        : undefined

    const ephemeralNode = findNodeChild(target, WA_NODE_TAGS.EPHEMERAL)

    const parentNode = findNodeChild(target, 'parent')
    const linkedParentNode = findNodeChild(target, 'linked_parent')

    const membershipApprovalNode = findNodeChild(target, WA_NODE_TAGS.MEMBERSHIP_APPROVAL_MODE)
    const groupJoinNode = membershipApprovalNode
        ? findNodeChild(membershipApprovalNode, WA_NODE_TAGS.GROUP_JOIN)
        : undefined

    const addressingModeRaw = attrs.addressing_mode
    const addressingMode: 'lid' | 'pn' | undefined =
        addressingModeRaw === 'lid' ? 'lid' : addressingModeRaw === 'pn' ? 'pn' : undefined

    const rawJid = attrs.id ?? attrs.jid ?? ''
    const jid = rawJid && !rawJid.includes('@') ? `${rawJid}@${WA_DEFAULTS.GROUP_SERVER}` : rawJid

    return {
        jid,
        subject: attrs.subject ?? '',
        size: attrs.size ? Number(attrs.size) : undefined,
        creation: attrs.creation ? Number(attrs.creation) : undefined,
        subjectOwner: attrs.s_o ?? attrs.subject_owner,
        subjectOwnerPhoneNumber: attrs.s_o_pn,
        subjectOwnerUsername: attrs.s_o_username,
        subjectTime: attrs.s_t ? Number(attrs.s_t) : undefined,
        addressingMode,
        desc,
        descId: descNode?.attrs.id,
        descOwner: descNode?.attrs.participant,
        descTime: descNode?.attrs.t ? Number(descNode.attrs.t) : undefined,
        ephemeral: ephemeralNode?.attrs.expiration
            ? Number(ephemeralNode.attrs.expiration)
            : undefined,
        ephemeralTrigger: ephemeralNode?.attrs.trigger
            ? Number(ephemeralNode.attrs.trigger)
            : undefined,
        linkedParentJid: linkedParentNode?.attrs.jid ?? parentNode?.attrs.jid,
        membershipApprovalEnabled: groupJoinNode?.attrs.state === 'on'
    }
}

function parseGroupMetadata(node: BinaryNode): WaGroupMetadata {
    const target = findGroupTarget(node)
    const attrs = target.attrs
    const commons = parseGroupCommons(target)

    const parentNode = findNodeChild(target, 'parent')
    const growthLockedNode = findNodeChild(target, 'growth_locked')
    const appealStatusNode = findNodeChild(target, 'appeal_status')
    const appealStatusType = appealStatusNode?.attrs.type
    const appealUpdateTimeNode = findNodeChild(target, 'appeal_update_time')
    const evolutionVersionNode = findNodeChild(target, 'evolution_version')
    const memberAddModeNode = findNodeChild(target, 'member_add_mode')
    const memberLinkModeNode = findNodeChild(target, 'member_link_mode')
    const memberShareNode = findNodeChild(target, 'member_share_group_history_mode')

    return {
        ...commons,
        owner: attrs.creator ?? attrs.owner,
        ownerPhoneNumber: attrs.creator_pn,
        ownerUsername: attrs.creator_username,
        ownerCountryCode: attrs.creator_country_code,
        restrict: hasNodeChild(target, WA_NODE_TAGS.LOCKED),
        announce: hasNodeChild(target, WA_NODE_TAGS.ANNOUNCEMENT),
        isParentGroup: parentNode !== undefined,
        isClosedCommunity:
            parentNode?.attrs.default_membership_approval_mode === 'request_required',
        defaultSubgroup: hasNodeChild(target, 'default_sub_group'),
        generalSubgroup: hasNodeChild(target, 'general_chat'),
        hiddenSubgroup: hasNodeChild(target, 'hidden_group'),
        allowNonAdminSubGroupCreation: hasNodeChild(target, 'allow_non_admin_sub_group_creation'),
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
        participants: parseGroupParticipants(target)
    }
}

function parseParticipantActionResult(p: BinaryNode): WaParticipantActionResult | null {
    const jid = p.attrs.jid
    if (!jid) return null
    const errorCode = p.attrs.error
    const code = errorCode ? Number(errorCode) : 200
    return {
        jid,
        status: code >= 200 && code < 300 ? 'ok' : 'error',
        code,
        phoneNumber: p.attrs.phone_number,
        username: p.attrs.username,
        raw: p
    }
}

function parseParticipantActionResults(
    iqResult: BinaryNode,
    action: WaGroupParticipantChangeAction
): readonly WaParticipantActionResult[] {
    const wrapper = findNodeChild(iqResult, action)
    const target = wrapper ?? iqResult
    const participantNodes = getNodeChildrenByTag(target, WA_NODE_TAGS.PARTICIPANT)
    const results: WaParticipantActionResult[] = new Array(participantNodes.length)
    let count = 0
    for (const p of participantNodes) {
        const parsed = parseParticipantActionResult(p)
        if (!parsed) continue
        results[count] = parsed
        count += 1
    }
    results.length = count
    return results
}

function parseGroupInviteInfo(node: BinaryNode): WaGroupInviteInfo {
    const target = findGroupTarget(node)
    const commons = parseGroupCommons(target)

    const participantNodes = getNodeChildrenByTag(target, WA_NODE_TAGS.PARTICIPANT)
    const participants: WaGroupInviteParticipantSample[] = new Array(participantNodes.length)
    let participantCount = 0
    for (const p of participantNodes) {
        const jidAttr = p.attrs.jid
        if (!jidAttr) continue
        participants[participantCount] = {
            jid: jidAttr,
            phoneNumber: p.attrs.phone_number,
            type: p.attrs.type
        }
        participantCount += 1
    }
    participants.length = participantCount

    return {
        ...commons,
        hiddenGroup: hasNodeChild(target, 'hidden_group'),
        defaultSubgroup: hasNodeChild(target, 'default_sub_group'),
        generalChat: hasNodeChild(target, 'general_chat'),
        hasCapi: hasNodeChild(target, 'capi'),
        participants
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
    },
    group_history: {
        on: WA_GROUP_NOTIFICATION_TAGS.GROUP_HISTORY,
        off: WA_GROUP_NOTIFICATION_TAGS.NO_GROUP_HISTORY
    },
    allow_admin_reports: {
        on: WA_GROUP_NOTIFICATION_TAGS.ALLOW_ADMIN_REPORTS,
        off: WA_GROUP_NOTIFICATION_TAGS.NOT_ALLOW_ADMIN_REPORTS
    },
    no_frequently_forwarded: {
        on: WA_GROUP_NOTIFICATION_TAGS.NO_FREQUENTLY_FORWARDED,
        off: WA_GROUP_NOTIFICATION_TAGS.FREQUENTLY_FORWARDED_OK
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
    ): Promise<readonly WaParticipantActionResult[]> => {
        const context = `group.${action}Participants`
        const node = buildGroupParticipantChangeIq({
            groupJid,
            action,
            participants
        })
        const result = await queryWithContext(context, node)
        assertIqResult(result, context)
        return parseParticipantActionResults(result, action)
    }

    const queryInvite = async (
        type: Parameters<typeof buildIqNode>[0],
        groupJid: string,
        context: string
    ): Promise<{ readonly result: BinaryNode; readonly code: string }> => {
        const node = buildIqNode(type, groupJid, WA_XMLNS.GROUPS, [
            { tag: WA_NODE_TAGS.INVITE, attrs: {} }
        ])
        const result = await queryWithContext(context, node)
        assertIqResult(result, context)
        const code = findNodeChild(result, WA_NODE_TAGS.INVITE)?.attrs.code
        if (!code) {
            throw new Error(`${context}: missing invite code in response`)
        }
        return { result, code }
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
            return parseGroupInviteInfo(result)
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
            return parseGroupMetadata(result)
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

        setMemberAddMode: async (groupJid, mode) => {
            const node = buildSetGroupMemberAddModeIq({ groupJid, mode })
            const result = await queryWithContext('group.setMemberAddMode', node, undefined, {
                groupJid,
                mode
            })
            assertIqResult(result, 'group.setMemberAddMode')
        },

        setMemberLinkMode: async (groupJid, mode) => {
            const node = buildSetGroupMemberLinkModeIq({ groupJid, mode })
            const result = await queryWithContext('group.setMemberLinkMode', node, undefined, {
                groupJid,
                mode
            })
            assertIqResult(result, 'group.setMemberLinkMode')
        },

        setMemberShareGroupHistoryMode: async (groupJid, mode) => {
            const node = buildSetGroupMemberShareGroupHistoryModeIq({ groupJid, mode })
            const result = await queryWithContext(
                'group.setMemberShareGroupHistoryMode',
                node,
                undefined,
                { groupJid, mode }
            )
            assertIqResult(result, 'group.setMemberShareGroupHistoryMode')
        },

        setEphemeralDuration: async (groupJid, expirationSeconds, trigger) => {
            if (
                !Number.isFinite(expirationSeconds) ||
                !Number.isSafeInteger(expirationSeconds) ||
                expirationSeconds < 0
            ) {
                throw new Error(`invalid expirationSeconds: ${expirationSeconds}`)
            }
            if (trigger !== undefined) {
                if (!Number.isFinite(trigger) || !Number.isSafeInteger(trigger) || trigger < 0) {
                    throw new Error(`invalid trigger: ${trigger}`)
                }
            }
            const node = buildSetGroupEphemeralIq({
                groupJid,
                expirationSeconds,
                ...(trigger === undefined ? {} : { trigger })
            })
            const result = await queryWithContext('group.setEphemeralDuration', node, undefined, {
                groupJid,
                expirationSeconds,
                ...(trigger === undefined ? {} : { trigger })
            })
            assertIqResult(result, 'group.setEphemeralDuration')
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
        },

        queryInviteCode: async (groupJid) => {
            const { code } = await queryInvite(WA_IQ_TYPES.GET, groupJid, 'group.queryInviteCode')
            return code
        },

        revokeInvite: async (groupJid) => {
            const { result, code } = await queryInvite(
                WA_IQ_TYPES.SET,
                groupJid,
                'group.revokeInvite'
            )
            const participantNodes = getNodeChildrenByTag(result, WA_NODE_TAGS.PARTICIPANT)
            const affectedParticipants: WaParticipantActionResult[] = new Array(
                participantNodes.length
            )
            let affectedCount = 0
            for (const p of participantNodes) {
                const parsed = parseParticipantActionResult(p)
                if (!parsed) continue
                affectedParticipants[affectedCount] = parsed
                affectedCount += 1
            }
            affectedParticipants.length = affectedCount
            return { code, affectedParticipants }
        },

        joinGroupViaInvite: async (code) => {
            const node = buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.GROUP_SERVER, WA_XMLNS.GROUPS, [
                { tag: WA_NODE_TAGS.INVITE, attrs: { code } }
            ])
            const result = await queryWithContext('group.joinViaInvite', node)
            assertIqResult(result, 'group.joinViaInvite')
            return parseGroupMetadata(result)
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
