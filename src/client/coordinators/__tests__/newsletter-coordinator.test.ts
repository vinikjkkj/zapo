import assert from 'node:assert/strict'
import test from 'node:test'

import {
    createNewsletterCoordinator,
    parseNewsletterMetadata
} from '@client/coordinators/WaNewsletterCoordinator'
import { createNoopLogger } from '@infra/log/types'
import { WA_NEWSLETTER_MUTE_TYPES, WA_NEWSLETTER_MUTE_VALUES } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'

interface MexCall {
    readonly node: BinaryNode
    readonly timeoutMs: number
}

interface MexMockResponse {
    readonly resultData: unknown
}

function createMexMockSocket(response: MexMockResponse): {
    socket: { query: (node: BinaryNode, timeoutMs: number) => Promise<BinaryNode> }
    calls: MexCall[]
} {
    const calls: MexCall[] = []
    const json = JSON.stringify({ data: response.resultData })
    const bytes = new TextEncoder().encode(json)
    return {
        calls,
        socket: {
            query: async (node, timeoutMs) => {
                calls.push({ node, timeoutMs })
                return Promise.resolve({
                    tag: 'iq',
                    attrs: { type: 'result', id: node.attrs.id ?? '1' },
                    content: [
                        {
                            tag: 'result',
                            attrs: {},
                            content: bytes
                        }
                    ]
                })
            }
        }
    }
}

interface SendNodeCall {
    readonly node: BinaryNode
}

function createSendNodeCollector(): {
    sendNode: (node: BinaryNode) => Promise<void>
    publishMessageNode: NonNullable<
        Parameters<typeof createNewsletterCoordinator>[0]['publishMessageNode']
    >
    calls: SendNodeCall[]
} {
    const calls: SendNodeCall[] = []
    return {
        calls,
        sendNode: (node) => {
            calls.push({ node })
            return Promise.resolve()
        },
        publishMessageNode: async (node) => {
            calls.push({ node })
            return {
                id: node.attrs.id ?? '',
                attempts: 1,
                ackNode: { tag: 'ack', attrs: { id: node.attrs.id ?? '', class: 'message' } },
                ack: { refreshLid: false }
            }
        }
    }
}

const TEST_LOGGER = createNoopLogger()
let stanzaCounter = 0
const generateStanzaId = async (): Promise<string> => {
    stanzaCounter += 1
    return `STANZA-${stanzaCounter}`
}

interface CoordinatorTestEnv {
    coordinator: ReturnType<typeof createNewsletterCoordinator>
    mexCalls: MexCall[]
    sendCalls: SendNodeCall[]
}

function createTestCoordinator(
    response: MexMockResponse,
    extra: Partial<Parameters<typeof createNewsletterCoordinator>[0]> = {}
): CoordinatorTestEnv {
    const mexMock = createMexMockSocket(response)
    const sender = createSendNodeCollector()
    const coordinator = createNewsletterCoordinator({
        mexSocket: mexMock.socket,
        sendNode: sender.sendNode,
        publishMessageNode: sender.publishMessageNode,
        generateStanzaId,
        logger: TEST_LOGGER,
        ...extra
    })
    return {
        coordinator,
        mexCalls: mexMock.calls,
        sendCalls: sender.calls
    }
}

