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
import type { PeerDataOperationRequester } from '@message/primitives/peer-data-operation'
import type {
    WaMessagePublishResult,
    WaSendMessageContent,
    WaSendReceiptEventOptions,
    WaSendReceiptInput,
    WaSendReceiptOptions
} from '@message/types'
import type { WaMexOperationResponses } from '@mex'
import { proto, type Proto } from '@proto'
import { applyDeviceToJid, normalizeRecipientJid } from '@protocol/jid'
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
    readonly peerDataOperation: PeerDataOperationRequester
}

export interface WaRequestHistorySyncInput {
    /** Chat the older messages should be fetched from. */
    readonly chatJid: string
    /**
     * Id of the oldest message currently in the local view. The server
     * pages backwards from this anchor. Omit to let the server pick its
     * own anchor (rarely useful).
     */
    readonly oldestMsgId?: string
    /** Whether {@link oldestMsgId} was sent by the current account. */
    readonly oldestMsgFromMe?: boolean
    /** Epoch ms of the oldest local message; pairs with {@link oldestMsgId}. */
    readonly oldestMsgTimestampMs?: number
    /**
     * How many older messages to request. WhatsApp Web defaults to the
     * server-side `history_sync_on_demand_message_count` AB-prop (~50);
     * passing nothing here leaves the field unset so the server applies
     * its own default.
     */
    readonly count?: number
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

/**
 * Coordinates outbound message sending, receipts, addon decryption, media
 * download, and the related MEX account queries. Accessed via
 * {@link WaClient.message}.
 */
export class WaMessageCoordinator {
    private readonly messageDispatch: WaMessageDispatchCoordinator
    private readonly mediaTransfer: WaMediaTransferClient
    private readonly logger: Logger
    private readonly messageStore: WaMessageStore
    private readonly messageSecretStore: WaMessageSecretStore
    private readonly trustedContactToken: WaTrustedContactTokenCoordinator
    private readonly emitAddon: (event: WaIncomingAddonEvent) => void
    private readonly mexSocket: WaMexQuerySocket
    private readonly peerDataOperation: PeerDataOperationRequester

    public constructor(deps: WaMessageCoordinatorDeps) {
        this.messageDispatch = deps.messageDispatch
        this.mediaTransfer = deps.mediaTransfer
        this.logger = deps.logger
        this.messageStore = deps.messageStore
        this.messageSecretStore = deps.messageSecretStore
        this.trustedContactToken = deps.trustedContactToken
        this.emitAddon = deps.emitAddon
        this.mexSocket = deps.mexSocket
        this.peerDataOperation = deps.peerDataOperation
    }

    /**
     * Asks the server to backfill older messages for `chatJid` beyond what
     * arrived in the initial history-sync. Implemented as a
     * `PeerDataOperationRequestMessage` (type `HISTORY_SYNC_ON_DEMAND`)
     * sent to this account's own user JID; the response arrives later as
     * a `history_sync_chunk` event the same way the bootstrap chunks do -
     * subscribe before calling if you need to react to the chunk.
     *
     * The method returns once the request is dispatched (with the protocol
     * message id), **not** when the chunk arrives. Pair `oldestMsgId` +
     * `oldestMsgTimestampMs` + `oldestMsgFromMe` from the topmost message
     * currently visible to page backwards correctly.
     */
    public async requestHistorySync(
        input: WaRequestHistorySyncInput
    ): Promise<{ readonly messageId: string }> {
        const chatJid = normalizeRecipientJid(input.chatJid)
        if (input.count !== undefined) {
            if (
                !Number.isFinite(input.count) ||
                !Number.isSafeInteger(input.count) ||
                input.count <= 0
            ) {
                throw new Error(`invalid count: ${input.count}`)
            }
        }
        if (input.oldestMsgTimestampMs !== undefined) {
            if (
                !Number.isFinite(input.oldestMsgTimestampMs) ||
                !Number.isSafeInteger(input.oldestMsgTimestampMs) ||
                input.oldestMsgTimestampMs < 0
            ) {
                throw new Error(`invalid oldestMsgTimestampMs: ${input.oldestMsgTimestampMs}`)
            }
        }
        const historySyncOnDemandRequest: Proto.Message.PeerDataOperationRequestMessage.IHistorySyncOnDemandRequest =
            {
                chatJid,
                supportInlineResponse: true,
                ...(input.oldestMsgId === undefined ? {} : { oldestMsgId: input.oldestMsgId }),
                ...(input.oldestMsgFromMe === undefined
                    ? {}
                    : { oldestMsgFromMe: input.oldestMsgFromMe }),
                ...(input.oldestMsgTimestampMs === undefined
                    ? {}
                    : { oldestMsgTimestampMs: input.oldestMsgTimestampMs }),
                ...(input.count === undefined ? {} : { onDemandMsgCount: input.count })
            }
        return this.peerDataOperation.send(
            proto.Message.PeerDataOperationRequestType.HISTORY_SYNC_ON_DEMAND,
            { historySyncOnDemandRequest }
        )
    }

