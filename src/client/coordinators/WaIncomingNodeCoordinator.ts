import type { WaSuccessPersistAttributes } from '@auth/types'
import type { WaOfflineResumeCoordinator } from '@client/coordinators/WaOfflineResumeCoordinator'
import type { WaDirtyBit } from '@client/dirty'
import {
    createIncomingBaseEvent,
    createIncomingFailureHandler,
    createIncomingGroupNotificationHandler,
    createIncomingNotificationHandler,
    createIncomingReceiptHandler,
    createInfoBulletinNotificationEvent,
    createUnhandledIncomingNodeEvent
} from '@client/incoming'
import type {
    WaGroupEvent,
    WaIncomingBaseEvent,
    WaIncomingCallEvent,
    WaIncomingChatstateEvent,
    WaIncomingFailureEvent,
    WaIncomingNodeHandler,
    WaIncomingNodeHandlerRegistration,
    WaIncomingNotificationEvent,
    WaIncomingPresenceEvent,
    WaIncomingReceiptEvent,
    WaIncomingUnhandledStanzaEvent
} from '@client/types'
import type { Logger } from '@infra/log/types'
import {
    WA_IQ_TYPES,
    WA_MESSAGE_TAGS,
    WA_NODE_TAGS,
    WA_NOTIFICATION_TYPES,
    WA_SIGNALING
} from '@protocol/constants'
import type { WaConnectionCode, WaDisconnectReason } from '@protocol/stream'
import {
    decodeNodeContentBase64OrBytes,
    findNodeChild,
    getNodeChildren,
    getNodeChildrenByTag
} from '@transport/node/helpers'
import {
    parseStreamControlNode,
    parseSuccessPersistAttributes,
    type WaStreamControlNodeResult
} from '@transport/stream/parse'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt, toError } from '@util/primitives'

interface WaIncomingNodeRuntime {
    readonly handleStreamControlResult: (result: WaStreamControlNodeResult) => Promise<void>
    readonly persistSuccessAttributes: (attributes: WaSuccessPersistAttributes) => Promise<void>
    readonly emitSuccessNode: (node: BinaryNode) => void
    readonly updateClockSkewFromSuccess: (serverUnixSeconds: number) => void
    readonly shouldWarmupMediaConn: () => boolean
    readonly warmupMediaConn: () => Promise<void>
    readonly persistRoutingInfo: (routingInfo: Uint8Array) => Promise<void>
    readonly tryResolvePendingNode: (node: BinaryNode) => boolean
    readonly handleGenericIncomingNode: (node: BinaryNode) => Promise<boolean>
    readonly handleIncomingIqSetNode: (node: BinaryNode) => Promise<boolean>
    readonly handleLinkCodeNotificationNode: (node: BinaryNode) => Promise<boolean>
    readonly handleCompanionRegRefreshNotificationNode: (node: BinaryNode) => Promise<boolean>
    readonly handleIncomingMessageNode: (node: BinaryNode) => Promise<boolean>
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly handleIncomingRetryReceipt: (node: BinaryNode) => Promise<void>
    readonly trackOutboundReceipt: (node: BinaryNode) => Promise<void>
    readonly emitIncomingReceipt: (event: WaIncomingReceiptEvent) => void
    readonly emitIncomingPresence: (event: WaIncomingPresenceEvent) => void
    readonly emitIncomingChatstate: (event: WaIncomingChatstateEvent) => void
    readonly emitIncomingCall: (event: WaIncomingCallEvent) => void
    readonly emitIncomingFailure: (event: WaIncomingFailureEvent) => void
    readonly emitIncomingErrorStanza: (event: WaIncomingBaseEvent) => void
    readonly emitIncomingNotification: (event: WaIncomingNotificationEvent) => void
    readonly emitGroupEvent: (event: WaGroupEvent) => void
    readonly emitUnhandledIncomingNode: (event: WaIncomingUnhandledStanzaEvent) => void
    readonly syncAppState: () => Promise<void>
    readonly stopComms: () => void
    readonly disconnect: (
        reason: WaDisconnectReason,
        isLogout: boolean,
        code: WaConnectionCode | null
    ) => Promise<void>
    readonly clearStoredCredentials: () => Promise<void>
    readonly parseDirtyBits: (nodes: readonly BinaryNode[]) => readonly WaDirtyBit[]
    readonly handleDirtyBits: (dirtyBits: readonly WaDirtyBit[]) => Promise<void>
}

