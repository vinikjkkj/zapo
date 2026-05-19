import { randomUUID } from 'node:crypto'

import type { WaSendMessageOptions } from '@client/types'
import { applyContextInfo } from '@message/context-info'
import { attachBotMetadata, attachBotThread } from '@message/kinds/bot'
import type {
    WaMessageBuildResult,
    WaMessagePublishResult,
    WaSendMessageContent
} from '@message/types'
import { proto, type Proto } from '@proto'
import {
    resolveBotFbidJid,
    WA_BLOKS_VERSIONING_ID,
    WA_BOT_DEFAULT_CAPABILITIES,
    WA_BOT_RENDERING_PIXEL_DENSITY
} from '@protocol/bot'
import { WA_DEFAULTS, WA_NODE_TAGS } from '@protocol/constants'
import { isBotJid } from '@protocol/jid'
import { buildBotListIq } from '@transport/node/builders/bot'
import { findNodeChild, getNodeChildrenByTag } from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export interface WaBotInfo {
    readonly jid: string
    readonly fbidJid: string
    readonly personaId: string
    readonly isDefault: boolean
    readonly section?: string
    readonly count?: number
}

export interface WaBotPromptOptions extends WaSendMessageOptions {
    // Bot to invoke. Defaults to `to` when `to` is a `@bot` jid (direct chat).
    // Required when `to` is a group/chat — there the bot is invoked via mention.
    readonly botJid?: string
    readonly personaId?: string
    readonly capabilities?: readonly proto.BotCapabilityMetadata.BotCapabilityType[]
    // Mention path only: extra jids to include alongside the bot mention.
    readonly extraMentionedJids?: readonly string[]
    // Direct path only: reuse to continue an existing conversation; omit to start fresh.
    readonly aiThreadId?: string
    readonly aiThreadType?: proto.AIThreadInfo.AIThreadClientInfo.AIThreadType
}

export interface WaBotCoordinator {
    readonly listBots: () => Promise<readonly WaBotInfo[]>
    readonly sendPrompt: (
        to: string,
        content: WaSendMessageContent,
        options?: WaBotPromptOptions
    ) => Promise<WaMessagePublishResult>
}

interface WaBotCoordinatorOptions {
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
    readonly buildMessageContent: (content: WaSendMessageContent) => Promise<WaMessageBuildResult>
    readonly sendMessage: (
        to: string,
        content: WaSendMessageContent,
        options?: WaSendMessageOptions
    ) => Promise<WaMessagePublishResult>
}

function deriveFbidJid(jid: string, personaId: string): string {
    const mapped = resolveBotFbidJid(jid)
    if (mapped) return mapped
    const fbidUser = personaId.split('$', 1)[0]
    return `${fbidUser}@${WA_DEFAULTS.BOT_SERVER}`
}

function parseBotListResult(result: BinaryNode): readonly WaBotInfo[] {
    const botRoot = findNodeChild(result, WA_NODE_TAGS.BOT)
    if (!botRoot) return []

    const defaultJid = findNodeChild(botRoot, 'default')?.attrs.jid

    const sections = getNodeChildrenByTag(botRoot, 'section')
    const out: WaBotInfo[] = []
    for (let i = 0; i < sections.length; i += 1) {
        const section = sections[i]
        const sectionName = typeof section.attrs.name === 'string' ? section.attrs.name : undefined
        const bots = getNodeChildrenByTag(section, WA_NODE_TAGS.BOT)
        for (let j = 0; j < bots.length; j += 1) {
            const node = bots[j]
            const jid = node.attrs.jid
            const personaId = node.attrs.persona_id
            if (typeof jid !== 'string' || typeof personaId !== 'string') continue
            const countAttr = node.attrs.count
            const count = typeof countAttr === 'string' ? Number.parseInt(countAttr, 10) : undefined
            out.push({
                jid,
                fbidJid: deriveFbidJid(jid, personaId),
                personaId,
                isDefault: defaultJid !== undefined && jid === defaultJid,
                section: sectionName,
                count: Number.isSafeInteger(count) ? count : undefined
            })
        }
    }
    return out
}

function normalizeBotJidToFbid(botJid: string): string {
    const mapped = resolveBotFbidJid(botJid)
    if (mapped) return mapped
    throw new Error(
        `cannot resolve FBID for bot jid "${botJid}" — pass a @bot jid or use the fbidJid from listBots`
    )
}

export function createBotCoordinator(options: WaBotCoordinatorOptions): WaBotCoordinator {
    const { queryWithContext, buildMessageContent, sendMessage } = options

    return {
        listBots: async () => {
            const node = buildBotListIq()
            const result = await queryWithContext('bot.listBots', node)
            assertIqResult(result, 'bot.listBots')
            return parseBotListResult(result)
        },

        sendPrompt: async (to, content, opts = {}) => {
            // `to` wins when it is a @bot jid — caller chose a specific bot; ignore
            // opts.botJid so it cannot misroute the prompt to a different bot.
            const isDirect = isBotJid(to)
            const botJid = isDirect ? to : opts.botJid
            if (!botJid) {
                throw new Error(
                    'bot.sendPrompt: opts.botJid is required when `to` is not a @bot jid'
                )
            }
            const fbidBotJid = normalizeBotJidToFbid(botJid)
            const { message: baseMessage } = await buildMessageContent(content)

            if (isDirect) {
                const aiThreadId = opts.aiThreadId ?? randomUUID()
                const withMetadata = attachBotMetadata(baseMessage, {
                    personaId: opts.personaId,
                    capabilities: opts.capabilities ?? WA_BOT_DEFAULT_CAPABILITIES
                })
                const enriched = attachBotThread(withMetadata, {
                    aiThreadId,
                    remoteJid: fbidBotJid,
                    threadType: opts.aiThreadType
                })
                return sendMessage(fbidBotJid, enriched, opts)
            }

            // Mention envelope must NOT carry personaId/invokerJid/capabilities/
            // botThreadInfo — Meta AI silently drops the request otherwise.
            const mentionedJids: string[] = [fbidBotJid]
            if (opts.extraMentionedJids) {
                for (const jid of opts.extraMentionedJids) {
                    if (jid !== fbidBotJid) mentionedJids.push(jid)
                }
            }
            const inner = applyContextInfo(baseMessage, {
                mentionedJids,
                raw: {
                    botMessageSharingInfo: {
                        botEntryPointOrigin: proto.BotMetricsEntryPoint.INVOKE_META_AI_GROUP,
                        forwardScore: 0
                    }
                }
            })
            const wrapped: Proto.IMessage = {
                messageContextInfo: {
                    threadId: [],
                    botMetadata: {
                        botRenderingConfigMetadata: {
                            bloksVersioningId: WA_BLOKS_VERSIONING_ID,
                            pixelDensity: WA_BOT_RENDERING_PIXEL_DENSITY
                        }
                    }
                },
                botInvokeMessage: { message: inner }
            }
            return sendMessage(to, wrapped, opts)
        }
    }
}
