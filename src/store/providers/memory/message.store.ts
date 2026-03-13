import type {
    WaMessageStore as Contract,
    WaStoredMessageRecord
} from '@store/contracts/message.store'
import { normalizeQueryLimit } from '@util/collections'
import { setBoundedMapEntry } from '@util/collections'
import { readPositiveLimit } from '@util/env'

const DEFAULT_MESSAGE_MEMORY_STORE_LIMITS = Object.freeze({
    messages: 50_000
} as const)

export class WaMessageMemoryStore implements Contract {
    private readonly messages = new Map<string, WaStoredMessageRecord>()
    private readonly maxMessages: number

    public constructor() {
        this.maxMessages = readPositiveLimit(
            'WA_MESSAGES_MEMORY_STORE_MAX_MESSAGES',
            DEFAULT_MESSAGE_MEMORY_STORE_LIMITS.messages
        )
    }

    public async upsert(record: WaStoredMessageRecord): Promise<void> {
        setBoundedMapEntry(this.messages, record.id, record, this.maxMessages)
    }

    public async getById(id: string): Promise<WaStoredMessageRecord | null> {
        return this.messages.get(id) ?? null
    }

    public async listByThread(
        threadJid: string,
        limit?: number,
        beforeTimestampMs?: number
    ): Promise<readonly WaStoredMessageRecord[]> {
        const normalizedLimit = normalizeQueryLimit(limit, 50)
        const records = Array.from(this.messages.values())
            .filter((record) => record.threadJid === threadJid)
            .filter(
                (record) =>
                    beforeTimestampMs === undefined ||
                    (record.timestampMs !== undefined && record.timestampMs < beforeTimestampMs)
            )
            .sort((left, right) => (right.timestampMs ?? 0) - (left.timestampMs ?? 0))

        return records.slice(0, normalizedLimit)
    }

    public async deleteById(id: string): Promise<number> {
        return this.messages.delete(id) ? 1 : 0
    }

    public async clear(): Promise<void> {
        this.messages.clear()
    }
}
