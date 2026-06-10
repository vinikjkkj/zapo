import type { WaAppStateSyncClient } from '@appstate/sync/WaAppStateSyncClient'
import type {
    AppStateCollectionName,
    WaAppStateMutation,
    WaAppStateMutationInput,
    WaAppStateSyncOptions,
    WaAppStateSyncResult
} from '@appstate/types'
import { downloadExternalBlobReference } from '@appstate/utils'
import {
    type DataForKey,
    encodeEnumValue,
    type EnumNamesAt,
    type ValueForSchema,
    WA_APPSTATE_SCHEMAS,
    type WaAppstateActionKey,
    type WaAppstateIndexArgs,
    type WaAppstateSchema
} from '@appstate-spec'
import { parseAppStateMutationEvent } from '@client/events/appstate-mutation'
import type {
    WaAppStateMessageKey,
    WaAppStateMutationEvent,
    WaClearChatOptions,
    WaDeleteChatOptions,
    WaDeleteMessageForMeOptions
} from '@client/types'
import type { Logger } from '@infra/log/types'
import type { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import { proto, type Proto } from '@proto'
import { WA_APP_STATE_COLLECTION_STATES } from '@protocol/constants'
import {
    isGroupJid,
    isGroupOrBroadcastJid,
    isLidJid,
    isUserJid,
    normalizeDeviceJid,
    normalizeRecipientJid,
    toUserJid
} from '@protocol/jid'
import type { WaStoredContactRecord } from '@store/contracts/contact.store'
import type { WaMessageStore, WaStoredMessageRecord } from '@store/contracts/message.store'
import type { ServerClock } from '@util/clock'
import { resolvePositive } from '@util/coercion'
import { toError } from '@util/primitives'

type StatusDistributionMode = Proto.SyncActionValue.StatusPrivacyAction.StatusDistributionMode
type StatusDistributionModeKey =
    keyof typeof proto.SyncActionValue.StatusPrivacyAction.StatusDistributionMode

const WA_APP_STATE_MUTATION_FLUSH_SUCCESS_STATES = new Set<string>([
    WA_APP_STATE_COLLECTION_STATES.SUCCESS,
    WA_APP_STATE_COLLECTION_STATES.SUCCESS_HAS_MORE
])

const WA_APP_STATE_ARCHIVE_RANGE_DEFAULT_LIMIT = 256

type IndexArgsForSchema<S extends WaAppstateSchema> = {
    readonly [Part in S['indexParts'][number] as Part extends { type: 'literal' }
        ? never
        : Part extends { name: infer N extends string }
          ? N
          : never]: Part extends { type: 'boolString' }
        ? boolean
        : Part extends { type: 'jidOrZero' }
          ? string | null
          : Part extends { type: 'enum'; protoEnum: infer P extends string }
            ? EnumNamesAt<P>
            : string
}

function buildMutationIndexFromSchema<S extends WaAppstateSchema>(
    schema: S,
    indexArgs: IndexArgsForSchema<S>
): string {
    const parts = new Array<string>(schema.indexParts.length)
    const args = indexArgs as Readonly<Record<string, string | boolean | null>>
    for (let i = 0; i < schema.indexParts.length; i += 1) {
        const part = schema.indexParts[i]
        if (part.type === 'literal') {
            parts[i] = part.value
            continue
        }
        const arg = args[part.name]
        if (part.type === 'boolString') {
            parts[i] = arg ? '1' : '0'
            continue
        }
        if (part.type === 'jidOrZero') {
            if (arg === null || arg === undefined) {
                const fromMeSlot = schema.indexParts.find(
                    (p) => p.type === 'boolString' && p.name === 'fromMe'
                )
                if (fromMeSlot && args['fromMe'] !== true) {
                    throw new Error(
                        `app-state index arg "${part.name}" for schema "${schema.name}" requires a JID when fromMe is not true`
                    )
                }
                parts[i] = '0'
                continue
            }
            parts[i] = arg as string
            continue
        }
        if (part.type === 'enum') {
            if (typeof arg === 'number') {
                parts[i] = String(arg)
                continue
            }
            if (typeof arg !== 'string') {
                throw new Error(
                    `app-state enum index arg "${part.name}" for schema "${schema.name}" must be a string`
                )
            }
            const numeric = encodeEnumValue(part.protoEnum, arg)
            if (numeric === null) {
                throw new Error(
                    `app-state enum index arg "${part.name}"="${arg}" is not in enum ${part.protoEnum}`
                )
            }
            parts[i] = String(numeric)
            continue
        }
        if (typeof arg !== 'string') {
            throw new Error(
                `app-state index arg "${part.name}" for schema "${schema.name}" must be a string`
            )
        }
        parts[i] = arg
    }
    return JSON.stringify(parts)
}

function buildSetMutationFromSchema<S extends WaAppstateSchema>(input: {
    readonly schema: S
    readonly indexArgs: IndexArgsForSchema<S>
    readonly value: ValueForSchema<S>
    readonly timestamp: number
}): WaAppStateMutationInput {
    return {
        collection: input.schema.collection,
        operation: 'set',
        index: buildMutationIndexFromSchema(input.schema, input.indexArgs),
        value: { ...input.value, timestamp: input.timestamp },
        version: input.schema.version,
        timestamp: input.timestamp
    }
}

type SetMutationInputFor<K extends WaAppstateActionKey> = K extends K
    ? { readonly schema: K } & WaAppstateIndexArgs<K> & Partial<DataForKey<K>>
    : never

type RemoveMutationInputFor<K extends WaAppstateActionKey> = K extends K
    ? { readonly schema: K } & WaAppstateIndexArgs<K>
    : never

export interface WaSetMutationInputMap {
    readonly _: SetMutationInputFor<WaAppstateActionKey>
}
export interface WaRemoveMutationInputMap {
    readonly _: RemoveMutationInputFor<WaAppstateActionKey>
}
export type WaSetMutationInput = WaSetMutationInputMap['_']
export type WaRemoveMutationInput = WaRemoveMutationInputMap['_']

function splitFlatInput(
    schema: WaAppstateSchema,
    input: Readonly<Record<string, unknown>>
): {
    readonly indexArgs: Readonly<Record<string, unknown>>
    readonly data: Readonly<Record<string, unknown>>
} {
    const indexNames = new Set<string>()
    for (const part of schema.indexParts) {
        if (part.type !== 'literal') {
            indexNames.add(part.name)
        }
    }
    const indexArgs: Record<string, unknown> = {}
    const data: Record<string, unknown> = {}
    for (const key of Object.keys(input)) {
        if (key === 'schema') continue
        if (indexNames.has(key)) {
            indexArgs[key] = input[key]
        } else {
            data[key] = input[key]
        }
    }
    return { indexArgs, data }
}

function wrapData(
    schema: WaAppstateSchema,
    data: Readonly<Record<string, unknown>>
): Proto.ISyncActionValue {
    const encoded = applyEnumEncodeToData(schema.valueEnumFields, data)
    const field = schema.valueField
    if (field === null) {
        return encoded
    }
    return { [field]: encoded }
}

function applyEnumEncodeToData(
    enumFields: WaAppstateSchema['valueEnumFields'],
    data: Readonly<Record<string, unknown>>
): Record<string, unknown> {
    if (!enumFields) return { ...data }
    const out: Record<string, unknown> = { ...data }
    for (const [fieldPath, enumPath] of Object.entries(enumFields)) {
        applyEnumAtPath(out, fieldPath.split('.'), (raw) => {
            if (typeof raw === 'number') return raw
            if (typeof raw !== 'string') return raw
            const numeric = encodeEnumValue(enumPath, raw)
            if (numeric === null) {
                throw new Error(`enum value "${raw}" not in ${enumPath}`)
            }
            return numeric
        })
    }
    return out
}

function applyEnumAtPath(
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
        const cloned = next.map((item) => {
            if (item && typeof item === 'object') {
                const itemCopy = { ...(item as Record<string, unknown>) }
                applyEnumAtPath(itemCopy, rest, transform)
                return itemCopy
            }
            return item
        })
        obj[head] = cloned
        return
    }
    if (next && typeof next === 'object') {
        const nextCopy = { ...(next as Record<string, unknown>) }
        applyEnumAtPath(nextCopy, rest, transform)
        obj[head] = nextCopy
    }
}

