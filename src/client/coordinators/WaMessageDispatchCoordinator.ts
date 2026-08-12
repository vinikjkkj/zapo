import type { WaAppStateSyncKey } from '@appstate/types'
import type { WaAuthCredentials } from '@auth/types'
import type { DeviceFanoutResolver } from '@client/messaging/fanout'
import type { GroupMetadataCache } from '@client/messaging/group-metadata'
import type { AppStateSyncKeyProtocol } from '@client/messaging/key-protocol'
import type {
    WaGroupEvent,
    WaOutgoingMessageEvent,
    WaSendMessageOptions,
    WaSignalMessagePublishInput
} from '@client/types'
import { randomBytesAsync, sha256 } from '@crypto'
import { md5Bytes } from '@crypto/core/primitives'
import type { Logger } from '@infra/log/types'
import { PromiseDedup } from '@infra/perf/PromiseDedup'
import { assertMessageSecret, ensureMessageSecret } from '@message'
import {
    applyContextInfo,
    resolveSendContextInfo,
    type WaSendContextInfo
} from '@message/context-info'
import { type IcdcMeta, injectDeviceListMetadata, resolveIcdcMeta } from '@message/crypto/icdc'
import { computePhashV2 } from '@message/crypto/phash'
import {
    buildReportingTokenArtifacts,
    type BuildReportingTokenArtifactsResult
} from '@message/crypto/reporting-token'
import {
    isSendAddonCryptoMessage,
    isSendMediaMessage,
    isSendTextMessage,
    needsSecretPersistence,
    resolveOutboundMessageAttrs,
    unwrapMessage,
    wrapAsViewOnce
} from '@message/encode/content'
import { wrapDeviceSentMessage } from '@message/encode/device-sent'
import { unpadPkcs7, writeRandomPadMax16 } from '@message/encode/padding'
import { buildBotInvokeProtoCopy, extractInvokedBotJid, genBotMsgSecret } from '@message/kinds/bot'
import type {
    WaEncryptedMessageInput,
    WaMessageBuildResult,
    WaMessagePublishOptions,
    WaMessagePublishResult,
    WaSendMessageContent,
    WaSendReceiptInput
} from '@message/types'
import type { WaMessageClient } from '@message/WaMessageClient'
import { proto, type Proto } from '@proto'
import {
    normalizeEphemeralSettingSeconds,
    WA_ADDRESSING_MODES,
    WA_DEFAULTS,
    WA_NACK_REASONS,
    type WaStatusDistributionSetting
} from '@protocol/constants'
import {
    canonicalizeOwnAccountJid,
    isBotJid,
    isGroupJid,
    isHostedDeviceJid,
    isLidJid,
    isNewsletterJid,
    isUserJid,
    normalizeDeviceJid,
    normalizeRecipientJid,
    parseJidFull,
    parseSignalAddressFromJid,
    signalAddressKey,
    toUserJid
} from '@protocol/jid'
import type { OutboundRetryTracker } from '@retry/tracker'
import type { WaRetryReplayPayload } from '@retry/types'
import type { SignalDeviceSyncApi } from '@signal/api/SignalDeviceSyncApi'
import type { SenderKeyManager } from '@signal/group/SenderKeyManager'
import type { SignalResolvedSessionTarget, SignalSessionResolver } from '@signal/session/resolver'
import type { SignalProtocol } from '@signal/session/SignalProtocol'
import type { SignalAddress } from '@signal/types'
import type {
    WaChatMetadataSnapshot,
    WaChatMetadataStore
} from '@store/contracts/chat-metadata.store'
import type { WaDeviceListStore } from '@store/contracts/device-list.store'
import type { WaIdentityStore } from '@store/contracts/identity.store'
import type { WaMessageSecretStore } from '@store/contracts/message-secret.store'
import type { WaSessionStore } from '@store/contracts/session.store'
import type { WaSignalStore } from '@store/contracts/signal.store'
import type { WaThreadStore } from '@store/contracts/thread.store'
import { encodeBinaryNode } from '@transport/binary'
import {
    buildButtonAddonNode,
    buildDirectMessageFanoutNode,
    buildGroupSenderKeyMessageNode,
    buildMetaNode
} from '@transport/node/builders/message'
import type { BinaryNode } from '@transport/types'
import { bytesToHex, TEXT_ENCODER } from '@util/bytes'
import type { ServerClock } from '@util/clock'
import { toError } from '@util/primitives'

interface WaMessageDispatchCoordinatorOptions {
    readonly logger: Logger
    /** Emits the outbound decrypted message (`message_send` event); best-effort. */
    readonly emitMessageSend?: (event: WaOutgoingMessageEvent) => void
    readonly messageClient: WaMessageClient
    readonly retryTracker: OutboundRetryTracker
    readonly sessionResolver: SignalSessionResolver
    readonly fanoutResolver: DeviceFanoutResolver
    readonly groupMetadataCache: GroupMetadataCache
    readonly appStateSyncKeyProtocol: AppStateSyncKeyProtocol
    readonly buildMessageContent: (
        content: WaSendMessageContent,
        ctx?: {
            readonly to: string
            readonly outgoingStanzaId?: string
            readonly meJid?: string
        }
    ) => Promise<WaMessageBuildResult>
    readonly senderKeyManager: SenderKeyManager
    readonly signalProtocol: SignalProtocol
    readonly signalStore: WaSignalStore
    readonly sessionStore: WaSessionStore
    readonly identityStore: WaIdentityStore
    readonly deviceListStore: WaDeviceListStore
    readonly threadStore: WaThreadStore
    readonly chatMetadataStore: WaChatMetadataStore
    readonly signalDeviceSync: SignalDeviceSyncApi
    readonly messageSecretStore: WaMessageSecretStore
    /**
     * When `true`, persist the message secret for every outgoing message, not
     * only the poll / event / bot prompts that `needsSecretPersistence` flags.
     * Wired from the client-level `addons.persistAllSecrets` option.
     */
    readonly persistAllMessageSecrets?: boolean
    readonly getCurrentCredentials: () => WaAuthCredentials | null
    readonly resolvePrivacyTokenNode: (recipientJid: string) => Promise<BinaryNode | null>
    readonly onDirectMessageSent: (recipientJid: string) => void
    readonly sendNewsletterMessage?: (
        newsletterJid: string,
        content: WaSendMessageContent,
        options: WaSendMessageOptions,
        contextInfo: WaSendContextInfo | null
    ) => Promise<WaMessagePublishResult>
    readonly getIcdcHashLength?: () => number
    /**
     * Resolved per outgoing message (post-connect, after credentials load) so a
     * registered mobile session reconnecting without an explicit
     * `mobileTransport` option still emits the mobile message-id format.
     */
    readonly mobileMessageIdFormat?: () => boolean
    readonly serverClock: ServerClock
}

type GroupAddressingMode = 'pn' | 'lid'

interface GroupSendRetryContext {
    readonly retried?: boolean
    readonly forceRefreshParticipants?: boolean
    readonly forceAddressingMode?: GroupAddressingMode
}

/** Membership split behind a group-history share, in the group's addressing mode. */
export interface WaGroupHistoryAudience {
    /** Members the bundle is addressed to. */
    readonly historyReceivers: readonly string[]
    /** Members in the group who are not receiving it. */
    readonly nonHistoryReceivers: readonly string[]
    /** Requested JIDs that are not current members of the group. */
    readonly unknownJids: readonly string[]
    /** Whether the caller asked to share with this account itself. */
    readonly requestedSelf: boolean
    readonly addressingMode: 'pn' | 'lid'
}

/**
 * Members a group-history bundle is addressed to. Empty for every other
 * message, which is what keeps the restricted fanout scoped to bundles.
 */
function resolveGroupHistoryReceivers(message: Proto.IMessage): readonly string[] {
    const metadata = unwrapMessage(message).messageHistoryBundle?.messageHistoryMetadata
    return metadata?.historyReceivers ?? []
}

/**
 * Narrows a group's participant list to the members a group-history bundle is
 * addressed to, plus the sender so its own devices keep a copy. Receivers are
 * intersected with the live participant list, so a stale receiver entry cannot
 * pull a non-member into the fanout. Any other message keeps the full list.
 *
 * Receivers must be written in the group's addressing mode - a PN entry for a
 * LID-addressed group does not match and is reported through `onDropped`.
 *
 * @throws when no receiver matches a current member. Sending to the sender's
 * own devices alone counts as no match: it would look like a delivered share
 * while nobody received anything.
 */
export function restrictGroupHistoryTargets(
    message: Proto.IMessage,
    participantUserJids: readonly string[],
    senderJid: string,
    onDropped?: (droppedJids: readonly string[], totalExpected: number) => void
): readonly string[] {
    const receivers = resolveGroupHistoryReceivers(message)
    if (receivers.length === 0) {
        return participantUserJids
    }
    const pending = new Set<string>()
    for (let index = 0; index < receivers.length; index += 1) {
        pending.add(toUserJid(receivers[index]))
    }
    const senderUserJid = toUserJid(senderJid)
    const targets: string[] = []
    let matchedReceivers = 0
    for (let index = 0; index < participantUserJids.length; index += 1) {
        const participant = participantUserJids[index]
        const participantUserJid = toUserJid(participant)
        if (pending.delete(participantUserJid)) {
            matchedReceivers += 1
            targets[targets.length] = participant
        } else if (participantUserJid === senderUserJid) {
            targets[targets.length] = participant
        }
    }
    if (pending.size > 0 && onDropped) {
        onDropped([...pending], receivers.length)
    }
    if (matchedReceivers === 0) {
        throw new Error('group history bundle resolved no receivers in the group')
    }
    return targets
}

