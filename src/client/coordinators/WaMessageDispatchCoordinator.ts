import type { WaAppStateSyncKey } from '@appstate/types'
import type { DeviceFanoutResolver } from '@client/messaging/fanout'
import type { AppStateSyncKeyProtocol } from '@client/messaging/key-protocol'
import type { GroupParticipantsCache } from '@client/messaging/participants'
import type { WaGroupEvent, WaSignalMessagePublishInput, WaSendMessageOptions } from '@client/types'
import { randomBytesAsync, sha256 } from '@crypto'
import type { Logger } from '@infra/log/types'
import { ensureMessageSecret } from '@message'
import { resolveMessageTypeAttr } from '@message/content'
import { wrapDeviceSentMessage } from '@message/device-sent'
import { writeRandomPadMax16 } from '@message/padding'
import { computePhashV2 } from '@message/phash'
import {
    buildReportingTokenArtifacts,
    type BuildReportingTokenArtifactsResult
} from '@message/reporting-token'
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
import { signalAddressKey } from '@protocol/jid'
import type { OutboundRetryTracker } from '@retry/tracker'
import type { WaRetryReplayPayload } from '@retry/types'
import type { SenderKeyManager } from '@signal/group/SenderKeyManager'
import type { SignalSessionResolver } from '@signal/session/resolver'
import type { SignalProtocol } from '@signal/session/SignalProtocol'
import type { SignalAddress } from '@signal/types'
import { encodeBinaryNode } from '@transport/binary'
import {
    buildDirectMessageFanoutNode,
    buildGroupDirectMessageNode,
    buildGroupSenderKeyMessageNode
} from '@transport/node/builders/message'
import type { BinaryNode } from '@transport/types'
import { bytesToHex, concatBytes, TEXT_ENCODER } from '@util/bytes'
import { toError } from '@util/primitives'

interface WaMessageDispatchCoordinatorOptions {
    readonly logger: Logger
    readonly messageClient: WaMessageClient
    readonly retryTracker: OutboundRetryTracker
    readonly sessionResolver: SignalSessionResolver
    readonly fanoutResolver: DeviceFanoutResolver
    readonly participantsCache: GroupParticipantsCache
    readonly appStateSyncKeyProtocol: AppStateSyncKeyProtocol
    readonly buildMessageContent: (content: WaSendMessageContent) => Promise<Proto.IMessage>
    readonly senderKeyManager: SenderKeyManager
    readonly signalProtocol: SignalProtocol
    readonly getCurrentMeJid: () => string | null | undefined
    readonly getCurrentMeLid: () => string | null | undefined
    readonly getCurrentSignedIdentity: () => Proto.IADVSignedDeviceIdentity | null | undefined
}

type GroupAddressingMode = 'pn' | 'lid'

interface GroupSendRetryContext {
    readonly retried?: boolean
    readonly forceRefreshParticipants?: boolean
    readonly forceAddressingMode?: GroupAddressingMode
}

export class WaMessageDispatchCoordinator {
    private readonly logger: Logger
    private readonly messageClient: WaMessageClient
    private readonly retryTracker: OutboundRetryTracker
    private readonly sessionResolver: SignalSessionResolver
    private readonly fanoutResolver: DeviceFanoutResolver
    private readonly participantsCache: GroupParticipantsCache
    private readonly appStateSyncKeyProtocol: AppStateSyncKeyProtocol
    private readonly buildMessageContent: (content: WaSendMessageContent) => Promise<Proto.IMessage>
    private readonly senderKeyManager: SenderKeyManager
    private readonly signalProtocol: SignalProtocol
    private readonly getCurrentMeJid: () => string | null | undefined
    private readonly getCurrentMeLid: () => string | null | undefined
    private readonly getCurrentSignedIdentity: () =>
        | Proto.IADVSignedDeviceIdentity
        | null
        | undefined