function buildRemoveMutationFromSchema<S extends WaAppstateSchema>(input: {
    readonly schema: S
    readonly indexArgs: IndexArgsForSchema<S>
    readonly timestamp: number
}): WaAppStateMutationInput {
    return {
        collection: input.schema.collection,
        operation: 'remove',
        index: buildMutationIndexFromSchema(input.schema, input.indexArgs),
        previousValue: { timestamp: input.timestamp },
        version: input.schema.version,
        timestamp: input.timestamp
    }
}

interface WaAppStateMutationCoordinatorOptions {
    readonly logger: Logger
    readonly messageStore: WaMessageStore
    readonly appStateSync: WaAppStateSyncClient
    readonly mediaTransfer: WaMediaTransferClient
    readonly isConnected: () => boolean
    readonly serverClock: ServerClock
    readonly archiveRangeLimit?: number
    readonly emitMutation?: (event: WaAppStateMutationEvent) => void
    readonly emitSnapshotMutations?: boolean
    readonly nctSaltSink?: (salt: Uint8Array | null) => Promise<void>
    /**
     * Persistence sink for `Contact` collection mutations (the locally-saved
     * address-book name the primary device synced over app-state). Invoked on
     * every winning mutation including snapshot ones, so the contact store is
     * bootstrapped at pair-time regardless of `emitSnapshotMutations`.
     */
    readonly contactSink?: (record: WaStoredContactRecord) => void
    /**
     * Sink for applied `SettingPushName` mutations (the account's own display
     * name). Invoked on every winning mutation including snapshot ones, so the
     * local display name is bootstrapped at pair-time.
     */
    readonly pushNameSink?: (name: string) => void
}

export interface WaSetStatusPrivacyInput {
    readonly mode: StatusDistributionModeKey | StatusDistributionMode
    readonly userJids?: readonly string[]
    readonly shareToFB?: boolean
    readonly shareToIG?: boolean
}

export interface WaBroadcastListParticipant {
    readonly lidJid: string
    readonly pnJid?: string
}

export interface WaSetBroadcastListInput {
    readonly id: string
    readonly listName: string
    readonly participants: readonly WaBroadcastListParticipant[]
    readonly labelIds?: readonly string[]
}

/**
 * Coordinates app-state mutations (mute/star/read/pin/archive/clear/delete/
 * lock chats, status privacy, broadcast lists) and emits parsed mutation
 * events on sync. Accessed via {@link WaClient.chat}.
 */
export class WaAppStateMutationCoordinator {
    private readonly logger: Logger
    private readonly messageStore: WaMessageStore
    private readonly appStateSync: WaAppStateSyncClient
    private readonly mediaTransfer: WaMediaTransferClient
    private readonly isConnected: () => boolean
    private readonly serverClock: ServerClock
    private readonly archiveRangeLimit: number
    private readonly emitMutation?: (event: WaAppStateMutationEvent) => void
    private readonly emitSnapshotMutations: boolean
    private readonly nctSaltSink?: (salt: Uint8Array | null) => Promise<void>
    private readonly contactSink?: (record: WaStoredContactRecord) => void
    private readonly pushNameSink?: (name: string) => void
    private readonly pendingMutations: Map<string, WaAppStateMutationInput>
    private flushPromise: Promise<void> | null

