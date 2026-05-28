import type { PoolClient } from 'pg'
import { signalAddressKey } from 'zapo-js/protocol'
import {
    decodeSignalSessionRecord,
    encodeSignalSessionRecord,
    type SignalAddress,
    type SignalAddressParts,
    type SignalSessionRecord,
    toSignalAddressParts
} from 'zapo-js/signal'
import type { WaSessionStore } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { queryFirst, queryRows, toBytes } from './helpers'
import type { PgParam, WaPgStorageOptions } from './types'

const BATCH_SIZE = 250

export class WaSessionPgStore extends BasePgStore implements WaSessionStore {
    public constructor(options: WaPgStorageOptions) {
        super(options, ['signal'])
    }

    // ── Sessions ──────────────────────────────────────────────────────

    public async hasSession(address: SignalAddress): Promise<boolean> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        return (
            queryRows(
                await this.pool.query({
                    name: this.stmtName('session_has_session'),
                    text: `SELECT 1 AS has_session
                     FROM ${this.t('signal_session')}
                     WHERE session_id = $1 AND "user" = $2 AND server = $3 AND device = $4
                     LIMIT 1`,
                    values: [this.sessionId, target.user, target.server, target.device]
                })
            ).length > 0
        )
    }

    public async hasSessions(addresses: readonly SignalAddress[]): Promise<readonly boolean[]> {
        if (addresses.length === 0) return []
        await this.ensureReady()
        const targets = addresses.map((a) => toSignalAddressParts(a))
        const existingKeys = new Set<string>()
        for (let start = 0; start < targets.length; start += BATCH_SIZE) {
            const batch = targets.slice(start, start + BATCH_SIZE)
            let paramIdx = 2
            const addrClauses = batch
                .map(() => {
                    const clause = `("user" = $${paramIdx} AND server = $${paramIdx + 1} AND device = $${paramIdx + 2})`
                    paramIdx += 3
                    return clause
                })
                .join(' OR ')
            const params: PgParam[] = [
                this.sessionId,
                ...batch.flatMap((t) => [t.user, t.server, t.device])
            ]
            const rows = queryRows(
                await this.pool.query(
                    `SELECT "user", server, device
                     FROM ${this.t('signal_session')}
                     WHERE session_id = $1 AND (${addrClauses})`,
                    params
                )
            )
            for (const row of rows) {
                existingKeys.add(
                    signalAddressKey({
                        user: String(row.user),
                        server: String(row.server),
                        device: Number(row.device)
                    })
                )
            }
        }
        return targets.map((t) => existingKeys.has(signalAddressKey(t)))
    }

    public async getSession(address: SignalAddress): Promise<SignalSessionRecord | null> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('session_get_session'),
                text: `SELECT record
                 FROM ${this.t('signal_session')}
                 WHERE session_id = $1 AND "user" = $2 AND server = $3 AND device = $4`,
                values: [this.sessionId, target.user, target.server, target.device]
            })
        )
        if (!row) return null
        return decodeSignalSessionRecord(toBytes(row.record))
    }

    public async getSessionsBatch(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (SignalSessionRecord | null)[]> {
        if (addresses.length === 0) return []
        await this.ensureReady()
        const targets = addresses.map((a) => toSignalAddressParts(a))
        const byKey = new Map<string, SignalSessionRecord>()
        for (let start = 0; start < targets.length; start += BATCH_SIZE) {
            const batch = targets.slice(start, start + BATCH_SIZE)
            let paramIdx = 2
            const addrClauses = batch
                .map(() => {
                    const clause = `("user" = $${paramIdx} AND server = $${paramIdx + 1} AND device = $${paramIdx + 2})`
                    paramIdx += 3
                    return clause
                })
                .join(' OR ')
            const params: PgParam[] = [
                this.sessionId,
                ...batch.flatMap((t) => [t.user, t.server, t.device])
            ]
            const rows = queryRows(
                await this.pool.query(
                    `SELECT "user", server, device, record
                     FROM ${this.t('signal_session')}
                     WHERE session_id = $1 AND (${addrClauses})`,
                    params
                )
            )
            for (const row of rows) {
                byKey.set(
                    signalAddressKey({
                        user: String(row.user),
                        server: String(row.server),
                        device: Number(row.device)
                    }),
                    decodeSignalSessionRecord(toBytes(row.record))
                )
            }
        }
        return targets.map((t) => byKey.get(signalAddressKey(t)) ?? null)
    }

    public async setSession(address: SignalAddress, session: SignalSessionRecord): Promise<void> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        await this.upsertSession(this.pool, target, session)
    }

    public async setSessionsBatch(
        entries: readonly {
            readonly address: SignalAddress
            readonly session: SignalSessionRecord
        }[]
    ): Promise<void> {
        if (entries.length === 0) return
        const runChunk = async (
            executor: { query: PoolClient['query'] },
            chunk: readonly {
                readonly address: SignalAddress
                readonly session: SignalSessionRecord
            }[]
        ): Promise<void> => {
            let paramIdx = 1
            const placeholders = chunk
                .map(() => {
                    const p = `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`
                    paramIdx += 5
                    return p
                })
                .join(', ')
            const params: PgParam[] = []
            for (const entry of chunk) {
                const target = toSignalAddressParts(entry.address)
                params.push(
                    this.sessionId,
                    target.user,
                    target.server,
                    target.device,
                    encodeSignalSessionRecord(entry.session)
                )
            }
            await executor.query({
                name: this.stmtName(`session_upsert_batch_${chunk.length}`),
                text: `INSERT INTO ${this.t('signal_session')} (
                    session_id, "user", server, device, record
                ) VALUES ${placeholders}
                ON CONFLICT (session_id, "user", server, device) DO UPDATE SET
                    record = EXCLUDED.record`,
                values: params
            })
        }
        const sizes = this.powerOfTwoChunks(entries.length)
        if (sizes.length === 1) {
            await this.ensureReady()
            await runChunk(this.pool, entries)
            return
        }
        await this.withTransaction(async (client) => {
            let cursor = 0
            for (const size of sizes) {
                await runChunk(client, entries.slice(cursor, cursor + size))
                cursor += size
            }
        })
    }

    public async deleteSession(address: SignalAddress): Promise<void> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        await this.pool.query({
            name: this.stmtName('session_delete_session'),
            text: `DELETE FROM ${this.t('signal_session')}
             WHERE session_id = $1 AND "user" = $2 AND server = $3 AND device = $4`,
            values: [this.sessionId, target.user, target.server, target.device]
        })
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        await this.withTransaction(async (client) => {
            await client.query({
                name: this.stmtName('session_clear_session'),
                text: `DELETE FROM ${this.t('signal_session')} WHERE session_id = $1`,
                values: [this.sessionId]
            })
        })
    }

    // ── Private helpers ───────────────────────────────────────────────

    private async upsertSession(
        executor: { query: PoolClient['query'] },
        target: SignalAddressParts,
        session: SignalSessionRecord
    ): Promise<void> {
        await executor.query({
            name: this.stmtName('session_upsert_session'),
            text: `INSERT INTO ${this.t('signal_session')} (
                session_id, "user", server, device, record
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (session_id, "user", server, device) DO UPDATE SET
                record = EXCLUDED.record`,
            values: [
                this.sessionId,
                target.user,
                target.server,
                target.device,
                encodeSignalSessionRecord(session)
            ]
        })
    }
}
