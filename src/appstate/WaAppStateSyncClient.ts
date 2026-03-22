import {
    APP_STATE_DEFAULT_COLLECTIONS,
    APP_STATE_DEFAULT_COLLECTION_VERSION,
    APP_STATE_EMPTY_LT_HASH
} from '@appstate/constants'
import type {
    AppStateCollectionName,
    WaAppStateMissingKeysEvent,
    WaAppStateCollectionSyncResult,
    WaAppStateMutation,
    WaAppStateMutationInput,
    WaAppStateSyncOptions,
    WaAppStateStoreData,
    WaAppStateSyncResult,
    WaAppStateSyncKey
} from '@appstate/types'
import { WaAppStateCrypto } from '@appstate/WaAppStateCrypto'
import {
    type CollectionResponsePayload,
    parseSyncResponse
} from '@appstate/WaAppStateSyncResponseParser'
import type { Logger } from '@infra/log/types'
import { proto } from '@proto'
import type { Proto } from '@proto'
import {
    WA_APP_STATE_COLLECTION_STATES,
    WA_DEFAULTS,
    WA_IQ_TYPES,
    WA_NODE_TAGS,
    WA_XMLNS
} from '@protocol/constants'
import { parseSignalAddressFromJid } from '@protocol/jid'
import type {
    WaAppStateCollectionStateUpdate,
    WaAppStateCollectionStoreState,
    WaAppStateStore
} from '@store/contracts/appstate.store'
import { assertIqResult } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'
import { decodeProtoBytes } from '@util/bytes'
import { bytesToHex, uint8Equal } from '@util/bytes'
import { longToNumber } from '@util/primitives'

interface OutgoingPatchContext {
    readonly collection: AppStateCollectionName
    readonly patchVersion: number
    readonly nextHash: Uint8Array
    readonly nextIndexValueMap: Map<string, Uint8Array>
}

interface MacMutation {
    readonly operation: number
    readonly indexMac: Uint8Array
    readonly valueMac: Uint8Array
}

type DecryptedPatchMutation = WaAppStateMutation & { operationCode: number }

interface WaAppStateSyncClientOptions {
    readonly logger: Logger
    readonly query: (node: BinaryNode, timeoutMs: number) => Promise<BinaryNode>
    readonly store: WaAppStateStore
    readonly getCurrentMeJid?: () => string | null | undefined
    readonly hostDomain?: string
    readonly defaultTimeoutMs?: number
    readonly onMissingKeys?: (event: WaAppStateMissingKeysEvent) => Promise<void>
}

export class WaAppStateMissingKeyError extends Error {
    public readonly keyId: Uint8Array | null
    public readonly collection: AppStateCollectionName

    public constructor(
        message: string,
        keyId: Uint8Array | null,
        collection: AppStateCollectionName
    ) {
        super(message)
        this.keyId = keyId
        this.collection = collection
        this.name = 'WaAppStateMissingKeyError'
    }
}

export class WaAppStateSyncClient {
    private readonly logger: Logger
    private readonly query: (node: BinaryNode, timeoutMs: number) => Promise<BinaryNode>
    private readonly store: WaAppStateStore
    private readonly getCurrentMeJid?: () => string | null | undefined
    private readonly hostDomain: string
    private readonly defaultTimeoutMs: number
    private readonly onMissingKeys?: (event: WaAppStateMissingKeysEvent) => Promise<void>
    private readonly crypto: WaAppStateCrypto
    private syncContext: {
        readonly keys: Map<string, Uint8Array | null>
        readonly collections: Map<AppStateCollectionName, WaAppStateCollectionStoreState>
        readonly dirtyCollections: Set<AppStateCollectionName>
    } | null
    private syncPromise: Promise<WaAppStateSyncResult> | null

    public constructor(options: WaAppStateSyncClientOptions) {
        this.logger = options.logger
        this.query = options.query
        this.store = options.store
        this.getCurrentMeJid = options.getCurrentMeJid
        this.hostDomain = options.hostDomain ?? WA_DEFAULTS.HOST_DOMAIN
        this.defaultTimeoutMs = options.defaultTimeoutMs ?? WA_DEFAULTS.APP_STATE_SYNC_TIMEOUT_MS
        this.onMissingKeys = options.onMissingKeys

        this.crypto = new WaAppStateCrypto()
        this.syncContext = null
        this.syncPromise = null
    }

    public async exportState(): Promise<WaAppStateStoreData> {
        this.logger.trace('app-state export requested')
        return this.store.exportData()
    }

    public async importSyncKeys(keys: readonly WaAppStateSyncKey[]): Promise<number> {
        this.logger.debug('app-state importing sync keys', { count: keys.length })
        const inserted = await this.store.upsertSyncKeys(keys)
        if (inserted > 0) {
            this.crypto.clearCache()
            this.logger.info('app-state sync keys persisted', { inserted })
        }
        return inserted
    }

    public async importSyncKeyShare(share: Proto.Message.IAppStateSyncKeyShare): Promise<number> {
        const keys: WaAppStateSyncKey[] = []
        for (const item of share.keys ?? []) {
            const keyId = decodeProtoBytes(
                item.keyId?.keyId,
                'appStateSyncKeyShare.keys[].keyId.keyId'
            )
            if (!item.keyData?.keyData) {
                this.logger.debug('app-state sync key share entry missing key data', {
                    keyId: bytesToHex(keyId)
                })
                continue
            }
            const keyData = decodeProtoBytes(
                item.keyData?.keyData,
                'appStateSyncKeyShare.keys[].keyData.keyData'
            )
            keys.push({
                keyId,
                keyData,
                timestamp:
                    item.keyData?.timestamp === null || item.keyData?.timestamp === undefined
                        ? Date.now()
                        : this.normalizeProtoLong(
                              item.keyData?.timestamp,
                              'appStateSyncKeyShare.keys[].keyData.timestamp'
                          ),
                fingerprint: item.keyData?.fingerprint ?? undefined
            })
        }
        return this.importSyncKeys(keys)
    }

