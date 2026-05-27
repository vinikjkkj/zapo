import assert from 'node:assert/strict'
import test from 'node:test'

import { createBotCoordinator } from '@client/coordinators/WaBotCoordinator'
import type { WaSendMessageOptions } from '@client/types'
import { createNoopLogger } from '@infra/log/types'
import type { WaMessagePublishResult, WaSendMessageContent } from '@message/types'
import type { Proto } from '@proto'
import { WA_BOT_DEFAULT_CAPABILITIES } from '@protocol/bot'
import type { WaMessageSecretStore } from '@store/contracts/message-secret.store'
import type { WaMessageStore } from '@store/contracts/message.store'
import type { BinaryNode } from '@transport/types'

const decryptDepsStub = {
    logger: createNoopLogger(),
    messageStore: null as unknown as WaMessageStore,
    messageSecretStore: null as unknown as WaMessageSecretStore,
    getCurrentCredentials: () => null,
    emitBotChunk: () => undefined,
    generateSid: async () => 'test-sid'
}

function createIqResult(content?: readonly BinaryNode[]): BinaryNode {
    return {
        tag: 'iq',
        attrs: { type: 'result' },
        content
    }
}

function noopSendMessage(): Promise<WaMessagePublishResult> {
    throw new Error('sendMessage not used in this test')
}

function fakePublishResult(id: string): WaMessagePublishResult {
    return {
        id,
        ack: { error: undefined, code: 200, phash: undefined, addressingMode: undefined }
    } as unknown as WaMessagePublishResult
}

const META_AI_FBID = '867051314767696@bot'
const MANUS_FBID = '1807055946647696@bot'

test('bot coordinator listBots emits the expected IQ and parses sections', async () => {
    const calls: BinaryNode[] = []
    const coordinator = createBotCoordinator({
        ...decryptDepsStub,
        queryWithContext: async (_context, node) => {
            calls.push(node)
            return createIqResult([
                {
                    tag: 'bot',
                    attrs: { v: '2' },
                    content: [
                        { tag: 'default', attrs: { jid: META_AI_FBID, persona_id: 'p-meta' } },
                        {
                            tag: 'section',
                            attrs: { name: 'featured', type: 'featured' },
                            content: [
                                {
                                    tag: 'bot',
                                    attrs: {
                                        jid: META_AI_FBID,
                                        persona_id: 'p-meta',
                                        count: '12'
                                    }
                                },
                                {
                                    tag: 'bot',
                                    attrs: { jid: MANUS_FBID, persona_id: 'p-manus' }
                                }
                            ]
                        },
                        {
                            tag: 'section',
                            attrs: { name: 'category', type: 'category' },
                            content: [
                                {
                                    tag: 'bot',
                                    attrs: { jid: 'x@bot' }
                                }
                            ]
                        }
                    ]
                }
            ])
        },
        buildMessageContent: async () => ({ message: {} }),
        sendMessage: noopSendMessage
    })

    const bots = await coordinator.listBots()

    assert.equal(calls.length, 1)
    assert.equal(calls[0].tag, 'iq')
    assert.equal(calls[0].attrs.type, 'get')
    assert.equal(calls[0].attrs.xmlns, 'bot')
    assert.deepEqual(bots, [
        {
            jid: META_AI_FBID,
            fbidJid: META_AI_FBID,
            personaId: 'p-meta',
            isDefault: true,
            section: 'featured',
            count: 12
        },
        {
            jid: MANUS_FBID,
            fbidJid: MANUS_FBID,
            personaId: 'p-manus',
            isDefault: false,
            section: 'featured',
            count: undefined
        }
    ])
})

