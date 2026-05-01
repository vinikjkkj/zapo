import type { Logger } from '@infra/log/types'
import { WA_DEFAULTS, WA_IQ_TYPES, WA_NODE_TAGS, WA_XMLNS } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'

import { createMobileNodeIdGenerator, createNodeIdGenerator, type NodeIdGenerator } from './helpers'

interface PendingNodeQuery {
    readonly resolve: (value: BinaryNode) => void
    readonly reject: (error: Error) => void
    readonly timer: NodeJS.Timeout
}

interface WaNodeOrchestratorOptions {
    readonly logger: Logger
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly defaultTimeoutMs?: number
    readonly hostDomain?: string
    readonly mobileIqIdFormat?: boolean
}

export class WaNodeOrchestrator {
    private readonly logger: Logger
    private readonly sendNodeFn: (node: BinaryNode) => Promise<void>
    private readonly defaultTimeoutMs: number
    private readonly hostDomain: string
    private readonly mobileIqIdFormat: boolean
    private idGenerator: NodeIdGenerator | null
    private idGeneratorReady: Promise<NodeIdGenerator> | null
    private readonly pendingQueries: Map<string, PendingNodeQuery>

    public constructor(options: WaNodeOrchestratorOptions) {
        this.logger = options.logger
        this.sendNodeFn = options.sendNode
        this.defaultTimeoutMs = options.defaultTimeoutMs ?? WA_DEFAULTS.NODE_QUERY_TIMEOUT_MS
        this.hostDomain = options.hostDomain ?? WA_DEFAULTS.HOST_DOMAIN
        this.mobileIqIdFormat = options.mobileIqIdFormat === true
        this.idGenerator = null
        this.idGeneratorReady = null
        this.pendingQueries = new Map()
    }

    public hasPending(): boolean {
        return this.pendingQueries.size > 0
    }

    public clearPending(reason: Error): void {
        this.logger.warn('clearing pending node queries', {
            count: this.pendingQueries.size,
            reason: reason.message
        })
        for (const pending of this.pendingQueries.values()) {
            clearTimeout(pending.timer)
            pending.reject(reason)
        }
        this.pendingQueries.clear()
    }

    public tryResolvePending(node: BinaryNode): boolean {
        const id = node.attrs.id
        if (!id) {
            return false
        }
        const pending = this.pendingQueries.get(id)
        if (!pending) {
            return false
        }
        clearTimeout(pending.timer)
        this.pendingQueries.delete(id)
        this.logger.trace('resolved pending query node', {
            id,
            tag: node.tag,
            type: node.attrs.type
        })
        pending.resolve(node)
        return true
    }

    public async handleIncomingNode(node: BinaryNode): Promise<boolean> {
        if (this.tryResolvePending(node)) {
            return true
        }

        if (node.tag !== WA_NODE_TAGS.IQ || node.attrs.type !== WA_IQ_TYPES.GET) {
            return false
        }
        const xmlns = node.attrs.xmlns
        if (xmlns !== WA_XMLNS.XMPP_PING && xmlns !== WA_XMLNS.WHATSAPP_PING) {
            return false
        }

        const attrs: Record<string, string> = {
            to: node.attrs.from ?? this.hostDomain,
            type: WA_IQ_TYPES.RESULT
        }
        if (node.attrs.id) {
            attrs.id = node.attrs.id
        }

        await this.sendNodeFn({
            tag: WA_NODE_TAGS.IQ,
            attrs
        })
        this.logger.debug('auto-responded to ping iq', { id: node.attrs.id, xmlns })
        return true
    }

    public async sendNode(node: BinaryNode, autoId = true): Promise<void> {
        const outbound = autoId ? await this.withAutoId(node) : node
        await this.sendNodeFn(outbound)
    }

    public async query(
        node: BinaryNode,
        timeoutMs = this.defaultTimeoutMs,
        options: { readonly useSystemId?: boolean } = {}
    ): Promise<BinaryNode> {
        const outbound = await this.withAutoId(node, options.useSystemId === true)
        const id = outbound.attrs.id
        if (!id) {
            throw new Error('query node id is required')
        }
        if (this.pendingQueries.has(id)) {
            throw new Error(`pending node id collision: ${id}`)
        }
        this.logger.debug('sending query node', {
            id,
            tag: outbound.tag,
            type: outbound.attrs.type,
            timeoutMs
        })

        return new Promise<BinaryNode>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingQueries.delete(id)
                this.logger.warn('query node timeout', { id, timeoutMs })
                reject(new Error(`query timeout (${id}) after ${timeoutMs}ms`))
            }, timeoutMs)

            this.pendingQueries.set(id, {
                resolve,
                reject,
                timer
            })

            this.sendNodeFn(outbound).catch((error) => {
                clearTimeout(timer)
                this.pendingQueries.delete(id)
                this.logger.warn('failed to send query node', {
                    id,
                    message: toError(error).message
                })
                reject(toError(error))
            })
        })
    }

    private async withAutoId(node: BinaryNode, useSystemId = false): Promise<BinaryNode> {
        if (node.attrs.id) {
            return node
        }
        const generator = await this.getIdGenerator()
        const generatedId =
            useSystemId && generator.nextSystem ? generator.nextSystem() : generator.next()
        this.logger.trace('generated stanza id', { id: generatedId, system: useSystemId })
        return {
            ...node,
            attrs: {
                ...node.attrs,
                id: generatedId
            }
        }
    }

    private async getIdGenerator(): Promise<NodeIdGenerator> {
        if (this.idGenerator) {
            return this.idGenerator
        }
        if (this.mobileIqIdFormat) {
            this.idGenerator = createMobileNodeIdGenerator()
            this.logger.debug('generated stanza prefix (mobile)', {
                prefix: this.idGenerator.prefix
            })
            return this.idGenerator
        }
        if (!this.idGeneratorReady) {
            this.idGeneratorReady = createNodeIdGenerator()
        }
        try {
            const generator = await this.idGeneratorReady
            if (!this.idGenerator) {
                this.idGenerator = generator
                this.logger.debug('generated stanza prefix', { prefix: generator.prefix })
            }
            return generator
        } catch (error) {
            this.idGeneratorReady = null
            throw toError(error)
        }
    }
}
