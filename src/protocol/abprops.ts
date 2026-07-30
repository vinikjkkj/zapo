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

/** `WA_ABPROPS` with `code` renamed to `configCode`, literal types preserved. */
type LegacyAbPropConfigView = {
    readonly [K in AbPropName]: {
        readonly configCode: (typeof WA_ABPROPS)[K]['code']
        readonly type: (typeof WA_ABPROPS)[K]['type']
        readonly defaultValue: (typeof WA_ABPROPS)[K]['defaultValue']
    }
}

/**
 * @deprecated Use `WA_ABPROPS`.
 *
 * Covers every user prop rather than the curated subset it replaced, with a
 * handful of config codes corrected. Group props stay in `WA_GROUP_ABPROPS`.
 */
export const AB_PROP_CONFIGS: LegacyAbPropConfigView = buildLegacyConfigView()

function buildLegacyConfigView(): LegacyAbPropConfigView {
    const view = {} as Record<AbPropName, AbPropConfigEntry>
    for (const [name, entry] of Object.entries(WA_ABPROPS)) {
        view[name as AbPropName] = Object.freeze({
            configCode: entry.code,
            type: entry.type,
            defaultValue: entry.defaultValue
        })
    }
    return Object.freeze(view) as LegacyAbPropConfigView
}
