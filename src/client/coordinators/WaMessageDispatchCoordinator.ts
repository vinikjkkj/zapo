import type { WaSignalMessagePublishInput, WaSendMessageOptions } from '@client/types'
import { toSerializedPubKey } from '@crypto/core/keys'
import type { Logger } from '@infra/log/types'
import { resolveMessageTypeAttr } from '@message/content'
import { wrapDeviceSentMessage } from '@message/device-sent'
import { writeRandomPadMax16 } from '@message/padding'
import type {
    WaEncryptedMessageInput,
    WaMessagePublishOptions,
    WaMessagePublishResult,
    WaSendMessageContent,
    WaSendReceiptInput
} from '@message/types'
import type { WaMessageClient } from '@message/WaMessageClient'
import { proto } from '@proto'
import type { Proto } from '@proto'
import { WA_DEFAULTS } from '@protocol/constants'
import {
    isGroupJid,
    normalizeDeviceJid,
    normalizeRecipientJid,
    parseSignalAddressFromJid,
    splitJid,
    toUserJid
} from '@protocol/jid'
import { RETRY_OUTBOUND_TTL_MS } from '@retry/constants'
import { encodeRetryReplayPayload } from '@retry/outbound'
import { type WaRetryOutboundMessageRecord, type WaRetryReplayPayload } from '@retry/types'
import type { SignalDeviceSyncApi } from '@signal/api/SignalDeviceSyncApi'
import type { SignalSessionSyncApi } from '@signal/api/SignalSessionSyncApi'
import type { SenderKeyManager } from '@signal/group/SenderKeyManager'
import type { SignalProtocol } from '@signal/session/SignalProtocol'
import type { SignalAddress } from '@signal/types'
import type { WaRetryStore } from '@store/contracts/retry.store'
import { encodeBinaryNode } from '@transport/binary'
import { buildDirectMessageFanoutNode } from '@transport/node/builders/message'
import type { BinaryNode } from '@transport/types'
import { uint8Equal } from '@util/bytes'
import { toError } from '@util/primitives'

interface WaMessageDispatchCoordinatorOptions {
    readonly logger: Logger
    readonly messageClient: WaMessageClient
    readonly retryStore: WaRetryStore
    readonly buildMessageContent: (content: WaSendMessageContent) => Promise<Proto.IMessage>
    readonly senderKeyManager: SenderKeyManager
    readonly signalProtocol: SignalProtocol
    readonly signalDeviceSync: SignalDeviceSyncApi
    readonly signalSessionSync: SignalSessionSyncApi
    readonly getCurrentMeJid: () => string | null | undefined
    readonly getCurrentMeLid: () => string | null | undefined
    readonly getCurrentSignedIdentity: () => Proto.IADVSignedDeviceIdentity | null | undefined
}

export class WaMessageDispatchCoordinator {
    private readonly logger: Logger
    private readonly messageClient: WaMessageClient
    private readonly retryStore: WaRetryStore
    private readonly buildMessageContent: (content: WaSendMessageContent) => Promise<Proto.IMessage>
    private readonly senderKeyManager: SenderKeyManager
    private readonly signalProtocol: SignalProtocol
    private readonly signalDeviceSync: SignalDeviceSyncApi
    private readonly signalSessionSync: SignalSessionSyncApi
    private readonly getCurrentMeJid: () => string | null | undefined
    private readonly getCurrentMeLid: () => string | null | undefined
    private readonly getCurrentSignedIdentity: () =>
        | Proto.IADVSignedDeviceIdentity
        | null
        | undefined

    public constructor(options: WaMessageDispatchCoordinatorOptions) {
        this.logger = options.logger
        this.messageClient = options.messageClient
        this.retryStore = options.retryStore
        this.buildMessageContent = options.buildMessageContent
        this.senderKeyManager = options.senderKeyManager
        this.signalProtocol = options.signalProtocol
        this.signalDeviceSync = options.signalDeviceSync
        this.signalSessionSync = options.signalSessionSync
        this.getCurrentMeJid = options.getCurrentMeJid
        this.getCurrentMeLid = options.getCurrentMeLid
        this.getCurrentSignedIdentity = options.getCurrentSignedIdentity
    }

