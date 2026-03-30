import { signalAddressKey } from 'zapo-js/protocol'
import type { SignalSessionRow, SignalAddress, SignalSessionRecord } from 'zapo-js/signal'
import {
    decodeSignalSessionRecord,
    encodeSignalSessionRecord,
    toSignalAddressParts
} from 'zapo-js/signal'
import type { WaSessionStore as WaSessionStoreContract } from 'zapo-js/store'
import { asNumber, asString, resolvePositive } from 'zapo-js/util'

import { BaseSqliteStore } from './BaseSqliteStore'
import type { WaSqliteConnection } from './connection'
import { repeatSqlToken } from './sql-utils'
import type { WaSqliteStorageOptions } from './types'

interface SignalSessionExistsRow extends Record<string, unknown> {
    readonly user: unknown
    readonly server: unknown
    readonly device: unknown
}

interface SignalSessionBatchRow extends Record<string, unknown> {
    readonly user: unknown
    readonly server: unknown
    readonly device: unknown
    readonly record: unknown
}

const DEFAULTS = Object.freeze({
    hasSessionBatchSize: 250
} as const)

interface WaSessionSqliteStoreOptions {
    readonly hasSessionBatchSize?: number
}

export class WaSessionSqliteStore extends BaseSqliteStore implements WaSessionStoreContract {
    private readonly hasSessionBatchSize: number

    public constructor(
        options: WaSqliteStorageOptions,
        storeOptions: WaSessionSqliteStoreOptions = {}
    ) {
        super(options, ['signal'])
        this.hasSessionBatchSize = resolvePositive(
            storeOptions.hasSessionBatchSize,
            DEFAULTS.hasSessionBatchSize,
            'signal.sqlite.hasSessionBatchSize'
        )
    }

    public async hasSession(address: SignalAddress): Promise<boolean> {
        const db = await this.getConnection()
        const target = toSignalAddressParts(address)
        return (
            db.get<Record<string, unknown>>(
                `SELECT 1 AS has_session
                 FROM signal_session
                 WHERE session_id = ? AND user = ? AND server = ? AND device = ?
                 LIMIT 1`,
                [this.options.sessionId, target.user, target.server, target.device]
            ) !== null
        )
    }

    public async hasSessions(addresses: readonly SignalAddress[]): Promise<readonly boolean[]> {
        if (addresses.length === 0) {
            return []
        }
        const db = await this.getConnection()
        const targets = new Array<ReturnType<typeof toSignalAddressParts>>(addresses.length)
        for (let index = 0; index < addresses.length; index += 1) {
            targets[index] = toSignalAddressParts(addresses[index])
        }
        const existingKeys = new Set<string>()
        for (let start = 0; start < targets.length; start += this.hasSessionBatchSize) {
            const end = Math.min(start + this.hasSessionBatchSize, targets.length)
            const batchLength = end - start
            const filters = repeatSqlToken(
                '(user = ? AND server = ? AND device = ?)',
                batchLength,
                ' OR '
            )
            const params: unknown[] = [this.options.sessionId]
            for (let index = start; index < end; index += 1) {
                const target = targets[index]
                params.push(target.user, target.server, target.device)
            }
            const rows = db.all<SignalSessionExistsRow>(
                `SELECT user, server, device
                 FROM signal_session
                 WHERE session_id = ? AND (${filters})`,
                params
            )
            for (const row of rows) {
                existingKeys.add(
                    signalAddressKey({
                        user: asString(row.user, 'signal_session.user'),
                        server: asString(row.server, 'signal_session.server'),
                        device: asNumber(row.device, 'signal_session.device')
                    })
                )
            }
        }
        const hasByTarget = new Array<boolean>(targets.length)
        for (let index = 0; index < targets.length; index += 1) {
            hasByTarget[index] = existingKeys.has(signalAddressKey(targets[index]))
        }
        return hasByTarget
    }

