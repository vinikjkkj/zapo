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
    RECEIPT_TYPE_RETRY: 'retry'
} as const)

export const WA_RETRYABLE_ACK_CODES = Object.freeze(['408', '429', '500', '503'] as const)
