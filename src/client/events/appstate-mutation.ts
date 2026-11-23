import type { WaAppStateMutation } from '@appstate/types'
import {
    decodeEnumValue,
    decodeIndexArgsFromSchema,
    getAppstateSchemaByActionName,
    resolveEnumObject,
    WA_APPSTATE_LEGACY_INDEX_ARGS,
    type WaAppstateSchema,
    type WaAppstateValueEnumFields
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
    const legacy = WA_APPSTATE_LEGACY_INDEX_ARGS[resolved.key]
    if (legacy) {
        for (const legacyName of Object.keys(legacy)) {
            indexArgs[legacyName] = indexArgs[legacy[legacyName]]
        }
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
    if (field === null) {
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

interface EnumDecodePath {
    readonly segments: readonly string[]
    readonly enumPath: string
}

/** Per-schema enum paths that resolve, split once; schemas are static. */
const ENUM_DECODE_PATHS = new WeakMap<WaAppstateValueEnumFields, readonly EnumDecodePath[]>()

function getEnumDecodePaths(enumFields: WaAppstateValueEnumFields): readonly EnumDecodePath[] {
    let paths = ENUM_DECODE_PATHS.get(enumFields)
    if (!paths) {
        const built: EnumDecodePath[] = []
        for (const fieldPath of Object.keys(enumFields)) {
            const enumPath = enumFields[fieldPath]
            if (resolveEnumObject(enumPath)) {
                built.push({ segments: fieldPath.split('.'), enumPath })
            }
        }
        paths = built
        ENUM_DECODE_PATHS.set(enumFields, paths)
    }
    return paths
}

/** Writes enum names into `data`, which the caller owns; nested containers stay shared with `_raw.value`. */
function applyEnumDecodeToData(
    enumFields: WaAppstateSchema['valueEnumFields'],
    data: Record<string, unknown>
): void {
    if (!enumFields) return
    for (const { segments, enumPath } of getEnumDecodePaths(enumFields)) {
        decodeAtPath(data, segments, 0, data, enumPath)
    }
}

function decodeEnumName(raw: unknown, enumPath: string): unknown {
    return typeof raw === 'number' ? (decodeEnumValue(enumPath, raw) ?? raw) : raw
}

/**
 * Decodes the enum at `segments[depth]` below `container`, copying a container
 * only when a value under it changes. Returns `container` when nothing changed.
 */
function decodeAtPath(
    container: Record<string, unknown>,
    segments: readonly string[],
    depth: number,
    root: Record<string, unknown>,
    enumPath: string
): Record<string, unknown> {
    const head = segments[depth]
    const value = container[head]
    if (value === null || value === undefined) return container
    let next: unknown
    if (depth === segments.length - 1) {
        next = Array.isArray(value)
            ? mapIfChanged(value, (item) => decodeEnumName(item, enumPath))
            : decodeEnumName(value, enumPath)
    } else if (Array.isArray(value)) {
        next = mapIfChanged(value, (item) =>
            item && typeof item === 'object'
                ? decodeAtPath(item as Record<string, unknown>, segments, depth + 1, root, enumPath)
                : item
        )
    } else if (typeof value === 'object') {
        next = decodeAtPath(value as Record<string, unknown>, segments, depth + 1, root, enumPath)
    } else {
        return container
    }
    if (next === value) return container
    const target = container === root ? container : cloneMessage(container)
    target[head] = next
    return target
}

function mapIfChanged(
    items: readonly unknown[],
    map: (item: unknown) => unknown
): readonly unknown[] {
    let out: unknown[] | null = null
    for (let i = 0; i < items.length; i += 1) {
        const mapped = map(items[i])
        if (mapped !== items[i]) {
            out ??= items.slice()
            out[i] = mapped
        }
    }
    return out ?? items
}

/** Shallow copy that keeps the generated message prototype (field defaults) and every own property. */
function cloneMessage(value: Record<string, unknown>): Record<string, unknown> {
    return Object.create(
        Object.getPrototypeOf(value) as object | null,
        Object.getOwnPropertyDescriptors(value)
    ) as Record<string, unknown>
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
