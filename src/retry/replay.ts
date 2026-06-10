import type { WaAuthCredentials } from '@auth/types'
import type { Logger } from '@infra/log/types'
import { type IcdcMeta, injectDeviceListMetadata } from '@message/crypto/icdc'
import { wrapDeviceSentMessage } from '@message/encode/device-sent'
import { unpadPkcs7, writeRandomPadMax16 } from '@message/encode/padding'
import type { WaMessageClient } from '@message/WaMessageClient'
import { proto, type Proto } from '@proto'
import { WA_DEFAULTS, WA_NODE_TAGS } from '@protocol/constants'
import {
    isGroupOrBroadcastJid,
    isHostedDeviceJid,
    isStatusBroadcastJid,
    normalizeDeviceJid,
    parseJidFull,
    type parseSignalAddressFromJid,
    toUserJid
} from '@protocol/jid'
import { decodeRetryReplayPayload } from '@retry/codec'
import type {
    WaRetryEncryptedReplayPayload,
    WaRetryOpaqueNodeReplayPayload,
    WaRetryOutboundMessageRecord,
    WaRetryPlaintextReplayPayload
} from '@retry/types'
import type { SignalSessionResolver } from '@signal/session/resolver'
import type { SignalProtocol } from '@signal/session/SignalProtocol'
import { decodeBinaryNode } from '@transport/binary'
import { buildGroupRetryMessageNode, buildMetaNode } from '@transport/node/builders/message'
import { findNodeChild } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'

export interface WaRetryReplayServiceOptions {
    readonly logger: Logger
    readonly messageClient: WaMessageClient
    readonly signalProtocol: SignalProtocol
    readonly sessionResolver: SignalSessionResolver
    readonly getCurrentCredentials: () => WaAuthCredentials | null
    readonly resolveUserIcdc?: (userJid: string) => Promise<IcdcMeta | null>
    /**
     * Resolves the trusted-contact (privacy) token node for a recipient user
     * jid. A resend without it is nacked with error 463 by privacy-gated
     * recipients.
     */
    readonly resolvePrivacyTokenNode?: (recipientJid: string) => Promise<BinaryNode | null>
}

export type WaRetryResendResult = 'resent' | 'ineligible'

/**
 * Replays a previously-sent outbound message in response to an incoming
 * retry receipt. Dispatches to plaintext/encrypted/opaque-node handlers
 * based on the stored payload shape.
 */
export class WaRetryReplayService {
    private readonly options: WaRetryReplayServiceOptions

    public constructor(options: WaRetryReplayServiceOptions) {
        this.options = options
    }

    /**
     * Resends `outbound` to `requesterJid`. Returns `'resent'` on a fresh
     * send or `'ineligible'` when the cached payload cannot satisfy the
     * request (e.g. requester not in the original device list).
     */
    public async resendOutboundMessage(
        outbound: WaRetryOutboundMessageRecord,
        requesterJid: string,
        retryCount: number
    ): Promise<WaRetryResendResult> {
        const payload =
            outbound.replayPayload instanceof Uint8Array
                ? decodeRetryReplayPayload(outbound.replayPayload)
                : outbound.replayPayload
        const requesterParsed = parseJidFull(requesterJid)
        const requesterAddress = requesterParsed.address
        const normalizedRequesterJid = requesterParsed.normalizedJid
        if (payload.mode === 'plaintext') {
            return this.resendPlaintextPayload(
                outbound,
                payload,
                requesterJid,
                requesterAddress,
                retryCount
            )
        }
        if (payload.mode === 'encrypted') {
            return this.resendEncryptedPayload(
                outbound,
                payload,
                requesterJid,
                normalizedRequesterJid,
                retryCount
            )
        }
        return this.resendOpaquePayload(outbound, payload, normalizedRequesterJid)
    }

    private async resendPlaintextPayload(
        outbound: WaRetryOutboundMessageRecord,
        payload: WaRetryPlaintextReplayPayload,
        requesterJid: string,
        requesterAddress: ReturnType<typeof parseSignalAddressFromJid>,
        retryCount: number
    ): Promise<WaRetryResendResult> {
        if (isGroupOrBroadcastJid(payload.to)) {
            return this.resendGroupPlaintextPayload(
                outbound,
                payload,
                requesterJid,
                requesterAddress,
                retryCount
            )
        }
        let payloadUserJid: string
        let requesterUserJid: string
        try {
            payloadUserJid = toUserJid(payload.to)
            requesterUserJid = toUserJid(requesterJid)
        } catch {
            return 'ineligible'
        }
        const requesterIsSelf = this.isRequesterCurrentAccount(requesterJid)
        if (payloadUserJid !== requesterUserJid && !requesterIsSelf) {
            return 'ineligible'
        }

        const plaintext =
            (await this.refreshRetryPlaintext(payload, {
                wrapAsDeviceSent: requesterIsSelf,
                includeRecipientIcdc: true,
                logContext: 'direct'
            })) ?? payload.plaintext

        await this.options.sessionResolver.ensureSession(requesterAddress, requesterJid)

        const encrypted = await this.options.signalProtocol.encryptMessage(
            requesterAddress,
            plaintext
        )
        const deviceIdentity =
            encrypted.type === 'pkmsg' ? this.resolveSignedDeviceIdentity('direct') : undefined
        const metaNode = isHostedDeviceJid(requesterJid)
            ? buildMetaNode({ sender_intent: 'hosted' })
            : undefined
        const privacyTokenNode = requesterIsSelf
            ? undefined
            : await this.resolvePrivacyToken(requesterJid)
        await this.options.messageClient.sendEncrypted({
            to: requesterJid,
            encType: encrypted.type,
            ciphertext: encrypted.ciphertext,
            encCount: retryCount,
            id: outbound.messageId,
            type: payload.type,
            deviceIdentity,
            metaNode,
            privacyTokenNode
        })
        return 'resent'
    }

