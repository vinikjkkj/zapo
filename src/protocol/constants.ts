export const WA_BROWSERS = Object.freeze({
    CHROME: 'chrome',
    CHROMIUM: 'chromium',
    FIREFOX: 'firefox',
    SAFARI: 'safari',
    IE: 'ie',
    OPERA: 'opera',
    EDGE: 'edge'
} as const)

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

export const WA_DISCONNECT_REASONS = Object.freeze({
    CLIENT_DISCONNECTED: 'client_disconnected',
    COMMS_STOPPED: 'comms_stopped',
    STREAM_ERROR_REPLACED: 'stream_error_replaced',
    STREAM_ERROR_DEVICE_REMOVED: 'stream_error_device_removed',
    STREAM_ERROR_ACK: 'stream_error_ack',
    STREAM_ERROR_XML_NOT_WELL_FORMED: 'stream_error_xml_not_well_formed',
    STREAM_ERROR_OTHER: 'stream_error_other'
} as const)

export const WA_SIGNALING = Object.freeze({
    LINK_CODE_STAGE_COMPANION_HELLO: 'companion_hello',
    LINK_CODE_STAGE_GET_COUNTRY_CODE: 'get_country_code',
    LINK_CODE_STAGE_COMPANION_FINISH: 'companion_finish',
    LINK_CODE_STAGE_REFRESH_CODE: 'refresh_code',
    LINK_CODE_STAGE_PRIMARY_HELLO: 'primary_hello',
    COMPANION_REG_REFRESH_NOTIFICATION: 'companion_reg_refresh'
} as const)

export const WA_PAIRING_KDF_INFO = Object.freeze({
    LINK_CODE_BUNDLE: 'link_code_pairing_key_bundle_encryption_key',
    ADV_SECRET: 'adv_secret'
} as const)

export const WA_NODE_TAGS = Object.freeze({
    IQ: 'iq',
    SYNC: 'sync',
    COLLECTION: 'collection',
    PATCH: 'patch',
    PATCHES: 'patches',
    SNAPSHOT: 'snapshot',
    ERROR: 'error',
    ACK: 'ack',
    NOTIFICATION: 'notification',
    SUCCESS: 'success',
    INFO_BULLETIN: 'ib',
    DIRTY: 'dirty',
    EDGE_ROUTING: 'edge_routing',
    ROUTING_INFO: 'routing_info',
    MEDIA_CONN: 'media_conn',
    HOST: 'host',
    USYNC: 'usync',
    QUERY: 'query',
    DEVICES: 'devices',
    LIST: 'list',
    USER: 'user',
    PICTURE: 'picture',
    PRIVACY: 'privacy',
    PARTICIPATING: 'participating',
    PARTICIPANTS: 'participants',
    DESCRIPTION: 'description',
    MY_ADDONS: 'my_addons',
    KEY: 'key',
    REGISTRATION: 'registration',
    TYPE: 'type',
    IDENTITY: 'identity',
    SKEY: 'skey',
    ID: 'id',
    REF: 'ref',
    VALUE: 'value',
    SIGNATURE: 'signature',
    PAIR_DEVICE: 'pair-device',
    PAIR_SUCCESS: 'pair-success',
    LINK_CODE_COMPANION_REG: 'link_code_companion_reg',
    LINK_CODE_PAIRING_REF: 'link_code_pairing_ref',
    COUNTRY_CODE: 'country_code',
    DEVICE_IDENTITY: 'device-identity',
    PLATFORM: 'platform'
} as const)

export const WA_MESSAGE_TAGS = Object.freeze({
    MESSAGE: 'message',
    ENC: 'enc',
    RECEIPT: 'receipt',
    ACK: 'ack',
    ERROR: 'error'
} as const)

export const WA_MESSAGE_ACK_ATTRS = Object.freeze({
    TYPE: 'type',
    CLASS: 'class',
    CODE: 'code'
} as const)

export const WA_MESSAGE_TYPES = Object.freeze({
    ENC_VERSION: '2',
    MEDIA_NOTIFY: 'medianotify',
    ACK_TYPE_ERROR: 'error',
    ACK_CLASS_ERROR: 'error',
    ACK_CLASS_MESSAGE: 'message',
    RECEIPT_TYPE_PEER: 'peer_msg'
} as const)

export const WA_RETRYABLE_ACK_CODES = Object.freeze(['408', '429', '500', '503'] as const)

export const WA_IQ_TYPES = Object.freeze({
    GET: 'get',
    SET: 'set',
    RESULT: 'result',
    ERROR: 'error'
} as const)

export const WA_XMLNS = Object.freeze({
    MD: 'md',
    APP_STATE_SYNC: 'w:sync:app:state',
    MEDIA: 'w:m',
    SIGNAL: 'encrypt',
    DIRTY_BITS: 'urn:xmpp:whatsapp:dirty',
    PROFILE_PICTURE: 'w:profile:picture',
    PRIVACY: 'privacy',
    BLOCKLIST: 'blocklist',
    USYNC: 'usync',
    GROUPS: 'w:g2',
    NEWSLETTER: 'newsletter',
    ABT: 'abt',
    XMPP_PING: 'urn:xmpp:ping',
    WHATSAPP_PING: 'w:p'
} as const)

export const WA_APP_STATE_COLLECTIONS = Object.freeze({
    REGULAR: 'regular',
    REGULAR_LOW: 'regular_low',
    REGULAR_HIGH: 'regular_high',
    CRITICAL_BLOCK: 'critical_block',
    CRITICAL_UNBLOCK_LOW: 'critical_unblock_low'
} as const)