    public constructor(options: WaAppStateMutationCoordinatorOptions) {
        this.logger = options.logger
        this.messageStore = options.messageStore
        this.appStateSync = options.appStateSync
        this.mediaTransfer = options.mediaTransfer
        this.isConnected = options.isConnected
        this.serverClock = options.serverClock
        this.archiveRangeLimit = resolvePositive(
            options.archiveRangeLimit,
            WA_APP_STATE_ARCHIVE_RANGE_DEFAULT_LIMIT,
            'WaAppStateMutationCoordinatorOptions.archiveRangeLimit'
        )
        this.emitMutation = options.emitMutation
        this.emitSnapshotMutations = options.emitSnapshotMutations === true
        this.nctSaltSink = options.nctSaltSink
        this.contactSink = options.contactSink
        this.pushNameSink = options.pushNameSink
        this.pendingMutations = new Map()
        this.flushPromise = null
    }

    /**
     * Runs an app-state sync round, optionally applying pending mutations.
     * Throws when the client is not connected. Returns the per-collection
     * result; blocked collections are logged.
     */
    public async sync(options: WaAppStateSyncOptions = {}): Promise<WaAppStateSyncResult> {
        if (!this.isConnected()) {
            throw new Error('client is not connected')
        }
        const syncOptions: WaAppStateSyncOptions = options.downloadExternalBlob
            ? options
            : {
                  ...options,
                  downloadExternalBlob: async (_collection, _kind, reference) =>
                      downloadExternalBlobReference(this.mediaTransfer, reference)
              }
        const syncResult = await this.appStateSync.sync(syncOptions)
        const blockedCollections = this.getBlockedCollections(syncResult)
        if (blockedCollections.length > 0) {
            this.logger.warn('app-state sync has blocked collections', {
                blockedCollections: blockedCollections.join(',')
            })
        }
        this.emitEventsFromSyncResult(syncResult)
        return syncResult
    }

    /** Returns the names of collections reported as `BLOCKED` in `syncResult`. */
    public getBlockedCollections(syncResult: WaAppStateSyncResult): readonly string[] {
        const blocked: string[] = []
        for (const entry of syncResult.collections) {
            if (entry.state === WA_APP_STATE_COLLECTION_STATES.BLOCKED) {
                blocked.push(entry.collection)
            }
        }
        return blocked
    }

    /**
     * Walks a sync result and emits one `app_state_mutation` event per
     * distinct (collection, index) – only the last mutation per key wins.
     * Snapshot-source mutations are skipped unless `emitSnapshotMutations`
     * was enabled at construction.
     */
    public emitEventsFromSyncResult(syncResult: WaAppStateSyncResult): void {
        for (const collectionResult of syncResult.collections) {
            const mutations = collectionResult.mutations ?? []

            // Persistence sinks (contact store, own pushName): run on the
            // last-wins mutation per key INCLUDING snapshot sources, so
            // pair-time bootstrap lands even when snapshot events are suppressed.
            if (this.contactSink || this.pushNameSink) {
                const sinkLastIndex = new Map<string, number>()
                for (let i = 0; i < mutations.length; i += 1) {
                    const m = mutations[i]
                    sinkLastIndex.set(`${m.collection}\u0001${m.index}`, i)
                }
                for (let i = 0; i < mutations.length; i += 1) {
                    const m = mutations[i]
                    if (sinkLastIndex.get(`${m.collection}\u0001${m.index}`) !== i) {
                        continue
                    }
                    try {
                        this.handleContactMutation(m)
                    } catch (error) {
                        this.logger.debug('contact sink failed', {
                            collection: m.collection,
                            index: m.index,
                            message: toError(error).message
                        })
                    }
                    try {
                        this.handlePushNameMutation(m)
                    } catch (error) {
                        this.logger.debug('pushName sink failed', {
                            collection: m.collection,
                            index: m.index,
                            message: toError(error).message
                        })
                    }
                }
            }

            const lastMutationIndexByKey = new Map<string, number>()
            for (let mutationIndex = 0; mutationIndex < mutations.length; mutationIndex += 1) {
                const mutation = mutations[mutationIndex]
                if (!this.emitSnapshotMutations && mutation.source === 'snapshot') {
                    continue
                }
                lastMutationIndexByKey.set(
                    `${mutation.collection}\u0001${mutation.index}`,
                    mutationIndex
                )
            }

            for (let mutationIndex = 0; mutationIndex < mutations.length; mutationIndex += 1) {
                const mutation = mutations[mutationIndex]
                if (!this.emitSnapshotMutations && mutation.source === 'snapshot') {
                    continue
                }
                const coalesceKey = `${mutation.collection}\u0001${mutation.index}`
                if (lastMutationIndexByKey.get(coalesceKey) !== mutationIndex) {
                    continue
                }
                try {
                    this.handleNctSaltMutation(mutation)
                    const event = parseAppStateMutationEvent(mutation)
                    if (!event) {
                        continue
                    }
                    this.emitMutation?.(event)
                } catch (error) {
                    this.logger.debug('failed to parse app-state mutation event', {
                        collection: mutation.collection,
                        source: mutation.source,
                        index: mutation.index,
                        message: toError(error).message
                    })
                }
            }
        }
    }

