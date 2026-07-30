import { WA_ABPROPS, type WaAbPropName, type WaAbPropType, type WaAbPropValue } from '@abprops-spec'

export const WA_ABPROPS_PROTOCOL_VERSION = '1'
export const WA_ABPROPS_REFRESH_BOUNDS = Object.freeze({
    MIN_S: 600,
    MAX_S: 604_800,
    DEFAULT_S: 86_400
} as const)

/** @deprecated Use `WaAbPropType`. Now also covers `'float'`. */
export type AbPropType = WaAbPropType

/** @deprecated Use `WaAbPropValue`. */
export type AbPropValue = WaAbPropValue

/** @deprecated Use `WaAbPropName`. Now covers the whole WA Web catalogue. */
export type AbPropName = WaAbPropName

/**
 * @deprecated Use `WaAbProp`, which names the wire id `code` and also carries
 * `debugDefaultValue`.
 */
export interface AbPropConfigEntry {
    readonly configCode: number
    readonly type: AbPropType
    readonly defaultValue: AbPropValue
}

/**
 * @deprecated Use `WA_ABPROPS`, which is the vendored WA Web catalogue itself.
 *
 * Kept as a compatibility view over `WA_ABPROPS` for consumers reading
 * `configCode`. Two differences from the hand-maintained table it replaced:
 * it covers every prop WA Web knows about rather than a curated subset, and a
 * handful of config codes are corrected against the current bundle.
 */
export const AB_PROP_CONFIGS: Readonly<Record<AbPropName, AbPropConfigEntry>> =
    buildLegacyConfigView()

function buildLegacyConfigView(): Readonly<Record<AbPropName, AbPropConfigEntry>> {
    const view = {} as Record<AbPropName, AbPropConfigEntry>
    for (const [name, entry] of Object.entries(WA_ABPROPS)) {
        view[name as AbPropName] = Object.freeze({
            configCode: entry.code,
            type: entry.type,
            defaultValue: entry.defaultValue
        })
    }
    return Object.freeze(view)
}
