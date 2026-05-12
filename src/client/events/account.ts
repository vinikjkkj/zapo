import type { WaAppStateMutation } from '@appstate/types'
import type {
    WaAccountEvent,
    WaBroadcastListMembershipEntry,
    WaStatusPrivacyEntry
} from '@client/types'

interface ParsedAccountIndex {
    readonly action: string
    readonly parts: readonly string[]
}

export function parseAccountEventFromAppStateMutation(
    mutation: WaAppStateMutation
): WaAccountEvent | null {
    const parsedIndex = parseAccountIndex(mutation.index)
    if (!parsedIndex) {
        return null
    }

    const value = mutation.value
    const base = {
        source: mutation.source,
        collection: mutation.collection,
        operation: mutation.operation,
        mutationIndex: mutation.index,
        indexAction: parsedIndex.action,
        indexParts: parsedIndex.parts,
        timestamp: mutation.timestamp,
        version: mutation.version
    } as const

    if (parsedIndex.action === 'status_privacy' && value?.statusPrivacy) {
        const settings = value.statusPrivacy
        const userJid = Array.isArray(settings.userJid) ? [...settings.userJid] : []
        const entry: WaStatusPrivacyEntry = {
            mode: typeof settings.mode === 'number' ? settings.mode : null,
            userJids: userJid,
            ...(settings.shareToFB !== null && settings.shareToFB !== undefined
                ? { shareToFB: settings.shareToFB }
                : {}),
            ...(settings.shareToIG !== null && settings.shareToIG !== undefined
                ? { shareToIG: settings.shareToIG }
                : {})
        }
        return { ...base, action: 'status_privacy', settings: entry }
    }

    if (parsedIndex.action === 'userStatusMute' && value?.userStatusMuteAction) {
        const targetJid = parsedIndex.parts[1]
        if (!targetJid) {
            return null
        }
        return {
            ...base,
            action: 'user_status_mute',
            targetJid,
            muted: value.userStatusMuteAction.muted ?? null
        }
    }

    if (parsedIndex.action === 'business_broadcast_list') {
        const listId = parsedIndex.parts[1]
        if (!listId) {
            return null
        }
        if (mutation.operation === 'remove') {
            return { ...base, action: 'business_broadcast_list_remove', listId }
        }
        const action = value?.businessBroadcastListAction
        if (!action) {
            return null
        }
        const participants: WaBroadcastListMembershipEntry[] = (action.participants ?? [])
            .filter(
                (entry): entry is { readonly lidJid: string; readonly pnJid?: string } =>
                    typeof entry.lidJid === 'string' && entry.lidJid.length > 0
            )
            .map((entry) => ({
                lidJid: entry.lidJid,
                ...(entry.pnJid ? { pnJid: entry.pnJid } : {})
            }))
        return {
            ...base,
            action: 'business_broadcast_list_set',
            listId,
            listName: action.listName ?? '',
            participants,
            labelIds: Array.isArray(action.labelIds) ? [...action.labelIds] : []
        }
    }

    return null
}

function parseAccountIndex(index: string): ParsedAccountIndex | null {
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
    return { action: parts[0], parts }
}
