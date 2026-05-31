import type { WaWriteBehindOptions } from '@client/types'
import type { Logger } from '@infra/log/types'
import { BackgroundQueue, type BackgroundQueueFlushResult } from '@infra/perf/BackgroundQueue'
import type { WaContactStore, WaStoredContactRecord } from '@store/contracts/contact.store'
import type { WaMessageStore, WaStoredMessageRecord } from '@store/contracts/message.store'
import type { WaStoredThreadRecord, WaThreadStore } from '@store/contracts/thread.store'
import { toError } from '@util/primitives'

interface WriteBehindStores {
    readonly messageStore: WaMessageStore
    readonly threadStore: WaThreadStore
    readonly contactStore: WaContactStore
}

export interface WriteBehindDrainResult {
    readonly messages: BackgroundQueueFlushResult
    readonly threads: BackgroundQueueFlushResult
    readonly contacts: BackgroundQueueFlushResult
    readonly flushed: number
    readonly remaining: number
}

function mergeThread(
    previous: WaStoredThreadRecord,
    incoming: WaStoredThreadRecord
): WaStoredThreadRecord {
    return {
        jid: incoming.jid,
        name: incoming.name ?? previous.name,
        unreadCount: incoming.unreadCount ?? previous.unreadCount,
        archived: incoming.archived ?? previous.archived,
        pinned: incoming.pinned ?? previous.pinned,
        muteEndMs: incoming.muteEndMs ?? previous.muteEndMs,
        markedAsUnread: incoming.markedAsUnread ?? previous.markedAsUnread,
        ephemeralExpiration: incoming.ephemeralExpiration ?? previous.ephemeralExpiration
    }
}

function mergeContact(
    previous: WaStoredContactRecord,
    incoming: WaStoredContactRecord
): WaStoredContactRecord {
    return {
        jid: incoming.jid,
        displayName: incoming.displayName ?? previous.displayName,
        pushName: incoming.pushName ?? previous.pushName,
        lid: incoming.lid ?? previous.lid,
        phoneNumber: incoming.phoneNumber ?? previous.phoneNumber,
        lastUpdatedMs: Math.max(previous.lastUpdatedMs, incoming.lastUpdatedMs)
    }
}

export class WriteBehindPersistence {
    private readonly logger: Logger
    private readonly stores: WriteBehindStores
    private readonly options: WaWriteBehindOptions
    private queues: {
        readonly messages: BackgroundQueue<string, WaStoredMessageRecord>
        readonly threads: BackgroundQueue<string, WaStoredThreadRecord>
        readonly contacts: BackgroundQueue<string, WaStoredContactRecord>
    }
    private readonly flushTimeoutMs: number
    private destroyed: boolean

    public constructor(
        stores: WriteBehindStores,
        logger: Logger,
        options: WaWriteBehindOptions = {}
    ) {
        this.logger = logger
        this.stores = stores
        this.options = options
        this.flushTimeoutMs = options.flushTimeoutMs ?? 5_000
        this.queues = this.buildQueues()
        this.destroyed = false
    }

    private buildQueues(): typeof this.queues {
        const stores = this.stores
        const options = this.options
        const queueOptions = (domain: string) => ({
            maxPendingKeys: options.maxPendingKeys ?? 4_096,
            maxWriteConcurrency: options.maxWriteConcurrency ?? 4,
            flushTimeoutMs: this.flushTimeoutMs,
            onError: (key: string, error: unknown, attempt: number) => {
                this.logger.warn('write-behind error', {
                    domain,
                    key,
                    attempt,
                    message: toError(error).message
                })
            },
            onPressure: (pendingKeys: number) => {
                this.logger.warn('write-behind pressure', {
                    domain,
                    pendingKeys
                })
            },
            onDiscard: (key: string) => {
                this.logger.warn('write-behind discarded pending write', {
                    domain,
                    key
                })
            }
        })
        return {
            messages: new BackgroundQueue((_key, value) => stores.messageStore.upsert(value), {
                ...queueOptions('messages'),
                batchWriter: (entries) =>
                    stores.messageStore.upsertBatch(entries.map((e) => e.value))
            }),
            threads: new BackgroundQueue((_key, value) => stores.threadStore.upsert(value), {
                ...queueOptions('threads'),
                coalesce: (previous, incoming) => mergeThread(previous, incoming),
                batchWriter: (entries) =>
                    stores.threadStore.upsertBatch(entries.map((e) => e.value))
            }),
            contacts: new BackgroundQueue((_key, value) => stores.contactStore.upsert(value), {
                ...queueOptions('contacts'),
                coalesce: (previous, incoming) => mergeContact(previous, incoming),
                batchWriter: (entries) =>
                    stores.contactStore.upsertBatch(entries.map((e) => e.value))
            })
        }
    }

