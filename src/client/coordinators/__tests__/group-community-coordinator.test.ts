import assert from 'node:assert/strict'
import test from 'node:test'

import { createGroupCoordinator } from '@client/coordinators/WaGroupCoordinator'
import type { BinaryNode } from '@transport/types'

interface QueryCall {
    readonly context: string
    readonly node: BinaryNode
}

function createMockQuery(responses: readonly BinaryNode[]): {
    queryWithContext: Parameters<typeof createGroupCoordinator>[0]['queryWithContext']
    calls: QueryCall[]
} {
    let index = 0
    const calls: QueryCall[] = []
    const queryWithContext: Parameters<
        typeof createGroupCoordinator
    >[0]['queryWithContext'] = async (context, node) => {
        calls.push({ context, node })
        const response = responses[index]
        index += 1
        if (!response) throw new Error(`no mock response at index ${index - 1}`)
        return response
    }
    return { queryWithContext, calls }
}

function iqResult(content?: BinaryNode[]): BinaryNode {
    return {
        tag: 'iq',
        attrs: { type: 'result', id: '1' },
        ...(content ? { content } : {})
    }
}

test('createCommunity sends parent stanza with request_required by default', async () => {
    const groupResponse: BinaryNode = {
        tag: 'iq',
        attrs: { type: 'result', id: '1' },
        content: [
            {
                tag: 'group',
                attrs: { id: 'parent@g.us', subject: 'Comm' },
                content: [
                    {
                        tag: 'parent',
                        attrs: { default_membership_approval_mode: 'request_required' }
                    }
                ]
            }
        ]
    }
    const mock = createMockQuery([groupResponse])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    const meta = await coordinator.createCommunity('Comm', { description: 'Hi' })

    assert.equal(meta.isParentGroup, true)
    assert.equal(meta.isClosedCommunity, true)

    const create = (mock.calls[0].node.content as BinaryNode[])[0]
    const children = create.content as BinaryNode[]
    const parent = children.find((c) => c.tag === 'parent')
    assert.equal(parent?.attrs.default_membership_approval_mode, 'request_required')
    const description = children.find((c) => c.tag === 'description')
    assert.ok(description)
})

test('createCommunity with membershipApprovalMode=open omits the attr', async () => {
    const groupResponse: BinaryNode = {
        tag: 'iq',
        attrs: { type: 'result', id: '1' },
        content: [
            { tag: 'group', attrs: { id: 'open@g.us' }, content: [{ tag: 'parent', attrs: {} }] }
        ]
    }
    const mock = createMockQuery([groupResponse])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    await coordinator.createCommunity('Open', { membershipApprovalMode: 'open' })
    const create = (mock.calls[0].node.content as BinaryNode[])[0]
    const parent = (create.content as BinaryNode[]).find((c) => c.tag === 'parent')
    assert.equal(parent?.attrs.default_membership_approval_mode, undefined)
})

test('linkSubGroups parses success and per-group errors', async () => {
    const response: BinaryNode = iqResult([
        {
            tag: 'links',
            attrs: { link_type: 'sub_group' },
            content: [
                {
                    tag: 'link',
                    attrs: { link_type: 'sub_group' },
                    content: [
                        { tag: 'group', attrs: { jid: 'ok@g.us' } },
                        {
                            tag: 'group',
                            attrs: { jid: 'fail@g.us' },
                            content: [{ tag: 'error', attrs: { code: '403' } }]
                        }
                    ]
                }
            ]
        }
    ])
    const mock = createMockQuery([response])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    const result = await coordinator.linkSubGroups('parent@g.us', ['ok@g.us', 'fail@g.us'])
    assert.deepEqual(result.linkedJids, ['ok@g.us'])
    assert.deepEqual(result.failed, [{ jid: 'fail@g.us', error: 403 }])
})

