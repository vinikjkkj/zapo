import type { WaStoredThreadRecord, WaThreadStore as Contract } from '@store/contracts/thread.store'
import { normalizeQueryLimit, setBoundedMapEntry } from '@util/collections'
import { readPositiveLimit } from '@util/env'

const DEFAULT_THREAD_MEMORY_STORE_LIMITS = Object.freeze({
    threads: 10_000
} as const)

export class WaThreadMemoryStore implements Contract {
    private readonly threads = new Map<string, WaStoredThreadRecord>()
    private readonly maxThreads: number

    public constructor() {
        this.maxThreads = readPositiveLimit(
            'WA_THREADS_MEMORY_STORE_MAX_THREADS',
            DEFAULT_THREAD_MEMORY_STORE_LIMITS.threads
        )
    }

    public async upsert(record: WaStoredThreadRecord): Promise<void> {
        setBoundedMapEntry(this.threads, record.jid, record, this.maxThreads)
    }

    public async getByJid(jid: string): Promise<WaStoredThreadRecord | null> {
        return this.threads.get(jid) ?? null
    }

    public async list(limit?: number): Promise<readonly WaStoredThreadRecord[]> {
        const normalizedLimit = normalizeQueryLimit(limit, 100)
        return Array.from(this.threads.values()).slice(0, normalizedLimit)
    }

    public async deleteByJid(jid: string): Promise<number> {
        return this.threads.delete(jid) ? 1 : 0
    }

    public async clear(): Promise<void> {
        this.threads.clear()
    }
}
