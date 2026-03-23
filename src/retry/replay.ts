import type { Logger } from '@infra/log/types'
import { wrapDeviceSentMessage } from '@message/device-sent'
import { unpadPkcs7, writeRandomPadMax16 } from '@message/padding'
import type { WaMessageClient } from '@message/WaMessageClient'
import { proto, type Proto } from '@proto'
import {
    isGroupOrBroadcastJid,
    normalizeDeviceJid,
    parseSignalAddressFromJid,
    toUserJid
} from '@protocol/jid'
import { decodeRetryReplayPayload } from '@retry/codec'
import type {
    WaRetryEncryptedReplayPayload,
    WaRetryOutboundMessageRecord,
    WaRetryOpaqueNodeReplayPayload,
    WaRetryPlaintextReplayPayload
} from '@retry/types'
import type { SignalProtocol } from '@signal/session/SignalProtocol'
import { decodeBinaryNode } from '@transport/binary'
import { buildGroupRetryMessageNode } from '@transport/node/builders/message'
import { findNodeChild } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'

export interface WaRetryReplayServiceOptions {
    readonly logger: Logger
    readonly messageClient: WaMessageClient
    readonly signalProtocol: SignalProtocol
    readonly getCurrentMeJid: () => string | null | undefined
    readonly getCurrentMeLid: () => string | null | undefined
    readonly getCurrentSignedIdentity: () => Proto.IADVSignedDeviceIdentity | null | undefined
}

export type WaRetryResendResult = 'resent' | 'ineligible'

export class WaRetryReplayService {
    private readonly options: WaRetryReplayServiceOptions

    public constructor(options: WaRetryReplayServiceOptions) {
        this.options = options
    }

    public async resendOutboundMessage(
        outbound: WaRetryOutboundMessageRecord,
        requesterJid: string,
        retryCount: number
    ): Promise<WaRetryResendResult> {
        const payload =
            outbound.replayPayload instanceof Uint8Array
                ? decodeRetryReplayPayload(outbound.replayPayload)
                : outbound.replayPayload
        const requesterAddress = parseSignalAddressFromJid(requesterJid)
        const normalizedRequesterJid = normalizeDeviceJid(requesterJid)
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
        if (payloadUserJid !== requesterUserJid) {
            return 'ineligible'
        }

        const encrypted = await this.options.signalProtocol.encryptMessage(
            requesterAddress,
            payload.plaintext
        )
        await this.options.messageClient.sendEncrypted({
            to: requesterJid,
            encType: encrypted.type,
            ciphertext: encrypted.ciphertext,
            encCount: retryCount,
            id: outbound.messageId,
            type: payload.type
        })
        return 'resent'
    }

    private async resendGroupPlaintextPayload(
        outbound: WaRetryOutboundMessageRecord,
        payload: WaRetryPlaintextReplayPayload,
        requesterJid: string,
        requesterAddress: ReturnType<typeof parseSignalAddressFromJid>,
        retryCount: number
    ): Promise<WaRetryResendResult> {
        const plaintext =
            (await this.maybeWrapGroupRetryPlaintextForSelfDevice(payload, requesterJid)) ??
            payload.plaintext
        const encrypted = await this.options.signalProtocol.encryptMessage(
            requesterAddress,
            plaintext
        )
        let deviceIdentity: Uint8Array | undefined

        if (encrypted.type === 'pkmsg') {
            const signedIdentity = this.options.getCurrentSignedIdentity()
            if (!signedIdentity) {
                this.options.logger.warn(
                    'retry request rejected: missing signed identity for pkmsg group retry'
                )
                return 'ineligible'
            }
            deviceIdentity = proto.ADVSignedDeviceIdentity.encode(signedIdentity).finish()
        }

        const retryNode = buildGroupRetryMessageNode({
            to: payload.to,
            type: payload.type,
            id: outbound.messageId,
            requesterJid,
            addressingMode: requesterAddress.server === 'lid' ? 'lid' : 'pn',
            encType: encrypted.type,
            ciphertext: encrypted.ciphertext,
            retryCount,
            deviceIdentity
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
        await this.options.messageClient.sendEncrypted({
            to: requesterJid,
            encType: payload.encType,
            ciphertext: payload.ciphertext,
            encCount: retryCount,
            id: outbound.messageId,
            type: payload.type,
            participant: payload.participant
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

    private async maybeWrapGroupRetryPlaintextForSelfDevice(
        payload: WaRetryPlaintextReplayPayload,
        requesterJid: string
    ): Promise<Uint8Array | null> {
        if (!this.isRequesterCurrentAccount(requesterJid)) {
            return null
        }
        try {
            const messageBytes = unpadPkcs7(payload.plaintext)
            const message = proto.Message.decode(messageBytes)
            const wrapped = wrapDeviceSentMessage(message, payload.to)
            return writeRandomPadMax16(proto.Message.encode(wrapped).finish())
        } catch (error) {
            this.options.logger.warn(
                'retry request failed to wrap deviceSent payload for self requester',
                {
                    requester: requesterJid,
                    to: payload.to,
                    message: toError(error).message
                }
            )
            return null
        }
    }

    private isRequesterCurrentAccount(requesterJid: string): boolean {
        const requesterUser = toUserJid(requesterJid)
        const meJid = this.options.getCurrentMeJid()
        if (meJid && toUserJid(meJid) === requesterUser) {
            return true
        }
        const meLid = this.options.getCurrentMeLid()
        if (meLid && toUserJid(meLid) === requesterUser) {
            return true
        }
        return false
    }

    private isOpaqueReplayCompatible(node: BinaryNode, normalizedRequesterJid: string): boolean {
        const participantsNode = findNodeChild(node, 'participants')
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
