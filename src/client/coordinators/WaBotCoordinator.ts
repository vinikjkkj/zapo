import { randomUUID } from 'node:crypto'

import type { WaAuthCredentials } from '@auth/types'
import type {
    WaIncomingBotChunkEvent,
    WaIncomingMessageEvent,
    WaSendMessageOptions
} from '@client/types'
import type { Logger } from '@infra/log/types'
import { applyContextInfo } from '@message/context-info'
import { resolveParentMessageSecret } from '@message/crypto/addon-crypto'
import { unwrapMessage } from '@message/encode/content'
import { attachBotMetadata, attachBotThread, decryptBotChunk } from '@message/kinds/bot'
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
import {
    WA_BOT_MSG_EDIT_TYPES,
    WA_BOT_NODE_ATTRS,
    WA_DEFAULTS,
    WA_META_NODE_ATTRS_BOT,
    WA_NODE_TAGS,
    type WaBotMsgEditType
} from '@protocol/constants'
import { isBotJid, toUserJid } from '@protocol/jid'
import type { WaMessageSecretStore } from '@store/contracts/message-secret.store'
import type { WaMessageStore } from '@store/contracts/message.store'
import {
    buildBotListIq,
    buildBotProfileUsyncUserNodeContent,
    buildGetBotProfileUsyncQueryNode
} from '@transport/node/builders/bot'
import {
    buildUsyncIq,
    iterateUsyncUsers,
    parseUsyncResultEnvelope
} from '@transport/node/builders/usync'
import { findNodeChild, getNodeChildrenByTag, getNodeTextContent } from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import { logUsyncProtocolErrors } from '@transport/node/usync'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt, toError } from '@util/primitives'

export interface WaBotInfo {
    readonly jid: string
    readonly fbidJid: string
    readonly personaId: string
    readonly isDefault: boolean
    readonly section?: string
    readonly count?: number
}

export interface WaBotProfilePrompt {
    readonly emoji: string
    readonly text: string
}

export interface WaBotProfileCommand {
    readonly name: string
    readonly description: string
}

export type WaBotPosingAsProfessional = 'unknown' | 'yes' | 'no'

export interface WaBotProfileResult {
    readonly name: string | null
    readonly attributes: string | null
    readonly description: string | null
    readonly category: string | null
    readonly isDefault: boolean
    readonly prompts: readonly WaBotProfilePrompt[]
    readonly personaId: string | null
    readonly commands: readonly WaBotProfileCommand[]
    readonly commandsDescription: string | null
    readonly isMetaCreated: boolean | null
    readonly creatorName: string | null
    readonly creatorProfileUrl: string | null
    readonly posingAsProfessional: WaBotPosingAsProfessional | null
}

export interface WaGetBotProfileOptions {
    readonly personaId?: string
}

export interface WaBotPromptOptions extends WaSendMessageOptions {
    // Bot to invoke. Defaults to `to` when `to` is a `@bot` jid (direct chat).
    // Required when `to` is a group/chat – there the bot is invoked via mention.
    readonly botJid?: string
    readonly personaId?: string
    readonly capabilities?: readonly proto.BotCapabilityMetadata.BotCapabilityType[]
    // Mention path only: extra jids to include alongside the bot mention.
    readonly extraMentionedJids?: readonly string[]
    // Direct path only: reuse to continue an existing conversation; omit to start fresh.
    readonly aiThreadId?: string
    readonly aiThreadType?: proto.AIThreadInfo.AIThreadClientInfo.AIThreadType
}

/**
 * Coordinates Meta-AI bot discovery, profile lookup, prompt send, and
 * streaming chunk decryption. Accessed via {@link WaClient.bot}.
 */
