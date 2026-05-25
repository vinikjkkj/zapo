import assert from 'node:assert/strict'
import test from 'node:test'

import {
    parseAdminCapabilities,
    parseAdminInfo,
    parseDirectorySearch,
    parseDomainsPreviewable,
    parseFollowers,
    parsePendingInvites,
    parsePollVoters,
    parseReactionSenders,
    parseRecommended,
    parseSimilar
} from '@client/newsletter/parse'

test('parseAdminInfo extracts admin count and profile', () => {
    const info = parseAdminInfo({
        xwa2_newsletter_admin: {
            admin_count: 3,
            admin_profile: {
                id: 'admin-1',
                name: 'Admin Name',
                picture: { id: 'pic', direct_path: '/p' }
            }
        }
    })
    assert.equal(info.adminCount, 3)
    assert.deepEqual(info.adminProfile, {
        id: 'admin-1',
        name: 'Admin Name',
        pictureId: 'pic',
        pictureDirectPath: '/p'
    })

    const empty = parseAdminInfo({})
    assert.equal(empty.adminProfile, null)
})

test('parseAdminCapabilities returns set of capability strings', () => {
    const caps = parseAdminCapabilities({
        xwa2_newsletter_admin: { capabilities: ['ADMIN_PROFILE', 'INSIGHTS', 'THREAD_MENU'] }
    })
    assert.equal(caps.size, 3)
    assert.ok(caps.has('ADMIN_PROFILE'))
    assert.equal(parseAdminCapabilities({}).size, 0)
})

test('parsePendingInvites extracts user jids preferring pn over id', () => {
    const invites = parsePendingInvites({
        xwa2_newsletter_admin: {
            pending_admin_invites: [
                { user: { id: '1@lid', pn: '111@s.whatsapp.net' } },
                { user: { id: '2@lid' } },
                { user: undefined }
            ]
        }
    })
    assert.deepEqual(invites, ['111@s.whatsapp.net', '2@lid'])
})

test('parseFollowers maps edges into typed followers', () => {
    const page = parseFollowers({
        xwa2_newsletter_followers: {
            followers: {
                edges: [
                    {
                        role: 'OWNER',
                        follow_time: '1700000000',
                        node: {
                            id: 'a@lid',
                            display_name: 'A',
                            pn: '111@s.whatsapp.net',
                            username_info: { username: 'aaa' }
                        },
                        admin_profile: {
                            id: 'a',
                            name: 'A profile',
                            picture: { direct_path: '/a' }
                        }
                    },
                    {
                        role: 'ADMIN',
                        node: { id: 'b@lid' }
                    }
                ]
            }
        }
    })
    assert.equal(page.followers.length, 2)
    assert.equal(page.followers[0].id, 'a@lid')
    assert.equal(page.followers[0].role, 'OWNER')
    assert.equal(page.followers[0].username, 'aaa')
    assert.equal(page.followers[0].adminProfile?.name, 'A profile')
    assert.equal(page.followers[1].id, 'b@lid')
    assert.equal(page.followers[1].role, 'ADMIN')
    assert.equal(page.followers[1].adminProfile, null)
})

test('parseDirectorySearch and related parsers map results to metadata', () => {
    const envelope = {
        xwa2_newsletters_directory_search: {
            result: [
                {
                    id: 'a@newsletter',
                    state: { type: 'ACTIVE' },
                    thread_metadata: { name: { text: 'A' }, subscribers_count: '100' }
                },
                {
                    id: 'b@newsletter',
                    state: { type: 'GEOSUSPENDED' },
                    thread_metadata: { name: { text: 'B' } }
                }
            ],
            page_info: { hasNextPage: false }
        }
    }
    const search = parseDirectorySearch(envelope)
    assert.equal(search.results.length, 2)
    assert.equal(search.results[0].name, 'A')
    assert.equal(search.results[0].subscribersCount, 100)
    assert.equal(search.results[1].state, 'GEOSUSPENDED')
    assert.equal(search.pageInfo?.hasNextPage, false)

    const recommended = parseRecommended({
        xwa2_newsletters_recommended: {
            result: [{ id: 'r@newsletter', state: { type: 'ACTIVE' } }]
        }
    })
    assert.equal(recommended.length, 1)
    assert.equal(recommended[0].jid, 'r@newsletter')

    const similar = parseSimilar({
        xwa2_newsletters_similar: { result: [{ id: 's@newsletter', state: { type: 'ACTIVE' } }] }
    })
    assert.equal(similar.length, 1)
})

test('parseDomainsPreviewable builds map of domain to flag', () => {
    const map = parseDomainsPreviewable({
        xwa2_newsletter_message_integrity: {
            url_previews: [
                { url_domain: 'foo.com', is_previewable: true },
                { url_domain: 'bar.com', is_previewable: false }
            ]
        }
    })
    assert.equal(map.size, 2)
    assert.equal(map.get('foo.com'), true)
    assert.equal(map.get('bar.com'), false)
})

test('parseReactionSenders maps reaction code groups', () => {
    const reactions = parseReactionSenders({
        xwa2_newsletters_reaction_sender_list: {
            reactions: [
                {
                    reaction_code: '1f44d',
                    sender_list: {
                        edges: [
                            { node: { id: 'u1@lid', profile_pic_direct_path: '/p1' } },
                            { node: { id: 'u2@lid' } },
                            { node: {} }
                        ]
                    }
                }
            ]
        }
    })
    assert.equal(reactions.length, 1)
    assert.equal(reactions[0].reactionCode, '1f44d')
    assert.equal(reactions[0].senders.length, 2)
})

test('parsePollVoters returns map keyed by vote hash with seconds time', () => {
    const map = parsePollVoters({
        voter_list: {
            votes: [
                {
                    vote_hash: 'AAAA',
                    voter_list: {
                        edges: [{ node: { id: 'u1@lid' }, action_time: '1700000000000000' }]
                    }
                }
            ]
        }
    })
    assert.equal(map.size, 1)
    const voters = map.get('AAAA')
    assert.ok(voters)
    assert.equal(voters[0].id, 'u1@lid')
    assert.equal(voters[0].time, 1_700_000_000)
})