    public async sync(options: WaAppStateSyncOptions = {}): Promise<WaAppStateSyncResult> {
        if (this.syncPromise) {
            this.logger.debug('app-state sync already in flight, joining existing run')
            return this.syncPromise
        }
        const inFlight = this.syncOnce(options)
        this.syncPromise = inFlight
        try {
            return await inFlight
        } finally {
            if (this.syncPromise === inFlight) {
                this.syncPromise = null
            }
        }
    }

    private async syncOnce(options: WaAppStateSyncOptions = {}): Promise<WaAppStateSyncResult> {
        const context = {
            keys: new Map<string, Uint8Array | null>(),
            collections: new Map<AppStateCollectionName, WaAppStateCollectionStoreState>(),
            dirtyCollections: new Set<AppStateCollectionName>()
        }
        this.syncContext = context
        const collections = [
            ...new Set<AppStateCollectionName>(options.collections ?? APP_STATE_DEFAULT_COLLECTIONS)
        ]
        try {
            const initialCollectionStates = await this.store.getCollectionStates(collections)
            for (let index = 0; index < collections.length; index += 1) {
                context.collections.set(collections[index], initialCollectionStates[index])
            }

            this.logger.info('app-state sync start', {
                collections: collections.length,
                pendingMutations: options.pendingMutations?.length ?? 0
            })
            const pendingByCollection = this.groupPendingMutations(options.pendingMutations ?? [])
            const resultMap = new Map<AppStateCollectionName, WaAppStateCollectionSyncResult>()
            let stateChanged = false
            let collectionsToSync = [...collections]
            const missingKeysHandler = options.onMissingKeys ?? this.onMissingKeys
            const maxSyncIterations = 5
            let syncIteration = 0

            while (collectionsToSync.length > 0) {
                syncIteration += 1
                if (syncIteration > maxSyncIterations) {
                    this.logger.warn('app-state sync reached max iterations', {
                        maxSyncIterations,
                        remainingCollections: collectionsToSync
                    })
                    for (const collection of collectionsToSync) {
                        resultMap.set(collection, {
                            collection,
                            state: WA_APP_STATE_COLLECTION_STATES.ERROR_RETRY
                        })
                    }
                    break
                }

                const round = await this.syncCollectionsRound(
                    collectionsToSync,
                    pendingByCollection,
                    options
                )
                stateChanged = stateChanged || round.stateChanged
                for (const result of round.results) {
                    resultMap.set(result.collection, result)
                }
                if (
                    missingKeysHandler &&
                    round.missingKeyIds.length > 0 &&
                    round.blockedCollections.length > 0
                ) {
                    await this.notifyMissingKeys({
                        onMissingKeys: missingKeysHandler,
                        keyIds: round.missingKeyIds,
                        collections: round.blockedCollections
                    })
                }

                collectionsToSync = [...round.collectionsToRefetch]
                if (collectionsToSync.length > 0) {
                    this.logger.debug('app-state scheduling refetch for collections', {
                        iteration: syncIteration,
                        collections: collectionsToSync
                    })
                }
            }

            if (stateChanged && context.dirtyCollections.size > 0) {
                await this.persistCollectionUpdates()
                this.logger.info('app-state sync persisted updated state')
            }

            const orderedResults = collections.map(
                (collection) =>
                    resultMap.get(collection) ?? {
                        collection,
                        state: WA_APP_STATE_COLLECTION_STATES.ERROR_RETRY
                    }
            )

            this.logger.info('app-state sync finished', {
                collections: orderedResults.length,
                stateChanged
            })
            return { collections: orderedResults }
        } finally {
            if (this.syncContext === context) {
                this.syncContext = null
            }
        }
    }