    public constructor(options: WaMessageDispatchCoordinatorOptions) {
        this.logger = options.logger
        this.messageClient = options.messageClient
        this.retryTracker = options.retryTracker
        this.sessionResolver = options.sessionResolver
        this.fanoutResolver = options.fanoutResolver
        this.participantsCache = options.participantsCache
        this.appStateSyncKeyProtocol = options.appStateSyncKeyProtocol
        this.buildMessageContent = options.buildMessageContent
        this.senderKeyManager = options.senderKeyManager
        this.signalProtocol = options.signalProtocol
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
        return this.retryTracker.track(
            {
                messageIdHint: node.attrs.id,
                toJid: node.attrs.to,
                type: messageType,
                replayPayload,
                participantJid: node.attrs.participant,
                recipientJid: node.attrs.recipient
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
        return this.retryTracker.track(
            {
                messageIdHint: input.id,
                toJid: input.to,
                type: input.type ?? 'text',
                replayPayload,
                participantJid: input.participant
            },
            async () => this.messageClient.publishEncrypted(input, options)
        )
    }

    public async publishSignalMessage(
        input: WaSignalMessagePublishInput,
        options: WaMessagePublishOptions = {}
    ): Promise<WaMessagePublishResult> {
        this.requireCurrentMeJid('publishSignalMessage')
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
        const [paddedPlaintext] = await Promise.all([
            writeRandomPadMax16(input.plaintext),
            this.sessionResolver.ensureSession(address, input.to, input.expectedIdentity)
        ])
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
        return this.retryTracker.track(
            {
                messageIdHint: input.id,
                toJid: input.to,
                type: messageType,
                replayPayload,
                participantJid: input.participant
            },
            async () =>
                this.messageClient.publishEncrypted(
                    {
                        to: input.to,
                        encType: encrypted.type,
                        ciphertext: encrypted.ciphertext,
                        id: input.id,
                        type: input.type,
                        category: input.category,
                        pushPriority: input.pushPriority,
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
        const recipientJid = normalizeRecipientJid(to)
        const message = await this.buildMessageContent(content)
        const messageWithSecret = await ensureMessageSecret(message)
        const sendOptions = await this.withResolvedMessageId(options)
        const plaintext = await writeRandomPadMax16(
            proto.Message.encode(messageWithSecret).finish()
        )
        const type = resolveMessageTypeAttr(messageWithSecret)

        if (isGroupJid(recipientJid)) {
            if (this.shouldUseGroupDirectPath(messageWithSecret)) {
                return this.publishGroupDirectMessage(
                    recipientJid,
                    messageWithSecret,
                    plaintext,
                    type,
                    sendOptions
                )
            }
            return this.publishGroupSenderKeyMessage(
                recipientJid,
                messageWithSecret,
                plaintext,
                type,
                sendOptions
            )
        }

        const directRecipientJid = toUserJid(recipientJid)
        return this.publishDirectSignalMessageWithFanout(
            directRecipientJid,
            messageWithSecret,
            plaintext,
            type,
            sendOptions
        )
    }

    public async syncSignalSession(jid: string, reasonIdentity = false): Promise<void> {
        const address = parseSignalAddressFromJid(jid)
        if (address.server === WA_DEFAULTS.GROUP_SERVER) {
            throw new Error('syncSignalSession supports only direct chats')
        }
        await this.sessionResolver.ensureSession(address, jid, undefined, reasonIdentity)
    }

    public async sendReceipt(input: WaSendReceiptInput): Promise<void> {
        await this.messageClient.sendReceipt(input)
    }

    public async requestAppStateSyncKeys(
        keyIds: readonly Uint8Array[]
    ): Promise<readonly string[]> {
        return this.appStateSyncKeyProtocol.requestKeys(keyIds)
    }

    public async sendAppStateSyncKeyShare(
        toDeviceJid: string,
        keys: readonly WaAppStateSyncKey[],
        missingKeyIds: readonly Uint8Array[] = []
    ): Promise<void> {
        await this.appStateSyncKeyProtocol.sendKeyShare(toDeviceJid, keys, missingKeyIds)
    }

    public async mutateParticipantsCacheFromGroupEvent(event: WaGroupEvent): Promise<void> {
        await this.participantsCache.mutateFromGroupEvent(event)
    }

    private shouldUseGroupDirectPath(message: Proto.IMessage): boolean {
        const protocolType = message.protocolMessage?.type
        if (
            protocolType === proto.Message.ProtocolMessage.Type.REVOKE ||
            protocolType === proto.Message.ProtocolMessage.Type.MESSAGE_EDIT
        ) {
            return true
        }
        return message.keepInChatMessage?.keepType === proto.KeepType.UNDO_KEEP_FOR_ALL
    }

    private async publishGroupDirectMessage(
        groupJid: string,
        message: Proto.IMessage,
        plaintext: Uint8Array,
        type: string,
        options: WaSendMessageOptions,
        retryContext: GroupSendRetryContext = {}
    ): Promise<WaMessagePublishResult> {
        const sendOptions = await this.withResolvedMessageId(options)
        const meJid = this.requireCurrentMeJid('sendMessage')
        const participantUserJids = retryContext.forceRefreshParticipants
            ? await this.participantsCache.refreshParticipantUsers(groupJid)
            : await this.participantsCache.resolveParticipantUsers(groupJid)
        const addressingMode =
            retryContext.forceAddressingMode ??
            this.resolveGroupAddressingMode(participantUserJids, groupJid)
        const senderForPhash = this.resolveSenderForAddressingMode(addressingMode, meJid)
        const fanoutDeviceJids =
            await this.fanoutResolver.resolveGroupParticipantDeviceJids(participantUserJids)
        if (fanoutDeviceJids.length === 0) {
            throw new Error('group direct send resolved no target devices')
        }
        await this.sessionResolver.ensureSessionsBatch(fanoutDeviceJids)
        const participants = await Promise.all(
            fanoutDeviceJids.map(async (targetJid) => {
                const address = parseSignalAddressFromJid(targetJid)
                const encrypted = await this.signalProtocol.encryptMessage(address, plaintext)
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
        const localPhash = await computePhashV2([...fanoutDeviceJids, senderForPhash])
        const reportingArtifacts = await this.tryBuildReportingTokenArtifacts({
            message,
            stanzaId: sendOptions.id,
            senderUserJid: toUserJid(senderForPhash),
            remoteJid: groupJid,
            context: 'group_direct'
        })
        const messageNode = buildGroupDirectMessageNode({
            to: groupJid,
            type,
            id: sendOptions.id,
            phash: localPhash,
            addressingMode,
            participants,
            deviceIdentity: shouldAttachDeviceIdentity
                ? this.getEncodedSignedDeviceIdentity()
                : undefined,
            reportingNode: reportingArtifacts?.node ?? undefined
        })
        const replayPayload: WaRetryReplayPayload = {
            mode: 'plaintext',
            to: groupJid,
            type,
            plaintext
        }
        const result = await this.retryTracker.track(
            {
                messageIdHint: sendOptions.id ?? messageNode.attrs.id,
                toJid: groupJid,
                type,
                replayPayload
            },
            async () => this.messageClient.publishNode(messageNode, sendOptions)
        )
        const ackError = result.ack.error
        const serverPhash = result.ack.phash
        const serverAddressingMode = result.ack.addressingMode
        const hasPhashMismatch = !!serverPhash && serverPhash !== localPhash
        const hasAddressingMismatch =
            !!serverAddressingMode && serverAddressingMode !== addressingMode
        const hasAddressingError = ackError === 421
        if (
            !retryContext.retried &&
            (hasPhashMismatch || hasAddressingMismatch || hasAddressingError)
        ) {
            this.logger.warn('group direct publish acknowledged with mismatch metadata', {
                id: result.id,
                groupJid,
                localPhash,
                serverPhash,
                localAddressingMode: addressingMode,
                serverAddressingMode,
                ackError
            })
            return this.publishGroupDirectMessage(
                groupJid,
                message,
                plaintext,
                type,
                {
                    ...sendOptions,
                    id: result.id
                },
                {
                    retried: true,
                    forceRefreshParticipants: true,
                    forceAddressingMode: serverAddressingMode
                }
            )
        }
        return result
    }

    private async publishGroupSenderKeyMessage(
        groupJid: string,
        message: Proto.IMessage,
        plaintext: Uint8Array,
        type: string,
        options: WaSendMessageOptions,
        retryContext: GroupSendRetryContext = {}
    ): Promise<WaMessagePublishResult> {
        const sendOptions = await this.withResolvedMessageId(options)
        const meJid = this.requireCurrentMeJid('sendMessage')
        const participantUserJids = retryContext.forceRefreshParticipants
            ? await this.participantsCache.refreshParticipantUsers(groupJid)
            : await this.participantsCache.resolveParticipantUsers(groupJid)
        const addressingMode =
            retryContext.forceAddressingMode ??
            this.resolveGroupAddressingMode(participantUserJids, groupJid)
        const senderJid = this.resolveSenderForAddressingMode(addressingMode, meJid)
        const sender = parseSignalAddressFromJid(senderJid)
        const senderKeyDistributionMessage =
            await this.senderKeyManager.createSenderKeyDistributionMessage(groupJid, sender)
        const groupCiphertext = await this.senderKeyManager.encryptGroupMessage(
            groupJid,
            sender,
            plaintext
        )
        const distributionData = await this.encryptGroupDistributionParticipants(
            groupJid,
            sender,
            senderKeyDistributionMessage,
            participantUserJids
        )
        const { fanoutDeviceJids, distributionParticipants } = distributionData
        const shouldAttachDeviceIdentity = distributionParticipants.some(
            (participant) => participant.encType === 'pkmsg'
        )
        const localPhash = await computePhashV2([...fanoutDeviceJids, senderJid])
        const reportingArtifacts = await this.tryBuildReportingTokenArtifacts({
            message,
            stanzaId: sendOptions.id,
            senderUserJid: toUserJid(senderJid),
            remoteJid: groupJid,
            context: 'group_sender_key'
        })
        const messageNode = buildGroupSenderKeyMessageNode({
            to: groupJid,
            type,
            id: sendOptions.id,
            phash: localPhash,
            addressingMode,
            groupCiphertext: groupCiphertext.ciphertext,
            participants: distributionParticipants,
            deviceIdentity: shouldAttachDeviceIdentity
                ? this.getEncodedSignedDeviceIdentity()
                : undefined,
            reportingNode: reportingArtifacts?.node ?? undefined
        })

        const replayPayload: WaRetryReplayPayload = {
            mode: 'plaintext',
            to: groupJid,
            type,
            plaintext
        }
        const result = await this.retryTracker.track(
            {
                messageIdHint: sendOptions.id ?? messageNode.attrs.id,
                toJid: groupJid,
                type,
                replayPayload
            },
            async () => this.messageClient.publishNode(messageNode, sendOptions)
        )
        const distributedAddresses = distributionParticipants.map(
            (participant) => participant.address
        )
        try {
            await this.senderKeyManager.markSenderKeyDistributed(
                groupJid,
                sender,
                distributedAddresses
            )
        } catch (error) {
            this.logger.warn('failed to mark sender key distribution targets', {
                groupJid,
                participants: distributedAddresses.length,
                message: toError(error).message
            })
        }
        const ackError = result.ack.error
        const serverPhash = result.ack.phash
        const serverAddressingMode = result.ack.addressingMode
        const hasPhashMismatch = !!serverPhash && serverPhash !== localPhash
        const hasAddressingMismatch =
            !!serverAddressingMode && serverAddressingMode !== addressingMode
        const hasAddressingError = ackError === 421
        if (
            !retryContext.retried &&
            (hasPhashMismatch || hasAddressingMismatch || hasAddressingError)
        ) {
            this.logger.warn('group message publish acknowledged with mismatch metadata', {
                id: result.id,
                groupJid,
                localPhash,
                serverPhash,
                localAddressingMode: addressingMode,
                serverAddressingMode,
                ackError
            })
            return this.publishGroupSenderKeyMessage(
                groupJid,
                message,
                plaintext,
                type,
                {
                    ...sendOptions,
                    id: result.id
                },
                {
                    retried: true,
                    forceRefreshParticipants: true,
                    forceAddressingMode: serverAddressingMode
                }
            )
        }
        return result
    }

    private resolveGroupAddressingMode(
        participantUserJids: readonly string[],
        groupJid: string
    ): GroupAddressingMode {
        for (const participantJid of participantUserJids) {
            try {
                if (splitJid(participantJid).server === 'lid') {
                    return 'lid'
                }
            } catch (error) {
                this.logger.trace(
                    'ignoring malformed participant jid in addressing mode resolution',
                    { participantJid, message: toError(error).message }
                )
            }
        }

        this.logger.trace('group addressing mode resolved to pn (default)', {
            groupJid,
            participants: participantUserJids.length
        })
        return 'pn'
    }

    private resolveSenderForAddressingMode(
        addressingMode: GroupAddressingMode,
        meJid: string
    ): string {
        if (addressingMode === 'lid') {
            const meLid = this.getCurrentMeLid()
            if (meLid && meLid.includes('@')) {
                try {
                    return normalizeDeviceJid(meLid)
                } catch (error) {
                    this.logger.trace('ignoring malformed me lid jid', {
                        meLid,
                        message: toError(error).message
                    })
                }
            }
        }
        return normalizeDeviceJid(meJid)
    }

    private async encryptGroupDistributionParticipants(
        groupJid: string,
        sender: SignalAddress,
        senderKeyDistributionMessage: Proto.Message.ISenderKeyDistributionMessage,
        participantUserJids: readonly string[]
    ): Promise<{
        readonly fanoutDeviceJids: readonly string[]
        readonly distributionParticipants: readonly {
            readonly jid: string
            readonly address: SignalAddress
            readonly encType: 'msg' | 'pkmsg'
            readonly ciphertext: Uint8Array
        }[]
    }> {
        const distributionPayload = await writeRandomPadMax16(
            proto.Message.encode({
                senderKeyDistributionMessage
            }).finish()
        )
        const fanoutDeviceJids =
            await this.fanoutResolver.resolveGroupParticipantDeviceJids(participantUserJids)
        if (fanoutDeviceJids.length === 0) {
            return {
                fanoutDeviceJids,
                distributionParticipants: []
            }
        }
        const fanoutTargetsByAddressKey = new Map<
            string,
            {
                readonly jid: string
                readonly address: SignalAddress
            }
        >()
        const fanoutAddresses: SignalAddress[] = new Array(fanoutDeviceJids.length)
        for (let index = 0; index < fanoutDeviceJids.length; index += 1) {
            const jid = fanoutDeviceJids[index]
            const address = parseSignalAddressFromJid(jid)
            fanoutAddresses[index] = address
            fanoutTargetsByAddressKey.set(signalAddressKey(address), { jid, address })
        }
        const pendingAddresses = await this.senderKeyManager.filterParticipantsNeedingDistribution(
            groupJid,
            sender,
            fanoutAddresses
        )
        if (pendingAddresses.length === 0) {
            return {
                fanoutDeviceJids,
                distributionParticipants: []
            }
        }
        const pendingAddressKeys = new Set<string>()
        const pendingTargets: {
            readonly jid: string
            readonly address: SignalAddress
        }[] = []
        for (let index = 0; index < pendingAddresses.length; index += 1) {
            const key = signalAddressKey(pendingAddresses[index])
            if (pendingAddressKeys.has(key)) {
                continue
            }
            pendingAddressKeys.add(key)
            const target = fanoutTargetsByAddressKey.get(key)
            if (target) {
                pendingTargets.push(target)
            }
        }
        if (pendingTargets.length === 0) {
            return {
                fanoutDeviceJids,
                distributionParticipants: []
            }
        }
        const pendingTargetJids = new Array<string>(pendingTargets.length)
        for (let index = 0; index < pendingTargets.length; index += 1) {
            pendingTargetJids[index] = pendingTargets[index].jid
        }
        await this.sessionResolver.ensureSessionsBatch(pendingTargetJids)
        const distributionParticipants = await Promise.all(
            pendingTargets.map(async (target) => {
                const encrypted = await this.signalProtocol.encryptMessage(
                    target.address,
                    distributionPayload
                )
                return {
                    jid: target.jid,
                    address: target.address,
                    encType: encrypted.type,
                    ciphertext: encrypted.ciphertext
                }
            })
        )
        return {
            fanoutDeviceJids,
            distributionParticipants
        }
    }

    private async publishDirectSignalMessageWithFanout(
        recipientJid: string,
        message: Proto.IMessage,
        plaintext: Uint8Array,
        type: string,
        options: WaSendMessageOptions
    ): Promise<WaMessagePublishResult> {
        const sendOptions = await this.withResolvedMessageId(options)
        const meJid = this.requireCurrentMeJid('sendMessage')
        const meLid = this.getCurrentMeLid()
        const selfDeviceJidForRecipient = this.fanoutResolver.resolveSelfDeviceJidForRecipient(
            recipientJid,
            meJid,
            meLid
        )
        const deviceJids = await this.fanoutResolver.resolveDirectFanoutDeviceJids(
            recipientJid,
            selfDeviceJidForRecipient
        )
        const targets = deviceJids.map((jid) => ({
            jid,
            normalizedJid: normalizeDeviceJid(jid),
            userJid: toUserJid(jid)
        }))
        const recipientUserJid = toUserJid(recipientJid)
        const meUserJid = toUserJid(selfDeviceJidForRecipient)

        this.logger.debug('wa client publish signal fanout', {
            to: recipientJid,
            devices: deviceJids.length,
            type
        })
        const expectedIdentityByJid = new Map<string, Uint8Array>()
        if (sendOptions.expectedIdentity) {
            for (let index = 0; index < targets.length; index += 1) {
                const target = targets[index]
                if (target.userJid === recipientUserJid) {
                    expectedIdentityByJid.set(target.normalizedJid, sendOptions.expectedIdentity)
                }
            }
        }
        await this.sessionResolver.ensureSessionsBatch(deviceJids, expectedIdentityByJid)

        const hasSelfDeviceFanout = targets.some((target) => target.userJid === meUserJid)
        const selfDevicePlaintext = hasSelfDeviceFanout
            ? await writeRandomPadMax16(
                  proto.Message.encode(wrapDeviceSentMessage(message, recipientUserJid)).finish()
              )
            : null

        const participants: {
            readonly jid: string
            readonly encType: 'msg' | 'pkmsg'
            readonly ciphertext: Uint8Array
        }[] = await Promise.all(
            targets.map(async (target) => {
                const address = parseSignalAddressFromJid(target.jid)
                const expectedIdentity =
                    target.userJid === recipientUserJid ? sendOptions.expectedIdentity : undefined
                const plaintextForTarget =
                    selfDevicePlaintext && target.userJid === meUserJid
                        ? selfDevicePlaintext
                        : plaintext
                const encrypted = await this.signalProtocol.encryptMessage(
                    address,
                    plaintextForTarget,
                    expectedIdentity
                )
                return {
                    jid: target.jid,
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
        const reportingArtifacts = await this.tryBuildReportingTokenArtifacts({
            message,
            stanzaId: sendOptions.id,
            senderUserJid: meUserJid,
            remoteJid: recipientUserJid,
            context: 'direct_fanout'
        })
        const messageNode = buildDirectMessageFanoutNode({
            to: recipientJid,
            type,
            id: sendOptions.id,
            participants,
            deviceIdentity,
            reportingNode: reportingArtifacts?.node ?? undefined
        })

        const replayPayload: WaRetryReplayPayload = {
            mode: 'plaintext',
            to: recipientJid,
            type,
            plaintext
        }
        return this.retryTracker.track(
            {
                messageIdHint: sendOptions.id ?? messageNode.attrs.id,
                toJid: recipientJid,
                type,
                replayPayload
            },
            async () => this.messageClient.publishNode(messageNode, sendOptions)
        )
    }

    private async withResolvedMessageId(
        options: WaSendMessageOptions
    ): Promise<WaSendMessageOptions> {
        const normalizedId = options.id?.trim()
        if (normalizedId) {
            if (normalizedId === options.id) {
                return options
            }
            return {
                ...options,
                id: normalizedId
            }
        }

        return {
            ...options,
            id: await this.generateOutgoingMessageId()
        }
    }

    private async generateOutgoingMessageId(): Promise<string> {
        try {
            const meUserJid = toUserJid(this.requireCurrentMeJid('sendMessage'))
            const timestampSeconds = Math.floor(Date.now() / 1_000)
            const timestampBytes = new Uint8Array(8)
            new DataView(
                timestampBytes.buffer,
                timestampBytes.byteOffset,
                timestampBytes.byteLength
            ).setBigUint64(0, BigInt(timestampSeconds), false)

            const entropy = concatBytes([
                timestampBytes,
                TEXT_ENCODER.encode(meUserJid),
                await randomBytesAsync(8)
            ])
            const digest = await sha256(entropy)
            return `3EB0${bytesToHex(digest.subarray(0, 9)).toUpperCase()}`
        } catch (error) {
            this.logger.warn('failed to generate sha256 message id, falling back to random id', {
                message: toError(error).message
            })
            return `3EB0${bytesToHex(await randomBytesAsync(8)).toUpperCase()}`
        }
    }

    private async tryBuildReportingTokenArtifacts(input: {
        readonly message: Proto.IMessage
        readonly stanzaId?: string
        readonly senderUserJid: string
        readonly remoteJid: string
        readonly context: string
    }): Promise<BuildReportingTokenArtifactsResult | null> {
        if (!input.stanzaId) {
            return null
        }

        try {
            return await buildReportingTokenArtifacts({
                message: input.message,
                stanzaId: input.stanzaId,
                senderUserJid: input.senderUserJid,
                remoteJid: input.remoteJid
            })
        } catch (error) {
            this.logger.warn('failed to generate reporting token', {
                context: input.context,
                id: input.stanzaId,
                remoteJid: input.remoteJid,
                message: toError(error).message
            })
            return null
        }
    }

    private getEncodedSignedDeviceIdentity(): Uint8Array {
        const signedIdentity = this.getCurrentSignedIdentity()
        if (!signedIdentity) {
            throw new Error('missing signed identity for pkmsg fanout')
        }
        return proto.ADVSignedDeviceIdentity.encode(signedIdentity).finish()
    }

    private requireCurrentMeJid(context: string): string {
        const meJid = this.getCurrentMeJid()
        if (meJid) {
            return meJid
        }
        throw new Error(`${context} requires registered meJid`)
    }
}
