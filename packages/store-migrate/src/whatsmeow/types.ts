// Mirrors whatsmeow's SQL column names so callers pass `db.get(...)` rows directly.
// Numerics arrive as number / bigint / string depending on driver — accept all three.

export type WhatsmeowNumeric = number | bigint | string

export type WhatsmeowBoolean = boolean | number | bigint

export interface WhatsmeowDeviceRow {
    readonly jid: string
    readonly lid?: string | null
    readonly registration_id: WhatsmeowNumeric
    readonly noise_key: Uint8Array
    readonly identity_key: Uint8Array
    readonly signed_pre_key: Uint8Array
    readonly signed_pre_key_id: WhatsmeowNumeric
    readonly signed_pre_key_sig: Uint8Array
    readonly adv_key: Uint8Array
    readonly adv_details: Uint8Array
    readonly adv_account_sig: Uint8Array
    readonly adv_account_sig_key: Uint8Array
    readonly adv_device_sig: Uint8Array
    readonly platform?: string | null
    readonly business_name?: string | null
    readonly push_name?: string | null
    readonly facebook_uuid?: string | null
    readonly lid_migration_ts?: WhatsmeowNumeric | null
}

export interface WhatsmeowPreKeyRow {
    readonly key_id: WhatsmeowNumeric
    readonly key: Uint8Array
    readonly uploaded: WhatsmeowBoolean
}

export interface WhatsmeowSessionRow {
    readonly their_id: string
    readonly session: Uint8Array
}

export interface WhatsmeowIdentityKeyRow {
    readonly their_id: string
    readonly identity: Uint8Array
}

export interface WhatsmeowSenderKeyRow {
    readonly chat_id: string
    readonly sender_id: string
    readonly sender_key: Uint8Array
}

export interface WhatsmeowAppStateSyncKeyRow {
    readonly key_id: Uint8Array
    readonly key_data: Uint8Array
    readonly timestamp: WhatsmeowNumeric
    readonly fingerprint: Uint8Array
}

export interface WhatsmeowAppStateVersionRow {
    readonly name: string
    readonly version: WhatsmeowNumeric
    readonly hash: Uint8Array
}

export interface WhatsmeowAppStateMutationMacRow {
    readonly index_mac: Uint8Array
    readonly value_mac: Uint8Array
}

export interface WhatsmeowContactRow {
    readonly their_jid: string
    readonly first_name?: string | null
    readonly full_name?: string | null
    readonly push_name?: string | null
    readonly business_name?: string | null
    readonly redacted_phone?: string | null
}

export interface WhatsmeowPrivacyTokenRow {
    readonly their_jid: string
    readonly token: Uint8Array
    readonly timestamp: WhatsmeowNumeric
    readonly sender_timestamp?: WhatsmeowNumeric | null
}

export interface WhatsmeowMessageSecretRow {
    readonly chat_jid: string
    readonly sender_jid: string
    readonly message_id: string
    readonly key: Uint8Array
}

export interface WhatsmeowLidMappingRow {
    readonly lid: string
    readonly pn: string
}
