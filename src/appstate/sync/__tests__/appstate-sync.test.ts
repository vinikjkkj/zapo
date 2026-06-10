import assert from 'node:assert/strict'
import test from 'node:test'

import { APP_STATE_EMPTY_LT_HASH } from '@appstate/constants'
import { WaAppStateSyncClient } from '@appstate/sync/WaAppStateSyncClient'
import { keyEpoch } from '@appstate/utils'
import { createNoopLogger } from '@infra/log/types'
import { type Proto, proto } from '@proto'
import {
    WA_APP_STATE_COLLECTION_STATES,
    WA_APP_STATE_COLLECTIONS,
    WA_IQ_TYPES,
    WA_NODE_TAGS
} from '@protocol/constants'
import { WaAppStateMemoryStore } from '@store/memory/appstate.store'
import type { BinaryNode } from '@transport/types'
import { bytesToHex } from '@util/bytes'

test('appstate sync client builds outgoing patch without inline version field', async () => {
    const store = new WaAppStateMemoryStore()
    const key = {
        keyId: new Uint8Array([0, 1, 0, 0, 0, 2]),
        keyData: new Uint8Array(32).fill(9),
        timestamp: 2
    }
    await store.upsertSyncKeys([key])
    await store.setCollectionStates([
        {
            collection: WA_APP_STATE_COLLECTIONS.REGULAR_LOW,
            version: 10,
            hash: APP_STATE_EMPTY_LT_HASH,
            indexValueMap: new Map()
        }
    ])

    let capturedPatch: Proto.ISyncdPatch | null = null
    const query = async (node: BinaryNode): Promise<BinaryNode> => {
        const syncNode = (node.content as readonly BinaryNode[])[0]
        const collectionNode = (syncNode.content as readonly BinaryNode[])[0]
        const patchNode = (collectionNode.content as readonly BinaryNode[])[0]
        capturedPatch = proto.SyncdPatch.decode(patchNode.content as Uint8Array)
        return {
            tag: WA_NODE_TAGS.IQ,
            attrs: { type: WA_IQ_TYPES.RESULT },
            content: [
                {
                    tag: WA_NODE_TAGS.SYNC,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.COLLECTION,
                            attrs: {
                                name: WA_APP_STATE_COLLECTIONS.REGULAR_LOW,
                                version: '11'
                            }
                        }
                    ]
                }
            ]
        }
    }

    const logger = createNoopLogger()

    const client = new WaAppStateSyncClient({
        serverClock: { nowMs: () => Date.now(), nowSeconds: () => Math.floor(Date.now() / 1000) },
        logger,
        query,
        store,
        getCurrentMeJid: () => '5511999999999:3@s.whatsapp.net'
    })

    await client.sync({
        collections: [WA_APP_STATE_COLLECTIONS.REGULAR_LOW],
        pendingMutations: [
            {
                collection: WA_APP_STATE_COLLECTIONS.REGULAR_LOW,
                operation: 'set',
                index: JSON.stringify(['pin_v1', '120363078720039631@g.us']),
                value: {
                    timestamp: 3_000,
                    pinAction: { pinned: true }
                },
                version: 5,
                timestamp: 3_000
            }
        ]
    })

    assert.ok(capturedPatch !== null)
    const patch = capturedPatch as Proto.ISyncdPatch
    assert.equal(patch.version, null)
    assert.equal(patch.mutations?.length ?? 0, 1)
    assert.equal(
        bytesToHex((patch.keyId?.id as Uint8Array) ?? new Uint8Array()),
        bytesToHex(key.keyId)
    )
    assert.equal(patch.deviceIndex, 3)
    assert.equal(patch.clientDebugData ?? null, null)
})

