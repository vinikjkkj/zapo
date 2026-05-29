import type { WaDeviceListSnapshot, WaDeviceListStore } from 'zapo-js/store'
import { TEXT_DECODER } from 'zapo-js/util'

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
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('device-list ttlMs must be a positive finite number')
        }
        this.ttlMs = ttlMs
    }

    public async upsertUserDevicesBatch(snapshots: readonly WaDeviceListSnapshot[]): Promise<void> {
        if (snapshots.length === 0) return
        await this.withTransaction(async (conn) => {
            for (const snapshot of snapshots) {
                await conn.execute(
                    `INSERT INTO ${this.t('device_list_cache')} (
                        session_id, user_jid, alt_user_jid, device_jids_json, updated_at_ms, expires_at_ms
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        alt_user_jid = VALUES(alt_user_jid),
                        device_jids_json = VALUES(device_jids_json),
                        updated_at_ms = VALUES(updated_at_ms),
                        expires_at_ms = VALUES(expires_at_ms)`,
                    [
                        this.sessionId,
                        snapshot.userJid,
                        snapshot.altUserJid ?? null,
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
                    `SELECT user_jid, alt_user_jid, device_jids_json, updated_at_ms, expires_at_ms
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
                activeByUserJid.set(userJid, decodeMysqlSnapshot(userJid, row))
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

    public async findByAnyUserJid(
        jid: string,
        nowMs = Date.now()
    ): Promise<WaDeviceListSnapshot | null> {
        await this.ensureReady()
        const rows = queryRows(
            await this.pool.execute(
                `SELECT user_jid, alt_user_jid, device_jids_json, updated_at_ms, expires_at_ms
                 FROM ${this.t('device_list_cache')}
                 WHERE session_id = ? AND (user_jid = ? OR alt_user_jid = ?)
                 LIMIT 1`,
                [this.sessionId, jid, jid]
            )
        )
        if (rows.length === 0) return null
        const row = rows[0]
        const expiresAtMs = Number(row.expires_at_ms)
        if (expiresAtMs <= nowMs) {
            const expiredUserJid = String(row.user_jid)
            await this.pool.execute(
                `DELETE FROM ${this.t('device_list_cache')} WHERE session_id = ? AND user_jid = ?`,
                [this.sessionId, expiredUserJid]
            )
            return null
        }
        return decodeMysqlSnapshot(String(row.user_jid), row)
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

function decodeMysqlSnapshot(userJid: string, row: Record<string, unknown>): WaDeviceListSnapshot {
    const rawJson =
        row.device_jids_json instanceof Uint8Array
            ? TEXT_DECODER.decode(row.device_jids_json)
            : String(row.device_jids_json)
    const parsed: unknown = JSON.parse(rawJson)
    if (!Array.isArray(parsed)) {
        throw new Error('device_list_cache.device_jids_json must be an array')
    }
    const altUserJid =
        row.alt_user_jid === null || row.alt_user_jid === undefined
            ? undefined
            : String(row.alt_user_jid)
    return {
        userJid,
        ...(altUserJid !== undefined ? { altUserJid } : {}),
        deviceJids: parsed.map((entry: unknown) => String(entry)),
        updatedAtMs: Number(row.updated_at_ms)
    }
}
