import type { Logger } from 'zapo-js'

import type { WaSqliteConnection } from './connection'

/**
 * SQLite backend to open the database with.
 *
 * - `better-sqlite3` – native addon, fastest row materialization on Node.
 *   Requires a prebuilt binary or a working toolchain, and does not load
 *   under Bun.
 * - `bun` – `bun:sqlite`, Bun only.
 * - `node` – `node:sqlite`, no install step. Available on Node 22.13+ and on
 *   Bun 1.4+. Node 22.5 to 22.12 keeps the module behind
 *   `--experimental-sqlite`, and Node prints an experimental warning for as
 *   long as the module is marked experimental. Writes match `better-sqlite3`;
 *   wide or multi-row reads are slower because every row is materialized into
 *   a fresh object.
 * - `auto` – `bun` under Bun, otherwise `better-sqlite3` with a fallback to
 *   `node` when the addon is not installed. On a runtime without either, the
 *   better-sqlite3 install error is raised - there is nothing to fall back to.
 */
export type WaSqliteDriver = 'auto' | 'better-sqlite3' | 'bun' | 'node'

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
    | 'chat_metadata_cache'

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
    | 'chatMetadata'

export interface WaSqliteBatchSizeSelection {
    readonly deviceList?: number
    readonly signalPreKey?: number
    readonly signalHasSession?: number
}