    private async syncCollectionsRound(
        collections: readonly AppStateCollectionName[],
        pendingByCollection: ReadonlyMap<
            AppStateCollectionName,
            readonly WaAppStateMutationInput[]
        >,
        options: WaAppStateSyncOptions
    ): Promise<{
        readonly results: readonly WaAppStateCollectionSyncResult[]
        readonly collectionsToRefetch: readonly AppStateCollectionName[]
        readonly stateChanged: boolean
        readonly missingKeyIds: readonly Uint8Array[]
        readonly blockedCollections: readonly AppStateCollectionName[]
    }> {
        const activeSyncKey = await this.store.getActiveSyncKey()
        const requestPromises: ReturnType<typeof this.buildCollectionSyncRequest>[] = new Array(
            collections.length
        )
        for (let index = 0; index < collections.length; index += 1) {
            requestPromises[index] = this.buildCollectionSyncRequest(
                collections[index],
                pendingByCollection,
                activeSyncKey
            )
        }
        const requests = await Promise.all(requestPromises)
        const collectionNodes: BinaryNode[] = new Array(requests.length)
        const outgoingContexts = new Map<AppStateCollectionName, OutgoingPatchContext>()
        const skippedUploadCollections = new Set<AppStateCollectionName>()
        for (let index = 0; index < requests.length; index += 1) {
            const request = requests[index]
            collectionNodes[index] = request.node
            if (request.outgoingContext) {
                outgoingContexts.set(request.collection, request.outgoingContext)
            }
            if (request.skippedUpload) {
                skippedUploadCollections.add(request.collection)
            }
        }
        const iqNode = this.buildSyncIqNode(collectionNodes)
        const payloadByCollection = await this.fetchSyncPayloadByCollection(
            iqNode,
            options.timeoutMs ?? this.defaultTimeoutMs
        )
        const collectionOutcomePromises: ReturnType<typeof this.processCollectionRound>[] =
            new Array(collections.length)
        for (let index = 0; index < collections.length; index += 1) {
            collectionOutcomePromises[index] = this.processCollectionRound({
                collection: collections[index],
                payloadByCollection,
                pendingByCollection,
                options,
                outgoingContexts,
                skippedUploadCollections
            })
        }
        const collectionOutcomes = await Promise.all(collectionOutcomePromises)
        const results: WaAppStateCollectionSyncResult[] = []
        const collectionsToRefetch: AppStateCollectionName[] = []
        const blockedCollections: AppStateCollectionName[] = []
        const missingKeyIds: Uint8Array[] = []
        const missingKeyIdHexes = new Set<string>()
        let stateChanged = false
        for (let index = 0; index < collectionOutcomes.length; index += 1) {
            const entry = collectionOutcomes[index]
            results.push(entry.result)
            if (entry.shouldRefetch) {
                collectionsToRefetch.push(entry.collection)
            }
            if (entry.stateChanged) {
                stateChanged = true
            }
            if (entry.result.state === WA_APP_STATE_COLLECTION_STATES.BLOCKED) {
                blockedCollections.push(entry.collection)
            }
            if (entry.missingKeyId) {
                const keyHex = bytesToHex(entry.missingKeyId)
                if (!missingKeyIdHexes.has(keyHex)) {
                    missingKeyIdHexes.add(keyHex)
                    missingKeyIds.push(entry.missingKeyId)
                }
            }
        }
        return {
            results,
            collectionsToRefetch,
            stateChanged,
            missingKeyIds,
            blockedCollections
        }
    }

    private async buildCollectionSyncRequest(
        collection: AppStateCollectionName,
        pendingByCollection: ReadonlyMap<
            AppStateCollectionName,
            readonly WaAppStateMutationInput[]
        >,
        activeSyncKey: WaAppStateSyncKey | null
    ): Promise<{
        readonly collection: AppStateCollectionName
        readonly node: BinaryNode
        readonly outgoingContext?: OutgoingPatchContext
        readonly skippedUpload: boolean
    }> {
        const collectionState = await this.getCollectionState(collection)
        const hasPersistedState = collectionState.initialized
        const attrs: Record<string, string> = {
            name: collection,
            version: String(
                hasPersistedState ? collectionState.version : APP_STATE_DEFAULT_COLLECTION_VERSION
            ),
            return_snapshot: hasPersistedState ? 'false' : 'true'
        }

        const children: BinaryNode[] = []
        const pendingMutations = pendingByCollection.get(collection) ?? []
        let outgoingContext: OutgoingPatchContext | undefined
        let skippedUpload = false
        if (pendingMutations.length > 0) {
            if (!hasPersistedState) {
                skippedUpload = true
                this.logger.debug(
                    'app-state skipped outgoing patch upload until snapshot bootstrap',
                    {
                        collection,
                        pendingMutations: pendingMutations.length
                    }
                )
            } else {
                const outgoing = await this.buildOutgoingPatch(
                    collection,
                    collectionState,
                    pendingMutations,
                    activeSyncKey
                )
                outgoingContext = outgoing.context
                children.push({
                    tag: WA_NODE_TAGS.PATCH,
                    attrs: {},
                    content: outgoing.encodedPatch
                })
            }
        }

        return {
            collection,
            outgoingContext,
            skippedUpload,
            node: {
                tag: WA_NODE_TAGS.COLLECTION,
                attrs,
                content: children.length > 0 ? children : undefined
            }
        }
    }

    private buildSyncIqNode(collectionNodes: readonly BinaryNode[]): BinaryNode {
        return {
            tag: WA_NODE_TAGS.IQ,
            attrs: {
                to: this.hostDomain,
                type: WA_IQ_TYPES.SET,
                xmlns: WA_XMLNS.APP_STATE_SYNC
            },
            content: [
                {
                    tag: WA_NODE_TAGS.SYNC,
                    attrs: {},
                    content: collectionNodes
                }
            ]
        }
    }

    private async fetchSyncPayloadByCollection(
        iqNode: BinaryNode,
        timeoutMs: number
    ): Promise<Map<AppStateCollectionName, CollectionResponsePayload>> {
        const responseNode = await this.query(iqNode, timeoutMs)
        this.logger.debug('app-state sync iq response received', {
            tag: responseNode.tag,
            type: responseNode.attrs.type
        })
        assertIqResult(responseNode, 'app-state sync')
        const payloads = parseSyncResponse(responseNode)
        this.logger.debug('app-state sync payloads parsed', { count: payloads.length })
        const payloadByCollection = new Map<AppStateCollectionName, CollectionResponsePayload>()
        for (const payload of payloads) {
            payloadByCollection.set(payload.collection, payload)
        }
        return payloadByCollection
    }

