import { aesGcmDecrypt, hkdf } from '@crypto'
import { buildAddonAdditionalData } from '@message/crypto/addon-crypto'
import { assertMessageSecret } from '@message/crypto/use-case-secret'
import { proto, type Proto } from '@proto'
import { WA_BOT_HKDF_INFO, WA_BOT_MSG_SECRET_BYTES } from '@protocol/bot'
import { isBotJid } from '@protocol/jid'
import { TEXT_ENCODER, toBytesView } from '@util/bytes'

export function genBotMsgSecret(messageSecret: Uint8Array | ArrayBufferView): Uint8Array {
    const ikm = assertMessageSecret(messageSecret, 'bot parent message secret')
    return hkdf(ikm, null, WA_BOT_HKDF_INFO, WA_BOT_MSG_SECRET_BYTES)
}

export function deriveBotChunkKey(input: {
    readonly botMsgSecret: Uint8Array | ArrayBufferView
    readonly saltId: string
    readonly targetSenderJid: string
    readonly authorJid: string
}): Uint8Array {
    if (!input.saltId) throw new Error('bot chunk salt id must be a non-empty string')
    if (!input.targetSenderJid)
        throw new Error('bot chunk target sender jid must be a non-empty string')
    if (!input.authorJid) throw new Error('bot chunk author jid must be a non-empty string')

    const info = TEXT_ENCODER.encode(input.saltId + input.targetSenderJid + input.authorJid)
    return hkdf(toBytesView(input.botMsgSecret), null, info, WA_BOT_MSG_SECRET_BYTES)
}

export interface DecryptBotChunkInput {
    readonly parentMessageSecret: Uint8Array | ArrayBufferView
    readonly saltId: string
    readonly targetSenderJid: string
    readonly authorJid: string
    readonly encIv: Uint8Array | ArrayBufferView
    readonly encPayload: Uint8Array | ArrayBufferView
}

export function decryptBotChunk(input: DecryptBotChunkInput): Uint8Array {
    const botMsgSecret = genBotMsgSecret(input.parentMessageSecret)
    const key = deriveBotChunkKey({
        botMsgSecret,
        saltId: input.saltId,
        targetSenderJid: input.targetSenderJid,
        authorJid: input.authorJid
    })
    return aesGcmDecrypt(
        key,
        toBytesView(input.encIv),
        toBytesView(input.encPayload),
        buildAddonAdditionalData(input.saltId, input.authorJid)
    )
}

export interface WaBotMetadataInput {
    readonly personaId?: string
    readonly invokerJid?: string
    readonly capabilities?: readonly proto.BotCapabilityMetadata.BotCapabilityType[]
}

export function attachBotMetadata(
    message: Proto.IMessage,
    input: WaBotMetadataInput
): Proto.IMessage {
    if (!input.personaId && !input.invokerJid && !input.capabilities) {
        return message
    }

    const botMetadata: Proto.IBotMetadata = {}
    if (input.personaId) botMetadata.personaId = input.personaId
    if (input.invokerJid) botMetadata.invokerJid = input.invokerJid
    if (input.capabilities && input.capabilities.length > 0) {
        botMetadata.capabilityMetadata = {
            capabilities: input.capabilities as proto.BotCapabilityMetadata.BotCapabilityType[]
        }
    }

    return {
        ...message,
        messageContextInfo: {
            ...(message.messageContextInfo ?? {}),
            botMetadata
        }
    }
}

export interface WaBotThreadInput {
    readonly aiThreadId: string
    readonly remoteJid: string
    readonly threadType?: proto.AIThreadInfo.AIThreadClientInfo.AIThreadType
}

export function attachBotThread(message: Proto.IMessage, input: WaBotThreadInput): Proto.IMessage {
    const ctx = message.messageContextInfo ?? {}
    const existingBotMetadata = ctx.botMetadata ?? {}
    const threadType =
        input.threadType ?? proto.AIThreadInfo.AIThreadClientInfo.AIThreadType.DEFAULT
    return {
        ...message,
        messageContextInfo: {
            ...ctx,
            threadId: [
                {
                    threadType: proto.ThreadID.ThreadType.AI_THREAD,
                    threadKey: {
                        remoteJid: input.remoteJid,
                        fromMe: true,
                        id: input.aiThreadId
                    }
                }
            ],
            botMetadata: {
                ...existingBotMetadata,
                botThreadInfo: { clientInfo: { type: threadType } }
            }
        }
    }
}

export function extractInvokedBotJid(message: Proto.IMessage): string | null {
    const inner = message.botInvokeMessage?.message
    if (!inner) return null
    // Mention metadata lives on whichever submessage carries the body – text
    // prompts on extendedTextMessage, media prompts on the caption-bearing body.
    const mentioned =
        inner.extendedTextMessage?.contextInfo?.mentionedJid ??
        inner.imageMessage?.contextInfo?.mentionedJid ??
        inner.videoMessage?.contextInfo?.mentionedJid ??
        inner.documentMessage?.contextInfo?.mentionedJid
    if (!mentioned) return null
    for (const jid of mentioned) {
        if (isBotJid(jid)) return jid
    }
    return null
}

// Mirrors `WAWebE2EProtoGenerator.updateBotInvokeMsgProtoCopyForCapi`, minus
// the pushname rewrite (raw mentions are accepted by Meta AI).
export function buildBotInvokeProtoCopy(
    message: Proto.IMessage,
    botMessageSecret?: Uint8Array
): Proto.IMessage {
    const { messageContextInfo, ...rest } = message
    if (!messageContextInfo && !botMessageSecret) return rest
    const nextContextInfo: Proto.IMessageContextInfo = {
        ...(messageContextInfo ?? {}),
        messageSecret: undefined
    }
    if (botMessageSecret) {
        nextContextInfo.botMessageSecret = botMessageSecret
    }
    return { ...rest, messageContextInfo: nextContextInfo }
}
