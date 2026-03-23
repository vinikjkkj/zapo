import type { WaWriteBehindOptions } from '@client/types'
import type { Logger } from '@infra/log/types'
import type { BackgroundQueueFlushResult } from '@infra/perf/BackgroundQueue'
import { BackgroundQueue } from '@infra/perf/BackgroundQueue'
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
    private readonly queues: {
        readonly messages: BackgroundQueue<string, WaStoredMessageRecord>
        readonly threads: BackgroundQueue<string, WaStoredThreadRecord>
        readonly contacts: BackgroundQueue<string, WaStoredContactRecord>
    }
    private readonly flushTimeoutMs: number

    public constructor(
        stores: WriteBehindStores,
        logger: Logger,
        options: WaWriteBehindOptions = {}
    ) {
        this.logger = logger
        this.flushTimeoutMs = options.flushTimeoutMs ?? 5_000
        const queueOptions = (domain: string) => ({
            maxPendingKeys: options.maxPendingKeys ?? 4_096,
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
        this.queues = {
            messages: new BackgroundQueue(
                (_key, value) => stores.messageStore.upsert(value),
                queueOptions('messages')
            ),
            threads: new BackgroundQueue((_key, value) => stores.threadStore.upsert(value), {
                ...queueOptions('threads'),
                coalesce: (previous, incoming) => mergeThread(previous, incoming)
            }),
            contacts: new BackgroundQueue((_key, value) => stores.contactStore.upsert(value), {
                ...queueOptions('contacts'),
                coalesce: (previous, incoming) => mergeContact(previous, incoming)
            })
        }
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
