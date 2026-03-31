import mysql from 'mysql2/promise'
import type { Pool, PoolOptions } from 'mysql2/promise'

import { assertSafeTablePrefix, queryRows } from './helpers'
import type { WaMysqlMigrationDomain } from './types'

interface Migration {
    readonly name: string
    readonly domain: WaMysqlMigrationDomain
    readonly sql: string
}

const MIGRATIONS: readonly Migration[] = [
    {
        name: '0001_auth_credentials',
        domain: 'auth',
        sql: `
            CREATE TABLE IF NOT EXISTS \`__PREFIX__auth_credentials\` (
                session_id VARCHAR(255) NOT NULL,
                noise_pub_key LONGBLOB NOT NULL,
                noise_priv_key LONGBLOB NOT NULL,
                registration_id BIGINT NOT NULL,
                identity_pub_key LONGBLOB NOT NULL,
                identity_priv_key LONGBLOB NOT NULL,
                signed_prekey_id BIGINT NOT NULL,
                signed_prekey_pub_key LONGBLOB NOT NULL,
                signed_prekey_priv_key LONGBLOB NOT NULL,
                signed_prekey_signature LONGBLOB NOT NULL,
                adv_secret_key LONGBLOB NOT NULL,
                signed_identity LONGBLOB,
                me_jid VARCHAR(255),
                me_lid VARCHAR(255),
                me_display_name VARCHAR(255),
                companion_enc_static LONGBLOB,
                platform VARCHAR(100),
                server_static_key LONGBLOB,
                server_has_prekeys TINYINT(1),
                routing_info LONGBLOB,
                last_success_ts BIGINT,
                props_version BIGINT,
                ab_props_version BIGINT,
                connection_location VARCHAR(255),
                account_creation_ts BIGINT,
                PRIMARY KEY (session_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `
    },
    {
        name: '0002_signal_schema',
        domain: 'signal',
        sql: `
            CREATE TABLE IF NOT EXISTS \`__PREFIX__signal_meta\` (
                session_id VARCHAR(255) NOT NULL,
                server_has_prekeys TINYINT(1) NOT NULL DEFAULT 0,
                next_prekey_id BIGINT NOT NULL DEFAULT 1,
                signed_prekey_rotation_ts BIGINT,
                PRIMARY KEY (session_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS \`__PREFIX__signal_registration\` (
                session_id VARCHAR(255) NOT NULL,
                registration_id BIGINT NOT NULL,
                identity_pub_key LONGBLOB NOT NULL,
                identity_priv_key LONGBLOB NOT NULL,
                PRIMARY KEY (session_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS \`__PREFIX__signal_signed_prekey\` (
                session_id VARCHAR(255) NOT NULL,
                key_id BIGINT NOT NULL,
                pub_key LONGBLOB NOT NULL,
                priv_key LONGBLOB NOT NULL,
                signature LONGBLOB NOT NULL,
                uploaded TINYINT(1) NOT NULL DEFAULT 0,
                PRIMARY KEY (session_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS \`__PREFIX__signal_prekey\` (
                session_id VARCHAR(255) NOT NULL,
                key_id BIGINT NOT NULL,
                pub_key LONGBLOB NOT NULL,
                priv_key LONGBLOB NOT NULL,
                uploaded TINYINT(1) NOT NULL DEFAULT 0,
                PRIMARY KEY (session_id, key_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS \`__PREFIX__signal_session\` (
                session_id VARCHAR(128) NOT NULL,
                user VARCHAR(128) NOT NULL,
                server VARCHAR(128) NOT NULL,
                device INT NOT NULL,
                record LONGBLOB NOT NULL,
                PRIMARY KEY (session_id, user, server, device)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS \`__PREFIX__signal_identity\` (
                session_id VARCHAR(128) NOT NULL,
                user VARCHAR(128) NOT NULL,
                server VARCHAR(128) NOT NULL,
                device INT NOT NULL,
                identity_key LONGBLOB NOT NULL,
                PRIMARY KEY (session_id, user, server, device)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `
    },
    {
        name: '0003_sender_key_schema',
        domain: 'senderKey',
        sql: `
            CREATE TABLE IF NOT EXISTS \`__PREFIX__sender_keys\` (
                session_id VARCHAR(128) NOT NULL,
                group_id VARCHAR(128) NOT NULL,
                sender_user VARCHAR(128) NOT NULL,
                sender_server VARCHAR(128) NOT NULL,
                sender_device INT NOT NULL,
                record LONGBLOB NOT NULL,
                PRIMARY KEY (session_id, group_id, sender_user, sender_server, sender_device)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS \`__PREFIX__sender_key_distribution\` (
                session_id VARCHAR(128) NOT NULL,
                group_id VARCHAR(128) NOT NULL,
                sender_user VARCHAR(128) NOT NULL,
                sender_server VARCHAR(128) NOT NULL,
                sender_device INT NOT NULL,
                key_id BIGINT NOT NULL,
                timestamp_ms BIGINT NOT NULL,
                PRIMARY KEY (session_id, group_id, sender_user, sender_server, sender_device)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `
    },
    {
        name: '0004_appstate_schema',
        domain: 'appState',
        sql: `
            CREATE TABLE IF NOT EXISTS \`__PREFIX__appstate_sync_keys\` (
                session_id VARCHAR(255) NOT NULL,
                key_id VARBINARY(255) NOT NULL,
                key_data LONGBLOB NOT NULL,
                timestamp BIGINT NOT NULL,
                fingerprint LONGBLOB,
                key_epoch INT NOT NULL DEFAULT 0,
                PRIMARY KEY (session_id, key_id(64))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS \`__PREFIX__appstate_collection_versions\` (
                session_id VARCHAR(255) NOT NULL,
                collection VARCHAR(100) NOT NULL,
                version BIGINT NOT NULL,
                hash LONGBLOB NOT NULL,
                PRIMARY KEY (session_id, collection)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS \`__PREFIX__appstate_collection_index_values\` (
                session_id VARCHAR(255) NOT NULL,
                collection VARCHAR(100) NOT NULL,
                index_mac_hex VARCHAR(255) NOT NULL,
                value_mac LONGBLOB NOT NULL,
                PRIMARY KEY (session_id, collection, index_mac_hex)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `
    },
    {
        name: '0005_retry_schema',
        domain: 'retry',
        sql: `
            CREATE TABLE IF NOT EXISTS \`__PREFIX__retry_outbound_messages\` (
                session_id VARCHAR(255) NOT NULL,
                message_id VARCHAR(255) NOT NULL,
                to_jid VARCHAR(255) NOT NULL,
                participant_jid VARCHAR(255),
                recipient_jid VARCHAR(255),
                message_type VARCHAR(100) NOT NULL,
                replay_mode VARCHAR(100) NOT NULL,
                replay_payload LONGBLOB NOT NULL,
                requesters_json TEXT,
                state VARCHAR(50) NOT NULL,
                created_at_ms BIGINT NOT NULL,
                updated_at_ms BIGINT NOT NULL,
                expires_at_ms BIGINT NOT NULL,
                PRIMARY KEY (session_id, message_id),
                INDEX idx_retry_outbound_expires (session_id, expires_at_ms),
                INDEX idx_retry_outbound_state (session_id, state)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS \`__PREFIX__retry_inbound_counters\` (
                session_id VARCHAR(255) NOT NULL,
                message_id VARCHAR(255) NOT NULL,
                requester_jid VARCHAR(255) NOT NULL,
                retry_count INT NOT NULL DEFAULT 0,
                updated_at_ms BIGINT NOT NULL,
                expires_at_ms BIGINT NOT NULL,
                PRIMARY KEY (session_id, message_id, requester_jid),
                INDEX idx_retry_inbound_expires (session_id, expires_at_ms)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `
    },
    {
        name: '0006_mailbox_schema',
        domain: 'mailbox',
        sql: `
            CREATE TABLE IF NOT EXISTS \`__PREFIX__mailbox_messages\` (
                session_id VARCHAR(255) NOT NULL,
                message_id VARCHAR(255) NOT NULL,
                thread_jid VARCHAR(255) NOT NULL,
                sender_jid VARCHAR(255),
                participant_jid VARCHAR(255),
                from_me TINYINT(1) NOT NULL DEFAULT 0,
                timestamp_ms BIGINT,
                enc_type VARCHAR(50),
                plaintext LONGBLOB,
                message_bytes LONGBLOB,
                PRIMARY KEY (session_id, message_id),
                INDEX idx_messages_thread_ts (session_id, thread_jid, timestamp_ms DESC, message_id DESC)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS \`__PREFIX__mailbox_threads\` (
                session_id VARCHAR(255) NOT NULL,
                jid VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                unread_count INT,
                archived TINYINT(1),
                pinned INT,
                mute_end_ms BIGINT,
                marked_as_unread TINYINT(1),
                ephemeral_expiration INT,
                PRIMARY KEY (session_id, jid)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS \`__PREFIX__mailbox_contacts\` (
                session_id VARCHAR(255) NOT NULL,
                jid VARCHAR(255) NOT NULL,
                display_name VARCHAR(255),
                push_name VARCHAR(255),
                lid VARCHAR(255),
                phone_number VARCHAR(50),
                last_updated_ms BIGINT NOT NULL,
                PRIMARY KEY (session_id, jid)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `
    },
    {
        name: '0007_participants_cache_schema',
        domain: 'participants',
        sql: `
            CREATE TABLE IF NOT EXISTS \`__PREFIX__group_participants_cache\` (
                session_id VARCHAR(255) NOT NULL,
                group_jid VARCHAR(255) NOT NULL,
                participants_json TEXT NOT NULL,
                updated_at_ms BIGINT NOT NULL,
                expires_at_ms BIGINT NOT NULL,
                PRIMARY KEY (session_id, group_jid),
                INDEX idx_participants_expires (session_id, expires_at_ms)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `
    },
    {
        name: '0008_device_list_cache_schema',
        domain: 'deviceList',
        sql: `
            CREATE TABLE IF NOT EXISTS \`__PREFIX__device_list_cache\` (
                session_id VARCHAR(255) NOT NULL,
                user_jid VARCHAR(255) NOT NULL,
                device_jids_json TEXT NOT NULL,
                updated_at_ms BIGINT NOT NULL,
                expires_at_ms BIGINT NOT NULL,
                PRIMARY KEY (session_id, user_jid),
                INDEX idx_device_list_expires (session_id, expires_at_ms)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `
    },
    {
        name: '0009_privacy_token_schema',
        domain: 'privacyToken',
        sql: `
            CREATE TABLE IF NOT EXISTS \`__PREFIX__privacy_tokens\` (
                session_id VARCHAR(255) NOT NULL,
                jid VARCHAR(255) NOT NULL,
                tc_token LONGBLOB,
                tc_token_timestamp BIGINT,
                tc_token_sender_timestamp BIGINT,
                nct_salt LONGBLOB,
                updated_at_ms BIGINT NOT NULL,
                PRIMARY KEY (session_id, jid)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `
    },
    {
        name: '0010_message_secrets_cache_schema',
        domain: 'messageSecret',
        sql: `
            CREATE TABLE IF NOT EXISTS \`__PREFIX__message_secrets_cache\` (
                session_id VARCHAR(255) NOT NULL,
                message_id VARCHAR(255) NOT NULL,
                secret BLOB NOT NULL,
                sender_jid VARCHAR(255) NOT NULL DEFAULT '',
                expires_at_ms BIGINT NOT NULL,
                PRIMARY KEY (session_id, message_id),
                INDEX idx_message_secrets_expires (session_id, expires_at_ms)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `
    }
]

