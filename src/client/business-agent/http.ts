import type { WaBusinessAgentAuthentication } from '@client/business-agent/authentication'
import { WaBusinessAgentError } from '@client/business-agent/errors'
import { WA_BUSINESS_AGENT } from '@protocol/business-agent'
import type { WaProxyDispatcher } from '@transport/types'
import { TEXT_DECODER, TEXT_ENCODER } from '@util/bytes'

/** Internal JSON object guard; server values never become public error messages. */
export function isBusinessAgentRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Internal test seam. Production always uses the fixed Facebook HTTPS endpoint. */
export interface WaBusinessAgentHttpOptions {
    readonly authentication: WaBusinessAgentAuthentication
    readonly dispatcher?: WaProxyDispatcher
    readonly fetch?: typeof fetch
    readonly timeoutMs?: number
}

function serverCode(envelope: Record<string, unknown>, status: number): string | null {
    const error = envelope.error ?? (Array.isArray(envelope.errors) ? envelope.errors[0] : null)
    if (isBusinessAgentRecord(error)) {
        const extensions = isBusinessAgentRecord(error.extensions) ? error.extensions : {}
        const code = error.code ?? extensions.error_code ?? extensions.code
        if (
            (typeof code === 'number' || typeof code === 'string') &&
            /^-?\d{1,10}$/.test(String(code))
        )
            return String(code)
    }
    return status >= 400 && status < 500 ? String(status) : null
}

/** Executes one native Relay operation. Never follows redirects or retries a mutation. */
export function createBusinessAgentHttp(
    options: WaBusinessAgentHttpOptions
): (
    document: string,
    variables: Readonly<Record<string, unknown>>
) => Promise<Record<string, unknown>> {
    const send = options.fetch ?? globalThis.fetch
    const timeoutMs = options.timeoutMs ?? WA_BUSINESS_AGENT.HTTP_TIMEOUT_MS
    if (
        !Number.isFinite(timeoutMs) ||
        timeoutMs <= 0 ||
        timeoutMs > WA_BUSINESS_AGENT.HTTP_TIMEOUT_MS
    )
        throw new RangeError('invalid Business Agent HTTP timeout')
    return async (document, variables) => {
        if (!(Object.values(WA_BUSINESS_AGENT.DOCUMENTS) as readonly string[]).includes(document))
            throw new TypeError('unsupported Business Agent document')
        const serialized = JSON.stringify(variables)
        if (TEXT_ENCODER.encode(serialized).length > WA_BUSINESS_AGENT.MAX_BYTES)
            throw new RangeError('Business Agent request exceeds 2 MiB')
        const authentication = options.authentication
        const generation = authentication.generation
        const token = await authentication.token()
        authentication.assertCurrent(generation)
        // Native Relay IDs are decimal strings, exceeding JavaScript's safe integer range.
        const body = JSON.stringify({
            variables,
            access_token: token,
            doc_id: document,
            locale: 'en_US'
        })
        if (TEXT_ENCODER.encode(body).length > WA_BUSINESS_AGENT.MAX_BYTES)
            throw new RangeError('Business Agent request exceeds 2 MiB')
        const controller = new AbortController()
        const signal = authentication.signal
        const abort = () => controller.abort()
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
        const timer = setTimeout(abort, timeoutMs)
        try {
            authentication.assertCurrent(generation)
            const init: NonNullable<Parameters<typeof send>[1]> = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                redirect: 'manual',
                body,
                signal: controller.signal
            }
            // The undici dispatcher extension is absent from DOM RequestInit typings.
            if (options.dispatcher) Object.assign(init, { dispatcher: options.dispatcher })
            const response = await send(WA_BUSINESS_AGENT.ENDPOINT, init)
            const declaredSize = Number(response.headers.get('content-length'))
            if (declaredSize > WA_BUSINESS_AGENT.MAX_BYTES) {
                await response.body?.cancel()
                throw new WaBusinessAgentError('unconfirmed')
            }
            const reader = response.body?.getReader()
            if (!reader) throw new WaBusinessAgentError('unconfirmed')
            const chunks: Uint8Array[] = []
            let size = 0
            try {
                while (true) {
                    const chunk = await reader.read()
                    if (chunk.done) break
                    size += chunk.value.length
                    if (size > WA_BUSINESS_AGENT.MAX_BYTES)
                        throw new WaBusinessAgentError('unconfirmed')
                    chunks.push(chunk.value)
                }
            } finally {
                await reader.cancel()
                reader.releaseLock()
            }
            authentication.assertCurrent(generation)
            const bytes = new Uint8Array(size)
            let offset = 0
            for (const chunk of chunks) {
                bytes.set(chunk, offset)
                offset += chunk.length
            }
            const envelope: unknown = JSON.parse(TEXT_DECODER.decode(bytes))
            if (!isBusinessAgentRecord(envelope) || response.status >= 500)
                throw new WaBusinessAgentError('unconfirmed')
            const hasError =
                (envelope.error !== null && envelope.error !== undefined) ||
                (envelope.errors !== null &&
                    envelope.errors !== undefined &&
                    (!Array.isArray(envelope.errors) || envelope.errors.length > 0))
            const hasData = envelope.data !== null && envelope.data !== undefined
            if (hasData && hasError) throw new WaBusinessAgentError('unconfirmed')
            if (hasError || (response.status >= 400 && response.status < 500)) {
                const code = serverCode(envelope, response.status)
                if (code === '190') authentication.invalidate()
                throw new WaBusinessAgentError('rejected', code)
            }
            if (response.status !== 200 || !isBusinessAgentRecord(envelope.data))
                throw new WaBusinessAgentError('unconfirmed')
            return envelope.data
        } catch (error) {
            if (
                error instanceof WaBusinessAgentError &&
                error.code === 'rejected' &&
                error.serverCode === '190'
            )
                throw error
            authentication.assertCurrent(generation)
            if (error instanceof WaBusinessAgentError) throw error
            throw new WaBusinessAgentError('unconfirmed')
        } finally {
            clearTimeout(timer)
            signal.removeEventListener('abort', abort)
        }
    }
}