    /**
     * Fetches the server-side "reachout" timelock that throttles cold outreach
     * to non-contacts, returning the active window when enforcement is on.
     */
    public async getReachoutTimelock(): Promise<WaReachoutTimelock> {
        const data = await runMexQuery(this.mexSocket, 'FetchReachoutTimelock', {})
        return parseReachoutTimelockMexResponse(data)
    }

    /**
     * Fetches the per-cycle message capping info applied to new-chat threads
     * (quota, used, cycle boundaries, status flags).
     */
    public async getNewChatMessageCapping(
        type: WaMessageCappingType = 'INDIVIDUAL_NEW_CHAT_THREAD'
    ): Promise<WaMessageCappingInfo> {
        const data = await runMexQuery(this.mexSocket, 'FetchNewChatMessageCappingInfo', {
            input: { type }
        })
        return parseMessageCappingMexResponse(data)
    }

    /**
     * Force-refreshes the Signal session(s) for `jid`. Set `reasonIdentity` to
     * `true` when the trigger was an identity change – this also queues a
     * trusted-contact-token reissue.
     */
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

    /**
     * Sends a message (any {@link WaSendMessageContent} kind – text, media,
     * poll, reaction, edit, revoke, etc.) to `to` and returns the publish
     * result containing the stanza id and ack metadata.
     *
     * `to` accepts any JID accepted by {@link normalizeRecipientJid}: bare
     * digits (`'5511999999999'`), a phone JID (`'5511…@s.whatsapp.net'`),
     * a group JID (`'…@g.us'`), or a LID. See the {@link WaSendMessageContent}
     * union for the full kind list.
     *
     * **Gotchas:**
     * - The stanza id is auto-generated unless you set `options.id`. Reusing
     *   an id manually makes the send idempotent on the server but is also how
     *   internal retries (`maxAttempts`) work – don't reuse ids across
     *   logically distinct messages.
     * - Sending to a `@newsletter` JID routes through a separate code path
     *   that ignores most of `options` (no quote/forward/edit semantics).
     * - Addon-crypto kinds (poll-vote, reaction, message-edit, ...) require an
     *   authenticated session (`meJid` present) – throws otherwise.
     * - Group sends fan out to every cached member device. If your
     *   `groupMetadata` cache is empty/disabled, this triggers a metadata IQ
     *   per send (rate-limited server-side, see {@link WaCreateStoreOptions}).
     *
     * @example
     * ```ts
     * // 1. Plain text (string shorthand)
     * await client.message.send('5511999999999', 'hello!')
     *
     * // 2. Reply with mention
     * await client.message.send(groupJid, {
     *     type: 'text',
     *     text: '@5511999999999 ping',
     *     contextInfo: {
     *         mentionedJid: ['5511999999999@s.whatsapp.net'],
     *         quoted: { key: { remoteJid: groupJid, fromMe: false, id: incomingId } }
     *     }
     * })
     *
     * // 3. Image from a file path (the encoder opens + streams it for you)
     * await client.message.send(jid, {
     *     type: 'image',
     *     media: '/tmp/photo.jpg',
     *     mimetype: 'image/jpeg',
     *     caption: 'check this out'
     * })
     *
     * // 4. React to an incoming message (empty emoji = unreact)
     * await client.message.send(event.chatJid!, {
     *     type: 'reaction',
     *     emoji: '👍',
     *     target: { stanzaId: event.stanzaId, fromMe: false, participant: event.senderJid }
     * })
     *
     * // 5. Poll
     * const result = await client.message.send(jid, {
     *     type: 'poll',
     *     name: 'lunch?',
     *     options: ['pizza', 'sushi', 'burger'],
     *     selectableCount: 1
     * })
     * console.log('sent as', result.id)
     * ```
     */
    public send(
        to: string,
        content: WaSendMessageContent,
        options: WaSendMessageOptions = {}
    ): Promise<WaMessagePublishResult> {
        return this.messageDispatch.sendMessage(to, content, options)
    }

