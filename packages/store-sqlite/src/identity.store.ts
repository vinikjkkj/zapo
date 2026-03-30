import { signalAddressKey } from 'zapo-js/protocol'
import type { SignalIdentityRow, SignalAddress } from 'zapo-js/signal'
import { decodeSignalRemoteIdentity, toSignalAddressParts } from 'zapo-js/signal'
import type { WaIdentityStore as WaIdentityStoreContract } from 'zapo-js/store'
import { asNumber, asString, resolvePositive } from 'zapo-js/util'

import { BaseSqliteStore } from './BaseSqliteStore'
import type { WaSqliteConnection } from './connection'
import { repeatSqlToken } from './sql-utils'
import type { WaSqliteStorageOptions } from './types'

interface SignalIdentityBatchRow extends Record<string, unknown> {
    readonly user: unknown
    readonly server: unknown
    readonly device: unknown
    readonly identity_key: unknown
}

const DEFAULTS = Object.freeze({
    identityBatchSize: 250
} as const)

interface WaIdentitySqliteStoreOptions {
    readonly identityBatchSize?: number
}

export class WaIdentitySqliteStore extends BaseSqliteStore implements WaIdentityStoreContract {
    private readonly identityBatchSize: number

    public constructor(
        options: WaSqliteStorageOptions,
        storeOptions: WaIdentitySqliteStoreOptions = {}
    ) {
        super(options, ['signal'])
        this.identityBatchSize = resolvePositive(
            storeOptions.identityBatchSize,
            DEFAULTS.identityBatchSize,
            'signal.sqlite.identityBatchSize'
        )
    }

    public async getRemoteIdentity(address: SignalAddress): Promise<Uint8Array | null> {
        const db = await this.getConnection()
        const target = toSignalAddressParts(address)
        const row = db.get<SignalIdentityRow>(
            `SELECT identity_key
             FROM signal_identity
             WHERE session_id = ? AND user = ? AND server = ? AND device = ?`,
            [this.options.sessionId, target.user, target.server, target.device]
        )
        return row ? decodeSignalRemoteIdentity(row.identity_key) : null
    }

    public async getRemoteIdentities(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (Uint8Array | null)[]> {
        if (addresses.length === 0) {
            return []
        }
        const db = await this.getConnection()
        const targets = new Array<ReturnType<typeof toSignalAddressParts>>(addresses.length)
        for (let index = 0; index < addresses.length; index += 1) {
            targets[index] = toSignalAddressParts(addresses[index])
        }
        const byAddressKey = new Map<string, Uint8Array>()
        for (let start = 0; start < targets.length; start += this.identityBatchSize) {
            const end = Math.min(start + this.identityBatchSize, targets.length)
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
            const rows = db.all<SignalIdentityBatchRow>(
                `SELECT user, server, device, identity_key
                 FROM signal_identity
                 WHERE session_id = ? AND (${filters})`,
                params
            )
            for (const row of rows) {
                byAddressKey.set(
                    signalAddressKey({
                        user: asString(row.user, 'signal_identity.user'),
                        server: asString(row.server, 'signal_identity.server'),
                        device: asNumber(row.device, 'signal_identity.device')
                    }),
                    decodeSignalRemoteIdentity(row.identity_key)
                )
            }
        }
        const identities = new Array<Uint8Array | null>(targets.length)
        for (let index = 0; index < targets.length; index += 1) {
            identities[index] = byAddressKey.get(signalAddressKey(targets[index])) ?? null
        }
        return identities
    }

    public async setRemoteIdentity(address: SignalAddress, identityKey: Uint8Array): Promise<void> {
        const db = await this.getConnection()
        const target = toSignalAddressParts(address)
        this.upsertRemoteIdentity(db, target, identityKey)
    }

    public async setRemoteIdentities(
        entries: readonly {
            readonly address: SignalAddress
            readonly identityKey: Uint8Array
        }[]
    ): Promise<void> {
        if (entries.length === 0) {
            return
        }
        await this.withTransaction((db) => {
            for (let index = 0; index < entries.length; index += 1) {
                const entry = entries[index]
                const target = toSignalAddressParts(entry.address)
                this.upsertRemoteIdentity(db, target, entry.identityKey)
            }
        })
    }

    public async clear(): Promise<void> {
        await this.withTransaction((db) => {
            db.run('DELETE FROM signal_identity WHERE session_id = ?', [this.options.sessionId])
        })
    }

    private upsertRemoteIdentity(
        db: WaSqliteConnection,
        target: ReturnType<typeof toSignalAddressParts>,
        identityKey: Uint8Array
    ): void {
        db.run(
            `INSERT INTO signal_identity (
                session_id,
                user,
                server,
                device,
                identity_key
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(session_id, user, server, device) DO UPDATE SET
                identity_key=excluded.identity_key`,
            [this.options.sessionId, target.user, target.server, target.device, identityKey]
        )
    }
}