    private handleNctSaltMutation(mutation: {
        readonly operation: 'set' | 'remove'
        readonly value: {
            readonly nctSaltSyncAction?: { readonly salt?: Uint8Array | null } | null
        } | null
    }): void {
        if (!this.nctSaltSink) return
        const nctAction = mutation.value?.nctSaltSyncAction
        if (!nctAction) {
            return
        }
        if (mutation.operation === 'set' && nctAction.salt) {
            this.nctSaltSink(nctAction.salt).catch((err) =>
                this.logger.warn('nct salt sync set failed', {
                    message: toError(err).message
                })
            )
        } else if (mutation.operation === 'remove') {
            this.nctSaltSink(null).catch((err) =>
                this.logger.warn('nct salt sync remove failed', {
                    message: toError(err).message
                })
            )
        }
    }

    private handleContactMutation(mutation: WaAppStateMutation): void {
        if (!this.contactSink) return
        // Cheap reject before JSON.parse: Contact mutations always carry
        // the literal "contact" as their first index segment.
        if (!mutation.index.includes('"contact"')) return
        let parts: unknown
        try {
            parts = JSON.parse(mutation.index)
        } catch {
            return
        }
        if (!Array.isArray(parts) || parts[0] !== 'contact' || typeof parts[1] !== 'string') {
            return
        }
        const indexJid = parts[1]
        const lastUpdatedMs = mutation.timestamp > 0 ? mutation.timestamp : Date.now()
        // Remove operations are a no-op for the contact store: `mergeContact`
        // preserves prior displayName when incoming.displayName is undefined,
        // and the row should stay around (the chat may still be open). The
        // public mutation event still fires below so consumers can react.
        if (mutation.operation === 'remove') return
        const action = mutation.value?.contactAction
        if (!action) return
        // Resolve canonical (LID-preferred) jid + cross-reference: the index
        // typically carries the PN form, and `contactAction.lidJid` carries
        // the LID counterpart. Store one row keyed by LID when both are known
        // (mirrors what the contact store does for history-sync writes), with
        // `phoneNumber` populated so PN-form lookups still resolve.
        const lid = action.lidJid && isLidJid(action.lidJid) ? action.lidJid : undefined
        const indexIsPn = isUserJid(indexJid)
        const indexIsLid = isLidJid(indexJid)
        const jid = lid ?? indexJid
        const phoneNumber = indexIsPn ? indexJid : undefined
        const lidField = lid ?? (indexIsLid ? indexJid : undefined)
        const displayName = action.fullName || action.firstName || undefined
        this.contactSink({
            jid,
            displayName,
            lid: lidField,
            phoneNumber,
            lastUpdatedMs
        })
    }

    private handlePushNameMutation(mutation: WaAppStateMutation): void {
        if (!this.pushNameSink) return
        // A `set` under the literal index ["setting_pushName"]; cheap reject
        // before reading the value.
        if (mutation.operation !== 'set') return
        if (!mutation.index.includes('setting_pushName')) return
        const name = mutation.value?.pushNameSetting?.name
        if (typeof name !== 'string') return
        this.pushNameSink(name)
    }

    /**
     * Mutes or unmutes a chat. `muteEndTimestampMs` is required when
     * `muted` is `true` and must be a non-negative safe-integer epoch.
     *
     * For a "mute forever" entry, pass a very large epoch value (the
     * official client uses year-9999 epochs). The mute end is the absolute
     * timestamp when WhatsApp will re-enable notifications - the client
     * does **not** unmute automatically when the timer expires (you'll see
     * the chat un-muted on the phone, but no `mutation` event re-fires).
     */
    public async setChatMute(
        chatJid: string,
        muted: boolean,
        muteEndTimestampMs?: number
    ): Promise<void> {
        const chatIndexJid = this.normalizeChatMutationJid(chatJid)
        const timestamp = this.serverClock.nowMs()
        const normalizedMuteEnd = muteEndTimestampMs
        if (
            normalizedMuteEnd !== undefined &&
            (!Number.isFinite(normalizedMuteEnd) ||
                !Number.isSafeInteger(normalizedMuteEnd) ||
                normalizedMuteEnd < 0)
        ) {
            throw new Error(`invalid muteEndTimestampMs: ${muteEndTimestampMs}`)
        }
        if (muted && normalizedMuteEnd === undefined) {
            throw new Error('setChatMute requires muteEndTimestampMs when muted is true')
        }

        await this.enqueueAndFlush([
            buildSetMutationFromSchema({
                schema: WA_APPSTATE_SCHEMAS.Mute,
                indexArgs: { chatJid: chatIndexJid },
                value: {
                    muteAction: {
                        muted,
                        ...(normalizedMuteEnd === undefined
                            ? {}
                            : { muteEndTimestamp: normalizedMuteEnd })
                    }
                },
                timestamp
            })
        ])
    }

    /** Stars or un-stars a specific message. */
    public async setMessageStar(message: WaAppStateMessageKey, starred: boolean): Promise<void> {
        const messageIndex = this.buildMessageMutationIndex(message)
        const timestamp = this.serverClock.nowMs()
        await this.enqueueAndFlush([
            buildSetMutationFromSchema({
                schema: WA_APPSTATE_SCHEMAS.Star,
                indexArgs: messageIndex,
                value: { starAction: { starred } },
                timestamp
            })
        ])
    }

