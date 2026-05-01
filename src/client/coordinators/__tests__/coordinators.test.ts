import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaAppStateMutationInput, WaAppStateSyncResult } from '@appstate/types'
import { WaAppStateMutationCoordinator } from '@client/coordinators/WaAppStateMutationCoordinator'
import { WaIncomingNodeCoordinator } from '@client/coordinators/WaIncomingNodeCoordinator'
import { WaMessageDispatchCoordinator } from '@client/coordinators/WaMessageDispatchCoordinator'
import { WaPassiveTasksCoordinator } from '@client/coordinators/WaPassiveTasksCoordinator'
import { createStreamControlHandler } from '@client/coordinators/WaStreamControlCoordinator'
import { createGroupParticipantsCache } from '@client/messaging/participants'
import type { WaGroupEvent, WaGroupEventAction } from '@client/types'
import type { Logger } from '@infra/log/types'
import {
    WA_APP_STATE_COLLECTION_STATES,
    WA_CONNECTION_REASONS,
    WA_DISCONNECT_REASONS,
    WA_STREAM_SIGNALING
} from '@protocol/constants'
import { WaMessageMemoryStore } from '@store/providers/memory/message.store'
import { WaParticipantsMemoryStore } from '@store/providers/memory/participants.store'
import type { BinaryNode } from '@transport/types'

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

function createIncomingRuntime() {
    const unhandled: unknown[] = []
    return {
        runtime: {
            handleStreamControlResult: async () => undefined,
            persistSuccessAttributes: async () => undefined,
            emitSuccessNode: () => undefined,
            updateClockSkewFromSuccess: () => undefined,
            shouldWarmupMediaConn: () => false,
            warmupMediaConn: async () => undefined,
            persistRoutingInfo: async () => undefined,
            tryResolvePendingNode: () => false,
            handleGenericIncomingNode: async () => false,
            handleIncomingIqSetNode: async () => false,
            handleLinkCodeNotificationNode: async () => false,
            handleCompanionRegRefreshNotificationNode: async () => false,
            handleIncomingMessageNode: async () => false,
            sendNode: async () => undefined,
            handleIncomingRetryReceipt: async () => undefined,
            trackOutboundReceipt: async () => undefined,
            emitIncomingReceipt: () => undefined,
            emitIncomingPresence: () => undefined,
            emitIncomingChatstate: () => undefined,
            emitIncomingCall: () => undefined,
            emitIncomingFailure: () => undefined,
            emitIncomingErrorStanza: () => undefined,
            emitIncomingNotification: () => undefined,
            emitGroupEvent: () => undefined,
            emitUnhandledIncomingNode: (event: unknown) => {
                unhandled.push(event)
            },
            syncAppState: async () => undefined,
            stopComms: () => undefined,
            disconnect: async () => undefined,
            clearStoredCredentials: async () => undefined,
            parseDirtyBits: () => [],
            handleDirtyBits: async () => undefined
        },
        unhandled
    }
}

function createGroupEvent(input: {
    readonly action: WaGroupEventAction
    readonly groupJid?: string
    readonly contextGroupJid?: string
    readonly authorJid?: string
    readonly participants?: readonly string[]
}): WaGroupEvent {
    return {
        rawNode: {
            tag: 'notification',
            attrs: {}
        },
        rawActionNode: {
            tag: input.action,
            attrs: {}
        },
        action: input.action,
        groupJid: input.groupJid,
        contextGroupJid: input.contextGroupJid,
        authorJid: input.authorJid,
        participants: input.participants?.map((jid) => ({ jid }))
    }
}

function createMessageDispatchCoordinator(
    participantsStore: WaParticipantsMemoryStore,
    overrides?: {
        readonly getCurrentMeJid?: () => string | null
        readonly mobileMessageIdFormat?: boolean
    }
): WaMessageDispatchCoordinator {
    const participantsCache = createGroupParticipantsCache({
        participantsStore,
        queryGroupParticipantJids: async () => [],
        logger: createLogger()
    })

    return new WaMessageDispatchCoordinator({
        logger: createLogger(),
        messageClient: {} as never,
        retryTracker: {} as never,
        sessionResolver: {} as never,
        fanoutResolver: {} as never,
        participantsCache,
        appStateSyncKeyProtocol: {} as never,
        buildMessageContent: async () => ({}),
        senderKeyManager: {} as never,
        signalProtocol: {} as never,
        signalStore: {} as never,
        sessionStore: {} as never,
        identityStore: {} as never,
        deviceListStore: {} as never,
        messageSecretStore: {
            set: async (_id: string, _entry: { secret: Uint8Array; senderJid: string }) => {}
        } as never,
        getCurrentMeJid: overrides?.getCurrentMeJid ?? (() => null),
        getCurrentMeLid: () => null,
        getCurrentSignedIdentity: () => null,
        resolvePrivacyTokenNode: async () => null,
        onDirectMessageSent: () => undefined,
        mobileMessageIdFormat: overrides?.mobileMessageIdFormat
    })
}

function buildAppStateSyncResult(
    pendingMutations: readonly WaAppStateMutationInput[],
    state: WaAppStateSyncResult['collections'][number]['state']
): WaAppStateSyncResult {
    const collections = [...new Set(pendingMutations.map((mutation) => mutation.collection))].map(
        (collection) => ({
            collection,
            state
        })
    )
    return { collections }
}

