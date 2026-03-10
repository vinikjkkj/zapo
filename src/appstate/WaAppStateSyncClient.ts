import type { Logger } from '../infra/log/types'
import { proto } from '../proto'
import type { Proto } from '../proto'
import {
    WA_APP_STATE_COLLECTION_STATES,
    WA_APP_STATE_ERROR_CODES,
    WA_DEFAULTS,
    WA_IQ_TYPES,
    WA_NODE_TAGS,
    WA_XMLNS
} from '../protocol/constants'
import {
    decodeBinaryNodeContent,
    findNodeChild,
    getNodeChildrenByTag
} from '../transport/node/helpers'
import type { BinaryNode } from '../transport/types'
import { decodeProtoBytes } from '../util/base64'
import { cloneBytes, uint8Equal } from '../util/bytes'
import { longToNumber } from '../util/primitives'

import {
    APP_STATE_DEFAULT_COLLECTIONS,
    APP_STATE_EMPTY_LT_HASH
} from './constants'
import type {
    AppStateCollectionName,
    AppStateCollectionState,
    WaAppStateCollectionSyncResult,
    WaAppStateMutation,
    WaAppStateMutationInput,
    WaAppStateSyncOptions,
    WaAppStateStoreData,
    WaAppStateSyncResult,
    WaAppStateSyncKey
} from './types'
import { keyIdToHex, parseCollectionName } from './utils'
import { WaAppStateCrypto } from './WaAppStateCrypto'
import { WaAppStateState } from './WaAppStateState'

class WaAppStateMissingKeyError extends Error {
    public constructor(message: string) {
        super(message)
        this.name = 'WaAppStateMissingKeyError'
    }
}

interface CollectionResponsePayload {
    readonly collection: AppStateCollectionName
    readonly state: AppStateCollectionState
    readonly version?: number
    readonly patches: readonly Proto.ISyncdPatch[]
    readonly snapshotReference?: Proto.IExternalBlobReference
}

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

interface WaAppStateSyncClientOptions {
    readonly logger: Logger
    readonly query: (node: BinaryNode, timeoutMs: number) => Promise<BinaryNode>
    readonly getPersistedAppState: () => WaAppStateStoreData | undefined
    readonly persistAppState: (next: WaAppStateStoreData) => Promise<void>
    readonly hostDomain?: string
    readonly defaultTimeoutMs?: number
}

export class WaAppStateSyncClient {
    private readonly logger: Logger
    private readonly query: (node: BinaryNode, timeoutMs: number) => Promise<BinaryNode>
    private readonly getPersistedAppState: () => WaAppStateStoreData | undefined
    private readonly persistAppState: (next: WaAppStateStoreData) => Promise<void>
    private readonly hostDomain: string
    private readonly defaultTimeoutMs: number
    private readonly state: WaAppStateState
    private readonly crypto: WaAppStateCrypto

    public constructor(options: WaAppStateSyncClientOptions) {
        this.logger = options.logger
        this.query = options.query
        this.getPersistedAppState = options.getPersistedAppState
        this.persistAppState = options.persistAppState
        this.hostDomain = options.hostDomain ?? WA_DEFAULTS.HOST_DOMAIN
        this.defaultTimeoutMs = options.defaultTimeoutMs ?? WA_DEFAULTS.APP_STATE_SYNC_TIMEOUT_MS

        this.state = new WaAppStateState(options.getPersistedAppState())
        this.crypto = new WaAppStateCrypto()
    }

    public exportState(): WaAppStateStoreData {
        this.reloadPersistedState()
        this.logger.trace('app-state export requested')
        return this.state.export()
    }

    public async importSyncKeys(keys: readonly WaAppStateSyncKey[]): Promise<number> {
        this.reloadPersistedState()
        this.logger.debug('app-state importing sync keys', { count: keys.length })
        const inserted = this.state.upsertKeys(keys)
        if (inserted > 0) {
            await this.persistAppState(this.state.export())
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
            const keyData = decodeProtoBytes(
                item.keyData?.keyData,
                'appStateSyncKeyShare.keys[].keyData.keyData'
            )
            keys.push({
                keyId,
                keyData,
                timestamp: longToNumber(
                    item.keyData?.timestamp as number | { toNumber(): number } | null | undefined
                ),
                fingerprint: item.keyData?.fingerprint ?? undefined
            })
        }
        return this.importSyncKeys(keys)
    }