    public async publishMessageNode(
        node: BinaryNode,
        options: WaMessagePublishOptions = {}
    ): Promise<WaMessagePublishResult> {
        this.logger.debug('wa client publish message node', {
            tag: node.tag,
            type: node.attrs.type,
            to: node.attrs.to
        })
        const messageType = node.attrs.type ?? 'text'
        const replayPayload: WaRetryReplayPayload = {
            mode: 'opaque_node',
            node: encodeBinaryNode(node)
        }
        return this.publishWithRetryTracking(
            {
                messageIdHint: node.attrs.id,
                toJid: node.attrs.to,
                participantJid: node.attrs.participant,
                recipientJid: node.attrs.recipient,
                messageType,
                replayPayload
            },
            async () => this.messageClient.publishNode(node, options)
        )
    }

    public async publishEncryptedMessage(
        input: WaEncryptedMessageInput,
        options: WaMessagePublishOptions = {}
    ): Promise<WaMessagePublishResult> {
        this.logger.debug('wa client publish encrypted message', {
            to: input.to,
            type: input.type,
            encType: input.encType
        })
        const replayPayload: WaRetryReplayPayload = {
            mode: 'encrypted',
            to: input.to,
            type: input.type ?? 'text',
            encType: input.encType,
            ciphertext: input.ciphertext,
            participant: input.participant
        }
        return this.publishWithRetryTracking(
            {
                messageIdHint: input.id,
                toJid: input.to,
                participantJid: input.participant,
                messageType: input.type ?? 'text',
                replayPayload
            },
            async () => this.messageClient.publishEncrypted(input, options)
        )
    }

    public async publishSignalMessage(
        input: WaSignalMessagePublishInput,
        options: WaMessagePublishOptions = {}
    ): Promise<WaMessagePublishResult> {
        this.assertRegisteredSession('publishSignalMessage')
        const address = parseSignalAddressFromJid(input.to)
        if (address.server === WA_DEFAULTS.GROUP_SERVER) {
            throw new Error(
                'publishSignalMessage currently supports only direct chats; use sender-key flow for groups'
            )
        }
        this.logger.debug('wa client publish signal message', {
            to: input.to,
            type: input.type
        })
        const paddedPlaintext = await writeRandomPadMax16(input.plaintext)
        await this.ensureSignalSession(address, input.to, input.expectedIdentity)
        const encrypted = await this.signalProtocol.encryptMessage(
            address,
            paddedPlaintext,
            input.expectedIdentity
        )
        const messageType = input.type ?? 'text'
        const replayPayload: WaRetryReplayPayload = {
            mode: 'plaintext',
            to: input.to,
            type: messageType,
            plaintext: paddedPlaintext
        }
        return this.publishWithRetryTracking(
            {
                messageIdHint: input.id,
                toJid: input.to,
                participantJid: input.participant,
                messageType,
                replayPayload
            },
            async () =>
                this.messageClient.publishEncrypted(
                    {
                        to: input.to,
                        encType: encrypted.type,
                        ciphertext: encrypted.ciphertext,
                        id: input.id,
                        type: input.type,
                        participant: input.participant,
                        deviceFanout: input.deviceFanout
                    },
                    options
                )
        )
    }

    public async sendMessage(
        to: string,
        content: WaSendMessageContent,
        options: WaSendMessageOptions = {}
    ): Promise<WaMessagePublishResult> {
        const recipientJid = normalizeRecipientJid(
            to,
            WA_DEFAULTS.HOST_DOMAIN,
            WA_DEFAULTS.GROUP_SERVER
        )
        const message = await this.buildMessageContent(content)
        const plaintext = await writeRandomPadMax16(proto.Message.encode(message).finish())
        const type = resolveMessageTypeAttr(message)

        if (isGroupJid(recipientJid, WA_DEFAULTS.GROUP_SERVER)) {
            return this.publishGroupSenderKeyMessage(recipientJid, plaintext, type, options)
        }

        const directRecipientJid = toUserJid(recipientJid)
        return this.publishDirectSignalMessageWithFanout(
            directRecipientJid,
            message,
            plaintext,
            type,
            options
        )
    }

