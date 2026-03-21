import type { WaAppStateMutation } from '@appstate/types'
import type { WaChatEvent, WaChatEventAction } from '@client/types'

interface ParsedMutationIndex {
    readonly action: string
    readonly parts: readonly string[]
    readonly chatJid?: string
}

export function parseChatEventFromAppStateMutation(
    mutation: WaAppStateMutation
): WaChatEvent | null {
    const value = mutation.value
    const parsedIndex = parseMutationIndex(mutation.index)
    if (!parsedIndex?.chatJid) {
        return null
    }
    const syncActionValueKey = value ? findPresentSyncActionValueKey(value) : null
    const baseEvent = {
        source: mutation.source,
        collection: mutation.collection,
        operation: mutation.operation,
        mutationIndex: mutation.index,
        indexAction: parsedIndex?.action,
        indexParts: parsedIndex?.parts,
        syncActionValueKey: syncActionValueKey ?? undefined,
        chatJid: parsedIndex?.chatJid,
        timestamp: mutation.timestamp,
        version: mutation.version
    } as const

    if (value?.archiveChatAction) {
        return {
            ...baseEvent,
            action: 'archive',
            ...pickOptionalPrimitive('archived', value.archiveChatAction.archived, 'boolean')
        }
    }

    if (value?.muteAction) {
        return {
            ...baseEvent,
            action: 'mute',
            ...pickOptionalPrimitive('muted', value.muteAction.muted, 'boolean'),
            ...pickOptionalPrimitive(
                'muteEndTimestampMs',
                parseOptionalLong(value.muteAction.muteEndTimestamp),
                'number'
            )
        }
    }

    if (value?.pinAction) {
        return {
            ...baseEvent,
            action: 'pin',
            ...pickOptionalPrimitive('pinned', value.pinAction.pinned, 'boolean')
        }
    }

    if (value?.markChatAsReadAction) {
        return {
            ...baseEvent,
            action: 'mark_read',
            ...pickOptionalPrimitive('read', value.markChatAsReadAction.read, 'boolean')
        }
    }

    if (value?.clearChatAction) {
        return {
            ...baseEvent,
            action: 'clear',
            ...pickOptionalPrimitive(
                'deleteStarred',
                parseIndexFlag(parsedIndex?.parts[2]),
                'boolean'
            ),
            ...pickOptionalPrimitive(
                'deleteMedia',
                parseIndexFlag(parsedIndex?.parts[3]),
                'boolean'
            )
        }
    }

    if (value?.deleteChatAction) {
        return {
            ...baseEvent,
            action: 'delete',
            ...pickOptionalPrimitive(
                'deleteMedia',
                parseIndexFlag(parsedIndex?.parts[2]),
                'boolean'
            )
        }
    }

    if (value?.lockChatAction) {
        return {
            ...baseEvent,
            action: 'lock',
            ...pickOptionalPrimitive('locked', value.lockChatAction.locked, 'boolean')
        }
    }

    if (value?.chatAssignment) {
        return {
            ...baseEvent,
            action: 'chat_assignment',
            ...pickOptionalPrimitive('deviceAgentId', value.chatAssignment.deviceAgentID, 'string')
        }
    }

    const fallbackAction =
        normalizeIndexAction(parsedIndex?.action) ?? normalizeValueActionKey(syncActionValueKey)
    if (!fallbackAction) {
        return null
    }
    return {
        ...baseEvent,
        action: fallbackAction
    }
}

function parseMutationIndex(index: string): ParsedMutationIndex | null {
    let parsed: unknown
    try {
        parsed = JSON.parse(index)
    } catch {
        return null
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
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

    return {
        action: parts[0],
        parts,
        chatJid: extractChatJid(parts)
    }
}

function normalizeIndexAction(indexAction: string | undefined): WaChatEventAction | null {
    if (!indexAction) {
        return null
    }
    switch (indexAction) {
        case 'archive':
            return 'archive'
        case 'mute':
            return 'mute'
        case 'pin':
        case 'pin_v1':
            return 'pin'
        case 'markChatAsRead':
            return 'mark_read'
        case 'clearChat':
            return 'clear'
        case 'deleteChat':
            return 'delete'
        case 'lock':
            return 'lock'
        case 'agentChatAssignment':
            return 'chat_assignment'
        default:
            return toSnakeCase(indexAction)
    }
}

function normalizeValueActionKey(syncActionValueKey: string | null): WaChatEventAction | null {
    if (!syncActionValueKey) {
        return null
    }
    switch (syncActionValueKey) {
        case 'archiveChatAction':
            return 'archive'
        case 'muteAction':
            return 'mute'
        case 'pinAction':
            return 'pin'
        case 'markChatAsReadAction':
            return 'mark_read'
        case 'clearChatAction':
            return 'clear'
        case 'deleteChatAction':
            return 'delete'
        case 'lockChatAction':
            return 'lock'
        case 'chatAssignment':
            return 'chat_assignment'
        default:
            return toSnakeCase(
                syncActionValueKey.endsWith('Action')
                    ? syncActionValueKey.slice(0, -'Action'.length)
                    : syncActionValueKey
            )
    }
}

function parseOptionalLong(
    value: number | { toNumber(): number } | null | undefined
): number | undefined {
    if (value === null || value === undefined) {
        return undefined
    }
    try {
        const parsed = typeof value === 'number' ? value : value.toNumber()
        if (!Number.isFinite(parsed) || !Number.isSafeInteger(parsed)) {
            return undefined
        }
        return parsed
    } catch {
        return undefined
    }
}

function parseIndexFlag(value: string | undefined): boolean | undefined {
    if (value === '1') {
        return true
    }
    if (value === '0') {
        return false
    }
    return undefined
}

function extractChatJid(parts: readonly string[]): string | undefined {
    for (let index = 1; index < parts.length; index += 1) {
        const value = parts[index]
        if (value.includes('@')) {
            return value
        }
    }
    return undefined
}

function findPresentSyncActionValueKey(
    value: NonNullable<WaAppStateMutation['value']>
): string | null {
    const valueRecord = value as Record<string, unknown>
    for (const key in valueRecord) {
        if (key === 'timestamp') {
            continue
        }
        const keyValue = valueRecord[key]
        if (keyValue === null || keyValue === undefined) {
            continue
        }
        return key
    }
    return null
}

function toSnakeCase(value: string): string {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/-/g, '_')
        .toLowerCase()
}

function pickOptionalPrimitive(
    key: string,
    value: unknown,
    type: 'boolean' | 'number' | 'string'
): Record<string, unknown> {
    return typeof value === type ? { [key]: value } : {}
}
