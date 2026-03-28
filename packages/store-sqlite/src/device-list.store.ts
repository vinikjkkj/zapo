import type { WaDeviceListSnapshot, WaDeviceListStore } from 'zapo-js/store'
import { asNumber, asString, resolvePositive } from 'zapo-js/util'

import { BaseSqliteStore } from './BaseSqliteStore'
import type { WaSqliteConnection } from './connection'
import { repeatSqlToken } from './sql-utils'
import type { WaSqliteStorageOptions } from './types'

interface DeviceListRow extends Record<string, unknown> {
    readonly user_jid: unknown
    readonly device_jids_json: unknown
    readonly updated_at_ms: unknown
    readonly expires_at_ms: unknown
}

const DEFAULTS = Object.freeze({
    ttlMs: 5 * 60 * 1000,
    batchSize: 500
} as const)

export class WaDeviceListSqliteStore extends BaseSqliteStore implements WaDeviceListStore {
    private readonly ttlMs: number
    private readonly batchSize: number

    public constructor(
        options: WaSqliteStorageOptions,
        ttlMs = DEFAULTS.ttlMs,
        batchSize?: number
    ) {
        super(options, ['deviceList'])
        this.ttlMs = ttlMs
        this.batchSize = resolvePositive(
            batchSize,
            DEFAULTS.batchSize,
            'deviceList.sqlite.batchSize'
        )
    }

    public async upsertUserDevicesBatch(snapshots: readonly WaDeviceListSnapshot[]): Promise<void> {
        if (snapshots.length === 0) {
            return
        }
        await this.withTransaction((db) => {
            for (const snapshot of snapshots) {
                this.upsertUserDevicesRow(db, snapshot)
            }
        })
    }

    public async getUserDevicesBatch(
        userJids: readonly string[],
        nowMs = Date.now()
    ): Promise<readonly (WaDeviceListSnapshot | null)[]> {
        if (userJids.length === 0) {
            return []
        }
        const uniqueUserJids = [...new Set(userJids)]
        return this.withTransaction((db) => {
            const activeByUserJid = new Map<string, WaDeviceListSnapshot>()
            const expiredUserJids: string[] = []
            for (let start = 0; start < uniqueUserJids.length; start += this.batchSize) {
                const end = Math.min(start + this.batchSize, uniqueUserJids.length)
                const batchLength = end - start
                const placeholders = repeatSqlToken('?', batchLength, ', ')
                const params: unknown[] = [this.options.sessionId]
                for (let index = start; index < end; index += 1) {
                    params.push(uniqueUserJids[index])
                }
                const rows = db.all<DeviceListRow>(
                    `SELECT user_jid, device_jids_json, updated_at_ms, expires_at_ms
                     FROM device_list_cache
                     WHERE session_id = ? AND user_jid IN (${placeholders})`,
                    params
                )
                for (const row of rows) {
                    const userJid = asString(row.user_jid, 'device_list_cache.user_jid')
                    const expiresAtMs = asNumber(
                        row.expires_at_ms,
                        'device_list_cache.expires_at_ms'
                    )
                    if (expiresAtMs <= nowMs) {
                        expiredUserJids.push(userJid)
                        continue
                    }
                    activeByUserJid.set(userJid, {
                        userJid,
                        deviceJids: decodeDeviceJids(row.device_jids_json),
                        updatedAtMs: asNumber(row.updated_at_ms, 'device_list_cache.updated_at_ms')
                    })
                }
            }
            if (expiredUserJids.length > 0) {
                this.deleteUserDevicesByJids(db, expiredUserJids)
            }
            const snapshots = new Array<WaDeviceListSnapshot | null>(userJids.length)
            for (let index = 0; index < userJids.length; index += 1) {
                snapshots[index] = activeByUserJid.get(userJids[index]) ?? null
            }
            return snapshots
        })
    }

    public async deleteUserDevices(userJid: string): Promise<number> {
        const db = await this.getConnection()
        db.run(
            `DELETE FROM device_list_cache
             WHERE session_id = ? AND user_jid = ?`,
            [this.options.sessionId, userJid]
        )
        const row = db.get<Record<string, unknown>>('SELECT changes() AS total', [])
        return row ? Number(row.total) : 0
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        const db = await this.getConnection()
        db.run(
            `DELETE FROM device_list_cache
             WHERE session_id = ? AND expires_at_ms <= ?`,
            [this.options.sessionId, nowMs]
        )
        const row = db.get<Record<string, unknown>>('SELECT changes() AS total', [])
        return row ? Number(row.total) : 0
    }

    public async clear(): Promise<void> {
        const db = await this.getConnection()
        db.run('DELETE FROM device_list_cache WHERE session_id = ?', [this.options.sessionId])
    }

    private upsertUserDevicesRow(db: WaSqliteConnection, snapshot: WaDeviceListSnapshot): void {
        db.run(
            `INSERT INTO device_list_cache (
                session_id,
                user_jid,
                device_jids_json,
                updated_at_ms,
                expires_at_ms
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(session_id, user_jid) DO UPDATE SET
                device_jids_json=excluded.device_jids_json,
                updated_at_ms=excluded.updated_at_ms,
                expires_at_ms=excluded.expires_at_ms`,
            [
                this.options.sessionId,
                snapshot.userJid,
                JSON.stringify(snapshot.deviceJids),
                snapshot.updatedAtMs,
                snapshot.updatedAtMs + this.ttlMs
            ]
        )
    }

    private deleteUserDevicesByJids(db: WaSqliteConnection, userJids: readonly string[]): void {
        if (userJids.length === 0) {
            return
        }
        for (let start = 0; start < userJids.length; start += this.batchSize) {
            const end = Math.min(start + this.batchSize, userJids.length)
            const batchLength = end - start
            const placeholders = repeatSqlToken('?', batchLength, ', ')
            const params: unknown[] = [this.options.sessionId]
            for (let index = start; index < end; index += 1) {
                params.push(userJids[index])
            }
            db.run(
                `DELETE FROM device_list_cache
                 WHERE session_id = ? AND user_jid IN (${placeholders})`,
                params
            )
        }
    }
}

function decodeDeviceJids(raw: unknown): readonly string[] {
    const json = asString(raw, 'device_list_cache.device_jids_json')
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) {
        throw new Error('device_list_cache.device_jids_json must be an array')
    }
    const deviceJids = new Array<string>(parsed.length)
    for (let index = 0; index < parsed.length; index += 1) {
        deviceJids[index] = asString(parsed[index], 'device_list_cache.device_jids_json entry')
    }
    return deviceJids
}
