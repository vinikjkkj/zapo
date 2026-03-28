import type { WaDeviceListSnapshot, WaDeviceListStore } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { affectedRows, queryRows } from './helpers'
import type { PgParam, WaPgStorageOptions } from './types'

const DEFAULT_DEVICE_LIST_TTL_MS = 5 * 60 * 1000
const BATCH_SIZE = 500

export class WaDeviceListPgStore extends BasePgStore implements WaDeviceListStore {
    private readonly ttlMs: number

    public constructor(options: WaPgStorageOptions, ttlMs = DEFAULT_DEVICE_LIST_TTL_MS) {
        super(options, ['deviceList'])
        if (!Number.isFinite(ttlMs) || ttlMs < 0) {
            throw new Error('device-list ttlMs must be a non-negative finite number')
        }
        this.ttlMs = ttlMs
    }

    public async upsertUserDevicesBatch(snapshots: readonly WaDeviceListSnapshot[]): Promise<void> {
        if (snapshots.length === 0) return
        await this.withTransaction(async (client) => {
            for (const snapshot of snapshots) {
                await client.query({
                    name: this.stmtName('devlist_upsert'),
                    text: `INSERT INTO ${this.t('device_list_cache')} (
                        session_id, user_jid, device_jids_json, updated_at_ms, expires_at_ms
                    ) VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (session_id, user_jid) DO UPDATE SET
                        device_jids_json = EXCLUDED.device_jids_json,
                        updated_at_ms = EXCLUDED.updated_at_ms,
                        expires_at_ms = EXCLUDED.expires_at_ms`,
                    values: [
                        this.sessionId,
                        snapshot.userJid,
                        JSON.stringify(snapshot.deviceJids),
                        snapshot.updatedAtMs,
                        snapshot.updatedAtMs + this.ttlMs
                    ]
                })
            }
        })
    }

    public async getUserDevicesBatch(
        userJids: readonly string[],
        nowMs = Date.now()
    ): Promise<readonly (WaDeviceListSnapshot | null)[]> {
        if (userJids.length === 0) return []
        await this.ensureReady()

        const uniqueUserJids = [...new Set(userJids)]
        const activeByUserJid = new Map<string, WaDeviceListSnapshot>()
        const expiredUserJids: string[] = []

        for (let start = 0; start < uniqueUserJids.length; start += BATCH_SIZE) {
            const batch = uniqueUserJids.slice(start, start + BATCH_SIZE)
            let paramIdx = 2
            const placeholders = batch.map(() => `$${paramIdx++}`).join(', ')
            const params: PgParam[] = [this.sessionId, ...batch]
            const rows = queryRows(
                await this.pool.query(
                    `SELECT user_jid, device_jids_json, updated_at_ms, expires_at_ms
                     FROM ${this.t('device_list_cache')}
                     WHERE session_id = $1 AND user_jid IN (${placeholders})`,
                    params
                )
            )
            for (const row of rows) {
                const userJid = String(row.user_jid)
                const expiresAtMs = Number(row.expires_at_ms)
                if (expiresAtMs <= nowMs) {
                    expiredUserJids.push(userJid)
                    continue
                }
                const parsed: unknown = JSON.parse(row.device_jids_json as string)
                if (!Array.isArray(parsed)) {
                    throw new Error('device_list_cache.device_jids_json must be an array')
                }
                activeByUserJid.set(userJid, {
                    userJid,
                    deviceJids: parsed.map((entry: unknown) => String(entry)),
                    updatedAtMs: Number(row.updated_at_ms)
                })
            }
        }

        if (expiredUserJids.length > 0) {
            for (let start = 0; start < expiredUserJids.length; start += BATCH_SIZE) {
                const batch = expiredUserJids.slice(start, start + BATCH_SIZE)
                let paramIdx = 3
                const placeholders = batch.map(() => `$${paramIdx++}`).join(', ')
                const params: PgParam[] = [this.sessionId, nowMs, ...batch]
                await this.pool.query(
                    `DELETE FROM ${this.t('device_list_cache')}
                     WHERE session_id = $1 AND expires_at_ms <= $2 AND user_jid IN (${placeholders})`,
                    params
                )
            }
        }

        return userJids.map((jid) => activeByUserJid.get(jid) ?? null)
    }

    public async deleteUserDevices(userJid: string): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.query({
                name: this.stmtName('devlist_delete_user'),
                text: `DELETE FROM ${this.t('device_list_cache')}
                 WHERE session_id = $1 AND user_jid = $2`,
                values: [this.sessionId, userJid]
            })
        )
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.query({
                name: this.stmtName('devlist_cleanup'),
                text: `DELETE FROM ${this.t('device_list_cache')}
                 WHERE session_id = $1 AND expires_at_ms <= $2`,
                values: [this.sessionId, nowMs]
            })
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('devlist_clear'),
            text: `DELETE FROM ${this.t('device_list_cache')} WHERE session_id = $1`,
            values: [this.sessionId]
        })
    }
}
