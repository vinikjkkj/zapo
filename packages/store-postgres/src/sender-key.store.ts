import type { PoolClient } from 'pg'
import type { SenderKeyDistributionRecord, SenderKeyRecord, SignalAddress } from 'zapo-js/signal'
import {
    encodeSenderKeyRecord,
    decodeSenderKeyRecord,
    toSignalAddressParts,
    type SignalAddressParts
} from 'zapo-js/signal'
import type { WaSenderKeyStore } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { affectedRows, queryFirst, queryRows, toBytes } from './helpers'
import type { PgParam, WaPgStorageOptions } from './types'

const BATCH_SIZE = 250

export class WaSenderKeyPgStore extends BasePgStore implements WaSenderKeyStore {
    public constructor(options: WaPgStorageOptions) {
        super(options, ['senderKey'])
    }

    public async upsertSenderKey(record: SenderKeyRecord): Promise<void> {
        await this.ensureReady()
        const sender = toSignalAddressParts(record.sender)
        await this.pool.query({
            name: this.stmtName('sk_upsert'),
            text: `INSERT INTO ${this.t('sender_keys')} (
                session_id, group_id, sender_user, sender_server, sender_device, record
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (session_id, group_id, sender_user, sender_server, sender_device) DO UPDATE SET
                record = EXCLUDED.record`,
            values: [
                this.sessionId,
                record.groupId,
                sender.user,
                sender.server,
                sender.device,
                encodeSenderKeyRecord(record)
            ]
        })
    }

    public async upsertSenderKeyDistribution(record: SenderKeyDistributionRecord): Promise<void> {
        await this.ensureReady()
        const sender = toSignalAddressParts(record.sender)
        await this.upsertSenderKeyDistributionRow(this.pool, record, sender)
    }

    public async upsertSenderKeyDistributions(
        records: readonly SenderKeyDistributionRecord[]
    ): Promise<void> {
        if (records.length === 0) return
        await this.withTransaction(async (client) => {
            for (const record of records) {
                const sender = toSignalAddressParts(record.sender)
                await this.upsertSenderKeyDistributionRow(client, record, sender)
            }
        })
    }

    public async getGroupSenderKeyList(groupId: string): Promise<{
        readonly skList: readonly SenderKeyRecord[]
        readonly skDistribList: readonly SenderKeyDistributionRecord[]
    }> {
        return this.withTransaction(async (client) => {
            const senderRows = queryRows(
                await client.query({
                    name: this.stmtName('sk_list_by_group'),
                    text: `SELECT group_id, sender_user, sender_server, sender_device, record
                     FROM ${this.t('sender_keys')}
                     WHERE session_id = $1 AND group_id = $2`,
                    values: [this.sessionId, groupId]
                })
            )
            const distributionRows = queryRows(
                await client.query({
                    name: this.stmtName('sk_distrib_list_by_group'),
                    text: `SELECT group_id, sender_user, sender_server, sender_device, key_id, timestamp_ms
                     FROM ${this.t('sender_key_distribution')}
                     WHERE session_id = $1 AND group_id = $2`,
                    values: [this.sessionId, groupId]
                })
            )

            const skList: SenderKeyRecord[] = senderRows.map((row) =>
                decodeSenderKeyRecord(toBytes(row.record), String(row.group_id), {
                    user: String(row.sender_user),
                    server: String(row.sender_server),
                    device: Number(row.sender_device)
                })
            )

            const skDistribList: SenderKeyDistributionRecord[] = distributionRows.map((row) => ({
                groupId: String(row.group_id),
                sender: {
                    user: String(row.sender_user),
                    server: String(row.sender_server),
                    device: Number(row.sender_device)
                },
                keyId: Number(row.key_id),
                timestampMs: Number(row.timestamp_ms)
            }))

            return { skList, skDistribList }
        })
    }