    /**
     * Re-arm the queues after a previous {@link destroy} call. Idempotent —
     * a no-op when the persistence is already live. Used by `WaClient.connect`
     * to recover from a logout/clear-stored-state cycle without leaking the
     * old destroyed queues into the next session.
     */
    public restart(): void {
        if (!this.destroyed) {
            return
        }
        this.queues = this.buildQueues()
        this.destroyed = false
    }

    public persistMessage(record: WaStoredMessageRecord): void {
        this.queues.messages.enqueue(`msg:${record.id}`, record)
    }

    public persistMessageAsync(record: WaStoredMessageRecord): Promise<void> {
        return this.queues.messages.enqueueAsync(`msg:${record.id}`, record)
    }

    public persistThread(record: WaStoredThreadRecord): void {
        this.queues.threads.enqueue(`thread:${record.jid}`, record)
    }

    public persistThreadAsync(record: WaStoredThreadRecord): Promise<void> {
        return this.queues.threads.enqueueAsync(`thread:${record.jid}`, record)
    }

    public persistContact(record: WaStoredContactRecord): void {
        this.queues.contacts.enqueue(`contact:${record.jid}`, record)
    }

    public persistContactAsync(record: WaStoredContactRecord): Promise<void> {
        return this.queues.contacts.enqueueAsync(`contact:${record.jid}`, record)
    }

    public async flush(timeoutMs: number = this.flushTimeoutMs): Promise<WriteBehindDrainResult> {
        const [messages, threads, contacts] = await Promise.all([
            this.queues.messages.flush(timeoutMs),
            this.queues.threads.flush(timeoutMs),
            this.queues.contacts.flush(timeoutMs)
        ])
        const result = this.toDrainResult(messages, threads, contacts)
        if (result.remaining > 0) {
            this.logger.warn('write-behind flush finished with pending writes', {
                messagesRemaining: messages.remaining,
                threadsRemaining: threads.remaining,
                contactsRemaining: contacts.remaining
            })
        }
        return result
    }

    public async destroy(timeoutMs: number = this.flushTimeoutMs): Promise<WriteBehindDrainResult> {
        const [messages, threads, contacts] = await Promise.all([
            this.queues.messages.destroy(timeoutMs),
            this.queues.threads.destroy(timeoutMs),
            this.queues.contacts.destroy(timeoutMs)
        ])
        this.destroyed = true
        const result = this.toDrainResult(messages, threads, contacts)
        if (result.remaining > 0) {
            this.logger.warn('write-behind destroy finished with pending writes', {
                messagesRemaining: messages.remaining,
                threadsRemaining: threads.remaining,
                contactsRemaining: contacts.remaining
            })
        }
        return result
    }

    private toDrainResult(
        messages: BackgroundQueueFlushResult,
        threads: BackgroundQueueFlushResult,
        contacts: BackgroundQueueFlushResult
    ): WriteBehindDrainResult {
        return {
            messages,
            threads,
            contacts,
            flushed: messages.flushed + threads.flushed + contacts.flushed,
            remaining: messages.remaining + threads.remaining + contacts.remaining
        }
    }
}