    public async getSession(address: SignalAddress): Promise<SignalSessionRecord | null> {
        const db = await this.getConnection()
        const target = toSignalAddressParts(address)
        const row = db.get<SignalSessionRow>(
            `SELECT user, server, device, record
             FROM signal_session
             WHERE session_id = ? AND user = ? AND server = ? AND device = ?`,
            [this.options.sessionId, target.user, target.server, target.device]
        )
        return row ? decodeSignalSessionRecord(row.record) : null
    }

    public async getSessionsBatch(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (SignalSessionRecord | null)[]> {
        if (addresses.length === 0) {
            return []
        }
        const db = await this.getConnection()
        const targets = new Array<ReturnType<typeof toSignalAddressParts>>(addresses.length)
        for (let index = 0; index < addresses.length; index += 1) {
            targets[index] = toSignalAddressParts(addresses[index])
        }
        const byAddressKey = new Map<string, SignalSessionRecord>()
        for (let start = 0; start < targets.length; start += this.hasSessionBatchSize) {
            const end = Math.min(start + this.hasSessionBatchSize, targets.length)
            const batchLength = end - start
            const filters = repeatSqlToken(
                '(user = ? AND server = ? AND device = ?)',
                batchLength,
                ' OR '
            )
            const params: unknown[] = [this.options.sessionId]
            for (let index = start; index < end; index += 1) {
                const target = targets[index]
                params.push(target.user, target.server, target.device)
            }
            const rows = db.all<SignalSessionBatchRow>(
                `SELECT user, server, device, record
                 FROM signal_session
                 WHERE session_id = ? AND (${filters})`,
                params
            )
            for (const row of rows) {
                byAddressKey.set(
                    signalAddressKey({
                        user: asString(row.user, 'signal_session.user'),
                        server: asString(row.server, 'signal_session.server'),
                        device: asNumber(row.device, 'signal_session.device')
                    }),
                    decodeSignalSessionRecord(row.record)
                )
            }
        }
        const sessions = new Array<SignalSessionRecord | null>(targets.length)
        for (let index = 0; index < targets.length; index += 1) {
            sessions[index] = byAddressKey.get(signalAddressKey(targets[index])) ?? null
        }
        return sessions
    }

    public async setSession(address: SignalAddress, session: SignalSessionRecord): Promise<void> {
        const db = await this.getConnection()
        const target = toSignalAddressParts(address)
        this.upsertSession(db, target, session)
    }

    public async setSessionsBatch(
        entries: readonly {
            readonly address: SignalAddress
            readonly session: SignalSessionRecord
        }[]
    ): Promise<void> {
        if (entries.length === 0) {
            return
        }
        await this.withTransaction((db) => {
            for (let index = 0; index < entries.length; index += 1) {
                const entry = entries[index]
                this.upsertSession(db, toSignalAddressParts(entry.address), entry.session)
            }
        })
    }

    public async deleteSession(address: SignalAddress): Promise<void> {
        const db = await this.getConnection()
        const target = toSignalAddressParts(address)
        db.run(
            `DELETE FROM signal_session
             WHERE session_id = ? AND user = ? AND server = ? AND device = ?`,
            [this.options.sessionId, target.user, target.server, target.device]
        )
    }

    public async clear(): Promise<void> {
        await this.withTransaction((db) => {
            db.run('DELETE FROM signal_session WHERE session_id = ?', [this.options.sessionId])
        })
    }

    private upsertSession(
        db: WaSqliteConnection,
        target: ReturnType<typeof toSignalAddressParts>,
        session: SignalSessionRecord
    ): void {
        db.run(
            `INSERT INTO signal_session (
                session_id,
                user,
                server,
                device,
                record
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(session_id, user, server, device) DO UPDATE SET
                record=excluded.record`,
            [
                this.options.sessionId,
                target.user,
                target.server,
                target.device,
                encodeSignalSessionRecord(session)
            ]
        )
    }
}
