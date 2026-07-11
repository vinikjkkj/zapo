import { toProxyDispatcher } from '@transport/proxy'
import type { WaProxyTransport } from '@transport/types'
import { toError } from '@util/primitives'

const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const DEFAULT_TIMEOUT_MS = 10_000

const SW_JS_URL = 'https://web.whatsapp.com/sw.js'
const CLIENT_REVISION_PATTERN = /\\?"client_revision\\?":\s*(\d+)/

/**
 * Public app-listing page whose markup embeds the current WhatsApp for
 * Android release. WhatsApp's own `whatsapp.com/android` page only shows a
 * stale minimum-requirement version, so a mirror that tracks the live
 * release is used as the default source.
 */
const MOBILE_SOURCE_URL = 'https://whatsapp-messenger.en.uptodown.com/android'

/**
 * Matches a WhatsApp for Android version. These always start with `2.` and
 * carry three or four dotted numeric parts (`2.YY.WW.RR`). The first match
 * on the listing page is the current release; older releases appear further
 * down the document.
 */
const MOBILE_VERSION_PATTERN = /\b(2(?:\.\d{1,4}){2,3})\b/

/** Options shared by the Web and Mobile version fetchers. */
export interface WaFetchVersionOptions {
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

export type WaFetchLatestWebVersionOptions = WaFetchVersionOptions

export interface WaFetchLatestMobileVersionOptions extends WaFetchVersionOptions {
    /**
     * Override the page to scrape. Defaults to a public WhatsApp for Android
     * listing. Provide your own mirror if the default layout changes or is
     * unreachable from your network.
     */
    readonly url?: string
    /**
     * Override the version-extraction regex. Must expose the version string
     * in capture group 1. Defaults to a WhatsApp `2.x.x[.x]` matcher whose
     * first hit is the current release.
     */
    readonly versionPattern?: RegExp
}

export interface WaLatestWebVersion {
    /** Version string in the `2.3000.x` form accepted by `WaClientOptions.version`. */
    readonly version: string
    /** Parsed numeric parts. */
    readonly parts: readonly [number, number, number]
}

export interface WaLatestMobileVersion {
    /**
     * Version string in the `2.26.x.y` form accepted by
     * `WaMobileTransportDeviceInfo.appVersion`.
     */
    readonly version: string
    /** Parsed numeric parts (three or four elements). */
    readonly parts: readonly number[]
}

/**
 * Fetches `url` with the shared timeout/abort/proxy scaffolding and returns
 * the response body text. `label` names the source in error messages
 * (`failed to fetch <label>: ...`, `<label> timed out after ...`).
 */
async function fetchSourceText(
    url: string,
    label: string,
    defaultHeaders: Readonly<Record<string, string>>,
    options: WaFetchVersionOptions
): Promise<string> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const dispatcher = toProxyDispatcher(options.proxy)
    const fetchImpl = options.fetch ?? fetch

    const controller = new AbortController()
    const timer = setTimeout(
        () => controller.abort(new Error(`fetch ${label} timed out after ${timeoutMs}ms`)),
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
            ...defaultHeaders,
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
            ;(init as { dispatcher?: unknown }).dispatcher = dispatcher
        }

        let response: Response
        try {
            response = await fetchImpl(url, init)
        } catch (error) {
            throw new Error(`failed to fetch ${label}: ${toError(error).message}`)
        }
        if (!response.ok) {
            throw new Error(`failed to fetch ${label}: http ${response.status}`)
        }
        return await response.text()
    } finally {
        clearTimeout(timer)
        if (externalSignal && onExternalAbort) {
            externalSignal.removeEventListener('abort', onExternalAbort)
        }
    }
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
    const body = await fetchSourceText(SW_JS_URL, 'sw.js', { 'sec-fetch-site': 'none' }, options)
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
}

/**
 * Fetches the current WhatsApp for Android app version by scraping a public
 * app-listing page and assembles a `2.26.x.y` version string suitable for
 * `WaMobileTransportDeviceInfo.appVersion` (the mobile login payload).
 *
 * This is the mobile counterpart to {@link fetchLatestWaWebVersion}. The Web
 * client exposes its `client_revision` in a stable JSON blob (`sw.js`); the
 * Android app version is only published on app-listing pages, so this reads
 * HTML and is inherently more layout-dependent. Retarget it with `url` /
 * `versionPattern` if the default source changes.
 *
 * Use this when the app version baked into your `deviceInfo` starts being
 * rejected by the server as too old, and you need to refresh it without
 * waiting for a library bump.
 *
 * Network failures and parse errors throw; wrap in a `try`/`catch` and fall
 * back to a known-good hardcoded version.
 *
 * @example
 * const latest = await fetchLatestWaMobileVersion()
 * const deviceInfo = { ...baseDeviceInfo, appVersion: latest.version }
 */
export async function fetchLatestWaMobileVersion(
    options: WaFetchLatestMobileVersionOptions = {}
): Promise<WaLatestMobileVersion> {
    const versionPattern = options.versionPattern ?? MOBILE_VERSION_PATTERN
    const body = await fetchSourceText(
        options.url ?? MOBILE_SOURCE_URL,
        'wa-mobile version page',
        { accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' },
        options
    )
    const match = versionPattern.exec(body)
    if (!match?.[1]) {
        throw new Error('wa-mobile version not found in page response')
    }
    const version = match[1]
    const parts = version.split('.').map((part) => Number.parseInt(part, 10))
    if (parts.length < 3 || parts.some((part) => !Number.isSafeInteger(part) || part < 0)) {
        throw new Error(`invalid wa-mobile version parsed from page: ${version}`)
    }
    return {
        version,
        parts
    }
}
