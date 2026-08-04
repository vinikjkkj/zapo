import { promisify } from 'node:util'
import { unzip } from 'node:zlib'

import { downloadHistoryBlob, flushPendingWrites } from '@client/persistence/history-blob'
import type { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import type { WaClientEventMap, WaHistorySyncChunkEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import type { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import { proto, type Proto } from '@proto'
import { isUserJid } from '@protocol/jid'
import { normalizeEphemeralSettingSeconds } from '@protocol/message'
import type { WaChatMetadataStore } from '@store/contracts/chat-metadata.store'
import { decodeProtoBytes, TEXT_DECODER, toBytesView } from '@util/bytes'
import { longToNumber, toError } from '@util/primitives'
import { PROTO_WIRE_TYPES, scanProtoFields } from '@util/protoscan'

const unzipAsync = promisify(unzip)

const HANDLED_SYNC_TYPES = new Set([
    proto.Message.HistorySyncType.INITIAL_BOOTSTRAP,
    proto.Message.HistorySyncType.RECENT,
    proto.Message.HistorySyncType.FULL,
    proto.Message.HistorySyncType.PUSH_NAME,
    proto.Message.HistorySyncType.ON_DEMAND,
    proto.Message.HistorySyncType.NON_BLOCKING_DATA
])
const HISTORY_SYNC_MAX_PENDING_WRITES = 1_024

const HISTORY_SYNC_FIELDS = Object.freeze({
    CONVERSATIONS: 2,
    CHUNK_ORDER: 5,
    PROGRESS: 6,
    PUSHNAMES: 7,
    PHONE_NUMBER_TO_LID_MAPPINGS: 15,
    NCT_SALT: 19,
    INLINE_CONTACTS: 20
} as const)

const CONVERSATION_JID_FIELDS = Object.freeze({
    PN_JID: 39,
    LID_JID: 42,
    ACCOUNT_LID: 49
} as const)

interface ByteRange {
    readonly start: number
    readonly end: number
}

interface HistorySyncScan {
    readonly conversationRanges: readonly ByteRange[]
    readonly pushnames: readonly Proto.IPushname[]
    readonly inlineContacts: readonly Proto.IInlineContact[]
    readonly phoneNumberToLidMappings: readonly Proto.IPhoneNumberToLIDMapping[]
    readonly nctSalt: Uint8Array | null
    readonly chunkOrder: number | null
    readonly progress: number | null
}

export function scanHistorySyncBlob(bytes: Uint8Array): HistorySyncScan {
    const conversationRanges: ByteRange[] = []
    const pushnames: Proto.IPushname[] = []
    const inlineContacts: Proto.IInlineContact[] = []
    const phoneNumberToLidMappings: Proto.IPhoneNumberToLIDMapping[] = []
    let nctSalt: Uint8Array | null = null
    let chunkOrder: number | null = null
    let progress: number | null = null

    scanProtoFields(bytes, 0, bytes.length, (field) => {
        if (field.wireType === PROTO_WIRE_TYPES.LEN) {
            if (field.fieldNumber === HISTORY_SYNC_FIELDS.CONVERSATIONS) {
                conversationRanges[conversationRanges.length] = {
                    start: field.valueStart,
                    end: field.valueEnd
                }
            } else if (field.fieldNumber === HISTORY_SYNC_FIELDS.PUSHNAMES) {
                pushnames[pushnames.length] = proto.Pushname.decode(
                    bytes.subarray(field.valueStart, field.valueEnd)
                )
            } else if (field.fieldNumber === HISTORY_SYNC_FIELDS.PHONE_NUMBER_TO_LID_MAPPINGS) {
                phoneNumberToLidMappings[phoneNumberToLidMappings.length] =
                    proto.PhoneNumberToLIDMapping.decode(
                        bytes.subarray(field.valueStart, field.valueEnd)
                    )
            } else if (field.fieldNumber === HISTORY_SYNC_FIELDS.INLINE_CONTACTS) {
                inlineContacts[inlineContacts.length] = proto.InlineContact.decode(
                    bytes.subarray(field.valueStart, field.valueEnd)
                )
            } else if (field.fieldNumber === HISTORY_SYNC_FIELDS.NCT_SALT) {
                nctSalt = bytes.slice(field.valueStart, field.valueEnd)
            }
            return
        }
        if (field.wireType === PROTO_WIRE_TYPES.VARINT) {
            if (field.fieldNumber === HISTORY_SYNC_FIELDS.CHUNK_ORDER) {
                chunkOrder = field.varintValue
            } else if (field.fieldNumber === HISTORY_SYNC_FIELDS.PROGRESS) {
                progress = field.varintValue
            }
        }
    })

    return {
        conversationRanges,
        pushnames,
        inlineContacts,
        phoneNumberToLidMappings,
        nctSalt,
        chunkOrder,
        progress
    }
}

export function scanConversationJidPair(
    bytes: Uint8Array,
    range: ByteRange
): { readonly pnJid: string | null; readonly lidJid: string | null } {
    let pnJid: string | null = null
    let lidJid: string | null = null
    let accountLid: string | null = null
    scanProtoFields(bytes, range.start, range.end, (field) => {
        if (field.wireType !== PROTO_WIRE_TYPES.LEN) {
            return
        }
        if (field.fieldNumber === CONVERSATION_JID_FIELDS.PN_JID) {
            pnJid = TEXT_DECODER.decode(bytes.subarray(field.valueStart, field.valueEnd))
        } else if (field.fieldNumber === CONVERSATION_JID_FIELDS.LID_JID) {
            lidJid = TEXT_DECODER.decode(bytes.subarray(field.valueStart, field.valueEnd))
        } else if (field.fieldNumber === CONVERSATION_JID_FIELDS.ACCOUNT_LID) {
            accountLid = TEXT_DECODER.decode(bytes.subarray(field.valueStart, field.valueEnd))
        }
    })
    return { pnJid, lidJid: lidJid ?? accountLid }
}

interface WaHistorySyncDeps {
    readonly logger: Logger
    readonly mediaTransfer: WaMediaTransferClient
    readonly writeBehind: WriteBehindPersistence
    readonly chatMetadataStore?: WaChatMetadataStore
    readonly emitEvent: <K extends keyof WaClientEventMap>(
        event: K,
        ...args: Parameters<WaClientEventMap[K]>
    ) => void
    readonly onPrivacyTokens?: (
        conversations: readonly {
            readonly jid: string
            readonly tcToken?: Uint8Array | null
            readonly tcTokenTimestamp?: number | null
            readonly tcTokenSenderTimestamp?: number | null
        }[]
    ) => Promise<void>
    readonly onNctSalt?: (salt: Uint8Array) => Promise<void>
    /**
     * Invoked once per recognized chunk after it has been fully processed (or
     * after the early-return for `INITIAL_STATUS_V3` and other recognized-but-
     * unhandled types). The WaClient wires this to the `hist_sync` receipt
     * stanza required by wa-web so the primary device does not keep resending
     * the same chunk.
     */
    readonly onProcessed?: (syncType: Proto.Message.HistorySyncType) => Promise<void>
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

export async function processHistorySyncNotification(
    deps: WaHistorySyncDeps,
    notification: Proto.Message.IHistorySyncNotification
): Promise<void> {
    const syncType = notification.syncType
    if (syncType === null || syncType === undefined) {
        deps.logger.debug('skipping history sync notification without syncType')
        return
    }
    if (!HANDLED_SYNC_TYPES.has(syncType)) {
        deps.logger.debug('skipping unhandled history sync type', { syncType })
        // INITIAL_STATUS_V3 is the only recognized syncType we do not process today;
        // still ack it so the primary device does not keep resending the same chunk.
        if (syncType === proto.Message.HistorySyncType.INITIAL_STATUS_V3 && deps.onProcessed) {
            await deps.onProcessed(syncType)
        }
        return
    }

    const blob = await downloadHistorySyncBlob(deps, notification)
    const decompressed = toBytesView(await unzipAsync(blob))
    // Conversations are decoded one record at a time in the loop below so the
    // full message graph never coexists in memory; the scan only records their
    // byte ranges and decodes the small metadata fields.
    const scan = scanHistorySyncBlob(decompressed)

    deps.logger.info('decoded history sync chunk', {
        syncType,
        chunkOrder: scan.chunkOrder,
        progress: scan.progress,
        conversations: scan.conversationRanges.length,
        pushnames: scan.pushnames.length,
        inlineContacts: scan.inlineContacts.length
    })

    const nowMs = Date.now()
    const pendingWrites: Promise<void>[] = []

    // Build PN -> LID lookup from this chunk's mappings (and inline contacts
    // and conversation-level pn/lid pairs, which carry the same pair) so
    // pushnames and mappings land on a single canonical (LID-form) contact
    // row instead of two mirror rows (one keyed by PN, one keyed by LID).
    const pnToLid = new Map<string, string>()
    for (const map of scan.phoneNumberToLidMappings) {
        if (map.pnJid && map.lidJid) {
            pnToLid.set(map.pnJid, map.lidJid)
        }
    }
    for (const c of scan.inlineContacts) {
        if (c.pnJid && c.lidJid) {
            pnToLid.set(c.pnJid, c.lidJid)
        }
    }
    for (const range of scan.conversationRanges) {
        const pair = scanConversationJidPair(decompressed, range)
        if (pair.pnJid && pair.lidJid) {
            pnToLid.set(pair.pnJid, pair.lidJid)
        }
    }

    for (const pn of scan.pushnames) {
        if (!pn.id) {
            continue
        }
        const lidJid = pnToLid.get(pn.id)
        pendingWrites[pendingWrites.length] = deps.writeBehind.persistContactAsync(
            lidJid
                ? {
                      jid: lidJid,
                      pushName: pn.pushname ?? undefined,
                      phoneNumber: pn.id,
                      lastUpdatedMs: nowMs
                  }
                : {
                      jid: pn.id,
                      pushName: pn.pushname ?? undefined,
                      lastUpdatedMs: nowMs
                  }
        )
        if (pendingWrites.length >= HISTORY_SYNC_MAX_PENDING_WRITES) {
            await flushPendingWrites(pendingWrites)
        }
    }

    for (const c of scan.inlineContacts) {
        const jid = c.lidJid ?? c.pnJid
        if (!jid) {
            continue
        }
        const displayName = c.fullName || c.firstName || undefined
        if (!displayName && !c.pnJid) {
            continue
        }
        pendingWrites[pendingWrites.length] = deps.writeBehind.persistContactAsync({
            jid,
            displayName,
            phoneNumber: c.pnJid ?? undefined,
            lastUpdatedMs: nowMs
        })
        if (pendingWrites.length >= HISTORY_SYNC_MAX_PENDING_WRITES) {
            await flushPendingWrites(pendingWrites)
        }
    }

    let messagesCount = 0
    const tokenConversations: {
        readonly jid: string
        readonly tcToken?: Uint8Array | null
        readonly tcTokenTimestamp?: number | null
        readonly tcTokenSenderTimestamp?: number | null
    }[] = []
    for (const range of scan.conversationRanges) {
        const conversation = proto.Conversation.decode(
            decompressed.subarray(range.start, range.end)
        )
        const threadJid = conversation.id
        if (!threadJid) {
            deps.logger.debug('skipping history sync conversation without thread jid')
            continue
        }

        if (
            deps.onPrivacyTokens &&
            (conversation.tcToken ||
                conversation.tcTokenTimestamp ||
                conversation.tcTokenSenderTimestamp)
        ) {
            tokenConversations[tokenConversations.length] = {
                jid: threadJid,
                tcToken: conversation.tcToken ? new Uint8Array(conversation.tcToken) : undefined,
                tcTokenTimestamp: longToNumber(conversation.tcTokenTimestamp) || undefined,
                tcTokenSenderTimestamp:
                    longToNumber(conversation.tcTokenSenderTimestamp) || undefined
            }
        }

        const ephemeralExpiration = conversation.ephemeralExpiration ?? undefined
        const ephemeralSettingTimestamp =
            normalizeEphemeralSettingSeconds(
                longToNumber(conversation.ephemeralSettingTimestamp)
            ) || undefined
        if (deps.chatMetadataStore && ephemeralExpiration !== undefined) {
            pendingWrites[pendingWrites.length] = deps.chatMetadataStore
                .upsertChatMetadata({
                    chatJid: threadJid,
                    ephemeralExpiration,
                    ...(ephemeralSettingTimestamp !== undefined
                        ? { ephemeralSettingTimestamp }
                        : {}),
                    updatedAtMs: nowMs
                })
                .catch((error: unknown) => {
                    deps.logger.debug('failed to cache history sync chat metadata', {
                        jid: threadJid,
                        message: toError(error).message
                    })
                })
        }
        pendingWrites[pendingWrites.length] = deps.writeBehind.persistThreadAsync({
            jid: threadJid,
            name: conversation.name ?? undefined,
            unreadCount: conversation.unreadCount ?? undefined,
            archived: conversation.archived ?? undefined,
            pinned: conversation.pinned ?? undefined,
            muteEndMs: longToNumber(conversation.muteEndTime) || undefined,
            markedAsUnread: conversation.markedAsUnread ?? undefined,
            ephemeralExpiration,
            ephemeralSettingTimestamp
        })
        if (pendingWrites.length >= HISTORY_SYNC_MAX_PENDING_WRITES) {
            await flushPendingWrites(pendingWrites)
        }

        if (isUserJid(threadJid) || (conversation.lidJid ?? conversation.accountLid)) {
            const contactDisplay = conversation.displayName || conversation.username || undefined
            const contactPn = conversation.pnJid ?? undefined
            const contactLid = conversation.lidJid ?? conversation.accountLid ?? undefined
            if (contactDisplay || contactPn || contactLid) {
                const contactJid = contactLid ?? threadJid
                pendingWrites[pendingWrites.length] = deps.writeBehind.persistContactAsync({
                    jid: contactJid,
                    displayName: contactDisplay,
                    phoneNumber: contactPn,
                    lastUpdatedMs: nowMs
                })
                if (pendingWrites.length >= HISTORY_SYNC_MAX_PENDING_WRITES) {
                    await flushPendingWrites(pendingWrites)
                }
            }
        }
        for (const histMsg of conversation.messages ?? []) {
            const webMsg = histMsg.message
            if (!webMsg?.key?.id || !webMsg.message) {
                // Stubs (group system events: add/remove/promote, revokes, ephemeral toggles)
                // arrive as WebMessageInfo with a key + messageStubType but no `.message`. They
                // duplicate live `notification` stanzas that the client already processes, and
                // storing them as content-less rows produces "ghost" entries — skip them here.
                continue
            }
            const timestampMs = longToNumber(webMsg.messageTimestamp) * 1000
            pendingWrites[pendingWrites.length] = deps.writeBehind.persistMessageAsync({
                id: webMsg.key.id,
                threadJid,
                senderJid: webMsg.key.participant ?? undefined,
                fromMe: webMsg.key.fromMe === true,
                timestampMs: timestampMs || undefined,
                messageBytes: proto.Message.encode(webMsg.message).finish()
            })
            if (pendingWrites.length >= HISTORY_SYNC_MAX_PENDING_WRITES) {
                await flushPendingWrites(pendingWrites)
            }
            messagesCount += 1
        }
    }

    // Persist LID<->PN mappings as a single LID-canonical row per contact.
    // Lookups by PN form fall through to `getByPhoneNumber` via the secondary
    // index, so the mirror PN row is no longer needed.
    for (const [pnJid, lidJid] of pnToLid) {
        pendingWrites[pendingWrites.length] = deps.writeBehind.persistContactAsync({
            jid: lidJid,
            phoneNumber: pnJid,
            lastUpdatedMs: nowMs
        })
        if (pendingWrites.length >= HISTORY_SYNC_MAX_PENDING_WRITES) {
            await flushPendingWrites(pendingWrites)
        }
    }

    if (deps.onPrivacyTokens && tokenConversations.length > 0) {
        pendingWrites[pendingWrites.length] = deps.onPrivacyTokens(tokenConversations)
    }
    if (deps.onNctSalt && scan.nctSalt) {
        pendingWrites[pendingWrites.length] = deps.onNctSalt(scan.nctSalt)
    }

    const event: WaHistorySyncChunkEvent = {
        syncType,
        messagesCount,
        conversationsCount: scan.conversationRanges.length,
        pushnamesCount: scan.pushnames.length,
        inlineContactsCount: scan.inlineContacts.length,
        chunkOrder: scan.chunkOrder ?? undefined,
        progress: scan.progress ?? undefined
    }
    await flushPendingWrites(pendingWrites)
    deps.emitEvent('history_sync_chunk', event)
    if (deps.onProcessed) {
        await deps.onProcessed(syncType)
    }
}

async function downloadHistorySyncBlob(
    deps: WaHistorySyncDeps,
    notification: Proto.Message.IHistorySyncNotification
): Promise<Uint8Array> {
    if (notification.initialHistBootstrapInlinePayload) {
        return decodeProtoBytes(
            notification.initialHistBootstrapInlinePayload,
            'initialHistBootstrapInlinePayload'
        )
    }
    return downloadHistoryBlob(deps.mediaTransfer, notification, 'history', 'history sync')
}