test('incoming node coordinator supports dynamic handler registration and unregistration', async () => {
    const { runtime, unhandled } = createIncomingRuntime()
    const coordinator = new WaIncomingNodeCoordinator({
        logger: createLogger(),
        runtime,
        offlineResume: {
            trackOfflineStanza() {},
            handleOfflinePreview() {},
            handleOfflineComplete() {},
            reset() {},
            isComplete: false,
            isResuming: false
        } as never
    })

    let handledCount = 0
    const handler = async () => {
        handledCount += 1
        return true
    }

    const unregister = coordinator.registerIncomingHandler({
        tag: 'custom',
        handler
    })

    await coordinator.handleIncomingNode({ tag: 'custom', attrs: {} })
    assert.equal(handledCount, 1)

    unregister()
    await coordinator.handleIncomingNode({ tag: 'custom', attrs: {} })
    assert.equal(handledCount, 1)
    assert.equal(unhandled.length, 1)
})

test('incoming node coordinator tracks offline stanzas before dispatching handlers', async () => {
    const { runtime, unhandled } = createIncomingRuntime()
    let trackedStanzas = 0
    const coordinator = new WaIncomingNodeCoordinator({
        logger: createLogger(),
        runtime,
        offlineResume: {
            trackOfflineStanza() {
                trackedStanzas += 1
            },
            handleOfflinePreview() {},
            handleOfflineComplete() {},
            reset() {},
            isComplete: false,
            isResuming: false
        } as never
    })

    await coordinator.handleIncomingNode({
        tag: 'custom',
        attrs: { offline: '1' }
    })

    assert.equal(trackedStanzas, 1)
    assert.equal(unhandled.length, 1)
})

test('incoming node coordinator emits info bulletin notifications and forwards offline resume hooks', async () => {
    const notifications: unknown[] = []
    const { runtime: baseRuntime } = createIncomingRuntime()
    const runtime = {
        ...baseRuntime,
        emitIncomingNotification: (event: unknown) => {
            notifications.push(event)
        }
    }

    const previewCounts: number[] = []
    let offlineCompleteCalls = 0
    const coordinator = new WaIncomingNodeCoordinator({
        logger: createLogger(),
        runtime,
        offlineResume: {
            trackOfflineStanza() {},
            handleOfflinePreview(stanzaCount: number) {
                previewCounts.push(stanzaCount)
            },
            handleOfflineComplete() {
                offlineCompleteCalls += 1
            },
            reset() {},
            isComplete: false,
            isResuming: false
        } as never
    })

    await coordinator.handleIncomingNode({
        tag: 'ib',
        attrs: {
            id: 'ib-1',
            from: 's.whatsapp.net'
        },
        content: [
            {
                tag: 'offline_preview',
                attrs: {
                    count: '5',
                    message: '3',
                    t: '123'
                }
            },
            {
                tag: 'offline',
                attrs: {
                    count: '5'
                }
            }
        ]
    })

    assert.deepEqual(previewCounts, [5])
    assert.equal(offlineCompleteCalls, 1)
    assert.equal(notifications.length, 2)
    assert.deepEqual(notifications[0], {
        rawNode: {
            tag: 'ib',
            attrs: {
                id: 'ib-1',
                from: 's.whatsapp.net'
            },
            content: [
                {
                    tag: 'offline_preview',
                    attrs: {
                        count: '5',
                        message: '3',
                        t: '123'
                    }
                },
                {
                    tag: 'offline',
                    attrs: {
                        count: '5'
                    }
                }
            ]
        },
        stanzaId: 'ib-1',
        chatJid: 's.whatsapp.net',
        stanzaType: undefined,
        notificationType: 'ib.offline_preview',
        classification: 'info_bulletin',
        details: {
            count: 5,
            message: 3,
            receipt: undefined,
            notification: undefined,
            t: 123
        }
    })
    assert.deepEqual(notifications[1], {
        rawNode: {
            tag: 'ib',
            attrs: {
                id: 'ib-1',
                from: 's.whatsapp.net'
            },
            content: [
                {
                    tag: 'offline_preview',
                    attrs: {
                        count: '5',
                        message: '3',
                        t: '123'
                    }
                },
                {
                    tag: 'offline',
                    attrs: {
                        count: '5'
                    }
                }
            ]
        },
        stanzaId: 'ib-1',
        chatJid: 's.whatsapp.net',
        stanzaType: undefined,
        notificationType: 'ib.offline',
        classification: 'info_bulletin',
        details: {
            count: 5,
            message: undefined,
            receipt: undefined,
            notification: undefined,
            t: undefined
        }
    })
})