test('bot coordinator listBots derives fbidJid from personaId for PN bots', async () => {
    const coordinator = createBotCoordinator({
        ...decryptDepsStub,
        queryWithContext: async () =>
            createIqResult([
                {
                    tag: 'bot',
                    attrs: { v: '2' },
                    content: [
                        {
                            tag: 'section',
                            attrs: { name: 'All' },
                            content: [
                                {
                                    tag: 'bot',
                                    attrs: {
                                        jid: '13135550002@s.whatsapp.net',
                                        persona_id: '867051314767696$1516093456810924'
                                    }
                                }
                            ]
                        }
                    ]
                }
            ]),
        buildMessageContent: async () => ({ message: {} }),
        sendMessage: noopSendMessage
    })

    const bots = await coordinator.listBots()
    assert.equal(bots.length, 1)
    assert.equal(bots[0].jid, '13135550002@s.whatsapp.net')
    assert.equal(bots[0].fbidJid, META_AI_FBID)
})

test('bot coordinator sendPrompt direct path attaches default capabilities + personaId + thread', async () => {
    const sends: Array<{
        readonly to: string
        readonly content: WaSendMessageContent
        readonly options?: WaSendMessageOptions
    }> = []
    const coordinator = createBotCoordinator({
        ...decryptDepsStub,
        queryWithContext: async () => createIqResult(),
        buildMessageContent: async (content) => {
            if (typeof content !== 'string') throw new Error('expected string content in test')
            return { message: { conversation: content } }
        },
        sendMessage: async (to, content, options) => {
            sends.push({ to, content, options })
            return fakePublishResult('msg-1')
        }
    })

    const result = await coordinator.sendPrompt(META_AI_FBID, 'hi meta ai', {
        personaId: 'p-meta'
    })

    assert.equal(result.id, 'msg-1')
    assert.equal(sends.length, 1)
    assert.equal(sends[0].to, META_AI_FBID)
    const sentMessage = sends[0].content as Proto.IMessage
    assert.equal(sentMessage.conversation, 'hi meta ai')
    assert.equal(sentMessage.messageContextInfo?.botMetadata?.personaId, 'p-meta')
    assert.equal(sentMessage.messageContextInfo?.botMetadata?.invokerJid, undefined)
    assert.deepEqual(
        sentMessage.messageContextInfo?.botMetadata?.capabilityMetadata?.capabilities,
        [...WA_BOT_DEFAULT_CAPABILITIES]
    )
    // direct path also attaches the AI thread metadata
    assert.ok(sentMessage.messageContextInfo?.threadId?.[0]?.threadKey?.id, 'aiThreadId set')
    assert.ok(sentMessage.messageContextInfo?.botMetadata?.botThreadInfo?.clientInfo)
})

test('bot coordinator sendPrompt direct path accepts custom capabilities override', async () => {
    let captured: Proto.IMessage | undefined
    const coordinator = createBotCoordinator({
        ...decryptDepsStub,
        queryWithContext: async () => createIqResult(),
        buildMessageContent: async (content) => ({
            message:
                typeof content === 'string'
                    ? { conversation: content }
                    : (content as Proto.IMessage)
        }),
        sendMessage: async (_to, content) => {
            captured = content as Proto.IMessage
            return fakePublishResult('msg-2')
        }
    })

    await coordinator.sendPrompt(META_AI_FBID, 'hello', { capabilities: [2, 8] })
    assert.deepEqual(
        captured?.messageContextInfo?.botMetadata?.capabilityMetadata?.capabilities,
        [2, 8]
    )
    assert.equal(captured?.messageContextInfo?.botMetadata?.invokerJid, undefined)
    assert.equal(captured?.messageContextInfo?.botMetadata?.personaId, undefined)
})