    private async processCollectionRound({
        collection,
        payloadByCollection,
        pendingByCollection,
        options,
        outgoingContexts,
        skippedUploadCollections
    }: {
        readonly collection: AppStateCollectionName
        readonly payloadByCollection: ReadonlyMap<AppStateCollectionName, CollectionResponsePayload>
        readonly pendingByCollection: ReadonlyMap<
            AppStateCollectionName,
            readonly WaAppStateMutationInput[]
        >
        readonly options: WaAppStateSyncOptions
        readonly outgoingContexts: ReadonlyMap<AppStateCollectionName, OutgoingPatchContext>
        readonly skippedUploadCollections: ReadonlySet<AppStateCollectionName>
    }): Promise<{
        readonly collection: AppStateCollectionName
        readonly shouldRefetch: boolean
        readonly stateChanged: boolean
        readonly result: WaAppStateCollectionSyncResult
        readonly missingKeyId: Uint8Array | null
    }> {
        const payload = payloadByCollection.get(collection)
        let shouldRefetch = false
        let collectionStateChanged = false

        if (!payload) {
            this.logger.warn('app-state sync response missing collection payload', { collection })
            return this.createCollectionOutcome(
                collection,
                WA_APP_STATE_COLLECTION_STATES.ERROR_RETRY
            )
        }

        if (
            payload.state === WA_APP_STATE_COLLECTION_STATES.ERROR_FATAL ||
            payload.state === WA_APP_STATE_COLLECTION_STATES.ERROR_RETRY
        ) {
            return this.createCollectionOutcome(collection, payload.state, payload.version)
        }

        const pendingMutationsCount = pendingByCollection.get(collection)?.length ?? 0
        if (
            payload.state === WA_APP_STATE_COLLECTION_STATES.CONFLICT ||
            payload.state === WA_APP_STATE_COLLECTION_STATES.CONFLICT_HAS_MORE
        ) {
            shouldRefetch =
                payload.state === WA_APP_STATE_COLLECTION_STATES.CONFLICT_HAS_MORE ||
                pendingMutationsCount > 0
            return this.createCollectionOutcome(
                collection,
                payload.state === WA_APP_STATE_COLLECTION_STATES.CONFLICT
                    ? pendingMutationsCount > 0
                        ? WA_APP_STATE_COLLECTION_STATES.CONFLICT
                        : WA_APP_STATE_COLLECTION_STATES.SUCCESS
                    : payload.state,
                payload.version,
                shouldRefetch
            )
        }

        try {
            let appliedMutations: WaAppStateMutation[] = []
            if (payload.snapshotReference) {
                const downloader = options.downloadExternalBlob
                if (!downloader) {
                    throw new Error(
                        `snapshot for ${payload.collection} requires external blob downloader`
                    )
                }
                const snapshotBytes = await downloader(
                    payload.collection,
                    'snapshot',
                    payload.snapshotReference
                )
                const snapshot = this.validateSnapshot(
                    payload.collection,
                    proto.SyncdSnapshot.decode(snapshotBytes)
                )
                const snapshotMutations = await this.applySnapshot(payload.collection, snapshot)
                appliedMutations = appliedMutations.concat(snapshotMutations)
                collectionStateChanged = true
            }

            if (payload.patches.length > 0) {
                const readyPatches = await this.resolveReadyPatches(payload, options)
                for (const readyPatch of readyPatches) {
                    const patchMutations = await this.applyPatch(payload.collection, readyPatch)
                    appliedMutations = appliedMutations.concat(patchMutations)
                    collectionStateChanged = true
                }
            } else {
                const outgoingContext = outgoingContexts.get(payload.collection)
                if (
                    outgoingContext &&
                    payload.state === WA_APP_STATE_COLLECTION_STATES.SUCCESS &&
                    payload.version === outgoingContext.patchVersion
                ) {
                    this.setCollectionState(
                        payload.collection,
                        outgoingContext.patchVersion,
                        outgoingContext.nextHash,
                        outgoingContext.nextIndexValueMap
                    )
                    collectionStateChanged = true
                }
            }

            const currentCollectionState = await this.getCollectionState(collection)
            if (
                !currentCollectionState.initialized &&
                payload.state === WA_APP_STATE_COLLECTION_STATES.SUCCESS
            ) {
                this.setCollectionState(
                    collection,
                    payload.version ?? currentCollectionState.version,
                    currentCollectionState.hash,
                    currentCollectionState.indexValueMap
                )
                collectionStateChanged = true
            }

            shouldRefetch =
                shouldRefetch ||
                payload.state === WA_APP_STATE_COLLECTION_STATES.SUCCESS_HAS_MORE ||
                (payload.state === WA_APP_STATE_COLLECTION_STATES.SUCCESS &&
                    skippedUploadCollections.has(collection))

            this.logger.debug('app-state collection processed', {
                collection: payload.collection,
                state: payload.state,
                version: payload.version,
                appliedMutations: appliedMutations.length
            })
            return this.createCollectionOutcome(
                collection,
                payload.state,
                payload.version,
                shouldRefetch,
                collectionStateChanged,
                appliedMutations
            )
        } catch (error) {
            if (error instanceof WaAppStateMissingKeyError) {
                this.logger.warn('app-state blocked by missing key', {
                    collection: payload.collection,
                    message: error.message
                })
                return this.createCollectionOutcome(
                    collection,
                    WA_APP_STATE_COLLECTION_STATES.BLOCKED,
                    payload.version,
                    shouldRefetch,
                    collectionStateChanged,
                    undefined,
                    error.keyId
                )
            }
            const message = error instanceof Error ? error.message : String(error)
            this.logger.warn('app-state collection processing failed', {
                collection: payload.collection,
                message
            })
            return this.createCollectionOutcome(
                collection,
                WA_APP_STATE_COLLECTION_STATES.ERROR_RETRY,
                payload.version,
                true,
                collectionStateChanged
            )
        }
    }

    private createCollectionOutcome(
        collection: AppStateCollectionName,
        state: WaAppStateCollectionSyncResult['state'],
        version?: number,
        shouldRefetch = false,
        stateChanged = false,
        mutations?: readonly WaAppStateMutation[],
        missingKeyId: Uint8Array | null = null
    ): {
        readonly collection: AppStateCollectionName
        readonly shouldRefetch: boolean
        readonly stateChanged: boolean
        readonly result: WaAppStateCollectionSyncResult
        readonly missingKeyId: Uint8Array | null
    } {
        return {
            collection,
            shouldRefetch,
            stateChanged,
            missingKeyId,
            result: {
                collection,
                state,
                version,
                ...(mutations ? { mutations } : {})
            }
        }
    }

