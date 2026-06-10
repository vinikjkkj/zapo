export const WA_MESSAGE_TAGS = Object.freeze({
    MESSAGE: 'message',
    ENC: 'enc',
    RECEIPT: 'receipt',
    ACK: 'ack',
    ERROR: 'error'
} as const)

export const WA_MESSAGE_TYPES = Object.freeze({
    ENC_VERSION: '2',
    MEDIA_NOTIFY: 'medianotify',
    ACK_TYPE_ERROR: 'error',
    ACK_CLASS_ERROR: 'error',
    ACK_CLASS_MESSAGE: 'message',
    ACK_CLASS_CALL: 'call',
    RECEIPT_TYPE_DELIVERY: 'delivery',
    RECEIPT_TYPE_SENDER: 'sender',
    RECEIPT_TYPE_INACTIVE: 'inactive',
    RECEIPT_TYPE_READ: 'read',
    RECEIPT_TYPE_READ_SELF: 'read-self',
    RECEIPT_TYPE_PLAYED: 'played',
    RECEIPT_TYPE_PLAYED_SELF: 'played-self',
    RECEIPT_TYPE_HISTORY_SYNC: 'hist_sync',
    RECEIPT_TYPE_PEER: 'peer_msg',
    RECEIPT_TYPE_SERVER_ERROR: 'server-error',
    RECEIPT_TYPE_RETRY: 'retry',
    RECEIPT_TYPE_ENC_REKEY_RETRY: 'enc_rekey_retry',
    RECEIPT_TYPE_VIEW: 'view'
} as const)

export type WaOutboundReceiptType =
    | typeof WA_MESSAGE_TYPES.RECEIPT_TYPE_READ
    | typeof WA_MESSAGE_TYPES.RECEIPT_TYPE_READ_SELF
    | typeof WA_MESSAGE_TYPES.RECEIPT_TYPE_PLAYED
    | typeof WA_MESSAGE_TYPES.RECEIPT_TYPE_PLAYED_SELF
    | typeof WA_MESSAGE_TYPES.RECEIPT_TYPE_INACTIVE
    | typeof WA_MESSAGE_TYPES.RECEIPT_TYPE_HISTORY_SYNC

export const WA_RETRYABLE_ACK_CODES = Object.freeze(['408', '429', '500', '503'] as const)

/**
 * Stanza-ack `error` attr codes (nack reasons): sent when nacking a stanza
 * that could not be handled, and matched against the `error` carried by an
 * inbound publish ack (e.g. stale group addressing mode).
 */
export const WA_NACK_REASONS = Object.freeze({
    STALE_GROUP_ADDRESSING_MODE: 421,
    NEW_CHAT_MESSAGES_CAPPED: 475,
    PARSING_ERROR: 487,
    UNRECOGNIZED_STANZA: 488,
    UNRECOGNIZED_STANZA_CLASS: 489,
    UNRECOGNIZED_STANZA_TYPE: 490,
    INVALID_PROTOBUF: 491,
    INVALID_HOSTED_COMPANION_STANZA: 493,
    MISSING_MESSAGE_SECRET: 495,
    SIGNAL_ERROR_OLD_COUNTER: 496,
    MESSAGE_DELETED_ON_PEER: 499,
    UNHANDLED_ERROR: 500,
    UNSUPPORTED_ADMIN_REVOKE: 550,
    UNSUPPORTED_LID_GROUP: 551,
    DB_OPERATION_FAILED: 552
} as const)

export const WA_STANZA_MSG_TYPES = Object.freeze({
    TEXT: 'text',
    MEDIA: 'media',
    MEDIA_NOTIFY: 'medianotify',
    PAY: 'pay',
    POLL: 'poll',
    REACTION: 'reaction',
    EVENT: 'event'
} as const)

export const WA_EDIT_ATTRS = Object.freeze({
    MESSAGE_EDIT: '1',
    PIN_IN_CHAT: '2',
    NEWSLETTER_EDIT: '3',
    SENDER_REVOKE: '7',
    ADMIN_REVOKE: '8'
} as const)

export const WA_POLL_META_TYPES = Object.freeze({
    CREATION: 'creation',
    VOTE: 'vote',
    RESULT_SNAPSHOT: 'result_snapshot',
    EDIT: 'edit'
} as const)

export const WA_EVENT_META_TYPES = Object.freeze({
    CREATION: 'creation',
    RESPONSE: 'response',
    EDIT: 'edit'
} as const)

export const WA_ENC_MEDIA_TYPES = Object.freeze({
    IMAGE: 'image',
    VIDEO: 'video',
    PTV: 'ptv',
    AUDIO: 'audio',
    PTT: 'ptt',
    LOCATION: 'location',
    LIVE_LOCATION: 'livelocation',
    VCARD: 'vcard',
    CONTACT_ARRAY: 'contact_array',
    DOCUMENT: 'document',
    URL: 'url',
    GIF: 'gif',
    STICKER: 'sticker',
    STICKER_PACK: 'sticker_pack',
    LIST: 'list',
    LIST_RESPONSE: 'list_response',
    BUTTON: 'button',
    BUTTON_RESPONSE: 'buttons_response',
    ORDER: 'order',
    PRODUCT: 'product',
    NATIVE_FLOW_RESPONSE: 'native_flow_response',
    GROUP_HISTORY: 'group_history'
} as const)
