import { proto, type Proto } from '@proto'

import {
    WA_APPSTATE_SCHEMAS as RAW_WA_APPSTATE_SCHEMAS,
    type WaAppstateActionKey,
    type WaAppstateIndexPart,
    type WaAppstateSchema,
    type WaAppstateValueEnumFields
} from '../spec/appstate'

export { WA_APPSTATE_COLLECTIONS, WA_APPSTATE_SCHEMAS } from '../spec/appstate'
export type {
    WaAppstateActionKey,
    WaAppstateCollection,
    WaAppstateIndexArgs,
    WaAppstateIndexPart,
    WaAppstateIndexValueOf,
    WaAppstateSchema,
    WaAppstateScope,
    WaAppstateValueEnumFields
} from '../spec/appstate'

export type GetByPath<T, P extends string> = P extends `${infer Head}.${infer Tail}`
    ? Head extends keyof T
        ? GetByPath<T[Head], Tail>
        : never
    : P extends keyof T
      ? T[P]
      : never

export type EnumNamesAt<P extends string> = keyof GetByPath<typeof proto.SyncActionValue, P> &
    string

type EnumValueFor<P extends string, Original> = Original extends
    | ReadonlyArray<unknown>
    | null
    | undefined
    ? ReadonlyArray<EnumNamesAt<P>> | null | undefined
    : EnumNamesAt<P> | null | undefined

type WithEnumStrings<
    Data,
    Fields extends WaAppstateValueEnumFields | null
> = Fields extends WaAppstateValueEnumFields
    ? {
          [K in keyof Data]: K extends keyof Fields
              ? Fields[K] extends string
                  ? EnumValueFor<Fields[K], Data[K]>
                  : Data[K]
              : Data[K]
      }
    : Data

export type ValueForSchema<S extends WaAppstateSchema> =
    S['valueField'] extends keyof Proto.ISyncActionValue
        ? Pick<Proto.ISyncActionValue, S['valueField'] & keyof Proto.ISyncActionValue>
        : Proto.ISyncActionValue

export type ValueForKey<K extends WaAppstateActionKey> = ValueForSchema<
    (typeof RAW_WA_APPSTATE_SCHEMAS)[K]
>

type BaseDataForSchema<S extends WaAppstateSchema> =
    S['valueField'] extends keyof Proto.ISyncActionValue
        ? NonNullable<Proto.ISyncActionValue[S['valueField'] & keyof Proto.ISyncActionValue]>
        : Proto.ISyncActionValue

export type DataForSchema<S extends WaAppstateSchema> = WithEnumStrings<
    BaseDataForSchema<S>,
    S['valueEnumFields']
>

export type DataForKey<K extends WaAppstateActionKey> = DataForSchema<
    (typeof RAW_WA_APPSTATE_SCHEMAS)[K]
>

const SCHEMA_BY_ACTION_NAME_BUILDER: Record<string, WaAppstateActionKey> = {}
for (const key of Object.keys(RAW_WA_APPSTATE_SCHEMAS) as WaAppstateActionKey[]) {
    SCHEMA_BY_ACTION_NAME_BUILDER[RAW_WA_APPSTATE_SCHEMAS[key].name] = key
}

export const WA_APPSTATE_SCHEMA_BY_ACTION_NAME: Readonly<Record<string, WaAppstateActionKey>> =
    Object.freeze(SCHEMA_BY_ACTION_NAME_BUILDER)

export function getAppstateSchemaByActionName(
    actionName: string
): { readonly key: WaAppstateActionKey; readonly schema: WaAppstateSchema } | null {
    const key = WA_APPSTATE_SCHEMA_BY_ACTION_NAME[actionName]
    if (!key) {
        return null
    }
    return { key, schema: RAW_WA_APPSTATE_SCHEMAS[key] }
}

export function resolveEnumObject(protoEnumPath: string): Record<string, number | string> | null {
    const segments = protoEnumPath.split('.')
    let cursor: unknown = proto.SyncActionValue
    for (const seg of segments) {
        if (cursor === null || cursor === undefined) return null
        if (typeof cursor !== 'object' && typeof cursor !== 'function') return null
        cursor = (cursor as Record<string, unknown>)[seg]
    }
    if (cursor === null || cursor === undefined) return null
    if (typeof cursor !== 'object' && typeof cursor !== 'function') return null
    return cursor as Record<string, number | string>
}

export function encodeEnumValue(protoEnumPath: string, name: string): number | null {
    const enumObj = resolveEnumObject(protoEnumPath)
    if (!enumObj) return null
    const value = enumObj[name]
    return typeof value === 'number' ? value : null
}

export function decodeEnumValue(protoEnumPath: string, value: number): string | null {
    const enumObj = resolveEnumObject(protoEnumPath)
    if (!enumObj) return null
    for (const key of Object.keys(enumObj)) {
        if (enumObj[key] === value) return key
    }
    return null
}

export function decodeIndexArgsFromSchema(
    schema: WaAppstateSchema,
    parts: readonly string[]
): Readonly<Record<string, string | boolean | null>> | null {
    if (parts.length !== schema.indexParts.length) {
        return null
    }
    const args: Record<string, string | boolean | null> = {}
    for (let i = 0; i < schema.indexParts.length; i += 1) {
        const part: WaAppstateIndexPart = schema.indexParts[i]
        const raw = parts[i]
        if (part.type === 'literal') {
            continue
        }
        if (part.type === 'boolString') {
            if (raw !== '0' && raw !== '1') return null
            args[part.name] = raw === '1'
            continue
        }
        if (part.type === 'jidOrZero') {
            args[part.name] = raw === '0' ? null : raw
            continue
        }
        if (part.type === 'enum') {
            const numeric = Number(raw)
            const name = Number.isFinite(numeric) ? decodeEnumValue(part.protoEnum, numeric) : null
            args[part.name] = name ?? raw
            continue
        }
        args[part.name] = raw
    }
    return args
}
