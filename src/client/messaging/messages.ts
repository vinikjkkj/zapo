import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'

import {
    assertMediaUploadStatus,
    buildMediaUploadUrl,
    cleanupTempFile,
    hasMediaProcessingTasks,
    isReadableStream,
    parseMediaUploadJsonBody,
    parseWebpAnimation,
    readFileHead,
    resolveMediaInputs,
    runMediaProcessor,
    selectMediaUploadHost,
    shouldNormalizeVoiceNote
} from '@client/media'
import type { ResolvedLinkPreviewResult } from '@client/messaging/link-preview'
import type { WaMediaOptions } from '@client/types'
import { aesGcmEncrypt, randomBytesAsync, sha256 } from '@crypto'
import type { Logger } from '@infra/log/types'
import { MEDIA_CONN_CACHE_GRACE_MS, MEDIA_UPLOAD_PATHS } from '@media/constants'
import { WaMediaCrypto } from '@media/crypto/WaMediaCrypto'
import { createStickerPackZipStream } from '@media/sticker/sticker-pack'
import { parseMediaConnResponse } from '@media/transfer/conn'
import type { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import type { MediaCryptoType, WaMediaConn } from '@media/types'
import { buildExtendedTextWithPreview } from '@message/addons/link-preview/builder'
import {
    buildAddonAdditionalData,
    shouldUseAddonAdditionalData
} from '@message/crypto/addon-crypto'
import {
    createUseCaseSecret,
    WA_USE_CASE_SECRET_MODIFICATION_TYPES
} from '@message/crypto/use-case-secret'
import {
    isSendEventMessage,
    isSendEventResponseMessage,
    isSendKeepMessage,
    isSendMediaMessage,
    isSendPinMessage,
    isSendPollMessage,
    isSendPollVoteMessage,
    isSendReactionMessage,
    isSendRevokeMessage,
    isSendTextMessage,
    resolveMessageTarget
} from '@message/encode/content'
import {
    toStickerPackProtoStickers,
    toStickerPackZipEntries,
    validateStickerPackInput
} from '@message/kinds/sticker-pack'
import type {
    WaMessageBuildResult,
    WaMessageKey,
    WaMessageUploadInfo,
    WaSendEventMessage,
    WaSendEventResponseMessage,
    WaSendEventResponseType,
    WaSendKeepMessage,
    WaSendMediaMessage,
    WaSendMessageContent,
    WaSendPinMessage,
    WaSendPollMessage,
    WaSendPollVoteMessage,
    WaSendReactionMessage,
    WaSendRevokeMessage,
    WaSendStickerPackMessage,
    WaSendTextMessage
} from '@message/types'
import { proto, type Proto } from '@proto'
import { WA_DEFAULTS } from '@protocol/constants'
import { isBroadcastJid, isGroupJid, toUserJid } from '@protocol/jid'
import { buildMediaConnIq } from '@transport/node/builders/media'
import type { BinaryNode } from '@transport/types'
import { bytesToBase64, TEXT_ENCODER, toBytesView } from '@util/bytes'
import { toError } from '@util/primitives'

const VOICE_NOTE_MIMETYPE = 'audio/ogg; codecs=opus'

export interface WaMediaMessageOptions {
    readonly logger: Logger
    readonly mediaTransfer: WaMediaTransferClient
    readonly iqTimeoutMs?: number
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
    readonly getMediaConnCache: () => WaMediaConn | null
    readonly setMediaConnCache: (mediaConn: WaMediaConn | null) => void
    readonly media?: WaMediaOptions
    readonly linkPreviewResolver?: (
        content: WaSendTextMessage
    ) => Promise<ResolvedLinkPreviewResult | null>
}

export interface WaBuildMessageContext {
    readonly to: string
    /** Outgoing stanza id, pre-resolved. Required for addon-crypto kinds (poll-vote, event-response). */
    readonly outgoingStanzaId?: string
    /** Current me jid (used as modificationSender for addon crypto). */
    readonly meJid?: string
}

function requireCtxField(
    ctx: WaBuildMessageContext | undefined,
    field: string,
    kind: string
): void {
    const value = ctx ? (ctx as unknown as Record<string, unknown>)[field] : undefined
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${kind} message requires ${field} in build context`)
    }
}

function buildMessageKey(
    remoteJid: string,
    fromMe: boolean,
    id: string,
    participant?: string
): Proto.IMessageKey {
    return {
        remoteJid,
        fromMe,
        id,
        ...(participant ? { participant } : {})
    }
}

/**
 * Builds the proto key for a reply/edit/reaction/revoke/pin target. `remoteJid`
 * is forced to the send recipient and `participant` is dropped in 1:1 chats
 * (only meaningful in groups/broadcasts).
 */
function targetMessageKey(remoteJid: string, key: WaMessageKey): Proto.IMessageKey {
    const inGroup = isGroupJid(remoteJid) || isBroadcastJid(remoteJid)
    return buildMessageKey(remoteJid, key.fromMe, key.id, inGroup ? key.participant : undefined)
}

function buildReactionMessage(
    content: WaSendReactionMessage,
    ctx?: WaBuildMessageContext
): Proto.IMessage {
    requireCtxField(ctx, 'to', 'reaction')
    return {
        reactionMessage: {
            key: targetMessageKey(ctx!.to, resolveMessageTarget(content.target)),
            text: content.emoji,
            senderTimestampMs: content.senderTimestampMs ?? Date.now()
        }
    }
}

function buildRevokeMessage(
    content: WaSendRevokeMessage,
    ctx?: WaBuildMessageContext
): Proto.IMessage {
    requireCtxField(ctx, 'to', 'revoke')
    return {
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.REVOKE,
            key: targetMessageKey(ctx!.to, resolveMessageTarget(content.target))
        }
    }
}

function buildPinMessage(content: WaSendPinMessage, ctx?: WaBuildMessageContext): Proto.IMessage {
    requireCtxField(ctx, 'to', content.type)
    return {
        pinInChatMessage: {
            key: targetMessageKey(ctx!.to, resolveMessageTarget(content.target)),
            type:
                content.type === 'pin'
                    ? proto.Message.PinInChatMessage.Type.PIN_FOR_ALL
                    : proto.Message.PinInChatMessage.Type.UNPIN_FOR_ALL,
            senderTimestampMs: content.senderTimestampMs ?? Date.now()
        }
    }
}

function buildKeepMessage(content: WaSendKeepMessage, ctx?: WaBuildMessageContext): Proto.IMessage {
    requireCtxField(ctx, 'to', content.type)
    return {
        keepInChatMessage: {
            key: targetMessageKey(ctx!.to, resolveMessageTarget(content.target)),
            keepType:
                content.type === 'keep'
                    ? proto.KeepType.KEEP_FOR_ALL
                    : proto.KeepType.UNDO_KEEP_FOR_ALL,
            timestampMs: content.timestampMs ?? Date.now()
        }
    }
}

function buildPollCreationMessage(content: WaSendPollMessage): Proto.IMessage {
    if (content.options.length === 0) {
        throw new Error('poll message requires at least one option')
    }
    const options: Proto.Message.PollCreationMessage.IOption[] = content.options.map((opt) => ({
        optionName: typeof opt === 'string' ? opt : opt.name
    }))
    return {
        pollCreationMessageV3: {
            name: content.name,
            options,
            selectableOptionsCount: content.selectableCount ?? 1,
            ...(content.allowAddOption !== undefined
                ? { allowAddOption: content.allowAddOption }
                : {}),
            ...(content.hideParticipantName !== undefined
                ? { hideParticipantName: content.hideParticipantName }
                : {})
        }
    }
}

function buildEventMessage(content: WaSendEventMessage): Proto.IMessage {
    const eventMessage: Proto.Message.IEventMessage = {
        name: content.name,
        startTime: content.startTime,
        isCanceled: content.isCanceled ?? false
    }
    if (content.description !== undefined) eventMessage.description = content.description
    if (content.endTime !== undefined) eventMessage.endTime = content.endTime
    if (content.joinLink !== undefined) eventMessage.joinLink = content.joinLink
    if (content.extraGuestsAllowed !== undefined)
        eventMessage.extraGuestsAllowed = content.extraGuestsAllowed
    if (content.isScheduleCall !== undefined) eventMessage.isScheduleCall = content.isScheduleCall
    if (content.hasReminder !== undefined) eventMessage.hasReminder = content.hasReminder
    if (content.reminderOffsetSec !== undefined)
        eventMessage.reminderOffsetSec = content.reminderOffsetSec
    if (content.location) {
        eventMessage.location = {
            degreesLatitude: content.location.latitude,
            degreesLongitude: content.location.longitude,
            ...(content.location.name !== undefined ? { name: content.location.name } : {}),
            ...(content.location.address !== undefined ? { address: content.location.address } : {})
        }
    }
    return { eventMessage }
}

const EVENT_RESPONSE_ENUM: Readonly<
    Record<WaSendEventResponseType, Proto.Message.EventResponseMessage.EventResponseType>
> = {
    going: proto.Message.EventResponseMessage.EventResponseType.GOING,
    not_going: proto.Message.EventResponseMessage.EventResponseType.NOT_GOING,
    maybe: proto.Message.EventResponseMessage.EventResponseType.MAYBE
}

async function encryptAddonForOutgoing(input: {
    readonly messageSecret: Uint8Array
    readonly parentStanzaId: string
    readonly parentMsgOriginalSender: string
    readonly modificationSender: string
    readonly modificationType: (typeof WA_USE_CASE_SECRET_MODIFICATION_TYPES)[keyof typeof WA_USE_CASE_SECRET_MODIFICATION_TYPES]
    readonly payload: Uint8Array
}): Promise<{ readonly encPayload: Uint8Array; readonly encIv: Uint8Array }> {
    const secret = await createUseCaseSecret({
        messageSecret: input.messageSecret,
        stanzaId: input.parentStanzaId,
        parentMsgOriginalSender: input.parentMsgOriginalSender,
        modificationSender: input.modificationSender,
        modificationType: input.modificationType
    })
    const iv = await randomBytesAsync(12)
    const additionalData = shouldUseAddonAdditionalData(input.modificationType)
        ? buildAddonAdditionalData(input.parentStanzaId, input.modificationSender)
        : undefined
    const encPayload = aesGcmEncrypt(secret, iv, input.payload, additionalData)
    return { encPayload, encIv: iv }
}

async function buildPollVoteMessage(
    content: WaSendPollVoteMessage,
    ctx?: WaBuildMessageContext
): Promise<Proto.IMessage> {
    requireCtxField(ctx, 'outgoingStanzaId', 'poll-vote')
    requireCtxField(ctx, 'meJid', 'poll-vote')
    if (content.selectedOptionNames.length === 0) {
        throw new Error('poll-vote requires at least one selected option')
    }
    const selectedOptions = content.selectedOptionNames.map((name) =>
        sha256(TEXT_ENCODER.encode(name))
    )
    const payload = proto.Message.PollVoteMessage.encode({ selectedOptions }).finish()
    const { encPayload, encIv } = await encryptAddonForOutgoing({
        messageSecret: content.poll.messageSecret,
        parentStanzaId: content.poll.id,
        parentMsgOriginalSender: toUserJid(content.poll.authorJid),
        modificationSender: toUserJid(ctx!.meJid!),
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE,
        payload
    })
    return {
        pollUpdateMessage: {
            pollCreationMessageKey: buildMessageKey(
                ctx!.to,
                content.poll.fromMe,
                content.poll.id,
                content.poll.participant
            ),
            vote: { encPayload, encIv },
            senderTimestampMs: content.senderTimestampMs ?? Date.now()
        }
    }
}

async function buildEventResponseMessage(
    content: WaSendEventResponseMessage,
    ctx?: WaBuildMessageContext
): Promise<Proto.IMessage> {
    requireCtxField(ctx, 'outgoingStanzaId', 'event-response')
    requireCtxField(ctx, 'meJid', 'event-response')
    const responseProto: Proto.Message.IEventResponseMessage = {
        response: EVENT_RESPONSE_ENUM[content.response],
        timestampMs: content.timestampMs ?? Date.now()
    }
    if (content.extraGuestCount !== undefined) {
        responseProto.extraGuestCount = content.extraGuestCount
    }
    const payload = proto.Message.EventResponseMessage.encode(responseProto).finish()
    const { encPayload, encIv } = await encryptAddonForOutgoing({
        messageSecret: content.event.messageSecret,
        parentStanzaId: content.event.id,
        parentMsgOriginalSender: toUserJid(content.event.authorJid),
        modificationSender: toUserJid(ctx!.meJid!),
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.EVENT_RESPONSE,
        payload
    })
    return {
        encEventResponseMessage: {
            eventCreationMessageKey: buildMessageKey(
                ctx!.to,
                content.event.fromMe,
                content.event.id,
                content.event.participant
            ),
            encPayload,
            encIv
        }
    }
}

export async function buildMediaMessageContent(
    options: WaMediaMessageOptions,
    content: WaSendMessageContent,
    ctx?: WaBuildMessageContext
): Promise<WaMessageBuildResult> {
    if (typeof content === 'string') {
        return { message: { conversation: content } }
    }
    if (isSendTextMessage(content)) {
        if (options.linkPreviewResolver) {
            try {
                const preview = await options.linkPreviewResolver(content)
                if (preview !== null) {
                    return {
                        message: buildExtendedTextWithPreview(
                            content.text,
                            preview.resolved,
                            preview.thumbnailFields
                        )
                    }
                }
            } catch (error) {
                options.logger.warn('link preview resolver failed, sending plain text', {
                    message: toError(error).message
                })
            }
        }
        return { message: { extendedTextMessage: { text: content.text } } }
    }
    if (isSendReactionMessage(content)) return { message: buildReactionMessage(content, ctx) }
    if (isSendRevokeMessage(content)) return { message: buildRevokeMessage(content, ctx) }
    if (isSendPinMessage(content)) return { message: buildPinMessage(content, ctx) }
    if (isSendKeepMessage(content)) return { message: buildKeepMessage(content, ctx) }
    if (isSendPollMessage(content)) return { message: buildPollCreationMessage(content) }
    if (isSendEventMessage(content)) return { message: buildEventMessage(content) }
    if (isSendPollVoteMessage(content)) {
        return { message: await buildPollVoteMessage(content, ctx) }
    }
    if (isSendEventResponseMessage(content)) {
        return { message: await buildEventResponseMessage(content, ctx) }
    }
    if (isSendMediaMessage(content)) {
        return buildMediaMessage(options, content)
    }
    if (!content || typeof content !== 'object') {
        throw new Error('invalid message content')
    }
    return { message: content }
}

export async function getMediaConn(
    options: WaMediaMessageOptions,
    forceRefresh = false
): Promise<WaMediaConn> {
    const cached = options.getMediaConnCache()
    if (!forceRefresh && cached && Date.now() + MEDIA_CONN_CACHE_GRACE_MS < cached.expiresAtMs) {
        return cached
    }

    const response = await options.queryWithContext(
        'media_conn.fetch',
        buildMediaConnIq(),
        options.iqTimeoutMs ?? WA_DEFAULTS.IQ_TIMEOUT_MS
    )
    const mediaConn = parseMediaConnResponse(response, Date.now())
    options.setMediaConnCache(mediaConn)
    return mediaConn
}

function needsSidecar(content: Exclude<WaSendMediaMessage, WaSendStickerPackMessage>): boolean {
    return content.type === 'video' || content.type === 'ptv' || content.type === 'audio'
}

function resolveUploadType(
    content: Exclude<WaSendMediaMessage, WaSendStickerPackMessage>
): MediaCryptoType {
    if (content.type === 'video' && content.gifPlayback) return 'gif'
    if (content.type === 'audio' && content.ptt) return 'ptt'
    return content.type as MediaCryptoType
}

async function resolveMimetype(
    content: Exclude<WaSendMediaMessage, WaSendStickerPackMessage>,
    media: WaMediaOptions | undefined,
    processorInput: string | Uint8Array | undefined
): Promise<string> {
    if (content.mimetype) return content.mimetype
    if (content.type === 'sticker') return 'image/webp'
    const detect = media?.processor?.detectMimetype
    if (detect && processorInput !== undefined) {
        const detected = await detect(processorInput)
        if (detected) return detected
    }
    throw new Error(
        `mimetype is required for ${content.type} messages (or configure a WaMediaProcessor with detectMimetype)`
    )
}

async function buildMediaMessage(
    options: WaMediaMessageOptions,
    content: WaSendMediaMessage
): Promise<WaMessageBuildResult> {
    if (content.type === 'sticker-pack') {
        return buildStickerPackMediaMessage(options, content)
    }
    if (shouldNormalizeVoiceNote(options.media, content)) {
        const sourceInput =
            content.media instanceof ArrayBuffer ? toBytesView(content.media) : content.media
        try {
            const normalizedStream =
                await options.media!.processor!.normalizeVoiceNote!(sourceInput)
            if (normalizedStream) {
                content = { ...content, media: normalizedStream, mimetype: VOICE_NOTE_MIMETYPE }
            }
        } catch (error) {
            options.logger.warn('voice note normalize failed, sending original media', {
                message: toError(error).message
            })
        }
    }
    const needsMimetypeDetection =
        !content.mimetype &&
        content.type !== 'sticker' &&
        !!options.media?.processor?.detectMimetype &&
        isReadableStream(content.media)
    const needsTempFile =
        hasMediaProcessingTasks(options.media, content) ||
        (content.type === 'sticker' && content.firstFrameLength === undefined) ||
        needsMimetypeDetection
    const resolved = await resolveMediaInputs(needsTempFile, content.media)
    const mimetype = await resolveMimetype(content, options.media, resolved.processorInput)

    try {
        let detectedFirstFrameLength: number | undefined
        if (
            content.type === 'sticker' &&
            content.firstFrameLength === undefined &&
            resolved.processorInput
        ) {
            const input = resolved.processorInput
            const header =
                typeof input === 'string' ? await readFileHead(input, 100) : input.subarray(0, 100)
            detectedFirstFrameLength = parseWebpAnimation(header)?.firstFrameLength
        }
        const firstFrameLength =
            content.type === 'sticker'
                ? (content.firstFrameLength ?? detectedFirstFrameLength)
                : undefined

        const uploadPromise = isReadableStream(resolved.uploadMedia)
            ? uploadMediaStream(options, content, resolved.uploadMedia, firstFrameLength, mimetype)
            : uploadMediaBytes(options, content, resolved.uploadMedia, firstFrameLength, mimetype)
        const processPromise = runMediaProcessor(
            options.media,
            resolved.processorInput,
            content,
            options.logger
        )
        const [uploadResult, processResult] = await Promise.allSettled([
            uploadPromise,
            processPromise
        ])
        if (uploadResult.status === 'rejected') throw uploadResult.reason
        if (processResult.status === 'rejected') throw processResult.reason
        const uploaded = uploadResult.value
        const processed = processResult.value
        const mediaKeyTimestamp = Math.floor(Date.now() / 1000)
        const uploadedFields = {
            url: uploaded.url,
            fileSha256: uploaded.fileSha256,
            fileLength: uploaded.fileLength,
            mediaKey: uploaded.mediaKey,
            fileEncSha256: uploaded.fileEncSha256,
            directPath: uploaded.directPath,
            mediaKeyTimestamp,
            mimetype
        }
        const uploadSummary: WaMessageUploadInfo = {
            url: uploaded.url,
            directPath: uploaded.directPath,
            fileSha256: uploaded.fileSha256,
            fileLength: uploaded.fileLength,
            metadataUrl: uploaded.metadataUrl
        }

        function spread(c: WaSendMediaMessage): Record<string, unknown> {
            const result: Record<string, unknown> = {}
            for (const key in c) {
                if (
                    key !== 'type' &&
                    key !== 'media' &&
                    key !== 'fileLength' &&
                    key !== 'mimetype'
                ) {
                    result[key] = (c as unknown as Record<string, unknown>)[key]
                }
            }
            return result
        }

        switch (content.type) {
            case 'image':
                return {
                    upload: uploadSummary,
                    message: {
                        imageMessage: {
                            ...spread(content),
                            ...uploadedFields,
                            width: content.width ?? processed.width,
                            height: content.height ?? processed.height,
                            jpegThumbnail: content.jpegThumbnail ?? processed.jpegThumbnail
                        }
                    }
                }
            case 'video':
                return {
                    upload: uploadSummary,
                    message: {
                        videoMessage: {
                            ...spread(content),
                            ...uploadedFields,
                            seconds: content.seconds ?? processed.seconds,
                            width: content.width ?? processed.width,
                            height: content.height ?? processed.height,
                            jpegThumbnail: content.jpegThumbnail ?? processed.jpegThumbnail,
                            streamingSidecar: uploaded.streamingSidecar,
                            metadataUrl: uploaded.metadataUrl
                        }
                    }
                }
            case 'ptv':
                return {
                    upload: uploadSummary,
                    message: {
                        ptvMessage: {
                            ...spread(content),
                            ...uploadedFields,
                            seconds: content.seconds ?? processed.seconds,
                            width: content.width ?? processed.width,
                            height: content.height ?? processed.height,
                            jpegThumbnail: content.jpegThumbnail ?? processed.jpegThumbnail,
                            streamingSidecar: uploaded.streamingSidecar
                        }
                    }
                }
            case 'audio':
                return {
                    upload: uploadSummary,
                    message: {
                        audioMessage: {
                            ...spread(content),
                            ...uploadedFields,
                            seconds: content.seconds ?? processed.seconds,
                            streamingSidecar: uploaded.streamingSidecar,
                            waveform: content.waveform ?? processed.waveform
                        }
                    }
                }
            case 'document':
                return {
                    upload: uploadSummary,
                    message: {
                        documentMessage: {
                            ...spread(content),
                            ...uploadedFields,
                            fileName: content.fileName ?? 'file',
                            title: content.title ?? content.fileName ?? undefined,
                            jpegThumbnail: content.jpegThumbnail ?? processed.jpegThumbnail
                        }
                    }
                }
            case 'sticker':
                return {
                    upload: uploadSummary,
                    message: {
                        stickerMessage: {
                            ...spread(content),
                            ...uploadedFields,
                            width: content.width ?? processed.width,
                            height: content.height ?? processed.height,
                            pngThumbnail: content.pngThumbnail ?? processed.pngThumbnail,
                            isAnimated:
                                content.isAnimated ??
                                processed.isAnimated ??
                                firstFrameLength !== undefined,
                            firstFrameLength: content.firstFrameLength ?? uploaded.firstFrameLength,
                            firstFrameSidecar:
                                content.firstFrameSidecar ?? uploaded.firstFrameSidecar,
                            stickerSentTs: content.stickerSentTs ?? Date.now()
                        }
                    }
                }
            default:
                throw new Error(
                    `unsupported media message type: ${String((content as Record<string, unknown>).type)}`
                )
        }
    } finally {
        if (resolved.tempFilePath) {
            await cleanupTempFile(resolved.tempFilePath)
        }
    }
}

interface UploadResult {
    readonly url: string
    readonly directPath: string
    readonly mediaKey: Uint8Array
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
    readonly fileLength: number
    readonly metadataUrl?: string
    readonly streamingSidecar?: Uint8Array
    readonly firstFrameSidecar?: Uint8Array
    readonly firstFrameLength?: number
}

function resolveUploadPath(uploadType: MediaCryptoType): string {
    const uploadPath = MEDIA_UPLOAD_PATHS[uploadType as keyof typeof MEDIA_UPLOAD_PATHS]
    if (!uploadPath) {
        throw new Error(`unknown media upload type: ${String(uploadType)}`)
    }
    return uploadPath
}

function parseUploadResponse(
    body: Uint8Array,
    status: number
): {
    readonly url: string
    readonly directPath: string
    readonly metadataUrl?: string
} {
    assertMediaUploadStatus(status, 'media upload')
    const parsed = parseMediaUploadJsonBody<{
        readonly url?: string
        readonly direct_path?: string
        readonly metadata_url?: string
    }>(body, 'media upload')
    if (!parsed.url || !parsed.direct_path) {
        throw new Error('media upload response missing url/direct_path')
    }
    return {
        url: parsed.url,
        directPath: parsed.direct_path,
        ...(parsed.metadata_url ? { metadataUrl: parsed.metadata_url } : {})
    }
}

async function uploadMediaBytes(
    options: WaMediaMessageOptions,
    content: Exclude<WaSendMediaMessage, WaSendStickerPackMessage>,
    mediaBytes: Uint8Array,
    firstFrameLength: number | undefined,
    mimetype: string
): Promise<UploadResult> {
    const uploadType = resolveUploadType(content)
    const mediaKey = await WaMediaCrypto.generateMediaKey()
    const [encrypted, mediaConn] = await Promise.all([
        WaMediaCrypto.encryptBytes(uploadType, mediaKey, mediaBytes, {
            sidecar: needsSidecar(content),
            firstFrameLength
        }),
        getMediaConn(options)
    ])
    const selectedHost = selectMediaUploadHost(mediaConn)
    const uploadUrl = buildMediaUploadUrl(
        selectedHost,
        resolveUploadPath(uploadType),
        mediaConn.auth,
        encrypted.fileEncSha256
    )

    options.logger.debug('sending media upload request', {
        mediaType: content.type,
        uploadType,
        host: selectedHost
    })
    const uploadResponse = await options.mediaTransfer.uploadStream({
        url: uploadUrl,
        method: 'POST',
        body: encrypted.ciphertextHmac,
        contentLength: encrypted.ciphertextHmac.byteLength,
        contentType: mimetype
    })
    const responseBody = await options.mediaTransfer.readResponseBytes(uploadResponse)
    const parsed = parseUploadResponse(responseBody, uploadResponse.status)
    return {
        ...parsed,
        mediaKey,
        fileSha256: encrypted.fileSha256,
        fileEncSha256: encrypted.fileEncSha256,
        fileLength: mediaBytes.byteLength,
        streamingSidecar: encrypted.streamingSidecar,
        firstFrameSidecar: encrypted.firstFrameSidecar,
        firstFrameLength
    }
}

interface EncryptedStreamUploadInput {
    readonly plaintext: Readable
    readonly mediaKey: Uint8Array
    readonly cryptoType: MediaCryptoType
    readonly uploadPath: string
    readonly contentType: string
    readonly logLabel: string
    readonly sidecar: boolean
    readonly firstFrameLength?: number
}

async function uploadEncryptedStream(
    options: WaMediaMessageOptions,
    input: EncryptedStreamUploadInput
): Promise<UploadResult> {
    const encResult = await WaMediaCrypto.encryptToFile(
        input.cryptoType,
        input.mediaKey,
        input.plaintext,
        { sidecar: input.sidecar, firstFrameLength: input.firstFrameLength }
    )
    let readStream: ReturnType<typeof createReadStream> | undefined
    try {
        const mediaConn = await getMediaConn(options)
        const selectedHost = selectMediaUploadHost(mediaConn)
        const uploadUrl = buildMediaUploadUrl(
            selectedHost,
            input.uploadPath,
            mediaConn.auth,
            encResult.fileEncSha256
        )

        options.logger.debug(input.logLabel, {
            host: selectedHost,
            uploadPath: input.uploadPath,
            plaintextLength: encResult.plaintextLength,
            encryptedSize: encResult.fileSize
        })
        readStream = createReadStream(encResult.filePath)
        const uploadResponse = await options.mediaTransfer.uploadStream({
            url: uploadUrl,
            method: 'POST',
            body: readStream,
            contentLength: encResult.fileSize,
            contentType: input.contentType
        })
        const responseBody = await options.mediaTransfer.readResponseBytes(uploadResponse)
        const parsed = parseUploadResponse(responseBody, uploadResponse.status)
        return {
            ...parsed,
            mediaKey: input.mediaKey,
            fileSha256: encResult.fileSha256,
            fileEncSha256: encResult.fileEncSha256,
            fileLength: encResult.plaintextLength,
            streamingSidecar: encResult.streamingSidecar,
            firstFrameSidecar: encResult.firstFrameSidecar,
            firstFrameLength: input.firstFrameLength
        }
    } finally {
        if (readStream && !readStream.closed) {
            await new Promise<void>((resolve) => {
                readStream!.once('close', resolve)
                readStream!.destroy()
            })
        }
        await WaMediaCrypto.cleanupEncryptedFile(encResult.filePath)
    }
}

async function uploadMediaStream(
    options: WaMediaMessageOptions,
    content: Exclude<WaSendMediaMessage, WaSendStickerPackMessage>,
    stream: Readable,
    firstFrameLength: number | undefined,
    mimetype: string
): Promise<UploadResult> {
    const cryptoType = resolveUploadType(content)
    return uploadEncryptedStream(options, {
        plaintext: stream,
        mediaKey: await WaMediaCrypto.generateMediaKey(),
        cryptoType,
        uploadPath: resolveUploadPath(cryptoType),
        contentType: mimetype,
        logLabel: 'sending media stream upload request',
        sidecar: needsSidecar(content),
        firstFrameLength
    })
}

function openStickerPackInputStream(media: Uint8Array | string): Readable {
    return typeof media === 'string' ? createReadStream(media) : Readable.from([media])
}

async function buildStickerPackMediaMessage(
    options: WaMediaMessageOptions,
    content: WaSendStickerPackMessage
): Promise<WaMessageBuildResult> {
    validateStickerPackInput(content)
    if (content.coverThumbnail === undefined) {
        throw new Error('sticker pack send requires coverThumbnail for non-newsletter recipients')
    }
    const coverThumbnail = content.coverThumbnail

    const mediaKey = await WaMediaCrypto.generateMediaKey()
    const [bundle, cover] = await Promise.all([
        uploadEncryptedStream(options, {
            plaintext: createStickerPackZipStream(toStickerPackZipEntries(content)),
            mediaKey,
            cryptoType: 'sticker-pack',
            uploadPath: MEDIA_UPLOAD_PATHS['sticker-pack'],
            contentType: 'application/zip',
            logLabel: 'sending sticker pack bundle upload',
            sidecar: false
        }),
        uploadEncryptedStream(options, {
            plaintext: openStickerPackInputStream(coverThumbnail),
            mediaKey,
            cryptoType: 'thumbnail-sticker-pack',
            uploadPath: MEDIA_UPLOAD_PATHS['thumbnail-sticker-pack'],
            contentType: 'image/jpeg',
            logLabel: 'sending sticker pack thumbnail upload',
            sidecar: false
        })
    ])
    if (cover.fileLength === 0) {
        throw new Error('sticker pack coverThumbnail is empty')
    }

    return {
        upload: {
            url: bundle.url,
            directPath: bundle.directPath,
            fileSha256: bundle.fileSha256,
            fileLength: bundle.fileLength
        },
        message: {
            stickerPackMessage: {
                stickerPackId: content.stickerPackId,
                name: content.name,
                publisher: content.publisher,
                stickers: toStickerPackProtoStickers(content),
                fileLength: bundle.fileLength,
                fileSha256: bundle.fileSha256,
                fileEncSha256: bundle.fileEncSha256,
                mediaKey,
                mediaKeyTimestamp: Math.floor(Date.now() / 1000),
                directPath: bundle.directPath,
                thumbnailDirectPath: cover.directPath,
                thumbnailSha256: cover.fileSha256,
                thumbnailEncSha256: cover.fileEncSha256,
                thumbnailWidth: content.thumbnailWidth ?? 252,
                thumbnailHeight: content.thumbnailHeight ?? 252,
                trayIconFileName: content.trayIcon.fileName,
                stickerPackSize: bundle.fileLength,
                stickerPackOrigin: proto.Message.StickerPackMessage.StickerPackOrigin.USER_CREATED,
                imageDataHash: bytesToBase64(cover.fileSha256),
                caption: content.caption,
                packDescription: content.packDescription
            }
        }
    }
}