test('bot coordinator sendPrompt mention path wraps text in botInvokeMessage with mention metadata', async () => {
    const sends: Array<{ readonly to: string; readonly content: Proto.IMessage }> = []
    const coordinator = createBotCoordinator({
        ...decryptDepsStub,
        queryWithContext: async () => createIqResult(),
        buildMessageContent: async (content) => ({
            message:
                typeof content === 'string'
                    ? { conversation: content }
                    : (content as Proto.IMessage)
        }),
        sendMessage: async (to, content) => {
            sends.push({ to, content: content as Proto.IMessage })
            return fakePublishResult('msg-3')
        }
    })

    const groupJid = '12345-6789@g.us'
    await coordinator.sendPrompt(groupJid, '@867051314767696 what is X?', {
        botJid: META_AI_FBID,
        extraMentionedJids: ['5511888888888@s.whatsapp.net', META_AI_FBID]
    })

    assert.equal(sends.length, 1)
    assert.equal(sends[0].to, groupJid)
    const m = sends[0].content
    const inner = m.botInvokeMessage?.message
    assert.ok(inner, 'mention payload should be wrapped in botInvokeMessage')
    // Caller owns the literal `@<fbid>` token; coordinator only injects metadata.
    assert.equal(inner.extendedTextMessage?.text, '@867051314767696 what is X?')
    assert.deepEqual(inner.extendedTextMessage?.contextInfo?.mentionedJid, [
        META_AI_FBID,
        '5511888888888@s.whatsapp.net'
    ])
    assert.equal(
        inner.extendedTextMessage?.contextInfo?.botMessageSharingInfo?.botEntryPointOrigin,
        30
    )
    const rendering = m.messageContextInfo?.botMetadata?.botRenderingConfigMetadata
    assert.ok(rendering, 'rendering config metadata must be present')
    assert.equal(typeof rendering.bloksVersioningId, 'string')
    assert.equal(rendering.pixelDensity, 2.8125)
    // mention envelope drops persona/invoker/capabilities/thread – Meta AI silently
    // drops the request otherwise (per wa-web parity).
    assert.equal(m.messageContextInfo?.botMetadata?.personaId, undefined)
    assert.equal(m.messageContextInfo?.botMetadata?.invokerJid, undefined)
    assert.equal(m.messageContextInfo?.botMetadata?.capabilityMetadata, undefined)
})

test('bot coordinator sendPrompt mention path resolves Meta AI PN jid to FBID', async () => {
    const sends: Array<{ readonly content: Proto.IMessage }> = []
    const coordinator = createBotCoordinator({
        ...decryptDepsStub,
        queryWithContext: async () => createIqResult(),
        buildMessageContent: async (content) => ({
            message:
                typeof content === 'string'
                    ? { conversation: content }
                    : (content as Proto.IMessage)
        }),
        sendMessage: async (_to, content) => {
            sends.push({ content: content as Proto.IMessage })
            return fakePublishResult('msg-5')
        }
    })

    await coordinator.sendPrompt('g@g.us', '@867051314767696 oi', {
        botJid: '13135550002@s.whatsapp.net'
    })
    const inner = sends[0].content.botInvokeMessage?.message
    assert.deepEqual(inner?.extendedTextMessage?.contextInfo?.mentionedJid, [META_AI_FBID])
})

test('bot coordinator sendPrompt mention path throws when bot jid cannot be resolved to FBID', async () => {
    const coordinator = createBotCoordinator({
        ...decryptDepsStub,
        queryWithContext: async () => createIqResult(),
        buildMessageContent: async (content) => ({
            message:
                typeof content === 'string'
                    ? { conversation: content }
                    : (content as Proto.IMessage)
        }),
        sendMessage: noopSendMessage
    })

    await assert.rejects(
        () => coordinator.sendPrompt('g@g.us', 'oi', { botJid: 'unknown@s.whatsapp.net' }),
        /cannot resolve FBID/
    )
})

test('bot coordinator sendPrompt direct path ignores opts.botJid to avoid misroute', async () => {
    let captured: string | undefined
    const coordinator = createBotCoordinator({
        ...decryptDepsStub,
        queryWithContext: async () => createIqResult(),
        buildMessageContent: async () => ({ message: { conversation: 'hi' } }),
        sendMessage: async (to) => {
            captured = to
            return fakePublishResult('msg-direct-override')
        }
    })

    // caller addresses META_AI directly but tries to override with MANUS via opts.botJid;
    // the direct chat target wins so the prompt cannot be misrouted to another bot.
    await coordinator.sendPrompt(META_AI_FBID, 'hi', { botJid: MANUS_FBID })
    assert.equal(captured, META_AI_FBID)
})

