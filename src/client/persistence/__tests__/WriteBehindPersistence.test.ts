import assert from 'node:assert/strict'
import test from 'node:test'

import { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import type { Logger } from '@infra/log/types'
import type { WaStoredContactRecord } from '@store/contracts/contact.store'
import type { WaStoredThreadRecord } from '@store/contracts/thread.store'

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

test('write-behind merges partial contact upserts for the same jid', async () => {
    let releaseBlock: () => void = () => undefined
    const blocked = new Promise<void>((resolve) => {
        releaseBlock = resolve
    })
    const contactWrites: WaStoredContactRecord[] = []

    const writeBehind = new WriteBehindPersistence(
        {
            messageStore: {
                upsert: async () => undefined
            } as never,
            threadStore: {
                upsert: async () => undefined
            } as never,
            contactStore: {
                upsert: async (record: WaStoredContactRecord) => {
                    if (record.jid === 'block@s.whatsapp.net') {
                        await blocked
                    }
                    contactWrites.push(record)
                }
            } as never
        },
        createLogger()
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

    const writeBehind = new WriteBehindPersistence(
        {
            messageStore: {
                upsert: async () => undefined
            } as never,
            threadStore: {
                upsert: async (record: WaStoredThreadRecord) => {
                    if (record.jid === 'block-thread@s.whatsapp.net') {
                        await blocked
                    }
                    threadWrites.push(record)
                }
            } as never,
            contactStore: {
                upsert: async () => undefined
            } as never
        },
        createLogger()
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

    const writeBehind = new WriteBehindPersistence(
        {
            messageStore: {
                upsert: async (record: { readonly id: string }) => {
                    if (record.id === 'blocked') {
                        await blocked
                    }
                }
            } as never,
            threadStore: {
                upsert: async () => undefined
            } as never,
            contactStore: {
                upsert: async () => undefined
            } as never
        },
        createLogger()
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
