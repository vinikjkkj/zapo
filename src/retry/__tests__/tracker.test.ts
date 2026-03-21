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

test('outbound retry tracker skips duplicate final upsert when hinted id matches publish result', async () => {
    const upserts: { readonly messageId: string; readonly toJid: string }[] = []
    let cleanupCalls = 0

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
        cleanupExpired: async () => {
            cleanupCalls += 1
            return 0
        }
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
    assert.equal(cleanupCalls, 1)
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
