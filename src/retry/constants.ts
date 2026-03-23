export const MAX_RETRY_ATTEMPTS = 5
export const RETRY_KEYS_MIN_COUNT = 2
export const RETRY_OUTBOUND_TTL_MS = 60 * 1000
export const RETRY_RECEIPT_VERSION = '1'

export const RETRY_REASON = Object.freeze({
    UnknownError: 0,
    SignalErrorNoSession: 1,
    SignalErrorInvalidKey: 2,
    SignalErrorInvalidKeyId: 3,
    SignalErrorInvalidMessage: 4,
    SignalErrorInvalidSignature: 5,
    SignalErrorFutureMessage: 6,
    SignalErrorBadMac: 7,
    SignalErrorInvalidSession: 8,
    SignalErrorInvalidMsgKey: 9,
    BadBroadcastEphemeralSetting: 10,
    UnknownCompanionNoPrekey: 11,
    AdvFailure: 12,
    StatusRevokeDelay: 13
} as const)

export type WaRetryReasonCode = (typeof RETRY_REASON)[keyof typeof RETRY_REASON]