    private resolveSignedDeviceIdentity(context: string): Uint8Array | undefined {
        const signedIdentity = this.options.getCurrentCredentials()?.signedIdentity
        if (!signedIdentity) {
            this.options.logger.warn('retry request missing signed identity for pkmsg envelope', {
                context
            })
            return undefined
        }
        return proto.ADVSignedDeviceIdentity.encode(signedIdentity).finish()
    }

    /**
     * Resolves the trusted-contact token node for the requester's user jid. A
     * failure (or absent resolver) yields no node and the resend still goes out.
     */
    private async resolvePrivacyToken(requesterJid: string): Promise<BinaryNode | undefined> {
        if (!this.options.resolvePrivacyTokenNode) {
            return undefined
        }
        let recipientUserJid: string
        try {
            recipientUserJid = toUserJid(requesterJid)
        } catch {
            return undefined
        }
        try {
            return (await this.options.resolvePrivacyTokenNode(recipientUserJid)) ?? undefined
        } catch (error) {
            this.options.logger.warn('retry resend privacy token resolution failed', {
                to: recipientUserJid,
                message: toError(error).message
            })
            return undefined
        }
    }

    private async refreshRetryPlaintext(
        payload: WaRetryPlaintextReplayPayload,
        options: {
            readonly wrapAsDeviceSent: boolean
            readonly includeRecipientIcdc: boolean
            readonly logContext: string
        }
    ): Promise<Uint8Array | null> {
        if (!options.wrapAsDeviceSent && !this.options.resolveUserIcdc) {
            return null
        }
        try {
            const messageBytes = unpadPkcs7(payload.plaintext)
            const decoded = proto.Message.decode(messageBytes)
            let message: Proto.IMessage = decoded
            let changed = false

            if (this.options.resolveUserIcdc) {
                const meUserJid = this.safeUserJid(this.options.getCurrentCredentials()?.meJid)
                const recipientUserJid = options.includeRecipientIcdc
                    ? this.safeUserJid(payload.to)
                    : null
                const [senderIcdc, recipientIcdc] = await Promise.all([
                    meUserJid ? this.options.resolveUserIcdc(meUserJid) : Promise.resolve(null),
                    recipientUserJid
                        ? this.options.resolveUserIcdc(recipientUserJid)
                        : Promise.resolve(null)
                ])
                const injected = injectDeviceListMetadata(message, senderIcdc, recipientIcdc)
                if (injected !== message) {
                    message = injected
                    changed = true
                }
            }

            if (options.wrapAsDeviceSent && !message.deviceSentMessage) {
                message = wrapDeviceSentMessage(message, payload.to)
                changed = true
            }

            if (!changed) {
                return null
            }
            return writeRandomPadMax16(proto.Message.encode(message).finish())
        } catch (error) {
            this.options.logger.warn('retry request failed to refresh plaintext', {
                context: options.logContext,
                to: payload.to,
                message: toError(error).message
            })
            return null
        }
    }

    private safeUserJid(jid: string | undefined): string | null {
        if (!jid) return null
        try {
            return toUserJid(jid)
        } catch {
            return null
        }
    }

