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
import type { Proto } from '@proto'
import { applyDeviceToJid } from '@protocol/jid'
import type { WaMessageSecretStore } from '@store/contracts/message-secret.store'
import type { WaMessageStore } from '@store/contracts/message.store'
import { readAllBytes } from '@util/bytes'
import { toError } from '@util/primitives'

export interface WaMessageCoordinatorDeps {
    readonly messageDispatch: WaMessageDispatchCoordinator
    readonly mediaTransfer: WaMediaTransferClient
    readonly logger: Logger
    readonly messageStore: WaMessageStore
    readonly messageSecretStore: WaMessageSecretStore
    readonly trustedContactToken: WaTrustedContactTokenCoordinator
    readonly emitAddon: (event: WaIncomingAddonEvent) => void
}

export class WaMessageCoordinator {
    private readonly messageDispatch: WaMessageDispatchCoordinator
    private readonly mediaTransfer: WaMediaTransferClient
    private readonly logger: Logger
    private readonly messageStore: WaMessageStore
    private readonly messageSecretStore: WaMessageSecretStore
    private readonly trustedContactToken: WaTrustedContactTokenCoordinator
    private readonly emitAddon: (event: WaIncomingAddonEvent) => void

    public constructor(deps: WaMessageCoordinatorDeps) {
        this.messageDispatch = deps.messageDispatch
        this.mediaTransfer = deps.mediaTransfer
        this.logger = deps.logger
        this.messageStore = deps.messageStore
        this.messageSecretStore = deps.messageSecretStore
        this.trustedContactToken = deps.trustedContactToken
        this.emitAddon = deps.emitAddon
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