interface WaIncomingNodeCoordinatorOptions {
    readonly logger: Logger
    readonly runtime: WaIncomingNodeRuntime
    readonly offlineResume: WaOfflineResumeCoordinator
}

const INFO_BULLETIN_CHILD_TAGS = new Set<string>([
    'offline',
    'offline_preview',
    'priority_offline_complete',
    'tos',
    'thread_metadata',
    'client_expiration'
])

export class WaIncomingNodeCoordinator {
    private readonly logger: Logger
    private readonly runtime: WaIncomingNodeRuntime
    private readonly offlineResume: WaOfflineResumeCoordinator
    private readonly nodeHandlerRegistry: Map<
        string,
        { readonly subtype?: string; readonly handler: WaIncomingNodeHandler }[]
    >
    private mediaConnWarmupPromise: Promise<void> | null

    public constructor(options: WaIncomingNodeCoordinatorOptions) {
        this.logger = options.logger
        this.runtime = options.runtime
        this.offlineResume = options.offlineResume
        this.nodeHandlerRegistry = new Map()
        this.registerDefaultIncomingHandlers()
        this.mediaConnWarmupPromise = null
    }

    public async handleIncomingNode(node: BinaryNode): Promise<void> {
        this.logger.trace('wa client incoming node', {
            tag: node.tag,
            id: node.attrs.id,
            type: node.attrs.type
        })
        if (node.attrs.offline !== undefined) {
            this.offlineResume.trackOfflineStanza()
        }
        const streamControlResult = parseStreamControlNode(node)
        if (streamControlResult) {
            await this.runtime.handleStreamControlResult(streamControlResult)
            return
        }
        if (await this.handleSuccessNode(node)) {
            return
        }
        if (await this.handleInfoBulletinNode(node)) {
            return
        }
        const handled = await this.dispatchIncomingNode(node)
        if (handled) {
            return
        }
        this.runtime.emitUnhandledIncomingNode(createUnhandledIncomingNodeEvent(node))
    }

    public registerIncomingHandler(registration: WaIncomingNodeHandlerRegistration): () => void {
        const handlersByTag = this.nodeHandlerRegistry.get(registration.tag)
        const entry = {
            subtype: registration.subtype,
            handler: registration.handler
        }
        if (!handlersByTag) {
            this.nodeHandlerRegistry.set(registration.tag, [entry])
        } else if (registration.prepend) {
            handlersByTag.unshift(entry)
        } else {
            handlersByTag.push(entry)
        }
        return () => {
            this.unregisterIncomingHandler(registration)
        }
    }

    public unregisterIncomingHandler(registration: WaIncomingNodeHandlerRegistration): boolean {
        const handlersByTag = this.nodeHandlerRegistry.get(registration.tag)
        if (!handlersByTag || handlersByTag.length === 0) {
            return false
        }
        const index = handlersByTag.findIndex(
            (entry) =>
                entry.subtype === registration.subtype && entry.handler === registration.handler
        )
        if (index === -1) {
            return false
        }
        handlersByTag.splice(index, 1)
        if (handlersByTag.length === 0) {
            this.nodeHandlerRegistry.delete(registration.tag)
        }
        return true
    }

    private async dispatchIncomingNode(node: BinaryNode): Promise<boolean> {
        const handlersByTag = this.nodeHandlerRegistry.get(node.tag)
        const nodeSubtype = node.attrs.type

        if (node.tag === WA_MESSAGE_TAGS.RECEIPT) {
            if (handlersByTag && handlersByTag.length > 0) {
                for (const entry of handlersByTag) {
                    if (entry.subtype !== undefined && entry.subtype !== nodeSubtype) {
                        continue
                    }
                    if (await entry.handler(node)) {
                        if (!this.isRetryReceiptType(nodeSubtype)) {
                            this.runtime.tryResolvePendingNode(node)
                        }
                        return true
                    }
                }
            }
            return this.runtime.tryResolvePendingNode(node)
        }

        if (this.runtime.tryResolvePendingNode(node)) {
            return true
        }

        const genericHandled = await this.runtime.handleGenericIncomingNode(node)
        if (genericHandled) {
            return true
        }

        if (!handlersByTag || handlersByTag.length === 0) {
            return false
        }

        for (const entry of handlersByTag) {
            if (entry.subtype !== undefined && entry.subtype !== nodeSubtype) {
                continue
            }
            if (await entry.handler(node)) {
                return true
            }
        }
        return false
    }

