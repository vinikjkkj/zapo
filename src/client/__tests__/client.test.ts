import assert from 'node:assert/strict'
import test from 'node:test'
import { gzipSync } from 'node:zlib'

import { parseDirtyBits } from '@client/events/dirty'
import { processHistorySyncNotification } from '@client/persistence/history-sync'
import type { WaClientOptions } from '@client/types'
import { WaClient } from '@client/WaClient'
import { buildWaClientDependencies, resolveWaClientBase } from '@client/WaClientFactory'
import { createNoopLogger } from '@infra/log/types'
import { proto } from '@proto'
import type { AbPropName } from '@protocol/abprops'
import { WaPrivacyTokenMemoryStore } from '@store/memory/privacy-token.store'
import type { BinaryNode } from '@transport/types'

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
        createNoopLogger()
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
            logger: createNoopLogger(),
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

test('history sync processor handles ON_DEMAND chunks (peer-data-operation response)', async () => {
    const historySyncBytes = proto.HistorySync.encode({
        chunkOrder: 0,
        progress: 100,
        conversations: [
            {
                id: 'thread@s.whatsapp.net',
                messages: [
                    {
                        message: {
                            key: { id: 'on-demand-msg', fromMe: false },
                            messageTimestamp: 200,
                            message: { conversation: 'older message' }
                        }
                    }
                ]
            }
        ]
    }).finish()
    const zipped = gzipSync(historySyncBytes)

    const emitted: { type: string; payload: unknown }[] = []
    await processHistorySyncNotification(
        {
            logger: createNoopLogger(),
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
            emitEvent: (type, payload) => {
                emitted.push({ type, payload })
            }
        },
        {
            syncType: proto.Message.HistorySyncType.ON_DEMAND,
            initialHistBootstrapInlinePayload: zipped
        }
    )

    assert.equal(emitted.length, 1)
    assert.equal(emitted[0].type, 'history_sync_chunk')
    const event = emitted[0].payload as {
        syncType: number
        messagesCount: number
        progress: number
    }
    assert.equal(event.syncType, proto.Message.HistorySyncType.ON_DEMAND)
    assert.equal(event.messagesCount, 1)
    assert.equal(event.progress, 100)
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
                    logger: createNoopLogger(),
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
            logger: createNoopLogger(),
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

test('history sync processor skips stub messages (system events)', async () => {
    const historySyncBytes = proto.HistorySync.encode({
        conversations: [
            {
                id: '120363000000000000@g.us',
                messages: [
                    {
                        message: {
                            key: { id: 'real-msg', fromMe: false },
                            messageTimestamp: 100,
                            message: { conversation: 'hello' }
                        }
                    },
                    {
                        message: {
                            key: { id: '3672884721', fromMe: true },
                            messageTimestamp: 101,
                            messageStubType: proto.WebMessageInfo.StubType.GROUP_PARTICIPANT_LEAVE,
                            messageStubParameters: ['someone@lid']
                        }
                    },
                    {
                        message: {
                            key: { id: 'real-msg-2', fromMe: false },
                            messageTimestamp: 102,
                            message: { conversation: 'world' }
                        }
                    }
                ]
            }
        ]
    }).finish()
    const zipped = gzipSync(historySyncBytes)

    const persistedIds: string[] = []
    const emitted: { type: string; payload: unknown }[] = []
    await processHistorySyncNotification(
        {
            logger: createNoopLogger(),
            mediaTransfer: {
                downloadAndDecrypt: async () => {
                    throw new Error('should not be called for inline payload')
                }
            } as never,
            writeBehind: {
                persistMessageAsync: async (record: { id: string }) => {
                    persistedIds.push(record.id)
                },
                persistThreadAsync: async () => undefined,
                persistContactAsync: async () => undefined
            } as never,
            emitEvent: (type, payload) => {
                emitted.push({ type, payload })
            }
        },
        {
            syncType: proto.Message.HistorySyncType.RECENT,
            initialHistBootstrapInlinePayload: zipped
        }
    )

    assert.deepEqual(persistedIds, ['real-msg', 'real-msg-2'])
    assert.equal(emitted.length, 1)
    assert.equal((emitted[0].payload as { messagesCount: number }).messagesCount, 2)
})

test('history sync processor persists phoneNumberToLidMappings as a single LID-canonical row per pair', async () => {
    const historySyncBytes = proto.HistorySync.encode({
        phoneNumberToLidMappings: [
            { pnJid: '5511999999999@s.whatsapp.net', lidJid: '111111111111111@lid' },
            { pnJid: '5511888888888@s.whatsapp.net', lidJid: '222222222222222@lid' },
            // invalid entries should be skipped
            { pnJid: '', lidJid: '333333333333333@lid' },
            { pnJid: '5511777777777@s.whatsapp.net', lidJid: '' }
        ]
    }).finish()
    const zipped = gzipSync(historySyncBytes)

    const contactWrites: Array<{ jid: string; lid?: string; phoneNumber?: string }> = []
    await processHistorySyncNotification(
        {
            logger: createNoopLogger(),
            mediaTransfer: {
                downloadAndDecrypt: async () => {
                    throw new Error('should not be called for inline payload')
                }
            } as never,
            writeBehind: {
                persistMessageAsync: async () => undefined,
                persistThreadAsync: async () => undefined,
                persistContactAsync: async (record: {
                    jid: string
                    lid?: string
                    phoneNumber?: string
                }) => {
                    contactWrites.push(record)
                }
            } as never,
            emitEvent: () => undefined
        },
        {
            syncType: proto.Message.HistorySyncType.NON_BLOCKING_DATA,
            initialHistBootstrapInlinePayload: zipped
        }
    )

    const mapped = contactWrites.map((w) => ({
        jid: w.jid,
        lid: w.lid,
        phoneNumber: w.phoneNumber
    }))
    assert.deepEqual(mapped, [
        { jid: '111111111111111@lid', lid: undefined, phoneNumber: '5511999999999@s.whatsapp.net' },
        { jid: '222222222222222@lid', lid: undefined, phoneNumber: '5511888888888@s.whatsapp.net' }
    ])
})

test('history sync processor coalesces pushname onto the LID-canonical row when a mapping is in the same chunk', async () => {
    const historySyncBytes = proto.HistorySync.encode({
        phoneNumberToLidMappings: [
            { pnJid: '5511999999999@s.whatsapp.net', lidJid: '111111111111111@lid' }
        ],
        pushnames: [
            { id: '5511999999999@s.whatsapp.net', pushname: 'Vinicius' },
            // pushname without matching mapping: keeps PN-form jid
            { id: '5511888888888@s.whatsapp.net', pushname: 'Other' }
        ]
    }).finish()
    const zipped = gzipSync(historySyncBytes)

    const contactWrites: Array<{
        jid: string
        pushName?: string
        phoneNumber?: string
        lid?: string
    }> = []
    await processHistorySyncNotification(
        {
            logger: createNoopLogger(),
            mediaTransfer: {
                downloadAndDecrypt: async () => {
                    throw new Error('should not be called for inline payload')
                }
            } as never,
            writeBehind: {
                persistMessageAsync: async () => undefined,
                persistThreadAsync: async () => undefined,
                persistContactAsync: async (record: {
                    jid: string
                    pushName?: string
                    phoneNumber?: string
                    lid?: string
                }) => {
                    contactWrites.push(record)
                }
            } as never,
            emitEvent: () => undefined
        },
        {
            syncType: proto.Message.HistorySyncType.PUSH_NAME,
            initialHistBootstrapInlinePayload: zipped
        }
    )

    const mappedPushname = contactWrites.find(
        (w) => w.jid === '111111111111111@lid' && w.pushName === 'Vinicius'
    )
    assert.ok(mappedPushname, 'pushname for the mapped PN should land on the LID-canonical row')
    assert.equal(mappedPushname.phoneNumber, '5511999999999@s.whatsapp.net')

    const unmappedPushname = contactWrites.find(
        (w) => w.jid === '5511888888888@s.whatsapp.net' && w.pushName === 'Other'
    )
    assert.ok(unmappedPushname, 'pushname without a mapping should fall back to the PN-form jid')
    assert.equal(unmappedPushname.phoneNumber, undefined)

    // No PN-form row is written for the mapped pair (would create the duplicate we are fixing).
    const pnFormDuplicate = contactWrites.find((w) => w.jid === '5511999999999@s.whatsapp.net')
    assert.equal(pnFormDuplicate, undefined)
})

test('history sync processor invokes onProcessed after handled chunk (for hist_sync receipt)', async () => {
    const historySyncBytes = proto.HistorySync.encode({
        conversations: [{ id: 'thread@s.whatsapp.net' }]
    }).finish()
    const zipped = gzipSync(historySyncBytes)

    const ackedSyncTypes: number[] = []
    await processHistorySyncNotification(
        {
            logger: createNoopLogger(),
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
            onProcessed: async (syncType) => {
                ackedSyncTypes.push(syncType)
            }
        },
        {
            syncType: proto.Message.HistorySyncType.RECENT,
            initialHistBootstrapInlinePayload: zipped
        }
    )

    assert.deepEqual(ackedSyncTypes, [proto.Message.HistorySyncType.RECENT])
})

test('history sync processor invokes onProcessed for INITIAL_STATUS_V3 (recognized but unhandled)', async () => {
    const ackedSyncTypes: number[] = []
    await processHistorySyncNotification(
        {
            logger: createNoopLogger(),
            mediaTransfer: {
                downloadAndDecrypt: async () => {
                    throw new Error('should not be called - status_v3 is skipped before download')
                }
            } as never,
            writeBehind: {
                persistMessageAsync: async () => undefined,
                persistThreadAsync: async () => undefined,
                persistContactAsync: async () => undefined
            } as never,
            emitEvent: () => undefined,
            onProcessed: async (syncType) => {
                ackedSyncTypes.push(syncType)
            }
        },
        {
            syncType: proto.Message.HistorySyncType.INITIAL_STATUS_V3
        }
    )

    assert.deepEqual(ackedSyncTypes, [proto.Message.HistorySyncType.INITIAL_STATUS_V3])
})

test('history sync processor does NOT invoke onProcessed when syncType is null', async () => {
    const ackedSyncTypes: number[] = []
    await processHistorySyncNotification(
        {
            logger: createNoopLogger(),
            mediaTransfer: { downloadAndDecrypt: async () => new Uint8Array() } as never,
            writeBehind: {
                persistMessageAsync: async () => undefined,
                persistThreadAsync: async () => undefined,
                persistContactAsync: async () => undefined
            } as never,
            emitEvent: () => undefined,
            onProcessed: async (syncType) => {
                ackedSyncTypes.push(syncType)
            }
        },
        {} as never
    )
    assert.deepEqual(ackedSyncTypes, [])
})

test('history sync processor handles NON_BLOCKING_DATA syncType (previously skipped)', async () => {
    const historySyncBytes = proto.HistorySync.encode({
        conversations: [
            {
                id: '120363000000000000@g.us',
                name: 'Past Group'
            }
        ],
        phoneNumberToLidMappings: [
            { pnJid: '5511999999999@s.whatsapp.net', lidJid: '111111111111111@lid' }
        ]
    }).finish()
    const zipped = gzipSync(historySyncBytes)

    const threadWrites: Array<{ jid: string }> = []
    const contactWrites: Array<{ jid: string }> = []
    const emitted: { type: string; payload: unknown }[] = []
    await processHistorySyncNotification(
        {
            logger: createNoopLogger(),
            mediaTransfer: {
                downloadAndDecrypt: async () => {
                    throw new Error('should not be called for inline payload')
                }
            } as never,
            writeBehind: {
                persistMessageAsync: async () => undefined,
                persistThreadAsync: async (record: { jid: string }) => {
                    threadWrites.push(record)
                },
                persistContactAsync: async (record: { jid: string }) => {
                    contactWrites.push(record)
                }
            } as never,
            emitEvent: (type, payload) => {
                emitted.push({ type, payload })
            }
        },
        {
            syncType: proto.Message.HistorySyncType.NON_BLOCKING_DATA,
            initialHistBootstrapInlinePayload: zipped
        }
    )

    assert.equal(threadWrites.length, 1)
    assert.equal(threadWrites[0].jid, '120363000000000000@g.us')
    // One canonical (LID-form) contact row per mapping, not the legacy pair of mirror rows.
    assert.equal(contactWrites.length, 1)
    assert.equal(contactWrites[0].jid, '111111111111111@lid')
    assert.equal(emitted.length, 1)
    assert.equal(emitted[0].type, 'history_sync_chunk')
    assert.equal(
        (emitted[0].payload as { syncType: number }).syncType,
        proto.Message.HistorySyncType.NON_BLOCKING_DATA
    )
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

    assert.throws(() => resolveWaClientBase(invalidWs, createNoopLogger()), /proxy\.ws/)
    assert.throws(
        () => resolveWaClientBase(invalidMediaUpload, createNoopLogger()),
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
        () => resolveWaClientBase(invalidProxyPrimitive, createNoopLogger()),
        /proxy must be an object/
    )
    assert.throws(
        () => resolveWaClientBase(invalidProxyArray, createNoopLogger()),
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

    assert.doesNotThrow(() => resolveWaClientBase(options, createNoopLogger()))
})

test('buildWaClientDependencies wires privacy coordinator', () => {
    const sessionStore = {
        auth: {} as never,
        signal: {} as never,
        senderKey: {} as never,
        appState: {} as never,
        messages: {} as never,
        threads: {} as never,
        contacts: {} as never,
        retry: {} as never,
        groupMetadata: {} as never,
        deviceList: {} as never,
        privacyToken: {} as never
    }
    const options = {
        store: {
            session: () => sessionStore
        },
        sessionId: 'session'
    } as unknown as WaClientOptions

    const base = resolveWaClientBase(options, createNoopLogger())
    const runtime = {
        sendNode: async (_node: BinaryNode) => undefined,
        query: async (_node: BinaryNode) =>
            ({ tag: 'iq', attrs: { type: 'result' } }) as BinaryNode,
        queryWithContext: async (_context: string, _node: BinaryNode) =>
            ({ tag: 'iq', attrs: { type: 'result' } }) as BinaryNode,
        syncAppState: async () => undefined,
        syncAppStateWithOptions: async () => ({ collections: [] }) as never,
        emitEvent: (() => undefined) as never,
        handleIncomingMessageEvent: async () => undefined,
        handleError: (_error: Error) => undefined,
        handleIncomingFrame: async (_frame: Uint8Array) => undefined,
        clearStoredState: async () => undefined,
        resumeIncomingEvents: () => undefined,
        subscribeProtocolMessage: () => () => undefined
    }

    const dependencies = buildWaClientDependencies({ base, runtime })
    assert.equal(typeof dependencies.privacyCoordinator.getPrivacySettings, 'function')
})

test('buildWaClientDependencies wires trusted contact token AB prop overrides', () => {
    const sessionStore = {
        auth: {} as never,
        signal: {} as never,
        senderKey: {} as never,
        appState: {} as never,
        messages: {} as never,
        threads: {} as never,
        contacts: {} as never,
        retry: {} as never,
        groupMetadata: {} as never,
        deviceList: {} as never,
        privacyToken: new WaPrivacyTokenMemoryStore()
    }
    const options = {
        store: {
            session: () => sessionStore
        },
        sessionId: 'session'
    } as unknown as WaClientOptions

    const base = resolveWaClientBase(options, createNoopLogger())
    const runtime = {
        sendNode: async (_node: BinaryNode) => undefined,
        query: async (_node: BinaryNode) =>
            ({ tag: 'iq', attrs: { type: 'result' } }) as BinaryNode,
        queryWithContext: async (_context: string, _node: BinaryNode) =>
            ({ tag: 'iq', attrs: { type: 'result' } }) as BinaryNode,
        syncAppState: async () => undefined,
        syncAppStateWithOptions: async () => ({ collections: [] }) as never,
        emitEvent: (() => undefined) as never,
        handleIncomingMessageEvent: async () => undefined,
        handleError: (_error: Error) => undefined,
        handleIncomingFrame: async (_frame: Uint8Array) => undefined,
        clearStoredState: async () => undefined,
        resumeIncomingEvents: () => undefined,
        subscribeProtocolMessage: () => () => undefined
    }

    const dependencies = buildWaClientDependencies({ base, runtime })
    const originalGetConfigValue = dependencies.abPropsCoordinator.getConfigValue.bind(
        dependencies.abPropsCoordinator
    )
    dependencies.abPropsCoordinator.getConfigValue = ((name: AbPropName) => {
        switch (name) {
            case 'tctoken_duration':
                return 60 as never
            case 'tctoken_num_buckets':
                return 2 as never
            case 'tctoken_duration_sender':
                return 120 as never
            case 'tctoken_num_buckets_sender':
                return 4 as never
            default:
                return originalGetConfigValue(name as never)
        }
    }) as never

    const config = (
        dependencies.trustedContactToken as unknown as {
            resolveConfig(): {
                readonly durationS: number
                readonly numBuckets: number
                readonly senderDurationS: number
                readonly senderNumBuckets: number
            }
        }
    ).resolveConfig()

    assert.equal(config.durationS, 60)
    assert.equal(config.numBuckets, 2)
    assert.equal(config.senderDurationS, 120)
    assert.equal(config.senderNumBuckets, 4)
})

test('default option resolution: autoDecrypt on, history on, markOnlineOnConnect off', () => {
    const opts: WaClientOptions = { store: {} as never, sessionId: 's' }

    assert.equal(opts.addons?.autoDecrypt !== false, true)
    assert.equal(opts.history?.enabled !== false, true)
    assert.equal(opts.markOnlineOnConnect ?? false, false)

    const optedOut: WaClientOptions = {
        store: {} as never,
        sessionId: 's',
        addons: { autoDecrypt: false },
        history: { enabled: false },
        markOnlineOnConnect: true
    }
    assert.equal(optedOut.addons?.autoDecrypt !== false, false)
    assert.equal(optedOut.history?.enabled !== false, false)
    assert.equal(optedOut.markOnlineOnConnect ?? false, true)
})

function getClearStoredStateMethod() {
    return (
        WaClient.prototype as unknown as {
            readonly clearStoredState: (this: unknown) => Promise<void>
        }
    ).clearStoredState
}

function getCoordinatorGetterMethod(name: 'chat' | 'group' | 'privacy') {
    const descriptor = Object.getOwnPropertyDescriptor(WaClient.prototype, name)
    if (!descriptor?.get) {
        throw new Error(`expected WaClient.${name} getter`)
    }
    return descriptor.get as (this: unknown) => unknown
}

function createClearStoredStateHarness(logoutStoreClear?: {
    readonly auth?: boolean
    readonly signal?: boolean
    readonly senderKey?: boolean
    readonly appState?: boolean
    readonly retry?: boolean
    readonly groupMetadata?: boolean
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
        logger: createNoopLogger(),
        deps: {
            receiptQueue: {
                take: () => []
            },
            authClient: {
                clearStoredCredentials: async () => {
                    cleared.push('auth')
                }
            }
        },
        stores: {
            appState: {
                clear: async () => {
                    cleared.push('appState')
                }
            },
            contacts: {
                clear: async () => {
                    cleared.push('contacts')
                }
            },
            messages: {
                clear: async () => {
                    cleared.push('messages')
                }
            },
            groupMetadata: {
                clear: async () => {
                    cleared.push('groupMetadata')
                }
            },
            deviceList: {
                clear: async () => {
                    cleared.push('deviceList')
                }
            },
            retry: {
                clear: async () => {
                    cleared.push('retry')
                }
            },
            signal: {
                clear: async () => {
                    cleared.push('signal')
                }
            },
            preKey: {
                clear: async () => {
                    cleared.push('preKey')
                }
            },
            session: {
                clear: async () => {
                    cleared.push('session')
                }
            },
            identity: {
                clear: async () => {
                    cleared.push('identity')
                }
            },
            senderKey: {
                clear: async () => {
                    cleared.push('senderKey')
                }
            },
            threads: {
                clear: async () => {
                    cleared.push('threads')
                }
            },
            privacyToken: {
                clear: async () => {
                    cleared.push('privacyToken')
                }
            },
            messageSecret: {
                clear: async () => {
                    cleared.push('messageSecret')
                }
            }
        }
    }
    return { fakeClient, cleared }
}

test('clearStoredState clears non-mailbox domains by default and preserves mailbox archive', async () => {
    const { fakeClient, cleared } = createClearStoredStateHarness()
    await getClearStoredStateMethod().call(fakeClient)

    assert.deepEqual(cleared, [
        'auth',
        'appState',
        'messageSecret',
        'groupMetadata',
        'deviceList',
        'retry',
        'signal',
        'preKey',
        'session',
        'identity',
        'senderKey',
        'privacyToken'
    ])
})

test('clearStoredState wipes mailbox when explicitly opted in', async () => {
    const { fakeClient, cleared } = createClearStoredStateHarness({
        messages: true,
        threads: true,
        contacts: true
    })
    await getClearStoredStateMethod().call(fakeClient)

    assert.ok(cleared.includes('messages'))
    assert.ok(cleared.includes('threads'))
    assert.ok(cleared.includes('contacts'))
})

test('WaClient exposes chat/group/privacy coordinator getters', () => {
    const chatCoordinator = { flushMutations: async () => undefined }
    const groupCoordinator = { queryGroupMetadata: async () => ({}) }
    const privacyCoordinator = { getPrivacySettings: async () => ({}) }
    const fakeClient = {
        deps: {
            chatCoordinator,
            groupCoordinator,
            privacyCoordinator
        }
    }

    assert.equal(getCoordinatorGetterMethod('chat').call(fakeClient), chatCoordinator)
    assert.equal(getCoordinatorGetterMethod('group').call(fakeClient), groupCoordinator)
    assert.equal(getCoordinatorGetterMethod('privacy').call(fakeClient), privacyCoordinator)
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
        'messageSecret',
        'groupMetadata',
        'deviceList',
        'signal',
        'preKey',
        'session',
        'identity',
        'senderKey'
    ])
})

test('uploadNewsletterMedia builds plaintext URL and parses response', async () => {
    const { uploadNewsletterMedia } = await import('@client/newsletter/content')
    const captured: { url?: string; method?: string; body?: Uint8Array } = {}
    const responseBody = new TextEncoder().encode(
        JSON.stringify({
            url: 'https://media.example/blob',
            direct_path: '/v/abc/def',
            handle: 'HANDLE-1',
            metadata_url: 'https://meta.example/m'
        })
    )
    const mediaTransfer = {
        uploadStream: async (request: { url: string; method?: string; body: Uint8Array }) => {
            captured.url = request.url
            captured.method = request.method
            captured.body = request.body
            return {
                url: request.url,
                status: 200,
                ok: true,
                headers: {},
                body: null
            }
        },
        readResponseBytes: async () => responseBody
    } as unknown as Parameters<typeof uploadNewsletterMedia>[0]['mediaTransfer']

    const result = await uploadNewsletterMedia(
        { mediaTransfer, logger: createNoopLogger() },
        {
            mediaKind: 'image',
            media: new Uint8Array([1, 2, 3, 4]),
            mimetype: 'image/jpeg',
            mediaConn: {
                auth: 'AUTH-TOKEN',
                expiresAtMs: Date.now() + 60_000,
                hosts: [{ hostname: 'mmg.whatsapp.net', isFallback: false }]
            }
        }
    )

    assert.ok(captured.url)
    assert.match(
        captured.url ?? '',
        /^https:\/\/mmg\.whatsapp\.net\/newsletter\/newsletter-image\//
    )
    assert.match(captured.url ?? '', /\?auth=AUTH-TOKEN&token=/)
    assert.equal(captured.method, 'POST')
    assert.deepEqual(captured.body, new Uint8Array([1, 2, 3, 4]))
    assert.equal(result.url, 'https://media.example/blob')
    assert.equal(result.directPath, '/v/abc/def')
    assert.equal(result.handle, 'HANDLE-1')
    assert.equal(result.metadataUrl, 'https://meta.example/m')
    assert.equal(result.fileLength, 4)
    assert.equal(result.fileSha256.byteLength, 32)
})