    private async notifyMissingKeys(input: {
        readonly onMissingKeys: (event: WaAppStateMissingKeysEvent) => Promise<void>
        readonly keyIds: readonly Uint8Array[]
        readonly collections: readonly AppStateCollectionName[]
    }): Promise<void> {
        const keyIds = input.keyIds
        const collections = input.collections
        if (keyIds.length === 0 || collections.length === 0) {
            return
        }

        const keyIdsHex = keyIds.map((keyId) => bytesToHex(keyId))
        this.logger.info('app-state requesting missing sync keys', {
            keys: keyIdsHex.length,
            keyIds: keyIdsHex.join(','),
            collections: collections.join(',')
        })

        try {
            await input.onMissingKeys({
                keyIds,
                collections
            })
        } catch (error) {
            this.logger.warn('app-state missing key callback failed', {
                keys: keyIdsHex.length,
                collections: collections.join(','),
                message: error instanceof Error ? error.message : String(error)
            })
        }
    }

    private async resolveReadyPatches(
        payload: CollectionResponsePayload,
        options: WaAppStateSyncOptions
    ): Promise<readonly Proto.ISyncdPatch[]> {
        const sortedPatches = payload.patches
            .map((patch) => ({
                patch,
                sortVersion: this.parseCollectionPatchVersion(payload.collection, patch)
            }))
            .sort((left, right) => left.sortVersion - right.sortVersion)
            .map((entry) => entry.patch)

        return Promise.all(
            sortedPatches.map(async (patch) => {
                let readyPatch = patch
                if (
                    (!readyPatch.mutations || readyPatch.mutations.length === 0) &&
                    readyPatch.externalMutations
                ) {
                    const downloader = options.downloadExternalBlob
                    if (!downloader) {
                        throw new Error(
                            `external patch for ${payload.collection} requires external blob downloader`
                        )
                    }
                    const patchBytes = await downloader(
                        payload.collection,
                        'patch',
                        readyPatch.externalMutations
                    )
                    const decodedMutations = proto.SyncdMutations.decode(patchBytes)
                    readyPatch = {
                        ...readyPatch,
                        mutations: decodedMutations.mutations ?? []
                    }
                }
                return this.validatePatch(payload.collection, readyPatch)
            })
        )
    }

    private validateSnapshot(
        collection: AppStateCollectionName,
        snapshot: Proto.ISyncdSnapshot
    ): Proto.ISyncdSnapshot {
        if (!snapshot.version?.version) {
            throw new Error(`snapshot for ${collection} is missing version`)
        }
        if (!snapshot.mac) {
            throw new Error(`snapshot for ${collection} is missing mac`)
        }
        if (!snapshot.keyId?.id) {
            throw new Error(`snapshot for ${collection} is missing keyId`)
        }
        return snapshot
    }

    private parseCollectionPatchVersion(
        collection: AppStateCollectionName,
        patch: Proto.ISyncdPatch
    ): number {
        const parsed = this.normalizeProtoLong(
            patch.version?.version,
            `patch.version.version (${collection})`
        )
        if (!Number.isSafeInteger(parsed) || parsed <= 0) {
            throw new Error(`patch for ${collection} has invalid version ${parsed}`)
        }
        return parsed
    }

    private validatePatch(
        collection: AppStateCollectionName,
        patch: Proto.ISyncdPatch
    ): Proto.ISyncdPatch {
        if (!patch.version?.version) {
            throw new Error(`patch for ${collection} is missing version`)
        }
        if (!patch.snapshotMac) {
            throw new Error(`patch for ${collection} is missing snapshotMac`)
        }
        if (!patch.patchMac) {
            throw new Error(`patch for ${collection} is missing patchMac`)
        }
        if (!patch.keyId?.id) {
            throw new Error(`patch for ${collection} is missing keyId`)
        }
        if (patch.mutations && patch.mutations.length > 0 && patch.externalMutations) {
            throw new Error(`patch for ${collection} has inline and external mutations together`)
        }
        if (
            patch.exitCode?.code !== null &&
            patch.exitCode?.code !== undefined &&
            patch.exitCode.code !== 0
        ) {
            throw new Error(
                `patch for ${collection} has terminal exitCode ${patch.exitCode.code}: ${patch.exitCode.text ?? ''}`
            )
        }
        return patch
    }

