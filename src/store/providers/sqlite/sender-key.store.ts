import {
    decodeSenderKeyDistributionRow,
    decodeSenderKeyRecord,
    encodeSenderKeyRecord,
    toSignalAddressParts,
    type SenderKeyDistributionRow,
    type SenderKeyRow,
    type SignalAddressParts
} from '@signal/encoding'
import type { SenderKeyDistributionRecord, SenderKeyRecord, SignalAddress } from '@signal/types'
import type { WaSenderKeyStore as WaSenderKeyStoreContract } from '@store/contracts/sender-key.store'
import { BaseSqliteStore } from '@store/providers/sqlite/BaseSqliteStore'
import type { WaSqliteConnection } from '@store/providers/sqlite/connection'
import { repeatSqlToken } from '@store/providers/sqlite/sql-utils'
import type { WaSqliteStorageOptions } from '@store/types'
import { asNumber, asString, resolvePositive } from '@util/coercion'

const DEFAULTS = Object.freeze({
    distributionBatchSize: 250
} as const)

export class SenderKeySqliteStore extends BaseSqliteStore implements WaSenderKeyStoreContract {
    private readonly distributionBatchSize: number

    public constructor(options: WaSqliteStorageOptions, distributionBatchSize?: number) {
        super(options, ['senderKey'])
        this.distributionBatchSize = resolvePositive(
            distributionBatchSize,
            DEFAULTS.distributionBatchSize,
            'senderKey.sqlite.distributionBatchSize'
        )
    }

    public async upsertSenderKey(record: SenderKeyRecord): Promise<void> {
        const db = await this.getConnection()
        const sender = toSignalAddressParts(record.sender)
        db.run(
            `INSERT INTO sender_keys (
                session_id,
                group_id,
                sender_user,
                sender_server,
                sender_device,
                record
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, group_id, sender_user, sender_server, sender_device) DO UPDATE SET
                record=excluded.record`,
            [
                this.options.sessionId,
                record.groupId,
                sender.user,
                sender.server,
                sender.device,
                encodeSenderKeyRecord(record)
            ]
        )
    }

    public async upsertSenderKeyDistribution(record: SenderKeyDistributionRecord): Promise<void> {
        const db = await this.getConnection()
        const sender = toSignalAddressParts(record.sender)
        this.upsertSenderKeyDistributionRow(db, record, sender)
    }

    public async upsertSenderKeyDistributions(
        records: readonly SenderKeyDistributionRecord[]
    ): Promise<void> {
        if (records.length === 0) {
            return
        }
        await this.withTransaction((db) => {
            for (const record of records) {
                const sender = toSignalAddressParts(record.sender)
                this.upsertSenderKeyDistributionRow(db, record, sender)
            }
        })
    }

    public async getGroupSenderKeyList(groupId: string): Promise<{
        readonly skList: readonly SenderKeyRecord[]
        readonly skDistribList: readonly SenderKeyDistributionRecord[]
    }> {
        const db = await this.getConnection()
        const senderRows = db.all<SenderKeyRow>(
            `SELECT group_id, sender_user, sender_server, sender_device, record
             FROM sender_keys
             WHERE session_id = ? AND group_id = ?`,
            [this.options.sessionId, groupId]
        )
        const distributionRows = db.all<SenderKeyDistributionRow>(
            `SELECT group_id, sender_user, sender_server, sender_device, key_id, timestamp_ms
             FROM sender_key_distribution
             WHERE session_id = ? AND group_id = ?`,
            [this.options.sessionId, groupId]
        )
        const skList = new Array<SenderKeyRecord>(senderRows.length)
        for (let index = 0; index < senderRows.length; index += 1) {
            const row = senderRows[index]
            skList[index] = decodeSenderKeyRecord(
                row.record,
                asString(row.group_id, 'sender_keys.group_id'),
                {
                    user: asString(row.sender_user, 'sender_keys.sender_user'),
                    server: asString(row.sender_server, 'sender_keys.sender_server'),
                    device: asNumber(row.sender_device, 'sender_keys.sender_device')
                }
            )
        }
        const skDistribList = new Array<SenderKeyDistributionRecord>(distributionRows.length)
        for (let index = 0; index < distributionRows.length; index += 1) {
            skDistribList[index] = decodeSenderKeyDistributionRow(distributionRows[index])
        }

        return {
            skList,
            skDistribList
        }
    }

    public async getDeviceSenderKey(
        groupId: string,
        sender: SignalAddress
    ): Promise<SenderKeyRecord | null> {
        const db = await this.getConnection()
        const target = toSignalAddressParts(sender)
        const row = db.get<SenderKeyRow>(
            `SELECT group_id, sender_user, sender_server, sender_device, record
             FROM sender_keys
             WHERE session_id = ?
               AND group_id = ?
               AND sender_user = ?
               AND sender_server = ?
               AND sender_device = ?`,
            [this.options.sessionId, groupId, target.user, target.server, target.device]
        )
        if (!row) {
            return null
        }
        return decodeSenderKeyRecord(row.record, asString(row.group_id, 'sender_keys.group_id'), {
            user: asString(row.sender_user, 'sender_keys.sender_user'),
            server: asString(row.sender_server, 'sender_keys.sender_server'),
            device: asNumber(row.sender_device, 'sender_keys.sender_device')
        })
    }