export interface WaBotCoordinator {
    /** Lists the bots available to the current account, grouped by section. */
    readonly listBots: () => Promise<readonly WaBotInfo[]>
    /** Fetches a single bot's profile (commands, prompts, creator metadata). */
    readonly getBotProfile: (
        jid: string,
        options?: WaGetBotProfileOptions
    ) => Promise<WaBotProfileResult | null>
    /**
     * Sends a prompt to a bot. When `to` is a `@bot` JID this uses the
     * direct path; for a group/chat JID, set `options.botJid` to invoke
     * the bot via mention.
     *
     * **Where do I get a bot JID?**
     * - Call {@link listBots} - returns one entry per available bot with
     *   both `jid` (the `@bot` JID for direct sends) and `fbidJid` (the
     *   form for `options.botJid` on the mention path).
     * - Use the `WA_BOT_KNOWN_JIDS` constants from `zapo-js/protocol`
     *   when you know the target (`META_AI_PN`, `META_AI_FBID`,
     *   `MANUS_FBID`, `HATCH_FBID`, ...). No IQ required.
     * - Read it off an incoming `message` event whose sender is a bot
     *   (reply scenario).
     *
     * **Direct path** (`to` is a `@bot` JID): generates a fresh
     * `aiThreadId` unless one is reused via `options.aiThreadId`,
     * attaches the bot metadata + thread proto, and sends to the bot's
     * FBID JID. Subsequent prompts using the same `aiThreadId` keep the
     * conversation context.
     *
     * **Mention path** (`to` is a group/chat JID): `options.botJid`
     * **must** be set. The bot is invoked indirectly; the lib strips
     * persona/invoker/capabilities/threadInfo from the inner message
     * because Meta AI silently drops the request when those are present
     * on the mention path. `options.aiThreadId` and `options.aiThreadType`
     * are ignored here.
     */
    readonly sendPrompt: (
        to: string,
        content: WaSendMessageContent,
        options?: WaBotPromptOptions
    ) => Promise<WaMessagePublishResult>
    /**
     * Attempts to decrypt a streaming bot chunk attached to `event` and,
     * on success, emits a typed `WaIncomingBotChunkEvent`. Silently
     * returns when the chunk is not addressed to the current account or
     * the parent prompt secret is not available.
     *
     * **Called automatically by {@link WaClient} on every incoming
     * message** - you rarely need to invoke it directly. Multiple chunks
     * arrive per response; concatenate them in arrival order using the
     * `editType` field (`first` → `inner` → `last`, or a single `full`)
     * to reconstruct the full reply.
     */
    readonly tryDecryptChunk: (event: WaIncomingMessageEvent) => Promise<void>
}

interface WaBotCoordinatorOptions {
    readonly logger: Logger
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
    readonly messageStore: WaMessageStore
    readonly messageSecretStore: WaMessageSecretStore
    readonly getCurrentCredentials: () => WaAuthCredentials | null
    readonly emitBotChunk: (event: WaIncomingBotChunkEvent) => void
    readonly generateSid: () => Promise<string>
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
            out.push({
                jid,
                fbidJid: deriveFbidJid(jid, personaId),
                personaId,
                isDefault: defaultJid !== undefined && jid === defaultJid,
                section: sectionName,
                count: parseOptionalInt(node.attrs.count)
            })
        }
    }
    return out
}

function parseBotProfilePrompts(
    promptsNode: BinaryNode | undefined
): readonly WaBotProfilePrompt[] {
    if (!promptsNode) return []
    const children = getNodeChildrenByTag(promptsNode, 'prompt')
    const out = new Array<WaBotProfilePrompt>(children.length)
    let count = 0
    for (let i = 0; i < children.length; i += 1) {
        const promptNode = children[i]
        const emoji = getNodeTextContent(findNodeChild(promptNode, 'emoji')) ?? ''
        const text = getNodeTextContent(findNodeChild(promptNode, 'text')) ?? ''
        out[count] = { emoji, text }
        count += 1
    }
    out.length = count
    return out
}

function parseBotProfileCommands(commandsNode: BinaryNode | undefined): {
    readonly commands: readonly WaBotProfileCommand[]
    readonly commandsDescription: string | null
} {
    if (!commandsNode) return { commands: [], commandsDescription: null }
    const commandsDescription =
        getNodeTextContent(findNodeChild(commandsNode, 'description')) || null
    const commandNodes = getNodeChildrenByTag(commandsNode, 'command')
    const commands = new Array<WaBotProfileCommand>(commandNodes.length)
    let count = 0
    for (let i = 0; i < commandNodes.length; i += 1) {
        const cmdNode = commandNodes[i]
        const name = getNodeTextContent(findNodeChild(cmdNode, 'name')) ?? ''
        const description = getNodeTextContent(findNodeChild(cmdNode, 'description')) ?? ''
        commands[count] = { name, description }
        count += 1
    }
    commands.length = count
    return { commands, commandsDescription }
}