    private async applySnapshot(
        collection: AppStateCollectionName,
        snapshot: Proto.ISyncdSnapshot
    ): Promise<WaAppStateMutation[]> {
        const version = this.normalizeProtoLong(
            snapshot.version?.version,
            `snapshot.version.version (${collection})`
        )
        const keyId = decodeProtoBytes(snapshot.keyId?.id, `snapshot.keyId.id (${collection})`)
        const keyData = await this.getKeyData(keyId)
        if (!keyData) {
            throw new WaAppStateMissingKeyError(
                `missing snapshot key ${bytesToHex(keyId)} for ${collection}`,
                keyId,
                collection
            )
        }

        const indexValueMap = new Map<string, Uint8Array>()
        const mutations: WaAppStateMutation[] = []
        const decryptedRecords = await this.decryptSnapshotRecords(collection, snapshot)
        for (const { decrypted, recordKeyId } of decryptedRecords) {
            const indexMacHex = bytesToHex(decrypted.indexMac)
            indexValueMap.set(indexMacHex, decrypted.valueMac)
            mutations.push({
                collection,
                operation: 'set',
                source: 'snapshot',
                index: decrypted.index,
                value: decrypted.value,
                version: decrypted.version,
                indexMac: decrypted.indexMac,
                valueMac: decrypted.valueMac,
                keyId: recordKeyId,
                timestamp: this.normalizeProtoLong(
                    decrypted.value?.timestamp,
                    `snapshot.record.value.timestamp (${collection})`
                )
            })
        }

        const ltHash = await this.crypto.ltHashAdd(
            APP_STATE_EMPTY_LT_HASH,
            Array.from(indexValueMap.values())
        )
        const expectedSnapshotMac = await this.crypto.generateSnapshotMac(
            keyData,
            ltHash,
            version,
            collection
        )
        if (!uint8Equal(expectedSnapshotMac, snapshot.mac as Uint8Array)) {
            throw new Error(`snapshot MAC mismatch for ${collection}`)
        }
        this.setCollectionState(collection, version, ltHash, indexValueMap)
        return mutations
    }

    private async applyPatch(
        collection: AppStateCollectionName,
        patch: Proto.ISyncdPatch
    ): Promise<WaAppStateMutation[]> {
        const patchVersion = this.normalizeProtoLong(
            patch.version?.version,
            `patch.version.version (${collection})`
        )
        const current = await this.getCollectionState(collection)
        if (current.version !== patchVersion - 1) {
            throw new Error(
                `patch version mismatch for ${collection}: local=${current.version}, incoming=${patchVersion}`
            )
        }

        const patchKeyId = decodeProtoBytes(patch.keyId?.id, `patch.keyId.id (${collection})`)
        const patchKeyData = await this.getKeyData(patchKeyId)
        if (!patchKeyData) {
            throw new WaAppStateMissingKeyError(
                `missing patch key ${bytesToHex(patchKeyId)} for ${collection}`,
                patchKeyId,
                collection
            )
        }

        const decryptedMutations = await this.decryptPatchMutations(collection, patch)
        const macMutations: MacMutation[] = new Array(decryptedMutations.length)
        const valueMacs: Uint8Array[] = new Array(decryptedMutations.length)
        for (let index = 0; index < decryptedMutations.length; index += 1) {
            const mutation = decryptedMutations[index]
            valueMacs[index] = mutation.valueMac
            macMutations[index] = {
                operation: mutation.operationCode,
                indexMac: mutation.indexMac,
                valueMac: mutation.valueMac
            }
        }
        const nextState = await this.computeNextCollectionState(
            current.hash,
            current.indexValueMap,
            macMutations,
            collection
        )
        await this.assertPatchMacsMatch(
            patch,
            collection,
            patchKeyData,
            patchVersion,
            nextState.hash,
            valueMacs
        )
        this.setCollectionState(collection, patchVersion, nextState.hash, nextState.indexValueMap)
        return decryptedMutations.slice()
    }

    private async decryptSnapshotRecords(
        collection: AppStateCollectionName,
        snapshot: Proto.ISyncdSnapshot
    ): Promise<
        readonly {
            readonly decrypted: Awaited<ReturnType<WaAppStateCrypto['decryptMutation']>>
            readonly recordKeyId: Uint8Array
        }[]
    > {
        const records = (snapshot.records ?? []).map((record) => ({
            indexMac: decodeProtoBytes(
                record.index?.blob,
                `snapshot.record.index.blob (${collection})`
            ),
            valueBlob: decodeProtoBytes(
                record.value?.blob,
                `snapshot.record.value.blob (${collection})`
            ),
            recordKeyId: decodeProtoBytes(
                record.keyId?.id,
                `snapshot.record.keyId.id (${collection})`
            )
        }))
        await this.preloadKeyData(records.map((record) => record.recordKeyId))

        return Promise.all(
            records.map(async ({ indexMac, valueBlob, recordKeyId }) => {
                const recordKeyData = await this.getKeyData(recordKeyId)
                if (!recordKeyData) {
                    throw new WaAppStateMissingKeyError(
                        `missing snapshot mutation key ${bytesToHex(recordKeyId)} for ${collection}`,
                        recordKeyId,
                        collection
                    )
                }
                const decrypted = await this.crypto.decryptMutation({
                    operation: proto.SyncdMutation.SyncdOperation.SET,
                    keyId: recordKeyId,
                    keyData: recordKeyData,
                    indexMac,
                    valueBlob
                })
                return {
                    decrypted,
                    recordKeyId
                }
            })
        )
    }

