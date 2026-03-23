import assert from 'node:assert/strict'
import test from 'node:test'

import type { Logger } from '@infra/log/types'
import { createOutboundRetryTracker } from '@retry/tracker'
import type { WaRetryStore } from '@store/contracts/retry.store'

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

test('outbound retry tracker persists once when hinted id matches publish result', async () => {
    const upserts: {
        readonly messageId: string
        readonly toJid: string
        readonly replayPayload: unknown
    }[] = []

    const retryStore = {
        getTtlMs: () => 60_000,
        upsertOutboundMessage: async (record: {
            readonly messageId: string
            readonly toJid: string
            readonly replayPayload: unknown
        }) => {
            upserts.push({
                messageId: record.messageId,
                toJid: record.toJid,
                replayPayload: record.replayPayload
            })
        },
        cleanupExpired: async () => 0
    } as unknown as WaRetryStore

    const tracker = createOutboundRetryTracker({
        retryStore,
        logger: createLogger()
    })

    const result = await tracker.track(
        {
            messageIdHint: 'hinted-id',
            toJid: '551100000000@s.whatsapp.net',
            type: 'text',
            replayPayload: {
                mode: 'plaintext',
                to: '551100000000@s.whatsapp.net',
                type: 'text',
                plaintext: new Uint8Array([1, 2, 3])
            }
        },
        async () => ({
            id: 'hinted-id',
            attempts: 1,
            ackNode: {
                tag: 'ack',
                attrs: {}
            },
            ack: {
                refreshLid: false
            }
        })
    )

    assert.equal(result.id, 'hinted-id')
    assert.equal(upserts.length, 1)
    assert.equal(upserts[0].messageId, 'hinted-id')
    assert.equal(upserts[0].replayPayload instanceof Uint8Array, true)
})

test('outbound retry tracker skips codec when store supports raw replay payloads', async () => {
    let persistedReplayPayload: unknown

    const retryStore = {
        getTtlMs: () => 60_000,
        supportsRawReplayPayload: () => true,
        upsertOutboundMessage: async (record: { readonly replayPayload: unknown }) => {
            persistedReplayPayload = record.replayPayload
        },
        cleanupExpired: async () => 0
    } as unknown as WaRetryStore

    const tracker = createOutboundRetryTracker({
        retryStore,
        logger: createLogger()
    })

    const replayPayload = {
        mode: 'plaintext' as const,
        to: '551100000000@s.whatsapp.net',
        type: 'text',
        plaintext: new Uint8Array([6, 7, 8])
    }
    await tracker.track(
        {
            toJid: replayPayload.to,
            type: replayPayload.type,
            replayPayload
        },
        async () => ({
            id: 'raw-id',
            attempts: 1,
            ackNode: {
                tag: 'ack',
                attrs: {}
            },
            ack: {
                refreshLid: false
            }
        })
    )

    assert.equal(persistedReplayPayload instanceof Uint8Array, false)
    assert.deepEqual(persistedReplayPayload, replayPayload)
})

test('outbound retry tracker persists publish result when id hint is not provided', async () => {
    const upserts: { readonly messageId: string; readonly toJid: string }[] = []

    const retryStore = {
        getTtlMs: () => 60_000,
        upsertOutboundMessage: async (record: {
            readonly messageId: string
            readonly toJid: string
        }) => {
            upserts.push({
                messageId: record.messageId,
                toJid: record.toJid
            })
        },
        cleanupExpired: async () => 0
    } as unknown as WaRetryStore

    const tracker = createOutboundRetryTracker({
        retryStore,
        logger: createLogger()
    })

    await tracker.track(
        {
            toJid: '551100000000@s.whatsapp.net',
            type: 'text',
            replayPayload: {
                mode: 'plaintext',
                to: '551100000000@s.whatsapp.net',
                type: 'text',
                plaintext: new Uint8Array([9])
            }
        },
        async () => ({
            id: 'published-id',
            attempts: 1,
            ackNode: {
                tag: 'ack',
                attrs: {}
            },
            ack: {
                refreshLid: false
            }
        })
    )

    assert.equal(upserts.length, 1)
    assert.equal(upserts[0].messageId, 'published-id')
    assert.equal(upserts[0].toJid, '551100000000@s.whatsapp.net')
})

test('outbound retry tracker persists only publish result when server rewrites id', async () => {
    const upserts: string[] = []

    const retryStore = {
        getTtlMs: () => 60_000,
        upsertOutboundMessage: async (record: { readonly messageId: string }) => {
            upserts.push(record.messageId)
        },
        cleanupExpired: async () => 0
    } as unknown as WaRetryStore

    const tracker = createOutboundRetryTracker({
        retryStore,
        logger: createLogger()
    })

    await tracker.track(
        {
            messageIdHint: 'hinted-id',
            toJid: '551100000000@s.whatsapp.net',
            type: 'text',
            replayPayload: {
                mode: 'plaintext',
                to: '551100000000@s.whatsapp.net',
                type: 'text',
                plaintext: new Uint8Array([7])
            }
        },
        async () => ({
            id: 'server-id',
            attempts: 1,
            ackNode: {
                tag: 'ack',
                attrs: {}
            },
            ack: {
                refreshLid: false
            }
        })
    )

    assert.deepEqual(upserts, ['server-id'])
})

test('outbound retry tracker does not default eligible requester list for group destination', async () => {
    let persistedEligibleRequesterDeviceJids: readonly string[] | undefined

    const retryStore = {
        getTtlMs: () => 60_000,
        upsertOutboundMessage: async (record: {
            readonly eligibleRequesterDeviceJids?: readonly string[]
        }) => {
            persistedEligibleRequesterDeviceJids = record.eligibleRequesterDeviceJids
        },
        cleanupExpired: async () => 0
    } as unknown as WaRetryStore

    const tracker = createOutboundRetryTracker({
        retryStore,
        logger: createLogger()
    })

    await tracker.track(
        {
            toJid: '123456@g.us',
            type: 'text',
            replayPayload: {
                mode: 'plaintext',
                to: '123456@g.us',
                type: 'text',
                plaintext: new Uint8Array([1])
            }
        },
        async () => ({
            id: 'group-id',
            attempts: 1,
            ackNode: {
                tag: 'ack',
                attrs: {}
            },
            ack: {
                refreshLid: false
            }
        })
    )

    assert.equal(persistedEligibleRequesterDeviceJids, undefined)
})
