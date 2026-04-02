import type { Logger } from '@infra/log/types'
import { WA_DEFAULTS, WA_IQ_TYPES, WA_NODE_TAGS, WA_XMLNS } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'
import type { WaComms } from '@transport/WaComms'
import { normalizeNonNegativeInteger, toError } from '@util/primitives'

const KEEPALIVE_DEFAULT_JITTER_RATIO = 0.1
const KEEPALIVE_DEFAULT_MIN_JITTER_MS = 250
const KEEPALIVE_MAX_JITTER_RATIO = 0.5

interface WaKeepAliveOptions {
    readonly logger: Logger
    readonly nodeOrchestrator: {
        hasPending(): boolean
        query(node: BinaryNode, timeoutMs?: number): Promise<BinaryNode>
    }
    readonly getComms: () => WaComms | null
    readonly intervalMs?: number
    readonly getIntervalMs?: () => number
    readonly timeoutMs?: number
    readonly hostDomain?: string
    readonly jitterRatio?: number
    readonly minJitterMs?: number
}

export class WaKeepAlive {
    private readonly logger: Logger
    private readonly nodeOrchestrator: WaKeepAliveOptions['nodeOrchestrator']
    private readonly getCommsFn: () => WaComms | null
    private readonly baseIntervalMs: number
    private readonly getIntervalMs: (() => number) | undefined
    private readonly timeoutMs: number
    private readonly hostDomain: string
    private readonly jitterRatio: number
    private readonly minJitterMs: number
    private timer: NodeJS.Timeout | null
    private generation: number
    private inFlight: boolean

    public constructor(options: WaKeepAliveOptions) {
        this.logger = options.logger
        this.nodeOrchestrator = options.nodeOrchestrator
        this.getCommsFn = options.getComms
        this.baseIntervalMs = options.intervalMs ?? WA_DEFAULTS.HEALTH_CHECK_INTERVAL_MS
        this.getIntervalMs = options.getIntervalMs
        this.timeoutMs = options.timeoutMs ?? WA_DEFAULTS.DEAD_SOCKET_TIMEOUT_MS
        this.hostDomain = options.hostDomain ?? WA_DEFAULTS.HOST_DOMAIN
        this.jitterRatio = this.normalizeJitterRatio(options.jitterRatio)
        this.minJitterMs = normalizeNonNegativeInteger(
            options.minJitterMs,
            KEEPALIVE_DEFAULT_MIN_JITTER_MS
        )
        this.timer = null
        this.generation = 0
        this.inFlight = false
    }

    public start(): void {
        this.logger.info('keepalive start', {
            intervalMs: this.resolveIntervalMs(),
            timeoutMs: this.timeoutMs,
            jitterRatio: this.jitterRatio,
            minJitterMs: this.minJitterMs
        })
        this.generation += 1
        this.inFlight = false
        this.clearTimer()
        this.schedule(this.generation)
    }

    public stop(): void {
        this.logger.info('keepalive stop')
        this.generation += 1
        this.inFlight = false
        this.clearTimer()
    }

    private schedule(generation: number): void {
        if (generation !== this.generation) {
            return
        }
        this.clearTimer()
        const nextDelayMs = this.computeNextDelayMs()
        this.timer = setTimeout(() => {
            this.timer = null
            void this.run(generation)
        }, nextDelayMs)
        this.logger.trace('keepalive scheduled', {
            generation,
            inMs: nextDelayMs,
            baseIntervalMs: this.resolveIntervalMs()
        })
    }

    private async run(generation: number): Promise<void> {
        if (generation !== this.generation) {
            return
        }

        const comms = this.getCommsFn()
        if (!comms || !comms.getCommsState().connected) {
            this.logger.trace('keepalive skipped: comms not connected')
            this.schedule(generation)
            return
        }

        if (this.inFlight || this.nodeOrchestrator.hasPending()) {
            this.logger.trace('keepalive skipped: in-flight or pending queries', {
                inFlight: this.inFlight,
                pendingQueries: this.nodeOrchestrator.hasPending()
            })
            this.schedule(generation)
            return
        }

        this.inFlight = true
        const startedAt = Date.now()
        try {
            const pingNode: BinaryNode = {
                tag: WA_NODE_TAGS.IQ,
                attrs: {
                    to: this.hostDomain,
                    type: WA_IQ_TYPES.GET,
                    xmlns: WA_XMLNS.WHATSAPP_PING
                }
            }
            await this.nodeOrchestrator.query(pingNode, this.timeoutMs)
            this.logger.debug('keepalive ping success', {
                latencyMs: Date.now() - startedAt
            })
        } catch (error) {
            this.logger.warn('keepalive ping failed, reconnecting socket', {
                message: toError(error).message
            })
            try {
                await comms.closeSocketAndResume()
            } catch (resumeError) {
                this.logger.warn('keepalive reconnect failed', {
                    message: toError(resumeError).message
                })
            }
        } finally {
            this.inFlight = false
        }

        this.schedule(generation)
    }

    private normalizeJitterRatio(value: number | undefined): number {
        if (!Number.isFinite(value)) {
            return KEEPALIVE_DEFAULT_JITTER_RATIO
        }
        const normalized = value as number
        return Math.min(Math.max(normalized, 0), KEEPALIVE_MAX_JITTER_RATIO)
    }

    private resolveIntervalMs(): number {
        const candidate = this.getIntervalMs?.() ?? this.baseIntervalMs
        if (!Number.isFinite(candidate) || candidate <= 0) {
            return this.baseIntervalMs
        }
        return candidate
    }

    private computeNextDelayMs(): number {
        const intervalMs = this.resolveIntervalMs()
        if (intervalMs <= 0) {
            return 0
        }
        if (this.jitterRatio <= 0 && this.minJitterMs <= 0) {
            return intervalMs
        }
        const ratioJitterMs = Math.floor(intervalMs * this.jitterRatio)
        const jitterWindowMs = Math.max(this.minJitterMs, ratioJitterMs)
        if (jitterWindowMs <= 0) {
            return intervalMs
        }
        const offsetMs = Math.floor(Math.random() * (jitterWindowMs * 2 + 1) - jitterWindowMs)
        return Math.max(1, intervalMs + offsetMs)
    }

    private clearTimer(): void {
        if (!this.timer) {
            return
        }
        clearTimeout(this.timer)
        this.timer = null
    }
}
