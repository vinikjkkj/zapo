import type { WaProxyAgent, WaProxyDispatcher, WaProxyTransport } from '@transport/types'

/** Type guard for an undici-style proxy dispatcher (has `dispatch` method). */
export function isProxyDispatcher(value: unknown): value is WaProxyDispatcher {
    return (
        typeof value === 'object' &&
        value !== null &&
        'dispatch' in value &&
        typeof (value as { readonly dispatch?: unknown }).dispatch === 'function'
    )
}

/** Type guard for a Node http.Agent-style proxy (has `addRequest` method). */
export function isProxyAgent(value: unknown): value is WaProxyAgent {
    return (
        typeof value === 'object' &&
        value !== null &&
        'addRequest' in value &&
        typeof (value as { readonly addRequest?: unknown }).addRequest === 'function'
    )
}

/** Type guard accepting either {@link isProxyDispatcher} or {@link isProxyAgent} shapes. */
export function isProxyTransport(value: unknown): value is WaProxyTransport {
    return isProxyDispatcher(value) || isProxyAgent(value)
}

/** Narrows `proxy` to {@link WaProxyDispatcher} or returns `undefined`. */
export function toProxyDispatcher(
    proxy: WaProxyTransport | undefined
): WaProxyDispatcher | undefined {
    if (!proxy || !isProxyDispatcher(proxy)) {
        return undefined
    }
    return proxy
}

/** Narrows `proxy` to {@link WaProxyAgent} or returns `undefined`. */
export function toProxyAgent(proxy: WaProxyTransport | undefined): WaProxyAgent | undefined {
    if (!proxy || !isProxyAgent(proxy)) {
        return undefined
    }
    return proxy
}
