import type {
    WaGroupEvent,
    WaGroupEventLinkedGroup,
    WaGroupEventMembershipRequest,
    WaGroupEventParticipant,
    WaGroupEventSubgroupSuggestion,
    WaIncomingUnhandledStanzaEvent
} from '@client/types'
import { WA_GROUP_NOTIFICATION_TAGS, WA_NOTIFICATION_TYPES } from '@protocol/constants'
import { WA_NODE_TAGS } from '@protocol/nodes'
import { findNodeChild, getNodeChildren, getNodeChildrenByTag } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { TEXT_DECODER } from '@util/bytes'
import { parseOptionalInt } from '@util/primitives'

export interface WaParseGroupNotificationResult {
    readonly events: readonly WaGroupEvent[]
    readonly unhandled: readonly WaIncomingUnhandledStanzaEvent[]
}

function readNodeTextContent(node: BinaryNode | undefined): string | undefined {
    if (!node) {
        return undefined
    }
    if (typeof node.content === 'string') {
        return node.content
    }
    if (node.content instanceof Uint8Array) {
        return TEXT_DECODER.decode(node.content)
    }
    return undefined
}

export function parseParticipants(node: BinaryNode): readonly WaGroupEventParticipant[] {
    return getNodeChildrenByTag(node, WA_NODE_TAGS.PARTICIPANT).map((participantNode) => ({
        jid: participantNode.attrs.jid,
        role: participantNode.attrs.type,
        lidJid: participantNode.attrs.lid,
        phoneJid: participantNode.attrs.phone_number,
        displayName: participantNode.attrs.display_name,
        username: participantNode.attrs.username,
        expirationSeconds: parseOptionalInt(participantNode.attrs.expiration)
    }))
}

function parseLinkedGroups(node: BinaryNode): readonly WaGroupEventLinkedGroup[] {
    return getNodeChildrenByTag(node, WA_NODE_TAGS.GROUP).map((groupNode) => ({
        jid: groupNode.attrs.jid,
        subject: groupNode.attrs.subject,
        subjectTimestampSeconds: parseOptionalInt(groupNode.attrs.s_t),
        hiddenSubgroup: findNodeChild(groupNode, 'hidden_group') !== undefined
    }))
}

function parseMembershipRequests(node: BinaryNode): readonly WaGroupEventMembershipRequest[] {
    return getNodeChildrenByTag(node, 'requested_user').map((requestNode) => ({
        jid: requestNode.attrs.jid,
        username: requestNode.attrs.username,
        phoneJid: requestNode.attrs.phone_number
    }))
}

function parseSubgroupSuggestion(node: BinaryNode): WaGroupEventSubgroupSuggestion | null {
    const subjectNode = findNodeChild(node, WA_NODE_TAGS.SUBJECT)
    const descriptionNode = findNodeChild(node, WA_NODE_TAGS.DESCRIPTION)
    const descriptionBodyNode = descriptionNode
        ? findNodeChild(descriptionNode, WA_NODE_TAGS.BODY)
        : undefined
    const isExistingGroupNode = findNodeChild(node, 'is_existing_group')
    const participantCountNode = findNodeChild(node, 'participant_count')

    return {
        groupJid: node.attrs.jid,
        ownerJid: node.attrs.creator,
        subject: readNodeTextContent(subjectNode),
        description: readNodeTextContent(descriptionBodyNode),
        timestampSeconds: parseOptionalInt(node.attrs.creation),
        isExistingGroup:
            readNodeTextContent(isExistingGroupNode) === undefined
                ? undefined
                : readNodeTextContent(isExistingGroupNode) === 'true',
        participantCount: participantCountNode
            ? parseOptionalInt(readNodeTextContent(participantCountNode))
            : undefined,
        reason: node.attrs.reason
    }
}

function parseSubgroupSuggestions(node: BinaryNode): readonly WaGroupEventSubgroupSuggestion[] {
    return getNodeChildrenByTag(node, 'sub_group_suggestion')
        .map(parseSubgroupSuggestion)
        .filter((suggestion): suggestion is WaGroupEventSubgroupSuggestion => suggestion !== null)
}