interface WaOutboundEnvelope {
    readonly message: Proto.IMessage
    readonly plaintext: Uint8Array
    readonly type: string
    readonly edit?: string
    readonly mediatype?: string
    readonly decryptFail?: string
    readonly customNodes?: readonly BinaryNode[]
    readonly sendOptions: WaSendMessageOptions
}

export class WaMessageDispatchCoordinator {
    private readonly deps: WaMessageDispatchCoordinatorOptions
    private readonly mobileMessageIdFormat: () => boolean
    private readonly serverClock: ServerClock
    private readonly icdcDedup = new PromiseDedup()
    private readonly privacyTokenDedup = new PromiseDedup()
    private readonly distributionDedup = new PromiseDedup()

    public constructor(options: WaMessageDispatchCoordinatorOptions) {
        this.deps = options
        this.mobileMessageIdFormat = options.mobileMessageIdFormat ?? (() => false)
        this.serverClock = options.serverClock
    }

    /**
     * Per-chat disappearing settings from the cache, falling back to the
     * durable thread record on a cold miss and warming the cache with it. A
     * chat with no disappearing mode is cached as expiration `0` rather than
     * left absent, so the archive is not re-read on every send to it; the
     * incoming writers overwrite that entry the moment the chat turns it on.
     * A failing archive degrades the send to "no ephemeral fields" instead of
     * rejecting it - the store is opt-in persistence, not a send dependency.
     */
    private async resolveChatMetadata(chatJid: string): Promise<WaChatMetadataSnapshot | null> {
        try {
            const cached = await this.deps.chatMetadataStore.getChatMetadata(chatJid)
            if (cached) {
                return cached
            }
            const thread = await this.deps.threadStore.getByJid(chatJid)
            const expiration = thread?.ephemeralExpiration ?? 0
            const settingTimestamp = expiration > 0 ? thread?.ephemeralSettingTimestamp : undefined
            const snapshot: WaChatMetadataSnapshot = {
                chatJid,
                ephemeralExpiration: expiration,
                ...(settingTimestamp !== undefined
                    ? { ephemeralSettingTimestamp: settingTimestamp }
                    : {}),
                updatedAtMs: Date.now()
            }
            await this.deps.chatMetadataStore.upsertChatMetadata(snapshot)
            return snapshot
        } catch (error) {
            this.deps.logger.debug(
                'chat metadata lookup failed, sending without ephemeral fields',
                {
                    jid: chatJid,
                    message: toError(error).message
                }
            )
            return null
        }
    }

    /**
     * Disappearing-message fields for a send into a chat with the mode on, or
     * `{}` when nothing resolves. Both chat kinds report initiator
     * `CHANGED_IN_CHAT` when nothing more specific is stored; the trigger comes
     * from the group metadata for a group and defaults to `CHAT_SETTING` for
     * 1:1, and is omitted when a group reports none.
     */
    private async resolveChatEphemeral(recipientJid: string): Promise<Partial<WaSendContextInfo>> {
        if (isGroupJid(recipientJid)) {
            const settings =
                await this.deps.groupMetadataCache.resolveEphemeralSettings(recipientJid)
            if (!settings) {
                return {}
            }
            return {
                expirationSeconds: settings.expirationSeconds,
                disappearingModeInitiator: proto.DisappearingMode.Initiator.CHANGED_IN_CHAT,
                ...(settings.trigger !== undefined
                    ? {
                          disappearingModeTrigger: settings.trigger
                      }
                    : {})
            }
        }

        const chat = await this.resolveChatMetadata(recipientJid)
        const expiration = chat?.ephemeralExpiration
        if (expiration === undefined || expiration <= 0) {
            return {}
        }
        const stored = chat?.ephemeralSettingTimestamp
        const settingTimestamp =
            stored !== undefined ? normalizeEphemeralSettingSeconds(stored) : undefined
        return {
            expirationSeconds: expiration,
            disappearingModeInitiator: proto.DisappearingMode.Initiator.CHANGED_IN_CHAT,
            disappearingModeTrigger: proto.DisappearingMode.Trigger.CHAT_SETTING,
            ...(settingTimestamp !== undefined
                ? { ephemeralSettingTimestamp: settingTimestamp }
                : {})
        }
    }

    public async publishMessageNode(
        node: BinaryNode,
        options: WaMessagePublishOptions = {}
    ): Promise<WaMessagePublishResult> {
        this.deps.logger.trace('wa client publish message node', {
            tag: node.tag,
            type: node.attrs.type,
            to: node.attrs.to
        })
        const replayPayload: WaRetryReplayPayload = {
            mode: 'opaque_node',
            node: encodeBinaryNode(node)
        }
        return this.deps.retryTracker.track(
            {
                messageIdHint: node.attrs.id,
                toJid: node.attrs.to,
                replayPayload
            },
            async () => this.deps.messageClient.publishNode(node, options)
        )
    }