test('parseNewsletterMetadata maps wa-web envelope into metadata', () => {
    const meta = parseNewsletterMetadata({
        id: '120363025343298869@newsletter',
        state: { type: 'ACTIVE' },
        thread_metadata: {
            creation_time: '1700000000',
            name: { text: 'Channel Name', update_time: '1700000010' },
            description: { text: 'Channel desc', update_time: '1700000020' },
            picture: { id: 'pic-id', direct_path: '/path' },
            preview: { id: 'pv-id', direct_path: '/preview' },
            invite: 'invite-code',
            handle: 'handle',
            subscribers_count: '1234',
            verification: 'VERIFIED'
        },
        viewer_metadata: {
            role: 'OWNER',
            settings: [
                {
                    type: WA_NEWSLETTER_MUTE_TYPES.ADMIN_ACTIVITY,
                    value: WA_NEWSLETTER_MUTE_VALUES.ON
                },
                {
                    type: WA_NEWSLETTER_MUTE_TYPES.FOLLOWER_ACTIVITY,
                    value: WA_NEWSLETTER_MUTE_VALUES.OFF
                }
            ]
        }
    })

    assert.equal(meta.jid, '120363025343298869@newsletter')
    assert.equal(meta.state, 'ACTIVE')
    assert.equal(meta.creationTime, 1_700_000_000)
    assert.equal(meta.name, 'Channel Name')
    assert.equal(meta.subscribersCount, 1234)
    assert.equal(meta.verification, 'VERIFIED')
    assert.equal(meta.viewerRole, 'OWNER')
    assert.equal(meta.mutedAdmin, true)
    assert.equal(meta.mutedFollower, false)
    assert.equal(meta.picture?.directPath, '/path')
    assert.equal(meta.preview?.id, 'pv-id')
})

test('coordinator follow/unfollow sends mex with newsletter_id', async () => {
    const env = createTestCoordinator({
        resultData: { xwa2_newsletter_join_v2: { id: '1', state: { type: 'ACTIVE' } } }
    })

    await env.coordinator.follow('120363025343298869@newsletter')
    assert.equal(env.mexCalls.length, 1)
    const queryNode = env.mexCalls[0].node.content?.[0] as BinaryNode | undefined
    assert.ok(queryNode)
    assert.equal(queryNode.attrs.query_id, '24404358912487870')
    const body = JSON.parse(queryNode.content as string)
    assert.deepEqual(body.variables, {
        newsletter_id: '120363025343298869@newsletter'
    })

    await env.coordinator.unfollow('120363025343298869@newsletter')
    assert.equal(env.mexCalls.length, 2)
    const leaveQuery = env.mexCalls[1].node.content?.[0] as BinaryNode | undefined
    assert.equal(leaveQuery?.attrs.query_id, '9767147403369991')
})

test('coordinator mute toggles MUTE_FOLLOWER_ACTIVITY by default', async () => {
    const env = createTestCoordinator({
        resultData: {
            xwa2_newsletter_update_user_setting: { id: '1', state: { type: 'ACTIVE' } }
        }
    })

    await env.coordinator.mute({
        newsletterJid: '120363025343298869@newsletter',
        mute: true
    })
    const queryNode = env.mexCalls[0].node.content?.[0] as BinaryNode | undefined
    const body = JSON.parse(queryNode!.content as string)
    assert.deepEqual(body.variables.input, {
        newsletter_id: '120363025343298869@newsletter',
        type: WA_NEWSLETTER_MUTE_TYPES.FOLLOWER_ACTIVITY,
        value: WA_NEWSLETTER_MUTE_VALUES.ON
    })

    await env.coordinator.mute({
        newsletterJid: '120363025343298869@newsletter',
        mute: false,
        type: 'admin'
    })
    const adminQuery = env.mexCalls[1].node.content?.[0] as BinaryNode | undefined
    const adminBody = JSON.parse(adminQuery?.content as string)
    assert.equal(adminBody.variables.input.type, WA_NEWSLETTER_MUTE_TYPES.ADMIN_ACTIVITY)
    assert.equal(adminBody.variables.input.value, WA_NEWSLETTER_MUTE_VALUES.OFF)
})

test('coordinator sendMessage(jid, "text") wraps as conversation proto', async () => {
    const env = createTestCoordinator({ resultData: null })
    const result = await env.coordinator.sendMessage(
        '120363025343298869@newsletter',
        'hello channel'
    )
    assert.ok(result.id.startsWith('STANZA-'))
    assert.equal(result.upload, undefined)
    assert.equal(env.sendCalls.length, 1)
    const stanza = env.sendCalls[0].node
    assert.equal(stanza.attrs.type, 'text')
    assert.equal(stanza.attrs.id, result.id)
    assert.ok(Array.isArray(stanza.content))
    assert.equal(stanza.content[0].tag, 'plaintext')
    assert.ok(stanza.content[0].content instanceof Uint8Array)
})

