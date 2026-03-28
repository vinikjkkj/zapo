import type { WaDeviceListSnapshot, WaDeviceListStore } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { affectedRows, queryRows } from './helpers'
import type { WaMysqlStorageOptions } from './types'

const DEFAULT_DEVICE_LIST_TTL_MS = 5 * 60 * 1000
const BATCH_SIZE = 500
const FIXED_IN_PLACEHOLDERS = Array.from({ length: BATCH_SIZE }, () => '?').join(', ')

export class WaDeviceListMysqlStore extends BaseMysqlStore implements WaDeviceListStore {
    private readonly ttlMs: number

    public constructor(options: WaMysqlStorageOptions, ttlMs = DEFAULT_DEVICE_LIST_TTL_MS) {
        super(options, ['deviceList'])
        if (!Number.isFinite(ttlMs) || ttlMs < 0) {
            throw new Error('device-list ttlMs must be a non-negative finite number')
        }
        this.ttlMs = ttlMs
    }

    public async upsertUserDevicesBatch(snapshots: readonly WaDeviceListSnapshot[]): Promise<void> {
        if (snapshots.length === 0) return
        await this.withTransaction(async (conn) => {
            for (const snapshot of snapshots) {
                await conn.execute(
                    `INSERT INTO ${this.t('device_list_cache')} (
                        session_id, user_jid, device_jids_json, updated_at_ms, expires_at_ms
                    ) VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        device_jids_json = VALUES(device_jids_json),
                        updated_at_ms = VALUES(updated_at_ms),
                        expires_at_ms = VALUES(expires_at_ms)`,
                    [
                        this.sessionId,
                        snapshot.userJid,
                        JSON.stringify(snapshot.deviceJids),
                        snapshot.updatedAtMs,
                        snapshot.updatedAtMs + this.ttlMs
                    ]
                )
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
            while (batch.length < BATCH_SIZE) batch.push('')
            const rows = queryRows(
                await this.pool.execute(
                    `SELECT user_jid, device_jids_json, updated_at_ms, expires_at_ms
                     FROM ${this.t('device_list_cache')}
                     WHERE session_id = ? AND user_jid IN (${FIXED_IN_PLACEHOLDERS})`,
                    [this.sessionId, ...batch]
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
                while (batch.length < BATCH_SIZE) batch.push('')
                await this.pool.execute(
                    `DELETE FROM ${this.t('device_list_cache')}
                     WHERE session_id = ? AND expires_at_ms <= ? AND user_jid IN (${FIXED_IN_PLACEHOLDERS})`,
                    [this.sessionId, nowMs, ...batch]
                )
            }
        }

        return userJids.map((jid) => activeByUserJid.get(jid) ?? null)
    }

    public async deleteUserDevices(userJid: string): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.execute(
                `DELETE FROM ${this.t('device_list_cache')}
             WHERE session_id = ? AND user_jid = ?`,
                [this.sessionId, userJid]
            )
        )
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.execute(
                `DELETE FROM ${this.t('device_list_cache')}
             WHERE session_id = ? AND expires_at_ms <= ?`,
                [this.sessionId, nowMs]
            )
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(`DELETE FROM ${this.t('device_list_cache')} WHERE session_id = ?`, [
            this.sessionId
        ])
    }
}