    public async sync(options: WaAppStateSyncOptions = {}): Promise<WaAppStateSyncResult> {
        this.reloadPersistedState()
        const collections = this.normalizeCollections(
            options.collections ?? APP_STATE_DEFAULT_COLLECTIONS
        )
        this.logger.info('app-state sync start', {
            collections: collections.length,
            pendingMutations: options.pendingMutations?.length ?? 0
        })
        const pendingByCollection = this.groupPendingMutations(options.pendingMutations ?? [])
        const outgoingContexts = new Map<AppStateCollectionName, OutgoingPatchContext>()

        const collectionNodes: BinaryNode[] = []
        for (const collection of collections) {
            const collectionState = this.state.getCollectionSnapshot(collection)
            const attrs: Record<string, string> = {
                name: collection
            }
            if (collectionState.version > 0) {
                attrs.version = String(collectionState.version)
            } else {
                attrs.return_snapshot = 'true'
            }

            const children: BinaryNode[] = []
            const pendingMutations = pendingByCollection.get(collection) ?? []
            if (pendingMutations.length > 0) {
                const outgoing = await this.buildOutgoingPatch(
                    collection,
                    collectionState,
                    pendingMutations
                )
                outgoingContexts.set(collection, outgoing.context)
                children.push({
                    tag: WA_NODE_TAGS.PATCH,
                    attrs: {},
                    content: outgoing.encodedPatch
                })
            }

            collectionNodes.push({
                tag: WA_NODE_TAGS.COLLECTION,
                attrs,
                content: children.length > 0 ? children : undefined
            })
        }

        const iqNode: BinaryNode = {
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

        const responseNode = await this.query(iqNode, options.timeoutMs ?? this.defaultTimeoutMs)
        this.logger.debug('app-state sync iq response received', {
            tag: responseNode.tag,
            type: responseNode.attrs.type
        })
        const payloads = this.parseSyncResponse(responseNode)
        this.logger.debug('app-state sync payloads parsed', { count: payloads.length })
        const results: WaAppStateCollectionSyncResult[] = []
        let stateChanged = false

        for (const payload of payloads) {
            if (
                payload.state === WA_APP_STATE_COLLECTION_STATES.ERROR_FATAL ||
                payload.state === WA_APP_STATE_COLLECTION_STATES.ERROR_RETRY ||
                payload.state === WA_APP_STATE_COLLECTION_STATES.CONFLICT ||
                payload.state === WA_APP_STATE_COLLECTION_STATES.CONFLICT_HAS_MORE
            ) {
                results.push({
                    collection: payload.collection,
                    state: payload.state,
                    version: payload.version
                })
                continue
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
                    stateChanged = true
                }

                if (payload.patches.length > 0) {
                    const sortedPatches = [...payload.patches].sort((left, right) => {
                        const leftVersion = longToNumber(
                            left.version?.version as
                                | number
                                | { toNumber(): number }
                                | null
                                | undefined
                        )
                        const rightVersion = longToNumber(
                            right.version?.version as
                                | number
                                | { toNumber(): number }
                                | null
                                | undefined
                        )
                        return leftVersion - rightVersion
                    })
                    for (const patch of sortedPatches) {
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

                        const patchMutations = await this.applyPatch(
                            payload.collection,
                            this.validatePatch(payload.collection, readyPatch)
                        )
                        appliedMutations = appliedMutations.concat(patchMutations)
                        stateChanged = true
                    }
                } else {
                    const outgoingContext = outgoingContexts.get(payload.collection)
                    if (
                        outgoingContext &&
                        payload.state === WA_APP_STATE_COLLECTION_STATES.SUCCESS &&
                        payload.version === outgoingContext.patchVersion
                    ) {
                        this.state.updateCollectionVersionAndHash(
                            payload.collection,
                            outgoingContext.patchVersion,
                            outgoingContext.nextHash,
                            outgoingContext.nextIndexValueMap
                        )
                        stateChanged = true
                    }
                }

                results.push({
                    collection: payload.collection,
                    state: payload.state,
                    version: payload.version,
                    mutations: appliedMutations
                })
                this.logger.debug('app-state collection processed', {
                    collection: payload.collection,
                    state: payload.state,
                    version: payload.version,
                    appliedMutations: appliedMutations.length
                })
            } catch (error) {
                if (error instanceof WaAppStateMissingKeyError) {
                    this.logger.warn('app-state blocked by missing key', {
                        collection: payload.collection,
                        message: error.message
                    })
                    results.push({
                        collection: payload.collection,
                        state: WA_APP_STATE_COLLECTION_STATES.BLOCKED,
                        version: payload.version
                    })
                    continue
                }
                throw error
            }
        }

        if (stateChanged) {
            await this.persistAppState(this.state.export())
            this.logger.info('app-state sync persisted updated state')
        }

        this.logger.info('app-state sync finished', { collections: results.length, stateChanged })
        return { collections: results }
    }

