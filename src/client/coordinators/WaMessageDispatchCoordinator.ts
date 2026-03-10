import { toSerializedPubKey } from '../../crypto/core/keys'
import type { Logger } from '../../infra/log/types'
import { resolveMessageTypeAttr } from '../../message/content'
import type {
    WaEncryptedMessageInput,
    WaMessagePublishOptions,
    WaMessagePublishResult,
    WaSendMessageContent,
    WaSendReceiptInput
} from '../../message/types'
import type { WaMessageClient } from '../../message/WaMessageClient'
import { proto } from '../../proto'
import type { Proto } from '../../proto'
import { WA_DEFAULTS } from '../../protocol/constants'
import {
    isGroupJid,
    normalizeRecipientJid,
    parseSignalAddressFromJid
} from '../../protocol/jid'
import type { SignalSessionSyncApi } from '../../signal/api/SignalSessionSyncApi'
import type { SenderKeyManager } from '../../signal/group/SenderKeyManager'
import type { SignalProtocol } from '../../signal/session/SignalProtocol'
import type { SignalAddress } from '../../signal/types'
import type { BinaryNode } from '../../transport/types'
import { uint8Equal } from '../../util/bytes'

interface WaSignalMessagePublishInput {
    readonly to: string
    readonly plaintext: Uint8Array
    readonly expectedIdentity?: Uint8Array
    readonly id?: string
    readonly type?: string
    readonly participant?: string
    readonly deviceFanout?: string
}

interface WaSendMessageOptions extends WaMessagePublishOptions {
    readonly id?: string
    readonly expectedIdentity?: Uint8Array
}

interface WaMessageDispatchCoordinatorOptions {
    readonly logger: Logger
    readonly messageClient: WaMessageClient
    readonly buildMessageContent: (content: WaSendMessageContent) => Promise<Proto.IMessage>
    readonly senderKeyManager: SenderKeyManager
    readonly signalProtocol: SignalProtocol
    readonly signalSessionSync: SignalSessionSyncApi
    readonly getCurrentMeJid: () => string | null | undefined
}

export class WaMessageDispatchCoordinator {
    private readonly logger: Logger
    private readonly messageClient: WaMessageClient
    private readonly buildMessageContent: (
        content: WaSendMessageContent
    ) => Promise<Proto.IMessage>
    private readonly senderKeyManager: SenderKeyManager
    private readonly signalProtocol: SignalProtocol
    private readonly signalSessionSync: SignalSessionSyncApi
    private readonly getCurrentMeJid: () => string | null | undefined

    public constructor(options: WaMessageDispatchCoordinatorOptions) {
        this.logger = options.logger
        this.messageClient = options.messageClient
        this.buildMessageContent = options.buildMessageContent
        this.senderKeyManager = options.senderKeyManager
        this.signalProtocol = options.signalProtocol
        this.signalSessionSync = options.signalSessionSync
        this.getCurrentMeJid = options.getCurrentMeJid
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
        return this.messageClient.publishNode(node, options)
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
        return this.messageClient.publishEncrypted(input, options)
    }

    public async publishSignalMessage(
        input: WaSignalMessagePublishInput,
        options: WaMessagePublishOptions = {}
    ): Promise<WaMessagePublishResult> {
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
        await this.ensureSignalSession(address, input.to, input.expectedIdentity)
        const encrypted = await this.signalProtocol.encryptMessage(
            address,
            input.plaintext,
            input.expectedIdentity
        )
        return this.messageClient.publishEncrypted(
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
        const plaintext = proto.Message.encode(message).finish()
        const type = resolveMessageTypeAttr(message)

        if (isGroupJid(recipientJid, WA_DEFAULTS.GROUP_SERVER)) {
            const meJid = this.getCurrentMeJid()
            if (!meJid) {
                throw new Error('group send requires registered meJid')
            }
            const sender = parseSignalAddressFromJid(meJid)
            const encrypted = await this.senderKeyManager.encryptGroupMessage(
                recipientJid,
                sender,
                plaintext
            )
            return this.publishEncryptedMessage(
                {
                    to: recipientJid,
                    encType: 'skmsg',
                    ciphertext: encrypted.ciphertext,
                    id: options.id,
                    type
                },
                options
            )
        }

        return this.publishSignalMessage(
            {
                to: recipientJid,
                plaintext,
                expectedIdentity: options.expectedIdentity,
                id: options.id,
                type
            },
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

    private async ensureSignalSession(
        address: SignalAddress,
        jid: string,
        expectedIdentity?: Uint8Array,
        reasonIdentity = false
    ): Promise<void> {
        if (await this.signalProtocol.hasSession(address)) {
            return
        }
        this.logger.info('signal session missing, fetching remote key bundle', { jid })
        const fetched = await this.signalSessionSync.fetchKeyBundle({
            jid,
            reasonIdentity
        })
        const remoteIdentity = toSerializedPubKey(fetched.bundle.identity)
        if (
            expectedIdentity &&
            !uint8Equal(remoteIdentity, toSerializedPubKey(expectedIdentity))
        ) {
            throw new Error('identity mismatch')
        }
        await this.signalProtocol.establishOutgoingSession(address, fetched.bundle)
        this.logger.info('signal session synchronized', {
            jid,
            regId: fetched.bundle.regId,
            hasOneTimeKey: fetched.bundle.oneTimeKey !== undefined
        })
    }
}
