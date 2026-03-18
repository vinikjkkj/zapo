import type {
    AppStateCollectionName,
    WaAppStateMutationInput,
    WaAppStateSyncOptions,
    WaAppStateSyncResult
} from '@appstate/types'
import type {
    WaAppStateMessageKey,
    WaClearChatOptions,
    WaDeleteChatOptions,
    WaDeleteMessageForMeOptions
} from '@client/types'
import type { Logger } from '@infra/log/types'
import type { Proto } from '@proto'
import {
    WA_APP_STATE_CHAT_MUTATION_SPECS,
    WA_APP_STATE_COLLECTION_STATES
} from '@protocol/constants'
import {
    isGroupJid,
    isGroupOrBroadcastJid,
    normalizeDeviceJid,
    normalizeRecipientJid,
    toUserJid
} from '@protocol/jid'
import type { WaMessageStore, WaStoredMessageRecord } from '@store/contracts/message.store'
import { resolvePositive } from '@util/coercion'
import { toError } from '@util/primitives'

const WA_APP_STATE_MUTATION_FLUSH_SUCCESS_STATES = new Set<string>([
    WA_APP_STATE_COLLECTION_STATES.SUCCESS,
    WA_APP_STATE_COLLECTION_STATES.SUCCESS_HAS_MORE
])

const WA_APP_STATE_ARCHIVE_RANGE_DEFAULT_LIMIT = 256

interface WaAppStateMutationCoordinatorOptions {
    readonly logger: Logger
    readonly messageStore: WaMessageStore
    readonly syncAppState: (options?: WaAppStateSyncOptions) => Promise<WaAppStateSyncResult>
    readonly archiveRangeLimit?: number
}

type WaAppStateChatMutationSpec =
    (typeof WA_APP_STATE_CHAT_MUTATION_SPECS)[keyof typeof WA_APP_STATE_CHAT_MUTATION_SPECS]

export class WaAppStateMutationCoordinator {
    private readonly logger: Logger
    private readonly messageStore: WaMessageStore
    private readonly syncAppState: (
        options?: WaAppStateSyncOptions
    ) => Promise<WaAppStateSyncResult>
    private readonly archiveRangeLimit: number
    private readonly pendingMutations: Map<string, WaAppStateMutationInput>
    private flushPromise: Promise<void> | null

    public constructor(options: WaAppStateMutationCoordinatorOptions) {
        this.logger = options.logger
        this.messageStore = options.messageStore
        this.syncAppState = options.syncAppState
        this.archiveRangeLimit = resolvePositive(
            options.archiveRangeLimit,
            WA_APP_STATE_ARCHIVE_RANGE_DEFAULT_LIMIT,
            'WaAppStateMutationCoordinatorOptions.archiveRangeLimit'
        )
        this.pendingMutations = new Map()
        this.flushPromise = null
    }