    private isRetryReceiptType(type: string | undefined): boolean {
        return type === 'retry' || type === 'enc_rekey_retry'
    }

    private registerDefaultIncomingHandlers(): void {
        const runtime = this.runtime

        this.registerIncomingHandler({
            tag: WA_NODE_TAGS.IQ,
            subtype: WA_IQ_TYPES.SET,
            handler: runtime.handleIncomingIqSetNode
        })
        this.registerIncomingHandler({
            tag: WA_NODE_TAGS.NOTIFICATION,
            handler: runtime.handleLinkCodeNotificationNode
        })
        this.registerIncomingHandler({
            tag: WA_NODE_TAGS.NOTIFICATION,
            subtype: WA_SIGNALING.COMPANION_REG_REFRESH_NOTIFICATION,
            handler: runtime.handleCompanionRegRefreshNotificationNode
        })
        this.registerIncomingHandler({
            tag: WA_NODE_TAGS.NOTIFICATION,
            subtype: WA_NOTIFICATION_TYPES.GROUP,
            handler: createIncomingGroupNotificationHandler({
                logger: this.logger,
                sendNode: runtime.sendNode,
                emitGroupEvent: runtime.emitGroupEvent,
                emitUnhandledStanza: runtime.emitUnhandledIncomingNode
            })
        })
        this.registerIncomingHandler({
            tag: WA_NODE_TAGS.NOTIFICATION,
            handler: createIncomingNotificationHandler({
                logger: this.logger,
                sendNode: runtime.sendNode,
                emitIncomingNotification: runtime.emitIncomingNotification,
                emitUnhandledStanza: runtime.emitUnhandledIncomingNode,
                syncAppState: runtime.syncAppState
            })
        })
        this.registerIncomingHandler({
            tag: WA_MESSAGE_TAGS.MESSAGE,
            handler: runtime.handleIncomingMessageNode
        })
        this.registerIncomingHandler({
            tag: WA_MESSAGE_TAGS.RECEIPT,
            handler: createIncomingReceiptHandler({
                logger: this.logger,
                sendNode: runtime.sendNode,
                handleIncomingRetryReceipt: runtime.handleIncomingRetryReceipt,
                trackOutboundReceipt: runtime.trackOutboundReceipt,
                emitIncomingReceipt: runtime.emitIncomingReceipt
            })
        })
        this.registerIncomingHandler({
            tag: 'presence',
            handler: async (node) => {
                runtime.emitIncomingPresence(createIncomingBaseEvent(node))
                return true
            }
        })
        this.registerIncomingHandler({
            tag: 'chatstate',
            handler: async (node) => {
                runtime.emitIncomingChatstate({
                    ...createIncomingBaseEvent(node),
                    participantJid: node.attrs.participant
                })
                return true
            }
        })
        this.registerIncomingHandler({
            tag: 'call',
            handler: async (node) => {
                runtime.emitIncomingCall(createIncomingBaseEvent(node))
                return true
            }
        })
        this.registerIncomingHandler({
            tag: 'failure',
            handler: createIncomingFailureHandler({
                logger: this.logger,
                emitIncomingFailure: runtime.emitIncomingFailure,
                stopComms: runtime.stopComms,
                disconnect: runtime.disconnect,
                clearStoredCredentials: runtime.clearStoredCredentials
            })
        })
        this.registerIncomingHandler({
            tag: WA_NODE_TAGS.ERROR,
            handler: async (node) => {
                runtime.emitIncomingErrorStanza(createIncomingBaseEvent(node))
                return true
            }
        })
    }

