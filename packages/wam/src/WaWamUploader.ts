import type { BinaryNode, Logger, WaClientPluginContext } from 'zapo-js'
import { WA_DEFAULTS, WA_IQ_TYPES, WA_NODE_TAGS } from 'zapo-js/protocol'
import { delay, toError } from 'zapo-js/util'

/** WAM-telemetry upload stanza namespace + child tag (`<iq xmlns="w:stats"><add t>`). WAM-specific, not a core concept. */
const WAM_STATS_XMLNS = 'w:stats'
const WAM_STATS_ADD_TAG = 'add'

/** Exponential backoff with jitter, matching the WA stats backend shape. */
function backoffMs(attempt: number): number {
    const base = Math.min(1_000 * 2 ** attempt, 120_000)
    return base + Math.floor(base * 0.1 * Math.random())
}

export interface WaWamUploaderDeps {
    readonly query: WaClientPluginContext['queryWithContext']
    readonly logger: Logger
    /** IQ timeout per attempt. Defaults to 15s. */
    readonly timeoutMs?: number
    /** Max send attempts before the batch is dropped. Defaults to 4. */
    readonly maxAttempts?: number
}

/**
 * Ships a finalized WAM batch as the `<iq xmlns="w:stats"><add t>` stanza WA Web
 * sends. Best-effort: transient failures retry with exponential backoff; a
 * permanently failing batch is dropped (logged at debug), never surfaced.
 */
export class WaWamUploader {
    private readonly query: WaClientPluginContext['queryWithContext']
    private readonly logger: Logger
    private readonly timeoutMs: number
    private readonly maxAttempts: number

    constructor(deps: WaWamUploaderDeps) {
        this.query = deps.query
        this.logger = deps.logger
        this.timeoutMs = deps.timeoutMs ?? 15_000
        this.maxAttempts = deps.maxAttempts ?? 4
    }

    /** Uploads one batch. Resolves `true` on server ack, `false` if dropped. */
    async upload(batch: Uint8Array): Promise<boolean> {
        const node: BinaryNode = {
            tag: WA_NODE_TAGS.IQ,
            attrs: {
                to: WA_DEFAULTS.HOST_DOMAIN,
                type: WA_IQ_TYPES.SET,
                xmlns: WAM_STATS_XMLNS
            },
            content: [
                {
                    tag: WAM_STATS_ADD_TAG,
                    attrs: { t: String(Math.floor(Date.now() / 1000)) },
                    content: batch
                }
            ]
        }

        for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
            try {
                const result = await this.query('wam-upload', node, this.timeoutMs)
                if (result.attrs.type === WA_IQ_TYPES.RESULT) {
                    this.logger.trace('wam batch uploaded', { size: batch.length })
                    return true
                }
                if (!isRetryable(result)) {
                    this.logger.debug('wam batch rejected', { type: result.attrs.type })
                    return false
                }
            } catch (error) {
                this.logger.debug('wam batch upload attempt failed', {
                    attempt,
                    message: toError(error).message
                })
            }
            if (attempt < this.maxAttempts - 1) await delay(backoffMs(attempt))
        }
        this.logger.debug('wam batch dropped after retries', { size: batch.length })
        return false
    }
}

/** A `<iq type="error">` with a 5xx child code is retryable; anything else is terminal. */
function isRetryable(result: BinaryNode): boolean {
    if (!Array.isArray(result.content)) return false
    const error = result.content.find((child) => child.tag === WA_NODE_TAGS.ERROR)
    const code = Number.parseInt(error?.attrs.code ?? '', 10)
    return Number.isFinite(code) && code >= 500
}
