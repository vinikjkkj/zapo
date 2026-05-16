import { proto } from '@proto'
import { WA_DEFAULTS } from '@protocol/defaults'
import { isBotJid } from '@protocol/jid'
import { TEXT_ENCODER } from '@util/bytes'

export const WA_BOT_MSG_EDIT_TYPES = Object.freeze({
    FIRST: 'first',
    INNER: 'inner',
    LAST: 'last',
    FULL: 'full'
} as const)

export type WaBotMsgEditType = (typeof WA_BOT_MSG_EDIT_TYPES)[keyof typeof WA_BOT_MSG_EDIT_TYPES]

export const WA_BOT_MSG_BODY_TYPES = Object.freeze({
    PROMPT: 'prompt',
    COMMAND: 'command',
    VOICE: 'voice'
} as const)

export type WaBotMsgBodyType = (typeof WA_BOT_MSG_BODY_TYPES)[keyof typeof WA_BOT_MSG_BODY_TYPES]

export const WA_BIZ_BOT_TYPES = Object.freeze({
    ONE_P: '1',
    THREE_P: '3'
} as const)

export type WaBizBotType = (typeof WA_BIZ_BOT_TYPES)[keyof typeof WA_BIZ_BOT_TYPES]

const META_AI_PN_USER = '13135550002'
const META_AI_FBID_USER = '867051314767696'
const META_AI_TEE_FBID_USER = '1273596044787272'
const META_AI_SIDECHAT_FBID_USER = '867051314767696555'
const MANUS_FBID_USER = '1807055946647696'
const HATCH_FBID_USER = '1807055946647697'

export const WA_BOT_KNOWN_JIDS = Object.freeze({
    META_AI_PN: `${META_AI_PN_USER}@${WA_DEFAULTS.HOST_DOMAIN}`,
    META_AI_FBID: `${META_AI_FBID_USER}@${WA_DEFAULTS.BOT_SERVER}`,
    META_AI_TEE_FBID: `${META_AI_TEE_FBID_USER}@${WA_DEFAULTS.BOT_SERVER}`,
    META_AI_SIDECHAT_FBID: `${META_AI_SIDECHAT_FBID_USER}@${WA_DEFAULTS.BOT_SERVER}`,
    MANUS_FBID: `${MANUS_FBID_USER}@${WA_DEFAULTS.BOT_SERVER}`,
    HATCH_FBID: `${HATCH_FBID_USER}@${WA_DEFAULTS.BOT_SERVER}`
} as const)

const PN_TO_FBID_BOT: Readonly<Record<string, string>> = Object.freeze({
    [WA_BOT_KNOWN_JIDS.META_AI_PN]: WA_BOT_KNOWN_JIDS.META_AI_FBID
})

export function resolveBotFbidJid(jid: string): string | null {
    if (isBotJid(jid)) return jid
    return PN_TO_FBID_BOT[jid] ?? null
}

export const WA_BOT_NODE_ATTRS = Object.freeze({
    EDIT: 'edit',
    EDIT_TARGET_ID: 'edit_target_id',
    SENDER_TIMESTAMP_MS: 'sender_timestamp_ms',
    BIZ_BOT: 'biz_bot',
    TYPE: 'type'
} as const)

export const WA_META_NODE_ATTRS_BOT = Object.freeze({
    TARGET_ID: 'target_id',
    TARGET_SENDER_JID: 'target_sender_jid',
    TARGET_CHAT_JID: 'target_chat_jid'
} as const)

export const WA_BOT_HKDF_INFO = TEXT_ENCODER.encode('Bot Message')
export const WA_BOT_MSG_SECRET_BYTES = 32

// Without a matching Bloks hash, Meta AI silently drops invoke mentions.
// Bump alongside the Bloks bundle versions shipped by WA Web.
export const WA_BLOKS_VERSIONING_ID =
    '98153664e5d904059a94ea08a59fc7eeaf977544cec64ab3ab793c0ce001eb92'

export const WA_BOT_RENDERING_PIXEL_DENSITY = 2.8125

// Default rich-response capability set; bots may reject prompts without one.
export const WA_BOT_DEFAULT_CAPABILITIES: readonly proto.BotCapabilityMetadata.BotCapabilityType[] =
    Object.freeze([
        proto.BotCapabilityMetadata.BotCapabilityType.RICH_RESPONSE_HEADING,
        proto.BotCapabilityMetadata.BotCapabilityType.RICH_RESPONSE_NESTED_LIST,
        proto.BotCapabilityMetadata.BotCapabilityType.RICH_RESPONSE_TABLE,
        proto.BotCapabilityMetadata.BotCapabilityType.RICH_RESPONSE_CODE,
        proto.BotCapabilityMetadata.BotCapabilityType.RICH_RESPONSE_STRUCTURED_RESPONSE,
        proto.BotCapabilityMetadata.BotCapabilityType.RICH_RESPONSE_SUB_HEADING,
        proto.BotCapabilityMetadata.BotCapabilityType.RICH_RESPONSE_LATEX,
        proto.BotCapabilityMetadata.BotCapabilityType.RICH_RESPONSE_INLINE_REELS,
        proto.BotCapabilityMetadata.BotCapabilityType.RICH_RESPONSE_LATEX_INLINE,
        proto.BotCapabilityMetadata.BotCapabilityType.RICH_RESPONSE_UNIFIED_RESPONSE,
        proto.BotCapabilityMetadata.BotCapabilityType.RICH_RESPONSE_SOURCES_IN_MESSAGE,
        proto.BotCapabilityMetadata.BotCapabilityType.RICH_RESPONSE_UNIFIED_TEXT_COMPONENT,
        proto.BotCapabilityMetadata.BotCapabilityType.RICH_RESPONSE_UNIFIED_SOURCES,
        proto.BotCapabilityMetadata.BotCapabilityType.RICH_RESPONSE_UNIFIED_DOMAIN_CITATIONS,
        proto.BotCapabilityMetadata.BotCapabilityType.RICH_RESPONSE_UR_INLINE_REELS_ENABLED
    ])
