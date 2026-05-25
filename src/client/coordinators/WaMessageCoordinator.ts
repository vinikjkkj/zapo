import { createWriteStream } from 'node:fs'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import type { WaMessageDispatchCoordinator } from '@client/coordinators/WaMessageDispatchCoordinator'
import type { WaTrustedContactTokenCoordinator } from '@client/coordinators/WaTrustedContactTokenCoordinator'
import { aggregateReceiptTargets } from '@client/events/receipt'
import type {
    WaDownloadMediaOptions,
    WaIncomingAddonEvent,
    WaIncomingMessageEvent,
    WaSendMessageOptions
} from '@client/types'
import type { Logger } from '@infra/log/types'
import type { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import {
    buildAddonAdditionalData,
    decodeAddonPlaintext,
    decryptAddonPayload,
    identifyEncryptedAddon,
    resolveParentMessageSecret,
    resolvePollOptionNames,
    shouldUseAddonAdditionalData
} from '@message/crypto/addon-crypto'
import { resolveMediaPayload } from '@message/encode/media-payload'
import type {
    WaMessagePublishResult,
    WaSendMessageContent,
    WaSendReceiptEventOptions,
    WaSendReceiptInput,
    WaSendReceiptOptions
} from '@message/types'
import type { WaMexOperationResponses } from '@mex'
import type { Proto } from '@proto'
import { applyDeviceToJid } from '@protocol/jid'
import type { WaMessageSecretStore } from '@store/contracts/message-secret.store'
import type { WaMessageStore } from '@store/contracts/message.store'
import { runMexQuery, type WaMexQuerySocket } from '@transport/node/mex/client'
import { readAllBytes } from '@util/bytes'
import { tryAsNumber, tryAsString } from '@util/coercion'
import { toError } from '@util/primitives'

export interface WaMessageCoordinatorDeps {
    readonly messageDispatch: WaMessageDispatchCoordinator
    readonly mediaTransfer: WaMediaTransferClient
    readonly logger: Logger
    readonly messageStore: WaMessageStore
    readonly messageSecretStore: WaMessageSecretStore
    readonly trustedContactToken: WaTrustedContactTokenCoordinator
    readonly emitAddon: (event: WaIncomingAddonEvent) => void
    readonly mexSocket: WaMexQuerySocket
}

export interface WaReachoutTimelock {
    readonly isActive: boolean
    readonly enforcementType: string | null
    readonly enforcementEndsAt: number | null
}

export type WaMessageCappingType = 'INDIVIDUAL_NEW_CHAT_THREAD'

export interface WaMessageCappingInfo {
    readonly totalQuota: number | null
    readonly usedQuota: number | null
    readonly cycleStartAt: number | null
    readonly cycleEndAt: number | null
    readonly serverSentAt: number | null
    readonly oteStatus: string | null
    readonly mvStatus: string | null
    readonly cappingStatus: string | null
}

function parseReachoutTimelockMexResponse(
    data: WaMexOperationResponses['FetchReachoutTimelock'] | null
): WaReachoutTimelock {
    const root = data?.xwa2_fetch_account_reachout_timelock
    return {
        isActive: root?.is_active === true,
        enforcementType: tryAsString(root?.enforcement_type),
        enforcementEndsAt: tryAsNumber(root?.time_enforcement_ends)
    }
}

function parseMessageCappingMexResponse(
    data: WaMexOperationResponses['FetchNewChatMessageCappingInfo'] | null
): WaMessageCappingInfo {
    const root = data?.xwa2_message_capping_info
    return {
        totalQuota: tryAsNumber(root?.total_quota),
        usedQuota: tryAsNumber(root?.used_quota),
        cycleStartAt: tryAsNumber(root?.cycle_start_timestamp),
        cycleEndAt: tryAsNumber(root?.cycle_end_timestamp),
        serverSentAt: tryAsNumber(root?.server_sent_timestamp),
        oteStatus: tryAsString(root?.ote_status),
        mvStatus: tryAsString(root?.mv_status),
        cappingStatus: tryAsString(root?.capping_status)
    }
}

export class WaMessageCoordinator {
    private readonly messageDispatch: WaMessageDispatchCoordinator
    private readonly mediaTransfer: WaMediaTransferClient
    private readonly logger: Logger
    private readonly messageStore: WaMessageStore
    private readonly messageSecretStore: WaMessageSecretStore
    private readonly trustedContactToken: WaTrustedContactTokenCoordinator
    private readonly emitAddon: (event: WaIncomingAddonEvent) => void
    private readonly mexSocket: WaMexQuerySocket

    public constructor(deps: WaMessageCoordinatorDeps) {
        this.messageDispatch = deps.messageDispatch
        this.mediaTransfer = deps.mediaTransfer
        this.logger = deps.logger
        this.messageStore = deps.messageStore
        this.messageSecretStore = deps.messageSecretStore
        this.trustedContactToken = deps.trustedContactToken
        this.emitAddon = deps.emitAddon
        this.mexSocket = deps.mexSocket
    }

    public async getReachoutTimelock(): Promise<WaReachoutTimelock> {
        const data = await runMexQuery(this.mexSocket, 'FetchReachoutTimelock', {})
        return parseReachoutTimelockMexResponse(data)
    }

    public async getNewChatMessageCapping(
        type: WaMessageCappingType = 'INDIVIDUAL_NEW_CHAT_THREAD'
    ): Promise<WaMessageCappingInfo> {
        const data = await runMexQuery(this.mexSocket, 'FetchNewChatMessageCappingInfo', {
            input: { type }
        })
        return parseMessageCappingMexResponse(data)
    }

    public async syncSignalSession(jid: string, reasonIdentity = false): Promise<void> {
        await this.messageDispatch.syncSignalSession(jid, reasonIdentity)
        if (reasonIdentity) {
            this.trustedContactToken.reissueOnIdentityChange(jid).catch((err) =>
                this.logger.warn('tc token reissue on identity change failed', {
                    jid,
                    message: toError(err).message
                })
            )
        }
    }

    public send(
        to: string,
        content: WaSendMessageContent,
        options: WaSendMessageOptions = {}
    ): Promise<WaMessagePublishResult> {
        return this.messageDispatch.sendMessage(to, content, options)
    }

    public sendReceipt(
        target: WaIncomingMessageEvent | readonly WaIncomingMessageEvent[],
        options?: WaSendReceiptEventOptions
    ): Promise<void>
    public sendReceipt(
        jid: string,
        ids: string | readonly string[],
        options?: WaSendReceiptOptions
    ): Promise<void>
    public async sendReceipt(
        first: string | WaIncomingMessageEvent | readonly WaIncomingMessageEvent[],
        second?: string | readonly string[] | WaSendReceiptEventOptions,
        third?: WaSendReceiptOptions
    ): Promise<void> {
        if (typeof first === 'string') {
            const ids = second as string | readonly string[]
            await this.dispatchReceipt(first, ids, third ?? {})
            return
        }
        const events = Array.isArray(first) ? first : [first as WaIncomingMessageEvent]
        const options = (second as WaSendReceiptEventOptions | undefined) ?? {}
        const targets = events.map((event) => {
            if (!event.chatJid || !event.stanzaId) {
                throw new Error('sendReceipt event is missing chatJid or stanzaId')
            }
            return {
                chatJid: event.chatJid,
                id: event.stanzaId,
                senderJid: event.senderJid
                    ? applyDeviceToJid(event.senderJid, event.senderDevice)
                    : undefined,
                isGroupChat: event.isGroupChat,
                isBroadcastChat: event.isBroadcastChat
            }
        })
        for (const group of aggregateReceiptTargets(targets)) {
            await this.dispatchReceipt(group.jid, group.ids, {
                ...options,
                participant: group.participant
            })
        }
    }

    public async download(
        source: WaIncomingMessageEvent | Proto.IMessage,
        options: WaDownloadMediaOptions = {}
    ): Promise<Readable> {
        const message: Proto.IMessage | null | undefined =
            'rawNode' in source ? source.message : source
        const payload = resolveMediaPayload(message)
        if (!payload) {
            throw new Error('message has no downloadable media')
        }
        const { plaintext, metadata } = await this.mediaTransfer.downloadAndDecryptStream({
            directPath: payload.directPath,
            mediaType: payload.mediaType,
            mediaKey: payload.mediaKey,
            fileSha256: payload.fileSha256,
            fileEncSha256: payload.fileEncSha256,
            timeoutMs: options.timeoutMs,
            signal: options.signal,
            maxBytes: options.maxBytes
        })
        metadata.catch(() => undefined)
        return plaintext
    }

    public async downloadToFile(
        source: WaIncomingMessageEvent | Proto.IMessage,
        filePath: string,
        options: WaDownloadMediaOptions = {}
    ): Promise<void> {
        const stream = await this.download(source, options)
        await pipeline(stream, createWriteStream(filePath))
    }

    public async downloadBytes(
        source: WaIncomingMessageEvent | Proto.IMessage,
        options: WaDownloadMediaOptions = {}
    ): Promise<Uint8Array> {
        const stream = await this.download(source, options)
        return readAllBytes(stream, { maxBytes: options.maxBytes })
    }

    public async tryDecryptAddon(event: WaIncomingMessageEvent): Promise<void> {
        const message = event.message
        if (!message) return

        const addon = identifyEncryptedAddon(message)
        if (!addon) return

        const targetMessageId = addon.targetMessageKey.id
        if (!targetMessageId) return

        const parentEntry = await resolveParentMessageSecret(
            targetMessageId,
            this.messageSecretStore,
            this.messageStore
        )
        if (!parentEntry) {
            this.logger.debug('addon parent message secret not found', {
                id: event.stanzaId,
                targetId: targetMessageId
            })
            return
        }

        const parentMsgOriginalSender = parentEntry.senderJid
        const modificationSender = event.senderJid ?? ''

        const plaintext = await decryptAddonPayload({
            messageSecret: parentEntry.secret,
            stanzaId: targetMessageId,
            parentMsgOriginalSender,
            modificationSender,
            modificationType: addon.modificationType,
            ciphertext: addon.encPayload,
            iv: addon.encIv,
            additionalData: shouldUseAddonAdditionalData(addon.modificationType)
                ? buildAddonAdditionalData(targetMessageId, modificationSender)
                : undefined
        })

        let decrypted = decodeAddonPlaintext(addon.kind, plaintext)
        if (decrypted.kind === 'poll_vote' && decrypted.pollVote.selectedOptions) {
            const names = await resolvePollOptionNames(
                decrypted.pollVote.selectedOptions,
                targetMessageId,
                this.messageStore
            )
            if (names) {
                decrypted = { ...decrypted, selectedOptionNames: names }
            }
        }
        this.emitAddon({
            rawNode: event.rawNode,
            stanzaId: event.stanzaId,
            chatJid: event.chatJid,
            stanzaType: event.stanzaType,
            offline: event.offline,
            kind: addon.kind,
            targetMessageId,
            senderJid: modificationSender,
            decrypted,
            raw: message
        })
    }

    private dispatchReceipt(
        jid: string,
        ids: string | readonly string[],
        options: WaSendReceiptOptions
    ): Promise<void> {
        const idArray = typeof ids === 'string' ? [ids] : ids
        if (idArray.length === 0) {
            throw new Error('sendReceipt requires at least one message id')
        }
        const [id, ...rest] = idArray
        const input: WaSendReceiptInput = {
            ...options,
            to: jid,
            id,
            listIds: rest.length > 0 ? rest : undefined
        }
        return this.messageDispatch.sendReceipt(input)
    }
}