test('unlinkSubGroups passes removeOrphanedMembers and parses results', async () => {
    const response: BinaryNode = iqResult([
        {
            tag: 'unlink',
            attrs: { unlink_type: 'sub_group' },
            content: [{ tag: 'group', attrs: { jid: 'a@g.us' } }]
        }
    ])
    const mock = createMockQuery([response])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    const result = await coordinator.unlinkSubGroups('parent@g.us', ['a@g.us'], {
        removeOrphanedMembers: true
    })
    assert.deepEqual(result.unlinkedJids, ['a@g.us'])
    const unlink = (mock.calls[0].node.content as BinaryNode[])[0]
    const groupNode = (unlink.content as BinaryNode[])[0]
    assert.equal(groupNode.attrs.remove_orphaned_members, 'true')
})

test('deactivateCommunity sends delete_parent', async () => {
    const mock = createMockQuery([iqResult()])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })
    await coordinator.deactivateCommunity('parent@g.us')
    const root = (mock.calls[0].node.content as BinaryNode[])[0]
    assert.equal(root.tag, 'delete_parent')
})

test('setMemberAddMode shapes member_add_mode IQ with text content', async () => {
    const mock = createMockQuery([iqResult(), iqResult()])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    await coordinator.setMemberAddMode('120363@g.us', 'all_member_add')
    await coordinator.setMemberAddMode('120363@g.us', 'admin_add')

    assert.equal(mock.calls.length, 2)
    assert.equal(mock.calls[0].context, 'group.setMemberAddMode')
    assert.equal(mock.calls[0].node.attrs.to, '120363@g.us')
    assert.equal(mock.calls[0].node.attrs.type, 'set')
    assert.equal(mock.calls[0].node.attrs.xmlns, 'w:g2')
    const firstChild = (mock.calls[0].node.content as BinaryNode[])[0]
    assert.equal(firstChild.tag, 'member_add_mode')
    assert.equal(firstChild.content, 'all_member_add')
    const secondChild = (mock.calls[1].node.content as BinaryNode[])[0]
    assert.equal(secondChild.content, 'admin_add')
})

test('setMemberLinkMode and setMemberShareGroupHistoryMode shape mode IQs', async () => {
    const mock = createMockQuery([iqResult(), iqResult()])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    await coordinator.setMemberLinkMode('120363@g.us', 'admin_link')
    await coordinator.setMemberShareGroupHistoryMode('120363@g.us', 'all_member_share')

    assert.equal(mock.calls[0].context, 'group.setMemberLinkMode')
    const linkChild = (mock.calls[0].node.content as BinaryNode[])[0]
    assert.equal(linkChild.tag, 'member_link_mode')
    assert.equal(linkChild.content, 'admin_link')

    assert.equal(mock.calls[1].context, 'group.setMemberShareGroupHistoryMode')
    const shareChild = (mock.calls[1].node.content as BinaryNode[])[0]
    assert.equal(shareChild.tag, 'member_share_group_history_mode')
    assert.equal(shareChild.content, 'all_member_share')
})

test('setEphemeralDuration shapes ephemeral IQ with expiration attr', async () => {
    const mock = createMockQuery([iqResult(), iqResult()])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    await coordinator.setEphemeralDuration('120363@g.us', 86400)
    await coordinator.setEphemeralDuration('120363@g.us', 604800, 1)

    const first = (mock.calls[0].node.content as BinaryNode[])[0]
    assert.equal(first.tag, 'ephemeral')
    assert.equal(first.attrs.expiration, '86400')
    assert.equal(first.attrs.trigger, undefined)

    const second = (mock.calls[1].node.content as BinaryNode[])[0]
    assert.equal(second.attrs.expiration, '604800')
    assert.equal(second.attrs.trigger, '1')

    await assert.rejects(
        () => coordinator.setEphemeralDuration('120363@g.us', -1),
        /invalid expirationSeconds/
    )
    await assert.rejects(
        () => coordinator.setEphemeralDuration('120363@g.us', 86400, -1),
        /invalid trigger/
    )
})

