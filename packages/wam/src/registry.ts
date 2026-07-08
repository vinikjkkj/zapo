import {
    WA_WAM_ENUMS,
    WA_WAM_EVENTS,
    type WaWamEnumName,
    type WaWamEventName,
    type WaWamField
} from '@vinikjkkj/wa-wam'
import { toSafeNumber } from 'zapo-js/util'

import type { WamValueKind } from './wire/encoder.js'
import type { WamResolvedField } from './wire/WamBatch.js'

/** Coerces a payload value to a finite safe integer via {@link toSafeNumber}, or null if it is not one. */
function toSafeInt(raw: unknown): number | null {
    try {
        return toSafeNumber(raw as number, 'wam field')
    } catch {
        return null
    }
}

/** Maps a registry field/global `type` to its wire encoding kind. */
export function wamValueKind(type: WaWamField['type']): WamValueKind | null {
    switch (type) {
        case 'boolean':
            return 'bool'
        case 'integer':
        case 'timer':
        case 'enum':
            return 'int'
        case 'number':
            return 'float'
        case 'string':
            return 'string'
        default:
            return null
    }
}

/** Resolves an enum value key (e.g. `'CHAT_OPEN'`) to its numeric wire value, or `null` if unknown. */
export function resolveWamEnumValue(enumName: WaWamEnumName, key: string): number | null {
    const table = WA_WAM_ENUMS[enumName]
    if (table === undefined) return null
    const value = (table.values as Record<string, number>)[key]
    return typeof value === 'number' ? value : null
}

/**
 * Turns a typed event payload into the ordered wire-ready field list, converting
 * enum keys to numeric ids and dropping absent, untyped, or unresolvable fields.
 */
export function resolveWamEventFields(
    name: WaWamEventName,
    payload: Readonly<Record<string, unknown>>
): WamResolvedField[] {
    const fields = WA_WAM_EVENTS[name].fields as Readonly<Record<string, WaWamField>>
    const resolved: WamResolvedField[] = []
    for (const fieldName of Object.keys(fields)) {
        const raw = payload[fieldName]
        if (raw === undefined || raw === null) continue
        const meta = fields[fieldName]
        const kind = wamValueKind(meta.type)
        if (kind === null) continue
        if (meta.type === 'enum') {
            const numeric = resolveWamEnumValue(meta.enum, String(raw))
            if (numeric === null) continue
            resolved[resolved.length] = { id: meta.id, kind, value: numeric }
        } else if (kind === 'bool') {
            resolved[resolved.length] = { id: meta.id, kind, value: Boolean(raw) }
        } else if (kind === 'string') {
            resolved[resolved.length] = { id: meta.id, kind, value: String(raw) }
        } else if (kind === 'int') {
            const numeric = toSafeInt(raw)
            if (numeric === null) continue
            resolved[resolved.length] = { id: meta.id, kind, value: numeric }
        } else {
            const numeric = Number(raw)
            if (!Number.isFinite(numeric)) continue
            resolved[resolved.length] = { id: meta.id, kind, value: numeric }
        }
    }
    return resolved
}
