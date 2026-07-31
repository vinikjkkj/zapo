/**
 * Protocol-derived per-chat state, cached so an outgoing send never depends on
 * a user-configured archive being reachable.
 *
 * Distinct from the `threads` mailbox domain, which is the user-facing chat
 * archive (name, unread, archived, pinned, mute). This domain holds state the
 * runtime derives from the protocol and can always rebuild: history sync, an
 * `EPHEMERAL_SETTING` protocol message, or an incoming `ContextInfo` all
 * repopulate it. Losing it costs freshness, never data.
 *
 * The `threads` record persists the same disappearing-message fields as the
 * durable copy; this domain is the hot path's source and falls back to it on a
 * cold miss - the same relationship `messageSecret` has with the archived
 * message bytes.
 */
export interface WaChatMetadataSnapshot {
    readonly chatJid: string
    /** Disappearing-message lifetime in seconds. `0` when the chat is not ephemeral. */
    readonly ephemeralExpiration?: number
    /**
     * Unix seconds when disappearing mode was enabled. History sync delivers
     * milliseconds and `ContextInfo` seconds; ingest normalizes before writing.
     */
    readonly ephemeralSettingTimestamp?: number
    readonly updatedAtMs: number
}

export interface WaChatMetadataStore {
    destroy?(): Promise<void>
    upsertChatMetadata(snapshot: WaChatMetadataSnapshot): Promise<void>
    getChatMetadata(chatJid: string, nowMs?: number): Promise<WaChatMetadataSnapshot | null>
    deleteChatMetadata(chatJid: string): Promise<number>
    cleanupExpired(nowMs: number): Promise<number>
    clear(): Promise<void>
}
