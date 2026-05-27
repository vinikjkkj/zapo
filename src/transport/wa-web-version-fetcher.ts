import { toProxyDispatcher } from '@transport/proxy'
import type { WaProxyTransport } from '@transport/types'
import { toError } from '@util/primitives'

const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const DEFAULT_TIMEOUT_MS = 10_000
const SW_JS_URL = 'https://web.whatsapp.com/sw.js'
const CLIENT_REVISION_PATTERN = /\\?"client_revision\\?":\s*(\d+)/

export interface WaFetchLatestWebVersionOptions {
    /**
     * Proxy transport. Only undici-style `WaProxyDispatcher` is honored –
     * the global `fetch` does not consume `http.Agent`.
     */
    readonly proxy?: WaProxyTransport
    /** Request timeout (ms). Defaults to 10s. */
    readonly timeoutMs?: number
    /** External abort signal. */
    readonly signal?: AbortSignal
    /** Override the request user-agent. */
    readonly userAgent?: string
    /** Extra request headers (merged on top of defaults). */
    readonly headers?: Readonly<Record<string, string>>
    /**
     * Override the `fetch` implementation. Lets tests inject a stub without
     * monkey-patching `globalThis.fetch`. Defaults to `globalThis.fetch`.
     */
    readonly fetch?: typeof fetch
}

export interface WaLatestWebVersion {
    /** Version string in the `2.3000.x` form accepted by `WaClientOptions.version`. */
    readonly version: string
    /** Parsed numeric parts. */
    readonly parts: readonly [number, number, number]
}

/**
 * Fetches the current WhatsApp Web `client_revision` from the public
 * `sw.js` served by the WhatsApp Web frontend and assembles a
 * `2.3000.x` version string suitable for `WaClientOptions.version`.
 *
 * Use this when the library's hardcoded default starts being rejected by
 * the server with HTTP 405 / `failure_client_too_old`, and you need to
 * refresh the version without waiting for a library bump.
 *
 * Network failures and parse errors throw; wrap in a `try`/`catch` and
 * fall back to the hardcoded default.
 *
 * @example
 * const latest = await fetchLatestWaWebVersion()
 * const client = new WaClient({ store, sessionId, version: latest.version })
 */
export async function fetchLatestWaWebVersion(
    options: WaFetchLatestWebVersionOptions = {}
): Promise<WaLatestWebVersion> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const dispatcher = toProxyDispatcher(options.proxy)
    const fetchImpl = options.fetch ?? fetch

    const controller = new AbortController()
    const timer = setTimeout(
        () =>
            controller.abort(
                new Error(`fetch latest wa-web version timed out after ${timeoutMs}ms`)
            ),
        timeoutMs
    )
    timer.unref?.()

    let onExternalAbort: (() => void) | null = null
    const externalSignal = options.signal
    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort(externalSignal.reason)
        } else {
            onExternalAbort = () => controller.abort(externalSignal.reason)
            externalSignal.addEventListener('abort', onExternalAbort, { once: true })
        }
    }

    try {
        const headers: Record<string, string> = {
            'sec-fetch-site': 'none',
            'user-agent': options.userAgent ?? DEFAULT_USER_AGENT
        }
        if (options.headers) {
            for (const key in options.headers) {
                headers[key.toLowerCase()] = options.headers[key]
            }
        }
        const init: RequestInit = {
            method: 'GET',
            headers,
            signal: controller.signal
        }
        if (dispatcher) {
            // dispatcher is a non-standard undici-only extension to RequestInit
            ;(init as { dispatcher?: unknown }).dispatcher = dispatcher
        }

        let response: Response
        try {
            response = await fetchImpl(SW_JS_URL, init)
        } catch (error) {
            throw new Error(`failed to fetch sw.js: ${toError(error).message}`)
        }
        if (!response.ok) {
            throw new Error(`failed to fetch sw.js: http ${response.status}`)
        }
        const body = await response.text()
        const match = CLIENT_REVISION_PATTERN.exec(body)
        if (!match?.[1]) {
            throw new Error('client_revision not found in sw.js response')
        }
        const revision = Number.parseInt(match[1], 10)
        if (!Number.isSafeInteger(revision) || revision <= 0) {
            throw new Error(`invalid client_revision in sw.js: ${match[1]}`)
        }
        return {
            version: `2.3000.${revision}`,
            parts: [2, 3000, revision]
        }
    } finally {
        clearTimeout(timer)
        if (externalSignal && onExternalAbort) {
            externalSignal.removeEventListener('abort', onExternalAbort)
        }
    }
}
