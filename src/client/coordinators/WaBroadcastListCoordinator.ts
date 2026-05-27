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

/**
 * Manages broadcast lists and dispatches messages to one. Accessed via
 * {@link WaClient.broadcastList}.
 *
 * **Business-only.** Broadcast lists are backed by the
 * `BusinessBroadcastList` app-state schema and are only available on
 * WhatsApp Business accounts - regular accounts will see the underlying
 * mutation IQs rejected by the server.
 */
export interface WaBroadcastListCoordinator {
    /** Creates or updates a broadcast list definition (name + recipients). */
    readonly setList: (input: WaSetBroadcastListInput) => Promise<void>
    /** Deletes a broadcast list by id. */
    readonly removeList: (id: string) => Promise<void>
    /** Sends a message to every member of a broadcast list. */
    readonly send: (input: WaSendBroadcastListMessageInput) => Promise<WaMessagePublishResult>
}

/** Builds a {@link WaBroadcastListCoordinator} from its dependencies. */
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