    /** Marks the chat as read or unread. */
    public async setChatRead(chatJid: string, read: boolean): Promise<void> {
        const chatIndexJid = this.normalizeChatMutationJid(chatJid)
        const timestamp = this.serverClock.nowMs()
        const messageRange = await this.buildChatMessageRange(chatIndexJid)
        await this.enqueueAndFlush([
            buildSetMutationFromSchema({
                schema: WA_APPSTATE_SCHEMAS.MarkChatAsRead,
                indexArgs: { chatJid: chatIndexJid },
                value: { markChatAsReadAction: { read, messageRange } },
                timestamp
            })
        ])
    }

    /**
     * Pins or unpins the chat. Pinning also clears any active archive flag
     * (the two states are mutually exclusive on the client). WhatsApp
     * imposes a server-side cap on pinned chats - extra pins sync but the
     * official UI will hide / reject them.
     */
    public async setChatPin(chatJid: string, pinned: boolean): Promise<void> {
        const chatIndexJid = this.normalizeChatMutationJid(chatJid)
        const timestamp = this.serverClock.nowMs()
        const pending: WaAppStateMutationInput[] = [
            buildSetMutationFromSchema({
                schema: WA_APPSTATE_SCHEMAS.Pin,
                indexArgs: { chatJid: chatIndexJid },
                value: { pinAction: { pinned } },
                timestamp
            })
        ]

        if (pinned) {
            pending.push(await this.createArchiveMutation(chatIndexJid, false, timestamp))
        }

        await this.enqueueAndFlush(pending)
    }

    /** Archives or unarchives the chat. Archiving also clears any pin. */
    public async setChatArchive(chatJid: string, archived: boolean): Promise<void> {
        const chatIndexJid = this.normalizeChatMutationJid(chatJid)
        const timestamp = this.serverClock.nowMs()
        const pending: WaAppStateMutationInput[] = [
            await this.createArchiveMutation(chatIndexJid, archived, timestamp)
        ]

        if (archived) {
            pending.push(
                buildSetMutationFromSchema({
                    schema: WA_APPSTATE_SCHEMAS.Pin,
                    indexArgs: { chatJid: chatIndexJid },
                    value: { pinAction: { pinned: false } },
                    timestamp
                })
            )
        }

        await this.enqueueAndFlush(pending)
    }

    /**
     * Clears the chat history (without deleting the chat itself - it stays
     * in the chat list, just empty). Defaults to **preserving** starred
     * messages and media; set `options.deleteStarred`/`deleteMedia` to wipe
     * those too. The clear is local-only - other participants keep their
     * copies.
     */
    public async clearChat(chatJid: string, options: WaClearChatOptions = {}): Promise<void> {
        const chatIndexJid = this.normalizeChatMutationJid(chatJid)
        const timestamp = this.serverClock.nowMs()
        const deleteStarred = options.deleteStarred === true
        const deleteMedia = options.deleteMedia === true
        const messageRange = await this.buildChatMessageRange(chatIndexJid)
        await this.enqueueAndFlush([
            buildSetMutationFromSchema({
                schema: WA_APPSTATE_SCHEMAS.ClearChat,
                indexArgs: {
                    chatJid: chatIndexJid,
                    deleteStarred: deleteStarred ? '1' : '0',
                    deleteMedia: deleteMedia ? '1' : '0'
                },
                value: { clearChatAction: { messageRange } },
                timestamp
            })
        ])
    }

    /**
     * Deletes the chat entirely (removes from the chat list + drops every
     * stored message). Local-only - the conversation continues to exist on
     * the peer's device. For groups, this does **not** leave the group;
     * use {@link WaGroupCoordinator.leaveGroup} for that.
     */
    public async deleteChat(chatJid: string, options: WaDeleteChatOptions = {}): Promise<void> {
        const chatIndexJid = this.normalizeChatMutationJid(chatJid)
        const timestamp = this.serverClock.nowMs()
        const deleteMedia = options.deleteMedia === true
        const messageRange = await this.buildChatMessageRange(chatIndexJid)
        await this.enqueueAndFlush([
            buildSetMutationFromSchema({
                schema: WA_APPSTATE_SCHEMAS.DeleteChat,
                indexArgs: {
                    chatJid: chatIndexJid,
                    deleteMedia: deleteMedia ? '1' : '0'
                },
                value: { deleteChatAction: { messageRange } },
                timestamp
            })
        ])
    }

    /**
     * Deletes a single message **locally** - removes it from your own
     * device(s) only. The recipient(s) still see it. Use a `revoke`
     * outgoing message ({@link WaMessageCoordinator.send} with
     * `{ type: 'revoke', ... }`) to delete-for-everyone instead.
     * `messageTimestampMs` must be a non-negative safe-integer epoch when set.
     */
    public async deleteMessageForMe(
        message: WaAppStateMessageKey,
        options: WaDeleteMessageForMeOptions = {}
    ): Promise<void> {
        const messageIndex = this.buildMessageMutationIndex(message)
        const timestamp = this.serverClock.nowMs()
        const deleteMedia = options.deleteMedia === true
        const messageTimestampMs = options.messageTimestampMs
        let messageTimestamp: number | undefined
        if (messageTimestampMs !== undefined) {
            if (
                !Number.isFinite(messageTimestampMs) ||
                !Number.isSafeInteger(messageTimestampMs) ||
                messageTimestampMs < 0
            ) {
                throw new Error(`invalid messageTimestampMs: ${messageTimestampMs}`)
            }
            messageTimestamp = Math.floor(messageTimestampMs / 1_000)
        }
        await this.enqueueAndFlush([
            buildSetMutationFromSchema({
                schema: WA_APPSTATE_SCHEMAS.DeleteMessageForMe,
                indexArgs: messageIndex,
                value: {
                    deleteMessageForMeAction: {
                        deleteMedia,
                        ...(messageTimestamp === undefined ? {} : { messageTimestamp })
                    }
                },
                timestamp
            })
        ])
    }

