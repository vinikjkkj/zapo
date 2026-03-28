import pg from 'pg'
import type { Pool, PoolConfig } from 'pg'

import { assertSafeTablePrefix, queryRows } from './helpers'
import type { WaPgMigrationDomain } from './types'

// pg returns bytea as Buffer which extends Uint8Array — zero-copy on read

interface Migration {
    readonly name: string
    readonly domain: WaPgMigrationDomain
    readonly sql: string
}

const MIGRATIONS: readonly Migration[] = [
    {
        name: '0001_auth_credentials',
        domain: 'auth',
        sql: `
            CREATE TABLE IF NOT EXISTS "__PREFIX__auth_credentials" (
                session_id TEXT NOT NULL,
                noise_pub_key BYTEA NOT NULL,
                noise_priv_key BYTEA NOT NULL,
                registration_id BIGINT NOT NULL,
                identity_pub_key BYTEA NOT NULL,
                identity_priv_key BYTEA NOT NULL,
                signed_prekey_id BIGINT NOT NULL,
                signed_prekey_pub_key BYTEA NOT NULL,
                signed_prekey_priv_key BYTEA NOT NULL,
                signed_prekey_signature BYTEA NOT NULL,
                adv_secret_key BYTEA NOT NULL,
                signed_identity BYTEA,
                me_jid TEXT,
                me_lid TEXT,
                me_display_name TEXT,
                companion_enc_static BYTEA,
                platform TEXT,
                server_static_key BYTEA,
                server_has_prekeys BOOLEAN,
                routing_info BYTEA,
                last_success_ts BIGINT,
                props_version BIGINT,
                ab_props_version BIGINT,
                connection_location TEXT,
                account_creation_ts BIGINT,
                PRIMARY KEY (session_id)
            )
        `
    },
    {
        name: '0002_signal_schema',
        domain: 'signal',
        sql: `
            CREATE TABLE IF NOT EXISTS "__PREFIX__signal_meta" (
                session_id TEXT NOT NULL,
                server_has_prekeys BOOLEAN NOT NULL DEFAULT FALSE,
                next_prekey_id BIGINT NOT NULL DEFAULT 1,
                signed_prekey_rotation_ts BIGINT,
                PRIMARY KEY (session_id)
            );

            CREATE TABLE IF NOT EXISTS "__PREFIX__signal_registration" (
                session_id TEXT NOT NULL,
                registration_id BIGINT NOT NULL,
                identity_pub_key BYTEA NOT NULL,
                identity_priv_key BYTEA NOT NULL,
                PRIMARY KEY (session_id)
            );

            CREATE TABLE IF NOT EXISTS "__PREFIX__signal_signed_prekey" (
                session_id TEXT NOT NULL,
                key_id BIGINT NOT NULL,
                pub_key BYTEA NOT NULL,
                priv_key BYTEA NOT NULL,
                signature BYTEA NOT NULL,
                uploaded BOOLEAN NOT NULL DEFAULT FALSE,
                PRIMARY KEY (session_id)
            );

            CREATE TABLE IF NOT EXISTS "__PREFIX__signal_prekey" (
                session_id TEXT NOT NULL,
                key_id BIGINT NOT NULL,
                pub_key BYTEA NOT NULL,
                priv_key BYTEA NOT NULL,
                uploaded BOOLEAN NOT NULL DEFAULT FALSE,
                PRIMARY KEY (session_id, key_id)
            );

            CREATE TABLE IF NOT EXISTS "__PREFIX__signal_session" (
                session_id TEXT NOT NULL,
                "user" TEXT NOT NULL,
                server TEXT NOT NULL,
                device INT NOT NULL,
                record BYTEA NOT NULL,
                PRIMARY KEY (session_id, "user", server, device)
            );

            CREATE TABLE IF NOT EXISTS "__PREFIX__signal_identity" (
                session_id TEXT NOT NULL,
                "user" TEXT NOT NULL,
                server TEXT NOT NULL,
                device INT NOT NULL,
                identity_key BYTEA NOT NULL,
                PRIMARY KEY (session_id, "user", server, device)
            )
        `
    },
    {
        name: '0003_sender_key_schema',
        domain: 'senderKey',
        sql: `
            CREATE TABLE IF NOT EXISTS "__PREFIX__sender_keys" (
                session_id TEXT NOT NULL,
                group_id TEXT NOT NULL,
                sender_user TEXT NOT NULL,
                sender_server TEXT NOT NULL,
                sender_device INT NOT NULL,
                record BYTEA NOT NULL,
                PRIMARY KEY (session_id, group_id, sender_user, sender_server, sender_device)
            );

            CREATE TABLE IF NOT EXISTS "__PREFIX__sender_key_distribution" (
                session_id TEXT NOT NULL,
                group_id TEXT NOT NULL,
                sender_user TEXT NOT NULL,
                sender_server TEXT NOT NULL,
                sender_device INT NOT NULL,
                key_id BIGINT NOT NULL,
                timestamp_ms BIGINT NOT NULL,
                PRIMARY KEY (session_id, group_id, sender_user, sender_server, sender_device)
            )
        `
    },
    {
        name: '0004_appstate_schema',
        domain: 'appState',
        sql: `
            CREATE TABLE IF NOT EXISTS "__PREFIX__appstate_sync_keys" (
                session_id TEXT NOT NULL,
                key_id BYTEA NOT NULL,
                key_data BYTEA NOT NULL,
                "timestamp" BIGINT NOT NULL,
                fingerprint BYTEA,
                key_epoch INT NOT NULL DEFAULT 0,
                PRIMARY KEY (session_id, key_id)
            );

            CREATE TABLE IF NOT EXISTS "__PREFIX__appstate_collection_versions" (
                session_id TEXT NOT NULL,
                collection TEXT NOT NULL,
                version BIGINT NOT NULL,
                hash BYTEA NOT NULL,
                PRIMARY KEY (session_id, collection)
            );

            CREATE TABLE IF NOT EXISTS "__PREFIX__appstate_collection_index_values" (
                session_id TEXT NOT NULL,
                collection TEXT NOT NULL,
                index_mac_hex TEXT NOT NULL,
                value_mac BYTEA NOT NULL,
                PRIMARY KEY (session_id, collection, index_mac_hex)
            )
        `
    },
    {
        name: '0005_retry_schema',
        domain: 'retry',
        sql: `
            CREATE TABLE IF NOT EXISTS "__PREFIX__retry_outbound_messages" (
                session_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                to_jid TEXT NOT NULL,
                participant_jid TEXT,
                recipient_jid TEXT,
                message_type TEXT NOT NULL,
                replay_mode TEXT NOT NULL,
                replay_payload BYTEA NOT NULL,
                requesters_json TEXT,
                state TEXT NOT NULL,
                created_at_ms BIGINT NOT NULL,
                updated_at_ms BIGINT NOT NULL,
                expires_at_ms BIGINT NOT NULL,
                PRIMARY KEY (session_id, message_id)
            );

            CREATE INDEX IF NOT EXISTS "__PREFIX__idx_retry_outbound_expires"
                ON "__PREFIX__retry_outbound_messages" (session_id, expires_at_ms);

            CREATE INDEX IF NOT EXISTS "__PREFIX__idx_retry_outbound_state"
                ON "__PREFIX__retry_outbound_messages" (session_id, state);

            CREATE TABLE IF NOT EXISTS "__PREFIX__retry_inbound_counters" (
                session_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                requester_jid TEXT NOT NULL,
                retry_count INT NOT NULL DEFAULT 0,
                updated_at_ms BIGINT NOT NULL,
                expires_at_ms BIGINT NOT NULL,
                PRIMARY KEY (session_id, message_id, requester_jid)
            );

            CREATE INDEX IF NOT EXISTS "__PREFIX__idx_retry_inbound_expires"
                ON "__PREFIX__retry_inbound_counters" (session_id, expires_at_ms)
        `
    },
    {
        name: '0006_mailbox_schema',
        domain: 'mailbox',
        sql: `
            CREATE TABLE IF NOT EXISTS "__PREFIX__mailbox_messages" (
                session_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                thread_jid TEXT NOT NULL,
                sender_jid TEXT,
                participant_jid TEXT,
                from_me BOOLEAN NOT NULL DEFAULT FALSE,
                timestamp_ms BIGINT,
                enc_type TEXT,
                plaintext BYTEA,
                message_bytes BYTEA,
                PRIMARY KEY (session_id, message_id)
            );

            CREATE INDEX IF NOT EXISTS "__PREFIX__idx_messages_thread_ts"
                ON "__PREFIX__mailbox_messages" (session_id, thread_jid, timestamp_ms DESC, message_id DESC);

            CREATE TABLE IF NOT EXISTS "__PREFIX__mailbox_threads" (
                session_id TEXT NOT NULL,
                jid TEXT NOT NULL,
                name TEXT,
                unread_count INT,
                archived BOOLEAN,
                pinned INT,
                mute_end_ms BIGINT,
                marked_as_unread BOOLEAN,
                ephemeral_expiration INT,
                PRIMARY KEY (session_id, jid)
            );

            CREATE TABLE IF NOT EXISTS "__PREFIX__mailbox_contacts" (
                session_id TEXT NOT NULL,
                jid TEXT NOT NULL,
                display_name TEXT,
                push_name TEXT,
                lid TEXT,
                phone_number TEXT,
                last_updated_ms BIGINT NOT NULL,
                PRIMARY KEY (session_id, jid)
            )
        `
    },
    {
        name: '0007_participants_cache_schema',
        domain: 'participants',
        sql: `
            CREATE TABLE IF NOT EXISTS "__PREFIX__group_participants_cache" (
                session_id TEXT NOT NULL,
                group_jid TEXT NOT NULL,
                participants_json TEXT NOT NULL,
                updated_at_ms BIGINT NOT NULL,
                expires_at_ms BIGINT NOT NULL,
                PRIMARY KEY (session_id, group_jid)
            );

            CREATE INDEX IF NOT EXISTS "__PREFIX__idx_participants_expires"
                ON "__PREFIX__group_participants_cache" (session_id, expires_at_ms)
        `
    },
    {
        name: '0008_device_list_cache_schema',
        domain: 'deviceList',
        sql: `
            CREATE TABLE IF NOT EXISTS "__PREFIX__device_list_cache" (
                session_id TEXT NOT NULL,
                user_jid TEXT NOT NULL,
                device_jids_json TEXT NOT NULL,
                updated_at_ms BIGINT NOT NULL,
                expires_at_ms BIGINT NOT NULL,
                PRIMARY KEY (session_id, user_jid)
            );

            CREATE INDEX IF NOT EXISTS "__PREFIX__idx_device_list_expires"
                ON "__PREFIX__device_list_cache" (session_id, expires_at_ms)
        `
    },
    {
        name: '0009_privacy_token_schema',
        domain: 'privacyToken',
        sql: `
            CREATE TABLE IF NOT EXISTS "__PREFIX__privacy_tokens" (
                session_id TEXT NOT NULL,
                jid TEXT NOT NULL,
                tc_token BYTEA,
                tc_token_timestamp BIGINT,
                tc_token_sender_timestamp BIGINT,
                nct_salt BYTEA,
                updated_at_ms BIGINT NOT NULL,
                PRIMARY KEY (session_id, jid)
            )
        `
    }
]

