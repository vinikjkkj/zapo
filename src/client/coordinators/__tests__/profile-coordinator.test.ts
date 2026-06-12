import assert from 'node:assert/strict'
import test from 'node:test'

import { createProfileCoordinator } from '@client/coordinators/WaProfileCoordinator'
import { createNoopLogger } from '@infra/log/types'
import { WA_XMLNS } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'
import { TEXT_DECODER, TEXT_ENCODER } from '@util/bytes'

function createIqResult(content?: readonly BinaryNode[]): BinaryNode {
    return {
        tag: 'iq',
        attrs: { type: 'result' },
        content
    }
}

test('profile coordinator gets profile picture url', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
        readonly contextData?: Readonly<Record<string, unknown>>
    }> = []

    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async (context, node, _timeoutMs, contextData) => {
            calls.push({ context, node, contextData })
            return createIqResult([
                {
                    tag: 'picture',
                    attrs: {
                        url: 'https://pps.whatsapp.net/v/example.jpg',
                        direct_path: '/v/t62/example',
                        id: '12345',
                        type: 'preview'
                    }
                }
            ])
        }
    })

    const result = await coordinator.getProfilePicture('5511999999999@s.whatsapp.net')

    assert.deepEqual(result, {
        url: 'https://pps.whatsapp.net/v/example.jpg',
        directPath: '/v/t62/example',
        id: '12345',
        type: 'preview'
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].context, 'profile.getPicture')
    assert.equal(calls[0].node.attrs.type, 'get')
    assert.equal(calls[0].node.attrs.xmlns, WA_XMLNS.PROFILE_PICTURE)
    assert.equal(calls[0].node.attrs.target, '5511999999999@s.whatsapp.net')
    assert.deepEqual(calls[0].contextData, {
        jid: '5511999999999@s.whatsapp.net',
        type: 'preview'
    })
})

test('profile coordinator returns empty result when no picture node', async () => {
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async () => createIqResult()
    })

    const result = await coordinator.getProfilePicture('5511999999999@s.whatsapp.net')
    assert.deepEqual(result, {})
})

test('profile coordinator gets full image picture with existing id', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
    }> = []

    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async (context, node) => {
            calls.push({ context, node })
            return createIqResult([
                {
                    tag: 'picture',
                    attrs: {
                        url: 'https://pps.whatsapp.net/v/full.jpg',
                        id: '99999',
                        type: 'image'
                    }
                }
            ])
        }
    })

    await coordinator.getProfilePicture('5511999999999@s.whatsapp.net', 'image', '12345')

    assert.equal(calls.length, 1)
    const pictureNode = (calls[0].node.content as readonly BinaryNode[])[0]
    assert.equal(pictureNode.attrs.type, 'image')
    assert.equal(pictureNode.attrs.query, 'url')
    assert.equal(pictureNode.attrs.id, '12345')
})

test('profile coordinator sets profile picture and returns id', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
        readonly contextData?: Readonly<Record<string, unknown>>
    }> = []

    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async (context, node, _timeoutMs, contextData) => {
            calls.push({ context, node, contextData })
            return createIqResult([
                {
                    tag: 'picture',
                    attrs: { id: '67890' }
                }
            ])
        }
    })

    const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    const id = await coordinator.setProfilePicture(imageBytes)

    assert.equal(id, '67890')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].context, 'profile.setPicture')
    assert.equal(calls[0].node.attrs.type, 'set')
    assert.equal(calls[0].node.attrs.xmlns, WA_XMLNS.PROFILE_PICTURE)
    assert.deepEqual(calls[0].contextData, { targetJid: undefined, size: 4 })
    const pictureNode = (calls[0].node.content as readonly BinaryNode[])[0]
    assert.equal(pictureNode.tag, 'picture')
    assert.equal(pictureNode.attrs.type, 'image')
    assert.ok(pictureNode.content instanceof Uint8Array)
})

test('profile coordinator sets group profile picture with target jid', async () => {
    const calls: Array<{ readonly node: BinaryNode }> = []

    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async (_context, node) => {
            calls.push({ node })
            return createIqResult([{ tag: 'picture', attrs: { id: '111' } }])
        }
    })

    await coordinator.setProfilePicture(new Uint8Array([1, 2, 3]), '120363@g.us')

    assert.equal(calls[0].node.attrs.target, '120363@g.us')
})