export function createMysqlPool(options: PoolOptions): Pool {
    const userTypeCast = options.typeCast
    return mysql.createPool({
        ...options,
        typeCast: function (field, next) {
            if (
                field.type === 'BLOB' ||
                field.type === 'LONG_BLOB' ||
                field.type === 'MEDIUM_BLOB' ||
                field.type === 'TINY_BLOB'
            ) {
                const buf = field.buffer()
                return buf ? new Uint8Array(buf) : null
            }
            if (typeof userTypeCast === 'function') {
                return userTypeCast(field, next)
            }
            return next()
        }
    })
}

export async function ensureMysqlMigrations(
    pool: Pool,
    domains: readonly WaMysqlMigrationDomain[],
    tablePrefix = ''
): Promise<void> {
    assertSafeTablePrefix(tablePrefix)
    const t = (name: string) => `${tablePrefix}${name}`
    const domainSet = new Set(domains)
    const pending = MIGRATIONS.filter((m) => domainSet.has(m.domain))
    if (pending.length === 0) return

    await pool.execute(`
        CREATE TABLE IF NOT EXISTS \`${t('_migrations')}\` (
            name VARCHAR(255) PRIMARY KEY,
            applied_at BIGINT NOT NULL
        )
    `)

    const applied = new Set(
        queryRows(await pool.execute(`SELECT name FROM \`${t('_migrations')}\``)).map(
            (r) => r.name as string
        )
    )

    for (const migration of pending) {
        if (applied.has(migration.name)) continue

        const conn = await pool.getConnection()
        try {
            await conn.beginTransaction()
            const sql = migration.sql.replace(/__PREFIX__/g, tablePrefix)
            const statements = sql
                .split(';')
                .map((s) => s.trim())
                .filter(Boolean)
            for (const stmt of statements) {
                await conn.execute(stmt)
            }
            await conn.execute(
                `INSERT IGNORE INTO \`${t('_migrations')}\` (name, applied_at) VALUES (?, ?)`,
                [migration.name, Date.now()]
            )
            await conn.commit()
        } catch (err) {
            await conn.rollback()
            throw err
        } finally {
            conn.release()
        }
    }
}