    /**
     * Sends a receipt (delivery / read / played / inactive). Overloads:
     * - Pass one or many `WaIncomingMessageEvent` to auto-derive chat/sender
     *   metadata and batch ids by chat.
     * - Pass an explicit `(jid, ids, options)` triple for manual control.
     *
     * **You usually don't need to call this for `'delivery'`** - the library
     * already auto-ACKs delivery on every incoming `<message>` it decrypts
     * successfully. Use this manually for `'read'`/`'played'` (read receipts
     * the user explicitly toggled) or for `'inactive'`/retry receipts.
     */
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

    /**
     * Resolves the media payload inside `source` and returns a `Readable`
     * stream of the decrypted bytes. Throws when the message has no
     * downloadable media.
     *
     * **Caller owns the stream** - pipe it somewhere or call `.destroy()` to
     * release the underlying socket; an unconsumed stream leaks the connection.
     * MAC + SHA-256 verification runs **as bytes are consumed**, so if you
     * abort mid-read you've consumed unverified bytes. Pass `options.signal`
     * to cancel cleanly, or use {@link downloadBytes} / {@link downloadToFile}
     * for one-shot verified downloads.
     */
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

    /**
     * Convenience wrapper around {@link download} that streams the decrypted
     * media directly to `filePath`. On failure the **partial file is not
     * cleaned up** - delete it yourself in the error handler if you don't
     * want to leak corrupted artifacts.
     */
    public async downloadToFile(
        source: WaIncomingMessageEvent | Proto.IMessage,
        filePath: string,
        options: WaDownloadMediaOptions = {}
    ): Promise<void> {
        const stream = await this.download(source, options)
        await pipeline(stream, createWriteStream(filePath))
    }

    /**
     * Convenience wrapper around {@link download} that buffers the decrypted
     * media into a single `Uint8Array`. Use only for small media – caps via
     * `options.maxBytes`.
     */
    public async downloadBytes(
        source: WaIncomingMessageEvent | Proto.IMessage,
        options: WaDownloadMediaOptions = {}
    ): Promise<Uint8Array> {
        const stream = await this.download(source, options)
        return readAllBytes(stream, { maxBytes: options.maxBytes })
    }

    /**
     * Attempts to decrypt an addon payload (poll vote, reaction, edit, ...)
     * attached to `event` and, on success, emits a typed
     * `WaIncomingAddonEvent`. Silently returns when the parent message
     * secret is missing or the payload is not an addon.
     *
     * Called automatically by the client unless `options.addons.autoDecrypt`
     * is explicitly `false` - you rarely need to invoke it directly. The
     * parent secret
     * is looked up in the in-memory `messageSecret` cache first, then in
     * the `messages` store; if both are `'none'`/missing, decryption fails
     * silently (and the event never fires).
     */
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
