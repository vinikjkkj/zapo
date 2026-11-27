/**
 * Sanitized native Business Agent failure; remote messages and credentials are never attached.
 * `unconfirmed` means the operation may have reached the server. Reconcile before another write.
 * @example
 * if (error instanceof WaBusinessAgentError && error.code === 'cooldown') {
 *     scheduleAfter(error.retryAfterMs)
 * }
 */
export class WaBusinessAgentError extends Error {
    /**
     * @param code Stable local failure category.
     * @param serverCode Sanitized numeric refusal code, when supplied by the server.
     * @param retryAfterMs Remaining native cooldown, or null when not applicable.
     */
    public constructor(
        public readonly code:
            | 'not_connected'
            | 'identity_changed'
            | 'authentication_failed'
            | 'recovery_required'
            | 'cooldown'
            | 'timeout'
            | 'rejected'
            | 'unconfirmed'
            | 'invalid_response',
        public readonly serverCode: string | null = null,
        public readonly retryAfterMs: number | null = null
    ) {
        super(`Business Agent operation ${code}`)
        this.name = 'WaBusinessAgentError'
    }
}