    private async decryptPatchMutations(
        collection: AppStateCollectionName,
        patch: Proto.ISyncdPatch
    ): Promise<readonly DecryptedPatchMutation[]> {
        const parsedMutations = (patch.mutations ?? []).map((mutation) => {
            const operationCode = mutation.operation
            if (operationCode === null || operationCode === undefined) {
                throw new Error(`patch mutation is missing operation (${collection})`)
            }
            const record = mutation.record
            if (!record) {
                throw new Error(`patch mutation is missing record (${collection})`)
            }
            return {
                operationCode,
                indexMac: decodeProtoBytes(
                    record.index?.blob,
                    `patch.record.index.blob (${collection})`
                ),
                valueBlob: decodeProtoBytes(
                    record.value?.blob,
                    `patch.record.value.blob (${collection})`
                ),
                recordKeyId: decodeProtoBytes(
                    record.keyId?.id,
                    `patch.record.keyId.id (${collection})`
                )
            }
        })
        await this.preloadKeyData(parsedMutations.map((mutation) => mutation.recordKeyId))

        return Promise.all(
            parsedMutations.map(async ({ operationCode, indexMac, valueBlob, recordKeyId }) => {
                const recordKeyData = await this.getKeyData(recordKeyId)
                if (!recordKeyData) {
                    throw new WaAppStateMissingKeyError(
                        `missing mutation key ${bytesToHex(recordKeyId)} for ${collection}`,
                        recordKeyId,
                        collection
                    )
                }
                const decrypted = await this.crypto.decryptMutation({
                    operation: operationCode,
                    keyId: recordKeyId,
                    keyData: recordKeyData,
                    indexMac,
                    valueBlob
                })
                return {
                    collection,
                    operation:
                        operationCode === proto.SyncdMutation.SyncdOperation.REMOVE
                            ? 'remove'
                            : 'set',
                    source: 'patch',
                    operationCode,
                    index: decrypted.index,
                    value: decrypted.value,
                    version: decrypted.version,
                    indexMac: decrypted.indexMac,
                    valueMac: decrypted.valueMac,
                    keyId: recordKeyId,
                    timestamp: this.normalizeProtoLong(
                        decrypted.value?.timestamp,
                        `patch.record.value.timestamp (${collection})`
                    )
                }
            })
        )
    }

    private async assertPatchMacsMatch(
        patch: Proto.ISyncdPatch,
        collection: AppStateCollectionName,
        patchKeyData: Uint8Array,
        patchVersion: number,
        nextHash: Uint8Array,
        valueMacs: readonly Uint8Array[]
    ): Promise<void> {
        const snapshotMac = decodeProtoBytes(patch.snapshotMac, `patch.snapshotMac (${collection})`)
        const expectedSnapshotMac = await this.crypto.generateSnapshotMac(
            patchKeyData,
            nextHash,
            patchVersion,
            collection
        )
        if (!uint8Equal(expectedSnapshotMac, snapshotMac)) {
            throw new Error(`patch snapshot MAC mismatch for ${collection}`)
        }

        const patchMac = decodeProtoBytes(patch.patchMac, `patch.patchMac (${collection})`)
        const expectedPatchMac = await this.crypto.generatePatchMac(
            patchKeyData,
            snapshotMac,
            valueMacs,
            patchVersion,
            collection
        )
        if (!uint8Equal(expectedPatchMac, patchMac)) {
            throw new Error(`patch MAC mismatch for ${collection}`)
        }
    }

    private async buildOutgoingPatch(
        collection: AppStateCollectionName,
        snapshot: WaAppStateCollectionStoreState,
        pendingMutations: readonly WaAppStateMutationInput[],
        activeKey: WaAppStateSyncKey | null
    ): Promise<{ readonly encodedPatch: Uint8Array; readonly context: OutgoingPatchContext }> {
        if (!activeKey) {
            throw new WaAppStateMissingKeyError(
                `no sync key available to upload ${collection}`,
                null,
                collection
            )
        }

        const encryptedResults = await Promise.all(
            pendingMutations.map(async (mutation) => {
                const value = mutation.operation === 'set' ? mutation.value : mutation.previousValue
                const operationCode =
                    mutation.operation === 'remove'
                        ? proto.SyncdMutation.SyncdOperation.REMOVE
                        : proto.SyncdMutation.SyncdOperation.SET
                const encrypted = await this.crypto.encryptMutation({
                    operation: operationCode,
                    keyId: activeKey.keyId,
                    keyData: activeKey.keyData,
                    index: mutation.index,
                    value,
                    version: mutation.version
                })
                return { operationCode, encrypted }
            })
        )

        const encryptedMutations: Proto.ISyncdMutation[] = encryptedResults.map(
            ({ operationCode, encrypted }) => ({
                operation: operationCode,
                record: {
                    keyId: { id: activeKey.keyId },
                    index: { blob: encrypted.indexMac },
                    value: { blob: encrypted.valueBlob }
                }
            })
        )
        const macMutations: MacMutation[] = encryptedResults.map(
            ({ operationCode, encrypted }) => ({
                operation: operationCode,
                indexMac: encrypted.indexMac,
                valueMac: encrypted.valueMac
            })
        )

        const nextState = await this.computeNextCollectionState(
            snapshot.hash,
            snapshot.indexValueMap,
            macMutations,
            collection
        )
        const patchVersion = snapshot.version + 1
        const snapshotMac = await this.crypto.generateSnapshotMac(
            activeKey.keyData,
            nextState.hash,
            patchVersion,
            collection
        )
        const patchMac = await this.crypto.generatePatchMac(
            activeKey.keyData,
            snapshotMac,
            macMutations.map((item) => item.valueMac),
            patchVersion,
            collection
        )
        const deviceIndex = this.resolveDeviceIndex()
        const clientDebugData = this.buildPatchClientDebugData()

        const encodedPatch = proto.SyncdPatch.encode({
            mutations: encryptedMutations,
            snapshotMac,
            patchMac,
            keyId: { id: activeKey.keyId },
            ...(deviceIndex === undefined ? {} : { deviceIndex }),
            clientDebugData
        }).finish()

        return {
            encodedPatch,
            context: {
                collection,
                patchVersion,
                nextHash: nextState.hash,
                nextIndexValueMap: nextState.indexValueMap
            }
        }
    }

    private resolveDeviceIndex(): number | undefined {
        const meJid = this.getCurrentMeJid?.()
        if (!meJid) {
            return undefined
        }
        try {
            return parseSignalAddressFromJid(meJid).device
        } catch (error) {
            this.logger.debug('app-state could not parse device index from me jid', {
                meJid
            })
            void error
            return undefined
        }
    }

