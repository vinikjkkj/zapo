import { TEXT_ENCODER } from '@util/bytes'

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
    NOT_FOUND: '404',
    NOT_ALLOWED: '405',
    NOT_ACCEPTABLE: '406'
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
    MUTATION_KEYS: TEXT_ENCODER.encode('WhatsApp Mutation Keys'),
    PATCH_INTEGRITY: TEXT_ENCODER.encode('WhatsApp Patch Integrity')
} as const)
