import type { WaAppStateMutation } from '@appstate/types'
import {
    decodeEnumValue,
    decodeIndexArgsFromSchema,
    getAppstateSchemaByActionName,
    type WaAppstateSchema
} from '@appstate-spec'
import type { WaAppStateMutationEvent } from '@client/types'
import type { Proto } from '@proto'

export function parseAppStateMutationEvent(
    mutation: WaAppStateMutation
): WaAppStateMutationEvent | null {
    const parts = parseIndexParts(mutation.index)
    if (!parts || parts.length === 0) {
        return null
    }
    const resolved = getAppstateSchemaByActionName(parts[0])
    if (!resolved) {
        return null
    }
    const indexArgs = decodeIndexArgsFromSchema(resolved.schema, parts)
    if (!indexArgs) {
        return null
    }
    const valueRaw: Proto.ISyncActionValue | null = mutation.value ?? null

    const base = {
        source: mutation.source,
        collection: mutation.collection,
        version: mutation.version,
        timestamp: mutation.timestamp,
        _raw: { index: mutation.index, indexParts: parts, value: valueRaw }
    } as const

    if (mutation.operation === 'remove') {
        return {
            schema: resolved.key,
            operation: 'remove',
            ...indexArgs,
            ...base
        } as WaAppStateMutationEvent
    }

    const data = unwrapData(resolved.schema, valueRaw)
    return {
        schema: resolved.key,
        operation: 'set',
        ...indexArgs,
        ...(data ?? {}),
        ...base
    } as WaAppStateMutationEvent
}

function unwrapData(
    schema: WaAppstateSchema,
    value: Proto.ISyncActionValue | null
): Record<string, unknown> | null {
    if (!value) {
        return null
    }
    const field = schema.valueField
    let inner: Record<string, unknown> | null
    if (field === null || field === 'map') {
        const rest: Record<string, unknown> = {}
        for (const key of Object.keys(value)) {
            if (key === 'timestamp') continue
            rest[key] = (value as Record<string, unknown>)[key]
        }
        inner = rest
    } else {
        const sub = (value as Record<string, unknown>)[field]
        if (sub === null || sub === undefined || typeof sub !== 'object') {
            return null
        }
        inner = { ...(sub as Record<string, unknown>) }
    }
    applyEnumDecodeToData(schema.valueEnumFields, inner)
    return inner
}

function applyEnumDecodeToData(
    enumFields: WaAppstateSchema['valueEnumFields'],
    data: Record<string, unknown>
): void {
    if (!enumFields) return
    for (const [fieldPath, enumPath] of Object.entries(enumFields)) {
        applyDecodeAtPath(data, fieldPath.split('.'), (raw) => {
            if (typeof raw !== 'number') return raw
            const name = decodeEnumValue(enumPath, raw)
            return name ?? raw
        })
    }
}

function applyDecodeAtPath(
    obj: Record<string, unknown>,
    segments: readonly string[],
    transform: (value: unknown) => unknown
): void {
    if (segments.length === 0) return
    const [head, ...rest] = segments
    if (rest.length === 0) {
        if (head in obj) {
            const value = obj[head]
            if (Array.isArray(value)) {
                obj[head] = value.map(transform)
            } else if (value !== null && value !== undefined) {
                obj[head] = transform(value)
            }
        }
        return
    }
    const next = obj[head]
    if (Array.isArray(next)) {
        for (const item of next) {
            if (item && typeof item === 'object') {
                applyDecodeAtPath(item as Record<string, unknown>, rest, transform)
            }
        }
        return
    }
    if (next && typeof next === 'object') {
        applyDecodeAtPath(next as Record<string, unknown>, rest, transform)
    }
}

function parseIndexParts(index: string): readonly string[] | null {
    let parsed: unknown
    try {
        parsed = JSON.parse(index)
    } catch {
        return null
    }
    if (!Array.isArray(parsed)) {
        return null
    }
    const parts: string[] = []
    for (const item of parsed) {
        if (typeof item === 'string') {
            parts.push(item)
            continue
        }
        if (typeof item === 'number' || typeof item === 'boolean') {
            parts.push(String(item))
            continue
        }
        return null
    }
    return parts
}