test('bot coordinator sendPrompt throws when target is not a bot and botJid is missing', async () => {
    const coordinator = createBotCoordinator({
        ...decryptDepsStub,
        queryWithContext: async () => createIqResult(),
        buildMessageContent: async () => ({ message: {} }),
        sendMessage: noopSendMessage
    })

    await assert.rejects(() => coordinator.sendPrompt('g@g.us', 'hello'), /botJid is required/)
})

test('bot coordinator sendPrompt mention path injects mention metadata into image contextInfo', async () => {
    const sends: Array<{ readonly content: Proto.IMessage }> = []
    const coordinator = createBotCoordinator({
        ...decryptDepsStub,
        queryWithContext: async () => createIqResult(),
        buildMessageContent: async () => ({
            message: {
                imageMessage: { caption: '@867051314767696 olha isso', mimetype: 'image/jpeg' }
            }
        }),
        sendMessage: async (_to, content) => {
            sends.push({ content: content as Proto.IMessage })
            return fakePublishResult('msg-6')
        }
    })

    await coordinator.sendPrompt(
        'g@g.us',
        {
            type: 'image',
            media: new Uint8Array([1]),
            mimetype: 'image/jpeg',
            caption: '@867051314767696 olha isso'
        },
        { botJid: META_AI_FBID }
    )

    const inner = sends[0].content.botInvokeMessage?.message
    assert.ok(inner?.imageMessage, 'inner imageMessage present')
    assert.equal(inner.imageMessage.caption, '@867051314767696 olha isso')
    assert.deepEqual(inner.imageMessage.contextInfo?.mentionedJid, [META_AI_FBID])
    assert.equal(inner.imageMessage.contextInfo?.botMessageSharingInfo?.botEntryPointOrigin, 30)
})

