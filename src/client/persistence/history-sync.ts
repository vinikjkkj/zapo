import {
    flushPendingWrites,
    openHistoryBlobStream,
    type WaHistoryBlobStream
} from '@client/persistence/history-blob'
import type { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import type {
    WaClientEventMap,
    WaHistorySyncChunkEvent,
    WaHistorySyncChunkRef,
    WaHistorySyncItem,
    WaHistorySyncSink
} from '@client/types'
import type { Logger } from '@infra/log/types'
import type { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import { resolveWebMessageInfoAuthor } from '@message/primitives/incoming'
import { proto, type Proto } from '@proto'
import { isBroadcastJid, isGroupJid, isUserJid } from '@protocol/jid'
import { normalizeEphemeralSettingSeconds } from '@protocol/message'
import { normalizeUsername } from '@protocol/username'
import type { WaChatMetadataStore } from '@store/contracts/chat-metadata.store'
import { concatBytes, TEXT_DECODER } from '@util/bytes'
import { longToNumber, toError } from '@util/primitives'
import {
    PROTO_STREAM_EVENT_KINDS,
    type ProtoStreamEvent,
    type ProtoStreamFieldEvent,
    streamProtoFields
} from '@util/proto-stream'
import { PROTO_WIRE_TYPES } from '@util/protoscan'

const HANDLED_SYNC_TYPES = new Set([
    proto.Message.HistorySyncType.INITIAL_BOOTSTRAP,
    proto.Message.HistorySyncType.RECENT,
    proto.Message.HistorySyncType.FULL,
    proto.Message.HistorySyncType.PUSH_NAME,
    proto.Message.HistorySyncType.ON_DEMAND,
    proto.Message.HistorySyncType.NON_BLOCKING_DATA
])
const HISTORY_SYNC_MAX_PENDING_WRITES = 1_024
const HISTORY_SYNC_MAX_RECORD_BYTES = 16 * 1024 * 1024
/**
 * Ceiling on messages held while waiting for their `Conversation.id`. Field order
 * puts the id first, so this only fills if a serializer reverses it, and letting
 * it grow would rebuild the very peak the streaming pass removes. Exceeding it
 * fails the chunk rather than dropping records: an aborted chunk stays unacked
 * and gets resent, while a dropped one would be acked and lost for good.
 */
const HISTORY_SYNC_MAX_PARKED_MESSAGES = 1_024

export const HISTORY_SYNC_FIELDS = Object.freeze({
    CONVERSATIONS: 2,
    CHUNK_ORDER: 5,
    PROGRESS: 6,
    PUSHNAMES: 7,
    PHONE_NUMBER_TO_LID_MAPPINGS: 15,
    NCT_SALT: 19,
    INLINE_CONTACTS: 20
} as const)

type HistorySyncSinkKey = Exclude<
    WaHistorySyncItem['kind'],
    'conversations' | 'conversations.messages'
>

const HISTORY_SYNC_SINK_KEYS: ReadonlyMap<number, HistorySyncSinkKey> = new Map([
    [3, 'statusV3Messages'],
    [5, 'chunkOrder'],
    [6, 'progress'],
    [7, 'pushnames'],
    [8, 'globalSettings'],
    [9, 'threadIdUserSecret'],
    [10, 'threadDsTimeframeOffset'],
    [11, 'recentStickers'],
    [12, 'pastParticipants'],
    [13, 'callLogRecords'],
    [14, 'aiWaitListState'],
    [15, 'phoneNumberToLidMappings'],
    [16, 'companionMetaNonce'],
    [17, 'shareableChatIdentifierEncryptionKey'],
    [18, 'accounts'],
    [19, 'nctSalt'],
    [20, 'inlineContacts'],
    [21, 'inlineContactsProvided']
])

export const CONVERSATION_FIELDS = Object.freeze({
    ID: 1,
    MESSAGES: 2
} as const)

interface WaHistorySyncPrivacyTokenConversation {
    readonly jid: string
    readonly tcToken?: Uint8Array | null
    readonly tcTokenTimestamp?: number | null
    readonly tcTokenSenderTimestamp?: number | null
}

interface WaHistorySyncDeps {
    readonly logger: Logger
    readonly mediaTransfer: WaMediaTransferClient
    readonly writeBehind: WriteBehindPersistence
    /** Id of the protocol message that carried the notification; empty when the caller has none. */
    readonly chunkId?: string
    readonly sink?: WaHistorySyncSink
    readonly chatMetadataStore?: WaChatMetadataStore
    readonly emitEvent: <K extends keyof WaClientEventMap>(
        event: K,
        ...args: Parameters<WaClientEventMap[K]>
    ) => void
    readonly onPrivacyTokens?: (
        conversations: readonly WaHistorySyncPrivacyTokenConversation[]
    ) => Promise<void>
    readonly onNctSalt?: (salt: Uint8Array) => Promise<void>
    /** Acks the chunk via the `hist_sync` receipt so the primary stops resending it. */
    readonly onProcessed?: (syncType: Proto.Message.HistorySyncType) => Promise<void>
    /** Author fallback for self-sent group messages that carry no participant. */
    readonly meJid?: string | null
}

interface ParkedHistoryMessage {
    readonly id: string
    /**
     * The author-bearing fields of the record, trimmed off the decoded
     * `WebMessageInfo` so parking a message never retains the whole envelope.
     */
    readonly authorInfo: Proto.IWebMessageInfo
    readonly fromMe: boolean
    readonly timestampMs: number | undefined
    readonly messageBytes: Uint8Array
}

interface ParkedHistoryEntry {
    readonly stored: ParkedHistoryMessage | null
    /** Kept only when a sink is set: it also receives the records the stores drop. */
    readonly record: Proto.IHistorySyncMsg | null
}

interface HistorySyncChunkState {
    readonly chunk: WaHistorySyncChunkRef
    readonly nowMs: number
    readonly pendingWrites: Promise<void>[]
    readonly pushnames: Proto.IPushname[]
    readonly inlineContacts: Proto.IInlineContact[]
    readonly pnToLid: Map<string, string>
    readonly tokenConversations: WaHistorySyncPrivacyTokenConversation[]
    nctSalt: Uint8Array | null
    chunkOrder: number | null
    progress: number | null
    conversationsCount: number
    messagesCount: number
}

export async function runHistorySyncNotification(
    deps: WaHistorySyncDeps,
    notification: Proto.Message.IHistorySyncNotification
): Promise<void> {
    try {
        await processHistorySyncNotification(deps, notification)
    } catch (error) {
        deps.logger.warn('failed to process history sync notification', {
            syncType: notification.syncType,
            chunkOrder: notification.chunkOrder,
            message: toError(error).message
        })
    }
}

/**
 * Applies one history sync chunk while it downloads, descending into
 * `conversations` so peak memory tracks the largest single message and not the
 * chunk. Chunk-wide records settle after the stream, once every LID mapping is in.
 * `INITIAL_STATUS_V3` is processed only for a sink and never emits `history_sync_chunk`.
 */
export async function processHistorySyncNotification(
    deps: WaHistorySyncDeps,
    notification: Proto.Message.IHistorySyncNotification
): Promise<void> {
    const syncType = notification.syncType
    if (syncType === null || syncType === undefined) {
        deps.logger.debug('skipping history sync notification without syncType')
        return
    }
    const isStatusV3 = syncType === proto.Message.HistorySyncType.INITIAL_STATUS_V3
    if (!HANDLED_SYNC_TYPES.has(syncType) && !(isStatusV3 && deps.sink)) {
        deps.logger.debug('skipping unhandled history sync type', { syncType })
        if (isStatusV3 && deps.onProcessed) {
            await deps.onProcessed(syncType)
        }
        return
    }

    const blob = await openHistoryBlobStream(
        deps.mediaTransfer,
        notification,
        'history',
        'history sync',
        notification.initialHistBootstrapInlinePayload
    )

    const state: HistorySyncChunkState = {
        chunk: { id: deps.chunkId ?? '', syncType },
        nowMs: Date.now(),
        pendingWrites: [],
        pushnames: [],
        inlineContacts: [],
        pnToLid: new Map<string, string>(),
        tokenConversations: [],
        nctSalt: null,
        chunkOrder: null,
        progress: null,
        conversationsCount: 0,
        messagesCount: 0
    }

    let event: WaHistorySyncChunkEvent
    try {
        event = await applyHistorySyncChunk(deps, blob, state)
    } catch (error) {
        const failure = toError(error)
        await abortHistorySink(deps, state.chunk, failure)
        throw failure
    }

    if (!isStatusV3) {
        deps.emitEvent('history_sync_chunk', event)
    }
    if (deps.onProcessed) {
        await deps.onProcessed(syncType)
    }
}

async function applyHistorySyncChunk(
    deps: WaHistorySyncDeps,
    blob: WaHistoryBlobStream,
    state: HistorySyncChunkState
): Promise<WaHistorySyncChunkEvent> {
    try {
        await consumeHistorySyncStream(deps, blob.inflated, state)
    } catch (error) {
        blob.inflated.destroy(toError(error))
        await Promise.allSettled(state.pendingWrites)
        await blob.verified.catch(() => undefined)
        throw toError(error)
    }

    await blob.verified

    await settleHistorySyncChunk(deps, state)

    deps.logger.info('decoded history sync chunk', {
        syncType: state.chunk.syncType,
        chunkOrder: state.chunkOrder,
        progress: state.progress,
        conversations: state.conversationsCount,
        messages: state.messagesCount,
        pushnames: state.pushnames.length,
        inlineContacts: state.inlineContacts.length
    })

    const event: WaHistorySyncChunkEvent = {
        id: state.chunk.id,
        syncType: state.chunk.syncType,
        messagesCount: state.messagesCount,
        conversationsCount: state.conversationsCount,
        pushnamesCount: state.pushnames.length,
        inlineContactsCount: state.inlineContacts.length,
        chunkOrder: state.chunkOrder ?? undefined,
        progress: state.progress ?? undefined
    }
    await flushPendingWrites(state.pendingWrites)
    if (deps.sink?.commit) {
        await deps.sink.commit(event)
    }
    return event
}

/** A throwing `abort` is logged so it never hides the failure that triggered it. */
async function abortHistorySink(
    deps: WaHistorySyncDeps,
    chunk: WaHistorySyncChunkRef,
    error: Error
): Promise<void> {
    if (!deps.sink?.abort) {
        return
    }
    try {
        await deps.sink.abort(chunk, error)
    } catch (abortError) {
        deps.logger.warn('history sync sink abort failed', {
            id: chunk.id,
            message: toError(abortError).message
        })
    }
}

/** Only a thenable result is surfaced, so a synchronous sink never adds an await. */
function deliverHistoryItem(
    sink: WaHistorySyncSink,
    chunk: WaHistorySyncChunkRef,
    item: WaHistorySyncItem
): Promise<void> | undefined {
    const result = sink.item(item, chunk)
    return typeof (result as PromiseLike<void> | undefined)?.then === 'function'
        ? Promise.resolve(result)
        : undefined
}

function deliverHistoryValue(
    sink: WaHistorySyncSink,
    chunk: WaHistorySyncChunkRef,
    key: HistorySyncSinkKey,
    value: unknown
): Promise<void> | undefined {
    return deliverHistoryItem(sink, chunk, { kind: key, value } as WaHistorySyncItem)
}

/**
 * Delivers a `HistorySync` field the stores do not consume. The field is decoded
 * from a copy because the reader buffer is reused and `bytes` values are views of
 * their input; one occurrence of a repeated field yields a single element.
 */
function deliverHistoryField(
    sink: WaHistorySyncSink,
    chunk: WaHistorySyncChunkRef,
    key: HistorySyncSinkKey,
    event: ProtoStreamFieldEvent
): Promise<void> | undefined {
    const decoded: unknown = proto.HistorySync.decode(event.raw.slice())[key]
    const value = Array.isArray(decoded) ? decoded[0] : decoded
    return value === null || value === undefined
        ? undefined
        : deliverHistoryValue(sink, chunk, key, value)
}

async function consumeHistorySyncStream(
    deps: WaHistorySyncDeps,
    inflated: Parameters<typeof streamProtoFields>[0],
    state: HistorySyncChunkState
): Promise<void> {
    let headerParts: Uint8Array[] | null = null
    let threadJid: string | null = null
    let parked: ParkedHistoryEntry[] | null = null
    const sink = deps.sink

    const onEvent = (event: ProtoStreamEvent): void | Promise<void> => {
        if (event.kind === PROTO_STREAM_EVENT_KINDS.ENTER) {
            headerParts = []
            threadJid = null
            parked = null
            state.conversationsCount += 1
            return undefined
        }

        if (event.kind === PROTO_STREAM_EVENT_KINDS.LEAVE) {
            const parts = headerParts
            const jid = threadJid
            const pending = parked
            headerParts = null
            threadJid = null
            parked = null
            return parts ? closeConversation(deps, state, parts, jid, pending) : undefined
        }

        if (event.depth === 1) {
            if (
                event.fieldNumber === CONVERSATION_FIELDS.MESSAGES &&
                event.wireType === PROTO_WIRE_TYPES.LEN
            ) {
                const record = proto.HistorySyncMsg.decode(sink ? event.value.slice() : event.value)
                const webMsg = record.message
                if (!webMsg && !sink) {
                    return undefined
                }
                const stored = webMsg ? toStoredHistoryMessage(webMsg) : null
                if (!threadJid) {
                    if (!stored && !sink) {
                        return undefined
                    }
                    parked ??= []
                    if (parked.length >= HISTORY_SYNC_MAX_PARKED_MESSAGES) {
                        throw new Error(
                            `history sync parked ${parked.length} messages with no thread jid, exceeding the ${HISTORY_SYNC_MAX_PARKED_MESSAGES} limit`
                        )
                    }
                    parked[parked.length] = { stored, record: sink ? record : null }
                    return undefined
                }
                if (stored) {
                    persistHistoryMessage(deps, state, stored, threadJid)
                }
                const delivery = sink
                    ? deliverHistoryItem(sink, state.chunk, {
                          kind: 'conversations.messages',
                          conversationId: threadJid,
                          value: record
                      })
                    : undefined
                const flush = maybeFlush(state)
                return delivery && flush
                    ? Promise.all([delivery, flush]).then(() => undefined)
                    : (delivery ?? flush)
            }

            if (headerParts) {
                if (
                    event.fieldNumber === CONVERSATION_FIELDS.ID &&
                    event.wireType === PROTO_WIRE_TYPES.LEN
                ) {
                    threadJid = TEXT_DECODER.decode(event.value)
                }
                headerParts[headerParts.length] = event.raw.slice()
            }
            return undefined
        }

        if (event.depth !== 0) {
            return undefined
        }

        if (event.wireType === PROTO_WIRE_TYPES.VARINT) {
            if (event.fieldNumber === HISTORY_SYNC_FIELDS.CHUNK_ORDER) {
                state.chunkOrder = event.varintValue
                return sink
                    ? deliverHistoryValue(sink, state.chunk, 'chunkOrder', event.varintValue)
                    : undefined
            } else if (event.fieldNumber === HISTORY_SYNC_FIELDS.PROGRESS) {
                state.progress = event.varintValue
                return sink
                    ? deliverHistoryValue(sink, state.chunk, 'progress', event.varintValue)
                    : undefined
            }
        } else if (event.wireType === PROTO_WIRE_TYPES.LEN) {
            if (event.fieldNumber === HISTORY_SYNC_FIELDS.PUSHNAMES) {
                const pushname = proto.Pushname.decode(sink ? event.value.slice() : event.value)
                state.pushnames[state.pushnames.length] = pushname
                return sink
                    ? deliverHistoryValue(sink, state.chunk, 'pushnames', pushname)
                    : undefined
            } else if (event.fieldNumber === HISTORY_SYNC_FIELDS.PHONE_NUMBER_TO_LID_MAPPINGS) {
                const mapping = proto.PhoneNumberToLIDMapping.decode(
                    sink ? event.value.slice() : event.value
                )
                if (mapping.pnJid && mapping.lidJid) {
                    state.pnToLid.set(mapping.pnJid, mapping.lidJid)
                }
                return sink
                    ? deliverHistoryValue(sink, state.chunk, 'phoneNumberToLidMappings', mapping)
                    : undefined
            } else if (event.fieldNumber === HISTORY_SYNC_FIELDS.INLINE_CONTACTS) {
                const contact = proto.InlineContact.decode(sink ? event.value.slice() : event.value)
                state.inlineContacts[state.inlineContacts.length] = contact
                if (contact.pnJid && contact.lidJid) {
                    state.pnToLid.set(contact.pnJid, contact.lidJid)
                }
                return sink
                    ? deliverHistoryValue(sink, state.chunk, 'inlineContacts', contact)
                    : undefined
            } else if (event.fieldNumber === HISTORY_SYNC_FIELDS.NCT_SALT) {
                const salt = event.value.slice()
                state.nctSalt = salt
                return sink ? deliverHistoryValue(sink, state.chunk, 'nctSalt', salt) : undefined
            }
        }

        const key = sink ? HISTORY_SYNC_SINK_KEYS.get(event.fieldNumber) : undefined
        return sink && key ? deliverHistoryField(sink, state.chunk, key, event) : undefined
    }

    await streamProtoFields(inflated, onEvent, {
        shouldDescend: (fieldNumber, depth) =>
            depth === 0 && fieldNumber === HISTORY_SYNC_FIELDS.CONVERSATIONS,
        maxFieldBytes: HISTORY_SYNC_MAX_RECORD_BYTES
    })
}

async function closeConversation(
    deps: WaHistorySyncDeps,
    state: HistorySyncChunkState,
    headerParts: readonly Uint8Array[],
    threadJid: string | null,
    parked: readonly ParkedHistoryEntry[] | null
): Promise<void> {
    const conversation = proto.Conversation.decode(concatBytes(headerParts))
    const resolvedJid = threadJid ?? conversation.id
    if (!resolvedJid) {
        deps.logger.debug('skipping history sync conversation without thread jid')
        return
    }

    if (conversation.pnJid) {
        const lidJid = conversation.lidJid ?? conversation.accountLid
        if (lidJid) {
            state.pnToLid.set(conversation.pnJid, lidJid)
        }
    }

    if (
        deps.onPrivacyTokens &&
        (conversation.tcToken ||
            conversation.tcTokenTimestamp ||
            conversation.tcTokenSenderTimestamp)
    ) {
        state.tokenConversations[state.tokenConversations.length] = {
            jid: resolvedJid,
            tcToken: conversation.tcToken ? new Uint8Array(conversation.tcToken) : undefined,
            tcTokenTimestamp: longToNumber(conversation.tcTokenTimestamp) || undefined,
            tcTokenSenderTimestamp: longToNumber(conversation.tcTokenSenderTimestamp) || undefined
        }
    }

    const ephemeralExpiration = conversation.ephemeralExpiration ?? undefined
    const ephemeralSettingTimestamp =
        normalizeEphemeralSettingSeconds(longToNumber(conversation.ephemeralSettingTimestamp)) ||
        undefined
    if (deps.chatMetadataStore && ephemeralExpiration !== undefined) {
        pushWrite(
            state,
            deps.chatMetadataStore
                .upsertChatMetadata({
                    chatJid: resolvedJid,
                    ephemeralExpiration,
                    ...(ephemeralSettingTimestamp !== undefined
                        ? { ephemeralSettingTimestamp }
                        : {}),
                    updatedAtMs: state.nowMs
                })
                .catch((error: unknown) => {
                    deps.logger.debug('failed to cache history sync chat metadata', {
                        jid: resolvedJid,
                        message: toError(error).message
                    })
                })
        )
    }
    pushWrite(
        state,
        deps.writeBehind.persistThreadAsync({
            jid: resolvedJid,
            name: conversation.name ?? undefined,
            unreadCount: conversation.unreadCount ?? undefined,
            archived: conversation.archived ?? undefined,
            pinned: conversation.pinned ?? undefined,
            muteEndMs: longToNumber(conversation.muteEndTime) || undefined,
            markedAsUnread: conversation.markedAsUnread ?? undefined,
            ephemeralExpiration,
            ephemeralSettingTimestamp
        })
    )

    if (isUserJid(resolvedJid) || (conversation.lidJid ?? conversation.accountLid)) {
        const contactDisplay = conversation.displayName || undefined
        const contactUsername = conversation.username
            ? normalizeUsername(conversation.username)
            : undefined
        const contactPn = conversation.pnJid ?? undefined
        const contactLid = conversation.lidJid ?? conversation.accountLid ?? undefined
        if (contactDisplay || contactUsername || contactPn || contactLid) {
            pushWrite(
                state,
                deps.writeBehind.persistContactAsync({
                    jid: contactLid ?? resolvedJid,
                    displayName: contactDisplay,
                    username: contactUsername,
                    phoneNumber: contactPn,
                    lastUpdatedMs: state.nowMs
                })
            )
        }
    }

    const sink = deps.sink
    for (const entry of parked ?? []) {
        if (entry.stored) {
            persistHistoryMessage(deps, state, entry.stored, resolvedJid)
        }
        if (sink && entry.record) {
            const delivery = deliverHistoryItem(sink, state.chunk, {
                kind: 'conversations.messages',
                conversationId: resolvedJid,
                value: entry.record
            })
            if (delivery) {
                await delivery
            }
        }
    }
    if (sink) {
        const delivery = deliverHistoryItem(sink, state.chunk, {
            kind: 'conversations',
            value: conversation
        })
        if (delivery) {
            await delivery
        }
    }

    await maybeFlush(state)
}

/**
 * Resolves the author here rather than at decode time because a message may be
 * read before its `Conversation.id`, and the thread type decides both the
 * self-sent fallback and the shape of the record.
 *
 * `participantJid` carries the group/broadcast author and stays absent in 1:1
 * threads, where `senderJid` falls back to the thread JID - the same shape the
 * live message path persists. A group author that stays unresolved leaves both
 * fields empty: writing the group JID there would read downstream as if the
 * group itself had sent the message.
 */
function persistHistoryMessage(
    deps: WaHistorySyncDeps,
    state: HistorySyncChunkState,
    message: ParkedHistoryMessage,
    threadJid: string
): void {
    state.messagesCount += 1
    const authorJid = resolveWebMessageInfoAuthor(message.authorInfo, deps.meJid, threadJid)
    const isGroupOrBroadcast = isGroupJid(threadJid) || isBroadcastJid(threadJid)
    pushWrite(
        state,
        deps.writeBehind.persistMessageAsync({
            id: message.id,
            threadJid,
            senderJid: isGroupOrBroadcast ? authorJid : (authorJid ?? threadJid),
            participantJid: isGroupOrBroadcast ? authorJid : undefined,
            fromMe: message.fromMe,
            timestampMs: message.timestampMs,
            messageBytes: message.messageBytes
        })
    )
}

async function settleHistorySyncChunk(
    deps: WaHistorySyncDeps,
    state: HistorySyncChunkState
): Promise<void> {
    for (const pushname of state.pushnames) {
        if (!pushname.id) {
            continue
        }
        const lidJid = state.pnToLid.get(pushname.id)
        pushWrite(
            state,
            deps.writeBehind.persistContactAsync(
                lidJid
                    ? {
                          jid: lidJid,
                          pushName: pushname.pushname ?? undefined,
                          phoneNumber: pushname.id,
                          lastUpdatedMs: state.nowMs
                      }
                    : {
                          jid: pushname.id,
                          pushName: pushname.pushname ?? undefined,
                          lastUpdatedMs: state.nowMs
                      }
            )
        )
        await maybeFlush(state)
    }

    for (const contact of state.inlineContacts) {
        const jid = contact.lidJid ?? contact.pnJid
        if (!jid) {
            continue
        }
        const displayName = contact.fullName || contact.firstName || undefined
        if (!displayName && !contact.pnJid) {
            continue
        }
        pushWrite(
            state,
            deps.writeBehind.persistContactAsync({
                jid,
                displayName,
                phoneNumber: contact.pnJid ?? undefined,
                lastUpdatedMs: state.nowMs
            })
        )
        await maybeFlush(state)
    }

    for (const [pnJid, lidJid] of state.pnToLid) {
        pushWrite(
            state,
            deps.writeBehind.persistContactAsync({
                jid: lidJid,
                phoneNumber: pnJid,
                lastUpdatedMs: state.nowMs
            })
        )
        await maybeFlush(state)
    }

    if (deps.onPrivacyTokens && state.tokenConversations.length > 0) {
        pushWrite(state, deps.onPrivacyTokens(state.tokenConversations))
    }
    if (deps.onNctSalt && state.nctSalt) {
        pushWrite(state, deps.onNctSalt(state.nctSalt))
    }
}

/** `null` for content-less stubs, which duplicate live notification stanzas. */
function toStoredHistoryMessage(webMsg: Proto.IWebMessageInfo): ParkedHistoryMessage | null {
    if (!webMsg.key?.id || !webMsg.message) {
        return null
    }
    const timestampMs = longToNumber(webMsg.messageTimestamp) * 1000
    return {
        id: webMsg.key.id,
        authorInfo: {
            key: { fromMe: webMsg.key.fromMe, participant: webMsg.key.participant },
            participant: webMsg.participant,
            originalSelfAuthorUserJidString: webMsg.originalSelfAuthorUserJidString
        },
        fromMe: webMsg.key.fromMe === true,
        timestampMs: timestampMs || undefined,
        messageBytes: proto.Message.encode(webMsg.message).finish()
    }
}

/** The no-op handler keeps a queued rejection observed until the flush rejects on it. */
function pushWrite(state: HistorySyncChunkState, write: Promise<void>): void {
    write.catch(() => undefined)
    state.pendingWrites[state.pendingWrites.length] = write
}

function maybeFlush(state: HistorySyncChunkState): Promise<void> | undefined {
    if (state.pendingWrites.length >= HISTORY_SYNC_MAX_PENDING_WRITES) {
        return flushPendingWrites(state.pendingWrites)
    }
    return undefined
}