test('stream control handler runs force-login and resume flows', async () => {
    const calls: string[] = []
    const disconnectCalls: Array<{
        readonly reason: string
        readonly isLogout: boolean
        readonly code: number | null
    }> = []
    const connectCalls: string[] = []
    const handler = createStreamControlHandler({
        logger: createLogger(),
        getComms: () =>
            ({
                stopComms: async () => {
                    calls.push('stopComms')
                },
                closeSocketAndResume: async () => {
                    calls.push('resume')
                }
            }) as never,
        clearPendingQueries: () => {
            calls.push('clear_pending')
        },
        clearMediaConnCache: () => {
            calls.push('clear_media')
        },
        disconnect: async (reason, isLogout, code) => {
            calls.push('disconnect')
            disconnectCalls.push({ reason, isLogout, code })
        },
        clearStoredCredentials: async () => {
            calls.push('clear_credentials')
        },
        connect: async (reason) => {
            calls.push('connect')
            connectCalls.push(reason)
        }
    })

    await handler.handleStreamControlResult({
        kind: 'stream_error_code',
        code: WA_STREAM_SIGNALING.FORCE_LOGIN_CODE
    })

    assert.deepEqual(calls, ['stopComms', 'disconnect', 'clear_credentials', 'connect'])
    assert.deepEqual(disconnectCalls, [
        {
            reason: WA_DISCONNECT_REASONS.STREAM_ERROR_FORCE_LOGIN,
            isLogout: true,
            code: WA_STREAM_SIGNALING.FORCE_LOGIN_CODE
        }
    ])
    assert.deepEqual(connectCalls, [WA_CONNECTION_REASONS.RECONNECTED])

    calls.length = 0
    disconnectCalls.length = 0
    connectCalls.length = 0
    await handler.handleStreamControlResult({
        kind: 'stream_error_code',
        code: 500
    })

    assert.deepEqual(calls, ['clear_pending', 'clear_media', 'resume'])
    assert.deepEqual(disconnectCalls, [])
    assert.deepEqual(connectCalls, [])
})

test('stream control handler handles force-logout, replaced and device-removed flows', async () => {
    const calls: string[] = []
    const disconnectCalls: Array<{
        readonly reason: string
        readonly isLogout: boolean
        readonly code: number | null
    }> = []
    const connectCalls: string[] = []
    let clearCredentialsCalls = 0
    const handler = createStreamControlHandler({
        logger: createLogger(),
        getComms: () =>
            ({
                stopComms: async () => {
                    calls.push('stopComms')
                },
                closeSocketAndResume: async () => {
                    calls.push('resume')
                }
            }) as never,
        clearPendingQueries: () => {
            calls.push('clear_pending')
        },
        clearMediaConnCache: () => {
            calls.push('clear_media')
        },
        disconnect: async (reason, isLogout, code) => {
            calls.push('disconnect')
            disconnectCalls.push({ reason, isLogout, code })
        },
        clearStoredCredentials: async () => {
            calls.push('clear_credentials')
            clearCredentialsCalls += 1
        },
        connect: async (reason) => {
            calls.push('connect')
            connectCalls.push(reason)
        }
    })

    await handler.handleStreamControlResult({
        kind: 'stream_error_code',
        code: WA_STREAM_SIGNALING.FORCE_LOGOUT_CODE
    })
    assert.deepEqual(calls, ['stopComms', 'disconnect', 'clear_credentials', 'connect'])
    assert.deepEqual(disconnectCalls, [
        {
            reason: WA_DISCONNECT_REASONS.STREAM_ERROR_FORCE_LOGOUT,
            isLogout: true,
            code: WA_STREAM_SIGNALING.FORCE_LOGOUT_CODE
        }
    ])
    assert.deepEqual(connectCalls, [WA_CONNECTION_REASONS.RECONNECTED])
    assert.equal(clearCredentialsCalls, 1)

    calls.length = 0
    disconnectCalls.length = 0
    connectCalls.length = 0
    clearCredentialsCalls = 0
    await handler.handleStreamControlResult({
        kind: 'stream_error_replaced'
    })
    assert.deepEqual(calls, ['stopComms', 'disconnect'])
    assert.deepEqual(disconnectCalls, [
        {
            reason: WA_DISCONNECT_REASONS.STREAM_ERROR_REPLACED,
            isLogout: false,
            code: null
        }
    ])
    assert.deepEqual(connectCalls, [])
    assert.equal(clearCredentialsCalls, 0)

    calls.length = 0
    disconnectCalls.length = 0
    connectCalls.length = 0
    clearCredentialsCalls = 0
    await handler.handleStreamControlResult({
        kind: 'stream_error_device_removed'
    })
    assert.deepEqual(calls, ['stopComms', 'disconnect', 'clear_credentials'])
    assert.deepEqual(disconnectCalls, [
        {
            reason: WA_DISCONNECT_REASONS.STREAM_ERROR_DEVICE_REMOVED,
            isLogout: true,
            code: null
        }
    ])
    assert.deepEqual(connectCalls, [])
    assert.equal(clearCredentialsCalls, 1)
})

test('message dispatch coordinator mutates participants cache from group events', async () => {
    const participantsStore = new WaParticipantsMemoryStore(60_000)
    const coordinator = createMessageDispatchCoordinator(participantsStore)

    await coordinator.mutateParticipantsCacheFromGroupEvent(
        createGroupEvent({
            action: 'create',
            groupJid: '120@g.us',
            participants: ['551100000000@s.whatsapp.net', '551199999999:3@s.whatsapp.net']
        })
    )

    const created = await participantsStore.getGroupParticipants('120@g.us')
    assert.ok(created)
    assert.deepEqual(created?.participants, [
        '551100000000@s.whatsapp.net',
        '551199999999@s.whatsapp.net'
    ])

    await coordinator.mutateParticipantsCacheFromGroupEvent(
        createGroupEvent({
            action: 'add',
            groupJid: '120@g.us',
            participants: ['552200000000@s.whatsapp.net']
        })
    )
    const added = await participantsStore.getGroupParticipants('120@g.us')
    assert.deepEqual(added?.participants, [
        '551100000000@s.whatsapp.net',
        '551199999999@s.whatsapp.net',
        '552200000000@s.whatsapp.net'
    ])

    await coordinator.mutateParticipantsCacheFromGroupEvent(
        createGroupEvent({
            action: 'remove',
            groupJid: '120@g.us',
            participants: ['551199999999@s.whatsapp.net']
        })
    )
    const removed = await participantsStore.getGroupParticipants('120@g.us')
    assert.deepEqual(removed?.participants, [
        '551100000000@s.whatsapp.net',
        '552200000000@s.whatsapp.net'
    ])

    await coordinator.mutateParticipantsCacheFromGroupEvent(
        createGroupEvent({
            action: 'delete',
            groupJid: '120@g.us'
        })
    )
    assert.equal(await participantsStore.getGroupParticipants('120@g.us'), null)

    await participantsStore.destroy()
})