    public async publishEncryptedMessage(
        input: WaEncryptedMessageInput,
        options: WaMessagePublishOptions = {}
    ): Promise<WaMessagePublishResult> {
        this.deps.logger.trace('wa client publish encrypted message', {
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
        return this.deps.retryTracker.track(
            {
                messageIdHint: input.id,
                toJid: input.to,
                replayPayload,
                eligibleRequesterDeviceJids: [input.to]
            },
            async () => this.deps.messageClient.publishEncrypted(input, options)
        )
    }

    public async publishSignalMessage(
        input: WaSignalMessagePublishInput,
        options: WaMessagePublishOptions = {}
    ): Promise<WaMessagePublishResult> {
        this.requireCurrentMeJid('publishSignalMessage')
        const credentials = this.deps.getCurrentCredentials()
        const sessionJid = canonicalizeOwnAccountJid(
            input.to,
            credentials?.meJid,
            credentials?.meLid
        )
        const address = parseSignalAddressFromJid(sessionJid)
        if (address.server === WA_DEFAULTS.GROUP_SERVER) {
            throw new Error(
                'publishSignalMessage currently supports only direct chats; use sender-key flow for groups'
            )
        }
        this.deps.logger.trace('wa client publish signal message', {
            to: input.to,
            sessionJid,
            type: input.type
        })
        const [paddedPlaintext] = await Promise.all([
            writeRandomPadMax16(input.plaintext),
            this.deps.sessionResolver.ensureSession(address, sessionJid, input.expectedIdentity)
        ])
        const encrypted = await this.deps.signalProtocol.encryptMessage(
            address,
            paddedPlaintext,
            input.expectedIdentity
        )
        const messageType = input.type ?? 'text'
        const deviceIdentity =
            encrypted.type === 'pkmsg' ? this.getEncodedSignedDeviceIdentity() : undefined
        const replayPayload: WaRetryReplayPayload = {
            mode: 'plaintext',
            to: input.to,
            type: messageType,
            plaintext: paddedPlaintext
        }
        return this.deps.retryTracker.track(
            {
                messageIdHint: input.id,
                toJid: input.to,
                replayPayload,
                eligibleRequesterDeviceJids: [input.to]
            },
            async () =>
                this.deps.messageClient.publishEncrypted(
                    {
                        to: input.to,
                        encType: encrypted.type,
                        ciphertext: encrypted.ciphertext,
                        id: input.id,
                        type: input.type,
                        category: input.category,
                        pushPriority: input.pushPriority,
                        participant: input.participant,
                        deviceFanout: input.deviceFanout,
                        deviceIdentity,
                        metaNode: input.metaNode
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
        if (isNewsletterJid(recipientJid)) {
            if (!this.deps.sendNewsletterMessage) {
                throw new Error('newsletter sendMessage requires sendNewsletterMessage dependency')
            }
            const newsletterCtx = resolveSendContextInfo({
                contentLevel: pickContentContextInfo(content),
                optionsLevel: options.contextInfo,
                quote: options.quote,
                forward: options.forward,
                mentions: options.mentions
            })
            assertNewsletterContextInfoCompatible(newsletterCtx)
            const sendOptions = await this.withResolvedMessageId(options)
            return this.deps.sendNewsletterMessage(
                recipientJid,
                content,
                sendOptions,
                newsletterCtx
            )
        }
        let built: WaMessageBuildResult
        let sendOptions: WaSendMessageOptions
        if (isSendAddonCryptoMessage(content)) {
            sendOptions = await this.withResolvedMessageId(options)
            const meJid = this.deps.getCurrentCredentials()?.meJid
            if (!meJid) {
                throw new Error(`${content.type} sendMessage requires registered meJid`)
            }
            built = await this.deps.buildMessageContent(content, {
                to: recipientJid,
                outgoingStanzaId: sendOptions.id,
                meJid: toUserJid(meJid)
            })
        } else {
            ;[built, sendOptions] = await Promise.all([
                this.deps.buildMessageContent(content, { to: recipientJid }),
                this.withResolvedMessageId(options)
            ])
        }
        const isGroupRecipient = isGroupJid(recipientJid)
        const directRecipientJid = isGroupRecipient
            ? recipientJid
            : await this.resolveDirectRecipientLid(toUserJid(recipientJid))
        let optionsCtx = options.contextInfo
        if (options.expirationSeconds !== undefined) {
            optionsCtx = { ...optionsCtx, expirationSeconds: options.expirationSeconds }
        }
        if (options.ephemeralSettingTimestamp !== undefined) {
            optionsCtx = {
                ...optionsCtx,
                ephemeralSettingTimestamp: options.ephemeralSettingTimestamp
            }
        }
        if (options.disappearingModeTrigger !== undefined) {
            optionsCtx = {
                ...optionsCtx,
                disappearingModeTrigger: options.disappearingModeTrigger
            }
        }
        const autoInjectDisabled = isGroupRecipient
            ? options.disableGroupEphemeralAutoInject
            : options.disableDirectEphemeralAutoInject
        if (optionsCtx?.expirationSeconds === undefined && !autoInjectDisabled) {
            optionsCtx = {
                ...(await this.resolveChatEphemeral(directRecipientJid)),
                ...optionsCtx
            }
        }
        const ctx = resolveSendContextInfo({
            contentLevel: pickContentContextInfo(content),
            optionsLevel: optionsCtx,
            quote: options.quote,
            forward: options.forward,
            mentions: options.mentions,
            meLid: this.deps.getCurrentCredentials()?.meLid,
            targetJid: recipientJid
        })
        const withCtx = ctx ? applyContextInfo(built.message, ctx) : built.message
        const withViewOnce = options.viewOnce ? wrapAsViewOnce(withCtx) : withCtx
        const editKey = options.editKey
        let editId: string | undefined
        let editParticipant: string | undefined
        let editTimestamp: number | undefined
        if (editKey) {
            if ('rawNode' in editKey) {
                editId = editKey.key?.id ?? undefined
                editParticipant = editKey.key?.participant ?? undefined
            } else {
                editId = editKey.id
                editParticipant = editKey.participant
                editTimestamp = 'timestampMs' in editKey ? editKey.timestampMs : undefined
            }
        }
        const message: Proto.IMessage = editKey
            ? {
                  protocolMessage: {
                      type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
                      key: {
                          remoteJid: recipientJid,
                          fromMe: true,
                          id: editId,
                          ...(editParticipant ? { participant: editParticipant } : {})
                      },
                      editedMessage: withViewOnce,
                      timestampMs: editTimestamp ?? this.serverClock.nowMs()
                  }
              }
            : withViewOnce
        const upload = built.upload
        if (this.deps.emitMessageSend) {
            try {
                this.deps.emitMessageSend({ to: recipientJid, id: sendOptions.id, message })
            } catch (error) {
                this.deps.logger.debug('message_send emit failed', {
                    message: toError(error).message
                })
            }
        }
        const messageWithOverride = options.messageSecret
            ? {
                  ...message,
                  messageContextInfo: {
                      ...(message.messageContextInfo ?? {}),
                      messageSecret: assertMessageSecret(
                          options.messageSecret,
                          'options.messageSecret'
                      )
                  }
              }
            : message
        const messageWithSecret = await ensureMessageSecret(messageWithOverride)
        const rawSecret = messageWithSecret.messageContextInfo?.messageSecret
        if (
            rawSecret &&
            rawSecret.length > 0 &&
            sendOptions.id &&
            (this.deps.persistAllMessageSecrets || needsSecretPersistence(messageWithSecret))
        ) {
            void this.deps.messageSecretStore
                .set(sendOptions.id, {
                    secret: rawSecret,
                    senderJid: this.resolveOutgoingSecretSenderJid()
                })
                .catch((error) => {
                    this.deps.logger.warn('failed to persist outgoing message secret', {
                        id: sendOptions.id,
                        to: recipientJid,
                        message: toError(error).message
                    })
                })
        }

        const meJid = this.deps.getCurrentCredentials()?.meJid
        const regInfo = meJid ? await this.deps.signalStore.getRegistrationInfo() : null
        const localPubKey = regInfo?.identityKeyPair.pubKey
        const meParsed = meJid ? parseJidFull(meJid) : undefined
        const meUserJid = meParsed?.userJid
        const localIdentity =
            meParsed && localPubKey ? { address: meParsed.address, pubKey: localPubKey } : undefined
        const isGroup = isGroupJid(recipientJid)

        const [senderIcdc, recipientIcdc] = await Promise.all([
            meUserJid ? this.resolveUserIcdc(meUserJid, localIdentity) : null,
            !isGroup ? this.resolveUserIcdc(toUserJid(recipientJid)) : null
        ])
        const messageWithIcdc = injectDeviceListMetadata(
            messageWithSecret,
            senderIcdc,
            recipientIcdc
        )

        const plaintext = await writeRandomPadMax16(proto.Message.encode(messageWithIcdc).finish())
        const outboundAttrs = resolveOutboundMessageAttrs(messageWithIcdc)
        const buttonAddonKind = outboundAttrs.buttonAddonKind
        const buttonAddonNode = buttonAddonKind ? buildButtonAddonNode(buttonAddonKind) : undefined
        // when a <biz> companion is attached the stanza must advertise type=text and
        // omit enc.mediatype; sending type=media + mediatype=list/button alongside the
        // companion is rejected by the server as SMAX_INVALID (479).
        const type = buttonAddonKind ? 'text' : outboundAttrs.typeAttr
        const edit = outboundAttrs.edit ?? undefined
        const mediatype = buttonAddonKind ? undefined : (outboundAttrs.mediatype ?? undefined)
        const metaAttrs = outboundAttrs.metaAttrs
        const metaNode = metaAttrs ? buildMetaNode(metaAttrs as Record<string, string>) : undefined
        const customNodes: BinaryNode[] = []
        if (metaNode) customNodes.push(metaNode)
        if (buttonAddonNode) customNodes.push(buttonAddonNode)
        if (options.customNodes) {
            for (const node of options.customNodes) {
                customNodes.push(node)
            }
        }

        const decryptFail = outboundAttrs.decryptFail
        const envelope: WaOutboundEnvelope = {
            message: messageWithIcdc,
            plaintext,
            type,
            edit,
            mediatype,
            decryptFail,
            customNodes: customNodes.length > 0 ? customNodes : undefined,
            sendOptions
        }

        const peerRecipientPn = isGroup
            ? undefined
            : await this.resolvePeerRecipientPn(toUserJid(recipientJid), directRecipientJid)
        const publishResult = isGroup
            ? this.shouldUseGroupDirectPath(messageWithIcdc)
                ? await this.publishGroupDirectMessage(recipientJid, envelope)
                : await this.publishGroupSenderKeyMessage(recipientJid, envelope)
            : await this.publishDirectSignalMessageWithFanout(
                  directRecipientJid,
                  envelope,
                  peerRecipientPn
              )
        return upload ? { ...publishResult, upload } : publishResult
    }

    /**
     * For a 1:1 recipient passed in PN form, returns the LID-addressed user JID
     * (via {@link SignalDeviceSyncApi.resolveUserJidPair}). Switching to LID
     * before fanout ensures the envelope, eligible-requester list, and
     * retry-receipt addressing all agree, which keeps the retry tracker from
     * rejecting receipts that arrive in LID form. Returns the original PN if
     * no LID is known/resolvable. Inputs already in LID form pass through.
     */
    private async resolveDirectRecipientLid(pnUserJid: string): Promise<string> {
        if (isLidJid(pnUserJid)) return pnUserJid
        const pair = await this.deps.signalDeviceSync.resolveUserJidPair(pnUserJid)
        return pair.lidJid ?? pnUserJid
    }

    /**
     * Resolves the `peer_recipient_pn` cross-reference for a 1:1 send, or
     * `undefined` to drop the attribute. Only set when the envelope is
     * LID-addressed (`directRecipientJid` is a LID): the PN is the caller's own
     * JID when they passed a PN (zapo switched it to LID for sending), else the
     * device-list snapshot counterpart for a recipient passed in LID form.
     * Mirrors wa-web, which sets `peer_recipient_pn = getPhoneNumber($)` for a
     * LID destination.
     */
    private async resolvePeerRecipientPn(
        recipientUserJid: string,
        directRecipientJid: string
    ): Promise<string | undefined> {
        if (!isLidJid(directRecipientJid)) return undefined
        if (isUserJid(recipientUserJid)) return recipientUserJid
        const pair = await this.deps.signalDeviceSync.resolveUserJidPair(directRecipientJid)
        return pair.pnJid ?? undefined
    }

    public async syncSignalSession(jid: string, reasonIdentity = false): Promise<void> {
        const address = parseSignalAddressFromJid(jid)
        if (address.server === WA_DEFAULTS.GROUP_SERVER) {
            throw new Error('syncSignalSession supports only direct chats')
        }
        await this.deps.sessionResolver.ensureSession(address, jid, undefined, reasonIdentity)
    }

    public async sendReceipt(input: WaSendReceiptInput): Promise<void> {
        await this.deps.messageClient.sendReceipt(input)
    }

    public async publishProtocolMessageToDevice(
        deviceJid: string,
        protocolMessage: Proto.Message.IProtocolMessage,
        options?: { readonly id?: string; readonly pushPriority?: 'high' | 'high_force' }
    ): Promise<WaMessagePublishResult> {
        const credentials = this.deps.getCurrentCredentials()
        const meJid = credentials?.meJid
        const meParsed = meJid ? parseJidFull(meJid) : undefined
        const meUserJid = meParsed?.userJid
        let senderIcdc: IcdcMeta | null = null
        if (meUserJid) {
            const regInfo = await this.deps.signalStore.getRegistrationInfo()
            const localPubKey = regInfo?.identityKeyPair.pubKey
            const localIdentity =
                meParsed && localPubKey
                    ? { address: meParsed.address, pubKey: localPubKey }
                    : undefined
            senderIcdc = await this.resolveUserIcdc(meUserJid, localIdentity)
        }
        const message = injectDeviceListMetadata({ protocolMessage }, senderIcdc, null)
        return this.publishSignalMessage({
            to: deviceJid,
            plaintext: proto.Message.encode(message).finish(),
            id: options?.id,
            type: 'text',
            category: 'peer',
            pushPriority: options?.pushPriority ?? 'high',
            metaNode: buildMetaNode({ appdata: 'default' })
        })
    }

    public async publishStatusMessage(input: {
        readonly message: Proto.IMessage
        readonly recipients: readonly string[]
        readonly statusSetting?: WaStatusDistributionSetting
        readonly options?: WaSendMessageOptions
    }): Promise<WaMessagePublishResult> {
        if (input.recipients.length === 0) {
            throw new Error('publishStatusMessage requires at least one recipient')
        }
        this.requireCurrentMeJid('publishStatusMessage')
        const meLid = this.deps.getCurrentCredentials()?.meLid
        if (!meLid) {
            throw new Error('publishStatusMessage requires current me lid')
        }
        const senderJid = normalizeDeviceJid(meLid)
        const meUserLid = toUserJid(meLid)
        const seen = new Set<string>()
        const recipientsWithSelf: string[] = []
        for (const jid of input.recipients) {
            if (seen.has(jid)) continue
            seen.add(jid)
            recipientsWithSelf.push(jid)
        }
        if (!seen.has(meUserLid)) {
            recipientsWithSelf.push(meUserLid)
        }
        const statusSetting = input.statusSetting ?? 'contacts'
        return this.publishSenderKeyFanout({
            groupJid: WA_DEFAULTS.STATUS_BROADCAST_JID,
            senderJid,
            recipients: recipientsWithSelf,
            message: input.message,
            options: input.options ?? {},
            logTag: 'status',
            replayStatusSetting: statusSetting,
            // Bare `<to jid=user>` ack hints route the skmsg through primary
            // devices that already hold the sender key.
            customize: ({
                fanoutDeviceJids,
                distributionParticipants,
                messageWithSecret,
                sendOptions
            }) => {
                const distributedAddressKeys = new Set<string>()
                for (let i = 0; i < distributionParticipants.length; i += 1) {
                    distributedAddressKeys.add(
                        signalAddressKey(distributionParticipants[i].address)
                    )
                }
                const ackHints: { readonly jid: string }[] = []
                const seenAck = new Set<string>()
                for (let i = 0; i < fanoutDeviceJids.length; i += 1) {
                    const deviceJid = fanoutDeviceJids[i]
                    const address = parseSignalAddressFromJid(deviceJid)
                    if (distributedAddressKeys.has(signalAddressKey(address))) continue
                    if (address.device !== 0) continue
                    const userJid = toUserJid(deviceJid)
                    if (seenAck.has(userJid)) continue
                    seenAck.add(userJid)
                    ackHints.push({ jid: userJid })
                }
                const reportingArtifacts = this.tryBuildReportingTokenArtifacts({
                    message: messageWithSecret,
                    stanzaId: sendOptions.id,
                    senderUserJid: toUserJid(senderJid),
                    remoteJid: WA_DEFAULTS.STATUS_BROADCAST_JID,
                    context: 'status'
                })
                const customNodes: BinaryNode[] = [buildMetaNode({ status_setting: statusSetting })]
                if (reportingArtifacts?.node) customNodes.push(reportingArtifacts.node)
                return {
                    extraParticipants: ackHints,
                    customNodes
                }
            }
        })
    }

    public async publishBroadcastListMessage(input: {
        readonly listJid: string
        readonly message: Proto.IMessage
        readonly recipients: readonly string[]
        readonly options?: WaSendMessageOptions
    }): Promise<WaMessagePublishResult> {
        if (input.recipients.length === 0) {
            throw new Error('publishBroadcastListMessage requires at least one recipient')
        }
        const meJid = this.requireCurrentMeJid('publishBroadcastListMessage')
        const senderJid = normalizeDeviceJid(meJid)
        return this.publishSenderKeyFanout({
            groupJid: input.listJid,
            senderJid,
            recipients: input.recipients,
            message: input.message,
            options: input.options ?? {},
            logTag: 'broadcast list',
            customize: ({ fanoutDeviceJids }) => {
                const phashTargets = new Array<string>(fanoutDeviceJids.length + 1)
                let phashTargetCount = 0
                for (let i = 0; i < fanoutDeviceJids.length; i += 1) {
                    const candidate = fanoutDeviceJids[i]
                    if (isHostedDeviceJid(candidate)) continue
                    phashTargets[phashTargetCount] = candidate
                    phashTargetCount += 1
                }
                phashTargets[phashTargetCount] = senderJid
                phashTargets.length = phashTargetCount + 1
                return Promise.resolve({ phash: computePhashV2(phashTargets) })
            }
        })
    }

    private async publishSenderKeyFanout(input: {
        readonly groupJid: string
        readonly senderJid: string
        readonly recipients: readonly string[]
        readonly message: Proto.IMessage
        readonly options: WaSendMessageOptions
        readonly logTag: string
        readonly replayStatusSetting?: string
        readonly customize?: (fanout: {
            readonly fanoutDeviceJids: readonly string[]
            readonly distributionParticipants: readonly {
                readonly jid: string
                readonly address: SignalAddress
                readonly encType: 'msg' | 'pkmsg'
                readonly ciphertext: Uint8Array
            }[]
            readonly messageWithSecret: Proto.IMessage
            readonly sendOptions: WaSendMessageOptions
        }) =>
            | Promise<{
                  readonly extraParticipants?: readonly { readonly jid: string }[]
                  readonly customNodes?: readonly BinaryNode[]
                  readonly phash?: string
              }>
            | {
                  readonly extraParticipants?: readonly { readonly jid: string }[]
                  readonly customNodes?: readonly BinaryNode[]
                  readonly phash?: string
              }
    }): Promise<WaMessagePublishResult> {
        const sendOptions = await this.withResolvedMessageId(input.options)
        const sender = parseSignalAddressFromJid(input.senderJid)
        const messageWithSecret = await ensureMessageSecret(input.message)
        const plaintext = await writeRandomPadMax16(
            proto.Message.encode(messageWithSecret).finish()
        )
        const {
            distributionMessage,
            ciphertext: groupCiphertext,
            keyId: senderKeyId
        } = await this.deps.senderKeyManager.prepareGroupEncryption(
            input.groupJid,
            sender,
            plaintext
        )
        const { fanoutDeviceJids, distributionParticipants } =
            await this.encryptGroupDistributionParticipants(
                input.groupJid,
                senderKeyId,
                distributionMessage,
                input.recipients
            )
        let shouldAttachDeviceIdentity = false
        for (let i = 0; i < distributionParticipants.length; i += 1) {
            if (distributionParticipants[i].encType === 'pkmsg') {
                shouldAttachDeviceIdentity = true
                break
            }
        }
        const extras = input.customize
            ? await input.customize({
                  fanoutDeviceJids,
                  distributionParticipants,
                  messageWithSecret,
                  sendOptions
              })
            : {}
        const participants: {
            readonly jid: string
            readonly encType?: 'msg' | 'pkmsg'
            readonly ciphertext?: Uint8Array
        }[] = distributionParticipants.map((p) => ({
            jid: p.jid,
            encType: p.encType,
            ciphertext: p.ciphertext
        }))
        if (extras.extraParticipants) {
            for (const entry of extras.extraParticipants) {
                participants.push(entry)
            }
        }
        const outboundAttrs = resolveOutboundMessageAttrs(messageWithSecret)
        const messageNode = buildGroupSenderKeyMessageNode({
            to: input.groupJid,
            type: outboundAttrs.typeAttr,
            id: sendOptions.id,
            phash: extras.phash,
            edit: outboundAttrs.edit ?? undefined,
            mediatype: outboundAttrs.mediatype ?? undefined,
            decryptFail: outboundAttrs.decryptFail,
            groupCiphertext: groupCiphertext.ciphertext,
            participants,
            deviceIdentity: shouldAttachDeviceIdentity
                ? this.getEncodedSignedDeviceIdentity()
                : undefined,
            customNodes: extras.customNodes,
            additionalAttributes: sendOptions.additionalAttributes
        })
        const replayPayload: WaRetryReplayPayload = {
            mode: 'plaintext',
            to: input.groupJid,
            type: messageNode.attrs.type,
            plaintext,
            ...(input.replayStatusSetting ? { statusSetting: input.replayStatusSetting } : {})
        }
        const result = await this.deps.retryTracker.track(
            {
                messageIdHint: messageNode.attrs.id ?? sendOptions.id,
                toJid: input.groupJid,
                replayPayload,
                eligibleRequesterDeviceJids: undefined
            },
            async () => this.deps.messageClient.publishNode(messageNode, sendOptions)
        )
        const distributedAddresses = new Array<SignalAddress>(distributionParticipants.length)
        for (let i = 0; i < distributionParticipants.length; i += 1) {
            distributedAddresses[i] = distributionParticipants[i].address
        }
        try {
            await this.deps.senderKeyManager.markSenderKeyDistributed(
                input.groupJid,
                senderKeyId,
                distributedAddresses
            )
        } catch (error) {
            this.deps.logger.warn('failed to mark sender key distribution targets', {
                logTag: input.logTag,
                groupJid: input.groupJid,
                participants: distributedAddresses.length,
                message: toError(error).message
            })
        }
        return result
    }

    public async requestAppStateSyncKeys(
        keyIds: readonly Uint8Array[]
    ): Promise<readonly string[]> {
        return this.deps.appStateSyncKeyProtocol.requestKeys(keyIds)
    }

    public async sendAppStateSyncKeyShare(
        toDeviceJid: string,
        keys: readonly WaAppStateSyncKey[],
        missingKeyIds: readonly Uint8Array[] = []
    ): Promise<void> {
        await this.deps.appStateSyncKeyProtocol.sendKeyShare(toDeviceJid, keys, missingKeyIds)
    }

    public async mutateGroupMetadataCacheFromGroupEvent(event: WaGroupEvent): Promise<void> {
        await this.deps.groupMetadataCache.mutateFromGroupEvent(event)
    }

    /**
     * Splits a group's members into the ones a history bundle is being shared
     * with and the rest, normalizing everything to the group's addressing mode
     * so the receiver list written into the proto matches what the fanout can
     * actually resolve. This account is excluded from both lists.
     *
     * Requested JIDs that are not current members come back in `unknownJids`
     * instead of being silently dropped - sharing history with a non-member is
     * a caller mistake worth surfacing.
     */
    public async resolveGroupHistoryAudience(
        groupJid: string,
        requestedJids: readonly string[]
    ): Promise<WaGroupHistoryAudience> {
        const participants = await this.deps.groupMetadataCache.resolveParticipantUsers(groupJid)
        const meJid = this.requireCurrentMeJid('shareGroupHistory')
        const addressingMode = this.resolveGroupAddressingMode(participants, groupJid)
        const meUserJid = toUserJid(this.resolveSenderForAddressingMode(addressingMode, meJid))

        const pending = new Set<string>()
        for (let index = 0; index < requestedJids.length; index += 1) {
            pending.add(toUserJid(normalizeRecipientJid(requestedJids[index])))
        }
        const historyReceivers: string[] = []
        const nonHistoryReceivers: string[] = []
        for (let index = 0; index < participants.length; index += 1) {
            const participantUserJid = toUserJid(participants[index])
            if (participantUserJid === meUserJid) {
                continue
            }
            if (pending.delete(participantUserJid)) {
                historyReceivers[historyReceivers.length] = participantUserJid
            } else {
                nonHistoryReceivers[nonHistoryReceivers.length] = participantUserJid
            }
        }
        const requestedSelf = pending.delete(meUserJid)
        const unknownJids: string[] = []
        for (const jid of pending) {
            unknownJids[unknownJids.length] = jid
        }
        return {
            historyReceivers,
            nonHistoryReceivers,
            unknownJids,
            requestedSelf,
            addressingMode
        }
    }

    /**
     * A group-history bundle goes to the members named in `historyReceivers`
     * rather than to the whole group, so it takes the per-device direct fanout
     * instead of the group sender key.
     */
    private shouldUseGroupDirectPath(message: Proto.IMessage): boolean {
        return resolveGroupHistoryReceivers(message).length > 0
    }

    private async publishGroupDirectMessage(
        groupJid: string,
        envelope: WaOutboundEnvelope,
        retryContext: GroupSendRetryContext = {}
    ): Promise<WaMessagePublishResult> {
        const { message, plaintext, type, edit, mediatype, sendOptions } = envelope
        const meJid = this.requireCurrentMeJid('sendMessage')
        const participantUserJids = retryContext.forceRefreshParticipants
            ? await this.deps.groupMetadataCache.refreshParticipantUsers(groupJid)
            : await this.deps.groupMetadataCache.resolveParticipantUsers(groupJid)
        const addressingMode =
            retryContext.forceAddressingMode ??
            this.resolveGroupAddressingMode(participantUserJids, groupJid)
        const senderJid = this.resolveSenderForAddressingMode(addressingMode, meJid)
        const targetUserJids = restrictGroupHistoryTargets(
            message,
            participantUserJids,
            senderJid,
            (droppedJids, totalExpected) => {
                this.deps.logger.warn('group history receivers missing from the participant list', {
                    groupJid,
                    droppedCount: droppedJids.length,
                    totalExpected,
                    sample: droppedJids.slice(0, 3)
                })
            }
        )
        const fanoutDeviceJids =
            await this.deps.fanoutResolver.resolveGroupParticipantDeviceJids(targetUserJids)
        if (fanoutDeviceJids.length === 0) {
            throw new Error('group direct send resolved no target devices')
        }
        const resolvedFanoutTargets =
            await this.deps.sessionResolver.ensureSessionsBatch(fanoutDeviceJids)
        const resolvedNormalizedJids = new Set<string>()
        for (let index = 0; index < resolvedFanoutTargets.length; index += 1) {
            resolvedNormalizedJids.add(resolvedFanoutTargets[index].jid)
        }
        const uniqueNormalizedFanoutJids = new Set<string>()
        for (let index = 0; index < fanoutDeviceJids.length; index += 1) {
            uniqueNormalizedFanoutJids.add(normalizeDeviceJid(fanoutDeviceJids[index]))
        }
        const droppedDevices: string[] = []
        for (const expected of uniqueNormalizedFanoutJids) {
            if (!resolvedNormalizedJids.has(expected)) {
                droppedDevices.push(expected)
            }
        }
        if (droppedDevices.length > 0) {
            this.deps.logger.warn('group direct fanout dropping devices without signal session', {
                groupJid,
                droppedCount: droppedDevices.length,
                totalExpected: uniqueNormalizedFanoutJids.size,
                sample: droppedDevices.slice(0, 3)
            })
        }
        if (resolvedFanoutTargets.length === 0) {
            throw new Error('group direct send resolved no signal sessions')
        }
        const participantEncryptRequests: {
            readonly address: SignalAddress
            readonly plaintext: Uint8Array
        }[] = new Array(resolvedFanoutTargets.length)
        for (let index = 0; index < resolvedFanoutTargets.length; index += 1) {
            const target = resolvedFanoutTargets[index]
            participantEncryptRequests[index] = {
                address: target.address,
                plaintext
            }
        }
        const encryptedParticipants = await this.deps.signalProtocol.encryptMessagesBatch(
            participantEncryptRequests,
            resolvedFanoutTargets
        )
        const participants: {
            readonly jid: string
            readonly encType: 'msg' | 'pkmsg'
            readonly ciphertext: Uint8Array
        }[] = new Array(resolvedFanoutTargets.length)
        for (let index = 0; index < resolvedFanoutTargets.length; index += 1) {
            const target = resolvedFanoutTargets[index]
            participants[index] = {
                jid: target.jid,
                encType: encryptedParticipants[index].type,
                ciphertext: encryptedParticipants[index].ciphertext
            }
        }
        let shouldAttachDeviceIdentity = false
        for (let index = 0; index < participants.length; index += 1) {
            if (participants[index].encType === 'pkmsg') {
                shouldAttachDeviceIdentity = true
                break
            }
        }
        const reportingArtifacts = this.tryBuildReportingTokenArtifacts({
            message,
            messageBytes: unpadPkcs7(plaintext),
            stanzaId: sendOptions.id,
            senderUserJid: toUserJid(senderJid),
            remoteJid: groupJid,
            context: 'group_direct'
        })
        const customNodes: BinaryNode[] = envelope.customNodes ? [...envelope.customNodes] : []
        if (reportingArtifacts?.node) customNodes.push(reportingArtifacts.node)
        const messageNode = buildDirectMessageFanoutNode({
            to: groupJid,
            type,
            id: sendOptions.id,
            edit,
            addressingMode,
            participants,
            deviceIdentity: shouldAttachDeviceIdentity
                ? this.getEncodedSignedDeviceIdentity()
                : undefined,
            customNodes: customNodes.length > 0 ? customNodes : undefined,
            mediatype,
            decryptFail: envelope.decryptFail,
            additionalAttributes: sendOptions.additionalAttributes
        })
        const replayPayload: WaRetryReplayPayload = {
            mode: 'plaintext',
            to: groupJid,
            type,
            plaintext
        }
        const result = await this.deps.retryTracker.track(
            {
                messageIdHint: messageNode.attrs.id ?? sendOptions.id,
                toJid: groupJid,
                replayPayload,
                eligibleRequesterDeviceJids: undefined
            },
            async () => this.deps.messageClient.publishNode(messageNode, sendOptions)
        )
        const ackError = result.ack.error
        const serverPhash = result.ack.phash
        const serverAddressingMode = result.ack.addressingMode
        const hasPhashMismatch = !!serverPhash
        const hasAddressingMismatch =
            !!serverAddressingMode && serverAddressingMode !== addressingMode
        const hasAddressingError = ackError === WA_NACK_REASONS.STALE_GROUP_ADDRESSING_MODE
        if (
            !retryContext.retried &&
            (hasPhashMismatch || hasAddressingMismatch || hasAddressingError)
        ) {
            this.deps.logger.warn('group direct publish acknowledged with mismatch metadata', {
                id: result.id,
                groupJid,
                serverPhash,
                localAddressingMode: addressingMode,
                serverAddressingMode,
                ackError
            })
            return this.publishGroupDirectMessage(
                groupJid,
                {
                    ...envelope,
                    sendOptions: { ...sendOptions, id: result.id }
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

    // Returns null on any failure so the group send still goes out unchanged.
    private async buildBotSidecarParticipant(message: Proto.IMessage): Promise<{
        readonly jid: string
        readonly encType: 'msg' | 'pkmsg'
        readonly ciphertext: Uint8Array
    } | null> {
        const botJid = extractInvokedBotJid(message)
        if (!botJid) return null

        let address: SignalAddress
        try {
            address = parseSignalAddressFromJid(botJid)
        } catch (error) {
            this.deps.logger.debug('bot sidecar: failed to parse bot jid', {
                botJid,
                message: toError(error).message
            })
            return null
        }

        let resolvedTargets: readonly SignalResolvedSessionTarget[]
        try {
            resolvedTargets = await this.deps.sessionResolver.ensureSessionsBatch([botJid])
        } catch (error) {
            this.deps.logger.debug('bot sidecar: signal session sync failed', {
                botJid,
                message: toError(error).message
            })
            return null
        }
        if (resolvedTargets.length === 0) {
            this.deps.logger.debug('bot sidecar: signal session not established', { botJid })
            return null
        }

        // The bot seeds its streaming-response keys from this HKDF derivation.
        const parentMessageSecret = message.messageContextInfo?.messageSecret
        const botMessageSecret =
            parentMessageSecret && parentMessageSecret.byteLength > 0
                ? genBotMsgSecret(parentMessageSecret)
                : undefined
        const botCopy = buildBotInvokeProtoCopy(message, botMessageSecret)
        const botPlaintext = await writeRandomPadMax16(proto.Message.encode(botCopy).finish())
        try {
            const [encrypted] = await this.deps.signalProtocol.encryptMessagesBatch(
                [{ address, plaintext: botPlaintext }],
                resolvedTargets.map((target) => ({
                    address: target.address,
                    session: target.session
                }))
            )
            if (!encrypted) return null
            this.deps.logger.trace('bot sidecar encrypted', { botJid, encType: encrypted.type })
            return {
                jid: botJid,
                encType: encrypted.type,
                ciphertext: encrypted.ciphertext
            }
        } catch (error) {
            this.deps.logger.debug('bot sidecar: encryption failed', {
                botJid,
                message: toError(error).message
            })
            return null
        }
    }

    private async publishGroupSenderKeyMessage(
        groupJid: string,
        envelope: WaOutboundEnvelope,
        retryContext: GroupSendRetryContext = {}
    ): Promise<WaMessagePublishResult> {
        const { message, plaintext, type, edit, mediatype, sendOptions } = envelope
        const meJid = this.requireCurrentMeJid('sendMessage')
        const participantUserJids = retryContext.forceRefreshParticipants
            ? await this.deps.groupMetadataCache.refreshParticipantUsers(groupJid)
            : await this.deps.groupMetadataCache.resolveParticipantUsers(groupJid)
        const addressingMode =
            retryContext.forceAddressingMode ??
            this.resolveGroupAddressingMode(participantUserJids, groupJid)
        const senderJid = this.resolveSenderForAddressingMode(addressingMode, meJid)
        const sender = parseSignalAddressFromJid(senderJid)
        const {
            distributionMessage: senderKeyDistributionMessage,
            ciphertext: groupCiphertext,
            keyId: senderKeyId
        } = await this.deps.senderKeyManager.prepareGroupEncryption(groupJid, sender, plaintext)
        const distributionData = await this.distributionDedup.run(
            `dist:${groupJid}:${senderKeyId}`,
            () =>
                this.encryptGroupDistributionParticipants(
                    groupJid,
                    senderKeyId,
                    senderKeyDistributionMessage,
                    participantUserJids
                )
        )
        const { fanoutDeviceJids, distributionParticipants } = distributionData
        let shouldAttachDeviceIdentity = false
        for (let index = 0; index < distributionParticipants.length; index += 1) {
            if (distributionParticipants[index].encType === 'pkmsg') {
                shouldAttachDeviceIdentity = true
                break
            }
        }
        const phashTargets = new Array<string>(fanoutDeviceJids.length + 1)
        let phashTargetCount = 0
        for (let index = 0; index < fanoutDeviceJids.length; index += 1) {
            const candidate = fanoutDeviceJids[index]
            if (isHostedDeviceJid(candidate)) continue
            phashTargets[phashTargetCount] = candidate
            phashTargetCount += 1
        }
        phashTargets[phashTargetCount] = senderJid
        phashTargets.length = phashTargetCount + 1
        const localPhash = computePhashV2(phashTargets)
        const reportingArtifacts = this.tryBuildReportingTokenArtifacts({
            message,
            messageBytes: unpadPkcs7(plaintext),
            stanzaId: sendOptions.id,
            senderUserJid: toUserJid(senderJid),
            remoteJid: groupJid,
            context: 'group_sender_key'
        })
        const botSidecar = await this.buildBotSidecarParticipant(message)
        const customNodes: BinaryNode[] = envelope.customNodes ? [...envelope.customNodes] : []
        if (reportingArtifacts?.node) customNodes.push(reportingArtifacts.node)
        const messageNode = buildGroupSenderKeyMessageNode({
            to: groupJid,
            type,
            id: sendOptions.id,
            edit,
            phash: localPhash,
            addressingMode,
            groupCiphertext: groupCiphertext.ciphertext,
            participants: distributionParticipants,
            deviceIdentity:
                shouldAttachDeviceIdentity || botSidecar?.encType === 'pkmsg'
                    ? this.getEncodedSignedDeviceIdentity()
                    : undefined,
            customNodes: customNodes.length > 0 ? customNodes : undefined,
            mediatype,
            decryptFail: envelope.decryptFail,
            botParticipants: botSidecar ? [botSidecar] : undefined,
            additionalAttributes: sendOptions.additionalAttributes
        })

        const replayPayload: WaRetryReplayPayload = {
            mode: 'plaintext',
            to: groupJid,
            type,
            plaintext
        }
        const result = await this.deps.retryTracker.track(
            {
                messageIdHint: messageNode.attrs.id ?? sendOptions.id,
                toJid: groupJid,
                replayPayload,
                eligibleRequesterDeviceJids: undefined
            },
            async () => this.deps.messageClient.publishNode(messageNode, sendOptions)
        )
        const distributedAddresses = new Array<SignalAddress>(distributionParticipants.length)
        for (let index = 0; index < distributionParticipants.length; index += 1) {
            distributedAddresses[index] = distributionParticipants[index].address
        }
        try {
            await this.deps.senderKeyManager.markSenderKeyDistributed(
                groupJid,
                senderKeyId,
                distributedAddresses
            )
        } catch (error) {
            this.deps.logger.warn('failed to mark sender key distribution targets', {
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
        const hasAddressingError = ackError === WA_NACK_REASONS.STALE_GROUP_ADDRESSING_MODE
        if (
            !retryContext.retried &&
            (hasPhashMismatch || hasAddressingMismatch || hasAddressingError)
        ) {
            this.deps.logger.warn('group message publish acknowledged with mismatch metadata', {
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
                {
                    ...envelope,
                    sendOptions: { ...sendOptions, id: result.id }
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
        for (let index = 0; index < participantUserJids.length; index += 1) {
            if (isLidJid(participantUserJids[index])) {
                return WA_ADDRESSING_MODES.LID
            }
        }

        this.deps.logger.trace('group addressing mode resolved to pn (default)', {
            groupJid,
            participants: participantUserJids.length
        })
        return WA_ADDRESSING_MODES.PN
    }

    /**
     * Parent-author JID stored with the outgoing message secret. Peers address
     * us by LID in `pollCreationMessageKey` during the PN→LID migration, so a
     * valid `meLid` wins. A malformed LID must not abort the send: fall back to
     * a normalized `meJid`, then to the empty sender (same recoverable path as
     * {@link resolveSenderForAddressingMode}).
     */
    private resolveOutgoingSecretSenderJid(): string {
        const credentials = this.deps.getCurrentCredentials()
        const meLid = credentials?.meLid
        if (meLid && meLid.includes('@')) {
            try {
                return toUserJid(meLid)
            } catch (error) {
                this.deps.logger.trace('ignoring malformed me lid jid', {
                    meLid,
                    message: toError(error).message
                })
            }
        }
        const meJid = credentials?.meJid
        if (meJid && meJid.includes('@')) {
            try {
                return toUserJid(meJid)
            } catch (error) {
                this.deps.logger.trace('ignoring malformed me jid', {
                    meJid,
                    message: toError(error).message
                })
            }
        }
        return ''
    }

    private resolveSenderForAddressingMode(
        addressingMode: GroupAddressingMode,
        meJid: string
    ): string {
        if (addressingMode === WA_ADDRESSING_MODES.LID) {
            const meLid = this.deps.getCurrentCredentials()?.meLid
            if (meLid && meLid.includes('@')) {
                try {
                    return normalizeDeviceJid(meLid)
                } catch (error) {
                    this.deps.logger.trace('ignoring malformed me lid jid', {
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
        senderKeyId: number,
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
        const fanoutDeviceJids =
            await this.deps.fanoutResolver.resolveGroupParticipantDeviceJids(participantUserJids)
        if (fanoutDeviceJids.length === 0) {
            return {
                fanoutDeviceJids,
                distributionParticipants: []
            }
        }
        const fanoutAddresses: SignalAddress[] = new Array(fanoutDeviceJids.length)
        for (let index = 0; index < fanoutDeviceJids.length; index += 1) {
            fanoutAddresses[index] = parseSignalAddressFromJid(fanoutDeviceJids[index])
        }
        const pendingAddresses =
            await this.deps.senderKeyManager.filterParticipantsNeedingDistribution(
                groupJid,
                senderKeyId,
                fanoutAddresses
            )
        if (pendingAddresses.length === 0) {
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
        for (let index = 0; index < fanoutAddresses.length; index += 1) {
            const address = fanoutAddresses[index]
            fanoutTargetsByAddressKey.set(signalAddressKey(address), {
                jid: fanoutDeviceJids[index],
                address
            })
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
        let availableTargets: readonly {
            readonly jid: string
            readonly address: SignalAddress
        }[] = []
        let prefetchedAvailableTargets: readonly SignalResolvedSessionTarget[] | undefined
        try {
            const resolvedTargets =
                await this.deps.sessionResolver.ensureSessionsBatch(pendingTargetJids)
            availableTargets = resolvedTargets
            prefetchedAvailableTargets = resolvedTargets
        } catch (error) {
            const normalized = toError(error)
            if (normalized.message === 'identity mismatch') {
                throw normalized
            }
            this.deps.logger.warn(
                'group sender-key distribution session sync failed, continuing with available sessions',
                {
                    groupJid,
                    requested: pendingTargetJids.length,
                    message: normalized.message
                }
            )
            const pendingTargetAddresses = new Array<SignalAddress>(pendingTargets.length)
            for (let index = 0; index < pendingTargets.length; index += 1) {
                pendingTargetAddresses[index] = pendingTargets[index].address
            }
            const hasPendingSessions =
                await this.deps.sessionStore.hasSessions(pendingTargetAddresses)
            const nextAvailableTargets: {
                readonly jid: string
                readonly address: SignalAddress
            }[] = []
            for (let index = 0; index < pendingTargets.length; index += 1) {
                if (hasPendingSessions[index]) {
                    nextAvailableTargets.push(pendingTargets[index])
                }
            }
            availableTargets = nextAvailableTargets
        }
        if (availableTargets.length === 0) {
            return {
                fanoutDeviceJids,
                distributionParticipants: []
            }
        }
        const distributionPayload = await writeRandomPadMax16(
            proto.Message.encode({
                senderKeyDistributionMessage
            }).finish()
        )

        const distributionEncryptRequests: {
            readonly address: SignalAddress
            readonly plaintext: Uint8Array
        }[] = new Array(availableTargets.length)
        for (let index = 0; index < availableTargets.length; index += 1) {
            const target = availableTargets[index]
            distributionEncryptRequests[index] = {
                address: target.address,
                plaintext: distributionPayload
            }
        }
        const encryptedDistributionParticipants =
            await this.deps.signalProtocol.encryptMessagesBatch(
                distributionEncryptRequests,
                prefetchedAvailableTargets
            )
        const distributionParticipants: {
            readonly jid: string
            readonly address: SignalAddress
            readonly encType: 'msg' | 'pkmsg'
            readonly ciphertext: Uint8Array
        }[] = new Array(availableTargets.length)
        for (let index = 0; index < availableTargets.length; index += 1) {
            const target = availableTargets[index]
            distributionParticipants[index] = {
                jid: target.jid,
                address: target.address,
                encType: encryptedDistributionParticipants[index].type,
                ciphertext: encryptedDistributionParticipants[index].ciphertext
            }
        }
        return {
            fanoutDeviceJids,
            distributionParticipants
        }
    }

    private async publishDirectSignalMessageWithFanout(
        recipientJid: string,
        envelope: WaOutboundEnvelope,
        peerRecipientPn?: string
    ): Promise<WaMessagePublishResult> {
        const { message, plaintext, type, edit, mediatype, sendOptions } = envelope
        const meJid = this.requireCurrentMeJid('sendMessage')
        const meLid = this.deps.getCurrentCredentials()?.meLid
        const selfDeviceJidForRecipient = this.deps.fanoutResolver.resolveSelfDeviceJidForRecipient(
            recipientJid,
            meJid,
            meLid
        )
        const deviceJids = await this.deps.fanoutResolver.resolveDirectFanoutDeviceJids(
            recipientJid,
            selfDeviceJidForRecipient
        )
        const targets: {
            readonly jid: string
            readonly normalizedJid: string
            readonly userJid: string
        }[] = new Array(deviceJids.length)
        for (let index = 0; index < deviceJids.length; index += 1) {
            const jid = deviceJids[index]
            const parsed = parseJidFull(jid)
            targets[index] = {
                jid,
                normalizedJid: parsed.normalizedJid,
                userJid: parsed.userJid
            }
        }
        const recipientUserJid = toUserJid(recipientJid)
        const meUserJid = toUserJid(selfDeviceJidForRecipient)

        this.deps.logger.trace('wa client publish signal fanout', {
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
        const resolvedFanoutTargets = await this.deps.sessionResolver.ensureSessionsBatch(
            deviceJids,
            expectedIdentityByJid
        )
        const resolvedFanoutTargetsByJid = new Map<string, SignalResolvedSessionTarget>()
        for (let index = 0; index < resolvedFanoutTargets.length; index += 1) {
            const target = resolvedFanoutTargets[index]
            resolvedFanoutTargetsByJid.set(normalizeDeviceJid(target.jid), target)
        }
        const liveTargets: typeof targets = []
        const droppedSecondaryDevices: string[] = []
        for (let index = 0; index < targets.length; index += 1) {
            const target = targets[index]
            if (resolvedFanoutTargetsByJid.has(target.normalizedJid)) {
                liveTargets.push(target)
                continue
            }
            const isPrimaryRecipient =
                target.userJid === recipientUserJid && target.normalizedJid === target.userJid
            if (isPrimaryRecipient) {
                this.deps.logger.error(
                    'direct fanout dropping primary recipient device without signal session',
                    { to: recipientJid, device: target.jid }
                )
            } else {
                droppedSecondaryDevices.push(target.jid)
            }
        }
        if (droppedSecondaryDevices.length > 0) {
            this.deps.logger.warn(
                'direct fanout dropping secondary devices without signal session',
                {
                    to: recipientJid,
                    droppedCount: droppedSecondaryDevices.length,
                    totalExpected: targets.length,
                    sample: droppedSecondaryDevices.slice(0, 3)
                }
            )
        }
        if (liveTargets.length === 0) {
            throw new Error('direct fanout missing signal sessions for all targets')
        }

        let hasSelfDeviceFanout = false
        for (let index = 0; index < liveTargets.length; index += 1) {
            if (liveTargets[index].userJid === meUserJid) {
                hasSelfDeviceFanout = true
                break
            }
        }
        const selfDevicePlaintext = hasSelfDeviceFanout
            ? await writeRandomPadMax16(
                  proto.Message.encode(wrapDeviceSentMessage(message, recipientUserJid)).finish()
              )
            : null

        const participantRequests: {
            readonly target: (typeof liveTargets)[number]
            readonly address: SignalAddress
            readonly session: SignalResolvedSessionTarget['session']
            readonly expectedIdentity?: Uint8Array
            readonly plaintext: Uint8Array
        }[] = new Array(liveTargets.length)
        for (let index = 0; index < liveTargets.length; index += 1) {
            const target = liveTargets[index]
            const resolvedTarget = resolvedFanoutTargetsByJid.get(target.normalizedJid)!
            participantRequests[index] = {
                target,
                address: resolvedTarget.address,
                session: resolvedTarget.session,
                expectedIdentity:
                    target.userJid === recipientUserJid ? sendOptions.expectedIdentity : undefined,
                plaintext:
                    selfDevicePlaintext && target.userJid === meUserJid
                        ? selfDevicePlaintext
                        : plaintext
            }
        }
        const encryptRequests: {
            readonly address: SignalAddress
            readonly plaintext: Uint8Array
            readonly expectedIdentity?: Uint8Array
        }[] = new Array(participantRequests.length)
        const prefetchedSessions: {
            readonly address: SignalAddress
            readonly session: SignalResolvedSessionTarget['session']
        }[] = new Array(participantRequests.length)
        for (let index = 0; index < participantRequests.length; index += 1) {
            const request = participantRequests[index]
            encryptRequests[index] = {
                address: request.address,
                plaintext: request.plaintext,
                expectedIdentity: request.expectedIdentity
            }
            prefetchedSessions[index] = {
                address: request.address,
                session: request.session
            }
        }
        const encryptedParticipants = await this.deps.signalProtocol.encryptMessagesBatch(
            encryptRequests,
            prefetchedSessions
        )
        const isBotRecipient = isBotJid(recipientJid)
        const participants: {
            readonly jid: string
            readonly encType: 'msg' | 'pkmsg'
            readonly ciphertext: Uint8Array
        }[] = []
        for (let index = 0; index < participantRequests.length; index += 1) {
            const request = participantRequests[index]
            const entry = {
                jid: request.target.jid,
                encType: encryptedParticipants[index].type,
                ciphertext: encryptedParticipants[index].ciphertext
            }
            // wa-web direct 1:1 to bot puts the bot device alongside self devices
            // inside `<participants>`; the `<bot>` envelope is only used for group
            // mentions (the sidecar copy) or for bot feedback / revoke flows.
            participants.push(entry)
        }

        let shouldAttachDeviceIdentity = false
        for (let index = 0; index < participants.length; index += 1) {
            if (participants[index].encType === 'pkmsg') {
                shouldAttachDeviceIdentity = true
                break
            }
        }
        const deviceIdentity = shouldAttachDeviceIdentity
            ? this.getEncodedSignedDeviceIdentity()
            : undefined
        const reportingArtifacts = this.tryBuildReportingTokenArtifacts({
            message,
            messageBytes: unpadPkcs7(plaintext),
            stanzaId: sendOptions.id,
            senderUserJid: meUserJid,
            remoteJid: recipientUserJid,
            context: 'direct_fanout'
        })
        let privacyTokenNode: BinaryNode | undefined
        if (!isBotRecipient) {
            try {
                privacyTokenNode =
                    (await this.privacyTokenDedup.run(`pt:${recipientUserJid}`, () =>
                        this.deps.resolvePrivacyTokenNode(recipientUserJid)
                    )) ?? undefined
            } catch (error) {
                this.deps.logger.warn('privacy token resolution failed', {
                    to: recipientUserJid,
                    message: toError(error).message
                })
            }
        }
        const customNodes: BinaryNode[] = envelope.customNodes ? [...envelope.customNodes] : []
        if (reportingArtifacts?.node) customNodes.push(reportingArtifacts.node)
        if (privacyTokenNode) customNodes.push(privacyTokenNode)
        const messageNode = buildDirectMessageFanoutNode({
            to: recipientJid,
            type,
            id: sendOptions.id,
            edit,
            participants,
            deviceIdentity,
            customNodes: customNodes.length > 0 ? customNodes : undefined,
            mediatype,
            decryptFail: envelope.decryptFail,
            peerRecipientPn,
            additionalAttributes: sendOptions.additionalAttributes
        })

        const replayPayload: WaRetryReplayPayload = {
            mode: 'plaintext',
            to: recipientJid,
            type,
            plaintext
        }
        const result = await this.deps.retryTracker.track(
            {
                messageIdHint: messageNode.attrs.id ?? sendOptions.id,
                toJid: recipientJid,
                replayPayload,
                eligibleRequesterDeviceJids: deviceJids
            },
            async () => this.deps.messageClient.publishNode(messageNode, sendOptions)
        )
        this.deps.onDirectMessageSent(recipientUserJid)
        return result
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

    public async generateOutgoingMessageId(): Promise<string> {
        try {
            const meUserJid = toUserJid(this.requireCurrentMeJid('sendMessage'))
            const timestampBytes = new Uint8Array(8)
            const dv = new DataView(
                timestampBytes.buffer,
                timestampBytes.byteOffset,
                timestampBytes.byteLength
            )
            if (this.mobileMessageIdFormat()) {
                dv.setBigUint64(0, BigInt(Date.now()), false)
                const digest = md5Bytes([
                    timestampBytes,
                    TEXT_ENCODER.encode(meUserJid),
                    await randomBytesAsync(16)
                ])
                digest[0] = 0xac
                return bytesToHex(digest).toUpperCase()
            }
            dv.setBigUint64(0, BigInt(Math.floor(Date.now() / 1_000)), false)
            const digest = sha256([
                timestampBytes,
                TEXT_ENCODER.encode(meUserJid),
                await randomBytesAsync(8)
            ])
            return `3EB0${bytesToHex(digest.subarray(0, 9)).toUpperCase()}`
        } catch (error) {
            this.deps.logger.warn('failed to generate message id, falling back to random', {
                message: toError(error).message
            })
            if (this.mobileMessageIdFormat()) {
                const bytes = await randomBytesAsync(16)
                bytes[0] = 0xac
                return bytesToHex(bytes).toUpperCase()
            }
            return `3EB0${bytesToHex(await randomBytesAsync(8)).toUpperCase()}`
        }
    }

    private tryBuildReportingTokenArtifacts(input: {
        readonly message: Proto.IMessage
        readonly messageBytes?: Uint8Array
        readonly stanzaId?: string
        readonly senderUserJid: string
        readonly remoteJid: string
        readonly context: string
    }): BuildReportingTokenArtifactsResult | null {
        if (!input.stanzaId) {
            return null
        }

        try {
            return buildReportingTokenArtifacts({
                message: input.message,
                messageBytes: input.messageBytes,
                stanzaId: input.stanzaId,
                senderUserJid: input.senderUserJid,
                remoteJid: input.remoteJid
            })
        } catch (error) {
            this.deps.logger.warn('failed to generate reporting token', {
                context: input.context,
                id: input.stanzaId,
                remoteJid: input.remoteJid,
                message: toError(error).message
            })
            return null
        }
    }

    private getEncodedSignedDeviceIdentity(): Uint8Array | undefined {
        const signedIdentity = this.deps.getCurrentCredentials()?.signedIdentity
        if (!signedIdentity) {
            return undefined
        }
        return proto.ADVSignedDeviceIdentity.encode(signedIdentity).finish()
    }

    public resolveUserIcdc(
        userJid: string,
        localIdentity?: { readonly address: SignalAddress; readonly pubKey: Uint8Array }
    ): Promise<IcdcMeta | null> {
        return this.icdcDedup.run(`icdc:${userJid}:${localIdentity ? '1' : '0'}`, async () => {
            try {
                const snapshots = await this.deps.deviceListStore.getUserDevicesBatch([userJid])
                const snapshot = snapshots[0]
                if (!snapshot || snapshot.deviceJids.length === 0) {
                    return null
                }
                return resolveIcdcMeta(
                    snapshot.deviceJids,
                    this.deps.identityStore,
                    snapshot.updatedAtMs,
                    localIdentity,
                    this.deps.getIcdcHashLength?.()
                )
            } catch (error) {
                this.deps.logger.trace('icdc resolution failed', {
                    userJid,
                    message: toError(error).message
                })
                return null
            }
        })
    }

    private requireCurrentMeJid(context: string): string {
        const meJid = this.deps.getCurrentCredentials()?.meJid
        if (meJid) {
            return meJid
        }
        throw new Error(`${context} requires registered meJid`)
    }
}

function pickContentContextInfo(content: WaSendMessageContent): WaSendContextInfo | undefined {
    if (typeof content !== 'object' || content === null) return undefined
    if (isSendTextMessage(content) || isSendMediaMessage(content)) {
        return content.contextInfo
    }
    return undefined
}

function assertNewsletterContextInfoCompatible(ctx: WaSendContextInfo | null): void {
    if (!ctx) return
    const unsupported: string[] = []
    if (ctx.quotedMessageId !== undefined) unsupported.push('quote')
    if (ctx.mentionedJids?.length) unsupported.push('mentions')
    if (ctx.isSpoiler === true) unsupported.push('isSpoiler')
    if (ctx.groupSubject !== undefined || ctx.parentGroupJid !== undefined) {
        unsupported.push('group invite reply (groupSubject/parentGroupJid)')
    }
    if (unsupported.length > 0) {
        throw new Error(`newsletter sends do not support: ${unsupported.join(', ')}`)
    }
}