    public async syncSignalSession(jid: string, reasonIdentity = false): Promise<void> {
        const address = parseSignalAddressFromJid(jid)
        if (address.server === WA_DEFAULTS.GROUP_SERVER) {
            throw new Error('syncSignalSession supports only direct chats')
        }
        await this.ensureSignalSession(address, jid, undefined, reasonIdentity)
    }

    public async sendReceipt(input: WaSendReceiptInput): Promise<void> {
        await this.messageClient.sendReceipt(input)
    }

    private async publishWithRetryTracking(
        args: {
            readonly messageIdHint?: string
            readonly toJid?: string
            readonly participantJid?: string
            readonly recipientJid?: string
            readonly messageType: string
            readonly replayPayload: WaRetryReplayPayload
        },
        publish: () => Promise<WaMessagePublishResult>
    ): Promise<WaMessagePublishResult> {
        const nowMs = Date.now()
        const expiresAtMs = nowMs + RETRY_OUTBOUND_TTL_MS
        const hintedMessageId = args.messageIdHint?.trim()
        const resolvedToJid = this.resolveReplayToJid(args.toJid, args.replayPayload)
        let hintedPersisted = false
        if (hintedMessageId) {
            hintedPersisted = await this.safeUpsertRetryOutboundRecord(
                this.createRetryOutboundRecord(
                    hintedMessageId,
                    resolvedToJid,
                    args.participantJid,
                    args.recipientJid,
                    args.messageType,
                    args.replayPayload,
                    nowMs,
                    nowMs,
                    expiresAtMs
                )
            )
        }

        const result = await publish()
        if (hintedPersisted && hintedMessageId && result.id === hintedMessageId) {
            // Hint and final message id matched; avoid a second equivalent upsert on the hot path.
            return result
        }
        const persistedNowMs = Date.now()
        await this.safeUpsertRetryOutboundRecord(
            this.createRetryOutboundRecord(
                result.id,
                resolvedToJid,
                args.participantJid,
                args.recipientJid,
                args.messageType,
                args.replayPayload,
                hintedMessageId ? nowMs : persistedNowMs,
                persistedNowMs,
                persistedNowMs + RETRY_OUTBOUND_TTL_MS
            )
        )
        return result
    }

    private resolveReplayToJid(
        toJid: string | undefined,
        replayPayload: WaRetryReplayPayload
    ): string {
        if (toJid && toJid.length > 0) {
            return toJid
        }
        if (replayPayload.mode === 'opaque_node') {
            return ''
        }
        return replayPayload.to
    }

    private createRetryOutboundRecord(
        messageId: string,
        toJid: string,
        participantJid: string | undefined,
        recipientJid: string | undefined,
        messageType: string,
        replayPayload: WaRetryReplayPayload,
        createdAtMs: number,
        updatedAtMs: number,
        expiresAtMs: number
    ): WaRetryOutboundMessageRecord {
        return {
            messageId,
            toJid,
            participantJid,
            recipientJid,
            messageType,
            replayMode: replayPayload.mode,
            replayPayload: encodeRetryReplayPayload(replayPayload),
            state: 'pending',
            createdAtMs,
            updatedAtMs,
            expiresAtMs
        }
    }

    private async safeUpsertRetryOutboundRecord(
        record: WaRetryOutboundMessageRecord
    ): Promise<boolean> {
        try {
            await this.retryStore.upsertOutboundMessage(record)
        } catch (error) {
            this.logger.warn('failed to persist retry outbound message record', {
                messageId: record.messageId,
                to: record.toJid,
                mode: record.replayMode,
                message: toError(error).message
            })
            return false
        }

        try {
            await this.retryStore.cleanupExpired(Date.now())
        } catch (error) {
            this.logger.warn('failed to cleanup retry records after outbound persist', {
                message: toError(error).message
            })
        }
        return true
    }

