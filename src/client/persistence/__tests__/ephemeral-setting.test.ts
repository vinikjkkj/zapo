import assert from 'node:assert/strict'
import test from 'node:test'

import {
    createEphemeralObserver,
    persistIncomingEphemeralSetting
} from '@client/persistence/ephemeral-setting'
import type { WaIncomingMessageEvent } from '@client/types'
import { createNoopLogger } from '@infra/log/types'
import { proto } from '@proto'
import type {
    WaChatMetadataSnapshot,
    WaChatMetadataStore
} from '@store/contracts/chat-metadata.store'
import type { WaStoredThreadRecord } from '@store/contracts/thread.store'
import { WaChatMetadataMemoryStore } from '@store/memory/chat-metadata.store'
import { delay } from '@util/async'

function baseEvent(
    overrides: Partial<WaIncomingMessageEvent> & {
        readonly keyOverrides?: Partial<WaIncomingMessageEvent['key']>
    } = {}
): WaIncomingMessageEvent {
    const { keyOverrides, ...rest } = overrides
    return {
        key: {
            remoteJid: '5511999999999@s.whatsapp.net',
            id: 'msg-1',
            fromMe: false,
            isGroup: false,
            isBroadcast: false,
            isNewsletter: false,
            senderDevice: 0,
            ...keyOverrides
        },
        rawNode: {
            tag: 'message',
            attrs: {}
        },
        timestampSeconds: 1_784_900_697,
        ...rest
    }
}

test('ephemeral setting persist enables 1:1 thread with protocol expiration + message timestamp', () => {
    const threads: WaStoredThreadRecord[] = []
    const writeBehind = {
        persistThread: (record: WaStoredThreadRecord) => {
            threads.push(record)
        }
    }

    persistIncomingEphemeralSetting({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        chatMetadataStore: new WaChatMetadataMemoryStore(60_000),
        event: baseEvent(),
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
            ephemeralExpiration: 86_400
        }
    })

    assert.equal(threads.length, 1)
    assert.equal(threads[0].jid, '5511999999999@s.whatsapp.net')
    assert.equal(threads[0].ephemeralExpiration, 86_400)
    assert.equal(threads[0].ephemeralSettingTimestamp, 1_784_900_697)
})

test('ephemeral setting persist prefers protocol ephemeralSettingTimestamp over message timestamp', () => {
    const threads: WaStoredThreadRecord[] = []
    const writeBehind = {
        persistThread: (record: WaStoredThreadRecord) => {
            threads.push(record)
        }
    }

    persistIncomingEphemeralSetting({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        chatMetadataStore: new WaChatMetadataMemoryStore(60_000),
        event: baseEvent({ timestampSeconds: 1_700_000_000 }),
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
            ephemeralExpiration: 604_800,
            ephemeralSettingTimestamp: 1_751_808_692
        }
    })

    assert.equal(threads[0].ephemeralExpiration, 604_800)
    assert.equal(threads[0].ephemeralSettingTimestamp, 1_751_808_692)
})

test('ephemeral setting persist disables 1:1 thread with expiration 0', () => {
    const threads: WaStoredThreadRecord[] = []
    const writeBehind = {
        persistThread: (record: WaStoredThreadRecord) => {
            threads.push(record)
        }
    }

    persistIncomingEphemeralSetting({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        chatMetadataStore: new WaChatMetadataMemoryStore(60_000),
        event: baseEvent({ timestampSeconds: 1_784_900_714 }),
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
            ephemeralExpiration: 0
        }
    })

    assert.equal(threads[0].ephemeralExpiration, 0)
    assert.equal(threads[0].ephemeralSettingTimestamp, 1_784_900_714)
})