test('setSetting toggles new group_history / allow_admin_reports / no_frequently_forwarded', async () => {
    const mock = createMockQuery([
        iqResult(),
        iqResult(),
        iqResult(),
        iqResult(),
        iqResult(),
        iqResult()
    ])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    await coordinator.setSetting('120363@g.us', 'group_history', true)
    await coordinator.setSetting('120363@g.us', 'group_history', false)
    await coordinator.setSetting('120363@g.us', 'allow_admin_reports', true)
    await coordinator.setSetting('120363@g.us', 'allow_admin_reports', false)
    await coordinator.setSetting('120363@g.us', 'no_frequently_forwarded', true)
    await coordinator.setSetting('120363@g.us', 'no_frequently_forwarded', false)

    const tags = mock.calls.map((c) => (c.node.content as BinaryNode[])[0].tag)
    assert.deepEqual(tags, [
        'group_history',
        'no_group_history',
        'allow_admin_reports',
        'not_allow_admin_reports',
        'no_frequently_forwarded',
        'frequently_forwarded_ok'
    ])
})

test('queryGroupInviteInfo parses subject/owner/ephemeral/description/participants', async () => {
    const response: BinaryNode = iqResult([
        {
            tag: 'group',
            attrs: {
                id: '120363@g.us',
                subject: 'TESTE',
                size: '3',
                creation: '1700000000',
                s_o: 'owner@lid',
                s_o_pn: 'owner@s.whatsapp.net',
                s_t: '1710000000',
                addressing_mode: 'lid'
            },
            content: [
                { tag: 'ephemeral', attrs: { expiration: '86400' } },
                {
                    tag: 'participant',
                    attrs: { jid: 'a@lid', phone_number: 'a@s.whatsapp.net', type: 'admin' }
                },
                {
                    tag: 'description',
                    attrs: { id: 'D1', t: '1715000000' },
                    content: [{ tag: 'body', attrs: {}, content: new Uint8Array([114, 101, 103]) }]
                }
            ]
        }
    ])
    const mock = createMockQuery([response])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    const info = await coordinator.queryGroupInviteInfo('CODE')

    assert.equal(info.jid, '120363@g.us')
    assert.equal(info.subject, 'TESTE')
    assert.equal(info.size, 3)
    assert.equal(info.creation, 1700000000)
    assert.equal(info.subjectOwner, 'owner@lid')
    assert.equal(info.subjectOwnerPhoneNumber, 'owner@s.whatsapp.net')
    assert.equal(info.subjectTime, 1710000000)
    assert.equal(info.addressingMode, 'lid')
    assert.equal(info.ephemeral, 86400)
    assert.equal(info.desc, 'reg')
    assert.equal(info.descId, 'D1')
    assert.equal(info.descTime, 1715000000)
    assert.equal(info.participants.length, 1)
    assert.equal(info.participants[0].jid, 'a@lid')
    assert.equal(info.participants[0].phoneNumber, 'a@s.whatsapp.net')
    assert.equal(info.participants[0].type, 'admin')
})

test('revokeInvite returns new code and any affected participants', async () => {
    const responseWithAffected = iqResult([
        { tag: 'invite', attrs: { code: 'NEW123' } },
        {
            tag: 'participant',
            attrs: {
                jid: 'evicted@lid',
                error: '404',
                phone_number: 'evicted@s.whatsapp.net'
            }
        }
    ])
    const responseEmpty = iqResult([{ tag: 'invite', attrs: { code: 'NEW456' } }])
    const mock = createMockQuery([responseWithAffected, responseEmpty])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    const r1 = await coordinator.revokeInvite('120363@g.us')
    assert.equal(r1.code, 'NEW123')
    assert.equal(r1.affectedParticipants.length, 1)
    assert.equal(r1.affectedParticipants[0].jid, 'evicted@lid')
    assert.equal(r1.affectedParticipants[0].code, 404)
    assert.equal(r1.affectedParticipants[0].status, 'error')
    assert.equal(r1.affectedParticipants[0].phoneNumber, 'evicted@s.whatsapp.net')

    const r2 = await coordinator.revokeInvite('120363@g.us')
    assert.equal(r2.code, 'NEW456')
    assert.deepEqual(r2.affectedParticipants, [])
})

