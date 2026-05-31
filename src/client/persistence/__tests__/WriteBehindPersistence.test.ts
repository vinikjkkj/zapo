import assert from 'node:assert/strict'
import test from 'node:test'

import { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import { createNoopLogger } from '@infra/log/types'
import type { WaStoredContactRecord } from '@store/contracts/contact.store'
import type { WaStoredThreadRecord } from '@store/contracts/thread.store'

test('write-behind merges partial contact upserts for the same jid', async () => {
    let releaseBlock: () => void = () => undefined
    const blocked = new Promise<void>((resolve) => {
        releaseBlock = resolve
    })
    const contactWrites: WaStoredContactRecord[] = []

    const contactUpsert = async (record: WaStoredContactRecord): Promise<void> => {
        if (record.jid === 'block@s.whatsapp.net') {
            await blocked
        }
        contactWrites.push(record)
    }
    const writeBehind = new WriteBehindPersistence(
        {
            messageStore: {
                upsert: async () => undefined,
                upsertBatch: async () => undefined
            } as never,
            threadStore: {
                upsert: async () => undefined,
                upsertBatch: async () => undefined
            } as never,
            contactStore: {
                upsert: contactUpsert,
                upsertBatch: async (records: readonly WaStoredContactRecord[]) => {
                    for (const record of records) await contactUpsert(record)
                }
            } as never
        },
        createNoopLogger()
    )

    writeBehind.persistContact({
        jid: 'block@s.whatsapp.net',
        lastUpdatedMs: 1
    })
    writeBehind.persistContact({
        jid: '5511999999999@s.whatsapp.net',
        pushName: 'Alice',
        lastUpdatedMs: 100
    })
    writeBehind.persistContact({
        jid: '5511999999999@s.whatsapp.net',
        lastUpdatedMs: 200
    })

    releaseBlock()
    await writeBehind.flush(2_000)

    const targetWrites = contactWrites.filter(
        (record) => record.jid === '5511999999999@s.whatsapp.net'
    )
    assert.equal(targetWrites.length, 1)
    assert.equal(targetWrites[0].pushName, 'Alice')
    assert.equal(targetWrites[0].lastUpdatedMs, 200)
})

test('write-behind merges partial thread upserts for the same jid', async () => {
    let releaseBlock: () => void = () => undefined
    const blocked = new Promise<void>((resolve) => {
        releaseBlock = resolve
    })
    const threadWrites: WaStoredThreadRecord[] = []

    const threadUpsert = async (record: WaStoredThreadRecord): Promise<void> => {
        if (record.jid === 'block-thread@s.whatsapp.net') {
            await blocked
        }
        threadWrites.push(record)
    }
    const writeBehind = new WriteBehindPersistence(
        {
            messageStore: {
                upsert: async () => undefined,
                upsertBatch: async () => undefined
            } as never,
            threadStore: {
                upsert: threadUpsert,
                upsertBatch: async (records: readonly WaStoredThreadRecord[]) => {
                    for (const record of records) await threadUpsert(record)
                }
            } as never,
            contactStore: {
                upsert: async () => undefined,
                upsertBatch: async () => undefined
            } as never
        },
        createNoopLogger()
    )

    writeBehind.persistThread({
        jid: 'block-thread@s.whatsapp.net'
    })
    writeBehind.persistThread({
        jid: 'thread@s.whatsapp.net',
        name: 'Project',
        unreadCount: 2
    })
    writeBehind.persistThread({
        jid: 'thread@s.whatsapp.net',
        archived: true
    })

    releaseBlock()
    await writeBehind.flush(2_000)

    const targetWrites = threadWrites.filter((record) => record.jid === 'thread@s.whatsapp.net')
    assert.equal(targetWrites.length, 1)
    assert.equal(targetWrites[0].name, 'Project')
    assert.equal(targetWrites[0].unreadCount, 2)
    assert.equal(targetWrites[0].archived, true)
})

test('write-behind flush and destroy expose remaining pending entries', async () => {
    let releaseBlock: () => void = () => undefined
    const blocked = new Promise<void>((resolve) => {
        releaseBlock = resolve
    })

    const messageUpsert = async (record: { readonly id: string }): Promise<void> => {
        if (record.id === 'blocked') {
            await blocked
        }
    }
    const writeBehind = new WriteBehindPersistence(
        {
            messageStore: {
                upsert: messageUpsert,
                upsertBatch: async (records: readonly { readonly id: string }[]) => {
                    for (const record of records) await messageUpsert(record)
                }
            } as never,
            threadStore: {
                upsert: async () => undefined,
                upsertBatch: async () => undefined
            } as never,
            contactStore: {
                upsert: async () => undefined,
                upsertBatch: async () => undefined
            } as never
        },
        createNoopLogger()
    )

    writeBehind.persistMessage({
        id: 'blocked',
        threadJid: 'thread@s.whatsapp.net',
        fromMe: false
    })

    const flushResult = await writeBehind.flush(10)
    assert.equal(flushResult.remaining > 0, true)

    const destroyResult = await writeBehind.destroy(10)
    assert.equal(destroyResult.remaining > 0, true)

    releaseBlock()
    const finalFlush = await writeBehind.flush(2_000)
    assert.equal(finalFlush.remaining, 0)
})

test('write-behind restart re-arms queues after destroy so new sessions enqueue', async () => {
    const writes: WaStoredContactRecord[] = []
    const writeBehind = new WriteBehindPersistence(
        {
            messageStore: {
                upsert: async () => undefined,
                upsertBatch: async () => undefined
            } as never,
            threadStore: {
                upsert: async () => undefined,
                upsertBatch: async () => undefined
            } as never,
            contactStore: {
                upsert: async (record: WaStoredContactRecord) => {
                    writes.push(record)
                },
                upsertBatch: async (records: readonly WaStoredContactRecord[]) => {
                    for (const r of records) writes.push(r)
                }
            } as never
        },
        createNoopLogger()
    )

    await writeBehind.destroy(10)
    // Without restart, the next enqueue would throw "background queue is destroyed".
    writeBehind.restart()
    writeBehind.persistContact({ jid: 'after-restart@s.whatsapp.net', lastUpdatedMs: 1 })
    await writeBehind.flush(2_000)

    assert.equal(writes.length, 1)
    assert.equal(writes[0].jid, 'after-restart@s.whatsapp.net')
})

test('write-behind restart is a no-op when queues are live', () => {
    const writeBehind = new WriteBehindPersistence(
        {
            messageStore: {
                upsert: async () => undefined,
                upsertBatch: async () => undefined
            } as never,
            threadStore: {
                upsert: async () => undefined,
                upsertBatch: async () => undefined
            } as never,
            contactStore: {
                upsert: async () => undefined,
                upsertBatch: async () => undefined
            } as never
        },
        createNoopLogger()
    )

    // Calling restart twice on a live instance must not throw or rebuild queues.
    writeBehind.restart()
    writeBehind.restart()
})
