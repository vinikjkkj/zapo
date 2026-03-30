import type { WaSqliteTableName, WaSqliteTableNameOverrides } from './types'

const SQLITE_TABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

const WA_SQLITE_TABLE_NAME_ORDER = Object.freeze([
    'wa_migrations',
    'auth_credentials',
    'signal_meta',
    'signal_registration',
    'signal_signed_prekey',
    'signal_prekey',
    'signal_session',
    'signal_identity',
    'sender_keys',
    'sender_key_distribution',
    'appstate_sync_keys',
    'appstate_collection_versions',
    'appstate_collection_index_values',
    'retry_outbound_messages',
    'retry_inbound_counters',
    'mailbox_messages',
    'mailbox_threads',
    'mailbox_contacts',
    'group_participants_cache',
    'device_list_cache',
    'privacy_tokens',
    'message_secrets_cache'
] as const satisfies readonly WaSqliteTableName[])
const WA_SQLITE_ALLOWED_TABLE_NAME_SET = new Set<string>(WA_SQLITE_TABLE_NAME_ORDER)
const WA_SQLITE_ALLOWED_TABLE_NAME_LIST = WA_SQLITE_TABLE_NAME_ORDER.join(', ')

export const WA_SQLITE_DEFAULT_TABLE_NAMES: Readonly<Record<WaSqliteTableName, string>> =
    Object.freeze({
        wa_migrations: 'wa_migrations',
        auth_credentials: 'auth_credentials',
        signal_meta: 'signal_meta',
        signal_registration: 'signal_registration',
        signal_signed_prekey: 'signal_signed_prekey',
        signal_prekey: 'signal_prekey',
        signal_session: 'signal_session',
        signal_identity: 'signal_identity',
        sender_keys: 'sender_keys',
        sender_key_distribution: 'sender_key_distribution',
        appstate_sync_keys: 'appstate_sync_keys',
        appstate_collection_versions: 'appstate_collection_versions',
        appstate_collection_index_values: 'appstate_collection_index_values',
        retry_outbound_messages: 'retry_outbound_messages',
        retry_inbound_counters: 'retry_inbound_counters',
        mailbox_messages: 'mailbox_messages',
        mailbox_threads: 'mailbox_threads',
        mailbox_contacts: 'mailbox_contacts',
        group_participants_cache: 'group_participants_cache',
        device_list_cache: 'device_list_cache',
        privacy_tokens: 'privacy_tokens',
        message_secrets_cache: 'message_secrets_cache'
    })

const DEFAULT_SQLITE_TABLE_NAME_SERIALIZATION = serializeSqliteTableNames(
    WA_SQLITE_DEFAULT_TABLE_NAMES
)

function normalizeTableName(table: WaSqliteTableName, rawValue: string): string {
    const value = rawValue.trim()
    if (value.length === 0) {
        throw new Error(`sqlite tableNames.${table} must be a non-empty string`)
    }
    if (!SQLITE_TABLE_NAME_PATTERN.test(value)) {
        throw new Error(
            `sqlite tableNames.${table} must match ${SQLITE_TABLE_NAME_PATTERN.toString()}`
        )
    }
    return value
}

function assertNoDuplicateTableNames(
    tableNames: Readonly<Record<WaSqliteTableName, string>>
): void {
    const seen = new Set<string>()
    for (const table of WA_SQLITE_TABLE_NAME_ORDER) {
        const mapped = tableNames[table]
        const normalizedMapped = mapped.toLowerCase()
        if (seen.has(normalizedMapped)) {
            throw new Error(`sqlite tableNames contains duplicate target "${mapped}"`)
        }
        seen.add(normalizedMapped)
    }
}

export function resolveSqliteTableNames(
    overrides?: WaSqliteTableNameOverrides
): Readonly<Record<WaSqliteTableName, string>> {
    if (!overrides) {
        return WA_SQLITE_DEFAULT_TABLE_NAMES
    }

    const entries = Object.entries(overrides) as readonly [string, string | undefined][]
    if (entries.length === 0) {
        return WA_SQLITE_DEFAULT_TABLE_NAMES
    }

    const resolved: Record<WaSqliteTableName, string> = {
        ...WA_SQLITE_DEFAULT_TABLE_NAMES
    }
    for (const [table, rawName] of entries) {
        if (!WA_SQLITE_ALLOWED_TABLE_NAME_SET.has(table)) {
            throw new Error(
                `unsupported sqlite tableNames key "${table}". Allowed table names: ${WA_SQLITE_ALLOWED_TABLE_NAME_LIST}`
            )
        }
        if (typeof rawName !== 'string') {
            throw new Error(`sqlite tableNames.${table} must be a string`)
        }
        const tableName = table as WaSqliteTableName
        resolved[tableName] = normalizeTableName(tableName, rawName)
    }
    assertNoDuplicateTableNames(resolved)
    return Object.freeze(resolved)
}

export function serializeSqliteTableNames(
    tableNames: Readonly<Record<WaSqliteTableName, string>>
): string {
    return WA_SQLITE_TABLE_NAME_ORDER.map((table) => `${table}=${tableNames[table]}`).join(';')
}

function escapeRegexToken(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createSqliteTableNameSqlResolver(
    tableNames: Readonly<Record<WaSqliteTableName, string>>
): (sql: string) => string {
    const serialized = serializeSqliteTableNames(tableNames)
    if (serialized === DEFAULT_SQLITE_TABLE_NAME_SERIALIZATION) {
        return (sql) => sql
    }

    const pattern = new RegExp(
        `\\b(?:${WA_SQLITE_TABLE_NAME_ORDER.map(escapeRegexToken).join('|')})\\b`,
        'g'
    )

    return (sql) => sql.replace(pattern, (token) => tableNames[token as WaSqliteTableName] ?? token)
}
