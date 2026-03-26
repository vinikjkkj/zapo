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
