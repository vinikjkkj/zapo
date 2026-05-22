import type { WaReceiptQueue } from '@client/connection/WaReceiptQueue'
import type { WaIncomingNodeCoordinator } from '@client/coordinators/WaIncomingNodeCoordinator'
import type { WaIncomingNodeHandlerRegistration, WaIncomingStanzaFilter } from '@client/types'
import type { Logger } from '@infra/log/types'
import { WA_DEFAULTS } from '@protocol/constants'
import type { WaNodeOrchestrator } from '@transport/node/WaNodeOrchestrator'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'

export interface WaLowLevelCoordinator {
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly query: (
        node: BinaryNode,
        timeoutMs?: number,
        options?: { readonly useSystemId?: boolean }
    ) => Promise<BinaryNode>
    readonly registerIncomingHandler: (
        registration: WaIncomingNodeHandlerRegistration
    ) => () => void
    readonly unregisterIncomingHandler: (registration: WaIncomingNodeHandlerRegistration) => boolean
    readonly registerIncomingStanzaFilter: (filter: WaIncomingStanzaFilter) => () => void
}

interface WaLowLevelCoordinatorOptions {
    readonly logger: Logger
    readonly nodeOrchestrator: WaNodeOrchestrator
    readonly incomingNode: WaIncomingNodeCoordinator
    readonly receiptQueue: WaReceiptQueue
    readonly isConnected: () => boolean
    readonly defaultIqTimeoutMs?: number
}

export function createLowLevelCoordinator(
    options: WaLowLevelCoordinatorOptions
): WaLowLevelCoordinator {
    const { logger, nodeOrchestrator, incomingNode, receiptQueue, isConnected } = options
    const defaultIqTimeoutMs = options.defaultIqTimeoutMs ?? WA_DEFAULTS.IQ_TIMEOUT_MS
    return {
        sendNode: async (node) => {
            try {
                await nodeOrchestrator.sendNode(node)
            } catch (error) {
                const normalized = toError(error)
                if (receiptQueue.shouldQueue(node, normalized)) {
                    receiptQueue.enqueue(node)
                    logger.warn('queued dangling receipt after send failure', {
                        id: node.attrs.id,
                        to: node.attrs.to,
                        message: normalized.message,
                        queueSize: receiptQueue.size()
                    })
                    return
                }
                throw normalized
            }
        },
        query: async (node, timeoutMs = defaultIqTimeoutMs, queryOptions = {}) => {
            if (!isConnected()) {
                throw new Error('client is not connected')
            }
            logger.debug('wa client query', { tag: node.tag, id: node.attrs.id, timeoutMs })
            return nodeOrchestrator.query(node, timeoutMs, queryOptions)
        },
        registerIncomingHandler: (registration) =>
            incomingNode.registerIncomingHandler(registration),
        unregisterIncomingHandler: (registration) =>
            incomingNode.unregisterIncomingHandler(registration),
        registerIncomingStanzaFilter: (filter) => incomingNode.registerIncomingStanzaFilter(filter)
    }
}
