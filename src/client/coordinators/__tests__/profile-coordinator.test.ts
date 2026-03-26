import assert from 'node:assert/strict'
import test from 'node:test'

import { createProfileCoordinator } from '@client/coordinators/WaProfileCoordinator'
import { WA_XMLNS } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'
import { TEXT_ENCODER } from '@util/bytes'

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

test('profile coordinator gets disappearing mode via usync', async () => {
    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
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
        queryWithContext: async (context) => {
            calls.push(context)
            return createIqResult()
        }
    })

    const results = await coordinator.getDisappearingMode([])
    assert.equal(results.length, 0)
    assert.equal(calls.length, 0)
})

test('profile coordinator returns empty array for empty jids list', async () => {
    const calls: Array<{ readonly context: string }> = []

    const coordinator = createProfileCoordinator({
        generateSid: async () => 'test-sid',
        queryWithContext: async (context) => {
            calls.push({ context })
            return createIqResult()
        }
    })

    const profiles = await coordinator.getProfiles([])

    assert.equal(profiles.length, 0)
    assert.equal(calls.length, 0)
})