test('appstate sync client uploads mutation for persisted empty version zero state', async () => {
    const store = new WaAppStateMemoryStore()
    const key = {
        keyId: new Uint8Array([0, 1, 0, 0, 0, 3]),
        keyData: new Uint8Array(32).fill(9),
        timestamp: 3
    }
    await store.upsertSyncKeys([key])
    await store.setCollectionStates([
        {
            collection: WA_APP_STATE_COLLECTIONS.REGULAR_LOW,
            version: 0,
            hash: APP_STATE_EMPTY_LT_HASH,
            indexValueMap: new Map()
        }
    ])

    let queryCalls = 0
    let sawOutgoingPatch = false
    const query = async (node: BinaryNode): Promise<BinaryNode> => {
        queryCalls += 1
        const syncNode = (node.content as readonly BinaryNode[])[0]
        const collectionNode = (syncNode.content as readonly BinaryNode[])[0]
        const content = collectionNode.content as readonly BinaryNode[] | undefined
        sawOutgoingPatch = content?.some((child) => child.tag === WA_NODE_TAGS.PATCH) ?? false
        return {
            tag: WA_NODE_TAGS.IQ,
            attrs: { type: WA_IQ_TYPES.RESULT },
            content: [
                {
                    tag: WA_NODE_TAGS.SYNC,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.COLLECTION,
                            attrs: {
                                name: WA_APP_STATE_COLLECTIONS.REGULAR_LOW,
                                version: '1'
                            }
                        }
                    ]
                }
            ]
        }
    }

    const logger = createNoopLogger()

    const client = new WaAppStateSyncClient({
        serverClock: { nowMs: () => Date.now(), nowSeconds: () => Math.floor(Date.now() / 1000) },
        logger,
        query,
        store,
        getCurrentMeJid: () => '5511999999999:3@s.whatsapp.net'
    })

    await client.sync({
        collections: [WA_APP_STATE_COLLECTIONS.REGULAR_LOW],
        pendingMutations: [
            {
                collection: WA_APP_STATE_COLLECTIONS.REGULAR_LOW,
                operation: 'set',
                index: JSON.stringify(['pin_v1', '120363078720039631@g.us']),
                value: {
                    timestamp: 3_000,
                    pinAction: { pinned: true }
                },
                version: 5,
                timestamp: 3_000
            }
        ]
    })

    assert.equal(queryCalls, 1)
    assert.equal(sawOutgoingPatch, true)
})

test('appstate sync client marks empty successful bootstrap as initialized for next round upload', async () => {
    const store = new WaAppStateMemoryStore()
    const key = {
        keyId: new Uint8Array([0, 1, 0, 0, 0, 4]),
        keyData: new Uint8Array(32).fill(9),
        timestamp: 4
    }
    await store.upsertSyncKeys([key])

    let queryCalls = 0
    const patchByCall: boolean[] = []
    const returnSnapshotByCall: string[] = []
    const versionByCall: string[] = []
    const query = async (node: BinaryNode): Promise<BinaryNode> => {
        queryCalls += 1
        const syncNode = (node.content as readonly BinaryNode[])[0]
        const collectionNode = (syncNode.content as readonly BinaryNode[])[0]
        const content = collectionNode.content as readonly BinaryNode[] | undefined
        patchByCall.push(content?.some((child) => child.tag === WA_NODE_TAGS.PATCH) ?? false)
        returnSnapshotByCall.push(collectionNode.attrs.return_snapshot)
        versionByCall.push(collectionNode.attrs.version)

        return {
            tag: WA_NODE_TAGS.IQ,
            attrs: { type: WA_IQ_TYPES.RESULT },
            content: [
                {
                    tag: WA_NODE_TAGS.SYNC,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.COLLECTION,
                            attrs: {
                                name: WA_APP_STATE_COLLECTIONS.REGULAR_LOW,
                                version: queryCalls === 1 ? '0' : '1'
                            }
                        }
                    ]
                }
            ]
        }
    }

    const logger = createNoopLogger()

    const client = new WaAppStateSyncClient({
        serverClock: { nowMs: () => Date.now(), nowSeconds: () => Math.floor(Date.now() / 1000) },
        logger,
        query,
        store,
        getCurrentMeJid: () => '5511999999999:3@s.whatsapp.net'
    })

    await client.sync({
        collections: [WA_APP_STATE_COLLECTIONS.REGULAR_LOW],
        pendingMutations: [
            {
                collection: WA_APP_STATE_COLLECTIONS.REGULAR_LOW,
                operation: 'set',
                index: JSON.stringify(['pin_v1', '120363078720039631@g.us']),
                value: {
                    timestamp: 4_000,
                    pinAction: { pinned: false }
                },
                version: 5,
                timestamp: 4_000
            }
        ]
    })

    assert.equal(queryCalls, 2)
    assert.deepEqual(patchByCall, [false, true])
    assert.deepEqual(returnSnapshotByCall, ['true', 'false'])
    assert.deepEqual(versionByCall, ['0', '0'])
})