function parsePosingAsProfessional(node: BinaryNode | undefined): WaBotPosingAsProfessional | null {
    if (!node) return null
    const type = node.attrs.type
    if (type === 'unknown' || type === 'yes' || type === 'no') {
        return type
    }
    return null
}

function parseBotProfileUsync(result: BinaryNode): WaBotProfileResult | null {
    const userNodes = iterateUsyncUsers(result) ?? []
    for (let i = 0; i < userNodes.length; i += 1) {
        const userNode = userNodes[i]
        const userContent = userNode.content
        if (!Array.isArray(userContent)) continue
        for (let j = 0; j < userContent.length; j += 1) {
            const botNode = userContent[j]
            if (botNode.tag !== WA_NODE_TAGS.BOT) continue
            const errorNode = findNodeChild(botNode, WA_NODE_TAGS.ERROR)
            if (errorNode) return null
            const profileNode = findNodeChild(botNode, 'profile')
            if (!profileNode) return null

            const isMetaCreatedRaw = getNodeTextContent(
                findNodeChild(profileNode, 'is_meta_created')
            )
            const creatorNode = findNodeChild(profileNode, 'creator')
            const { commands, commandsDescription } = parseBotProfileCommands(
                findNodeChild(profileNode, 'commands')
            )

            return {
                name: getNodeTextContent(findNodeChild(profileNode, 'name')) || null,
                attributes: getNodeTextContent(findNodeChild(profileNode, 'attributes')) || null,
                description: getNodeTextContent(findNodeChild(profileNode, 'description')) || null,
                category: getNodeTextContent(findNodeChild(profileNode, 'category')) || null,
                isDefault: getNodeTextContent(findNodeChild(profileNode, 'default')) === 'true',
                prompts: parseBotProfilePrompts(findNodeChild(profileNode, 'prompts')),
                personaId: (profileNode.attrs.persona_id as string | undefined) ?? null,
                commands,
                commandsDescription,
                isMetaCreated: isMetaCreatedRaw === undefined ? null : isMetaCreatedRaw === 'true',
                creatorName: creatorNode
                    ? getNodeTextContent(findNodeChild(creatorNode, 'name')) || null
                    : null,
                creatorProfileUrl: creatorNode
                    ? getNodeTextContent(findNodeChild(creatorNode, 'profile_url')) || null
                    : null,
                posingAsProfessional: parsePosingAsProfessional(
                    findNodeChild(profileNode, 'posing_as_professional')
                )
            }
        }
    }
    return null
}

function normalizeBotJidToFbid(botJid: string): string {
    const mapped = resolveBotFbidJid(botJid)
    if (mapped) return mapped
    throw new Error(
        `cannot resolve FBID for bot jid "${botJid}" – pass a @bot jid or use the fbidJid from listBots`
    )
}

