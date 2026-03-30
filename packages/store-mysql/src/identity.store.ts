import type { PoolConnection } from 'mysql2/promise'
import { signalAddressKey } from 'zapo-js/protocol'
import type { SignalAddress } from 'zapo-js/signal'
import { toSignalAddressParts, type SignalAddressParts } from 'zapo-js/signal'
import type { WaIdentityStore } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { queryFirst, queryRows, toBytes } from './helpers'
import type { MysqlParam, WaMysqlStorageOptions } from './types'

const BATCH_SIZE = 250
const FIXED_ADDR_PLACEHOLDERS = Array.from(
    { length: BATCH_SIZE },
    () => '(user = ? AND server = ? AND device = ?)'
).join(' OR ')
const NO_MATCH_ADDRESS: SignalAddressParts = { user: '', server: '', device: -1 }

export class WaIdentityMysqlStore extends BaseMysqlStore implements WaIdentityStore {
    public constructor(options: WaMysqlStorageOptions) {
        super(options, ['signal'])
    }

    // ── Identities ────────────────────────────────────────────────────

    public async getRemoteIdentity(address: SignalAddress): Promise<Uint8Array | null> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        const row = queryFirst(
            await this.pool.execute(
                `SELECT identity_key
             FROM ${this.t('signal_identity')}
             WHERE session_id = ? AND user = ? AND server = ? AND device = ?`,
                [this.sessionId, target.user, target.server, target.device]
            )
        )
        if (!row) return null
        return toBytes(row.identity_key)
    }

    public async getRemoteIdentities(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (Uint8Array | null)[]> {
        if (addresses.length === 0) return []
        await this.ensureReady()
        const targets = addresses.map((a) => toSignalAddressParts(a))
        const byKey = new Map<string, Uint8Array>()
        for (let start = 0; start < targets.length; start += BATCH_SIZE) {
            const batch = targets.slice(start, start + BATCH_SIZE)
            while (batch.length < BATCH_SIZE) batch.push(NO_MATCH_ADDRESS)
            const params: MysqlParam[] = [
                this.sessionId,
                ...batch.flatMap((t) => [t.user, t.server, t.device])
            ]
            const rows = queryRows(
                await this.pool.execute(
                    `SELECT user, server, device, identity_key
                 FROM ${this.t('signal_identity')}
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
                    toBytes(row.identity_key)
                )
            }
        }
        return targets.map((t) => byKey.get(signalAddressKey(t)) ?? null)
    }

    public async setRemoteIdentity(address: SignalAddress, identityKey: Uint8Array): Promise<void> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        await this.upsertRemoteIdentity(this.pool, target, identityKey)
    }

    public async setRemoteIdentities(
        entries: readonly {
            readonly address: SignalAddress
            readonly identityKey: Uint8Array
        }[]
    ): Promise<void> {
        if (entries.length === 0) return
        await this.withTransaction(async (conn) => {
            for (const entry of entries) {
                const target = toSignalAddressParts(entry.address)
                await this.upsertRemoteIdentity(conn, target, entry.identityKey)
            }
        })
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        await this.withTransaction(async (conn) => {
            await conn.execute(`DELETE FROM ${this.t('signal_identity')} WHERE session_id = ?`, [
                this.sessionId
            ])
        })
    }

    // ── Private helpers ───────────────────────────────────────────────

    private async upsertRemoteIdentity(
        executor: { execute: PoolConnection['execute'] },
        target: SignalAddressParts,
        identityKey: Uint8Array
    ): Promise<void> {
        await executor.execute(
            `INSERT INTO ${this.t('signal_identity')} (
                session_id, user, server, device, identity_key
            ) VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                identity_key = VALUES(identity_key)`,
            [this.sessionId, target.user, target.server, target.device, identityKey]
        )
    }
}
