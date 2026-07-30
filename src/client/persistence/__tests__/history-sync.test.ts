import assert from 'node:assert/strict'
import test from 'node:test'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'

import { processHistorySyncNotification } from '@client/persistence/history-sync'
import { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import { createNoopLogger } from '@infra/log/types'
import { proto } from '@proto'
import type { WaStoredThreadRecord } from '@store/contracts/thread.store'
import { toBytesView } from '@util/bytes'

const gzipAsync = promisify(gzip)

function createThreadCapture(): {
    readonly writes: WaStoredThreadRecord[]
    readonly writeBehind: WriteBehindPersistence
} {
    const writes: WaStoredThreadRecord[] = []
    const writeBehind = new WriteBehindPersistence(
        {
            messageStore: {
                upsert: async () => undefined,
                upsertBatch: async () => undefined
            } as never,
            threadStore: {
                upsert: async (record: WaStoredThreadRecord) => {
                    writes.push(record)
                },
                upsertBatch: async (records: readonly WaStoredThreadRecord[]) => {
                    writes.push(...records)
                }
            } as never,
            contactStore: {
                upsert: async () => undefined,
                upsertBatch: async () => undefined
            } as never
        },
        createNoopLogger()
    )
    return { writes, writeBehind }
}

async function buildInlineNotification(
    conversation: proto.IConversation
): Promise<proto.Message.IHistorySyncNotification> {
    const payload = proto.HistorySync.encode({
        syncType: proto.HistorySync.HistorySyncType.RECENT,
        conversations: [conversation]
    }).finish()
    return {
        syncType: proto.Message.HistorySyncType.RECENT,
        initialHistBootstrapInlinePayload: toBytesView(await gzipAsync(payload))
    }
}

test('history sync converts Conversation.ephemeralSettingTimestamp from ms to seconds', async () => {
    const { writes, writeBehind } = createThreadCapture()
    const notification = await buildInlineNotification({
        id: '5511999999999@s.whatsapp.net',
        ephemeralExpiration: 86_400,
        ephemeralSettingTimestamp: 1_751_808_692_000
    })

    await processHistorySyncNotification(
        {
            logger: createNoopLogger(),
            mediaTransfer: {} as never,
            writeBehind,
            emitEvent: () => undefined
        } as never,
        notification
    )
    await writeBehind.flush()

    const thread = writes.find((record) => record.jid === '5511999999999@s.whatsapp.net')
    assert.ok(thread, 'conversation should be persisted as a thread row')
    assert.equal(thread.ephemeralExpiration, 86_400)
    assert.equal(thread.ephemeralSettingTimestamp, 1_751_808_692)
})

test('history sync keeps an already-seconds Conversation timestamp untouched', async () => {
    const { writes, writeBehind } = createThreadCapture()
    const notification = await buildInlineNotification({
        id: '5511777777777@s.whatsapp.net',
        ephemeralExpiration: 86_400,
        ephemeralSettingTimestamp: 1_751_808_692
    })

    await processHistorySyncNotification(
        {
            logger: createNoopLogger(),
            mediaTransfer: {} as never,
            writeBehind,
            emitEvent: () => undefined
        } as never,
        notification
    )
    await writeBehind.flush()

    const thread = writes.find((record) => record.jid === '5511777777777@s.whatsapp.net')
    assert.ok(thread)
    assert.equal(thread.ephemeralSettingTimestamp, 1_751_808_692)
})

test('history sync leaves ephemeralSettingTimestamp absent for a non-ephemeral chat', async () => {
    const { writes, writeBehind } = createThreadCapture()
    const notification = await buildInlineNotification({
        id: '5511888888888@s.whatsapp.net'
    })

    await processHistorySyncNotification(
        {
            logger: createNoopLogger(),
            mediaTransfer: {} as never,
            writeBehind,
            emitEvent: () => undefined
        } as never,
        notification
    )
    await writeBehind.flush()

    const thread = writes.find((record) => record.jid === '5511888888888@s.whatsapp.net')
    assert.ok(thread)
    assert.equal(thread.ephemeralSettingTimestamp, undefined)
})