test('ephemeral setting persist normalizes a millisecond protocol timestamp', () => {
    const threads: WaStoredThreadRecord[] = []
    const writeBehind = {
        persistThread: (record: WaStoredThreadRecord) => {
            threads.push(record)
        }
    }

    persistIncomingEphemeralSetting({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        chatMetadataStore: new WaChatMetadataMemoryStore(60_000),
        event: baseEvent(),
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
            ephemeralExpiration: 86_400,
            ephemeralSettingTimestamp: 1_751_808_692_000
        }
    })

    assert.equal(threads[0].ephemeralSettingTimestamp, 1_751_808_692)
})

test('ephemeral setting persist skips group chats', () => {
    const threads: WaStoredThreadRecord[] = []
    const writeBehind = {
        persistThread: (record: WaStoredThreadRecord) => {
            threads.push(record)
        }
    }

    persistIncomingEphemeralSetting({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        chatMetadataStore: new WaChatMetadataMemoryStore(60_000),
        event: baseEvent({
            keyOverrides: {
                remoteJid: '120363000000000000@g.us',
                isGroup: true
            }
        }),
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
            ephemeralExpiration: 86_400
        }
    })

    assert.equal(threads.length, 0)
})

function ephemeralEvent(
    expirationSeconds: number | undefined,
    settingTimestamp: number | undefined
): WaIncomingMessageEvent {
    return baseEvent({
        ...(expirationSeconds !== undefined ? { expirationSeconds } : {}),
        message: {
            extendedTextMessage: {
                text: 'oi',
                contextInfo: {
                    ...(expirationSeconds !== undefined ? { expiration: expirationSeconds } : {}),
                    ...(settingTimestamp !== undefined
                        ? { ephemeralSettingTimestamp: settingTimestamp }
                        : {})
                }
            }
        }
    })
}

interface WaObservedChatMetadataStore extends WaChatMetadataStore {
    /** Round-trips the observer has completed, so a test can wait on progress. */
    readonly counts: { reads: number; writes: number }
    /**
     * Moves the store's clock forward for both reads and writes. Ages entries
     * past the ttl through the store's own expiry check, so the expired-entry
     * case never depends on a sleep outlasting a wall-clock timer.
     */
    advanceClock(aheadMs: number): void
    /** Read that bypasses the counters – for assertions, not for the observer. */
    peek(chatJid: string): Promise<WaChatMetadataSnapshot | null>
    destroy(): Promise<void>
}

function createObservedStore(
    options: { readonly ttlMs?: number; readonly readLatencyMs?: number } = {}
): WaObservedChatMetadataStore {
    const inner = new WaChatMetadataMemoryStore(options.ttlMs ?? 60_000)
    const counts = { reads: 0, writes: 0 }
    let clockAheadMs = 0

    return {
        counts,
        advanceClock: (aheadMs) => {
            clockAheadMs += aheadMs
        },
        peek: (chatJid) => inner.getChatMetadata(chatJid, Date.now() + clockAheadMs),
        getChatMetadata: async (chatJid, nowMs = Date.now()) => {
            counts.reads += 1
            if (options.readLatencyMs !== undefined) {
                await delay(options.readLatencyMs)
            }
            return inner.getChatMetadata(chatJid, nowMs + clockAheadMs)
        },
        upsertChatMetadata: async (snapshot) => {
            counts.writes += 1
            await inner.upsertChatMetadata({
                ...snapshot,
                updatedAtMs: snapshot.updatedAtMs + clockAheadMs
            })
        },
        deleteChatMetadata: (chatJid) => inner.deleteChatMetadata(chatJid),
        cleanupExpired: (nowMs) => inner.cleanupExpired(nowMs),
        clear: () => inner.clear(),
        destroy: () => inner.destroy()
    }
}

/**
 * Waits for the observer's fire-and-forget round-trip to land. Polling beats a
 * fixed sleep: the sleep either flakes when a loaded machine misses the window
 * or pads every run to cover the worst case.
 */
async function waitFor(
    predicate: () => boolean,
    message: string,
    timeoutMs = 5_000
): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!predicate()) {
        if (Date.now() > deadline) {
            throw new Error(message)
        }
        await delay(1)
    }
}