test('message dispatch coordinator handles linked and modify participant cache events', async () => {
    const participantsStore = new WaParticipantsMemoryStore(60_000)
    const coordinator = createMessageDispatchCoordinator(participantsStore)

    await participantsStore.upsertGroupParticipants({
        groupJid: 'child@g.us',
        participants: ['old@s.whatsapp.net', 'keep@s.whatsapp.net'],
        updatedAtMs: Date.now()
    })

    await coordinator.mutateParticipantsCacheFromGroupEvent(
        createGroupEvent({
            action: 'linked_group_promote',
            groupJid: 'parent@g.us',
            contextGroupJid: 'child@g.us',
            participants: ['linked@s.whatsapp.net']
        })
    )

    const linked = await participantsStore.getGroupParticipants('child@g.us')
    assert.deepEqual(linked?.participants, [
        'old@s.whatsapp.net',
        'keep@s.whatsapp.net',
        'linked@s.whatsapp.net'
    ])
    assert.equal(await participantsStore.getGroupParticipants('parent@g.us'), null)

    await coordinator.mutateParticipantsCacheFromGroupEvent(
        createGroupEvent({
            action: 'modify',
            groupJid: 'child@g.us',
            authorJid: 'old@s.whatsapp.net',
            participants: ['new@s.whatsapp.net']
        })
    )

    const modified = await participantsStore.getGroupParticipants('child@g.us')
    assert.deepEqual(modified?.participants, [
        'keep@s.whatsapp.net',
        'linked@s.whatsapp.net',
        'new@s.whatsapp.net'
    ])

    await coordinator.mutateParticipantsCacheFromGroupEvent(
        createGroupEvent({
            action: 'add',
            groupJid: 'uncached@g.us',
            participants: ['5511@s.whatsapp.net']
        })
    )
    assert.equal(await participantsStore.getGroupParticipants('uncached@g.us'), null)

    await participantsStore.destroy()
})

test('mobile message id format: AC + 30 hex chars uppercase', async () => {
    const participantsStore = new WaParticipantsMemoryStore(60_000)
    const coordinator = createMessageDispatchCoordinator(participantsStore, {
        getCurrentMeJid: () => '5596965746475@s.whatsapp.net',
        mobileMessageIdFormat: true
    })
    const gen = coordinator as unknown as {
        generateOutgoingMessageId(): Promise<string>
    }
    const seen = new Set<string>()
    for (let i = 0; i < 5; i += 1) {
        const id = await gen.generateOutgoingMessageId()
        assert.match(id, /^AC[0-9A-F]{30}$/, `id '${id}' does not match mobile format`)
        seen.add(id)
    }
    assert.equal(seen.size, 5)
    await participantsStore.destroy()
})

test('web message id format stays 3EB0 + 18 hex chars when mobile flag unset', async () => {
    const participantsStore = new WaParticipantsMemoryStore(60_000)
    const coordinator = createMessageDispatchCoordinator(participantsStore, {
        getCurrentMeJid: () => '5596965746475@s.whatsapp.net'
    })
    const gen = coordinator as unknown as {
        generateOutgoingMessageId(): Promise<string>
    }
    const id = await gen.generateOutgoingMessageId()
    assert.match(id, /^3EB0[0-9A-F]{18}$/, `id '${id}' does not match web format`)
    await participantsStore.destroy()
})

test('encoded signed device identity returns undefined on primary (no blob stored)', async () => {
    const participantsStore = new WaParticipantsMemoryStore(60_000)
    const coordinator = createMessageDispatchCoordinator(participantsStore)
    const accessor = coordinator as unknown as {
        getEncodedSignedDeviceIdentity(): Uint8Array | undefined
    }
    assert.equal(accessor.getEncodedSignedDeviceIdentity(), undefined)
    await participantsStore.destroy()
})