    private async handleSuccessNode(node: BinaryNode): Promise<boolean> {
        if (node.tag !== WA_NODE_TAGS.SUCCESS) {
            return false
        }

        const persistAttributes = parseSuccessPersistAttributes(node, (error) => {
            this.logger.warn('invalid companion_enc_static in success node', {
                message: error.message
            })
        })
        this.logger.info('received success node', {
            t: node.attrs.t,
            props: node.attrs.props,
            abprops: node.attrs.abprops,
            location: node.attrs.location,
            hasCompanionEncStatic: persistAttributes.companionEncStatic !== undefined,
            meLid: persistAttributes.meLid,
            meDisplayName: persistAttributes.meDisplayName
        })
        this.runtime.emitSuccessNode(node)
        if (persistAttributes.lastSuccessTs !== undefined) {
            this.runtime.updateClockSkewFromSuccess(persistAttributes.lastSuccessTs)
        }
        await this.runtime.persistSuccessAttributes(persistAttributes)
        this.scheduleMediaConnWarmup()
        return true
    }

    private scheduleMediaConnWarmup(): void {
        if (this.mediaConnWarmupPromise) {
            return
        }
        this.mediaConnWarmupPromise = (async () => {
            try {
                if (!this.runtime.shouldWarmupMediaConn()) {
                    return
                }
                await this.runtime.warmupMediaConn()
                this.logger.debug('post-login media_conn warmup completed')
            } catch (error) {
                this.logger.warn('post-login media_conn warmup failed', {
                    message: toError(error).message
                })
            } finally {
                this.mediaConnWarmupPromise = null
            }
        })()
    }

    private async handleInfoBulletinNode(node: BinaryNode): Promise<boolean> {
        if (node.tag !== WA_NODE_TAGS.INFO_BULLETIN) {
            return false
        }
        let handled = false

        const children = getNodeChildren(node)
        for (const child of children) {
            if (INFO_BULLETIN_CHILD_TAGS.has(child.tag)) {
                this.runtime.emitIncomingNotification(
                    createInfoBulletinNotificationEvent(node, child.tag, {
                        count: parseOptionalInt(child.attrs.count),
                        message: parseOptionalInt(child.attrs.message),
                        receipt: parseOptionalInt(child.attrs.receipt),
                        notification: parseOptionalInt(child.attrs.notification),
                        t: parseOptionalInt(child.attrs.t)
                    })
                )
                if (child.tag === 'offline_preview') {
                    this.offlineResume.handleOfflinePreview(
                        parseOptionalInt(child.attrs.count) ?? 0
                    )
                }
                if (child.tag === 'offline') {
                    this.offlineResume.handleOfflineComplete(
                        parseOptionalInt(child.attrs.count) ?? 0
                    )
                }
                handled = true
            }
        }

        const edgeRoutingNode = findNodeChild(node, WA_NODE_TAGS.EDGE_ROUTING)
        if (edgeRoutingNode) {
            const routingInfoNode = findNodeChild(edgeRoutingNode, WA_NODE_TAGS.ROUTING_INFO)
            if (routingInfoNode) {
                try {
                    const routingInfo = decodeNodeContentBase64OrBytes(
                        routingInfoNode.content,
                        `ib.${WA_NODE_TAGS.EDGE_ROUTING}.${WA_NODE_TAGS.ROUTING_INFO}`
                    )
                    await this.runtime.persistRoutingInfo(routingInfo)
                    this.logger.info('updated routing info from info bulletin', {
                        byteLength: routingInfo.byteLength
                    })
                } catch (error) {
                    this.logger.warn('failed to process routing info from info bulletin', {
                        message: toError(error).message
                    })
                }
            }
            handled = true
        }

        const dirtyNodes = getNodeChildrenByTag(node, WA_NODE_TAGS.DIRTY)
        const dirtyBits = this.runtime.parseDirtyBits(dirtyNodes)
        if (dirtyBits.length > 0) {
            void this.runtime.handleDirtyBits(dirtyBits).catch((error) => {
                this.logger.warn('dirty bits sync failed', {
                    message: toError(error).message
                })
            })
            handled = true
        }
        return handled
    }
}
