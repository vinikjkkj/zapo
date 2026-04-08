export const WA_READY_STATES = Object.freeze({
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3
} as const)

export const WA_LOGOUT_REASONS = Object.freeze({
    USER_INITIATED: 'user_initiated',
    SYNCD_FAILURE: 'syncd_failure',
    INVALID_ADV_STATUS: 'invalid_adv_status',
    CRITICAL_SYNC_TIMEOUT: 'critical_sync_timeout',
    SYNCD_TIMEOUT: 'syncd_timeout',
    HISTORY_SYNC_TIMEOUT: 'history_sync_timeout',
    ACCOUNT_SYNC_TIMEOUT: 'account_sync_timeout',
    MD_OPT_OUT: 'md_opt_out',
    UNKNOWN_COMPANION: 'unknown_companion',
    CLIENT_VERSION_OUTDATED: 'client_version_outdated',
    SYNCD_ERROR_DURING_BOOTSTRAP: 'syncd_error_during_bootstrap',
    ACCOUNT_SYNC_ERROR: 'account_sync_error',
    STORAGE_QUOTA_EXCEEDED: 'storage_quota_exceeded',
    PRIMARY_IDENTITY_KEY_CHANGE: 'primary_identity_key_change',
    MISSING_ENC_SALT: 'missing_enc_salt',
    MISSING_SCREEN_LOCK_SALT: 'missing_screen_lock_salt',
    ACCOUNT_LOCKED: 'account_locked',
    LID_MIGRATION_SPLIT_THREAD_MISMATCH: 'lid_migration_split_thread_mismatch',
    LID_MIGRATION_NO_LID_AVAILABLE: 'lid_migration_no_lid_available',
    LID_MIGRATION_PRIMARY_MAPPINGS_OBSOLETE: 'lid_migration_primary_mappings_obsolete',
    LID_MIGRATION_PEER_MAPPINGS_NOT_RECEIVED: 'lid_migration_peer_mapping_not_received',
    LID_MIGRATION_STATE_DISCREPANCY: 'lid_migration_state_discrepancy',
    LID_MIGRATION_PEER_MAPPINGS_MALFORMED: 'lid_migration_peer_mapping_malformed',
    LID_MIGRATION_FAILED_TO_PARSE_MAPPING: 'lid_migration_failed_to_parse_mapping',
    LID_MIGRATION_COMPANION_INCOMPATIBLE_KILLSWITCH:
        'lid_migration_companion_incompatible_killswitch',
    LID_MIGRATION_ONE_ON_ONE_THREAD_MIGRATION_INTERNAL_ERROR:
        'lid_migration_one_on_one_thread_migration_internal_error',
    LID_BLOCKLIST_PN_WHEN_MIGRATED: 'lid_blocklist_pn_when_migrated',
    LID_BLOCKLIST_CHAT_DB_UNMIGRATED: 'lid_blocklist_chat_db_unmigrated',
    WEB_FAIL_ADD_CHAT: 'web_fail_add_chat',
    WEB_FAIL_OFFLINE_RESUME: 'web_fail_offline_resume',
    WEB_FAIL_STORAGE_INITIALIZATION: 'web_fail_storage_initialization',
    WEB_FAIL_ENC_SALT: 'web_fail_enc_salt',
    CACHE_STORAGE_OPEN_FAILED: 'cache_storage_open_failed'
} as const)

export type WaLogoutReason = (typeof WA_LOGOUT_REASONS)[keyof typeof WA_LOGOUT_REASONS]

export const WA_STREAM_SIGNALING = Object.freeze({
    STREAM_ERROR_TAG: 'stream:error',
    XML_STREAM_END_TAG: 'xmlstreamend',
    CONFLICT_TAG: 'conflict',
    ACK_TAG: 'ack',
    XML_NOT_WELL_FORMED_TAG: 'xml-not-well-formed',
    REPLACED_TYPE: 'replaced',
    FORCE_LOGIN_CODE: 515,
    FORCE_LOGOUT_CODE: 516
} as const)

export const WA_FAILURE_REASONS = Object.freeze({
    GENERIC_FAILURE: 400,
    NOT_AUTHORIZED: 401,
    TEMP_BANNED: 402,
    LOCKED: 403,
    CLIENT_TOO_OLD: 405,
    BANNED: 406,
    BAD_USER_AGENT: 409,
    INTERNAL_SERVER_ERROR: 500,
    EXPERIMENTAL: 501,
    SERVICE_UNAVAILABLE: 503
} as const)

export const WA_DISCONNECT_REASONS = Object.freeze({
    CLIENT_DISCONNECTED: 'client_disconnected',
    COMMS_STOPPED: 'comms_stopped',
    STREAM_ERROR_REPLACED: 'stream_error_replaced',
    STREAM_ERROR_DEVICE_REMOVED: 'stream_error_device_removed',
    STREAM_ERROR_ACK: 'stream_error_ack',
    STREAM_ERROR_XML_NOT_WELL_FORMED: 'stream_error_xml_not_well_formed',
    STREAM_ERROR_OTHER: 'stream_error_other',
    STREAM_ERROR_FORCE_LOGIN: 'stream_error_force_login',
    STREAM_ERROR_FORCE_LOGOUT: 'stream_error_force_logout',
    FAILURE_LOCKED: 'failure_locked',
    FAILURE_NOT_AUTHORIZED: 'failure_not_authorized',
    FAILURE_BANNED: 'failure_banned',
    FAILURE_CLIENT_TOO_OLD: 'failure_client_too_old',
    FAILURE_BAD_USER_AGENT: 'failure_bad_user_agent',
    FAILURE_SERVICE_UNAVAILABLE: 'failure_service_unavailable',
    PRIMARY_IDENTITY_KEY_CHANGE: 'primary_identity_key_change'
} as const)

export const WA_CONNECTION_REASONS = Object.freeze({
    CONNECTED: 'connected',
    RECONNECTED: 'reconnected'
} as const)

export type WaFailureReasonCode = (typeof WA_FAILURE_REASONS)[keyof typeof WA_FAILURE_REASONS]

export type WaStreamErrorCode =
    | typeof WA_STREAM_SIGNALING.FORCE_LOGIN_CODE
    | typeof WA_STREAM_SIGNALING.FORCE_LOGOUT_CODE

export type WaConnectionCode = WaFailureReasonCode | WaStreamErrorCode

export type WaDisconnectReason = (typeof WA_DISCONNECT_REASONS)[keyof typeof WA_DISCONNECT_REASONS]

export type WaConnectionOpenReason =
    (typeof WA_CONNECTION_REASONS)[keyof typeof WA_CONNECTION_REASONS]