test('app-state mutation coordinator flushes queued mutations while sync is in-flight', async () => {
    const messageStore = new WaMessageMemoryStore()
    const syncCalls: (readonly WaAppStateMutationInput[])[] = []
    let releaseFirstSync!: () => void
    let firstSyncStartedResolve: (() => void) | null = null
    const firstSyncStarted = new Promise<void>((resolve) => {
        firstSyncStartedResolve = resolve
    })

    const coordinator = new WaAppStateMutationCoordinator({
        logger: createLogger(),
        messageStore,
        syncAppState: async (options = {}) => {
            const pendingMutations = options.pendingMutations ?? []
            syncCalls.push(pendingMutations)
            if (syncCalls.length === 1) {
                firstSyncStartedResolve?.()
                await new Promise<void>((resolve) => {
                    releaseFirstSync = () => {
                        resolve()
                    }
                })
            }
            return buildAppStateSyncResult(pendingMutations, WA_APP_STATE_COLLECTION_STATES.SUCCESS)
        }
    })

    const firstMutation = coordinator.setChatMute('551100000000@s.whatsapp.net', false)
    await firstSyncStarted
    const secondMutation = coordinator.setChatPin('551100000000@s.whatsapp.net', false)
    releaseFirstSync()
    await Promise.all([firstMutation, secondMutation])

    assert.equal(syncCalls.length, 2)
    assert.equal(syncCalls[0].length, 1)
    assert.equal(syncCalls[1].length, 1)
    assert.equal(JSON.parse(syncCalls[0][0].index)[0], 'mute')
    assert.equal(JSON.parse(syncCalls[1][0].index)[0], 'pin_v1')
})

test('app-state mutation coordinator emits pin + archive mutations when pinning chat', async () => {
    const messageStore = new WaMessageMemoryStore()
    await messageStore.upsert({
        id: 'm1',
        threadJid: '551100000000@s.whatsapp.net',
        fromMe: true,
        timestampMs: 1_000
    })

    const syncCalls: (readonly WaAppStateMutationInput[])[] = []
    const coordinator = new WaAppStateMutationCoordinator({
        logger: createLogger(),
        messageStore,
        syncAppState: async (options = {}) => {
            const pendingMutations = options.pendingMutations ?? []
            syncCalls.push(pendingMutations)
            return buildAppStateSyncResult(pendingMutations, WA_APP_STATE_COLLECTION_STATES.SUCCESS)
        }
    })

    await coordinator.setChatPin('551100000000@s.whatsapp.net', true)

    assert.equal(syncCalls.length, 1)
    assert.equal(syncCalls[0].length, 2)
    const indexActions = syncCalls[0].map((mutation) => JSON.parse(mutation.index)[0])
    assert.deepEqual(indexActions, ['pin_v1', 'archive'])
    const archiveMutation = syncCalls[0][1]
    if (archiveMutation.operation !== 'set') {
        throw new Error('archive mutation should be set')
    }
    assert.equal(archiveMutation.value.archiveChatAction?.archived, false)
    assert.equal(archiveMutation.value.archiveChatAction?.messageRange?.messages?.length, 1)
    if (syncCalls[0][0].operation !== 'set' || syncCalls[0][1].operation !== 'set') {
        throw new Error('pin and archive mutations should be set')
    }
    assert.equal(typeof syncCalls[0][0].value.timestamp, 'number')
    assert.equal(typeof syncCalls[0][1].value.timestamp, 'number')
})

test('app-state mutation coordinator flushes only targeted collections for queued mutation batch', async () => {
    const messageStore = new WaMessageMemoryStore()
    await messageStore.upsert({
        id: 'm1',
        threadJid: '551100000000@s.whatsapp.net',
        fromMe: true,
        timestampMs: 1_000
    })

    const syncCalls: { readonly collections: readonly string[]; readonly pending: number }[] = []
    const coordinator = new WaAppStateMutationCoordinator({
        logger: createLogger(),
        messageStore,
        syncAppState: async (options = {}) => {
            syncCalls.push({
                collections: options.collections ?? [],
                pending: options.pendingMutations?.length ?? 0
            })
            return buildAppStateSyncResult(
                options.pendingMutations ?? [],
                WA_APP_STATE_COLLECTION_STATES.SUCCESS
            )
        }
    })

    await coordinator.setChatPin('551100000000@s.whatsapp.net', true)

    assert.equal(syncCalls.length, 1)
    assert.equal(syncCalls[0].pending, 2)
    assert.deepEqual(syncCalls[0].collections, ['regular_low'])
})

test('app-state mutation coordinator includes message range and auto-unpin on archive', async () => {
    const messageStore = new WaMessageMemoryStore()
    await messageStore.upsert({
        id: 'gm1',
        threadJid: '120@g.us',
        fromMe: false,
        participantJid: '551199999999@s.whatsapp.net',
        timestampMs: 2_000
    })
    await messageStore.upsert({
        id: 'gm2',
        threadJid: '120@g.us',
        fromMe: true,
        timestampMs: 3_000
    })

    const syncCalls: (readonly WaAppStateMutationInput[])[] = []
    const coordinator = new WaAppStateMutationCoordinator({
        logger: createLogger(),
        messageStore,
        syncAppState: async (options = {}) => {
            const pendingMutations = options.pendingMutations ?? []
            syncCalls.push(pendingMutations)
            return buildAppStateSyncResult(pendingMutations, WA_APP_STATE_COLLECTION_STATES.SUCCESS)
        }
    })

    await coordinator.setChatArchive('120@g.us', true)

    assert.equal(syncCalls.length, 1)
    assert.equal(syncCalls[0].length, 2)
    const archiveMutation = syncCalls[0][0]
    if (archiveMutation.operation !== 'set') {
        throw new Error('archive mutation should be set')
    }
    const messageRange = archiveMutation.value.archiveChatAction?.messageRange
    assert.equal(messageRange?.messages?.length, 2)
    const incomingGroupMessage = messageRange?.messages?.find(
        (message) => message.key?.id === 'gm1'
    )
    assert.equal(incomingGroupMessage?.key?.remoteJid, '120@g.us')
    assert.equal(incomingGroupMessage?.key?.participant, '551199999999@s.whatsapp.net')
    assert.equal(messageRange?.lastMessageTimestamp, 3)

    const pinMutation = syncCalls[0][1]
    if (pinMutation.operation !== 'set') {
        throw new Error('pin mutation should be set')
    }
    assert.equal(pinMutation.value.pinAction?.pinned, false)
})