export function createPgPool(options: PoolConfig): pg.Pool {
    return new pg.Pool(options)
}

export async function ensurePgMigrations(
    pool: Pool,
    domains: readonly WaPgMigrationDomain[],
    tablePrefix = ''
): Promise<void> {
    assertSafeTablePrefix(tablePrefix)
    const t = (name: string) => `${tablePrefix}${name}`
    const domainSet = new Set(domains)
    const pending = MIGRATIONS.filter((m) => domainSet.has(m.domain))
    if (pending.length === 0) return

    await pool.query(`
        CREATE TABLE IF NOT EXISTS "${t('_migrations')}" (
            name TEXT PRIMARY KEY,
            applied_at BIGINT NOT NULL
        )
    `)

    const applied = new Set(
        queryRows(await pool.query(`SELECT name FROM "${t('_migrations')}"`)).map(
            (r) => r.name as string
        )
    )

    for (const migration of pending) {
        if (applied.has(migration.name)) continue

        const client = await pool.connect()
        try {
            await client.query('BEGIN')
            const sql = migration.sql.replace(/__PREFIX__/g, tablePrefix)
            const statements = sql
                .split(';')
                .map((s) => s.trim())
                .filter(Boolean)
            for (const stmt of statements) {
                await client.query(stmt)
            }
            await client.query(
                `INSERT INTO "${t('_migrations')}" (name, applied_at) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
                [migration.name, Date.now()]
            )
            await client.query('COMMIT')
        } catch (err) {
            await client.query('ROLLBACK')
            throw err
        } finally {
            client.release()
        }
    }
}
