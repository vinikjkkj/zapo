import { WA_WAM_GLOBALS, type WaWamChannel, type WaWamGlobalName } from '@vinikjkkj/wa-wam'
import { WA_VERSION } from 'zapo-js'
import {
    getWaBrowserDisplayName,
    resolveWaDeviceIdentity,
    type WaDeviceIdentityOptions
} from 'zapo-js/protocol'

import { resolveWamEnumValue } from './registry.js'
import type { WamGlobalValue } from './wire/WamBatch.js'

/**
 * Batch-level global inputs. Resolves platform/browser/OS from the same identity
 * the client advertises in pairing, so the globals never contradict the
 * `ClientPayload` (an inconsistent global is a worse fingerprint than none).
 */
export interface WamGlobalsInput extends WaDeviceIdentityOptions {
    /** Per-session stream id, stamped both in the header and as global 3543. */
    readonly streamId: number
    /** Overrides the advertised app version (defaults to the bundled WA_VERSION). */
    readonly appVersion?: string
    /** `service_improvement_opt_out` consent bit (defaults to `false`). */
    readonly serviceImprovementOptOut?: boolean
}

/** Maps an OS display name to the `WEBC_WEB_PLATFORM_TYPE` enum key. */
function webcWebPlatformKey(osDisplayName: string): string {
    const os = osDisplayName.toLowerCase()
    if (os.includes('win')) return 'WIN32'
    if (os.includes('mac') || os.includes('os x') || os.includes('darwin')) return 'DARWIN'
    return 'WEB'
}

/** The globals a headless client can honestly populate (enum globals as their value KEY), omitting what it cannot truthfully know. */
function buildNamedGlobals(
    input: WamGlobalsInput
): Partial<Record<WaWamGlobalName, WamGlobalValue>> {
    const identity = resolveWaDeviceIdentity(input)
    return {
        platform: 'WEBCLIENT',
        webcWebPlatform: webcWebPlatformKey(identity.osDisplayName),
        appVersion: input.appVersion ?? WA_VERSION,
        osVersion: identity.osDisplayName,
        browser: getWaBrowserDisplayName(identity.browser),
        deviceName: 'Desktop',
        streamId: input.streamId,
        mcc: 0,
        mnc: 0,
        serviceImprovementOptOut: input.serviceImprovementOptOut ?? false
    }
}

/**
 * Resolves the named globals into the id-keyed map `WamBatch` consumes for a
 * given channel: filters to globals valid on that channel and converts enum
 * globals from their key string to the numeric value.
 */
export function resolveWamGlobals(
    input: WamGlobalsInput,
    channel: WaWamChannel = 'regular'
): Map<number, WamGlobalValue> {
    const named = buildNamedGlobals(input)
    const byId = new Map<number, WamGlobalValue>()
    for (const name of Object.keys(named) as WaWamGlobalName[]) {
        const raw = named[name]
        if (raw === undefined || raw === null) continue
        const global = WA_WAM_GLOBALS[name]
        if (global === undefined) continue
        if (!(global.channels as readonly WaWamChannel[]).includes(channel)) continue
        if (global.type === 'enum') {
            const numeric = resolveWamEnumValue(global.enum, String(raw))
            if (numeric === null) continue
            byId.set(global.id, numeric)
        } else {
            byId.set(global.id, raw)
        }
    }
    return byId
}