test('bot coordinator getBotProfile parses full profile node via usync', async () => {
    const calls: BinaryNode[] = []
    const coordinator = createBotCoordinator({
        ...decryptDepsStub,
        queryWithContext: async (_context, node) => {
            calls.push(node)
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
                                    attrs: { jid: '13135550002@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: 'bot',
                                            attrs: {},
                                            content: [
                                                {
                                                    tag: 'profile',
                                                    attrs: { persona_id: 'persona-1' },
                                                    content: [
                                                        {
                                                            tag: 'name',
                                                            attrs: {},
                                                            content: 'Meta AI'
                                                        },
                                                        {
                                                            tag: 'attributes',
                                                            attrs: {},
                                                            content: 'attr-bytes'
                                                        },
                                                        {
                                                            tag: 'description',
                                                            attrs: {},
                                                            content: 'AI assistant'
                                                        },
                                                        {
                                                            tag: 'category',
                                                            attrs: {},
                                                            content: 'assistant'
                                                        },
                                                        {
                                                            tag: 'default',
                                                            attrs: {},
                                                            content: 'true'
                                                        },
                                                        {
                                                            tag: 'prompts',
                                                            attrs: {},
                                                            content: [
                                                                {
                                                                    tag: 'prompt',
                                                                    attrs: {},
                                                                    content: [
                                                                        {
                                                                            tag: 'emoji',
                                                                            attrs: {},
                                                                            content: '✨'
                                                                        },
                                                                        {
                                                                            tag: 'text',
                                                                            attrs: {},
                                                                            content:
                                                                                'Tell me a story'
                                                                        }
                                                                    ]
                                                                }
                                                            ]
                                                        },
                                                        {
                                                            tag: 'commands',
                                                            attrs: {},
                                                            content: [
                                                                {
                                                                    tag: 'description',
                                                                    attrs: {},
                                                                    content: 'top-level desc'
                                                                },
                                                                {
                                                                    tag: 'command',
                                                                    attrs: {},
                                                                    content: [
                                                                        {
                                                                            tag: 'name',
                                                                            attrs: {},
                                                                            content: 'imagine'
                                                                        },
                                                                        {
                                                                            tag: 'description',
                                                                            attrs: {},
                                                                            content:
                                                                                'generate image'
                                                                        }
                                                                    ]
                                                                }
                                                            ]
                                                        },
                                                        {
                                                            tag: 'is_meta_created',
                                                            attrs: {},
                                                            content: 'true'
                                                        },
                                                        {
                                                            tag: 'creator',
                                                            attrs: {},
                                                            content: [
                                                                {
                                                                    tag: 'name',
                                                                    attrs: {},
                                                                    content: 'Meta'
                                                                },
                                                                {
                                                                    tag: 'profile_url',
                                                                    attrs: {},
                                                                    content: 'https://meta.com'
                                                                }
                                                            ]
                                                        },
                                                        {
                                                            tag: 'posing_as_professional',
                                                            attrs: { type: 'no' }
                                                        }
                                                    ]
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
        },
        buildMessageContent: async () => ({ message: {} }),
        sendMessage: noopSendMessage
    })

    const result = await coordinator.getBotProfile('13135550002@s.whatsapp.net')

    assert.ok(result)
    assert.equal(result.name, 'Meta AI')
    assert.equal(result.description, 'AI assistant')
    assert.equal(result.category, 'assistant')
    assert.equal(result.isDefault, true)
    assert.deepEqual(result.prompts, [{ emoji: '✨', text: 'Tell me a story' }])
    assert.equal(result.personaId, 'persona-1')
    assert.deepEqual(result.commands, [{ name: 'imagine', description: 'generate image' }])
    assert.equal(result.commandsDescription, 'top-level desc')
    assert.equal(result.isMetaCreated, true)
    assert.equal(result.creatorName, 'Meta')
    assert.equal(result.creatorProfileUrl, 'https://meta.com')
    assert.equal(result.posingAsProfessional, 'no')

    assert.equal(calls.length, 1)
    assert.equal(calls[0].attrs.xmlns, 'usync')
})

test('bot coordinator getBotProfile returns null when server replies with bot error', async () => {
    const coordinator = createBotCoordinator({
        ...decryptDepsStub,
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
                                    attrs: { jid: '5511920387975@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: 'bot',
                                            attrs: {},
                                            content: [
                                                {
                                                    tag: 'error',
                                                    attrs: { code: '400', text: 'bad-request' }
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]),
        buildMessageContent: async () => ({ message: {} }),
        sendMessage: noopSendMessage
    })

    const result = await coordinator.getBotProfile('5511920387975@s.whatsapp.net')
    assert.equal(result, null)
})

test('bot coordinator getBotProfile sends persona_id in user element when provided', async () => {
    const captured: BinaryNode[] = []
    const coordinator = createBotCoordinator({
        ...decryptDepsStub,
        queryWithContext: async (_context, node) => {
            captured.push(node)
            return createIqResult([
                {
                    tag: 'usync',
                    attrs: {},
                    content: [
                        { tag: 'result', attrs: {} },
                        { tag: 'list', attrs: {} }
                    ]
                }
            ])
        },
        buildMessageContent: async () => ({ message: {} }),
        sendMessage: noopSendMessage
    })

    await coordinator.getBotProfile('x@bot', { personaId: 'p-meta' })

    const usyncNode = (captured[0].content as readonly BinaryNode[])[0]
    const listNode = (usyncNode.content as readonly BinaryNode[]).find((n) => n.tag === 'list')!
    const userNode = (listNode.content as readonly BinaryNode[])[0]
    const userBotNode = (userNode.content as readonly BinaryNode[])[0]
    assert.equal(userBotNode.tag, 'bot')
    const profileNode = (userBotNode.content as readonly BinaryNode[])[0]
    assert.equal(profileNode.tag, 'profile')
    assert.equal(profileNode.attrs.persona_id, 'p-meta')
})
