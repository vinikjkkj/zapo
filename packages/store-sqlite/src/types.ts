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
    readonly path: string
    readonly sessionId: string
    readonly driver?: WaSqliteDriver
    readonly pragmas?: Readonly<Record<string, string | number>>
    readonly tableNames?: WaSqliteTableNameOverrides
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
    readonly senderKeyDistribution?: number
    readonly signalPreKey?: number
    readonly signalHasSession?: number
}
