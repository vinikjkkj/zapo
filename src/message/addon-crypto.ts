import type { WaAddonKind } from '@client/types'
import { aesGcmDecrypt, aesGcmEncrypt, importAesGcmKey, sha256 } from '@crypto'
import { unwrapMessage } from '@message/content'
import {
    assertMessageSecret,
    createUseCaseSecret,
    WA_MESSAGE_SECRET_BYTES,
    WA_USE_CASE_SECRET_MODIFICATION_TYPES
} from '@message/use-case-secret'
import { proto } from '@proto'
import type { Proto } from '@proto'
import type {
    WaMessageSecretEntry,
    WaMessageSecretStore
} from '@store/contracts/message-secret.store'
import type { WaMessageStore } from '@store/contracts/message.store'
import { bytesToHex, EMPTY_BYTES, TEXT_ENCODER, toBytesView } from '@util/bytes'

const WA_ADDON_ENCRYPTION_NONCE_BYTES = 12

type WaAddonBytes = Uint8Array | ArrayBuffer | ArrayBufferView

type ModificationType =
    (typeof WA_USE_CASE_SECRET_MODIFICATION_TYPES)[keyof typeof WA_USE_CASE_SECRET_MODIFICATION_TYPES]

export function shouldUseAddonAdditionalData(modificationType: ModificationType): boolean {
    return (
        modificationType === WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE ||
        modificationType === WA_USE_CASE_SECRET_MODIFICATION_TYPES.EVENT_RESPONSE
    )
}

export function buildAddonAdditionalData(stanzaId: string, addOnSenderJid: string): Uint8Array {
    if (!stanzaId.trim()) {
        throw new Error('stanza id must be a non-empty string')
    }
    if (!addOnSenderJid.trim()) {
        throw new Error('addon sender jid must be a non-empty string')
    }
    return TEXT_ENCODER.encode(`${stanzaId}\u0000${addOnSenderJid}`)
}

export async function encryptAddonPayload(input: {
    readonly messageSecret: WaAddonBytes
    readonly stanzaId: string
    readonly parentMsgOriginalSender: string
    readonly modificationSender: string
    readonly modificationType: ModificationType
    readonly payload: WaAddonBytes
    readonly iv: WaAddonBytes
    readonly additionalData?: WaAddonBytes
}): Promise<Uint8Array> {
    const secret = await createUseCaseSecret({
        messageSecret: assertMessageSecret(input.messageSecret),
        stanzaId: input.stanzaId,
        parentMsgOriginalSender: input.parentMsgOriginalSender,
        modificationSender: input.modificationSender,
        modificationType: input.modificationType
    })
    const key = await importAesGcmKey(secret, ['encrypt'])
    const iv = assertAddonIv(input.iv)
    const additionalData = resolveAddonAdditionalData(input)
    return aesGcmEncrypt(key, iv, toBytesView(input.payload), additionalData)
}

export async function decryptAddonPayload(input: {
    readonly messageSecret: WaAddonBytes
    readonly stanzaId: string
    readonly parentMsgOriginalSender: string
    readonly modificationSender: string
    readonly modificationType: ModificationType
    readonly ciphertext: WaAddonBytes
    readonly iv: WaAddonBytes
    readonly additionalData?: WaAddonBytes
}): Promise<Uint8Array> {
    const secret = await createUseCaseSecret({
        messageSecret: assertMessageSecret(input.messageSecret),
        stanzaId: input.stanzaId,
        parentMsgOriginalSender: input.parentMsgOriginalSender,
        modificationSender: input.modificationSender,
        modificationType: input.modificationType
    })
    const key = await importAesGcmKey(secret, ['decrypt'])
    const iv = assertAddonIv(input.iv)
    const additionalData = resolveAddonAdditionalData(input)
    return aesGcmDecrypt(key, iv, toBytesView(input.ciphertext), additionalData)
}

export interface WaIdentifiedEncAddon {
    readonly kind: WaAddonKind
    readonly targetMessageKey: Proto.IMessageKey
    readonly encPayload: Uint8Array
    readonly encIv: Uint8Array
    readonly modificationType: ModificationType
    readonly raw: Proto.IMessage
}

