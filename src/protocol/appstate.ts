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

export const WA_APP_STATE_CHAT_MUTATION_SPECS = Object.freeze({
    STAR: { collection: WA_APP_STATE_COLLECTIONS.REGULAR_HIGH, action: 'star', version: 2 },
    MUTE: { collection: WA_APP_STATE_COLLECTIONS.REGULAR_HIGH, action: 'mute', version: 2 },
    PIN: { collection: WA_APP_STATE_COLLECTIONS.REGULAR_LOW, action: 'pin_v1', version: 5 },
    ARCHIVE: { collection: WA_APP_STATE_COLLECTIONS.REGULAR_LOW, action: 'archive', version: 3 },
    DELETE_MESSAGE_FOR_ME: {
        collection: WA_APP_STATE_COLLECTIONS.REGULAR_HIGH,
        action: 'deleteMessageForMe',
        version: 3
    },
    MARK_CHAT_AS_READ: {
        collection: WA_APP_STATE_COLLECTIONS.REGULAR_LOW,
        action: 'markChatAsRead',
        version: 3
    },
    CLEAR_CHAT: {
        collection: WA_APP_STATE_COLLECTIONS.REGULAR_HIGH,
        action: 'clearChat',
        version: 6
    },
    DELETE_CHAT: {
        collection: WA_APP_STATE_COLLECTIONS.REGULAR_HIGH,
        action: 'deleteChat',
        version: 6
    },
    LOCK_CHAT: { collection: WA_APP_STATE_COLLECTIONS.REGULAR_LOW, action: 'lock', version: 7 }
} as const)