test('coordinator sendMessage with explicit stanzaId honors caller id', async () => {
    const env = createTestCoordinator({ resultData: null })
    const result = await env.coordinator.sendMessage('120363025343298869@newsletter', 'hello', {
        stanzaId: 'CUSTOM'
    })
    assert.equal(result.id, 'CUSTOM')
    assert.equal(env.sendCalls[0].node.attrs.id, 'CUSTOM')
})

test('coordinator listSubscribed parses metadata array', async () => {
    const env = createTestCoordinator({
        resultData: {
            xwa2_newsletter_subscribed: [
                {
                    id: 'a@newsletter',
                    state: { type: 'ACTIVE' },
                    thread_metadata: { name: { text: 'A' } },
                    viewer_metadata: { role: 'SUBSCRIBER' }
                },
                {
                    id: 'b@newsletter',
                    state: { type: 'GEOSUSPENDED' },
                    thread_metadata: { name: { text: 'B' } },
                    viewer_metadata: { role: 'OWNER' }
                }
            ]
        }
    })

    const list = await env.coordinator.listSubscribed()
    assert.equal(list.length, 2)
    assert.equal(list[0].name, 'A')
    assert.equal(list[1].state, 'GEOSUSPENDED')
    assert.equal(list[1].viewerRole, 'OWNER')
})

