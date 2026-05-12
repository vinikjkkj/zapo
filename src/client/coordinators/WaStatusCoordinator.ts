import type {
    WaAppStateMutationCoordinator,
    WaSetStatusPrivacyInput
} from '@client/coordinators/WaAppStateMutationCoordinator'
import type { WaSendMessageOptions } from '@client/types'
import type {
    WaMessageBuildResult,
    WaMessagePublishResult,
    WaSendMessageContent
} from '@message/types'
import { proto, type Proto } from '@proto'
import { WA_DEFAULTS } from '@protocol/defaults'
import type { WaStatusDistributionSetting } from '@protocol/status'

export interface WaStatusCoordinatorOptions {
    readonly appStateMutations: WaAppStateMutationCoordinator
    readonly buildMessageContent: (content: WaSendMessageContent) => Promise<WaMessageBuildResult>
    readonly publishStatusMessage: (input: {
        readonly message: Proto.IMessage
        readonly recipients: readonly string[]
        readonly statusSetting?: WaStatusDistributionSetting
        readonly options?: WaSendMessageOptions
    }) => Promise<WaMessagePublishResult>
}

export interface WaSendStatusInput {
    readonly content: WaSendMessageContent
    readonly recipients: readonly string[]
    readonly statusSetting?: WaStatusDistributionSetting
    readonly options?: WaSendMessageOptions
}

export interface WaStatusCoordinator {
    readonly setPrivacy: (input: WaSetStatusPrivacyInput) => Promise<void>
    readonly setUserMuted: (jid: string, muted: boolean) => Promise<void>
    readonly sendStatus: (input: WaSendStatusInput) => Promise<WaMessagePublishResult>
    readonly revokeStatus: (input: {
        readonly messageId: string
        readonly recipients: readonly string[]
        readonly statusSetting?: WaStatusDistributionSetting
        readonly options?: WaSendMessageOptions
    }) => Promise<WaMessagePublishResult>
}

export function createStatusCoordinator(options: WaStatusCoordinatorOptions): WaStatusCoordinator {
    return {
        setPrivacy: (input) => options.appStateMutations.setStatusPrivacy(input),
        setUserMuted: (jid, muted) => options.appStateMutations.setUserStatusMute(jid, muted),
        sendStatus: async (input) => {
            const built = await options.buildMessageContent(input.content)
            const message =
                built.message.conversation && !built.message.extendedTextMessage
                    ? {
                          ...built.message,
                          conversation: null,
                          extendedTextMessage: {
                              text: built.message.conversation
                          }
                      }
                    : built.message
            const published = await options.publishStatusMessage({
                message,
                recipients: input.recipients,
                statusSetting: input.statusSetting,
                options: input.options
            })
            return built.upload ? { ...published, upload: built.upload } : published
        },
        revokeStatus: async (input) => {
            const message: Proto.IMessage = {
                protocolMessage: {
                    type: proto.Message.ProtocolMessage.Type.REVOKE,
                    key: {
                        remoteJid: WA_DEFAULTS.STATUS_BROADCAST_JID,
                        fromMe: true,
                        id: input.messageId
                    }
                }
            }
            return options.publishStatusMessage({
                message,
                recipients: input.recipients,
                statusSetting: input.statusSetting,
                options: input.options
            })
        }
    }
}
