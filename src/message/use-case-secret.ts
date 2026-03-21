import { hkdf, randomBytesAsync } from '@crypto'
import type { Proto } from '@proto'
import { TEXT_ENCODER, toBytesView } from '@util/bytes'

export const WA_MESSAGE_SECRET_BYTES = 32

export const WA_USE_CASE_SECRET_MODIFICATION_TYPES = Object.freeze({
    POLL_VOTE: 'Poll Vote',
    ENC_REACTION: 'Enc Reaction',
    ENC_COMMENT: 'Enc Comment',
    REPORT_TOKEN: 'Report Token',
    EVENT_RESPONSE: 'Event Response',
    EVENT_EDIT_ENCRYPTED: 'Event Edit',
    MESSAGE_EDIT: 'Message Edit'
} as const)

export function assertMessageSecret(
    messageSecret: Uint8Array | ArrayBuffer | ArrayBufferView,
    context = 'message secret'
): Uint8Array {
    const bytes = toBytesView(messageSecret)
    if (bytes.byteLength !== WA_MESSAGE_SECRET_BYTES) {
        throw new Error(
            `${context} must be ${WA_MESSAGE_SECRET_BYTES} bytes (got ${bytes.byteLength})`
        )
    }
    return bytes
}

export async function ensureMessageSecret(message: Proto.IMessage): Promise<Proto.IMessage> {
    const messageSecret = message.messageContextInfo?.messageSecret
    if (messageSecret && toBytesView(messageSecret).byteLength > 0) {
        return message
    }

    const generatedMessageSecret = await randomBytesAsync(WA_MESSAGE_SECRET_BYTES)
    return {
        ...message,
        messageContextInfo: {
            ...(message.messageContextInfo ?? {}),
            messageSecret: generatedMessageSecret
        }
    }
}

export async function createUseCaseSecret(input: {
    readonly messageSecret: Uint8Array | ArrayBuffer | ArrayBufferView
    readonly stanzaId: string
    readonly parentMsgOriginalSender: string
    readonly modificationSender: string
    readonly modificationType: (typeof WA_USE_CASE_SECRET_MODIFICATION_TYPES)[keyof typeof WA_USE_CASE_SECRET_MODIFICATION_TYPES]
}): Promise<Uint8Array> {
    if (!input.stanzaId.trim()) {
        throw new Error('stanza id must be a non-empty string')
    }
    if (!input.parentMsgOriginalSender.trim()) {
        throw new Error('parent message original sender must be a non-empty string')
    }
    if (!input.modificationSender.trim()) {
        throw new Error('modification sender must be a non-empty string')
    }

    const secretInfo = TEXT_ENCODER.encode(
        input.stanzaId +
            input.parentMsgOriginalSender +
            input.modificationSender +
            input.modificationType
    )
    return hkdf(assertMessageSecret(input.messageSecret), null, secretInfo, WA_MESSAGE_SECRET_BYTES)
}
