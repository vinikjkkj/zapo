import { getWaCompanionPlatformId } from '@protocol/browser'
import { WA_DEFAULTS } from '@protocol/defaults'
import { getRuntimeOsDisplayName } from '@util/runtime'

/**
 * Raw device-identity inputs a caller may set. Any field left unset is filled
 * with the same default the client uses, so callers that resolve identity
 * independently (e.g. the WAM analytics plugin) stay consistent with the
 * pairing `ClientPayload`.
 */
export interface WaDeviceIdentityOptions {
    readonly deviceBrowser?: string
    readonly deviceOsDisplayName?: string
    readonly devicePlatform?: string
}

/** Fully-resolved device identity advertised to WhatsApp. */
export interface WaDeviceIdentity {
    readonly browser: string
    readonly osDisplayName: string
    readonly platform: string
}

/**
 * Resolves the device identity from raw options, applying the shared defaults:
 * browser falls back to {@link WA_DEFAULTS}.DEVICE_BROWSER, OS name to the
 * detected runtime OS, and platform id is inferred from the browser. This is
 * the single source of truth used by both the client factory and the auth
 * client so the pairing payload and any analytics/telemetry agree.
 */
export function resolveWaDeviceIdentity(options: WaDeviceIdentityOptions): WaDeviceIdentity {
    const browser = options.deviceBrowser ?? WA_DEFAULTS.DEVICE_BROWSER
    return Object.freeze({
        browser,
        osDisplayName: options.deviceOsDisplayName ?? getRuntimeOsDisplayName(),
        platform: options.devicePlatform ?? getWaCompanionPlatformId(browser)
    })
}
