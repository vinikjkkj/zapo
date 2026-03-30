import type { PoolClient } from 'pg'
import { signalAddressKey } from 'zapo-js/protocol'
import type { SignalAddress } from 'zapo-js/signal'
import { toSignalAddressParts, type SignalAddressParts } from 'zapo-js/signal'
import type { WaIdentityStore } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { queryFirst, queryRows, toBytes } from './helpers'
import type { PgParam, WaPgStorageOptions } from './types'

const BATCH_SIZE = 250

export class WaIdentityPgStore extends BasePgStore implements WaIdentityStore {
    public constructor(options: WaPgStorageOptions) {
        super(options, ['signal'])
    }

    // ── Identities ────────────────────────────────────────────────────

    public async getRemoteIdentity(address: SignalAddress): Promise<Uint8Array | null> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('identity_get_remote_identity'),
                text: `SELECT identity_key
                 FROM ${this.t('signal_identity')}
                 WHERE session_id = $1 AND "user" = $2 AND server = $3 AND device = $4`,
                values: [this.sessionId, target.user, target.server, target.device]
            })
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
                    `SELECT "user", server, device, identity_key
                     FROM ${this.t('signal_identity')}
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
        await this.withTransaction(async (client) => {
            for (const entry of entries) {
                const target = toSignalAddressParts(entry.address)
                await this.upsertRemoteIdentity(client, target, entry.identityKey)
            }
        })
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        await this.withTransaction(async (client) => {
            await client.query({
                name: this.stmtName('identity_clear_identity'),
                text: `DELETE FROM ${this.t('signal_identity')} WHERE session_id = $1`,
                values: [this.sessionId]
            })
        })
    }

    // ── Private helpers ───────────────────────────────────────────────

    private async upsertRemoteIdentity(
        executor: { query: PoolClient['query'] },
        target: SignalAddressParts,
        identityKey: Uint8Array
    ): Promise<void> {
        await executor.query({
            name: this.stmtName('identity_upsert_remote_identity'),
            text: `INSERT INTO ${this.t('signal_identity')} (
                session_id, "user", server, device, identity_key
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (session_id, "user", server, device) DO UPDATE SET
                identity_key = EXCLUDED.identity_key`,
            values: [this.sessionId, target.user, target.server, target.device, identityKey]
        })
    }
}