test('participant action returns per-jid result with status/code/phoneNumber/username', async () => {
    const response = iqResult([
        {
            tag: 'add',
            attrs: {},
            content: [
                {
                    tag: 'participant',
                    attrs: {
                        jid: 'ok@lid',
                        phone_number: 'ok@s.whatsapp.net',
                        username: 'maria'
                    }
                },
                { tag: 'participant', attrs: { jid: 'fail@lid', error: '403' } }
            ]
        }
    ])
    const mock = createMockQuery([response])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    const results = await coordinator.addParticipants('120363@g.us', ['ok@lid', 'fail@lid'])
    assert.equal(results.length, 2)
    assert.equal(results[0].jid, 'ok@lid')
    assert.equal(results[0].status, 'ok')
    assert.equal(results[0].code, 200)
    assert.equal(results[0].phoneNumber, 'ok@s.whatsapp.net')
    assert.equal(results[0].username, 'maria')
    assert.equal(results[1].jid, 'fail@lid')
    assert.equal(results[1].status, 'error')
    assert.equal(results[1].code, 403)
})

test('queryLinkedGroupsParticipants returns flattened participants', async () => {
    const response: BinaryNode = iqResult([
        {
            tag: 'linked_groups_participants',
            attrs: {},
            content: [
                { tag: 'participant', attrs: { jid: 'u1@s.whatsapp.net', type: 'admin' } },
                { tag: 'participant', attrs: { jid: 'u2@s.whatsapp.net' } }
            ]
        }
    ])
    const mock = createMockQuery([response])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    const participants = await coordinator.queryLinkedGroupsParticipants('parent@g.us')
    assert.equal(participants.length, 2)
    assert.equal(participants[0].isAdmin, true)
    assert.equal(participants[1].isAdmin, false)
})

test('setSetting toggles allow_non_admin_sub_group_creation enable/disable', async () => {
    const mock = createMockQuery([iqResult(), iqResult()])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    await coordinator.setSetting('parent@g.us', 'allow_non_admin_sub_group_creation', true)
    await coordinator.setSetting('parent@g.us', 'allow_non_admin_sub_group_creation', false)

    const enableTag = (mock.calls[0].node.content as BinaryNode[])[0].tag
    const disableTag = (mock.calls[1].node.content as BinaryNode[])[0].tag
    assert.equal(enableTag, 'allow_non_admin_sub_group_creation')
    assert.equal(disableTag, 'not_allow_non_admin_sub_group_creation')
})