    private async publishGroupSenderKeyMessage(
        groupJid: string,
        plaintext: Uint8Array,
        type: string,
        options: WaSendMessageOptions
    ): Promise<WaMessagePublishResult> {
        const meJid = this.requireCurrentMeJid('sendMessage')
        const sender = parseSignalAddressFromJid(meJid)
        const encrypted = await this.senderKeyManager.encryptGroupMessage(
            groupJid,
            sender,
            plaintext
        )
        const replayPayload: WaRetryReplayPayload = {
            mode: 'plaintext',
            to: groupJid,
            type,
            plaintext
        }
        return this.publishWithRetryTracking(
            {
                messageIdHint: options.id,
                toJid: groupJid,
                messageType: type,
                replayPayload
            },
            async () =>
                this.messageClient.publishEncrypted(
                    {
                        to: groupJid,
                        encType: 'skmsg',
                        ciphertext: encrypted.ciphertext,
                        id: options.id,
                        type
                    },
                    options
                )
        )
    }

    private async publishDirectSignalMessageWithFanout(
        recipientJid: string,
        message: Proto.IMessage,
        plaintext: Uint8Array,
        type: string,
        options: WaSendMessageOptions
    ): Promise<WaMessagePublishResult> {
        const meJid = this.requireCurrentMeJid('sendMessage')
        const meLid = this.getCurrentMeLid()
        const selfDeviceJidForRecipient = this.resolveSelfDeviceJidForRecipient(
            recipientJid,
            meJid,
            meLid
        )
        const deviceJids = await this.resolveDirectFanoutDeviceJids(
            recipientJid,
            selfDeviceJidForRecipient
        )
        const recipientUserJid = toUserJid(recipientJid)
        const meUserJid = toUserJid(selfDeviceJidForRecipient)

        this.logger.debug('wa client publish signal fanout', {
            to: recipientJid,
            devices: deviceJids.length,
            type
        })

        let selfDevicePlaintext: Uint8Array | null = null
        for (const targetJid of deviceJids) {
            if (toUserJid(targetJid) !== meUserJid) {
                continue
            }
            const wrapped = wrapDeviceSentMessage(message, recipientUserJid)
            selfDevicePlaintext = await writeRandomPadMax16(proto.Message.encode(wrapped).finish())
            break
        }

        const participants: {
            readonly jid: string
            readonly encType: 'msg' | 'pkmsg'
            readonly ciphertext: Uint8Array
        }[] = await Promise.all(
            deviceJids.map(async (targetJid) => {
                const address = parseSignalAddressFromJid(targetJid)
                const targetUserJid = toUserJid(targetJid)
                const expectedIdentity =
                    targetUserJid === recipientUserJid ? options.expectedIdentity : undefined
                const plaintextForTarget =
                    selfDevicePlaintext && targetUserJid === meUserJid
                        ? selfDevicePlaintext
                        : plaintext
                await this.ensureSignalSession(address, targetJid, expectedIdentity)
                const encrypted = await this.signalProtocol.encryptMessage(
                    address,
                    plaintextForTarget,
                    expectedIdentity
                )
                return {
                    jid: targetJid,
                    encType: encrypted.type,
                    ciphertext: encrypted.ciphertext
                }
            })
        )

        const shouldAttachDeviceIdentity = participants.some(
            (participant) => participant.encType === 'pkmsg'
        )
        const deviceIdentity = shouldAttachDeviceIdentity
            ? this.getEncodedSignedDeviceIdentity()
            : undefined
        const messageNode = buildDirectMessageFanoutNode({
            to: recipientJid,
            type,
            id: options.id,
            participants,
            deviceIdentity
        })

        const replayPayload: WaRetryReplayPayload = {
            mode: 'plaintext',
            to: recipientJid,
            type,
            plaintext
        }
        return this.publishWithRetryTracking(
            {
                messageIdHint: options.id ?? messageNode.attrs.id,
                toJid: recipientJid,
                messageType: type,
                replayPayload
            },
            async () => this.messageClient.publishNode(messageNode, options)
        )
    }