function createBaseGroupEvent(
    notificationNode: BinaryNode,
    actionNode: BinaryNode
): Omit<WaGroupEvent, 'action'> {
    return {
        rawNode: notificationNode,
        rawActionNode: actionNode,
        stanzaId: notificationNode.attrs.id,
        chatJid: notificationNode.attrs.from,
        stanzaType: notificationNode.attrs.type,
        groupJid: notificationNode.attrs.from,
        authorJid: notificationNode.attrs.participant,
        timestampSeconds: parseOptionalInt(notificationNode.attrs.t)
    }
}

function createUnhandledStanzaEvent(
    notificationNode: BinaryNode,
    reason: string
): WaIncomingUnhandledStanzaEvent {
    return {
        rawNode: notificationNode,
        stanzaId: notificationNode.attrs.id,
        chatJid: notificationNode.attrs.from,
        stanzaType: notificationNode.attrs.type,
        reason
    }
}

function parseCreateGroupAction(
    notificationNode: BinaryNode,
    actionNode: BinaryNode
): WaGroupEvent {
    const groupNode = findNodeChild(actionNode, WA_NODE_TAGS.GROUP)
    if (!groupNode) {
        throw new Error('create action missing group child')
    }
    const descriptionNode = findNodeChild(groupNode, WA_NODE_TAGS.DESCRIPTION)
    const descriptionBodyNode = descriptionNode
        ? findNodeChild(descriptionNode, WA_NODE_TAGS.BODY)
        : undefined
    const membershipApprovalModeNode = findNodeChild(
        groupNode,
        WA_NODE_TAGS.MEMBERSHIP_APPROVAL_MODE
    )
    const groupJoinNode = membershipApprovalModeNode
        ? findNodeChild(membershipApprovalModeNode, WA_NODE_TAGS.GROUP_JOIN)
        : undefined

    return {
        ...createBaseGroupEvent(notificationNode, actionNode),
        action: 'create',
        participants: parseParticipants(groupNode),
        subject: groupNode.attrs.subject,
        subjectOwnerJid: groupNode.attrs.s_o,
        description: readNodeTextContent(descriptionBodyNode),
        descriptionId: descriptionNode?.attrs.id,
        reason: actionNode.attrs.reason,
        contextGroupJid: actionNode.attrs.context_group_jid,
        details: {
            creatorJid: groupNode.attrs.creator,
            creatorPhoneJid: groupNode.attrs.creator_pn,
            creatorUsername: groupNode.attrs.creator_username,
            creatorCountryCode: groupNode.attrs.creator_country_code,
            creationSeconds: parseOptionalInt(groupNode.attrs.creation),
            announceEnabled: findNodeChild(groupNode, WA_NODE_TAGS.ANNOUNCEMENT) !== undefined,
            restrictEnabled: findNodeChild(groupNode, WA_NODE_TAGS.LOCKED) !== undefined,
            noFrequentlyForwardedEnabled:
                findNodeChild(groupNode, WA_GROUP_NOTIFICATION_TAGS.NO_FREQUENTLY_FORWARDED) !==
                undefined,
            supportEnabled: findNodeChild(groupNode, 'support') !== undefined,
            isParentGroup: findNodeChild(groupNode, 'parent') !== undefined,
            defaultSubgroup: findNodeChild(groupNode, 'default_sub_group') !== undefined,
            generalSubgroup: findNodeChild(groupNode, 'general_chat') !== undefined,
            hiddenSubgroup: findNodeChild(groupNode, 'hidden_group') !== undefined,
            groupSafetyCheck: findNodeChild(groupNode, 'group_safety_check') !== undefined,
            hasCapi: findNodeChild(groupNode, 'capi') !== undefined,
            limitSharingEnabled:
                findNodeChild(groupNode, WA_GROUP_NOTIFICATION_TAGS.LIMIT_SHARING_ENABLED) !==
                undefined,
            size: parseOptionalInt(groupNode.attrs.size),
            ephemeralDuration: parseOptionalInt(
                findNodeChild(groupNode, WA_NODE_TAGS.EPHEMERAL)?.attrs.expiration
            ),
            disappearingTrigger: findNodeChild(groupNode, WA_NODE_TAGS.EPHEMERAL)?.attrs.trigger,
            membershipApprovalEnabled: groupJoinNode?.attrs.state === 'on',
            allowNonAdminSubGroupCreation:
                findNodeChild(
                    groupNode,
                    WA_GROUP_NOTIFICATION_TAGS.ALLOW_NON_ADMIN_SUB_GROUP_CREATION
                ) !== undefined,
            linkedParentGroupJid:
                findNodeChild(groupNode, 'linked_parent')?.attrs.jid ??
                findNodeChild(groupNode, 'parent')?.attrs.jid
        }
    }
}

