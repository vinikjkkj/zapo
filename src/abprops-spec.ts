import { WA_ABPROPS_BY_CODE, type WaAbPropName } from '../spec/abprops'

export {
    WA_ABPROPS,
    WA_ABPROPS_BY_CODE,
    WA_ABPROPS_SPECIAL_EARLY,
    WA_ABPROPS_USED_BEFORE_INIT,
    WA_GROUP_ABPROPS,
    WA_GROUP_ABPROPS_BY_CODE
} from '../spec/abprops'
export type {
    WaAbProp,
    WaAbPropName,
    WaAbPropType,
    WaAbPropValue,
    WaAbPropValueByName,
    WaAbPropValueOf,
    WaGroupAbPropName,
    WaGroupAbPropValueByName
} from '../spec/abprops'

// The reverse map is emitted with numeric literal keys, so it cannot be indexed
// with a plain `number`. Widening it keeps the lookup a single property read and
// avoids allocating a parallel Map with 2000+ entries at module init.
const AB_PROP_NAME_BY_CODE = WA_ABPROPS_BY_CODE as unknown as Readonly<
    Record<number, WaAbPropName | undefined>
>

/**
 * Resolves the client-side prop name for a wire config code.
 *
 * Returns `undefined` for codes this build does not know about - the server
 * advertises props from newer bundles, and WA Web drops those rows too.
 */
export function resolveAbPropNameByCode(configCode: number): WaAbPropName | undefined {
    return AB_PROP_NAME_BY_CODE[configCode]
}