const CHAT_JID = '5511999999999@s.whatsapp.net'
const GROUP_JID = '120363000000000000@g.us'

test('ephemeral observer caches the setting an inbound message advertises', async () => {
    const store = createObservedStore()
    const observe = createEphemeralObserver({
        logger: createNoopLogger(),
        chatMetadataStore: store
    })

    observe(ephemeralEvent(86_400, 1_751_808_692))
    await waitFor(() => store.counts.writes === 1, 'observer never cached the setting')

    const cached = await store.peek(CHAT_JID)
    assert.ok(cached)
    assert.equal(cached.ephemeralExpiration, 86_400)
    assert.equal(cached.ephemeralSettingTimestamp, 1_751_808_692)
    await store.destroy()
})

test('ephemeral observer skips a repeat of the cached value', async () => {
    const store = createObservedStore()
    const observe = createEphemeralObserver({
        logger: createNoopLogger(),
        chatMetadataStore: store
    })

    observe(ephemeralEvent(86_400, 1_751_808_692))
    await waitFor(() => store.counts.writes === 1, 'observer never cached the setting')

    // Each repeat still costs a read; the write is what must be skipped. Waiting
    // on the read is what makes the skip observable instead of merely pending.
    for (const expectedReads of [2, 3]) {
        observe(ephemeralEvent(86_400, 1_751_808_692))
        await waitFor(
            () => store.counts.reads === expectedReads,
            'observer never re-read the cached setting'
        )
        assert.equal(store.counts.writes, 1, 'a stable setting must be written once')
    }

    observe(ephemeralEvent(86_400, 1_800_000_000))
    await waitFor(() => store.counts.writes === 2, 'a changed setting must be written')
    await store.destroy()
})

test('ephemeral observer rewrites after the cache entry expires', async () => {
    const ttlMs = 60_000
    const store = createObservedStore({ ttlMs })
    const observe = createEphemeralObserver({
        logger: createNoopLogger(),
        chatMetadataStore: store
    })

    observe(ephemeralEvent(86_400, 1_751_808_692))
    await waitFor(() => store.counts.writes === 1, 'observer never cached the setting')

    store.advanceClock(ttlMs + 1)
    assert.equal(await store.peek(CHAT_JID), null, 'entry should be past its ttl')

    observe(ephemeralEvent(86_400, 1_751_808_692))
    await waitFor(
        () => store.counts.writes === 2,
        'an expired entry must be repopulated by the next inbound message'
    )
    assert.ok(await store.peek(CHAT_JID))
    await store.destroy()
})

test('ephemeral observer ignores groups and non-ephemeral chats', async () => {
    const store = createObservedStore()
    const observe = createEphemeralObserver({
        logger: createNoopLogger(),
        chatMetadataStore: store
    })

    observe(ephemeralEvent(undefined, 1_751_808_692))
    observe({
        ...ephemeralEvent(86_400, 1_751_808_692),
        key: { ...baseEvent().key, remoteJid: GROUP_JID, isGroup: true }
    })

    // Both are rejected by synchronous guards, so the store is never touched –
    // no waiting needed to tell "skipped" apart from "still in flight".
    assert.equal(store.counts.reads, 0)
    assert.equal(store.counts.writes, 0)
    assert.equal(await store.peek(CHAT_JID), null)
    assert.equal(await store.peek(GROUP_JID), null)
    await store.destroy()
})

test('ephemeral observer collapses a concurrent burst into one store round-trip', async () => {
    const store = createObservedStore({ readLatencyMs: 5 })
    const observe = createEphemeralObserver({
        logger: createNoopLogger(),
        chatMetadataStore: store
    })

    for (let i = 0; i < 5; i += 1) {
        observe(ephemeralEvent(86_400, 1_751_808_692))
    }
    await waitFor(() => store.counts.writes === 1, 'the burst never reached the store')

    assert.equal(store.counts.reads, 1, 'a burst from one chat must share a single read')
    assert.equal(store.counts.writes, 1)
    await store.destroy()
})
