import type { PoolConnection } from 'mysql2/promise'
import { signalAddressKey } from 'zapo-js/protocol'
import type { SignalAddress, SignalSessionRecord } from 'zapo-js/signal'
import {
    encodeSignalSessionRecord,
    decodeSignalSessionRecord,
    toSignalAddressParts,
    type SignalAddressParts
} from 'zapo-js/signal'
import type { WaSessionStore } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { queryFirst, queryRows, toBytes } from './helpers'
import type { MysqlParam, WaMysqlStorageOptions } from './types'

const BATCH_SIZE = 250
const FIXED_ADDR_PLACEHOLDERS = Array.from(
    { length: BATCH_SIZE },
    () => '(user = ? AND server = ? AND device = ?)'
).join(' OR ')
const NO_MATCH_ADDRESS: SignalAddressParts = { user: '', server: '', device: -1 }

export class WaSessionMysqlStore extends BaseMysqlStore implements WaSessionStore {
    public constructor(options: WaMysqlStorageOptions) {
        super(options, ['signal'])
    }

    // ── Sessions ──────────────────────────────────────────────────────

    public async hasSession(address: SignalAddress): Promise<boolean> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        return (
            queryRows(
                await this.pool.execute(
                    `SELECT 1 AS has_session
             FROM ${this.t('signal_session')}
             WHERE session_id = ? AND user = ? AND server = ? AND device = ?
             LIMIT 1`,
                    [this.sessionId, target.user, target.server, target.device]
                )
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
            while (batch.length < BATCH_SIZE) batch.push(NO_MATCH_ADDRESS)
            const params: MysqlParam[] = [
                this.sessionId,
                ...batch.flatMap((t) => [t.user, t.server, t.device])
            ]
            const rows = queryRows(
                await this.pool.execute(
                    `SELECT user, server, device
                 FROM ${this.t('signal_session')}
                 WHERE session_id = ? AND (${FIXED_ADDR_PLACEHOLDERS})`,
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
            await this.pool.execute(
                `SELECT record
             FROM ${this.t('signal_session')}
             WHERE session_id = ? AND user = ? AND server = ? AND device = ?`,
                [this.sessionId, target.user, target.server, target.device]
            )
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
            while (batch.length < BATCH_SIZE) batch.push(NO_MATCH_ADDRESS)
            const params: MysqlParam[] = [
                this.sessionId,
                ...batch.flatMap((t) => [t.user, t.server, t.device])
            ]
            const rows = queryRows(
                await this.pool.execute(
                    `SELECT user, server, device, record
                 FROM ${this.t('signal_session')}
                 WHERE session_id = ? AND (${FIXED_ADDR_PLACEHOLDERS})`,
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
        await this.withTransaction(async (conn) => {
            for (const entry of entries) {
                const target = toSignalAddressParts(entry.address)
                await this.upsertSession(conn, target, entry.session)
            }
        })
    }

    public async deleteSession(address: SignalAddress): Promise<void> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        await this.pool.execute(
            `DELETE FROM ${this.t('signal_session')}
             WHERE session_id = ? AND user = ? AND server = ? AND device = ?`,
            [this.sessionId, target.user, target.server, target.device]
        )
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        await this.withTransaction(async (conn) => {
            await conn.execute(`DELETE FROM ${this.t('signal_session')} WHERE session_id = ?`, [
                this.sessionId
            ])
        })
    }

    // ── Private helpers ───────────────────────────────────────────────

    private async upsertSession(
        executor: { execute: PoolConnection['execute'] },
        target: SignalAddressParts,
        session: SignalSessionRecord
    ): Promise<void> {
        await executor.execute(
            `INSERT INTO ${this.t('signal_session')} (
                session_id, user, server, device, record
            ) VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                record = VALUES(record)`,
            [
                this.sessionId,
                target.user,
                target.server,
                target.device,
                encodeSignalSessionRecord(session)
            ]
        )
    }
}
