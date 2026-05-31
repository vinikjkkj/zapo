import type { Logger } from 'zapo-js'

import type { WaSqliteConnection } from './connection'

export type WaSqliteDriver = 'auto' | 'better-sqlite3' | 'bun'

export type WaSqliteTableName =
    | 'wa_migrations'
    | 'auth_credentials'
    | 'signal_meta'
    | 'signal_registration'
    | 'signal_signed_prekey'
    | 'signal_prekey'
    | 'signal_session'
    | 'signal_identity'
    | 'sender_keys'
    | 'sender_key_distribution'
    | 'appstate_sync_keys'
    | 'appstate_collection_versions'
    | 'appstate_collection_index_values'
    | 'retry_outbound_messages'
    | 'retry_inbound_counters'
    | 'mailbox_messages'
    | 'mailbox_threads'
    | 'mailbox_contacts'
    | 'group_participants_cache'
    | 'device_list_cache'
    | 'privacy_tokens'
    | 'message_secrets_cache'

export type WaSqliteTableNameOverrides = Readonly<Partial<Record<WaSqliteTableName, string>>>

export interface WaSqliteStorageOptions {
    readonly sessionId: string
    /**
     * Filesystem path to the SQLite database. Mutually exclusive with
     * {@link connection}. When set, the store opens (and ref-counts) its
     * own connection and closes it on `destroy()`.
     */
    readonly path?: string
    /**
     * Pre-opened {@link WaSqliteConnection} the store should reuse instead
     * of opening its own. Mutually exclusive with {@link path}. When set,
     * `destroy()` does not close the connection - the caller owns its
     * lifecycle. Migrations still run on first access (idempotent).
     */
    readonly connection?: WaSqliteConnection
    readonly driver?: WaSqliteDriver
    readonly pragmas?: Readonly<Record<string, string | number>>
    readonly tableNames?: WaSqliteTableNameOverrides
    /**
     * Logger used for connection lifecycle, migration progress, and
     * slow-operation warnings. Typically a child logger pre-bound with
     * `{ scope: 'store', provider: 'sqlite' }` (or `{ domain: '...' }`
     * downstream). When unset, the store is silent.
     */
    readonly logger?: Logger
    /**
     * Threshold in milliseconds above which a SQLite transaction or
     * timed-helper call emits a `warn` log. Defaults to `250`.
     */
    readonly slowOperationThresholdMs?: number
}

export type WaSqliteMigrationDomain =
    | 'auth'
    | 'signal'
    | 'senderKey'
    | 'appState'
    | 'retry'
    | 'participants'
    | 'deviceList'
    | 'mailbox'
    | 'privacyToken'
    | 'messageSecret'

export interface WaSqliteBatchSizeSelection {
    readonly deviceList?: number
    readonly signalPreKey?: number
    readonly signalHasSession?: number
}
