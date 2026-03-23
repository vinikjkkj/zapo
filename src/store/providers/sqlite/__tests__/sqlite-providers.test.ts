import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { WaAuthSqliteStore } from '@store/providers/sqlite/auth.store'
import { openSqliteConnection } from '@store/providers/sqlite/connection'
import { WaMessageSqliteStore } from '@store/providers/sqlite/message.store'
import { WaThreadSqliteStore } from '@store/providers/sqlite/thread.store'

interface Destroyable {
    destroy: () => Promise<void>
}

function createCredentials() {
    return {
        noiseKeyPair: {
            pubKey: new Uint8Array(32).fill(1),
            privKey: new Uint8Array(32).fill(2)
        },
        registrationInfo: {
            registrationId: 123,
            identityKeyPair: {
                pubKey: new Uint8Array(32).fill(3),
                privKey: new Uint8Array(32).fill(4)
            }
        },
        signedPreKey: {
            keyId: 7,
            keyPair: {
                pubKey: new Uint8Array(32).fill(5),
                privKey: new Uint8Array(32).fill(6)
            },
            signature: new Uint8Array(64).fill(7),
            uploaded: false
        },
        advSecretKey: new Uint8Array(32).fill(8),
        meJid: '5511@s.whatsapp.net',
        meDisplayName: 'Test',
        serverHasPreKeys: true,
        routingInfo: new Uint8Array([9, 10])
    }
}

test('sqlite auth store saves, loads and clears credentials', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-sqlite-auth-'))
    const store = new WaAuthSqliteStore({
        path: join(dir, 'state.sqlite'),
        sessionId: 'a',
        driver: 'better-sqlite3'
    })

    try {
        const credentials = createCredentials()
        await store.save(credentials)

        const loaded = await store.load()
        assert.ok(loaded)
        assert.equal(loaded.meJid, credentials.meJid)
        assert.equal(
            loaded.registrationInfo.registrationId,
            credentials.registrationInfo.registrationId
        )
        assert.deepEqual(loaded.routingInfo, credentials.routingInfo)

        await store.clear()
        assert.equal(await store.load(), null)
    } finally {
        await store.destroy()
        await rm(dir, { recursive: true, force: true })
    }
})

test('sqlite message/thread stores are session-scoped and preserve coalesced fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-sqlite-mailbox-'))
    const sqlitePath = join(dir, 'state.sqlite')
    const storeA = new WaMessageSqliteStore({
        path: sqlitePath,
        sessionId: 'session-a',
        driver: 'better-sqlite3'
    })
    const storeB = new WaMessageSqliteStore({
        path: sqlitePath,
        sessionId: 'session-b',
        driver: 'better-sqlite3'
    })
    const threadStore = new WaThreadSqliteStore({
        path: sqlitePath,
        sessionId: 'session-a',
        driver: 'better-sqlite3'
    })

    try {
        await storeA.upsert({ id: 'm1', threadJid: 't1', fromMe: true, timestampMs: 100 })
        await storeB.upsert({ id: 'm1', threadJid: 't1', fromMe: false, timestampMs: 50 })

        const messageA = await storeA.getById('m1')
        const messageB = await storeB.getById('m1')

        assert.ok(messageA)
        assert.ok(messageB)
        assert.equal(messageA.fromMe, true)
        assert.equal(messageB.fromMe, false)

        await threadStore.upsert({ jid: 't1', name: 'Thread name', unreadCount: 1 })
        await threadStore.upsert({ jid: 't1', unreadCount: 5 })
        const thread = await threadStore.getByJid('t1')
        assert.ok(thread)
        assert.equal(thread.name, 'Thread name')
        assert.equal(thread.unreadCount, 5)
    } finally {
        await Promise.all([
            (storeA as unknown as Destroyable).destroy(),
            (storeB as unknown as Destroyable).destroy(),
            (threadStore as unknown as Destroyable).destroy()
        ])
        await rm(dir, { recursive: true, force: true })
    }
})

test('sqlite connection rejects unsupported pragma names', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-sqlite-pragma-'))
    try {
        await assert.rejects(
            () =>
                openSqliteConnection({
                    path: join(dir, 'state.sqlite'),
                    sessionId: 'x',
                    driver: 'better-sqlite3',
                    pragmas: {
                        not_allowed: 'x'
                    }
                }),
            /unsupported sqlite pragma/
        )
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
})

test('sqlite auth store supports custom table names', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-sqlite-custom-tables-'))
    const options = {
        path: join(dir, 'state.sqlite'),
        sessionId: 'a',
        driver: 'better-sqlite3',
        tableNames: {
            wa_migrations: 'custom_wa_migrations',
            auth_credentials: 'custom_auth_credentials'
        }
    } as const
    const store = new WaAuthSqliteStore(options)

    try {
        const credentials = createCredentials()
        await store.save(credentials)
        assert.equal((await store.load())?.meJid, credentials.meJid)

        const db = await openSqliteConnection(options)
        try {
            const customAuthTable = db.get<{ readonly name: string }>(
                `SELECT name
                 FROM sqlite_master
                 WHERE type = 'table' AND name = ?`,
                ['custom_auth_credentials']
            )
            const defaultAuthTable = db.get<{ readonly name: string }>(
                `SELECT name
                 FROM sqlite_master
                 WHERE type = 'table' AND name = ?`,
                ['auth_credentials']
            )
            const customMigrationsTable = db.get<{ readonly name: string }>(
                `SELECT name
                 FROM sqlite_master
                 WHERE type = 'table' AND name = ?`,
                ['custom_wa_migrations']
            )

            assert.equal(customAuthTable?.name, 'custom_auth_credentials')
            assert.equal(defaultAuthTable, null)
            assert.equal(customMigrationsTable?.name, 'custom_wa_migrations')
        } finally {
            db.close()
        }
    } finally {
        await store.destroy()
        await rm(dir, { recursive: true, force: true })
    }
})

test('sqlite connection rejects invalid custom table names', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-sqlite-invalid-custom-tables-'))
    try {
        await assert.rejects(
            () =>
                openSqliteConnection({
                    path: join(dir, 'state.sqlite'),
                    sessionId: 'x',
                    driver: 'better-sqlite3',
                    tableNames: {
                        auth_credentials: 'auth-credentials'
                    }
                }),
            /must match/
        )

        await assert.rejects(
            () =>
                openSqliteConnection({
                    path: join(dir, 'state.sqlite'),
                    sessionId: 'x',
                    driver: 'better-sqlite3',
                    tableNames: {
                        wa_migrations: 'shared_table',
                        auth_credentials: 'shared_table'
                    }
                }),
            /duplicate target/
        )

        await assert.rejects(
            () =>
                openSqliteConnection({
                    path: join(dir, 'state.sqlite'),
                    sessionId: 'x',
                    driver: 'better-sqlite3',
                    tableNames: {
                        unknown_table_name: 'anything'
                    } as never
                }),
            /unsupported sqlite tableNames key/
        )
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
})

test('sqlite connection keeps pending open references alive until handle acquisition', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-sqlite-open-race-'))
    const options = {
        path: join(dir, 'state.sqlite'),
        sessionId: 'race',
        driver: 'better-sqlite3'
    } as const
    const first = await openSqliteConnection(options)

    try {
        const secondPromise = openSqliteConnection(options)
        first.close()
        const second = await secondPromise
        try {
            const row = second.get<{ readonly value: number }>('SELECT 1 AS value')
            assert.equal(row?.value, 1)
        } finally {
            second.close()
        }
    } finally {
        first.close()
        await rm(dir, { recursive: true, force: true })
    }
})