function parseGroupActionNode(
    notificationNode: BinaryNode,
    actionNode: BinaryNode
): WaGroupEvent | null {
    const baseEvent = createBaseGroupEvent(notificationNode, actionNode)
    switch (actionNode.tag) {
        case WA_GROUP_NOTIFICATION_TAGS.CREATE:
            return parseCreateGroupAction(notificationNode, actionNode)
        case WA_GROUP_NOTIFICATION_TAGS.ADD:
            return {
                ...baseEvent,
                action: 'add',
                participants: parseParticipants(actionNode),
                reason: actionNode.attrs.reason
            }
        case WA_GROUP_NOTIFICATION_TAGS.DELETE:
            return {
                ...baseEvent,
                action: 'delete',
                reason: actionNode.attrs.reason
            }
        case WA_GROUP_NOTIFICATION_TAGS.REMOVE:
            return {
                ...baseEvent,
                action: 'remove',
                participants: parseParticipants(actionNode),
                reason: actionNode.attrs.reason
            }
        case WA_GROUP_NOTIFICATION_TAGS.PROMOTE:
            return {
                ...baseEvent,
                action: 'promote',
                participants: parseParticipants(actionNode)
            }
        case WA_GROUP_NOTIFICATION_TAGS.DEMOTE:
            return {
                ...baseEvent,
                action: 'demote',
                participants: parseParticipants(actionNode)
            }
        case WA_GROUP_NOTIFICATION_TAGS.LINKED_GROUP_PROMOTE:
            return {
                ...baseEvent,
                action: 'linked_group_promote',
                participants: parseParticipants(actionNode),
                contextGroupJid: actionNode.attrs.jid
            }
        case WA_GROUP_NOTIFICATION_TAGS.LINKED_GROUP_DEMOTE:
            return {
                ...baseEvent,
                action: 'linked_group_demote',
                participants: parseParticipants(actionNode),
                contextGroupJid: actionNode.attrs.jid
            }
        case WA_GROUP_NOTIFICATION_TAGS.MODIFY:
            return {
                ...baseEvent,
                action: 'modify',
                participants: parseParticipants(actionNode)
            }
        case WA_GROUP_NOTIFICATION_TAGS.SUBJECT:
            return {
                ...baseEvent,
                action: 'subject',
                subject: actionNode.attrs.subject,
                subjectOwnerJid: actionNode.attrs.s_o,
                details: {
                    subjectOwnerPhoneJid: actionNode.attrs.s_o_pn,
                    subjectOwnerUsername: actionNode.attrs.s_o_username,
                    subjectTimestampSeconds: parseOptionalInt(actionNode.attrs.s_t)
                }
            }
        case WA_GROUP_NOTIFICATION_TAGS.DESCRIPTION: {
            const hasDeleteChild = findNodeChild(actionNode, 'delete') !== undefined
            const bodyNode = findNodeChild(actionNode, WA_NODE_TAGS.BODY)
            return {
                ...baseEvent,
                action: 'description',
                description: hasDeleteChild ? undefined : readNodeTextContent(bodyNode),
                descriptionId: actionNode.attrs.id,
                enabled: !hasDeleteChild
            }
        }
        case WA_GROUP_NOTIFICATION_TAGS.LOCKED:
            return {
                ...baseEvent,
                action: 'restrict',
                enabled: true,
                mode: actionNode.attrs.threshold
            }
        case WA_GROUP_NOTIFICATION_TAGS.UNLOCKED:
            return { ...baseEvent, action: 'restrict', enabled: false }
        case WA_GROUP_NOTIFICATION_TAGS.ANNOUNCEMENT:
            return { ...baseEvent, action: 'announce', enabled: true }
        case WA_GROUP_NOTIFICATION_TAGS.NOT_ANNOUNCEMENT:
            return { ...baseEvent, action: 'announce', enabled: false }
        case WA_GROUP_NOTIFICATION_TAGS.NO_FREQUENTLY_FORWARDED:
            return { ...baseEvent, action: 'no_frequently_forwarded', enabled: true }
        case WA_GROUP_NOTIFICATION_TAGS.FREQUENTLY_FORWARDED_OK:
            return { ...baseEvent, action: 'no_frequently_forwarded', enabled: false }
        case WA_GROUP_NOTIFICATION_TAGS.INVITE:
            return { ...baseEvent, action: 'invite', code: actionNode.attrs.code }
        case WA_GROUP_NOTIFICATION_TAGS.EPHEMERAL:
            return {
                ...baseEvent,
                action: 'ephemeral',
                expirationSeconds: parseOptionalInt(actionNode.attrs.expiration),
                mode: actionNode.attrs.trigger
            }
        case WA_GROUP_NOTIFICATION_TAGS.NOT_EPHEMERAL:
            return { ...baseEvent, action: 'ephemeral', expirationSeconds: 0 }
        case WA_GROUP_NOTIFICATION_TAGS.REVOKE:
            return {
                ...baseEvent,
                action: 'revoke_invite',
                participants: parseParticipants(actionNode)
            }
        case WA_GROUP_NOTIFICATION_TAGS.SUSPENDED:
            return { ...baseEvent, action: 'suspend', enabled: true }
        case WA_GROUP_NOTIFICATION_TAGS.UNSUSPENDED:
            return { ...baseEvent, action: 'suspend', enabled: false }
        case WA_GROUP_NOTIFICATION_TAGS.GROWTH_LOCKED:
            return {
                ...baseEvent,
                action: 'growth_locked',
                expirationSeconds: parseOptionalInt(actionNode.attrs.expiration),
                mode: actionNode.attrs.type
            }
        case WA_GROUP_NOTIFICATION_TAGS.GROWTH_UNLOCKED:
            return { ...baseEvent, action: 'growth_unlocked' }
        case WA_GROUP_NOTIFICATION_TAGS.LINK:
            return {
                ...baseEvent,
                action: 'link',
                mode: actionNode.attrs.link_type,
                linkedGroups: parseLinkedGroups(actionNode)
            }
        case WA_GROUP_NOTIFICATION_TAGS.UNLINK:
            return {
                ...baseEvent,
                action: 'unlink',
                mode: actionNode.attrs.unlink_type,
                reason: actionNode.attrs.unlink_reason,
                linkedGroups: parseLinkedGroups(actionNode)
            }
        case WA_GROUP_NOTIFICATION_TAGS.MEMBERSHIP_APPROVAL_MODE: {
            const groupJoinNode = findNodeChild(actionNode, WA_NODE_TAGS.GROUP_JOIN)
            return {
                ...baseEvent,
                action: 'membership_approval_mode',
                enabled: groupJoinNode?.attrs.state === 'on',
                details: {
                    triggered: actionNode.attrs.triggered
                }
            }
        }
        case WA_GROUP_NOTIFICATION_TAGS.MEMBERSHIP_APPROVAL_REQUEST:
            return {
                ...baseEvent,
                action: 'membership_approval_request',
                requestMethod: actionNode.attrs.request_method,
                contextGroupJid: actionNode.attrs.parent_group_jid
            }
        case WA_GROUP_NOTIFICATION_TAGS.CREATED_MEMBERSHIP_REQUESTS:
            return {
                ...baseEvent,
                action: 'created_membership_requests',
                requestMethod: actionNode.attrs.request_method,
                contextGroupJid: actionNode.attrs.parent_group_jid,
                membershipRequests: parseMembershipRequests(actionNode),
                details: {
                    suppressSystemMessage: actionNode.attrs.suppress_sys_msg === 'true'
                }
            }
        case WA_GROUP_NOTIFICATION_TAGS.REVOKED_MEMBERSHIP_REQUESTS:
            return {
                ...baseEvent,
                action: 'revoked_membership_requests',
                participants: parseParticipants(actionNode)
            }
        case WA_GROUP_NOTIFICATION_TAGS.ALLOW_NON_ADMIN_SUB_GROUP_CREATION:
            return { ...baseEvent, action: 'allow_non_admin_sub_group_creation', enabled: true }
        case WA_GROUP_NOTIFICATION_TAGS.NOT_ALLOW_NON_ADMIN_SUB_GROUP_CREATION:
            return { ...baseEvent, action: 'allow_non_admin_sub_group_creation', enabled: false }
        case WA_GROUP_NOTIFICATION_TAGS.ALLOW_ADMIN_REPORTS:
            return {
                ...baseEvent,
                action: 'allow_admin_reports',
                enabled: true,
                details: { triggered: actionNode.attrs.triggered }
            }
        case WA_GROUP_NOTIFICATION_TAGS.NOT_ALLOW_ADMIN_REPORTS:
            return {
                ...baseEvent,
                action: 'allow_admin_reports',
                enabled: false,
                details: { triggered: actionNode.attrs.triggered }
            }
        case WA_GROUP_NOTIFICATION_TAGS.REPORTS:
            return { ...baseEvent, action: 'admin_reports' }
        case WA_GROUP_NOTIFICATION_TAGS.CREATED_SUB_GROUP_SUGGESTION:
            return {
                ...baseEvent,
                action: 'created_sub_group_suggestion',
                subgroupSuggestions: parseSubgroupSuggestions(actionNode)
            }
        case WA_GROUP_NOTIFICATION_TAGS.REVOKED_SUB_GROUP_SUGGESTIONS:
            return {
                ...baseEvent,
                action: 'revoked_sub_group_suggestions',
                subgroupSuggestions: parseSubgroupSuggestions(actionNode)
            }
        case WA_GROUP_NOTIFICATION_TAGS.CHANGE_NUMBER:
            return {
                ...baseEvent,
                action: 'change_number',
                subgroupSuggestions: parseSubgroupSuggestions(actionNode),
                details: {
                    oldOwnerJid: notificationNode.attrs.participant,
                    newOwnerJid: actionNode.attrs.jid
                }
            }
        case WA_GROUP_NOTIFICATION_TAGS.MEMBER_ADD_MODE:
            return {
                ...baseEvent,
                action: 'member_add_mode',
                mode: readNodeTextContent(actionNode)
            }
        case WA_GROUP_NOTIFICATION_TAGS.AUTO_ADD_DISABLED:
            return { ...baseEvent, action: 'auto_add_disabled', enabled: true }
        case WA_GROUP_NOTIFICATION_TAGS.IS_CAPI_HOSTED_GROUP:
            return { ...baseEvent, action: 'is_capi_hosted_group', enabled: true }
        case WA_GROUP_NOTIFICATION_TAGS.GROUP_SAFETY_CHECK:
            return { ...baseEvent, action: 'group_safety_check', enabled: true }
        case WA_GROUP_NOTIFICATION_TAGS.LIMIT_SHARING_ENABLED:
            return { ...baseEvent, action: 'limit_sharing_enabled', enabled: true }
        case WA_GROUP_NOTIFICATION_TAGS.MISSING_PARTICIPANT_IDENTIFICATION:
            return { ...baseEvent, action: 'missing_participant_identification' }
        default:
            return null
    }
}

export function parseGroupNotificationEvents(
    notificationNode: BinaryNode
): WaParseGroupNotificationResult {
    if (
        notificationNode.tag !== WA_NODE_TAGS.NOTIFICATION ||
        notificationNode.attrs.type !== WA_NOTIFICATION_TYPES.GROUP
    ) {
        return {
            events: [],
            unhandled: []
        }
    }

    const events: WaGroupEvent[] = []
    const unhandled: WaIncomingUnhandledStanzaEvent[] = []
    for (const actionNode of getNodeChildren(notificationNode)) {
        try {
            const parsedEvent = parseGroupActionNode(notificationNode, actionNode)
            if (!parsedEvent) {
                unhandled.push(
                    createUnhandledStanzaEvent(
                        notificationNode,
                        `notification.${WA_NOTIFICATION_TYPES.GROUP}.${actionNode.tag}.not_supported`
                    )
                )
                continue
            }
            events.push(parsedEvent)
        } catch {
            unhandled.push(
                createUnhandledStanzaEvent(
                    notificationNode,
                    `notification.${WA_NOTIFICATION_TYPES.GROUP}.${actionNode.tag}.parse_failed`
                )
            )
        }
    }

    return {
        events,
        unhandled
    }
}