    private async resolveDirectFanoutDeviceJids(
        recipientJid: string,
        selfDeviceJidForRecipient: string
    ): Promise<readonly string[]> {
        const recipientUserJid = toUserJid(recipientJid)
        const meUserJid = toUserJid(selfDeviceJidForRecipient)
        const targets =
            recipientUserJid === meUserJid ? [recipientUserJid] : [recipientUserJid, meUserJid]

        try {
            const synced = await this.signalDeviceSync.syncDeviceList(targets)
            const byUser = new Map<string, readonly string[]>(
                synced.map((entry) => [toUserJid(entry.jid), entry.deviceJids])
            )

            const fanout = new Set<string>()
            const recipientDevices = byUser.get(recipientUserJid) ?? []
            if (recipientDevices.length === 0) {
                fanout.add(recipientUserJid)
            } else {
                for (let index = 0; index < recipientDevices.length; index += 1) {
                    fanout.add(recipientDevices[index])
                }
            }

            const meDevices = byUser.get(meUserJid) ?? []
            const normalizedMeJid = normalizeDeviceJid(selfDeviceJidForRecipient)
            for (let index = 0; index < meDevices.length; index += 1) {
                const deviceJid = meDevices[index]
                if (normalizeDeviceJid(deviceJid) === normalizedMeJid) {
                    continue
                }
                fanout.add(deviceJid)
            }

            return [...fanout]
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.logger.warn('signal device fanout sync failed, falling back to direct recipient', {
                to: recipientJid,
                message
            })
            return [recipientUserJid]
        }
    }

    private resolveSelfDeviceJidForRecipient(
        recipientJid: string,
        meJid: string,
        meLid: string | null | undefined
    ): string {
        if (splitJid(recipientJid).server !== 'lid') {
            return meJid
        }
        if (!meLid || !meLid.includes('@')) {
            return meJid
        }
        return meLid
    }

    private getEncodedSignedDeviceIdentity(): Uint8Array {
        const signedIdentity = this.getCurrentSignedIdentity()
        if (!signedIdentity) {
            throw new Error('missing signed identity for pkmsg fanout')
        }
        return proto.ADVSignedDeviceIdentity.encode(signedIdentity).finish()
    }

    private async ensureSignalSession(
        address: SignalAddress,
        jid: string,
        expectedIdentity?: Uint8Array,
        reasonIdentity = false
    ): Promise<void> {
        this.assertRegisteredSession('ensureSignalSession')
        if (await this.signalProtocol.hasSession(address)) {
            return
        }
        this.logger.info('signal session missing, fetching remote key bundle', { jid })
        const fetched = await this.signalSessionSync.fetchKeyBundle({
            jid,
            reasonIdentity
        })
        const remoteIdentity = toSerializedPubKey(fetched.bundle.identity)
        if (expectedIdentity && !uint8Equal(remoteIdentity, toSerializedPubKey(expectedIdentity))) {
            throw new Error('identity mismatch')
        }
        await this.signalProtocol.establishOutgoingSession(address, fetched.bundle)
        this.logger.info('signal session synchronized', {
            jid,
            regId: fetched.bundle.regId,
            hasOneTimeKey: fetched.bundle.oneTimeKey !== undefined
        })
    }

    private assertRegisteredSession(context: string): void {
        if (this.getCurrentMeJid()) {
            return
        }
        throw new Error(`${context} requires registered meJid`)
    }

    private requireCurrentMeJid(context: string): string {
        const meJid = this.getCurrentMeJid()
        if (meJid) {
            return meJid
        }
        throw new Error(`${context} requires registered meJid`)
    }
}
