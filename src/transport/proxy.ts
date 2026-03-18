import type { WaProxyAgent, WaProxyDispatcher, WaProxyTransport } from '@transport/types'

export function isProxyDispatcher(value: unknown): value is WaProxyDispatcher {
    return (
        typeof value === 'object' &&
        value !== null &&
        'dispatch' in value &&
        typeof (value as { readonly dispatch?: unknown }).dispatch === 'function'
    )
}

export function isProxyAgent(value: unknown): value is WaProxyAgent {
    return (
        typeof value === 'object' &&
        value !== null &&
        'addRequest' in value &&
        typeof (value as { readonly addRequest?: unknown }).addRequest === 'function'
    )
}

export function isProxyTransport(value: unknown): value is WaProxyTransport {
    return isProxyDispatcher(value) || isProxyAgent(value)
}

export function toProxyDispatcher(
    proxy: WaProxyTransport | undefined
): WaProxyDispatcher | undefined {
    if (!proxy || !isProxyDispatcher(proxy)) {
        return undefined
    }
    return proxy
}

export function toProxyAgent(proxy: WaProxyTransport | undefined): WaProxyAgent | undefined {
    if (!proxy || !isProxyAgent(proxy)) {
        return undefined
    }
    return proxy
}