test('app-state mutation coordinator preserves device participant jid in archive message range', async () => {
    const messageStore = new WaMessageMemoryStore()
    await messageStore.upsert({
        id: 'gm1',
        threadJid: '120@g.us',
        fromMe: false,
        participantJid: '551199999999:1@lid',
        timestampMs: 2_000
    })

    const syncCalls: (readonly WaAppStateMutationInput[])[] = []
    const coordinator = new WaAppStateMutationCoordinator({
        logger: createLogger(),
        messageStore,
        syncAppState: async (options = {}) => {
            const pendingMutations = options.pendingMutations ?? []
            syncCalls.push(pendingMutations)
            return buildAppStateSyncResult(pendingMutations, WA_APP_STATE_COLLECTION_STATES.SUCCESS)
        }
    })

    await coordinator.setChatArchive('120@g.us', false)

    assert.equal(syncCalls.length, 1)
    assert.equal(syncCalls[0].length, 1)
    const archiveMutation = syncCalls[0][0]
    if (archiveMutation.operation !== 'set') {
        throw new Error('archive mutation should be set')
    }
    const messageRange = archiveMutation.value.archiveChatAction?.messageRange
    assert.equal(messageRange?.messages?.length, 1)
    assert.equal(messageRange?.messages?.[0]?.key?.participant, '551199999999:1@lid')
})

test('app-state mutation coordinator skips incoming group messages without participant in archive range', async () => {
    const messageStore = new WaMessageMemoryStore()
    await messageStore.upsert({
        id: 'gm_missing',
        threadJid: '120@g.us',
        fromMe: false,
        timestampMs: 5_000
    })
    await messageStore.upsert({
        id: 'gm_valid',
        threadJid: '120@g.us',
        fromMe: false,
        participantJid: '551199999999:2@lid',
        timestampMs: 4_000
    })

    const syncCalls: (readonly WaAppStateMutationInput[])[] = []
    const coordinator = new WaAppStateMutationCoordinator({
        logger: createLogger(),
        messageStore,
        syncAppState: async (options = {}) => {
            const pendingMutations = options.pendingMutations ?? []
            syncCalls.push(pendingMutations)
            return buildAppStateSyncResult(pendingMutations, WA_APP_STATE_COLLECTION_STATES.SUCCESS)
        }
    })

    await coordinator.setChatArchive('120@g.us', false)

    assert.equal(syncCalls.length, 1)
    assert.equal(syncCalls[0].length, 1)
    const archiveMutation = syncCalls[0][0]
    if (archiveMutation.operation !== 'set') {
        throw new Error('archive mutation should be set')
    }
    const messageRange = archiveMutation.value.archiveChatAction?.messageRange
    assert.equal(messageRange?.messages?.length, 1)
    assert.equal(messageRange?.messages?.[0]?.key?.id, 'gm_valid')
    assert.equal(messageRange?.messages?.[0]?.key?.participant, '551199999999:2@lid')
    assert.equal(messageRange?.lastMessageTimestamp, 4)
})

test('app-state mutation coordinator keeps pending mutations after blocked flush', async () => {
    const messageStore = new WaMessageMemoryStore()
    const syncCalls: (readonly WaAppStateMutationInput[])[] = []
    let flushAttempt = 0

    const coordinator = new WaAppStateMutationCoordinator({
        logger: createLogger(),
        messageStore,
        syncAppState: async (options = {}) => {
            flushAttempt += 1
            const pendingMutations = options.pendingMutations ?? []
            syncCalls.push(pendingMutations)
            return buildAppStateSyncResult(
                pendingMutations,
                flushAttempt === 1
                    ? WA_APP_STATE_COLLECTION_STATES.BLOCKED
                    : WA_APP_STATE_COLLECTION_STATES.SUCCESS
            )
        }
    })

    await assert.rejects(coordinator.setChatMute('551100000000@s.whatsapp.net', false))
    await coordinator.flushMutations()

    assert.equal(syncCalls.length, 2)
    assert.equal(syncCalls[0].length, 1)
    assert.equal(syncCalls[1].length, 1)
    assert.equal(syncCalls[0][0].index, syncCalls[1][0].index)
})