test('fetchSubGroups parses default + linked subgroups via mex', async () => {
    const json = JSON.stringify({
        data: {
            xwa2_group_query_by_id: {
                default_sub_group: {
                    id: 'announce@g.us',
                    subject: { value: 'Announcements', creation_time: '1700000000' },
                    properties: null,
                    membership_approval_requests: null
                },
                sub_groups: {
                    edges: [
                        {
                            node: {
                                id: 'sub1@g.us',
                                subject: { value: 'Sub 1', creation_time: '1700000010' },
                                properties: {
                                    general_chat: true,
                                    membership_approval_mode_enabled: false,
                                    hidden_group: false
                                },
                                membership_approval_requests: { total_count: '2' }
                            }
                        },
                        {
                            node: {
                                id: 'sub2@g.us',
                                subject: { value: 'Sub 2', creation_time: '1700000020' },
                                properties: {
                                    general_chat: false,
                                    membership_approval_mode_enabled: true,
                                    hidden_group: true
                                },
                                membership_approval_requests: { total_count: '0' }
                            }
                        }
                    ]
                }
            }
        }
    })
    const bytes = new TextEncoder().encode(json)
    const mexResponse: BinaryNode = {
        tag: 'iq',
        attrs: { type: 'result', id: '1' },
        content: [{ tag: 'result', attrs: {}, content: bytes }]
    }
    const mexCalls: BinaryNode[] = []
    const mexSocket = {
        query: async (node: BinaryNode) => {
            mexCalls.push(node)
            return Promise.resolve(mexResponse)
        }
    }

    const mock = createMockQuery([])
    const coordinator = createGroupCoordinator({
        queryWithContext: mock.queryWithContext,
        mexSocket
    })

    const result = await coordinator.fetchSubGroups('parent@g.us')
    assert.equal(result.communityJid, 'parent@g.us')
    assert.equal(result.announcementGroup?.jid, 'announce@g.us')
    assert.equal(result.announcementGroup?.defaultSubgroup, true)
    assert.equal(result.subGroups.length, 2)
    assert.equal(result.subGroups[0].generalSubgroup, true)
    assert.equal(result.subGroups[0].pendingMembershipRequests, 2)
    assert.equal(result.subGroups[1].hiddenSubgroup, true)
    assert.equal(result.subGroups[1].membershipApprovalEnabled, true)

    const queryNode = mexCalls[0].content?.[0] as BinaryNode | undefined
    assert.ok(queryNode)
    assert.equal(queryNode.attrs.query_id, '9935467776504344')
    const body = JSON.parse(queryNode.content as string)
    assert.equal(body.variables.group_id, 'parent@g.us')
    assert.equal(body.variables.query_context, 'INTERACTIVE')
})

test('fetchSubGroups throws when mex transport not configured', async () => {
    const mock = createMockQuery([])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })
    await assert.rejects(() => coordinator.fetchSubGroups('parent@g.us'), /mex transport/)
})

test('queryGroupMetadata extracts the extended field set', async () => {
    const groupResponse: BinaryNode = {
        tag: 'iq',
        attrs: { type: 'result', id: '1' },
        content: [
            {
                tag: 'group',
                attrs: {
                    id: '120363@g.us',
                    subject: 'Sample',
                    addressing_mode: 'lid',
                    creator: 'creator@lid',
                    creation: '1700000000',
                    s_t: '1700000010',
                    s_o: 'subjowner@lid',
                    size: '5'
                },
                content: [
                    { tag: 'announcement', attrs: {} },
                    { tag: 'no_frequently_forwarded', attrs: {} },
                    { tag: 'incognito', attrs: {} },
                    {
                        tag: 'ephemeral',
                        attrs: { expiration: '604800', trigger: '4' }
                    },
                    {
                        tag: 'membership_approval_mode',
                        attrs: {},
                        content: [{ tag: 'group_join', attrs: { state: 'on' } }]
                    },
                    {
                        tag: 'growth_locked',
                        attrs: { type: 'invite', expiration: '1700099999' }
                    },
                    { tag: 'appeal_status', attrs: { type: 'in_review' } },
                    { tag: 'appeal_update_time', attrs: { value: '1700000050' } },
                    { tag: 'evolution_version', attrs: { value: '7' } },
                    { tag: 'member_add_mode', attrs: {}, content: 'admin_add' },
                    {
                        tag: 'member_share_group_history_mode',
                        attrs: {},
                        content: 'all_member_share'
                    },
                    {
                        tag: 'participant',
                        attrs: {
                            jid: '111@lid',
                            type: 'admin',
                            phone_number: '5511999999999@s.whatsapp.net',
                            display_name: 'Alice'
                        }
                    }
                ]
            }
        ]
    }
    const mock = createMockQuery([groupResponse])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    const meta = await coordinator.queryGroupMetadata('120363@g.us')

    assert.equal(meta.addressingMode, 'lid')
    assert.equal(meta.announce, true)
    assert.equal(meta.noFrequentlyForwarded, true)
    assert.equal(meta.incognito, true)
    assert.equal(meta.ephemeral, 604800)
    assert.equal(meta.ephemeralTrigger, 4)
    assert.equal(meta.membershipApprovalEnabled, true)
    assert.equal(meta.growthLockedExpiration, 1700099999)
    assert.equal(meta.appealStatus, 'in_review')
    assert.equal(meta.appealUpdateTime, 1700000050)
    assert.equal(meta.evolutionVersion, 7)
    assert.equal(meta.memberAddMode, 'admin_add')
    assert.equal(meta.memberShareGroupHistoryMode, 'all_member_share')
    assert.equal(meta.participants.length, 1)
    assert.equal(meta.participants[0].phoneNumber, '5511999999999@s.whatsapp.net')
    assert.equal(meta.participants[0].displayName, 'Alice')
    assert.equal(meta.participants[0].isAdmin, true)
})