    /** Locks or unlocks the chat. Locking also clears archive and pin. */
    public async setChatLock(chatJid: string, locked: boolean): Promise<void> {
        const chatIndexJid = this.normalizeChatMutationJid(chatJid)
        const timestamp = this.serverClock.nowMs()
        const pending: WaAppStateMutationInput[] = []
        if (locked) {
            pending.push(await this.createArchiveMutation(chatIndexJid, false, timestamp))
            pending.push(
                buildSetMutationFromSchema({
                    schema: WA_APPSTATE_SCHEMAS.Pin,
                    indexArgs: { chatJid: chatIndexJid },
                    value: { pinAction: { pinned: false } },
                    timestamp
                })
            )
        }

        pending.push(
            buildSetMutationFromSchema({
                schema: WA_APPSTATE_SCHEMAS.LockChat,
                indexArgs: { chatJid: chatIndexJid },
                value: { lockChatAction: { locked } },
                timestamp
            })
        )

        await this.enqueueAndFlush(pending)
    }

    /**
     * Drains any queued mutations through a sync round. Concurrent callers
     * share the in-flight flush promise. Failed collections are re-queued
     * before the error is rethrown.
     */
    public async flushMutations(): Promise<void> {
        if (this.flushPromise) {
            return this.flushPromise
        }

        const inFlight = this.flushPendingMutationsLoop()
        this.flushPromise = inFlight
        try {
            return await inFlight
        } finally {
            if (this.flushPromise === inFlight) {
                this.flushPromise = null
            }
        }
    }

    private async enqueueAndFlush(mutations: readonly WaAppStateMutationInput[]): Promise<void> {
        for (const mutation of mutations) {
            this.enqueueMutation(mutation)
        }
        await this.flushMutations()
    }

    private enqueueMutation(mutation: WaAppStateMutationInput): void {
        const key = `${mutation.collection}\u0001${mutation.index}`
        if (this.pendingMutations.has(key)) {
            this.pendingMutations.delete(key)
        }
        this.pendingMutations.set(key, mutation)
    }

    private takePendingMutationsBatch(): readonly WaAppStateMutationInput[] {
        if (this.pendingMutations.size === 0) {
            return []
        }
        const batch = [...this.pendingMutations.values()]
        this.pendingMutations.clear()
        return batch
    }

    private async flushPendingMutationsLoop(): Promise<void> {
        while (true) {
            const batch = this.takePendingMutationsBatch()
            if (batch.length === 0) {
                return
            }

            this.logger.debug('app-state mutation flush start', {
                pending: batch.length,
                actions: this.describeMutationActions(batch)
            })

            const collections: AppStateCollectionName[] = []
            let syncResult: WaAppStateSyncResult
            try {
                const seenCollections = new Set<AppStateCollectionName>()
                for (const mutation of batch) {
                    if (seenCollections.has(mutation.collection)) {
                        continue
                    }
                    seenCollections.add(mutation.collection)
                    collections.push(mutation.collection)
                }
                syncResult = await this.sync({
                    collections,
                    pendingMutations: batch
                })
            } catch (error) {
                this.requeueMutations(batch)
                this.logger.warn('app-state mutation flush failed', {
                    pending: batch.length,
                    actions: this.describeMutationActions(batch),
                    message: toError(error).message
                })
                throw toError(error)
            }

            const stateByCollection = new Map<string, string>()
            for (const entry of syncResult.collections) {
                stateByCollection.set(entry.collection, entry.state)
            }
            const failedCollections = collections.filter((collection) => {
                const state = stateByCollection.get(collection)
                return !state || !WA_APP_STATE_MUTATION_FLUSH_SUCCESS_STATES.has(state)
            })
            if (failedCollections.length === 0) {
                this.logger.debug('app-state mutation flush completed', {
                    pending: batch.length
                })
                continue
            }

            this.requeueMutations(
                batch.filter((mutation) => failedCollections.includes(mutation.collection))
            )

            const error = new Error(
                `app-state mutation flush incomplete (${failedCollections.join(',')})`
            )
            this.logger.warn('app-state mutation flush incomplete', {
                pending: batch.length,
                actions: this.describeMutationActions(batch),
                failedCollections: failedCollections.join(','),
                message: error.message
            })
            throw error
        }
    }

    private requeueMutations(mutations: readonly WaAppStateMutationInput[]): void {
        if (mutations.length === 0) {
            return
        }
        const existing = [...this.pendingMutations.values()]
        this.pendingMutations.clear()
        for (const mutation of mutations) {
            this.enqueueMutation(mutation)
        }
        for (const mutation of existing) {
            this.enqueueMutation(mutation)
        }
    }

    /**
     * Sets the account-wide status-broadcast distribution policy. `mode`
     * accepts either the proto enum number or its string name; allow/deny
     * lists are provided via `userJids`.
     */
    public async setStatusPrivacy(input: WaSetStatusPrivacyInput): Promise<void> {
        const modeValue =
            typeof input.mode === 'number'
                ? input.mode
                : proto.SyncActionValue.StatusPrivacyAction.StatusDistributionMode[input.mode]
        if (typeof modeValue !== 'number' || !Number.isInteger(modeValue)) {
            throw new Error(`setStatusPrivacy: invalid mode ${String(input.mode)}`)
        }
        const userJid = input.userJids ? [...input.userJids] : []
        const value: Proto.ISyncActionValue = {
            statusPrivacy: {
                mode: modeValue,
                userJid,
                ...(input.shareToFB === undefined ? {} : { shareToFB: input.shareToFB }),
                ...(input.shareToIG === undefined ? {} : { shareToIG: input.shareToIG })
            }
        }
        const timestamp = this.serverClock.nowMs()
        await this.enqueueAndFlush([
            buildSetMutationFromSchema({
                schema: WA_APPSTATE_SCHEMAS.StatusPrivacy,
                indexArgs: {},
                value,
                timestamp
            })
        ])
    }

