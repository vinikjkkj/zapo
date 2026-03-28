import type { PoolConnection } from 'mysql2/promise'
import type { SenderKeyDistributionRecord, SenderKeyRecord, SignalAddress } from 'zapo-js/signal'
import {
    encodeSenderKeyRecord,
    decodeSenderKeyRecord,
    toSignalAddressParts,
    type SignalAddressParts
} from 'zapo-js/signal'
import type { WaSenderKeyStore } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { affectedRows, queryFirst, queryRows, toBytes } from './helpers'
import type { MysqlParam } from './types'
import type { WaMysqlStorageOptions } from './types'

const BATCH_SIZE = 250

export class WaSenderKeyMysqlStore extends BaseMysqlStore implements WaSenderKeyStore {
    public constructor(options: WaMysqlStorageOptions) {
        super(options, ['senderKey'])
    }

    public async upsertSenderKey(record: SenderKeyRecord): Promise<void> {
        await this.ensureReady()
        const sender = toSignalAddressParts(record.sender)
        await this.pool.execute(
            `INSERT INTO ${this.t('sender_keys')} (
                session_id, group_id, sender_user, sender_server, sender_device, record
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                record = VALUES(record)`,
            [
                this.sessionId,
                record.groupId,
                sender.user,
                sender.server,
                sender.device,
                encodeSenderKeyRecord(record)
            ]
        )
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
        await this.withTransaction(async (conn) => {
            for (const record of records) {
                const sender = toSignalAddressParts(record.sender)
                await this.upsertSenderKeyDistributionRow(conn, record, sender)
            }
        })
    }

    public async getGroupSenderKeyList(groupId: string): Promise<{
        readonly skList: readonly SenderKeyRecord[]
        readonly skDistribList: readonly SenderKeyDistributionRecord[]
    }> {
        await this.ensureReady()
        const senderRows = queryRows(
            await this.pool.execute(
                `SELECT group_id, sender_user, sender_server, sender_device, record
             FROM ${this.t('sender_keys')}
             WHERE session_id = ? AND group_id = ?`,
                [this.sessionId, groupId]
            )
        )
        const distributionRows = queryRows(
            await this.pool.execute(
                `SELECT group_id, sender_user, sender_server, sender_device, key_id, timestamp_ms
             FROM ${this.t('sender_key_distribution')}
             WHERE session_id = ? AND group_id = ?`,
                [this.sessionId, groupId]
            )
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
    }

    public async getDeviceSenderKey(
        groupId: string,
        sender: SignalAddress
    ): Promise<SenderKeyRecord | null> {
        await this.ensureReady()
        const target = toSignalAddressParts(sender)
        const row = queryFirst(
            await this.pool.execute(
                `SELECT group_id, sender_user, sender_server, sender_device, record
             FROM ${this.t('sender_keys')}
             WHERE session_id = ?
               AND group_id = ?
               AND sender_user = ?
               AND sender_server = ?
               AND sender_device = ?`,
                [this.sessionId, groupId, target.user, target.server, target.device]
            )
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
            const placeholders = batch
                .map(() => '(sender_user = ? AND sender_server = ? AND sender_device = ?)')
                .join(' OR ')
            const params: MysqlParam[] = [
                this.sessionId,
                groupId,
                ...batch.flatMap((t) => [t.user, t.server, t.device])
            ]
            const rows = queryRows(
                await this.pool.execute(
                    `SELECT group_id, sender_user, sender_server, sender_device, key_id, timestamp_ms
                     FROM ${this.t('sender_key_distribution')}
                     WHERE session_id = ? AND group_id = ? AND (${placeholders})`,
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
        return this.withTransaction(async (conn) => {
            const senderCount = await this.countDelete(conn, 'sender_keys', sender, groupId)
            const distributionCount = await this.countDelete(
                conn,
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
        return this.withTransaction(async (conn) => {
            let total = 0
            for (let start = 0; start < participants.length; start += BATCH_SIZE) {
                const batch = participants.slice(start, start + BATCH_SIZE)
                const filters: string[] = []
                const senderParams: MysqlParam[] = []
                for (const participant of batch) {
                    const sender = toSignalAddressParts(participant)
                    filters.push('(sender_user = ? AND sender_server = ? AND sender_device = ?)')
                    senderParams.push(sender.user, sender.server, sender.device)
                }
                const where = `session_id = ? AND group_id = ? AND (${filters.join(' OR ')})`
                const params: MysqlParam[] = [this.sessionId, groupId, ...senderParams]
                total += affectedRows(
                    await conn.execute(
                        `DELETE FROM ${this.t('sender_keys')} WHERE ${where}`,
                        params
                    )
                )
                total += affectedRows(
                    await conn.execute(
                        `DELETE FROM ${this.t('sender_key_distribution')} WHERE ${where}`,
                        params
                    )
                )
            }
            return total
        })
    }

    public async clear(): Promise<void> {
        await this.withTransaction(async (conn) => {
            await conn.execute(`DELETE FROM ${this.t('sender_keys')} WHERE session_id = ?`, [
                this.sessionId
            ])
            await conn.execute(
                `DELETE FROM ${this.t('sender_key_distribution')} WHERE session_id = ?`,
                [this.sessionId]
            )
        })
    }

    // ── Private helpers ───────────────────────────────────────────────

    private async upsertSenderKeyDistributionRow(
        executor: { execute: PoolConnection['execute'] },
        record: SenderKeyDistributionRecord,
        sender: SignalAddressParts
    ): Promise<void> {
        await executor.execute(
            `INSERT INTO ${this.t('sender_key_distribution')} (
                session_id, group_id, sender_user, sender_server, sender_device,
                key_id, timestamp_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                key_id = VALUES(key_id),
                timestamp_ms = VALUES(timestamp_ms)`,
            [
                this.sessionId,
                record.groupId,
                sender.user,
                sender.server,
                sender.device,
                record.keyId,
                record.timestampMs
            ]
        )
    }

    private async countDelete(
        conn: PoolConnection,
        table: 'sender_keys' | 'sender_key_distribution',
        target: SignalAddressParts,
        groupId?: string
    ): Promise<number> {
        const whereBase =
            'session_id = ? AND sender_user = ? AND sender_server = ? AND sender_device = ?'
        const where = groupId ? `${whereBase} AND group_id = ?` : whereBase
        const params: MysqlParam[] = groupId
            ? [this.sessionId, target.user, target.server, target.device, groupId]
            : [this.sessionId, target.user, target.server, target.device]

        return affectedRows(
            await conn.execute(`DELETE FROM ${this.t(table)} WHERE ${where}`, params)
        )
    }

    private distributionTargetKey(user: string, server: string, device: number): string {
        return `${user}|${server}|${device}`
    }
}