test('app-state mutation coordinator emits read/clear/delete mutations with expected indexes', async () => {
    const messageStore = new WaMessageMemoryStore()
    await messageStore.upsert({
        id: 'm1',
        threadJid: '551100000000@s.whatsapp.net',
        fromMe: true,
        timestampMs: 1_000
    })

    const syncCalls: (readonly WaAppStateMutationInput[])[] = []
    const coordinator = new WaAppStateMutationCoordinator({
        logger: createLogger(),
        messageStore,
        syncAppState: async (options = {}) => {
            const pendingMutations = options.pendingMutations ?? []
            syncCalls.push(pendingMutations)
            return buildAppStateSyncResult(pendingMutations, WA_APP_STATE_COLLECTION_STATES.SUCCESS)
        }
    })

    await coordinator.setChatRead('551100000000@s.whatsapp.net', true)
    await coordinator.clearChat('551100000000@s.whatsapp.net', {
        deleteStarred: true,
        deleteMedia: false
    })
    await coordinator.deleteChat('551100000000@s.whatsapp.net', {
        deleteMedia: true
    })

    assert.equal(syncCalls.length, 3)
    assert.equal(JSON.parse(syncCalls[0][0].index)[0], 'markChatAsRead')
    assert.deepEqual(JSON.parse(syncCalls[1][0].index), [
        'clearChat',
        '551100000000@s.whatsapp.net',
        '1',
        '0'
    ])
    assert.deepEqual(JSON.parse(syncCalls[2][0].index), [
        'deleteChat',
        '551100000000@s.whatsapp.net',
        '1'
    ])
})

test('app-state mutation coordinator emits archive and unpin before lock mutation', async () => {
    const messageStore = new WaMessageMemoryStore()
    await messageStore.upsert({
        id: 'm1',
        threadJid: '551100000000@s.whatsapp.net',
        fromMe: true,
        timestampMs: 1_000
    })

    const syncCalls: (readonly WaAppStateMutationInput[])[] = []
    const coordinator = new WaAppStateMutationCoordinator({
        logger: createLogger(),
        messageStore,
        syncAppState: async (options = {}) => {
            const pendingMutations = options.pendingMutations ?? []
            syncCalls.push(pendingMutations)
            return buildAppStateSyncResult(pendingMutations, WA_APP_STATE_COLLECTION_STATES.SUCCESS)
        }
    })

    await coordinator.setChatLock('551100000000@s.whatsapp.net', true)

    assert.equal(syncCalls.length, 1)
    assert.equal(syncCalls[0].length, 3)
    const indexActions = syncCalls[0].map((mutation) => JSON.parse(mutation.index)[0])
    assert.deepEqual(indexActions, ['archive', 'pin_v1', 'lock'])
    const lockMutation = syncCalls[0][2]
    if (lockMutation.operation !== 'set') {
        throw new Error('lock mutation should be set')
    }
    assert.equal(lockMutation.value.lockChatAction?.locked, true)
})

test('app-state mutation coordinator emits star mutation with message-key index', async () => {
    const messageStore = new WaMessageMemoryStore()
    const syncCalls: (readonly WaAppStateMutationInput[])[] = []
    const coordinator = new WaAppStateMutationCoordinator({
        logger: createLogger(),
        messageStore,
        syncAppState: async (options = {}) => {
            const pendingMutations = options.pendingMutations ?? []
            syncCalls.push(pendingMutations)
            return buildAppStateSyncResult(pendingMutations, WA_APP_STATE_COLLECTION_STATES.SUCCESS)
        }
    })

    await coordinator.setMessageStar(
        {
            chatJid: '120@g.us',
            id: 'gm1',
            fromMe: false,
            participantJid: '551199999999:3@s.whatsapp.net'
        },
        true
    )

    assert.equal(syncCalls.length, 1)
    assert.equal(syncCalls[0].length, 1)
    assert.deepEqual(JSON.parse(syncCalls[0][0].index), [
        'star',
        '120@g.us',
        'gm1',
        '0',
        '551199999999:3@s.whatsapp.net'
    ])
    const starMutation = syncCalls[0][0]
    if (starMutation.operation !== 'set') {
        throw new Error('star mutation should be set')
    }
    assert.equal(starMutation.value.starAction?.starred, true)
})

test('app-state mutation coordinator emits delete-message-for-me mutation and validates group participant', async () => {
    const messageStore = new WaMessageMemoryStore()
    const syncCalls: (readonly WaAppStateMutationInput[])[] = []
    const coordinator = new WaAppStateMutationCoordinator({
        logger: createLogger(),
        messageStore,
        syncAppState: async (options = {}) => {
            const pendingMutations = options.pendingMutations ?? []
            syncCalls.push(pendingMutations)
            return buildAppStateSyncResult(pendingMutations, WA_APP_STATE_COLLECTION_STATES.SUCCESS)
        }
    })

    await coordinator.deleteMessageForMe(
        {
            chatJid: '551100000000:9@s.whatsapp.net',
            id: 'm1',
            fromMe: true
        },
        {
            deleteMedia: true,
            messageTimestampMs: 1_500
        }
    )

    assert.equal(syncCalls.length, 1)
    assert.equal(syncCalls[0].length, 1)
    assert.deepEqual(JSON.parse(syncCalls[0][0].index), [
        'deleteMessageForMe',
        '551100000000@s.whatsapp.net',
        'm1',
        '1',
        '0'
    ])
    const deleteForMeMutation = syncCalls[0][0]
    if (deleteForMeMutation.operation !== 'set') {
        throw new Error('delete-message-for-me mutation should be set')
    }
    assert.equal(deleteForMeMutation.value.deleteMessageForMeAction?.deleteMedia, true)
    assert.equal(deleteForMeMutation.value.deleteMessageForMeAction?.messageTimestamp, 1)

    await assert.rejects(
        coordinator.setMessageStar(
            {
                chatJid: '120@g.us',
                id: 'missing-participant',
                fromMe: false
            },
            false
        ),
        /participantJid is required/
    )
})

