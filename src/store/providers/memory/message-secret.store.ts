import type { WaMessageSecretStore } from '@store/contracts/message-secret.store'
import { resolvePositive } from '@util/coercion'
import { resolveCleanupIntervalMs, setBoundedMapEntry } from '@util/collections'

interface WaMessageSecretEntry {
    readonly secret: Uint8Array
    readonly expiresAtMs: number
}

const DEFAULTS = Object.freeze({
    ttlMs: 30 * 60 * 1000,
    maxSecrets: 10_000
} as const)

export interface WaMessageSecretMemoryStoreOptions {
    readonly maxSecrets?: number
}

export class WaMessageSecretMemoryStore implements WaMessageSecretStore {
    private readonly secrets: Map<string, WaMessageSecretEntry>
    private readonly ttlMs: number
    private readonly maxSecrets: number
    private readonly cleanupTimer: NodeJS.Timeout

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
        this.cleanupTimer = setInterval(() => {
            void this.cleanupExpired(Date.now())
        }, resolveCleanupIntervalMs(ttlMs))
        this.cleanupTimer.unref()
    }

    public async get(messageId: string, nowMs = Date.now()): Promise<Uint8Array | null> {
        const entry = this.secrets.get(messageId)
        if (!entry) return null
        if (entry.expiresAtMs <= nowMs) {
            this.secrets.delete(messageId)
            return null
        }
        return entry.secret
    }

    public async getBatch(
        messageIds: readonly string[],
        nowMs = Date.now()
    ): Promise<readonly (Uint8Array | null)[]> {
        const result = new Array<Uint8Array | null>(messageIds.length)
        for (let i = 0; i < messageIds.length; i += 1) {
            const entry = this.secrets.get(messageIds[i])
            if (!entry) {
                result[i] = null
                continue
            }
            if (entry.expiresAtMs <= nowMs) {
                this.secrets.delete(messageIds[i])
                result[i] = null
                continue
            }
            result[i] = entry.secret
        }
        return result
    }

    public async set(messageId: string, secret: Uint8Array): Promise<void> {
        setBoundedMapEntry(
            this.secrets,
            messageId,
            { secret, expiresAtMs: Date.now() + this.ttlMs },
            this.maxSecrets
        )
    }

    public async setBatch(
        entries: readonly { readonly messageId: string; readonly secret: Uint8Array }[]
    ): Promise<void> {
        const nowMs = Date.now()
        for (let i = 0; i < entries.length; i += 1) {
            setBoundedMapEntry(
                this.secrets,
                entries[i].messageId,
                { secret: entries[i].secret, expiresAtMs: nowMs + this.ttlMs },
                this.maxSecrets
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
        clearInterval(this.cleanupTimer)
        this.secrets.clear()
    }
}