    private buildPatchClientDebugData(): Uint8Array {
        return proto.PatchDebugData.encode({
            isSenderPrimary: false,
            senderPlatform: proto.PatchDebugData.Platform.WEB
        }).finish()
    }

    private async computeNextCollectionState(
        baseHash: Uint8Array,
        baseMap: ReadonlyMap<string, Uint8Array>,
        mutations: readonly MacMutation[],
        collection: AppStateCollectionName
    ): Promise<{ readonly hash: Uint8Array; readonly indexValueMap: Map<string, Uint8Array> }> {
        const indexValueMap = new Map(baseMap)

        const addValues: Uint8Array[] = []
        const removeValues: Uint8Array[] = []
        let missingRemoveCount = 0
        for (const mutation of mutations) {
            const indexMacHex = bytesToHex(mutation.indexMac)
            const existing = indexValueMap.get(indexMacHex)
            if (mutation.operation === proto.SyncdMutation.SyncdOperation.REMOVE) {
                if (!existing) {
                    missingRemoveCount += 1
                    continue
                }
                indexValueMap.delete(indexMacHex)
                removeValues.push(existing)
                continue
            }

            if (existing) {
                removeValues.push(existing)
            }
            indexValueMap.set(indexMacHex, mutation.valueMac)
            addValues.push(mutation.valueMac)
        }
        if (missingRemoveCount > 0) {
            this.logger.warn('app-state mutation remove index mac not found', {
                collection,
                missingRemoveCount
            })
        }

        const nextHash = await this.crypto.ltHashSubtractThenAdd(baseHash, addValues, removeValues)
        return {
            hash: nextHash.hash,
            indexValueMap
        }
    }

    private normalizeProtoLong(value: unknown, field: string): number {
        try {
            return longToNumber(value as number | { toNumber(): number } | null | undefined)
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            throw new Error(`invalid ${field}: ${reason}`)
        }
    }

    private groupPendingMutations(
        pendingMutations: readonly WaAppStateMutationInput[]
    ): Map<AppStateCollectionName, readonly WaAppStateMutationInput[]> {
        const grouped = new Map<AppStateCollectionName, WaAppStateMutationInput[]>()
        for (const mutation of pendingMutations) {
            const list = grouped.get(mutation.collection)
            if (list) {
                list.push(mutation)
            } else {
                grouped.set(mutation.collection, [mutation])
            }
        }

        const compacted = new Map<AppStateCollectionName, readonly WaAppStateMutationInput[]>()
        for (const [collection, list] of grouped.entries()) {
            const seenIndexes = new Set<string>()
            const reversed: WaAppStateMutationInput[] = []
            for (let index = list.length - 1; index >= 0; index -= 1) {
                const mutation = list[index]
                if (seenIndexes.has(mutation.index)) {
                    continue
                }
                seenIndexes.add(mutation.index)
                reversed.push(mutation)
            }
            compacted.set(collection, reversed.reverse())
        }
        return compacted
    }

    private async preloadKeyData(keyIds: readonly Uint8Array[]): Promise<void> {
        if (keyIds.length === 0) {
            return
        }
        const context = this.requireSyncContext()
        const missingKeyIds: Uint8Array[] = []
        const missingKeyHexes = new Set<string>()
        for (let index = 0; index < keyIds.length; index += 1) {
            const keyId = keyIds[index]
            const keyHex = bytesToHex(keyId)
            if (context.keys.has(keyHex) || missingKeyHexes.has(keyHex)) {
                continue
            }
            missingKeyHexes.add(keyHex)
            missingKeyIds.push(keyId)
        }
        if (missingKeyIds.length === 0) {
            return
        }

        const loadedKeyData = await this.store.getSyncKeyDataBatch(missingKeyIds)
        for (let index = 0; index < missingKeyIds.length; index += 1) {
            context.keys.set(bytesToHex(missingKeyIds[index]), loadedKeyData[index] ?? null)
        }
    }

    private async getKeyData(keyId: Uint8Array): Promise<Uint8Array | null> {
        const context = this.requireSyncContext()
        const keyHex = bytesToHex(keyId)
        if (context.keys.has(keyHex)) {
            return context.keys.get(keyHex) ?? null
        }
        const value = await this.store.getSyncKeyData(keyId)
        context.keys.set(keyHex, value)
        return value
    }

    private async getCollectionState(
        collection: AppStateCollectionName
    ): Promise<WaAppStateCollectionStoreState> {
        const context = this.requireSyncContext()
        const cached = context.collections.get(collection)
        if (cached) {
            return cached
        }
        const state = await this.store.getCollectionState(collection)
        context.collections.set(collection, state)
        return state
    }

    private setCollectionState(
        collection: AppStateCollectionName,
        version: number,
        hash: Uint8Array,
        indexValueMap: ReadonlyMap<string, Uint8Array>
    ): void {
        const context = this.requireSyncContext()
        context.collections.set(collection, {
            initialized: true,
            version,
            hash,
            indexValueMap
        })
        context.dirtyCollections.add(collection)
    }

    private async persistCollectionUpdates(): Promise<void> {
        const context = this.requireSyncContext()
        const updates: WaAppStateCollectionStateUpdate[] = []
        for (const collection of context.dirtyCollections.values()) {
            const state = context.collections.get(collection)
            if (!state) {
                continue
            }
            updates.push({
                collection,
                version: state.version,
                hash: state.hash,
                indexValueMap: state.indexValueMap
            })
        }
        if (updates.length === 0) {
            return
        }
        await this.store.setCollectionStates(updates)
    }

    private requireSyncContext(): NonNullable<WaAppStateSyncClient['syncContext']> {
        if (!this.syncContext) {
            throw new Error('app-state sync context is not initialized')
        }
        return this.syncContext
    }
}