    private async applySnapshot(
        collection: AppStateCollectionName,
        snapshot: Proto.ISyncdSnapshot
    ): Promise<WaAppStateMutation[]> {
        const version = longToNumber(
            snapshot.version?.version as number | { toNumber(): number } | null | undefined
        )
        if (!snapshot.mac) {
            throw new Error(`snapshot for ${collection} is missing mac`)
        }
        const keyId = decodeProtoBytes(snapshot.keyId?.id, `snapshot.keyId.id (${collection})`)
        const keyData = this.state.getKeyData(keyId)
        if (!keyData) {
            throw new WaAppStateMissingKeyError(
                `missing snapshot key ${keyIdToHex(keyId)} for ${collection}`
            )
        }

        const indexValueMap = new Map<string, Uint8Array>()
        const mutations: WaAppStateMutation[] = []
        for (const record of snapshot.records ?? []) {
            const indexMac = decodeProtoBytes(
                record.index?.blob,
                `snapshot.record.index.blob (${collection})`
            )
            const valueBlob = decodeProtoBytes(
                record.value?.blob,
                `snapshot.record.value.blob (${collection})`
            )
            const recordKeyId = decodeProtoBytes(
                record.keyId?.id,
                `snapshot.record.keyId.id (${collection})`
            )
            const recordKeyData = this.state.getKeyData(recordKeyId)
            if (!recordKeyData) {
                throw new WaAppStateMissingKeyError(
                    `missing snapshot mutation key ${keyIdToHex(recordKeyId)} for ${collection}`
                )
            }

            const decrypted = await this.crypto.decryptMutation({
                operation: proto.SyncdMutation.SyncdOperation.SET,
                keyId: recordKeyId,
                keyData: recordKeyData,
                indexMac,
                valueBlob
            })

            const indexMacHex = keyIdToHex(decrypted.indexMac)
            indexValueMap.set(indexMacHex, decrypted.valueMac)
            mutations.push({
                collection,
                operation: 'set',
                index: decrypted.index,
                value: decrypted.value,
                version: decrypted.version,
                indexMac: cloneBytes(decrypted.indexMac),
                valueMac: cloneBytes(decrypted.valueMac),
                keyId: cloneBytes(recordKeyId),
                timestamp: longToNumber(
                    (decrypted.value as { timestamp?: number | { toNumber(): number } } | null)
                        ?.timestamp
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
        if (!uint8Equal(expectedSnapshotMac, snapshot.mac)) {
            throw new Error(`snapshot MAC mismatch for ${collection}`)
        }

        this.state.replaceCollection(collection, version, ltHash, indexValueMap)
        return mutations
    }

    private async applyPatch(
        collection: AppStateCollectionName,
        patch: Proto.ISyncdPatch
    ): Promise<WaAppStateMutation[]> {
        const patchVersion = longToNumber(
            patch.version?.version as number | { toNumber(): number } | null | undefined
        )
        const current = this.state.getCollection(collection)
        if (current.version !== patchVersion - 1) {
            throw new Error(
                `patch version mismatch for ${collection}: local=${current.version}, incoming=${patchVersion}`
            )
        }

        const patchKeyId = decodeProtoBytes(patch.keyId?.id, `patch.keyId.id (${collection})`)
        const patchKeyData = this.state.getKeyData(patchKeyId)
        if (!patchKeyData) {
            throw new WaAppStateMissingKeyError(
                `missing patch key ${keyIdToHex(patchKeyId)} for ${collection}`
            )
        }

        const decryptedMutations: (WaAppStateMutation & { operationCode: number })[] = []
        for (const mutation of patch.mutations ?? []) {
            const operationCode = mutation.operation
            if (operationCode === null || operationCode === undefined) {
                throw new Error(`patch mutation is missing operation (${collection})`)
            }
            const record = mutation.record
            if (!record) {
                throw new Error(`patch mutation is missing record (${collection})`)
            }
            const indexMac = decodeProtoBytes(
                record.index?.blob,
                `patch.record.index.blob (${collection})`
            )
            const valueBlob = decodeProtoBytes(
                record.value?.blob,
                `patch.record.value.blob (${collection})`
            )
            const recordKeyId = decodeProtoBytes(
                record.keyId?.id,
                `patch.record.keyId.id (${collection})`
            )
            const recordKeyData = this.state.getKeyData(recordKeyId)
            if (!recordKeyData) {
                throw new WaAppStateMissingKeyError(
                    `missing mutation key ${keyIdToHex(recordKeyId)} for ${collection}`
                )
            }

            const decrypted = await this.crypto.decryptMutation({
                operation: operationCode,
                keyId: recordKeyId,
                keyData: recordKeyData,
                indexMac,
                valueBlob
            })

            decryptedMutations.push({
                collection,
                operation:
                    operationCode === proto.SyncdMutation.SyncdOperation.REMOVE
                        ? 'remove'
                        : 'set',
                operationCode,
                index: decrypted.index,
                value: decrypted.value,
                version: decrypted.version,
                indexMac: cloneBytes(decrypted.indexMac),
                valueMac: cloneBytes(decrypted.valueMac),
                keyId: cloneBytes(recordKeyId),
                timestamp: longToNumber(
                    (decrypted.value as { timestamp?: number | { toNumber(): number } } | null)
                        ?.timestamp
                )
            })
        }

        const nextState = await this.computeNextCollectionState(
            current.hash,
            current.indexValueMap,
            decryptedMutations.map((mutation) => ({
                operation: mutation.operationCode,
                indexMac: mutation.indexMac,
                valueMac: mutation.valueMac
            })),
            collection
        )

        const snapshotMac = decodeProtoBytes(patch.snapshotMac, `patch.snapshotMac (${collection})`)
        const expectedSnapshotMac = await this.crypto.generateSnapshotMac(
            patchKeyData,
            nextState.hash,
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
            decryptedMutations.map((mutation) => mutation.valueMac),
            patchVersion,
            collection
        )
        if (!uint8Equal(expectedPatchMac, patchMac)) {
            throw new Error(`patch MAC mismatch for ${collection}`)
        }

        this.state.updateCollectionVersionAndHash(
            collection,
            patchVersion,
            nextState.hash,
            nextState.indexValueMap
        )
        return decryptedMutations.map((mutation) => ({
            collection: mutation.collection,
            operation: mutation.operation,
            index: mutation.index,
            value: mutation.value,
            version: mutation.version,
            indexMac: mutation.indexMac,
            valueMac: mutation.valueMac,
            keyId: mutation.keyId,
            timestamp: mutation.timestamp
        }))
    }

    private async buildOutgoingPatch(
        collection: AppStateCollectionName,
        snapshot: {
            readonly version: number
            readonly hash: Uint8Array
            readonly indexValueMap: Readonly<Record<string, Uint8Array>>
        },
        pendingMutations: readonly WaAppStateMutationInput[]
    ): Promise<{ readonly encodedPatch: Uint8Array; readonly context: OutgoingPatchContext }> {
        const activeKey = this.state.getActiveKey()
        if (!activeKey) {
            throw new WaAppStateMissingKeyError(`no sync key available to upload ${collection}`)
        }

        const collectionMap = new Map<string, Uint8Array>()
        for (const [indexMacHex, valueMac] of Object.entries(snapshot.indexValueMap)) {
            collectionMap.set(indexMacHex, cloneBytes(valueMac))
        }

        const encryptedMutations: Proto.ISyncdMutation[] = []
        const macMutations: MacMutation[] = []
        for (const mutation of pendingMutations) {
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
            encryptedMutations.push({
                operation: operationCode,
                record: {
                    keyId: { id: activeKey.keyId },
                    index: { blob: encrypted.indexMac },
                    value: { blob: encrypted.valueBlob }
                }
            })
            macMutations.push({
                operation: operationCode,
                indexMac: encrypted.indexMac,
                valueMac: encrypted.valueMac
            })
        }

        const nextState = await this.computeNextCollectionState(
            snapshot.hash,
            collectionMap,
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

        const encodedPatch = proto.SyncdPatch.encode({
            version: { version: patchVersion },
            mutations: encryptedMutations,
            snapshotMac,
            patchMac,
            keyId: { id: activeKey.keyId }
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

    private async computeNextCollectionState(
        baseHash: Uint8Array,
        baseMap: Map<string, Uint8Array>,
        mutations: readonly MacMutation[],
        collection: AppStateCollectionName
    ): Promise<{ readonly hash: Uint8Array; readonly indexValueMap: Map<string, Uint8Array> }> {
        const indexValueMap = new Map<string, Uint8Array>()
        for (const [indexMacHex, valueMac] of baseMap.entries()) {
            indexValueMap.set(indexMacHex, cloneBytes(valueMac))
        }

        const addValues: Uint8Array[] = []
        const removeValues: Uint8Array[] = []
        for (const mutation of mutations) {
            const indexMacHex = keyIdToHex(mutation.indexMac)
            const existing = indexValueMap.get(indexMacHex)
            if (mutation.operation === proto.SyncdMutation.SyncdOperation.REMOVE) {
                if (!existing) {
                    throw new Error(
                        `cannot remove missing index MAC ${indexMacHex} in ${collection}`
                    )
                }
                indexValueMap.delete(indexMacHex)
                removeValues.push(existing)
                continue
            }

            if (existing) {
                removeValues.push(existing)
            }
            indexValueMap.set(indexMacHex, cloneBytes(mutation.valueMac))
            addValues.push(mutation.valueMac)
        }

        const nextHash = await this.crypto.ltHashSubtractThenAdd(baseHash, addValues, removeValues)
        return {
            hash: nextHash.hash,
            indexValueMap
        }
    }

    private parseSyncResponse(iqNode: BinaryNode): readonly CollectionResponsePayload[] {
        if (iqNode.tag !== WA_NODE_TAGS.IQ) {
            throw new Error(`invalid sync response tag ${iqNode.tag}`)
        }
        const syncNode = findNodeChild(iqNode, WA_NODE_TAGS.SYNC)
        if (!syncNode) {
            throw new Error('sync response is missing <sync> node')
        }

        const payloads: CollectionResponsePayload[] = []
        for (const collectionNode of getNodeChildrenByTag(syncNode, WA_NODE_TAGS.COLLECTION)) {
            const collection = parseCollectionName(collectionNode.attrs.name)
            if (!collection) {
                this.logger.warn('ignored unknown app-state collection', {
                    name: collectionNode.attrs.name
                })
                continue
            }
            const state = this.parseCollectionState(collectionNode)
            const versionAttr = collectionNode.attrs.version
            const version = versionAttr ? Number.parseInt(versionAttr, 10) : undefined

            const patchesNode = findNodeChild(collectionNode, WA_NODE_TAGS.PATCHES)
            const patches = patchesNode
                ? getNodeChildrenByTag(patchesNode, WA_NODE_TAGS.PATCH).map((node) =>
                      proto.SyncdPatch.decode(
                          decodeBinaryNodeContent(node.content, 'collection.patches.patch')
                      )
                  )
                : []

            const snapshotNode = findNodeChild(collectionNode, WA_NODE_TAGS.SNAPSHOT)
            const snapshotReference = snapshotNode
                ? proto.ExternalBlobReference.decode(
                      decodeBinaryNodeContent(snapshotNode.content, 'collection.snapshot')
                  )
                : undefined

            payloads.push({
                collection,
                state,
                version,
                patches,
                snapshotReference
            })
        }
        return payloads
    }

    private parseCollectionState(node: BinaryNode): AppStateCollectionState {
        const type = node.attrs.type
        const hasMorePatches = node.attrs.has_more_patches === 'true'
        if (type !== WA_IQ_TYPES.ERROR) {
            return hasMorePatches
                ? WA_APP_STATE_COLLECTION_STATES.SUCCESS_HAS_MORE
                : WA_APP_STATE_COLLECTION_STATES.SUCCESS
        }

        const errorNode = findNodeChild(node, WA_NODE_TAGS.ERROR)
        const code = errorNode?.attrs.code
        if (code === WA_APP_STATE_ERROR_CODES.CONFLICT) {
            return hasMorePatches
                ? WA_APP_STATE_COLLECTION_STATES.CONFLICT_HAS_MORE
                : WA_APP_STATE_COLLECTION_STATES.CONFLICT
        }
        if (
            code === WA_APP_STATE_ERROR_CODES.BAD_REQUEST ||
            code === WA_APP_STATE_ERROR_CODES.NOT_FOUND
        ) {
            return WA_APP_STATE_COLLECTION_STATES.ERROR_FATAL
        }
        return WA_APP_STATE_COLLECTION_STATES.ERROR_RETRY
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
        return patch
    }

    private reloadPersistedState(): void {
        const persisted = this.getPersistedAppState()
        if (persisted) {
            this.state.hydrate(persisted)
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

    private normalizeCollections(
        collections: readonly AppStateCollectionName[]
    ): readonly AppStateCollectionName[] {
        const seen = new Set<AppStateCollectionName>()
        const normalized: AppStateCollectionName[] = []
        for (const collection of collections) {
            if (seen.has(collection)) {
                continue
            }
            seen.add(collection)
            normalized.push(collection)
        }
        return normalized
    }
}
