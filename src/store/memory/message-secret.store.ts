import type { Logger } from '@infra/log/types'
import type {
    WaMessageSecretEntry,
    WaMessageSecretStore
} from '@store/contracts/message-secret.store'
import { resolvePositive } from '@util/coercion'
import {
    createPeriodicCleanup,
    type PeriodicCleanupHandle,
    setBoundedMapEntry
} from '@util/collections'

interface CachedEntry {
    readonly secret: Uint8Array
    readonly senderJid: string
    readonly expiresAtMs: number
}

const DEFAULTS = Object.freeze({
    ttlMs: 30 * 60 * 1000,
    maxSecrets: 10_000
} as const)

export interface WaMessageSecretMemoryStoreOptions {
    readonly maxSecrets?: number
    /**
     * Logger for capacity-saturation warnings. Emits a single `warn` the
     * first time the bounded map evicts an entry; subsequent evictions are
     * silent to avoid spam.
     */
    readonly logger?: Logger
}

export class WaMessageSecretMemoryStore implements WaMessageSecretStore {
    private readonly secrets: Map<string, CachedEntry>
    private readonly ttlMs: number
    private readonly maxSecrets: number
    private readonly cleanup: PeriodicCleanupHandle
    private readonly logger: Logger | undefined
    private capacityWarned: boolean

    public constructor(ttlMs = DEFAULTS.ttlMs, options: WaMessageSecretMemoryStoreOptions = {}) {
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('message-secret ttlMs must be a positive finite number')
        }
        this.secrets = new Map()
        this.ttlMs = ttlMs
        this.maxSecrets = resolvePositive(
            options.maxSecrets,
            DEFAULTS.maxSecrets,
            'WaMessageSecretMemoryStoreOptions.maxSecrets'
        )
        this.logger = options.logger
        this.capacityWarned = false
        this.cleanup = createPeriodicCleanup(ttlMs, () => {
            void this.cleanupExpired(Date.now())
        })
    }

    private warnCapacity(): void {
        if (this.capacityWarned || !this.logger) return
        this.capacityWarned = true
        this.logger.warn('message secret store at capacity, evicting oldest', {
            max: this.maxSecrets
        })
    }

    public async get(messageId: string, nowMs = Date.now()): Promise<WaMessageSecretEntry | null> {
        const cached = this.secrets.get(messageId)
        if (!cached) return null
        if (cached.expiresAtMs <= nowMs) {
            this.secrets.delete(messageId)
            return null
        }
        return { secret: cached.secret, senderJid: cached.senderJid }
    }

    public async getBatch(
        messageIds: readonly string[],
        nowMs = Date.now()
    ): Promise<readonly (WaMessageSecretEntry | null)[]> {
        const result = new Array<WaMessageSecretEntry | null>(messageIds.length)
        for (let i = 0; i < messageIds.length; i += 1) {
            const cached = this.secrets.get(messageIds[i])
            if (!cached) {
                result[i] = null
                continue
            }
            if (cached.expiresAtMs <= nowMs) {
                this.secrets.delete(messageIds[i])
                result[i] = null
                continue
            }
            result[i] = { secret: cached.secret, senderJid: cached.senderJid }
        }
        return result
    }

    public async set(messageId: string, entry: WaMessageSecretEntry): Promise<void> {
        setBoundedMapEntry(
            this.secrets,
            messageId,
            {
                secret: entry.secret,
                senderJid: entry.senderJid,
                expiresAtMs: Date.now() + this.ttlMs
            },
            this.maxSecrets,
            () => this.warnCapacity()
        )
    }

    public async setBatch(
        entries: readonly { readonly messageId: string; readonly entry: WaMessageSecretEntry }[]
    ): Promise<void> {
        const nowMs = Date.now()
        for (let i = 0; i < entries.length; i += 1) {
            setBoundedMapEntry(
                this.secrets,
                entries[i].messageId,
                {
                    secret: entries[i].entry.secret,
                    senderJid: entries[i].entry.senderJid,
                    expiresAtMs: nowMs + this.ttlMs
                },
                this.maxSecrets,
                () => this.warnCapacity()
            )
        }
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        let removed = 0
        for (const [messageId, entry] of this.secrets) {
            if (entry.expiresAtMs > nowMs) continue
            this.secrets.delete(messageId)
            removed += 1
        }
        return removed
    }

    public async clear(): Promise<void> {
        this.secrets.clear()
    }

    public async destroy(): Promise<void> {
        this.cleanup.destroy()
        this.secrets.clear()
    }
}