    private async resendGroupPlaintextPayload(
        outbound: WaRetryOutboundMessageRecord,
        payload: WaRetryPlaintextReplayPayload,
        requesterJid: string,
        requesterAddress: ReturnType<typeof parseSignalAddressFromJid>,
        retryCount: number
    ): Promise<WaRetryResendResult> {
        const plaintext =
            (await this.refreshRetryPlaintext(payload, {
                wrapAsDeviceSent: this.isRequesterCurrentAccount(requesterJid),
                includeRecipientIcdc: false,
                logContext: 'group'
            })) ?? payload.plaintext
        const encrypted = await this.options.signalProtocol.encryptMessage(
            requesterAddress,
            plaintext
        )
        let deviceIdentity: Uint8Array | undefined

        if (encrypted.type === 'pkmsg') {
            const signedIdentity = this.options.getCurrentCredentials()?.signedIdentity
            if (!signedIdentity) {
                this.options.logger.warn(
                    'retry request rejected: missing signed identity for pkmsg group retry'
                )
                return 'ineligible'
            }
            deviceIdentity = proto.ADVSignedDeviceIdentity.encode(signedIdentity).finish()
        }

        const isStatus = isStatusBroadcastJid(payload.to)
        const metaAttrs: Record<string, string> = {}
        if (isStatus) {
            metaAttrs.status_setting = payload.statusSetting ?? 'contacts'
        }
        if (isHostedDeviceJid(requesterJid)) {
            metaAttrs.sender_intent = 'hosted'
        }
        const metaNode = Object.keys(metaAttrs).length > 0 ? buildMetaNode(metaAttrs) : undefined
        const retryNode = buildGroupRetryMessageNode({
            to: payload.to,
            type: payload.type,
            id: outbound.messageId,
            requesterJid,
            addressingMode: isStatus
                ? undefined
                : requesterAddress.server === WA_DEFAULTS.LID_SERVER
                  ? 'lid'
                  : 'pn',
            encType: encrypted.type,
            ciphertext: encrypted.ciphertext,
            retryCount,
            deviceIdentity,
            metaNode
        })
        await this.options.messageClient.sendMessageNode(retryNode)
        return 'resent'
    }

    private async resendEncryptedPayload(
        outbound: WaRetryOutboundMessageRecord,
        payload: WaRetryEncryptedReplayPayload,
        requesterJid: string,
        normalizedRequesterJid: string,
        retryCount: number
    ): Promise<WaRetryResendResult> {
        if (payload.encType === 'skmsg') {
            return 'ineligible'
        }
        if (normalizeDeviceJid(payload.to) !== normalizedRequesterJid) {
            return 'ineligible'
        }
        const deviceIdentity =
            payload.encType === 'pkmsg'
                ? this.resolveSignedDeviceIdentity('encrypted_replay')
                : undefined
        const metaNode = isHostedDeviceJid(requesterJid)
            ? buildMetaNode({ sender_intent: 'hosted' })
            : undefined
        const privacyTokenNode = this.isRequesterCurrentAccount(requesterJid)
            ? undefined
            : await this.resolvePrivacyToken(requesterJid)
        await this.options.messageClient.sendEncrypted({
            to: requesterJid,
            encType: payload.encType,
            ciphertext: payload.ciphertext,
            encCount: retryCount,
            id: outbound.messageId,
            type: payload.type,
            participant: payload.participant,
            deviceIdentity,
            metaNode,
            privacyTokenNode
        })
        return 'resent'
    }

    private async resendOpaquePayload(
        outbound: WaRetryOutboundMessageRecord,
        payload: WaRetryOpaqueNodeReplayPayload,
        normalizedRequesterJid: string
    ): Promise<WaRetryResendResult> {
        const decoded = decodeBinaryNode(payload.node)
        if (!this.isOpaqueReplayCompatible(decoded, normalizedRequesterJid)) {
            return 'ineligible'
        }
        const replayNode =
            decoded.attrs.id === outbound.messageId
                ? decoded
                : {
                      ...decoded,
                      attrs: {
                          ...decoded.attrs,
                          id: outbound.messageId
                      }
                  }
        await this.options.messageClient.sendMessageNode(replayNode)
        return 'resent'
    }

    private isRequesterCurrentAccount(requesterJid: string): boolean {
        const requesterUser = toUserJid(requesterJid)
        const credentials = this.options.getCurrentCredentials()
        if (credentials?.meJid && toUserJid(credentials.meJid) === requesterUser) {
            return true
        }
        if (credentials?.meLid && toUserJid(credentials.meLid) === requesterUser) {
            return true
        }
        return false
    }

    private isOpaqueReplayCompatible(node: BinaryNode, normalizedRequesterJid: string): boolean {
        const participantsNode = findNodeChild(node, WA_NODE_TAGS.PARTICIPANTS)
        if (participantsNode) {
            const participantsContent = Array.isArray(participantsNode.content)
                ? participantsNode.content
                : []
            let participantNode: BinaryNode | undefined
            let participantCount = 0

            for (let index = 0; index < participantsContent.length; index++) {
                const child = participantsContent[index]
                if (child.tag !== 'to') continue
                participantCount++
                if (participantCount > 1) return false
                participantNode = child
            }

            if (participantCount !== 1 || !participantNode) return false
            const participantJid = participantNode.attrs.jid
            if (!participantJid) return false
            return normalizeDeviceJid(participantJid) === normalizedRequesterJid
        }
        if (node.attrs.participant) {
            return normalizeDeviceJid(node.attrs.participant) === normalizedRequesterJid
        }
        if (node.attrs.to) return normalizeDeviceJid(node.attrs.to) === normalizedRequesterJid
        return false
    }
}