    public async getDeviceSenderKeyDistributions(
        groupId: string,
        senders: readonly SignalAddress[]
    ): Promise<readonly (SenderKeyDistributionRecord | null)[]> {
        if (senders.length === 0) {
            return []
        }
        const db = await this.getConnection()
        const targets = new Array<SignalAddressParts>(senders.length)
        for (let index = 0; index < senders.length; index += 1) {
            targets[index] = toSignalAddressParts(senders[index])
        }
        const map = new Map<string, SenderKeyDistributionRecord>()
        for (let start = 0; start < targets.length; start += this.distributionBatchSize) {
            const end = Math.min(start + this.distributionBatchSize, targets.length)
            const batchLength = end - start
            const filters = repeatSqlToken(
                '(sender_user = ? AND sender_server = ? AND sender_device = ?)',
                batchLength,
                ' OR '
            )
            const params: unknown[] = [this.options.sessionId, groupId]
            for (let index = start; index < end; index += 1) {
                const target = targets[index]
                params.push(target.user, target.server, target.device)
            }
            const rows = db.all<SenderKeyDistributionRow>(
                `SELECT group_id, sender_user, sender_server, sender_device, key_id, timestamp_ms
                 FROM sender_key_distribution
                 WHERE session_id = ? AND group_id = ? AND (${filters})`,
                params
            )
            for (const row of rows) {
                map.set(this.distributionRowKey(row), decodeSenderKeyDistributionRow(row))
            }
        }
        const records = new Array<SenderKeyDistributionRecord | null>(targets.length)
        for (let index = 0; index < targets.length; index += 1) {
            const target = targets[index]
            records[index] =
                map.get(this.distributionTargetKey(target.user, target.server, target.device)) ??
                null
        }
        return records
    }

    public async deleteDeviceSenderKey(target: SignalAddress, groupId?: string): Promise<number> {
        const sender = toSignalAddressParts(target)
        return this.withTransaction((db) => {
            const senderCount = this.countDelete(db, 'sender_keys', sender, groupId)
            const distributionCount = this.countDelete(
                db,
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
        if (participants.length === 0) {
            return 0
        }
        return this.withTransaction((db) => {
            let filters = ''
            const params: unknown[] = [this.options.sessionId, groupId]
            for (let index = 0; index < participants.length; index += 1) {
                if (index > 0) {
                    filters += ' OR '
                }
                filters += '(sender_user = ? AND sender_server = ? AND sender_device = ?)'
                const sender = toSignalAddressParts(participants[index])
                params.push(sender.user, sender.server, sender.device)
            }
            const where = `session_id = ? AND group_id = ? AND (${filters})`
            db.run(`DELETE FROM sender_keys WHERE ${where}`, params)
            const senderCountRow = db.get<Record<string, unknown>>('SELECT changes() AS total', [])
            const senderCount = senderCountRow
                ? asNumber(senderCountRow.total, 'sender_keys.changes')
                : 0
            db.run(`DELETE FROM sender_key_distribution WHERE ${where}`, params)
            const distributionCountRow = db.get<Record<string, unknown>>(
                'SELECT changes() AS total',
                []
            )
            const distributionCount = distributionCountRow
                ? asNumber(distributionCountRow.total, 'sender_key_distribution.changes')
                : 0
            return senderCount + distributionCount
        })
    }

    public async clear(): Promise<void> {
        await this.withTransaction((db) => {
            db.run('DELETE FROM sender_keys WHERE session_id = ?', [this.options.sessionId])
            db.run('DELETE FROM sender_key_distribution WHERE session_id = ?', [
                this.options.sessionId
            ])
        })
    }

    private countDelete(
        db: WaSqliteConnection,
        table: 'sender_keys' | 'sender_key_distribution',
        target: SignalAddressParts,
        groupId?: string
    ): number {
        const whereWithGroup =
            'session_id = ? AND sender_user = ? AND sender_server = ? AND sender_device = ? AND group_id = ?'
        const whereAllGroups =
            'session_id = ? AND sender_user = ? AND sender_server = ? AND sender_device = ?'

        db.run(
            `DELETE FROM ${table}
             WHERE ${groupId ? whereWithGroup : whereAllGroups}`,
            groupId
                ? [this.options.sessionId, target.user, target.server, target.device, groupId]
                : [this.options.sessionId, target.user, target.server, target.device]
        )
        const row = db.get<Record<string, unknown>>('SELECT changes() AS total', [])
        return row ? asNumber(row.total, `${table}.changes`) : 0
    }

    private upsertSenderKeyDistributionRow(
        db: WaSqliteConnection,
        record: SenderKeyDistributionRecord,
        sender: SignalAddressParts
    ): void {
        db.run(
            `INSERT INTO sender_key_distribution (
                session_id,
                group_id,
                sender_user,
                sender_server,
                sender_device,
                key_id,
                timestamp_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, group_id, sender_user, sender_server, sender_device) DO UPDATE SET
                key_id=excluded.key_id,
                timestamp_ms=excluded.timestamp_ms`,
            [
                this.options.sessionId,
                record.groupId,
                sender.user,
                sender.server,
                sender.device,
                record.keyId,
                record.timestampMs
            ]
        )
    }

    private distributionRowKey(row: SenderKeyDistributionRow): string {
        return this.distributionTargetKey(
            asString(row.sender_user, 'sender_key_distribution.sender_user'),
            asString(row.sender_server, 'sender_key_distribution.sender_server'),
            asNumber(row.sender_device, 'sender_key_distribution.sender_device')
        )
    }

    private distributionTargetKey(user: string, server: string, device: number): string {
        return `${user}|${server}|${device}`
    }
}