export function identifyEncryptedAddon(message: Proto.IMessage): WaIdentifiedEncAddon | null {
    const msg = unwrapMessage(message)

    if (msg.encReactionMessage) {
        const { targetMessageKey, encPayload, encIv } = msg.encReactionMessage
        if (targetMessageKey && encPayload && encIv) {
            return {
                kind: 'reaction',
                targetMessageKey,
                encPayload: encPayload,
                encIv: encIv,
                modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.ENC_REACTION,
                raw: message
            }
        }
    }

    if (msg.pollUpdateMessage) {
        const { pollCreationMessageKey, vote } = msg.pollUpdateMessage
        if (pollCreationMessageKey && vote?.encPayload && vote.encIv) {
            return {
                kind: 'poll_vote',
                targetMessageKey: pollCreationMessageKey,
                encPayload: vote.encPayload,
                encIv: vote.encIv,
                modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE,
                raw: message
            }
        }
    }

    if (msg.encEventResponseMessage) {
        const { eventCreationMessageKey, encPayload, encIv } = msg.encEventResponseMessage
        if (eventCreationMessageKey && encPayload && encIv) {
            return {
                kind: 'event_response',
                targetMessageKey: eventCreationMessageKey,
                encPayload: encPayload,
                encIv: encIv,
                modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.EVENT_RESPONSE,
                raw: message
            }
        }
    }

    if (msg.encCommentMessage) {
        const { targetMessageKey, encPayload, encIv } = msg.encCommentMessage
        if (targetMessageKey && encPayload && encIv) {
            return {
                kind: 'comment',
                targetMessageKey,
                encPayload: encPayload,
                encIv: encIv,
                modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.ENC_COMMENT,
                raw: message
            }
        }
    }

    return null
}

export type WaDecodedAddon =
    | { readonly kind: 'reaction'; readonly reaction: Proto.Message.IReactionMessage }
    | {
          readonly kind: 'poll_vote'
          readonly pollVote: Proto.Message.IPollVoteMessage
          readonly selectedOptionNames: readonly string[] | null
      }
    | {
          readonly kind: 'event_response'
          readonly eventResponse: Proto.Message.IEventResponseMessage
      }
    | { readonly kind: 'comment'; readonly comment: Proto.Message.ICommentMessage }

export function decodeAddonPlaintext(kind: WaAddonKind, plaintext: Uint8Array): WaDecodedAddon {
    switch (kind) {
        case 'reaction':
            return { kind, reaction: proto.Message.ReactionMessage.decode(plaintext) }
        case 'poll_vote':
            return {
                kind,
                pollVote: proto.Message.PollVoteMessage.decode(plaintext),
                selectedOptionNames: null
            }
        case 'event_response':
            return { kind, eventResponse: proto.Message.EventResponseMessage.decode(plaintext) }
        case 'comment':
            return { kind, comment: proto.Message.CommentMessage.decode(plaintext) }
    }
}

export async function resolveParentMessageSecret(
    targetMessageId: string,
    messageSecretStore: WaMessageSecretStore,
    messageStore: WaMessageStore
): Promise<WaMessageSecretEntry | null> {
    const cached = await messageSecretStore.get(targetMessageId)
    if (cached) return cached

    const record = await messageStore.getById(targetMessageId)
    if (!record?.messageBytes) return null

    try {
        const decoded = proto.Message.decode(record.messageBytes)
        const secret = decoded.messageContextInfo?.messageSecret
        if (!secret || secret.byteLength !== WA_MESSAGE_SECRET_BYTES) return null
        return { secret, senderJid: record.senderJid ?? '' }
    } catch {
        return null
    }
}

export async function resolvePollOptionNames(
    selectedOptions: readonly Uint8Array[],
    pollCreationMessageId: string,
    messageStore: WaMessageStore
): Promise<readonly string[] | null> {
    const record = await messageStore.getById(pollCreationMessageId)
    if (!record?.messageBytes) return null

    let decoded: ReturnType<typeof proto.Message.decode>
    try {
        decoded = proto.Message.decode(record.messageBytes)
    } catch {
        return null
    }
    const pollMsg = unwrapMessage(decoded)
    const options =
        pollMsg.pollCreationMessage?.options ??
        pollMsg.pollCreationMessageV2?.options ??
        pollMsg.pollCreationMessageV3?.options ??
        pollMsg.pollCreationMessageV5?.options
    if (!options || options.length === 0) return null

    const hashToName = new Map<string, string>()
    for (const option of options) {
        if (!option.optionName) continue
        const hash = await sha256(TEXT_ENCODER.encode(option.optionName))
        hashToName.set(bytesToHex(hash), option.optionName)
    }

    const names: string[] = []
    for (const selected of selectedOptions) {
        const hex = bytesToHex(selected)
        const name = hashToName.get(hex)
        if (!name) return null
        names.push(name)
    }
    return names
}

function assertAddonIv(iv: WaAddonBytes): Uint8Array {
    const normalized = toBytesView(iv)
    if (normalized.byteLength !== WA_ADDON_ENCRYPTION_NONCE_BYTES) {
        throw new Error(
            `addon iv must be ${WA_ADDON_ENCRYPTION_NONCE_BYTES} bytes (got ${normalized.byteLength})`
        )
    }
    return normalized
}

function resolveAddonAdditionalData(input: {
    readonly stanzaId: string
    readonly modificationSender: string
    readonly modificationType: ModificationType
    readonly additionalData?: WaAddonBytes
}): Uint8Array {
    if (input.additionalData) {
        return toBytesView(input.additionalData)
    }
    if (!shouldUseAddonAdditionalData(input.modificationType)) {
        return EMPTY_BYTES
    }
    return buildAddonAdditionalData(input.stanzaId, input.modificationSender)
}