test('queryMembershipApprovalRequests parses pending requests', async () => {
    const response: BinaryNode = iqResult([
        {
            tag: 'membership_approval_requests',
            attrs: {},
            content: [
                {
                    tag: 'membership_approval_request',
                    attrs: {
                        jid: 'requester1@lid',
                        request_time: '1700000000',
                        request_method: 'invitelink'
                    }
                },
                {
                    tag: 'membership_approval_request',
                    attrs: {
                        jid: 'requester2@lid',
                        requestor: 'inviter@lid',
                        requestor_pn: '5511000000000@s.whatsapp.net',
                        request_time: '1700000005'
                    }
                }
            ]
        }
    ])
    const mock = createMockQuery([response])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    const requests = await coordinator.queryMembershipApprovalRequests('parent@g.us')
    assert.equal(requests.length, 2)
    assert.equal(requests[0].jid, 'requester1@lid')
    assert.equal(requests[0].requestMethod, 'invitelink')
    assert.equal(requests[1].requestor, 'inviter@lid')
    assert.equal(requests[1].requestorPhone, '5511000000000@s.whatsapp.net')
    assert.equal(requests[1].requestTime, 1700000005)
})

test('approve/reject/cancel/joinLinkedGroup send the correct stanza shape', async () => {
    const mock = createMockQuery([iqResult(), iqResult(), iqResult(), iqResult()])
    const coordinator = createGroupCoordinator({ queryWithContext: mock.queryWithContext })

    await coordinator.approveMembershipRequests('parent@g.us', ['a@lid'])
    await coordinator.rejectMembershipRequests('parent@g.us', ['b@lid'])
    await coordinator.cancelMembershipRequests('parent@g.us', ['c@lid'])
    await coordinator.joinLinkedGroup('parent@g.us', 'sub@g.us')

    const approveRoot = (mock.calls[0].node.content as BinaryNode[])[0]
    assert.equal(approveRoot.tag, 'membership_requests_action')
    const approveChild = (approveRoot.content as BinaryNode[]).find((c) => c.tag === 'approve')
    assert.ok(approveChild)
    assert.equal((approveChild.content as BinaryNode[])[0].attrs.jid, 'a@lid')

    const rejectRoot = (mock.calls[1].node.content as BinaryNode[])[0]
    const rejectChild = (rejectRoot.content as BinaryNode[]).find((c) => c.tag === 'reject')
    assert.equal((rejectChild?.content as BinaryNode[])[0].attrs.jid, 'b@lid')

    const cancelRoot = (mock.calls[2].node.content as BinaryNode[])[0]
    assert.equal(cancelRoot.tag, 'cancel_membership_requests')
    assert.equal((cancelRoot.content as BinaryNode[])[0].attrs.jid, 'c@lid')

    const joinRoot = (mock.calls[3].node.content as BinaryNode[])[0]
    assert.equal(joinRoot.tag, 'join_linked_group')
    assert.equal(joinRoot.attrs.jid, 'sub@g.us')
})