function createPassiveTasksCoordinator(overrides: {
    readonly takeDanglingReceipts: () => BinaryNode[]
    readonly sendNodeDirect: (node: BinaryNode) => Promise<void>
    readonly shouldQueueDanglingReceipt?: (node: BinaryNode, error: Error) => boolean
    readonly requeueDanglingReceipt?: (node: BinaryNode) => void
}): WaPassiveTasksCoordinator {
    const requeued: BinaryNode[] = []
    return new WaPassiveTasksCoordinator({
        logger: createLogger(),
        signalStore: {
            getSignedPreKeyRotationTs: async () => Date.now(),
            setSignedPreKeyRotationTs: async () => undefined,
            getRegistrationInfo: async () => null,
            getSignedPreKey: async () => null,
            setRegistrationInfo: async () => undefined,
            setSignedPreKey: async () => undefined,
            getSignedPreKeyById: async () => null,
            clear: async () => undefined
        } as never,
        preKeyStore: {
            getServerHasPreKeys: async () => true,
            setServerHasPreKeys: async () => undefined,
            getPreKeyById: async () => null,
            getPreKeysById: async () => [],
            putPreKey: async () => undefined,
            getOrGenPreKeys: async () => [],
            getOrGenSinglePreKey: async () => ({}) as never,
            consumePreKeyById: async () => null,
            markKeyAsUploaded: async () => undefined,
            clear: async () => undefined
        } as never,
        signalDigestSync: {
            validateLocalKeyBundle: async () => ({ valid: true, preKeyCount: 10 })
        } as never,
        signalRotateKey: {
            rotateSignedPreKey: async () => undefined
        } as never,
        runtime: {
            queryWithContext: async () => ({ tag: 'iq', attrs: {} }),
            getCurrentCredentials: () => ({ meJid: '551100000000@s.whatsapp.net' }) as never,
            persistServerHasPreKeys: async () => undefined,
            sendNodeDirect: overrides.sendNodeDirect,
            takeDanglingReceipts: overrides.takeDanglingReceipts,
            requeueDanglingReceipt:
                overrides.requeueDanglingReceipt ?? ((node) => requeued.push(node)),
            shouldQueueDanglingReceipt: overrides.shouldQueueDanglingReceipt ?? (() => true),
            syncAbProps: () => undefined,
            sendPresenceAvailable: async () => undefined
        }
    })
}

function makeReceiptNode(id: string): BinaryNode {
    return { tag: 'receipt', attrs: { id, to: `${id}@s.whatsapp.net` } }
}

test('passive tasks coordinator flushes dangling receipts concurrently in batches', async () => {
    let concurrency = 0
    let maxConcurrency = 0
    const sent: string[] = []

    const nodes = Array.from({ length: 6 }, (_, i) => makeReceiptNode(`r${i}`))

    const coordinator = createPassiveTasksCoordinator({
        takeDanglingReceipts: () => nodes,
        sendNodeDirect: async (node) => {
            concurrency += 1
            maxConcurrency = Math.max(maxConcurrency, concurrency)
            await new Promise<void>((resolve) => setImmediate(resolve))
            sent.push(node.attrs.id)
            concurrency -= 1
        }
    })

    coordinator.startPassiveTasksAfterConnect()
    await new Promise<void>((resolve) => setTimeout(resolve, 100))

    assert.equal(sent.length, 6)
    assert.ok(
        maxConcurrency > 1,
        `expected concurrent sends but maxConcurrency was ${maxConcurrency}`
    )
    assert.ok(maxConcurrency <= 4, `expected at most 4 concurrent sends but got ${maxConcurrency}`)
})

test('passive tasks coordinator requeues remaining receipts on transient error', async () => {
    const requeued: BinaryNode[] = []
    const nodes = Array.from({ length: 6 }, (_, i) => makeReceiptNode(`r${i}`))

    const coordinator = createPassiveTasksCoordinator({
        takeDanglingReceipts: () => nodes,
        sendNodeDirect: async (node) => {
            if (node.attrs.id === 'r1') {
                throw new Error('transient')
            }
        },
        shouldQueueDanglingReceipt: () => true,
        requeueDanglingReceipt: (node) => requeued.push(node)
    })

    coordinator.startPassiveTasksAfterConnect()
    await new Promise<void>((resolve) => setTimeout(resolve, 100))

    const requeuedIds = requeued.map((node) => node.attrs.id)
    assert.ok(requeuedIds.includes('r1'), 'transient-failed receipt should be requeued')
    assert.ok(requeuedIds.includes('r4'), 'unsent receipts from next batch should be requeued')
    assert.ok(requeuedIds.includes('r5'), 'unsent receipts from next batch should be requeued')
})

test('passive tasks coordinator drops non-retryable receipt errors without stopping', async () => {
    const sent: string[] = []
    const nodes = Array.from({ length: 3 }, (_, i) => makeReceiptNode(`r${i}`))

    const coordinator = createPassiveTasksCoordinator({
        takeDanglingReceipts: () => nodes,
        sendNodeDirect: async (node) => {
            if (node.attrs.id === 'r1') {
                throw new Error('permanent')
            }
            sent.push(node.attrs.id)
        },
        shouldQueueDanglingReceipt: () => false
    })

    coordinator.startPassiveTasksAfterConnect()
    await new Promise<void>((resolve) => setTimeout(resolve, 100))

    assert.deepEqual(sent, ['r0', 'r2'])
})