/** Builds a {@link WaBotCoordinator} from its IQ/message/store dependencies. */
export function createBotCoordinator(options: WaBotCoordinatorOptions): WaBotCoordinator {
    const {
        logger,
        queryWithContext,
        buildMessageContent,
        sendMessage,
        messageStore,
        messageSecretStore,
        getCurrentCredentials,
        emitBotChunk,
        generateSid
    } = options

    return {
        listBots: async () => {
            const node = buildBotListIq()
            const result = await queryWithContext('bot.listBots', node)
            assertIqResult(result, 'bot.listBots')
            return parseBotListResult(result)
        },

        getBotProfile: async (jid, opts) => {
            const sid = await generateSid()
            const usyncNode = buildUsyncIq({
                sid,
                queryProtocolNodes: [buildGetBotProfileUsyncQueryNode()],
                users: [
                    {
                        jid,
                        content: buildBotProfileUsyncUserNodeContent(opts?.personaId)
                    }
                ]
            })
            const result = await queryWithContext('bot.getBotProfile', usyncNode, undefined, {
                jid
            })
            assertIqResult(result, 'bot.getBotProfile')
            logUsyncProtocolErrors(parseUsyncResultEnvelope(result), logger, 'bot.getBotProfile')
            return parseBotProfileUsync(result)
        },

        sendPrompt: async (to, content, opts = {}) => {
            // `to` wins when it is a @bot jid – caller chose a specific bot; ignore
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
            // botThreadInfo – Meta AI silently drops the request otherwise.
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
        },

        tryDecryptChunk: async (event) => {
            const message = event.message
            if (!message) return

            const inner = unwrapMessage(message)
            const sec = inner.secretEncryptedMessage
            if (!sec || !sec.encIv || !sec.encPayload) return

            const botNode = findNodeChild(event.rawNode, WA_NODE_TAGS.BOT)
            if (!botNode) return

            const metaNode = findNodeChild(event.rawNode, WA_NODE_TAGS.META)
            // msmsg chunks omit targetMessageKey; the prompt id lives in <meta target_id>
            const targetMessageId =
                sec.targetMessageKey?.id ?? metaNode?.attrs[WA_META_NODE_ATTRS_BOT.TARGET_ID]
            if (!targetMessageId) return

            const editAttr = botNode.attrs[WA_BOT_NODE_ATTRS.EDIT]
            const editType = (
                editAttr === WA_BOT_MSG_EDIT_TYPES.FIRST ||
                editAttr === WA_BOT_MSG_EDIT_TYPES.INNER ||
                editAttr === WA_BOT_MSG_EDIT_TYPES.LAST ||
                editAttr === WA_BOT_MSG_EDIT_TYPES.FULL
                    ? editAttr
                    : WA_BOT_MSG_EDIT_TYPES.FULL
            ) as WaBotMsgEditType
            const editTargetId = botNode.attrs[WA_BOT_NODE_ATTRS.EDIT_TARGET_ID] || undefined

            const useEditTargetSalt =
                editType === WA_BOT_MSG_EDIT_TYPES.INNER || editType === WA_BOT_MSG_EDIT_TYPES.LAST
            const saltId = useEditTargetSalt ? editTargetId : event.key.id
            if (!saltId) {
                logger.debug('bot chunk missing salt id', {
                    id: event.key.id,
                    editType,
                    hasEditTargetId: !!editTargetId
                })
                return
            }

            const senderJid = event.key.participant ?? event.key.remoteJid
            if (!senderJid) {
                logger.debug('bot chunk missing sender jid', { id: event.key.id })
                return
            }

            const metaTargetSenderJid = metaNode?.attrs[WA_META_NODE_ATTRS_BOT.TARGET_SENDER_JID]
            const credentials = getCurrentCredentials()
            const isFbidBotChat = event.key.remoteJid ? isBotJid(event.key.remoteJid) : false
            // FBID bot (`*@bot`) keys on user LID; legacy PN bot keys on user PN
            const meFallbackJid = isFbidBotChat
                ? (credentials?.meLid ?? credentials?.meJid)
                : credentials?.meJid
            const targetSenderJid = metaTargetSenderJid
                ? toUserJid(metaTargetSenderJid)
                : meFallbackJid
                  ? toUserJid(meFallbackJid)
                  : undefined
            if (!targetSenderJid) {
                logger.debug('bot chunk missing target sender jid (no me jid)', {
                    id: event.key.id,
                    isFbidBotChat
                })
                return
            }

            const parentEntry = await resolveParentMessageSecret(
                targetMessageId,
                messageSecretStore,
                messageStore
            )
            if (!parentEntry) {
                logger.debug('bot chunk parent message secret not found', {
                    id: event.key.id,
                    targetId: targetMessageId
                })
                return
            }

            let plaintext: Uint8Array
            try {
                plaintext = decryptBotChunk({
                    parentMessageSecret: parentEntry.secret,
                    saltId,
                    targetSenderJid,
                    authorJid: toUserJid(senderJid),
                    encIv: sec.encIv,
                    encPayload: sec.encPayload
                })
            } catch (error) {
                logger.warn('failed to decrypt bot chunk', {
                    id: event.key.id,
                    targetId: targetMessageId,
                    editType,
                    message: toError(error).message
                })
                return
            }

            let decoded: Proto.IMessage
            try {
                // msmsg payloads are not PKCS7-padded (unlike Signal messages);
                // wa-web decodes the gcm plaintext directly as a proto Message.
                decoded = proto.Message.decode(plaintext)
            } catch (error) {
                logger.warn('failed to decode decrypted bot chunk', {
                    id: event.key.id,
                    targetId: targetMessageId,
                    message: toError(error).message
                })
                return
            }

            emitBotChunk({
                rawNode: event.rawNode,
                key: event.key,
                stanzaType: event.stanzaType,
                offline: event.offline,
                targetMessageId,
                editType,
                editTargetId,
                saltId,
                plaintext,
                message: decoded,
                raw: message
            })
        }
    }
}