test('coordinator sendMessage with media uploads plaintext blob and emits media stanza', async () => {
    const responseBody = new TextEncoder().encode(
        JSON.stringify({
            url: 'https://media.example/blob',
            direct_path: '/v/abc',
            handle: 'H1'
        })
    )
    const captured: { url?: string; method?: string; body?: Uint8Array } = {}
    const mediaTransfer = {
        uploadStream: async (request: { url: string; method?: string; body: Uint8Array }) => {
            captured.url = request.url
            captured.method = request.method
            captured.body = request.body
            return { url: request.url, status: 200, ok: true, headers: {}, body: null }
        },
        readResponseBytes: async () => responseBody
    }
    const env = createTestCoordinator(
        { resultData: null },
        {
            mediaTransfer: mediaTransfer as unknown as Parameters<
                typeof createNewsletterCoordinator
            >[0]['mediaTransfer'],
            getMediaConn: async () => ({
                auth: 'AUTH',
                expiresAtMs: Date.now() + 60_000,
                hosts: [{ hostname: 'mmg.whatsapp.net', isFallback: false }]
            })
        }
    )

    const result = await env.coordinator.sendMessage('120363025343298869@newsletter', {
        type: 'image',
        media: new Uint8Array([7, 8, 9]),
        mimetype: 'image/jpeg',
        caption: 'hi'
    })
    assert.match(captured.url ?? '', /\/newsletter\/newsletter-image\//)
    assert.equal(captured.method, 'POST')
    assert.ok(result.upload)
    assert.equal(result.upload.url, 'https://media.example/blob')
    assert.equal(env.sendCalls.length, 1)
    const stanza = env.sendCalls[0].node
    assert.equal(stanza.attrs.type, 'media')
    assert.ok(Array.isArray(stanza.content))
    assert.equal(stanza.content[0].tag, 'plaintext')
    assert.equal(stanza.content[0].attrs.mediatype, 'image')
})

test('coordinator editMessage emits stanza with edit=3 and parent id', async () => {
    const env = createTestCoordinator({ resultData: null })

    const result = await env.coordinator.editMessage(
        '120363025343298869@newsletter',
        'PARENT',
        'edited text'
    )
    assert.equal(result.id, 'PARENT')
    assert.equal(env.sendCalls.length, 1)
    const stanza = env.sendCalls[0].node
    assert.equal(stanza.attrs.id, 'PARENT')
    assert.equal(stanza.attrs.edit, '3')
    assert.equal(stanza.attrs.type, 'text')
})

test('coordinator react/revoke/votePoll produce stanzas with parent server_id', async () => {
    const env = createTestCoordinator({ resultData: null })
    const newsletterJid = '120363025343298869@newsletter'

    const reactResult = await env.coordinator.react({
        newsletterJid,
        parentMessageServerId: 42,
        reactionCode: '1f44d'
    })
    assert.ok(reactResult.stanzaId)
    assert.equal(env.sendCalls[0].node.attrs.type, 'reaction')
    assert.equal(env.sendCalls[0].node.attrs.server_id, '42')

    const revokeResult = await env.coordinator.revoke({
        newsletterJid,
        originalMessageId: 'MSG-TO-REVOKE'
    })
    assert.equal(revokeResult.stanzaId, 'MSG-TO-REVOKE')
    assert.equal(env.sendCalls[1].node.attrs.id, 'MSG-TO-REVOKE')
    assert.equal(env.sendCalls[1].node.attrs.type, 'text')
    assert.equal(env.sendCalls[1].node.attrs.edit, '8')
    assert.equal(env.sendCalls[1].node.attrs.server_id, undefined)

    const voteResult = await env.coordinator.votePoll({
        newsletterJid,
        parentMessageServerId: 77,
        votes: [new Uint8Array([1])]
    })
    assert.ok(voteResult.stanzaId)
    assert.equal(env.sendCalls[2].node.attrs.type, 'poll')
    assert.equal(env.sendCalls[2].node.attrs.server_id, '77')
})

test('coordinator create auto-accepts creation tos when notice not yet accepted', async () => {
    const sentNodes: BinaryNode[] = []
    const env = createTestCoordinator(
        {
            resultData: {
                xwa2_newsletter_create: {
                    id: '120363025343298869@newsletter',
                    state: { type: 'ACTIVE' },
                    thread_metadata: { name: { text: 'New' } }
                }
            }
        },
        {
            getAbPropString: (name) =>
                name === 'newsletter_creation_tos_id' ? 'CREATE_TOS_ID' : '',
            queryWithContext: async (_ctx, node) => {
                sentNodes.push(node)
                if (node.attrs.type === 'get') {
                    return {
                        tag: 'iq',
                        attrs: { type: 'result' },
                        content: [
                            {
                                tag: 'tos',
                                attrs: { refresh: '86400' },
                                content: [
                                    {
                                        tag: 'notice',
                                        attrs: { id: 'CREATE_TOS_ID', state: 'false' }
                                    }
                                ]
                            }
                        ]
                    }
                }
                return { tag: 'iq', attrs: { type: 'result' } }
            }
        }
    )

    await env.coordinator.create({ name: 'New' })
    assert.equal(sentNodes.length, 2)
    assert.equal(sentNodes[0].attrs.type, 'get')
    assert.equal(sentNodes[0].attrs.xmlns, 'tos')
    assert.equal(sentNodes[1].attrs.type, 'set')
    assert.equal(sentNodes[1].attrs.xmlns, 'tos')
})

test('coordinator create skips tos accept when already accepted', async () => {
    const sentNodes: BinaryNode[] = []
    const env = createTestCoordinator(
        {
            resultData: {
                xwa2_newsletter_create: {
                    id: 'a@newsletter',
                    state: { type: 'ACTIVE' },
                    thread_metadata: { name: { text: 'A' } }
                }
            }
        },
        {
            getAbPropString: (name) =>
                name === 'newsletter_creation_tos_id' ? 'CREATE_TOS_ID' : '',
            queryWithContext: async (_ctx, node) => {
                sentNodes.push(node)
                return {
                    tag: 'iq',
                    attrs: { type: 'result' },
                    content: [
                        {
                            tag: 'tos',
                            attrs: { refresh: '86400' },
                            content: [
                                { tag: 'notice', attrs: { id: 'CREATE_TOS_ID', state: 'true' } }
                            ]
                        }
                    ]
                }
            }
        }
    )

    await env.coordinator.create({ name: 'A' })
    assert.equal(sentNodes.length, 1)
    assert.equal(sentNodes[0].attrs.type, 'get')
})

test('coordinator queryTosState/acceptTos send tos IQs with notice ids', async () => {
    const sentNodes: BinaryNode[] = []
    const env = createTestCoordinator(
        { resultData: null },
        {
            queryWithContext: async (_ctx, node) => {
                sentNodes.push(node)
                if (node.attrs.type === 'get') {
                    return {
                        tag: 'iq',
                        attrs: { type: 'result' },
                        content: [
                            {
                                tag: 'tos',
                                attrs: { refresh: '86400' },
                                content: [
                                    { tag: 'notice', attrs: { id: 'CREATE_TOS', state: 'true' } },
                                    { tag: 'notice', attrs: { id: 'INVITE_TOS', state: 'false' } }
                                ]
                            }
                        ]
                    }
                }
                return { tag: 'iq', attrs: { type: 'result' } }
            }
        }
    )

    const state = await env.coordinator.queryTosState(['CREATE_TOS', 'INVITE_TOS'])
    assert.equal(state.refreshSeconds, 86400)
    assert.deepEqual(state.notices, [
        { id: 'CREATE_TOS', accepted: true },
        { id: 'INVITE_TOS', accepted: false }
    ])
    assert.equal(sentNodes[0].attrs.xmlns, 'tos')
    assert.equal(sentNodes[0].attrs.type, 'get')

    await env.coordinator.acceptTos(['CREATE_TOS'])
    assert.equal(sentNodes[1].attrs.type, 'set')
    assert.ok(Array.isArray(sentNodes[1].content))
    const setRequest = (sentNodes[1].content as readonly BinaryNode[])[0]
    assert.equal(setRequest.tag, 'request')
    assert.equal(setRequest.attrs.type, 'session_update')
    assert.ok(Array.isArray(setRequest.content))
    assert.equal((setRequest.content as readonly BinaryNode[])[0].attrs.id, 'CREATE_TOS')
})

test('coordinator subscribeLiveUpdates sends set IQ to newsletter and parses duration', async () => {
    let receivedNode: BinaryNode | null = null
    const env = createTestCoordinator(
        { resultData: null },
        {
            queryWithContext: async (_ctx, node) => {
                receivedNode = node
                return {
                    tag: 'iq',
                    attrs: { type: 'result', id: '1' },
                    content: [
                        {
                            tag: 'live_updates',
                            attrs: { duration: '120' }
                        }
                    ]
                }
            }
        }
    )

    const result = await env.coordinator.subscribeLiveUpdates('120363025343298869@newsletter')
    assert.equal(result.durationSeconds, 120)
    const sentNode = receivedNode as unknown as BinaryNode
    assert.equal(sentNode.attrs.type, 'set')
    assert.equal(sentNode.attrs.to, '120363025343298869@newsletter')
    assert.equal(sentNode.attrs.xmlns, 'newsletter')
    assert.ok(Array.isArray(sentNode.content))
    assert.equal((sentNode.content as readonly BinaryNode[])[0].tag, 'live_updates')
})

test('coordinator subscribeLiveUpdates rejects invalid duration', async () => {
    const env = createTestCoordinator(
        { resultData: null },
        {
            queryWithContext: async () => ({
                tag: 'iq',
                attrs: { type: 'result' },
                content: [{ tag: 'live_updates', attrs: { duration: '5' } }]
            })
        }
    )
    await assert.rejects(
        () => env.coordinator.subscribeLiveUpdates('120363025343298869@newsletter'),
        /invalid duration/
    )
})

test('coordinator fetchMessages requires queryWithContext and forwards stanza', async () => {
    let receivedNode: BinaryNode | null = null
    const env = createTestCoordinator(
        { resultData: null },
        {
            queryWithContext: async (_ctx, node) => {
                receivedNode = node
                return {
                    tag: 'iq',
                    attrs: { type: 'result' }
                }
            }
        }
    )

    await env.coordinator.fetchMessages({
        newsletterJid: '120363025343298869@newsletter',
        count: 25,
        before: 1234
    })
    assert.ok(receivedNode)
    const node = receivedNode as unknown as BinaryNode
    assert.equal(node.attrs.xmlns, 'newsletter')
    assert.ok(Array.isArray(node.content))
    const messagesNode = (node.content as readonly BinaryNode[])[0]
    assert.equal(messagesNode.tag, 'messages')
    assert.equal(messagesNode.attrs.before, '1234')
})