    public async setChatMute(
        chatJid: string,
        muted: boolean,
        muteEndTimestampMs?: number
    ): Promise<void> {
        const chatIndexJid = this.normalizeChatMutationJid(chatJid)
        const timestamp = Date.now()
        const normalizedMuteEnd = this.normalizeMuteEndTimestampMs(muteEndTimestampMs)
        if (muted && normalizedMuteEnd === undefined) {
            throw new Error('setChatMute requires muteEndTimestampMs when muted is true')
        }

        const mutation = this.createSetMutation({
            spec: WA_APP_STATE_CHAT_MUTATION_SPECS.MUTE,
            chatIndexJid,
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
        await this.enqueueAndFlush([mutation])
    }

    public async setMessageStar(message: WaAppStateMessageKey, starred: boolean): Promise<void> {
        const messageIndex = this.buildMessageMutationIndex(message)
        const timestamp = Date.now()
        const mutation = this.createSetMutation({
            spec: WA_APP_STATE_CHAT_MUTATION_SPECS.STAR,
            chatIndexJid: messageIndex.chatIndexJid,
            value: {
                starAction: {
                    starred
                }
            },
            timestamp,
            indexPartsTail: messageIndex.indexPartsTail
        })
        await this.enqueueAndFlush([mutation])
    }

    public async setChatRead(chatJid: string, read: boolean): Promise<void> {
        const chatIndexJid = this.normalizeChatMutationJid(chatJid)
        const timestamp = Date.now()
        const messageRange = await this.buildChatMessageRange(chatIndexJid)
        const mutation = this.createSetMutation({
            spec: WA_APP_STATE_CHAT_MUTATION_SPECS.MARK_CHAT_AS_READ,
            chatIndexJid,
            value: {
                markChatAsReadAction: {
                    read,
                    messageRange
                }
            },
            timestamp
        })
        await this.enqueueAndFlush([mutation])
    }

    public async setChatPin(chatJid: string, pinned: boolean): Promise<void> {
        const chatIndexJid = this.normalizeChatMutationJid(chatJid)
        const timestamp = Date.now()
        const pending: WaAppStateMutationInput[] = [
            this.createSetMutation({
                spec: WA_APP_STATE_CHAT_MUTATION_SPECS.PIN,
                chatIndexJid,
                value: {
                    pinAction: {
                        pinned
                    }
                },
                timestamp
            })
        ]

        if (pinned) {
            pending.push(await this.createArchiveMutation(chatIndexJid, false, timestamp))
        }

        await this.enqueueAndFlush(pending)
    }

    public async setChatArchive(chatJid: string, archived: boolean): Promise<void> {
        const chatIndexJid = this.normalizeChatMutationJid(chatJid)
        const timestamp = Date.now()
        const pending: WaAppStateMutationInput[] = [
            await this.createArchiveMutation(chatIndexJid, archived, timestamp)
        ]

        if (archived) {
            pending.push(
                this.createSetMutation({
                    spec: WA_APP_STATE_CHAT_MUTATION_SPECS.PIN,
                    chatIndexJid,
                    value: {
                        pinAction: {
                            pinned: false
                        }
                    },
                    timestamp
                })
            )
        }

        await this.enqueueAndFlush(pending)
    }

    public async clearChat(chatJid: string, options: WaClearChatOptions = {}): Promise<void> {
        const chatIndexJid = this.normalizeChatMutationJid(chatJid)
        const timestamp = Date.now()
        const deleteStarred = options.deleteStarred === true
        const deleteMedia = options.deleteMedia === true
        const messageRange = await this.buildChatMessageRange(chatIndexJid)
        const mutation = this.createSetMutation({
            spec: WA_APP_STATE_CHAT_MUTATION_SPECS.CLEAR_CHAT,
            chatIndexJid,
            value: {
                clearChatAction: {
                    messageRange
                }
            },
            timestamp,
            indexPartsTail: [
                this.toMutationBoolFlag(deleteStarred),
                this.toMutationBoolFlag(deleteMedia)
            ]
        })
        await this.enqueueAndFlush([mutation])
    }

    public async deleteChat(chatJid: string, options: WaDeleteChatOptions = {}): Promise<void> {
        const chatIndexJid = this.normalizeChatMutationJid(chatJid)
        const timestamp = Date.now()
        const deleteMedia = options.deleteMedia === true
        const messageRange = await this.buildChatMessageRange(chatIndexJid)
        const mutation = this.createSetMutation({
            spec: WA_APP_STATE_CHAT_MUTATION_SPECS.DELETE_CHAT,
            chatIndexJid,
            value: {
                deleteChatAction: {
                    messageRange
                }
            },
            timestamp,
            indexPartsTail: [this.toMutationBoolFlag(deleteMedia)]
        })
        await this.enqueueAndFlush([mutation])
    }

    public async deleteMessageForMe(
        message: WaAppStateMessageKey,
        options: WaDeleteMessageForMeOptions = {}
    ): Promise<void> {
        const messageIndex = this.buildMessageMutationIndex(message)
        const timestamp = Date.now()
        const deleteMedia = options.deleteMedia === true
        const messageTimestamp = this.normalizeOptionalMutationTimestampSeconds(
            options.messageTimestampMs
        )
        const mutation = this.createSetMutation({
            spec: WA_APP_STATE_CHAT_MUTATION_SPECS.DELETE_MESSAGE_FOR_ME,
            chatIndexJid: messageIndex.chatIndexJid,
            value: {
                deleteMessageForMeAction: {
                    deleteMedia,
                    ...(messageTimestamp === undefined ? {} : { messageTimestamp })
                }
            },
            timestamp,
            indexPartsTail: messageIndex.indexPartsTail
        })
        await this.enqueueAndFlush([mutation])
    }

    public async setChatLock(chatJid: string, locked: boolean): Promise<void> {
        const chatIndexJid = this.normalizeChatMutationJid(chatJid)
        const timestamp = Date.now()
        const pending: WaAppStateMutationInput[] = []
        if (locked) {
            pending.push(await this.createArchiveMutation(chatIndexJid, false, timestamp))
            pending.push(
                this.createSetMutation({
                    spec: WA_APP_STATE_CHAT_MUTATION_SPECS.PIN,
                    chatIndexJid,
                    value: {
                        pinAction: {
                            pinned: false
                        }
                    },
                    timestamp
                })
            )
        }

        pending.push(
            this.createSetMutation({
                spec: WA_APP_STATE_CHAT_MUTATION_SPECS.LOCK_CHAT,
                chatIndexJid,
                value: {
                    lockChatAction: {
                        locked
                    }
                },
                timestamp
            })
        )

        await this.enqueueAndFlush(pending)
    }

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
        this.enqueueMutations(mutations)
        await this.flushMutations()
    }

    private enqueueMutations(mutations: readonly WaAppStateMutationInput[]): void {
        for (const mutation of mutations) {
            this.enqueueMutation(mutation)
        }
    }

    private enqueueMutation(mutation: WaAppStateMutationInput): void {
        const key = this.toPendingMutationKey(mutation.collection, mutation.index)
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

            let syncResult: WaAppStateSyncResult
            try {
                const collections = [...new Set(batch.map((mutation) => mutation.collection))]
                syncResult = await this.syncAppState({
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

            const failedCollections = this.getFailedCollections(batch, syncResult)
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

    private getFailedCollections(
        batch: readonly WaAppStateMutationInput[],
        syncResult: WaAppStateSyncResult
    ): readonly string[] {
        const targetedCollections = [...new Set(batch.map((mutation) => mutation.collection))]
        const stateByCollection = new Map(
            syncResult.collections.map((entry) => [entry.collection, entry.state] as const)
        )
        return targetedCollections.filter((collection) => {
            const state = stateByCollection.get(collection)
            if (!state) {
                return true
            }
            return !WA_APP_STATE_MUTATION_FLUSH_SUCCESS_STATES.has(state)
        })
    }

    private createSetMutation(input: {
        readonly spec: WaAppStateChatMutationSpec
        readonly chatIndexJid: string
        readonly value: Proto.ISyncActionValue
        readonly timestamp: number
        readonly indexPartsTail?: readonly string[]
    }): WaAppStateMutationInput {
        return {
            collection: input.spec.collection,
            operation: 'set',
            index: this.buildMutationIndex(
                input.spec.action,
                input.chatIndexJid,
                input.indexPartsTail ?? []
            ),
            value: {
                ...input.value,
                timestamp: input.timestamp
            },
            version: input.spec.version,
            timestamp: input.timestamp
        }
    }

    private async createArchiveMutation(
        chatIndexJid: string,
        archived: boolean,
        timestamp: number
    ): Promise<WaAppStateMutationInput> {
        const messageRange = await this.buildChatMessageRange(chatIndexJid)
        return this.createSetMutation({
            spec: WA_APP_STATE_CHAT_MUTATION_SPECS.ARCHIVE,
            chatIndexJid,
            value: {
                archiveChatAction: {
                    archived,
                    messageRange
                }
            },
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

    private normalizeMuteEndTimestampMs(
        muteEndTimestampMs: number | undefined
    ): number | undefined {
        if (muteEndTimestampMs === undefined) {
            return undefined
        }
        if (
            !Number.isFinite(muteEndTimestampMs) ||
            !Number.isSafeInteger(muteEndTimestampMs) ||
            muteEndTimestampMs < 0
        ) {
            throw new Error(`invalid muteEndTimestampMs: ${muteEndTimestampMs}`)
        }
        return muteEndTimestampMs
    }

    private buildMessageMutationIndex(message: WaAppStateMessageKey): {
        readonly chatIndexJid: string
        readonly indexPartsTail: readonly [string, '0' | '1', string]
    } {
        const chatIndexJid = this.normalizeChatMutationJid(message.chatJid)
        const messageId = this.normalizeMessageMutationId(message.id)
        const fromMe = message.fromMe === true
        const participant = this.resolveMessageMutationParticipant(
            chatIndexJid,
            fromMe,
            message.participantJid
        )
        return {
            chatIndexJid,
            indexPartsTail: [messageId, fromMe ? '1' : '0', participant]
        }
    }

    private normalizeMessageMutationId(messageId: string): string {
        const normalized = messageId.trim()
        if (normalized.length === 0) {
            throw new Error('message id cannot be empty')
        }
        return normalized
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

    private normalizeOptionalMutationTimestampSeconds(
        timestampMs: number | undefined
    ): number | undefined {
        if (timestampMs === undefined) {
            return undefined
        }
        if (
            !Number.isFinite(timestampMs) ||
            !Number.isSafeInteger(timestampMs) ||
            timestampMs < 0
        ) {
            throw new Error(`invalid messageTimestampMs: ${timestampMs}`)
        }
        return Math.floor(timestampMs / 1_000)
    }

    private buildMutationIndex(
        action: string,
        chatIndexJid: string,
        indexPartsTail: readonly string[]
    ): string {
        return JSON.stringify([action, chatIndexJid, ...indexPartsTail])
    }

    private toMutationBoolFlag(value: boolean): '0' | '1' {
        return value ? '1' : '0'
    }

    private toPendingMutationKey(collection: AppStateCollectionName, index: string): string {
        return `${collection}\u0001${index}`
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
