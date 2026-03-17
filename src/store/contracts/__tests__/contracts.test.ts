import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { WaContactMemoryStore } from '@store/providers/memory/contact.store'
import { WaMessageMemoryStore } from '@store/providers/memory/message.store'
import { WaThreadMemoryStore } from '@store/providers/memory/thread.store'
import { WaContactSqliteStore } from '@store/providers/sqlite/contact.store'
import { WaMessageSqliteStore } from '@store/providers/sqlite/message.store'
import { WaThreadSqliteStore } from '@store/providers/sqlite/thread.store'

interface Destroyable {
    destroy?: () => Promise<void>
}

test('message store contract parity between memory and sqlite providers', async () => {
    await runMessageStoreContract(async () => new WaMessageMemoryStore({ maxMessages: 10 }))

    const dir = await mkdtemp(join(tmpdir(), 'zapo-message-contract-'))
    try {
        await runMessageStoreContract(async () =>
            new WaMessageSqliteStore({
                path: join(dir, 'state.sqlite'),
                sessionId: 'session-a',
                driver: 'better-sqlite3'
            })
        )
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
})

test('thread/contact contract parity between memory and sqlite providers', async () => {
    await runThreadStoreContract(async () => new WaThreadMemoryStore({ maxThreads: 10 }))
    await runContactStoreContract(async () => new WaContactMemoryStore({ maxContacts: 10 }))

    const dir = await mkdtemp(join(tmpdir(), 'zapo-mailbox-contract-'))
    try {
        await runThreadStoreContract(async () =>
            new WaThreadSqliteStore({
                path: join(dir, 'state.sqlite'),
                sessionId: 'session-b',
                driver: 'better-sqlite3'
            })
        )
        await runContactStoreContract(async () =>
            new WaContactSqliteStore({
                path: join(dir, 'state.sqlite'),
                sessionId: 'session-b',
                driver: 'better-sqlite3'
            })
        )
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
})

async function runMessageStoreContract(
    factory: () => Promise<{
        upsert: (record: {
            id: string
            threadJid: string
            fromMe: boolean
            timestampMs?: number
        }) => Promise<void>
        getById: (id: string) => Promise<unknown>
        listByThread: (
            threadJid: string,
            limit?: number,
            beforeTimestampMs?: number
        ) => Promise<readonly unknown[]>
        deleteById: (id: string) => Promise<number>
        clear: () => Promise<void>
    } & Destroyable>
): Promise<void> {
    const store = await factory()
    try {
        await store.upsert({ id: 'm1', threadJid: 'thread-1', fromMe: true, timestampMs: 10 })
        await store.upsert({ id: 'm2', threadJid: 'thread-1', fromMe: false, timestampMs: 20 })

        assert.ok(await store.getById('m1'))
        const listed = await store.listByThread('thread-1', 1)
        assert.equal(listed.length, 1)

        assert.equal(await store.deleteById('m1'), 1)
        assert.equal(await store.deleteById('missing'), 0)

        await store.clear()
        assert.equal((await store.listByThread('thread-1')).length, 0)
    } finally {
        await store.destroy?.()
    }
}

async function runThreadStoreContract(
    factory: () => Promise<{
        upsert: (record: {
            jid: string
            name?: string
            unreadCount?: number
        }) => Promise<void>
        getByJid: (jid: string) => Promise<unknown>
        list: (limit?: number) => Promise<readonly unknown[]>
        deleteByJid: (jid: string) => Promise<number>
        clear: () => Promise<void>
    } & Destroyable>
): Promise<void> {
    const store = await factory()
    try {
        await store.upsert({ jid: 'thread-1', name: 'Thread 1', unreadCount: 2 })
        assert.ok(await store.getByJid('thread-1'))
        assert.equal((await store.list(1)).length, 1)
        assert.equal(await store.deleteByJid('thread-1'), 1)
        await store.clear()
        assert.equal((await store.list()).length, 0)
    } finally {
        await store.destroy?.()
    }
}

async function runContactStoreContract(
    factory: () => Promise<{
        upsert: (record: { jid: string; pushName?: string; lastUpdatedMs: number }) => Promise<void>
        getByJid: (jid: string) => Promise<unknown>
        deleteByJid: (jid: string) => Promise<number>
        clear: () => Promise<void>
    } & Destroyable>
): Promise<void> {
    const store = await factory()
    try {
        await store.upsert({ jid: '5511@s.whatsapp.net', pushName: 'A', lastUpdatedMs: Date.now() })
        assert.ok(await store.getByJid('5511@s.whatsapp.net'))
        assert.equal(await store.deleteByJid('5511@s.whatsapp.net'), 1)
        await store.clear()
    } finally {
        await store.destroy?.()
    }
}