test('profile coordinator deletes profile picture', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
    }> = []

    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async (context, node) => {
            calls.push({ context, node })
            return createIqResult()
        }
    })

    await coordinator.deleteProfilePicture()

    assert.equal(calls.length, 1)
    assert.equal(calls[0].context, 'profile.deletePicture')
    assert.equal(calls[0].node.attrs.type, 'set')
    assert.equal(calls[0].node.attrs.xmlns, WA_XMLNS.PROFILE_PICTURE)
    assert.equal(calls[0].node.content, undefined)
})

test('profile coordinator gets status via usync', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
    }> = []

    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async (context, node) => {
            calls.push({ context, node })
            return createIqResult([
                {
                    tag: 'usync',
                    attrs: {},
                    content: [
                        { tag: 'result', attrs: {} },
                        {
                            tag: 'list',
                            attrs: {},
                            content: [
                                {
                                    tag: 'user',
                                    attrs: { jid: '5511999999999@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: 'status',
                                            attrs: {},
                                            content: TEXT_ENCODER.encode('Hello World')
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
        }
    })

    const result = await coordinator.getStatus('5511999999999@s.whatsapp.net')

    assert.deepEqual(result, { status: 'Hello World' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].context, 'profile.getStatus')
    assert.equal(calls[0].node.attrs.xmlns, 'usync')
})

test('profile coordinator returns null status when no content', async () => {
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async () =>
            createIqResult([
                {
                    tag: 'usync',
                    attrs: {},
                    content: [
                        { tag: 'result', attrs: {} },
                        {
                            tag: 'list',
                            attrs: {},
                            content: [
                                {
                                    tag: 'user',
                                    attrs: { jid: '5511999999999@s.whatsapp.net' },
                                    content: [{ tag: 'status', attrs: {} }]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const result = await coordinator.getStatus('5511999999999@s.whatsapp.net')
    assert.deepEqual(result, { status: null })
})

test('profile coordinator returns empty string for status code 401', async () => {
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async () =>
            createIqResult([
                {
                    tag: 'usync',
                    attrs: {},
                    content: [
                        { tag: 'result', attrs: {} },
                        {
                            tag: 'list',
                            attrs: {},
                            content: [
                                {
                                    tag: 'user',
                                    attrs: { jid: '5511999999999@s.whatsapp.net' },
                                    content: [{ tag: 'status', attrs: { code: '401' } }]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const result = await coordinator.getStatus('5511999999999@s.whatsapp.net')
    assert.deepEqual(result, { status: '' })
})

test('profile coordinator gets multiple profiles via usync', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
    }> = []

    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async (context, node) => {
            calls.push({ context, node })
            return createIqResult([
                {
                    tag: 'usync',
                    attrs: {},
                    content: [
                        { tag: 'result', attrs: {} },
                        {
                            tag: 'list',
                            attrs: {},
                            content: [
                                {
                                    tag: 'user',
                                    attrs: { jid: 'a@s.whatsapp.net' },
                                    content: [
                                        { tag: 'picture', attrs: { id: '100' } },
                                        {
                                            tag: 'status',
                                            attrs: {},
                                            content: 'Hey there'
                                        }
                                    ]
                                },
                                {
                                    tag: 'user',
                                    attrs: { jid: 'b@s.whatsapp.net' },
                                    content: [{ tag: 'picture', attrs: { id: '200' } }]
                                }
                            ]
                        }
                    ]
                }
            ])
        }
    })

    const profiles = await coordinator.getProfiles(['a@s.whatsapp.net', 'b@s.whatsapp.net'])

    assert.equal(profiles.length, 2)
    assert.deepEqual(profiles[0], {
        jid: 'a@s.whatsapp.net',
        pictureId: 100,
        status: 'Hey there'
    })
    assert.deepEqual(profiles[1], {
        jid: 'b@s.whatsapp.net',
        pictureId: 200
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].context, 'profile.getProfiles')
})

test('profile coordinator sets status text', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
    }> = []

    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async (context, node) => {
            calls.push({ context, node })
            return createIqResult()
        }
    })

    await coordinator.setStatus('Hello World')

    assert.equal(calls.length, 1)
    assert.equal(calls[0].context, 'profile.setStatus')
    assert.equal(calls[0].node.attrs.type, 'set')
    assert.equal(calls[0].node.attrs.xmlns, 'status')
    const statusNode = (calls[0].node.content as readonly BinaryNode[])[0]
    assert.equal(statusNode.tag, 'status')
    assert.equal(statusNode.content, 'Hello World')
})

test('profile coordinator setPushName applies locally before the SettingPushName write', async () => {
    const events: string[] = []
    const setCalls: unknown[] = []
    const appliedNames: string[] = []

    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async (name: string) => {
            events.push('apply')
            appliedNames.push(name)
        },
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: {
            set: async (input: unknown) => {
                events.push('mutation')
                setCalls.push(input)
            }
        } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async () => createIqResult()
    })

    await coordinator.setPushName('Maria')
    await coordinator.setPushName('')

    assert.deepEqual(appliedNames, ['Maria', ''])
    assert.deepEqual(setCalls, [
        { schema: 'SettingPushName', name: 'Maria' },
        { schema: 'SettingPushName', name: '' }
    ])
    assert.deepEqual(events, ['apply', 'mutation', 'apply', 'mutation'])
})

test('profile coordinator sets account default disappearing mode', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
        readonly contextData?: Readonly<Record<string, unknown>>
    }> = []

    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async (context, node, _timeout, contextData) => {
            calls.push({ context, node, contextData })
            return createIqResult()
        }
    })

    await coordinator.setDisappearingMode(86400)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].context, 'profile.setDisappearingMode')
    assert.equal(calls[0].node.attrs.type, 'set')
    assert.equal(calls[0].node.attrs.xmlns, 'disappearing_mode')
    assert.equal(calls[0].node.attrs.to, 's.whatsapp.net')
    const child = (calls[0].node.content as readonly BinaryNode[])[0]
    assert.equal(child.tag, 'disappearing_mode')
    assert.equal(child.attrs.duration, '86400')
    assert.deepEqual(calls[0].contextData, { durationSeconds: 86400 })

    await assert.rejects(() => coordinator.setDisappearingMode(-1), /invalid durationSeconds/)
    await assert.rejects(() => coordinator.setDisappearingMode(1.5), /invalid durationSeconds/)
})

test('profile coordinator gets disappearing mode via usync', async () => {
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async () =>
            createIqResult([
                {
                    tag: 'usync',
                    attrs: {},
                    content: [
                        { tag: 'result', attrs: {} },
                        {
                            tag: 'list',
                            attrs: {},
                            content: [
                                {
                                    tag: 'user',
                                    attrs: { jid: 'a@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: 'disappearing_mode',
                                            attrs: {
                                                duration: '86400',
                                                t: '1700000000',
                                                ephemerality_disabled: 'true'
                                            }
                                        }
                                    ]
                                },
                                {
                                    tag: 'user',
                                    attrs: { jid: 'b@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: 'disappearing_mode',
                                            attrs: { duration: '0', t: '1700000001' }
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const results = await coordinator.getDisappearingMode(['a@s.whatsapp.net', 'b@s.whatsapp.net'])

    assert.equal(results.length, 2)
    assert.deepEqual(results[0], {
        duration: 86400,
        timestamp: 1700000000,
        ephemeralityDisabled: true
    })
    assert.deepEqual(results[1], { duration: 0, timestamp: 1700000001 })
})

test('profile coordinator returns empty disappearing mode for empty jids', async () => {
    const calls: string[] = []
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async (context) => {
            calls.push(context)
            return createIqResult()
        }
    })

    const results = await coordinator.getDisappearingMode([])
    assert.equal(results.length, 0)
    assert.equal(calls.length, 0)
})

test('profile coordinator gets text statuses via usync', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
    }> = []

    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async (context, node) => {
            calls.push({ context, node })
            return createIqResult([
                {
                    tag: 'usync',
                    attrs: {},
                    content: [
                        { tag: 'result', attrs: {} },
                        {
                            tag: 'list',
                            attrs: {},
                            content: [
                                {
                                    tag: 'user',
                                    attrs: { jid: 'a@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: 'text_status',
                                            attrs: {
                                                text: 'feeling great',
                                                ephemeral_duration_sec: '3600',
                                                last_update_time: '1700000000'
                                            },
                                            content: [
                                                {
                                                    tag: 'emoji',
                                                    attrs: { content: '🚀' }
                                                }
                                            ]
                                        }
                                    ]
                                },
                                {
                                    tag: 'user',
                                    attrs: { jid: 'b@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: 'text_status',
                                            attrs: {
                                                text: ' ',
                                                ephemeral_duration_sec: '-1',
                                                last_update_time: '1776181230'
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
        }
    })

    const results = await coordinator.getTextStatuses(['a@s.whatsapp.net', 'b@s.whatsapp.net'])

    assert.equal(results.length, 2)
    assert.deepEqual(results[0], {
        jid: 'a@s.whatsapp.net',
        text: 'feeling great',
        emoji: '🚀',
        ephemeralDurationSec: 3600,
        lastUpdateTime: 1700000000
    })
    assert.deepEqual(results[1], {
        jid: 'b@s.whatsapp.net',
        text: ' ',
        emoji: null,
        ephemeralDurationSec: -1,
        lastUpdateTime: 1776181230
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].context, 'profile.getTextStatuses')
    assert.equal(calls[0].node.attrs.xmlns, 'usync')
})

test('profile coordinator emits null text_status entry on error nodes', async () => {
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async () =>
            createIqResult([
                {
                    tag: 'usync',
                    attrs: {},
                    content: [
                        { tag: 'result', attrs: {} },
                        {
                            tag: 'list',
                            attrs: {},
                            content: [
                                {
                                    tag: 'user',
                                    attrs: { jid: 'a@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: 'text_status',
                                            attrs: {},
                                            content: [
                                                {
                                                    tag: 'error',
                                                    attrs: { code: '404', text: 'not-found' }
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const results = await coordinator.getTextStatuses(['a@s.whatsapp.net'])
    assert.deepEqual(results, [
        {
            jid: 'a@s.whatsapp.net',
            text: null,
            emoji: null,
            ephemeralDurationSec: null,
            lastUpdateTime: null
        }
    ])
})

test('profile coordinator returns empty text statuses for empty jids', async () => {
    const calls: string[] = []
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async (context) => {
            calls.push(context)
            return createIqResult()
        }
    })

    const results = await coordinator.getTextStatuses([])
    assert.equal(results.length, 0)
    assert.equal(calls.length, 0)
})

test('profile coordinator sets text status via mex', async () => {
    const captured: BinaryNode[] = []
    const mexSocket = {
        query: async (node: BinaryNode): Promise<BinaryNode> => {
            captured.push(node)
            return {
                tag: 'iq',
                attrs: { type: 'result' },
                content: [
                    {
                        tag: 'result',
                        attrs: {},
                        content: TEXT_ENCODER.encode(
                            JSON.stringify({
                                data: { xwa2_update_text_status: { result: 'OK' } }
                            })
                        )
                    }
                ]
            }
        }
    }
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        queryWithContext: async () => createIqResult(),
        mexSocket
    })

    await coordinator.setTextStatus({
        text: 'feeling great',
        emoji: '🚀',
        ephemeralDurationSec: 3600
    })

    assert.equal(captured.length, 1)
    assert.equal(captured[0].attrs.xmlns, 'w:mex')
    const queryNode = (captured[0].content as readonly BinaryNode[])[0]
    assert.equal(queryNode.tag, 'query')
    assert.equal(queryNode.attrs.query_id, '9152604461510864')
    const body = JSON.parse(
        typeof queryNode.content === 'string'
            ? queryNode.content
            : TEXT_DECODER.decode(queryNode.content as Uint8Array)
    )
    assert.deepEqual(body.variables, {
        input: {
            text: 'feeling great',
            emoji: { content: '🚀' },
            ephemeral_duration_sec: 3600
        }
    })
})

test('profile coordinator setTextStatus normalizes empty inputs to clear payload', async () => {
    const captured: BinaryNode[] = []
    const mexSocket = {
        query: async (node: BinaryNode): Promise<BinaryNode> => {
            captured.push(node)
            return {
                tag: 'iq',
                attrs: { type: 'result' },
                content: [
                    {
                        tag: 'result',
                        attrs: {},
                        content: TEXT_ENCODER.encode(JSON.stringify({ data: null }))
                    }
                ]
            }
        }
    }
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        queryWithContext: async () => createIqResult(),
        mexSocket
    })

    await coordinator.setTextStatus({ text: '', ephemeralDurationSec: 3600 })

    const queryNode = (captured[0].content as readonly BinaryNode[])[0]
    const body = JSON.parse(
        typeof queryNode.content === 'string'
            ? queryNode.content
            : TEXT_DECODER.decode(queryNode.content as Uint8Array)
    )
    assert.deepEqual(body.variables, {
        input: { text: null, ephemeral_duration_sec: 0 }
    })
})

test('profile coordinator gets usernames via usync', async () => {
    const calls: Array<{ readonly context: string; readonly node: BinaryNode }> = []
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async (context, node) => {
            calls.push({ context, node })
            return createIqResult([
                {
                    tag: 'usync',
                    attrs: {},
                    content: [
                        { tag: 'result', attrs: {} },
                        {
                            tag: 'list',
                            attrs: {},
                            content: [
                                {
                                    tag: 'user',
                                    attrs: { jid: 'a@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: 'username',
                                            attrs: {},
                                            content: TEXT_ENCODER.encode('alice')
                                        }
                                    ]
                                },
                                {
                                    tag: 'user',
                                    attrs: { jid: 'b@s.whatsapp.net' },
                                    content: [{ tag: 'username', attrs: {} }]
                                },
                                {
                                    tag: 'user',
                                    attrs: { jid: 'c@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: 'username',
                                            attrs: {},
                                            content: [
                                                {
                                                    tag: 'error',
                                                    attrs: { code: '404', text: 'not-found' }
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
        }
    })

    const results = await coordinator.getUsernames([
        'a@s.whatsapp.net',
        'b@s.whatsapp.net',
        'c@s.whatsapp.net'
    ])

    assert.equal(results.length, 3)
    assert.deepEqual(results[0], { jid: 'a@s.whatsapp.net', username: 'alice' })
    assert.deepEqual(results[1], { jid: 'b@s.whatsapp.net', username: null })
    assert.deepEqual(results[2], { jid: 'c@s.whatsapp.net', username: null })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].context, 'profile.getUsernames')
})

test('profile coordinator returns empty usernames for empty jids', async () => {
    const calls: string[] = []
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async (context) => {
            calls.push(context)
            return createIqResult()
        }
    })
    const results = await coordinator.getUsernames([])
    assert.equal(results.length, 0)
    assert.equal(calls.length, 0)
})

test('profile coordinator getOwnUsername parses mex payload', async () => {
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        queryWithContext: async () => createIqResult(),
        mexSocket: {
            query: async (): Promise<BinaryNode> => ({
                tag: 'iq',
                attrs: { type: 'result' },
                content: [
                    {
                        tag: 'result',
                        attrs: {},
                        content: TEXT_ENCODER.encode(
                            JSON.stringify({
                                data: {
                                    xwa2_username_get: {
                                        username_info: {
                                            username: 'me',
                                            state: 'OWNED',
                                            pin: '1234'
                                        }
                                    }
                                }
                            })
                        )
                    }
                ]
            })
        }
    })
    const result = await coordinator.getOwnUsername()
    assert.deepEqual(result, { username: 'me', state: 'OWNED', pin: '1234' })
})

test('profile coordinator getOwnUsername swallows 404 GraphQL errors', async () => {
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        queryWithContext: async () => createIqResult(),
        mexSocket: {
            query: async (): Promise<BinaryNode> => ({
                tag: 'iq',
                attrs: { type: 'result' },
                content: [
                    {
                        tag: 'result',
                        attrs: {},
                        content: TEXT_ENCODER.encode(
                            JSON.stringify({
                                errors: [
                                    {
                                        message: 'Not Found',
                                        path: ['xwa2_username_get'],
                                        extensions: { error_code: 404 }
                                    }
                                ]
                            })
                        )
                    }
                ]
            })
        }
    })
    const result = await coordinator.getOwnUsername()
    assert.deepEqual(result, { username: null, state: null, pin: null })
})

test('profile coordinator getOwnUsername returns nulls when info missing', async () => {
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        queryWithContext: async () => createIqResult(),
        mexSocket: {
            query: async (): Promise<BinaryNode> => ({
                tag: 'iq',
                attrs: { type: 'result' },
                content: [
                    {
                        tag: 'result',
                        attrs: {},
                        content: TEXT_ENCODER.encode(
                            JSON.stringify({ data: { xwa2_username_get: { username_info: null } } })
                        )
                    }
                ]
            })
        }
    })
    const result = await coordinator.getOwnUsername()
    assert.deepEqual(result, { username: null, state: null, pin: null })
})

test('profile coordinator setUsername sends mex variables with defaults', async () => {
    const captured: BinaryNode[] = []
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        queryWithContext: async () => createIqResult(),
        mexSocket: {
            query: async (node: BinaryNode): Promise<BinaryNode> => {
                captured.push(node)
                return {
                    tag: 'iq',
                    attrs: { type: 'result' },
                    content: [
                        {
                            tag: 'result',
                            attrs: {},
                            content: TEXT_ENCODER.encode(
                                JSON.stringify({
                                    data: { xwa2_username_set: { result: 'SUCCESS' } }
                                })
                            )
                        }
                    ]
                }
            }
        }
    })

    const ok = await coordinator.setUsername({ username: 'newhandle' })
    assert.equal(ok, true)
    const queryNode = (captured[0].content as readonly BinaryNode[])[0]
    assert.equal(queryNode.attrs.query_id, '25757341163897635')
    const body = JSON.parse(
        typeof queryNode.content === 'string'
            ? queryNode.content
            : TEXT_DECODER.decode(queryNode.content as Uint8Array)
    )
    assert.deepEqual(body.variables, {
        input: 'newhandle',
        reserved: false,
        session_id: '',
        source: 'USER_INPUT'
    })
})

test('profile coordinator setUsername returns false on non-SUCCESS result', async () => {
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        queryWithContext: async () => createIqResult(),
        mexSocket: {
            query: async (): Promise<BinaryNode> => ({
                tag: 'iq',
                attrs: { type: 'result' },
                content: [
                    {
                        tag: 'result',
                        attrs: {},
                        content: TEXT_ENCODER.encode(
                            JSON.stringify({ data: { xwa2_username_set: { result: 'TAKEN' } } })
                        )
                    }
                ]
            })
        }
    })
    assert.equal(await coordinator.setUsername({ username: 'x' }), false)
})

test('profile coordinator deleteUsername sends empty variables', async () => {
    const captured: BinaryNode[] = []
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        queryWithContext: async () => createIqResult(),
        mexSocket: {
            query: async (node: BinaryNode): Promise<BinaryNode> => {
                captured.push(node)
                return {
                    tag: 'iq',
                    attrs: { type: 'result' },
                    content: [
                        {
                            tag: 'result',
                            attrs: {},
                            content: TEXT_ENCODER.encode(
                                JSON.stringify({
                                    data: { xwa2_username_set: { result: 'SUCCESS' } }
                                })
                            )
                        }
                    ]
                }
            }
        }
    })

    const ok = await coordinator.deleteUsername()
    assert.equal(ok, true)
    const queryNode = (captured[0].content as readonly BinaryNode[])[0]
    assert.equal(queryNode.attrs.query_id, '25757341163897635')
    const body = JSON.parse(
        typeof queryNode.content === 'string'
            ? queryNode.content
            : TEXT_DECODER.decode(queryNode.content as Uint8Array)
    )
    assert.deepEqual(body.variables, {})
})

test('profile coordinator returns empty array for empty jids list', async () => {
    const calls: Array<{ readonly context: string }> = []

    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        queryLidsByPhoneJids: async () => [],
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async (context) => {
            calls.push({ context })
            return createIqResult()
        }
    })

    const profiles = await coordinator.getProfiles([])

    assert.equal(profiles.length, 0)
    assert.equal(calls.length, 0)
})

test('profile coordinator resolves lids by phone numbers', async () => {
    const portCalls: Array<readonly string[]> = []
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async () => createIqResult(),
        queryLidsByPhoneJids: async (phoneJids) => {
            portCalls.push(phoneJids)
            return [
                {
                    phoneJid: '5511999999999@s.whatsapp.net',
                    lidJid: '1234@lid',
                    exists: true
                }
            ]
        }
    })

    const result = await coordinator.getLidsByPhoneNumbers(['+55 (11) 99999-9999'])

    assert.deepEqual(result, [
        {
            phoneJid: '5511999999999@s.whatsapp.net',
            lidJid: '1234@lid',
            exists: true
        }
    ])
    assert.equal(portCalls.length, 1)
    assert.deepEqual(portCalls[0], ['5511999999999@s.whatsapp.net'])
})

test('profile coordinator returns empty lid result without calling port', async () => {
    let called = false
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        applyOwnPushName: async () => undefined,
        resolvePrivacyTokenNode: async () => null,
        logger: createNoopLogger(),
        mutations: { set: async () => undefined } as never,
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        queryWithContext: async () => createIqResult(),
        queryLidsByPhoneJids: async () => {
            called = true
            return []
        }
    })

    const result = await coordinator.getLidsByPhoneNumbers([])
    assert.equal(result.length, 0)
    assert.equal(called, false)
})
