import { parseParticipants as parseGroupEventParticipants } from '@client/events/group'
import { WA_DEFAULTS } from '@protocol/defaults'
import { WA_GROUP_PARTICIPANT_TYPES, type WaGroupSetting } from '@protocol/group'
import { WA_NODE_TAGS, WA_XMLNS } from '@protocol/nodes'
import {
    buildCreateGroupIq,
    buildGroupParticipantChangeIq,
    buildLeaveGroupIq
} from '@transport/node/builders/group'
import {
    findNodeChild,
    getNodeChildrenByTagFromChildren,
    hasNodeChild
} from '@transport/node/helpers'
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
    readonly participants: readonly WaGroupParticipant[]
}

export interface WaGroupCreateOptions {
    readonly description?: string
}

interface WaGroupCoordinatorOptions {
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
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
}

type WaGroupParticipantChangeAction = 'add' | 'remove' | 'promote' | 'demote'

function parseGroupParticipants(node: BinaryNode): readonly WaGroupParticipant[] {
    const parsed = parseGroupEventParticipants(node)
    const participants: WaGroupParticipant[] = []
    for (const participant of parsed) {
        if (!participant.jid) {
            continue
        }
        const type = participant.role ?? WA_GROUP_PARTICIPANT_TYPES.REGULAR
        participants.push({
            jid: participant.jid,
            type,
            isAdmin:
                type === WA_GROUP_PARTICIPANT_TYPES.ADMIN ||
                type === WA_GROUP_PARTICIPANT_TYPES.SUPERADMIN,
            isSuperAdmin: type === WA_GROUP_PARTICIPANT_TYPES.SUPERADMIN
        })
    }
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

    return {
        jid: attrs.id ?? attrs.jid ?? '',
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
        participants: parseGroupParticipants(target)
    }
}

const SETTING_TAGS: Readonly<
    Record<WaGroupSetting, { readonly on: string; readonly off: string }>
> = {
    announcement: { on: 'announcement', off: 'not_announcement' },
    restrict: { on: 'locked', off: 'unlocked' },
    ephemeral: { on: 'ephemeral', off: 'not_ephemeral' },
    membership_approval_mode: { on: 'membership_approval_mode', off: 'membership_approval_mode' }
}

export function createGroupCoordinator(options: WaGroupCoordinatorOptions): WaGroupCoordinator {
    const { queryWithContext } = options

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
            const metadata: WaGroupMetadata[] = []
            for (const groupNode of groupNodes) {
                metadata.push(parseGroupMetadata(groupNode))
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
                description: opts?.description
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
        }
    }
}
