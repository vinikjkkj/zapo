import type { WaSuccessPersistAttributes } from '../../auth/types'
import type { Logger } from '../../infra/log/types'
import {
    decodeBinaryNodeContent,
    findNodeChild,
    getNodeChildrenByTag
} from '../../transport/node/helpers'
import {
    parseStreamControlNode,
    parseSuccessPersistAttributes
} from '../../transport/stream/parse'
import type { WaStreamControlNodeResult } from '../../transport/stream/types'
import type { BinaryNode } from '../../transport/types'
import { toError } from '../../util/errors'
import {
    INFO_BULLETIN_DIRTY_TAG,
    INFO_BULLETIN_EDGE_ROUTING_TAG,
    INFO_BULLETIN_NODE_TAG,
    INFO_BULLETIN_ROUTING_INFO_TAG,
    SUCCESS_NODE_TAG
} from '../constants'
import type { WaDirtyBit } from '../sync/types'

export interface WaIncomingNodeRuntimePort {
    readonly handleStreamControlResult: (result: WaStreamControlNodeResult) => Promise<void>
    readonly persistSuccessAttributes: (attributes: WaSuccessPersistAttributes) => Promise<void>
    readonly emitSuccessNode: (node: BinaryNode) => void
    readonly updateClockSkewFromSuccess: (serverUnixSeconds: number) => void
    readonly shouldWarmupMediaConn: () => boolean
    readonly warmupMediaConn: () => Promise<void>
    readonly persistRoutingInfo: (routingInfo: Uint8Array) => Promise<void>
    readonly dispatchIncomingNode: (node: BinaryNode) => Promise<unknown>
}

export interface WaIncomingNodeDirtySyncPort {
    readonly parseDirtyBits: (nodes: readonly BinaryNode[]) => readonly WaDirtyBit[]
    readonly handleDirtyBits: (dirtyBits: readonly WaDirtyBit[]) => Promise<void>
}

export interface WaIncomingNodeCoordinatorOptions {
    readonly logger: Logger
    readonly runtime: WaIncomingNodeRuntimePort
    readonly dirtySync: WaIncomingNodeDirtySyncPort
}

export class WaIncomingNodeCoordinator {
    private readonly logger: Logger
    private readonly runtime: WaIncomingNodeRuntimePort
    private readonly dirtySync: WaIncomingNodeDirtySyncPort
    private mediaConnWarmupPromise: Promise<void> | null

    public constructor(options: WaIncomingNodeCoordinatorOptions) {
        this.logger = options.logger
        this.runtime = options.runtime
        this.dirtySync = options.dirtySync
        this.mediaConnWarmupPromise = null
    }

    public async handleIncomingNode(node: BinaryNode): Promise<void> {
        this.logger.trace('wa client incoming node', {
            tag: node.tag,
            id: node.attrs.id,
            type: node.attrs.type
        })
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
        await this.runtime.dispatchIncomingNode(node)
    }

    private async handleSuccessNode(node: BinaryNode): Promise<boolean> {
        if (node.tag !== SUCCESS_NODE_TAG) {
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
        this.mediaConnWarmupPromise = this.warmupMediaConnAfterSuccess()
            .then(() => {
                this.logger.debug('post-login media_conn warmup completed')
            })
            .catch((error) => {
                this.logger.warn('post-login media_conn warmup failed', {
                    message: toError(error).message
                })
            })
            .finally(() => {
                this.mediaConnWarmupPromise = null
            })
    }

    private async warmupMediaConnAfterSuccess(): Promise<void> {
        if (!this.runtime.shouldWarmupMediaConn()) {
            return
        }
        await this.runtime.warmupMediaConn()
    }

    private async handleInfoBulletinNode(node: BinaryNode): Promise<boolean> {
        if (node.tag !== INFO_BULLETIN_NODE_TAG) {
            return false
        }
        const edgeRoutingNode = findNodeChild(node, INFO_BULLETIN_EDGE_ROUTING_TAG)
        if (edgeRoutingNode) {
            await this.handleEdgeRoutingInfoNode(edgeRoutingNode)
        }

        const dirtyNodes = getNodeChildrenByTag(node, INFO_BULLETIN_DIRTY_TAG)
        const dirtyBits = this.dirtySync.parseDirtyBits(dirtyNodes)
        if (dirtyBits.length > 0) {
            await this.dirtySync.handleDirtyBits(dirtyBits)
        }
        return edgeRoutingNode !== undefined || dirtyBits.length > 0
    }

    private async handleEdgeRoutingInfoNode(edgeRoutingNode: BinaryNode): Promise<void> {
        const routingInfoNode = findNodeChild(edgeRoutingNode, INFO_BULLETIN_ROUTING_INFO_TAG)
        if (!routingInfoNode) {
            return
        }
        try {
            const routingInfo = decodeBinaryNodeContent(
                routingInfoNode.content,
                `ib.${INFO_BULLETIN_EDGE_ROUTING_TAG}.${INFO_BULLETIN_ROUTING_INFO_TAG}`
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
}
