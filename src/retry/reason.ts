import { RETRY_REASON, type WaRetryReasonCode } from '@retry/constants'
import { toError } from '@util/primitives'

const RETRY_REASON_MATCHERS = [
    {
        matches: ['no session', 'session not found'],
        code: RETRY_REASON.SignalErrorNoSession
    },
    { matches: ['invalid key id'], code: RETRY_REASON.SignalErrorInvalidKeyId },
    { matches: ['invalid key'], code: RETRY_REASON.SignalErrorInvalidKey },
    {
        matches: [
            'invalid signal message',
            'invalid prekey signal message',
            'invalid sender key message'
        ],
        code: RETRY_REASON.SignalErrorInvalidMessage
    },
    { matches: ['invalid signature'], code: RETRY_REASON.SignalErrorInvalidSignature },
    {
        matches: ['too many messages in future', 'future message'],
        code: RETRY_REASON.SignalErrorFutureMessage
    },
    { matches: ['invalid mac'], code: RETRY_REASON.SignalErrorBadMac },
    { matches: ['invalid session'], code: RETRY_REASON.SignalErrorInvalidSession },
    { matches: ['invalid message key'], code: RETRY_REASON.SignalErrorInvalidMsgKey },
    {
        matches: [['broadcast', 'ephemeral']],
        code: RETRY_REASON.BadBroadcastEphemeralSetting
    },
    {
        matches: ['unknown companion', 'unknown device'],
        code: RETRY_REASON.UnknownCompanionNoPrekey
    },
    { matches: ['adv'], code: RETRY_REASON.AdvFailure },
    {
        matches: [['status', 'revoke', 'delay']],
        code: RETRY_REASON.StatusRevokeDelay
    }
] as const

export function mapRetryReasonFromError(error: unknown): WaRetryReasonCode | undefined {
    const message = toError(error).message.toLowerCase()

    for (const matcher of RETRY_REASON_MATCHERS) {
        if (
            matcher.matches.some((candidate) =>
                Array.isArray(candidate)
                    ? candidate.every((part) => message.includes(part))
                    : message.includes(candidate as string)
            )
        ) {
            return matcher.code
        }
    }
    return undefined
}