    /** Mutes/unmutes a single user's status broadcasts. Rejects group/broadcast JIDs. */
    public async setUserStatusMute(jid: string, muted: boolean): Promise<void> {
        const indexJid = this.normalizeChatMutationJid(jid)
        if (isGroupOrBroadcastJid(indexJid)) {
            throw new Error(`setUserStatusMute requires a user jid, got ${jid}`)
        }
        const timestamp = this.serverClock.nowMs()
        await this.enqueueAndFlush([
            buildSetMutationFromSchema({
                schema: WA_APPSTATE_SCHEMAS.UserStatusMute,
                indexArgs: { id: indexJid },
                value: { userStatusMuteAction: { muted } },
                timestamp
            })
        ])
    }

    /** Creates or updates the broadcast list identified by `input.id`. */
    public async setBroadcastList(input: WaSetBroadcastListInput): Promise<void> {
        const participants = input.participants.map((entry) => ({
            lidJid: entry.lidJid,
            ...(entry.pnJid === undefined ? {} : { pnJid: entry.pnJid })
        }))
        const value: Proto.ISyncActionValue = {
            businessBroadcastListAction: {
                participants,
                listName: input.listName,
                labelIds: input.labelIds ? [...input.labelIds] : []
            }
        }
        const timestamp = this.serverClock.nowMs()
        await this.enqueueAndFlush([
            buildSetMutationFromSchema({
                schema: WA_APPSTATE_SCHEMAS.BusinessBroadcastList,
                indexArgs: { id: input.id },
                value,
                timestamp
            })
        ])
    }

    /** Deletes the broadcast list identified by `id`. */
    public async removeBroadcastList(id: string): Promise<void> {
        const timestamp = this.serverClock.nowMs()
        await this.enqueueAndFlush([
            buildRemoveMutationFromSchema({
                schema: WA_APPSTATE_SCHEMAS.BusinessBroadcastList,
                indexArgs: { id },
                timestamp
            })
        ])
    }

    /**
     * Applies a `set` mutation against any registered app-state schema. This
     * is the way to reach schemas that don't have a typed helper on this
     * coordinator (Contact, LabelEdit, LabelJid, QuickReply, AiThreadPin,
     * Favorites, Nux, ...). For the common chat actions there's a dedicated
     * method ({@link setChatMute}, {@link setChatRead}, {@link setMessageStar},
     * {@link setChatPin}, {@link setChatArchive}, etc.) – use those instead.
     *
     * `input` is flat – pick a `schema` name from {@link WA_APPSTATE_SCHEMAS},
     * fill the index fields (`id`, `chatJid`, `labelId`, ...) and the value
     * fields side-by-side, and the coordinator routes them to the right
     * SyncActionValue subfield.
     *
     * @example
     * ```ts
     * // Add a contact to the address book
     * await client.chat.set({
     *     schema: 'Contact',
     *     id: '5511999999999@s.whatsapp.net',
     *     contactAction: { fullName: 'Maria Silva', firstName: 'Maria' }
     * })
     *
     * // Create a chat label (color is a server-side palette index)
     * await client.chat.set({
     *     schema: 'LabelEdit',
     *     id: 'label-1',
     *     labelEditAction: { name: 'Pendente', color: 0, isActive: true }
     * })
     *
     * // Apply that label to a chat
     * await client.chat.set({
     *     schema: 'LabelJid',
     *     labelId: 'label-1',
     *     chatJid: '5511999999999@s.whatsapp.net',
     *     labelAssociationAction: { labeled: true }
     * })
     *
     * // Save a business quick reply
     * await client.chat.set({
     *     schema: 'QuickReply',
     *     id: 'qr-greeting',
     *     quickReplyAction: { shortcut: '/oi', message: 'Olá! Tudo bem?' }
     * })
     * ```
     */
    public async set(input: WaSetMutationInput): Promise<void> {
        const resolved = WA_APPSTATE_SCHEMAS[input.schema] as WaAppstateSchema
        const { indexArgs, data } = splitFlatInput(resolved, input)
        const value = wrapData(resolved, data)
        const timestamp = this.serverClock.nowMs()
        const mutation = buildSetMutationFromSchema({
            schema: resolved,
            indexArgs: indexArgs as unknown as IndexArgsForSchema<typeof resolved>,
            value,
            timestamp
        })
        await this.enqueueAndFlush([mutation])
    }

    /**
     * Applies a `remove` mutation against any registered app-state schema  -
     * same shape as {@link set} but without the value fields (only the schema
     * name + index args). Use this for schemas without a typed helper.
     *
     * @example
     * ```ts
     * // Drop a contact from the address book
     * await client.chat.remove({
     *     schema: 'Contact',
     *     id: '5511999999999@s.whatsapp.net'
     * })
     *
     * // Remove a label from a chat (the label itself stays – use LabelEdit
     * // with `deleted: true` to delete the label definition entirely)
     * await client.chat.remove({
     *     schema: 'LabelJid',
     *     labelId: 'label-1',
     *     chatJid: '5511999999999@s.whatsapp.net'
     * })
     *
     * // Delete a quick reply
     * await client.chat.remove({
     *     schema: 'QuickReply',
     *     id: 'qr-greeting'
     * })
     * ```
     */
    public async remove(input: WaRemoveMutationInput): Promise<void> {
        const resolved = WA_APPSTATE_SCHEMAS[input.schema] as WaAppstateSchema
        const { indexArgs } = splitFlatInput(resolved, input)
        const timestamp = this.serverClock.nowMs()
        const mutation = buildRemoveMutationFromSchema({
            schema: resolved,
            indexArgs: indexArgs as unknown as IndexArgsForSchema<typeof resolved>,
            timestamp
        })
        await this.enqueueAndFlush([mutation])
    }

