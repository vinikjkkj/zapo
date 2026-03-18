import assert from 'node:assert/strict'
import test from 'node:test'
import { gzipSync } from 'node:zlib'

import { parseDirtyBits } from '@client/dirty'
import { processHistorySyncNotification } from '@client/history-sync'
import type { WaClientOptions } from '@client/types'
import { resolveWaClientBase } from '@client/WaClientFactory'
import type { Logger } from '@infra/log/types'
import { proto } from '@proto'

function createLogger(): Logger {
    return {
        level: 'trace',
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
    }
}

test('parseDirtyBits filters invalid entries and preserves protocols', () => {
    const parsed = parseDirtyBits(
        [
            {
                tag: 'dirty',
                attrs: { type: 'account_sync', timestamp: '10' },
                content: [
                    { tag: 'devices', attrs: {} },
                    { tag: 'privacy', attrs: {} }
                ]
            },
            {
                tag: 'dirty',
                attrs: { type: '', timestamp: 'x' }
            }
        ],
        createLogger()
    )

    assert.equal(parsed.length, 1)
    assert.equal(parsed[0].type, 'account_sync')
    assert.deepEqual(parsed[0].protocols, ['devices', 'privacy'])
})

test('history sync processor persists conversations and emits chunk event', async () => {
    const historySyncBytes = proto.HistorySync.encode({
        chunkOrder: 1,
        progress: 50,
        conversations: [
            {
                id: 'thread@s.whatsapp.net',
                name: 'Thread',
                messages: [
                    {
                        message: {
                            key: {
                                id: 'm1',
                                fromMe: false,
                                participant: 'sender@s.whatsapp.net'
                            },
                            messageTimestamp: 100,
                            message: {
                                conversation: 'hello'
                            }
                        }
                    }
                ]
            }
        ],
        pushnames: [{ id: 'sender@s.whatsapp.net', pushname: 'Sender' }]
    }).finish()

    const zipped = gzipSync(historySyncBytes)

    const messages: unknown[] = []
    const threads: unknown[] = []
    const contacts: unknown[] = []
    const emitted: unknown[] = []

    await processHistorySyncNotification(
        {
            logger: createLogger(),
            mediaTransfer: {
                downloadAndDecrypt: async () => {
                    throw new Error('should not be called for inline payload')
                }
            } as never,
            messageStore: {
                upsert: async (record: unknown) => {
                    messages.push(record)
                }
            } as never,
            threadStore: {
                upsert: async (record: unknown) => {
                    threads.push(record)
                }
            } as never,
            contactStore: {
                upsert: async (record: unknown) => {
                    contacts.push(record)
                }
            } as never,
            emitEvent: (_event, payload) => {
                emitted.push(payload)
            }
        },
        {
            syncType: proto.Message.HistorySyncType.RECENT,
            initialHistBootstrapInlinePayload: zipped
        }
    )

    assert.equal(messages.length, 1)
    assert.equal(threads.length, 1)
    assert.equal(contacts.length, 1)
    assert.equal(emitted.length, 1)
    assert.equal((emitted[0] as { messagesCount: number }).messagesCount, 1)
})

test('resolveWaClientBase rejects invalid proxy transport shapes', () => {
    const minimalStore = {
        session: () => ({})
    }
    const invalidWs = {
        store: minimalStore,
        sessionId: 'session',
        proxy: {
            ws: {} as never
        }
    } as unknown as WaClientOptions
    const invalidMediaUpload = {
        store: minimalStore,
        sessionId: 'session',
        proxy: {
            mediaUpload: {} as never
        }
    } as unknown as WaClientOptions

    assert.throws(() => resolveWaClientBase(invalidWs, createLogger()), /proxy\.ws/)
    assert.throws(
        () => resolveWaClientBase(invalidMediaUpload, createLogger()),
        /proxy\.mediaUpload/
    )
})

test('resolveWaClientBase rejects invalid proxy root shapes', () => {
    const minimalStore = {
        session: () => ({})
    }
    const invalidProxyPrimitive = {
        store: minimalStore,
        sessionId: 'session',
        proxy: true as never
    } as unknown as WaClientOptions
    const invalidProxyArray = {
        store: minimalStore,
        sessionId: 'session',
        proxy: ['http://proxy'] as never
    } as unknown as WaClientOptions

    assert.throws(
        () => resolveWaClientBase(invalidProxyPrimitive, createLogger()),
        /proxy must be an object/
    )
    assert.throws(
        () => resolveWaClientBase(invalidProxyArray, createLogger()),
        /proxy must be an object/
    )
})

test('resolveWaClientBase accepts proxy agent shapes', () => {
    const minimalStore = {
        session: () => ({})
    }
    const options = {
        store: minimalStore,
        sessionId: 'session',
        proxy: {
            ws: {
                addRequest: () => undefined
            },
            mediaUpload: {
                addRequest: () => undefined
            },
            mediaDownload: {
                addRequest: () => undefined
            }
        }
    } as unknown as WaClientOptions

    assert.doesNotThrow(() => resolveWaClientBase(options, createLogger()))
})
