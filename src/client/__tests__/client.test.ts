import assert from 'node:assert/strict'
import test from 'node:test'
import { gzipSync } from 'node:zlib'

import { parseDirtyBits } from '@client/dirty'
import { processHistorySyncNotification } from '@client/history-sync'
import type { WaClientOptions } from '@client/types'
import { WaClient } from '@client/WaClient'
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
    let messageCalls = 0
    let threadCalls = 0
    let contactCalls = 0

    await processHistorySyncNotification(
        {
            logger: createLogger(),
            mediaTransfer: {
                downloadAndDecrypt: async () => {
                    throw new Error('should not be called for inline payload')
                }
            } as never,
            writeBehind: {
                persistMessageAsync: async (record: unknown) => {
                    messageCalls += 1
                    messages.push(record)
                },
                persistThreadAsync: async (record: unknown) => {
                    threadCalls += 1
                    threads.push(record)
                },
                persistContactAsync: async (record: unknown) => {
                    contactCalls += 1
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
    assert.equal(messageCalls, 1)
    assert.equal(threadCalls, 1)
    assert.equal(contactCalls, 1)
    assert.equal(emitted.length, 1)
    assert.equal((emitted[0] as { messagesCount: number }).messagesCount, 1)
})

test('history sync processor does not emit chunk event when chunk persistence fails', async () => {
    const historySyncBytes = proto.HistorySync.encode({
        chunkOrder: 2,
        progress: 10,
        conversations: [
            {
                id: 'thread@s.whatsapp.net',
                messages: [
                    {
                        message: {
                            key: {
                                id: 'm-error',
                                fromMe: false
                            },
                            message: {
                                conversation: 'hello'
                            }
                        }
                    }
                ]
            }
        ]
    }).finish()
    const zipped = gzipSync(historySyncBytes)
    const emitted: unknown[] = []

    await assert.rejects(
        () =>
            processHistorySyncNotification(
                {
                    logger: createLogger(),
                    mediaTransfer: {
                        downloadAndDecrypt: async () => {
                            throw new Error('should not be called for inline payload')
                        }
                    } as never,
                    writeBehind: {
                        persistMessageAsync: async () => {
                            throw new Error('persist failed')
                        },
                        persistThreadAsync: async () => undefined,
                        persistContactAsync: async () => undefined
                    } as never,
                    emitEvent: (_event, payload) => {
                        emitted.push(payload)
                    }
                },
                {
                    syncType: proto.Message.HistorySyncType.RECENT,
                    initialHistBootstrapInlinePayload: zipped
                }
            ),
        /persist failed/
    )

    assert.equal(emitted.length, 0)
})

test('history sync processor forwards privacy token payloads and nct salt hooks', async () => {
    const historySyncBytes = proto.HistorySync.encode({
        chunkOrder: 3,
        progress: 20,
        conversations: [
            {
                id: '551100000000@s.whatsapp.net',
                tcToken: new Uint8Array([7, 8]),
                tcTokenTimestamp: 123,
                tcTokenSenderTimestamp: 456
            },
            {
                id: 'ignored@s.whatsapp.net'
            }
        ],
        nctSalt: new Uint8Array([9, 9, 9])
    }).finish()
    const zipped = gzipSync(historySyncBytes)

    const privacyTokenPayloads: unknown[] = []
    const nctSalts: Uint8Array[] = []

    await processHistorySyncNotification(
        {
            logger: createLogger(),
            mediaTransfer: {
                downloadAndDecrypt: async () => {
                    throw new Error('should not be called for inline payload')
                }
            } as never,
            writeBehind: {
                persistMessageAsync: async () => undefined,
                persistThreadAsync: async () => undefined,
                persistContactAsync: async () => undefined
            } as never,
            emitEvent: () => undefined,
            onPrivacyTokens: async (conversations) => {
                privacyTokenPayloads.push(conversations)
            },
            onNctSalt: async (salt) => {
                nctSalts.push(salt)
            }
        },
        {
            syncType: proto.Message.HistorySyncType.RECENT,
            initialHistBootstrapInlinePayload: zipped
        }
    )

    assert.equal(privacyTokenPayloads.length, 1)
    assert.deepEqual(privacyTokenPayloads[0], [
        {
            jid: '551100000000@s.whatsapp.net',
            tcToken: new Uint8Array([7, 8]),
            tcTokenTimestamp: 123,
            tcTokenSenderTimestamp: 456
        }
    ])
    assert.deepEqual(nctSalts, [new Uint8Array([9, 9, 9])])
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

function getClearStoredStateMethod() {
    return (
        WaClient.prototype as unknown as {
            readonly clearStoredState: (this: unknown) => Promise<void>
        }
    ).clearStoredState
}

function createClearStoredStateHarness(logoutStoreClear?: {
    readonly auth?: boolean
    readonly signal?: boolean
    readonly senderKey?: boolean
    readonly appState?: boolean
    readonly retry?: boolean
    readonly participants?: boolean
    readonly deviceList?: boolean
    readonly messages?: boolean
    readonly threads?: boolean
    readonly contacts?: boolean
    readonly privacyToken?: boolean
}) {
    const cleared: string[] = []
    const fakeClient = {
        options: {
            logoutStoreClear
        },
        pauseIncomingEventsAndWaitDrain: async () => undefined,
        writeBehind: {
            destroy: async () => ({ remaining: 0 })
        },
        receiptQueue: {
            take: () => []
        },
        logger: createLogger(),
        authClient: {
            clearStoredCredentials: async () => {
                cleared.push('auth')
            }
        },
        appStateStore: {
            clear: async () => {
                cleared.push('appState')
            }
        },
        contactStore: {
            clear: async () => {
                cleared.push('contacts')
            }
        },
        messageStore: {
            clear: async () => {
                cleared.push('messages')
            }
        },
        participantsStore: {
            clear: async () => {
                cleared.push('participants')
            }
        },
        deviceListStore: {
            clear: async () => {
                cleared.push('deviceList')
            }
        },
        retryStore: {
            clear: async () => {
                cleared.push('retry')
            }
        },
        signalStore: {
            clear: async () => {
                cleared.push('signal')
            }
        },
        senderKeyStore: {
            clear: async () => {
                cleared.push('senderKey')
            }
        },
        threadStore: {
            clear: async () => {
                cleared.push('threads')
            }
        },
        privacyTokenStore: {
            clear: async () => {
                cleared.push('privacyToken')
            }
        }
    }
    return { fakeClient, cleared }
}

test('clearStoredState clears every store domain by default', async () => {
    const { fakeClient, cleared } = createClearStoredStateHarness()
    await getClearStoredStateMethod().call(fakeClient)

    assert.deepEqual(cleared, [
        'auth',
        'appState',
        'contacts',
        'messages',
        'participants',
        'deviceList',
        'retry',
        'signal',
        'senderKey',
        'threads',
        'privacyToken'
    ])
})

test('clearStoredState respects logoutStoreClear domain toggles', async () => {
    const { fakeClient, cleared } = createClearStoredStateHarness({
        auth: false,
        appState: false,
        retry: false,
        privacyToken: false
    })
    await getClearStoredStateMethod().call(fakeClient)

    assert.deepEqual(cleared, [
        'contacts',
        'messages',
        'participants',
        'deviceList',
        'signal',
        'senderKey',
        'threads'
    ])
})