test('appstate sync client inlines external mutations and clears the external reference for validatePatch', async () => {
    const store = new WaAppStateMemoryStore()
    const key = {
        keyId: new Uint8Array([0, 1, 0, 0, 0, 5]),
        keyData: new Uint8Array(32).fill(7),
        timestamp: 5
    }
    await store.upsertSyncKeys([key])

    const externalSyncdMutations = proto.SyncdMutations.encode({ mutations: [] }).finish()

    const patchBytes = proto.SyncdPatch.encode({
        version: { version: 1 },
        externalMutations: {
            directPath: '/external/patch/blob',
            mediaKey: new Uint8Array(32).fill(1),
            fileSha256: new Uint8Array(32).fill(2),
            fileEncSha256: new Uint8Array(32).fill(3)
        },
        keyId: { id: key.keyId }
    }).finish()

    const query = async (): Promise<BinaryNode> => ({
        tag: WA_NODE_TAGS.IQ,
        attrs: { type: WA_IQ_TYPES.RESULT },
        content: [
            {
                tag: WA_NODE_TAGS.SYNC,
                attrs: {},
                content: [
                    {
                        tag: WA_NODE_TAGS.COLLECTION,
                        attrs: {
                            name: WA_APP_STATE_COLLECTIONS.REGULAR_LOW,
                            version: '1'
                        },
                        content: [
                            {
                                tag: WA_NODE_TAGS.PATCHES,
                                attrs: {},
                                content: [
                                    {
                                        tag: WA_NODE_TAGS.PATCH,
                                        attrs: {},
                                        content: patchBytes
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    })

    const client = new WaAppStateSyncClient({
        serverClock: { nowMs: () => Date.now(), nowSeconds: () => Math.floor(Date.now() / 1000) },
        logger: createNoopLogger(),
        query,
        store,
        skipMacVerification: true
    })

    let downloadCalls = 0
    let observedKind: string | null = null
    let observedRef: Proto.IExternalBlobReference | null = null
    const result = await client.sync({
        collections: [WA_APP_STATE_COLLECTIONS.REGULAR_LOW],
        downloadExternalBlob: async (_collection, kind, ref) => {
            downloadCalls += 1
            observedKind = kind
            observedRef = ref
            return externalSyncdMutations
        }
    })

    assert.equal(downloadCalls, 1)
    assert.equal(observedKind, 'patch')
    assert.equal(
        bytesToHex((observedRef!.mediaKey as Uint8Array) ?? new Uint8Array()),
        bytesToHex(new Uint8Array(32).fill(1))
    )
    assert.equal(result.collections.length, 1)
    assert.equal(result.collections[0].collection, WA_APP_STATE_COLLECTIONS.REGULAR_LOW)
    assert.equal(result.collections[0].state, WA_APP_STATE_COLLECTION_STATES.SUCCESS)
    const persisted = await store.getCollectionState(WA_APP_STATE_COLLECTIONS.REGULAR_LOW)
    assert.equal(persisted.version, 1)
})

test('ensureInitialSyncKey mints a 32-byte key with fingerprint when store is empty', async () => {
    const store = new WaAppStateMemoryStore()
    const client = new WaAppStateSyncClient({
        serverClock: { nowMs: () => Date.now(), nowSeconds: () => Math.floor(Date.now() / 1000) },
        logger: createNoopLogger(),
        query: async () => ({ tag: 'iq', attrs: {} }),
        store
    })

    assert.equal(await store.getActiveSyncKey(), null)
    const first = await client.ensureInitialSyncKey()
    assert.equal(first.keyId.length, 6)
    assert.equal(first.keyId[0], 0)
    assert.equal(first.keyId[1], 0)
    assert.ok(keyEpoch(first.keyId) >= 1)
    assert.equal(first.keyData.length, 32)
    assert.ok(first.fingerprint)
    assert.equal(first.fingerprint?.currentIndex, 0)
    assert.deepEqual(first.fingerprint?.deviceIndexes, [0])
    assert.ok(typeof first.fingerprint?.rawId === 'number')

    const second = await client.ensureInitialSyncKey()
    assert.deepEqual(second.keyId, first.keyId)
    assert.deepEqual(second.keyData, first.keyData)
})

test('appstate sync applies catch-up patches on 409 conflict and re-uploads the pending mutation', async () => {
    const store = new WaAppStateMemoryStore()
    const key = {
        keyId: new Uint8Array([0, 0, 0, 0, 0, 8]),
        keyData: new Uint8Array(32).fill(9),
        timestamp: 4
    }
    await store.upsertSyncKeys([key])

    const conflictPatches = [
        {
            tag: WA_NODE_TAGS.PATCH,
            attrs: {},
            content: proto.SyncdPatch.encode({ version: { version: 1 } }).finish()
        },
        {
            tag: WA_NODE_TAGS.PATCH,
            attrs: {},
            content: proto.SyncdPatch.encode({ version: { version: 2 } }).finish()
        }
    ]

    let call = 0
    const patchByCall: boolean[] = []
    const query = async (node: BinaryNode): Promise<BinaryNode> => {
        call += 1
        const syncNode = (node.content as readonly BinaryNode[])[0]
        const collectionNode = (syncNode.content as readonly BinaryNode[])[0]
        const content = collectionNode.content as readonly BinaryNode[] | undefined
        patchByCall.push(content?.some((child) => child.tag === WA_NODE_TAGS.PATCH) ?? false)
        const collection: BinaryNode =
            call === 1
                ? {
                      tag: WA_NODE_TAGS.COLLECTION,
                      attrs: { type: 'error', name: WA_APP_STATE_COLLECTIONS.CRITICAL_BLOCK },
                      content: [
                          {
                              tag: WA_NODE_TAGS.ERROR,
                              attrs: { code: '409', text: 'conflict' }
                          },
                          { tag: WA_NODE_TAGS.PATCHES, attrs: {}, content: conflictPatches }
                      ]
                  }
                : {
                      tag: WA_NODE_TAGS.COLLECTION,
                      attrs: { name: WA_APP_STATE_COLLECTIONS.CRITICAL_BLOCK, version: '3' }
                  }
        return {
            tag: WA_NODE_TAGS.IQ,
            attrs: { type: WA_IQ_TYPES.RESULT },
            content: [{ tag: WA_NODE_TAGS.SYNC, attrs: {}, content: [collection] }]
        }
    }

    const client = new WaAppStateSyncClient({
        serverClock: { nowMs: () => Date.now(), nowSeconds: () => Math.floor(Date.now() / 1000) },
        logger: createNoopLogger(),
        query,
        store,
        mobilePrimary: true,
        skipMacVerification: true
    })

    const result = await client.sync({
        collections: [WA_APP_STATE_COLLECTIONS.CRITICAL_BLOCK],
        pendingMutations: [
            {
                collection: WA_APP_STATE_COLLECTIONS.CRITICAL_BLOCK,
                operation: 'set',
                index: JSON.stringify(['setting_pushName']),
                value: { timestamp: 4_000, pushNameSetting: { name: 'Maria' } },
                version: 1,
                timestamp: 4_000
            }
        ]
    })

    assert.equal(call, 2)
    assert.deepEqual(patchByCall, [true, true])
    assert.equal(result.collections[0].state, WA_APP_STATE_COLLECTION_STATES.SUCCESS)
    const persisted = await store.getCollectionState(WA_APP_STATE_COLLECTIONS.CRITICAL_BLOCK)
    assert.equal(persisted.version, 3)
})

test('mobile primary uploads patch from fresh state without requesting a snapshot', async () => {
    const store = new WaAppStateMemoryStore()
    const key = {
        keyId: new Uint8Array([0, 0, 0, 0, 0, 7]),
        keyData: new Uint8Array(32).fill(9),
        timestamp: 4
    }
    await store.upsertSyncKeys([key])

    const returnSnapshotByCall: string[] = []
    const patchByCall: boolean[] = []
    const query = async (node: BinaryNode): Promise<BinaryNode> => {
        const syncNode = (node.content as readonly BinaryNode[])[0]
        const collectionNode = (syncNode.content as readonly BinaryNode[])[0]
        const content = collectionNode.content as readonly BinaryNode[] | undefined
        returnSnapshotByCall.push(collectionNode.attrs.return_snapshot)
        patchByCall.push(content?.some((child) => child.tag === WA_NODE_TAGS.PATCH) ?? false)
        return {
            tag: WA_NODE_TAGS.IQ,
            attrs: { type: WA_IQ_TYPES.RESULT },
            content: [
                {
                    tag: WA_NODE_TAGS.SYNC,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.COLLECTION,
                            attrs: { name: WA_APP_STATE_COLLECTIONS.CRITICAL_BLOCK, version: '1' }
                        }
                    ]
                }
            ]
        }
    }

    const client = new WaAppStateSyncClient({
        serverClock: { nowMs: () => Date.now(), nowSeconds: () => Math.floor(Date.now() / 1000) },
        logger: createNoopLogger(),
        query,
        store,
        mobilePrimary: true,
        skipMacVerification: true
    })

    const result = await client.sync({
        collections: [WA_APP_STATE_COLLECTIONS.CRITICAL_BLOCK],
        pendingMutations: [
            {
                collection: WA_APP_STATE_COLLECTIONS.CRITICAL_BLOCK,
                operation: 'set',
                index: JSON.stringify(['setting_pushName']),
                value: { timestamp: 4_000, pushNameSetting: { name: 'Maria' } },
                version: 1,
                timestamp: 4_000
            }
        ]
    })

    assert.deepEqual(returnSnapshotByCall, ['false'])
    assert.deepEqual(patchByCall, [true])
    assert.equal(result.collections[0].state, WA_APP_STATE_COLLECTION_STATES.SUCCESS)
})
