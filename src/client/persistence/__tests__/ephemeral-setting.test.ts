import assert from 'node:assert/strict'
import test from 'node:test'

import {
    createEphemeralObserver,
    persistIncomingEphemeralSetting
} from '@client/persistence/ephemeral-setting'
import type { WaIncomingMessageEvent } from '@client/types'
import { createNoopLogger } from '@infra/log/types'
import { proto } from '@proto'
import type { WaStoredThreadRecord } from '@store/contracts/thread.store'
import { WaChatMetadataMemoryStore } from '@store/memory/chat-metadata.store'

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

test('ephemeral observer caches the setting an inbound message advertises', async () => {
    const store = new WaChatMetadataMemoryStore(60_000)
    const observe = createEphemeralObserver({
        logger: createNoopLogger(),
        chatMetadataStore: store
    })

    observe(ephemeralEvent(86_400, 1_751_808_692))
    await new Promise((resolve) => setTimeout(resolve, 10))

    const cached = await store.getChatMetadata('5511999999999@s.whatsapp.net')
    assert.ok(cached)
    assert.equal(cached.ephemeralExpiration, 86_400)
    assert.equal(cached.ephemeralSettingTimestamp, 1_751_808_692)
    await store.destroy()
})

test('ephemeral observer skips a repeat of the cached value', async () => {
    let writes = 0
    const store = new WaChatMetadataMemoryStore(60_000)
    const counting = {
        getChatMetadata: (jid: string) => store.getChatMetadata(jid),
        upsertChatMetadata: async (snapshot: never) => {
            writes += 1
            await store.upsertChatMetadata(snapshot)
        }
    }
    const observe = createEphemeralObserver({
        logger: createNoopLogger(),
        chatMetadataStore: counting as never
    })

    for (let i = 0; i < 3; i += 1) {
        observe(ephemeralEvent(86_400, 1_751_808_692))
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assert.equal(writes, 1, 'a stable setting must be written once')

    observe(ephemeralEvent(86_400, 1_800_000_000))
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(writes, 2, 'a changed setting must be written')
    await store.destroy()
})

test('ephemeral observer rewrites after the cache entry expires', async () => {
    const store = new WaChatMetadataMemoryStore(30)
    const observe = createEphemeralObserver({
        logger: createNoopLogger(),
        chatMetadataStore: store
    })

    observe(ephemeralEvent(86_400, 1_751_808_692))
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.equal(await store.getChatMetadata('5511999999999@s.whatsapp.net'), null)

    observe(ephemeralEvent(86_400, 1_751_808_692))
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.ok(
        await store.getChatMetadata('5511999999999@s.whatsapp.net'),
        'an expired entry must be repopulated by the next inbound message'
    )
    await store.destroy()
})

test('ephemeral observer ignores groups and non-ephemeral chats', async () => {
    const store = new WaChatMetadataMemoryStore(60_000)
    const observe = createEphemeralObserver({
        logger: createNoopLogger(),
        chatMetadataStore: store
    })

    observe(ephemeralEvent(undefined, 1_751_808_692))
    observe({
        ...ephemeralEvent(86_400, 1_751_808_692),
        key: {
            ...baseEvent().key,
            remoteJid: '120363000000000000@g.us',
            isGroup: true
        }
    })
    await new Promise((resolve) => setTimeout(resolve, 10))

    assert.equal(await store.getChatMetadata('5511999999999@s.whatsapp.net'), null)
    assert.equal(await store.getChatMetadata('120363000000000000@g.us'), null)
    await store.destroy()
})

test('ephemeral observer collapses a concurrent burst into one store round-trip', async () => {
    let reads = 0
    let writes = 0
    const store = new WaChatMetadataMemoryStore(60_000)
    const counting = {
        getChatMetadata: async (jid: string) => {
            reads += 1
            await new Promise((resolve) => setTimeout(resolve, 5))
            return store.getChatMetadata(jid)
        },
        upsertChatMetadata: async (snapshot: never) => {
            writes += 1
            await store.upsertChatMetadata(snapshot)
        }
    }
    const observe = createEphemeralObserver({
        logger: createNoopLogger(),
        chatMetadataStore: counting as never
    })

    for (let i = 0; i < 5; i += 1) {
        observe(ephemeralEvent(86_400, 1_751_808_692))
    }
    await new Promise((resolve) => setTimeout(resolve, 50))

    assert.equal(reads, 1, 'a burst from one chat must share a single read')
    assert.equal(writes, 1)
    await store.destroy()
})
