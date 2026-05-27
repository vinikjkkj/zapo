import type {
    WaAppStateMutationCoordinator,
    WaSetBroadcastListInput
} from '@client/coordinators/WaAppStateMutationCoordinator'
import type { WaSendMessageOptions } from '@client/types'
import type {
    WaMessageBuildResult,
    WaMessagePublishResult,
    WaSendMessageContent
} from '@message/types'
import type { Proto } from '@proto'

export interface WaBroadcastListCoordinatorOptions {
    readonly appStateMutations: WaAppStateMutationCoordinator
    readonly buildMessageContent: (content: WaSendMessageContent) => Promise<WaMessageBuildResult>
    readonly publishBroadcastListMessage: (input: {
        readonly listJid: string
        readonly message: Proto.IMessage
        readonly recipients: readonly string[]
        readonly options?: WaSendMessageOptions
    }) => Promise<WaMessagePublishResult>
}

export interface WaSendBroadcastListMessageInput {
    readonly listJid: string
    readonly content: WaSendMessageContent
    readonly recipients: readonly string[]
    readonly options?: WaSendMessageOptions
}

export interface WaBroadcastListCoordinator {
    readonly setList: (input: WaSetBroadcastListInput) => Promise<void>
    readonly removeList: (id: string) => Promise<void>
    readonly send: (input: WaSendBroadcastListMessageInput) => Promise<WaMessagePublishResult>
}

export function createBroadcastListCoordinator(
    options: WaBroadcastListCoordinatorOptions
): WaBroadcastListCoordinator {
    return {
        setList: (input) => options.appStateMutations.setBroadcastList(input),
        removeList: (id) => options.appStateMutations.removeBroadcastList(id),
        send: async (input) => {
            const built = await options.buildMessageContent(input.content)
            const published = await options.publishBroadcastListMessage({
                listJid: input.listJid,
                message: built.message,
                recipients: input.recipients,
                options: input.options
            })
            return built.upload ? { ...published, upload: built.upload } : published
        }
    }
}
