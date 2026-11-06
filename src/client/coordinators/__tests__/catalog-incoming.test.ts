import assert from 'node:assert/strict'
import test from 'node:test'

import { WaIncomingNodeCoordinator } from '@client/coordinators/WaIncomingNodeCoordinator'
import { parseDirtyBits } from '@client/events/dirty'
import { createNoopLogger } from '@infra/log/types'
import type { BinaryNode } from '@transport/types'

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
            handleMediaRetryNotification: () => undefined,
            trackOutboundReceipt: async () => undefined,
            emitIncomingReceipt: () => undefined,
            emitIncomingPresence: () => undefined,
            emitIncomingChatstate: () => undefined,
            emitIncomingCall: () => undefined,
            getCurrentCredentials: () => null,
            emitIncomingFailure: () => undefined,
            emitIncomingErrorStanza: () => undefined,
            emitIncomingNotification: () => undefined,
            emitOfflineThreadMetadata: () => undefined,
            emitMexNotification: () => undefined,
            emitRegistrationCode: () => undefined,
            emitAccountTakeoverNotice: () => undefined,
            emitGroupEvent: () => undefined,
            emitBusinessEvent: () => undefined,
            emitPictureEvent: () => undefined,
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

for (const fails of [false, true]) {
    test(`incoming mixed bulletin preserves built-in processing when recovery fails: ${fails}`, async () => {
        const { runtime, unhandled } = createIncomingRuntime()
        const notifications: unknown[] = []
        const routed: Uint8Array[] = []
        const dirty: unknown[] = []
        const completed: number[] = []
        const nonces: BinaryNode[] = []
        const coordinator = new WaIncomingNodeCoordinator({
            logger: createNoopLogger(),
            runtime: {
                ...runtime,
                emitIncomingNotification: (event) => notifications.push(event),
                persistRoutingInfo: async (info) => {
                    routed.push(info)
                },
                parseDirtyBits: (nodes) => parseDirtyBits(nodes, createNoopLogger()),
                handleDirtyBits: async (bits) => {
                    dirty.push(...bits)
                }
            },
            offlineResume: {
                trackOfflineStanza() {},
                handleOfflinePreview(count: number) {
                    completed.push(count)
                },
                handleOfflineComplete(count: number) {
                    completed.push(count)
                },
                reset() {},
                isComplete: false,
                isResuming: false
            } as never
        })
        coordinator.registerIncomingHandler({
            tag: 'ib',
            handler: async (node) => {
                nonces.push(node)
                if (fails) throw new Error('handler failed')
                return true
            }
        })
        await coordinator.handleIncomingNode({
            tag: 'ib',
            attrs: {},
            content: [
                { tag: 'offline_preview', attrs: { count: '2' } },
                { tag: 'recovery_nonce', attrs: { code: 'private-nonce', use_case: '547' } },
                { tag: 'dirty', attrs: { type: 'groups', timestamp: '1' } },
                {
                    tag: 'edge_routing',
                    attrs: {},
                    content: [{ tag: 'routing_info', attrs: {}, content: new Uint8Array([1, 2]) }]
                }
            ]
        })
        assert.equal(nonces.length, 1)
        assert.deepEqual(nonces[0].content, [
            { tag: 'recovery_nonce', attrs: { code: 'private-nonce', use_case: '547' } }
        ])
        assert.equal(notifications.length, 1)
        assert.doesNotMatch(JSON.stringify(notifications), /private-nonce|recovery_nonce/)
        assert.deepEqual(completed, [2])
        assert.deepEqual(routed, [new Uint8Array([1, 2])])
        assert.equal(dirty.length, 1)
        assert.deepEqual(unhandled, [])
    })
}
