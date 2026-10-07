/** Turns whatever was thrown into an `Error` with a readable message. */
export function toError(value: unknown): Error {
    if (value instanceof Error) return value
    if (typeof value === 'string') return new Error(value)
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return new Error(String(value))
    }
    if (value && typeof value === 'object') {
        const message = (value as { readonly message?: unknown }).message
        if (typeof message === 'string' && message.length > 0) {
            return new Error(message)
        }
        const code = (value as { readonly code?: unknown }).code
        if (typeof code === 'string' || typeof code === 'number') {
            return new Error(`unknown error (${code})`)
        }
    }
    return new Error('unknown error')
}
