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