    private async createArchiveMutation(
        chatIndexJid: string,
        archived: boolean,
        timestamp: number
    ): Promise<WaAppStateMutationInput> {
        const messageRange = await this.buildChatMessageRange(chatIndexJid)
        return buildSetMutationFromSchema({
            schema: WA_APPSTATE_SCHEMAS.Archive,
            indexArgs: { chatJid: chatIndexJid },
            value: { archiveChatAction: { archived, messageRange } },
            timestamp
        })
    }

    private async buildChatMessageRange(
        chatIndexJid: string
    ): Promise<Proto.SyncActionValue.ISyncActionMessageRange> {
        const records = await this.messageStore.listByThread(chatIndexJid, this.archiveRangeLimit)
        const messages: Proto.SyncActionValue.ISyncActionMessage[] = []
        let lastMessageTimestamp: number | undefined
        let skippedMissingGroupParticipant = 0

        for (const record of records) {
            const timestampSeconds = this.toOptionalTimestampSeconds(record.timestampMs)
            const message = this.toChatMessageRangeMessage(record, chatIndexJid, timestampSeconds)
            if (!message) {
                skippedMissingGroupParticipant += 1
                continue
            }
            if (
                timestampSeconds !== undefined &&
                (lastMessageTimestamp === undefined || timestampSeconds > lastMessageTimestamp)
            ) {
                lastMessageTimestamp = timestampSeconds
            }
            messages.push(message)
        }

        if (skippedMissingGroupParticipant > 0) {
            this.logger.debug('app-state message range skipped invalid group messages', {
                chatJid: chatIndexJid,
                skippedMissingGroupParticipant
            })
        }

        return {
            ...(lastMessageTimestamp === undefined ? {} : { lastMessageTimestamp }),
            messages
        }
    }

    private toChatMessageRangeMessage(
        record: WaStoredMessageRecord,
        chatIndexJid: string,
        timestampSeconds: number | undefined
    ): Proto.SyncActionValue.ISyncActionMessage | null {
        const key: Proto.IMessageKey = {
            remoteJid: chatIndexJid,
            fromMe: record.fromMe,
            id: record.id
        }
        if (isGroupJid(chatIndexJid) && !record.fromMe) {
            const participant = record.participantJid ?? record.senderJid
            if (!participant) {
                return null
            }
            key.participant = this.normalizeMessageRangeParticipant(participant)
        }
        return {
            key,
            ...(timestampSeconds === undefined ? {} : { timestamp: timestampSeconds })
        }
    }

    private normalizeMessageRangeParticipant(participantJid: string): string {
        const normalized = normalizeRecipientJid(participantJid)
        if (isGroupOrBroadcastJid(normalized)) {
            throw new Error(
                `invalid group/broadcast participant in message range: ${participantJid}`
            )
        }
        return normalizeDeviceJid(normalized)
    }

    private toOptionalTimestampSeconds(timestampMs: number | undefined): number | undefined {
        if (timestampMs === undefined) {
            return undefined
        }
        if (
            !Number.isFinite(timestampMs) ||
            !Number.isSafeInteger(timestampMs) ||
            timestampMs < 0
        ) {
            return undefined
        }
        return Math.floor(timestampMs / 1_000)
    }

    private normalizeChatMutationJid(chatJid: string): string {
        const normalized = normalizeRecipientJid(chatJid)
        if (isGroupOrBroadcastJid(normalized)) {
            return normalized
        }
        return toUserJid(normalized)
    }

    private buildMessageMutationIndex(message: WaAppStateMessageKey): {
        readonly remote: string
        readonly id: string
        readonly fromMe: boolean
        readonly participant: string
    } {
        const chatIndexJid = this.normalizeChatMutationJid(message.chatJid)
        const messageId = message.id.trim()
        if (messageId.length === 0) {
            throw new Error('message id cannot be empty')
        }
        const fromMe = message.fromMe === true
        const participant = this.resolveMessageMutationParticipant(
            chatIndexJid,
            fromMe,
            message.participantJid
        )
        return {
            remote: chatIndexJid,
            id: messageId,
            fromMe,
            participant
        }
    }

    private resolveMessageMutationParticipant(
        chatIndexJid: string,
        fromMe: boolean,
        participantJid: string | undefined
    ): string {
        if (fromMe || !isGroupOrBroadcastJid(chatIndexJid)) {
            return '0'
        }
        if (!participantJid) {
            throw new Error(
                'participantJid is required for incoming message mutations in group/broadcast chats'
            )
        }
        const normalized = normalizeRecipientJid(participantJid)
        if (isGroupOrBroadcastJid(normalized)) {
            throw new Error(`invalid participantJid for message mutation: ${participantJid}`)
        }
        return normalizeDeviceJid(normalized)
    }

    private describeMutationActions(mutations: readonly WaAppStateMutationInput[]): string {
        return mutations
            .map((mutation) => {
                try {
                    const parsed = JSON.parse(mutation.index)
                    if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
                        return `${mutation.collection}:${parsed[0]}`
                    }
                } catch (error) {
                    void error
                }
                return `${mutation.collection}:unknown`
            })
            .join(',')
    }
}