export const WA_APP_STATE_COLLECTION_STATES = Object.freeze({
    SUCCESS: 'success',
    SUCCESS_HAS_MORE: 'success_has_more',
    CONFLICT: 'conflict',
    CONFLICT_HAS_MORE: 'conflict_has_more',
    ERROR_RETRY: 'error_retry',
    ERROR_FATAL: 'error_fatal',
    BLOCKED: 'blocked'
} as const)

export const WA_APP_STATE_ERROR_CODES = Object.freeze({
    CONFLICT: '409',
    BAD_REQUEST: '400',
    NOT_FOUND: '404'
} as const)

export const WA_APP_STATE_SYNC_DATA_TYPE = Object.freeze({
    PATCH: 'Patch',
    SNAPSHOT: 'Snapshot',
    LOCAL: 'Local'
} as const)

export const WA_APP_STATE_KEY_TYPES = Object.freeze({
    MD_APP_STATE: 'md-app-state',
    MD_MSG_HIST: 'md-msg-hist'
} as const)

export const WA_APP_STATE_KDF_INFO = Object.freeze({
    MUTATION_KEYS: 'WhatsApp Mutation Keys',
    PATCH_INTEGRITY: 'WhatsApp Patch Integrity'
} as const)

export const WA_MEDIA_HKDF_INFO = Object.freeze({
    document: 'WhatsApp Document Keys',
    image: 'WhatsApp Image Keys',
    sticker: 'WhatsApp Image Keys',
    'xma-image': 'WhatsApp Image Keys',
    video: 'WhatsApp Video Keys',
    gif: 'WhatsApp Video Keys',
    audio: 'WhatsApp Audio Keys',
    ptt: 'WhatsApp Audio Keys',
    'md-app-state': 'WhatsApp App State Keys',
    'md-msg-hist': 'WhatsApp History Keys',
    history: 'WhatsApp History Keys'
} as const)

export const WA_PREVIEW_MEDIA_HKDF_INFO = 'Messenger Preview Keys'

export const WA_DEFAULTS = Object.freeze({
    HOST_DOMAIN: 's.whatsapp.net',
    GROUP_SERVER: 'g.us',
    DEVICE_PLATFORM: '9',
    DEVICE_BROWSER: WA_BROWSERS.FIREFOX,
    CHAT_SOCKET_URLS: ['wss://web.whatsapp.com/ws/chat', 'wss://web.whatsapp.com:5222/ws/chat'],
    NOISE_RESUME_FAILURES_BEFORE_FULL_HANDSHAKE: 1,
    IQ_TIMEOUT_MS: 15_000,
    NODE_QUERY_TIMEOUT_MS: 15_000,
    CONNECT_TIMEOUT_MS: 10_000,
    SOCKET_TIMEOUT_MS: 10_000,
    RECONNECT_INTERVAL_MS: 2_000,
    HEALTH_CHECK_INTERVAL_MS: 15_000,
    DEAD_SOCKET_TIMEOUT_MS: 20_000,
    MEDIA_TIMEOUT_MS: 30_000,
    APP_STATE_SYNC_TIMEOUT_MS: 30_000,
    SIGNAL_FETCH_KEY_BUNDLES_TIMEOUT_MS: 20_000,
    MESSAGE_ACK_TIMEOUT_MS: 10_000,
    MESSAGE_MAX_ATTEMPTS: 3,
    MESSAGE_RETRY_DELAY_MS: 750,
    PAIRING_CODE_MAX_AGE_SECONDS: 180,
    QR_INITIAL_TTL_MS: 60_000,
    QR_ROTATION_TTL_MS: 20_000,
    ABPROPS_PROTOCOL_VERSION: '1',
    MAX_DANGLING_RECEIPTS: 2_048
} as const)

export const WA_DIRTY_TYPES = Object.freeze({
    ACCOUNT_SYNC: 'account_sync',
    GROUPS: 'groups',
    SYNCD_APP_STATE: 'syncd_app_state',
    NEWSLETTER_METADATA: 'newsletter_metadata'
} as const)

export const WA_DIRTY_PROTOCOLS = Object.freeze({
    DEVICES: 'devices',
    PICTURE: 'picture',
    PRIVACY: 'privacy',
    BLOCKLIST: 'blocklist',
    NOTICE: 'notice'
} as const)

export const WA_ACCOUNT_SYNC_PROTOCOLS = Object.freeze([
    WA_DIRTY_PROTOCOLS.DEVICES,
    WA_DIRTY_PROTOCOLS.PICTURE,
    WA_DIRTY_PROTOCOLS.PRIVACY,
    WA_DIRTY_PROTOCOLS.BLOCKLIST,
    WA_DIRTY_PROTOCOLS.NOTICE
] as const)

export const WA_SUPPORTED_DIRTY_TYPES = Object.freeze([
    WA_DIRTY_TYPES.ACCOUNT_SYNC,
    WA_DIRTY_TYPES.SYNCD_APP_STATE,
    WA_DIRTY_TYPES.GROUPS,
    WA_DIRTY_TYPES.NEWSLETTER_METADATA
] as const)

export function getWaMediaHkdfInfo(mediaType: string): string {
    if (mediaType in WA_MEDIA_HKDF_INFO) {
        return WA_MEDIA_HKDF_INFO[mediaType as keyof typeof WA_MEDIA_HKDF_INFO]
    }
    throw new Error(`unsupported media type: ${mediaType}`)
}
