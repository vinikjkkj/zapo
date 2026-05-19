import type { WaThreadStore as Contract, WaStoredThreadRecord } from '@store/contracts/thread.store'
import { resolvePositive } from '@util/coercion'
import { normalizeQueryLimit, setBoundedMapEntry } from '@util/collections'

const DEFAULT_THREAD_MEMORY_STORE_LIMITS = Object.freeze({
    threads: 10_000
} as const)

export interface WaThreadMemoryStoreOptions {
    readonly maxThreads?: number
}

export class WaThreadMemoryStore implements Contract {
    private readonly threads = new Map<string, WaStoredThreadRecord>()
    private readonly maxThreads: number

    public constructor(options: WaThreadMemoryStoreOptions = {}) {
        this.maxThreads = resolvePositive(
            options.maxThreads,
            DEFAULT_THREAD_MEMORY_STORE_LIMITS.threads,
            'WaThreadMemoryStoreOptions.maxThreads'
        )
    }

    public async upsert(record: WaStoredThreadRecord): Promise<void> {
        setBoundedMapEntry(this.threads, record.jid, record, this.maxThreads)
    }

    public async upsertBatch(records: readonly WaStoredThreadRecord[]): Promise<void> {
        for (const record of records) {
            setBoundedMapEntry(this.threads, record.jid, record, this.maxThreads)
        }
    }

    public async getByJid(jid: string): Promise<WaStoredThreadRecord | null> {
        return this.threads.get(jid) ?? null
    }

    public async list(limit?: number): Promise<readonly WaStoredThreadRecord[]> {
        const normalizedLimit = normalizeQueryLimit(limit, 100)
        const out: WaStoredThreadRecord[] = []
        for (const thread of this.threads.values()) {
            out.push(thread)
            if (out.length >= normalizedLimit) {
                break
            }
        }
        return out
    }

    public async deleteByJid(jid: string): Promise<number> {
        return this.threads.delete(jid) ? 1 : 0
    }

    public async clear(): Promise<void> {
        this.threads.clear()
    }
}
