export const WA_CALL_PAYLOAD_TAGS = Object.freeze({
    OFFER: 'offer',
    OFFER_NOTICE: 'offer_notice',
    ACCEPT: 'accept',
    PREACCEPT: 'preaccept',
    REJECT: 'reject',
    TERMINATE: 'terminate',
    TRANSPORT: 'transport',
    MUTE: 'mute',
    VIDEO_STATE: 'video_state',
    GROUP_INFO: 'group_info',
    GROUP_UPDATE: 'group_update',
    ENC_REKEY: 'enc_rekey',
    PEER_STATE: 'peer_state',
    FLOW_CONTROL: 'flow_control',
    WEB_CLIENT: 'web_client'
} as const)

export type WaCallPayloadTag = (typeof WA_CALL_PAYLOAD_TAGS)[keyof typeof WA_CALL_PAYLOAD_TAGS]

/**
 * Payload tags that wa-web responds to with a `<receipt>` carrying a typed
 * child node (`<offer call-id call-creator/>`, etc.) instead of a plain
 * `<ack class="call"/>`. Source: `WAWebHandleVoipCall.js`.
 */
export const WA_CALL_RECEIPT_PAYLOAD_TAGS: ReadonlySet<WaCallPayloadTag> = new Set([
    WA_CALL_PAYLOAD_TAGS.OFFER,
    WA_CALL_PAYLOAD_TAGS.ACCEPT,
    WA_CALL_PAYLOAD_TAGS.REJECT,
    WA_CALL_PAYLOAD_TAGS.ENC_REKEY
])

export const WA_CALL_NODE_ATTRS = Object.freeze({
    CALL_ID: 'call-id',
    CALL_CREATOR: 'call-creator',
    GROUP_JID: 'group-jid',
    CALLER_PN: 'caller_pn',
    CALLER_COUNTRY_CODE: 'caller_country_code',
    USERNAME: 'username',
    NOTIFY: 'notify',
    SENDER_LID: 'sender_lid',
    PLATFORM: 'platform',
    VERSION: 'version',
    REASON: 'reason',
    USER_PN: 'user_pn',
    GUEST_NAME: 'guest_name'
} as const)

export const WA_CALL_CHILD_TAGS = Object.freeze({
    VIDEO: 'video',
    SILENCE: 'silence',
    GROUP_INFO: 'group_info'
} as const)