    public async getDeviceSenderKey(
        groupId: string,
        sender: SignalAddress
    ): Promise<SenderKeyRecord | null> {
        await this.ensureReady()
        const target = toSignalAddressParts(sender)
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('sk_get_device'),
                text: `SELECT group_id, sender_user, sender_server, sender_device, record
                 FROM ${this.t('sender_keys')}
                 WHERE session_id = $1
                   AND group_id = $2
                   AND sender_user = $3
                   AND sender_server = $4
                   AND sender_device = $5`,
                values: [this.sessionId, groupId, target.user, target.server, target.device]
            })
        )
        if (!row) return null
        return decodeSenderKeyRecord(toBytes(row.record), String(row.group_id), {
            user: String(row.sender_user),
            server: String(row.sender_server),
            device: Number(row.sender_device)
        })
    }

    public async getDeviceSenderKeyDistributions(
        groupId: string,
        senders: readonly SignalAddress[]
    ): Promise<readonly (SenderKeyDistributionRecord | null)[]> {
        if (senders.length === 0) return []
        await this.ensureReady()
        const targets = senders.map((s) => toSignalAddressParts(s))
        const byKey = new Map<string, SenderKeyDistributionRecord>()
        for (let start = 0; start < targets.length; start += BATCH_SIZE) {
            const batch = targets.slice(start, start + BATCH_SIZE)
            let paramIdx = 3
            const senderClauses = batch
                .map(() => {
                    const clause = `(sender_user = $${paramIdx} AND sender_server = $${paramIdx + 1} AND sender_device = $${paramIdx + 2})`
                    paramIdx += 3
                    return clause
                })
                .join(' OR ')
            const params: PgParam[] = [
                this.sessionId,
                groupId,
                ...batch.flatMap((t) => [t.user, t.server, t.device])
            ]
            const rows = queryRows(
                await this.pool.query(
                    `SELECT group_id, sender_user, sender_server, sender_device, key_id, timestamp_ms
                     FROM ${this.t('sender_key_distribution')}
                     WHERE session_id = $1 AND group_id = $2 AND (${senderClauses})`,
                    params
                )
            )
            for (const row of rows) {
                const key = this.distributionTargetKey(
                    String(row.sender_user),
                    String(row.sender_server),
                    Number(row.sender_device)
                )
                byKey.set(key, {
                    groupId: String(row.group_id),
                    sender: {
                        user: String(row.sender_user),
                        server: String(row.sender_server),
                        device: Number(row.sender_device)
                    },
                    keyId: Number(row.key_id),
                    timestampMs: Number(row.timestamp_ms)
                })
            }
        }
        return targets.map(
            (t) => byKey.get(this.distributionTargetKey(t.user, t.server, t.device)) ?? null
        )
    }

    public async deleteDeviceSenderKey(target: SignalAddress, groupId?: string): Promise<number> {
        const sender = toSignalAddressParts(target)
        return this.withTransaction(async (client) => {
            const senderCount = await this.countDelete(client, 'sender_keys', sender, groupId)
            const distributionCount = await this.countDelete(
                client,
                'sender_key_distribution',
                sender,
                groupId
            )
            return senderCount + distributionCount
        })
    }

    public async markForgetSenderKey(
        groupId: string,
        participants: readonly SignalAddress[]
    ): Promise<number> {
        if (participants.length === 0) return 0
        return this.withTransaction(async (client) => {
            let total = 0
            for (let start = 0; start < participants.length; start += BATCH_SIZE) {
                const batch = participants.slice(start, start + BATCH_SIZE)
                let paramIdx = 3
                const senderClauses = batch
                    .map(() => {
                        const clause = `(sender_user = $${paramIdx} AND sender_server = $${paramIdx + 1} AND sender_device = $${paramIdx + 2})`
                        paramIdx += 3
                        return clause
                    })
                    .join(' OR ')
                const senderParams: PgParam[] = batch.flatMap((p) => {
                    const sender = toSignalAddressParts(p)
                    return [sender.user, sender.server, sender.device]
                })
                const where = `session_id = $1 AND group_id = $2 AND (${senderClauses})`
                const params: PgParam[] = [this.sessionId, groupId, ...senderParams]
                total += affectedRows(
                    await client.query(
                        `DELETE FROM ${this.t('sender_keys')} WHERE ${where}`,
                        params
                    )
                )
                total += affectedRows(
                    await client.query(
                        `DELETE FROM ${this.t('sender_key_distribution')} WHERE ${where}`,
                        params
                    )
                )
            }
            return total
        })
    }

    public async clear(): Promise<void> {
        await this.withTransaction(async (client) => {
            await client.query({
                name: this.stmtName('sk_clear_keys'),
                text: `DELETE FROM ${this.t('sender_keys')} WHERE session_id = $1`,
                values: [this.sessionId]
            })
            await client.query({
                name: this.stmtName('sk_clear_distrib'),
                text: `DELETE FROM ${this.t('sender_key_distribution')} WHERE session_id = $1`,
                values: [this.sessionId]
            })
        })
    }

    // ── Private helpers ───────────────────────────────────────────────

    private async upsertSenderKeyDistributionRow(
        executor: { query: PoolClient['query'] },
        record: SenderKeyDistributionRecord,
        sender: SignalAddressParts
    ): Promise<void> {
        await executor.query({
            name: this.stmtName('sk_upsert_distrib'),
            text: `INSERT INTO ${this.t('sender_key_distribution')} (
                session_id, group_id, sender_user, sender_server, sender_device,
                key_id, timestamp_ms
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (session_id, group_id, sender_user, sender_server, sender_device) DO UPDATE SET
                key_id = EXCLUDED.key_id,
                timestamp_ms = EXCLUDED.timestamp_ms`,
            values: [
                this.sessionId,
                record.groupId,
                sender.user,
                sender.server,
                sender.device,
                record.keyId,
                record.timestampMs
            ]
        })
    }

    private async countDelete(
        client: PoolClient,
        table: 'sender_keys' | 'sender_key_distribution',
        target: SignalAddressParts,
        groupId?: string
    ): Promise<number> {
        const whereBase =
            'session_id = $1 AND sender_user = $2 AND sender_server = $3 AND sender_device = $4'
        const where = groupId ? `${whereBase} AND group_id = $5` : whereBase
        const params: PgParam[] = groupId
            ? [this.sessionId, target.user, target.server, target.device, groupId]
            : [this.sessionId, target.user, target.server, target.device]
        const suffix = table === 'sender_keys' ? 'keys' : 'distrib'
        const variant = groupId ? 'group' : 'all'

        return affectedRows(
            await client.query({
                name: this.stmtName(`sk_delete_device_${suffix}_${variant}`),
                text: `DELETE FROM ${this.t(table)} WHERE ${where}`,
                values: params
            })
        )
    }

    private distributionTargetKey(user: string, server: string, device: number): string {
        return `${user}|${server}|${device}`
    }
}
