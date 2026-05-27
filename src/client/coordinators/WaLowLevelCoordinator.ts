import type { WaReceiptQueue } from '@client/connection/WaReceiptQueue'
import type { WaIncomingNodeCoordinator } from '@client/coordinators/WaIncomingNodeCoordinator'
import type { WaIncomingNodeHandlerRegistration, WaIncomingStanzaFilter } from '@client/types'
import type { Logger } from '@infra/log/types'
import { WA_DEFAULTS } from '@protocol/constants'
import type { WaNodeOrchestrator } from '@transport/node/WaNodeOrchestrator'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'

/**
 * Raw escape hatch for sending nodes, issuing IQs, and registering custom
 * incoming-node handlers/filters. Accessed via {@link WaClient.lowlevel}.
 */
export interface WaLowLevelCoordinator {
    /**
     * Sends a raw stanza. Failures that look like a transient receipt-send
     * issue are buffered to the receipt queue and logged instead of thrown.
     */
    readonly sendNode: (node: BinaryNode) => Promise<void>
    /**
     * Sends an IQ stanza and awaits the matching response (within `timeoutMs`).
     * Throws when the client is not connected.
     */
    readonly query: (
        node: BinaryNode,
        timeoutMs?: number,
        options?: { readonly useSystemId?: boolean }
    ) => Promise<BinaryNode>
    /**
     * Registers a handler for incoming nodes that match the registration's
     * tag/subtype filter. Returns an `unregister` function.
     */
    readonly registerIncomingHandler: (
        registration: WaIncomingNodeHandlerRegistration
    ) => () => void
    /** Removes a previously-registered incoming handler; returns `true` on success. */
    readonly unregisterIncomingHandler: (registration: WaIncomingNodeHandlerRegistration) => boolean
    /**
     * Registers an incoming-stanza filter (runs before the typed handlers).
     * Returns an `unregister` function.
     */
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

/** Builds a {@link WaLowLevelCoordinator} from its transport dependencies. */
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
