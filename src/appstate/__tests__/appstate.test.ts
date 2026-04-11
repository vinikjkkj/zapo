import assert from 'node:assert/strict'
import test from 'node:test'

import { APP_STATE_EMPTY_LT_HASH } from '@appstate/constants'
import { parseCollectionState, parseSyncResponse } from '@appstate/response-parser'
import { keyEpoch, parseCollectionName, pickActiveSyncKey } from '@appstate/utils'
import { WaAppStateCrypto } from '@appstate/WaAppStateCrypto'
import { WaAppStateSyncClient } from '@appstate/WaAppStateSyncClient'
import { createNoopLogger } from '@infra/log/types'
import { type Proto, proto } from '@proto'
import {
    WA_APP_STATE_COLLECTION_STATES,
    WA_APP_STATE_COLLECTIONS,
    WA_APP_STATE_ERROR_CODES,
    WA_IQ_TYPES,
    WA_NODE_TAGS
} from '@protocol/constants'
import { WaAppStateMemoryStore } from '@store/providers/memory/appstate.store'
import type { BinaryNode } from '@transport/types'
import { bytesToHex, intToBytes } from '@util/bytes'

test('appstate utils parse collection names, key metadata and active key ordering', () => {
    assert.equal(
        parseCollectionName(WA_APP_STATE_COLLECTIONS.REGULAR),
        WA_APP_STATE_COLLECTIONS.REGULAR
    )
    assert.equal(parseCollectionName('unknown'), null)

    const keyA = new Uint8Array([0, 2, 0, 0, 0, 1])
    const keyB = new Uint8Array([0, 1, 0, 0, 0, 2])

    assert.equal(keyEpoch(keyA), 1)

    const active = pickActiveSyncKey([
        { keyId: keyA, keyData: new Uint8Array([1]), timestamp: 1 },
        { keyId: keyB, keyData: new Uint8Array([2]), timestamp: 2 }
    ])
    assert.deepEqual(active?.keyId, keyB)

    assert.deepEqual(intToBytes(8, 0x1_0000_0002), new Uint8Array([0, 0, 0, 1, 0, 0, 0, 2]))
})

test('appstate sync response parser decodes collection state, patches and references', () => {
    const patchBytes = proto.SyncdPatch.encode({}).finish()
    const snapshotBytes = proto.ExternalBlobReference.encode({
        directPath: '/snapshot',
        mediaKey: new Uint8Array([1]),
        fileSha256: new Uint8Array([2]),
        fileEncSha256: new Uint8Array([3])
    }).finish()

    const iqNode = {
        tag: 'iq',
        attrs: { type: 'result' },
        content: [
            {
                tag: WA_NODE_TAGS.SYNC,
                attrs: {},
                content: [
                    {
                        tag: WA_NODE_TAGS.COLLECTION,
                        attrs: {
                            name: WA_APP_STATE_COLLECTIONS.REGULAR,
                            version: '10'
                        },
                        content: [
                            {
                                tag: WA_NODE_TAGS.PATCHES,
                                attrs: {},
                                content: [
                                    { tag: WA_NODE_TAGS.PATCH, attrs: {}, content: patchBytes }
                                ]
                            },
                            {
                                tag: WA_NODE_TAGS.SNAPSHOT,
                                attrs: {},
                                content: snapshotBytes
                            }
                        ]
                    }
                ]
            }
        ]
    }

    const payloads = parseSyncResponse(iqNode)
    assert.equal(payloads.length, 1)
    assert.equal(payloads[0].collection, WA_APP_STATE_COLLECTIONS.REGULAR)
    assert.equal(payloads[0].state, WA_APP_STATE_COLLECTION_STATES.SUCCESS)
    assert.equal(payloads[0].version, 10)
    assert.equal(payloads[0].patches.length, 1)
    assert.ok(payloads[0].snapshotReference)

    const conflictNode = {
        tag: WA_NODE_TAGS.COLLECTION,
        attrs: { type: WA_IQ_TYPES.ERROR },
        content: [{ tag: WA_NODE_TAGS.ERROR, attrs: { code: WA_APP_STATE_ERROR_CODES.CONFLICT } }]
    }
    assert.equal(parseCollectionState(conflictNode), WA_APP_STATE_COLLECTION_STATES.CONFLICT)

    assert.throws(
        () =>
            parseSyncResponse({
                tag: WA_NODE_TAGS.IQ,
                attrs: { type: WA_IQ_TYPES.ERROR },
                content: [
                    {
                        tag: WA_NODE_TAGS.ERROR,
                        attrs: { code: '400', text: 'bad-request' }
                    }
                ]
            }),
        /sync iq failed \(400: bad-request\)/
    )
})

test('appstate crypto encrypts/decrypts mutation and computes hash transitions', async () => {
    const crypto = new WaAppStateCrypto()
    const keyId = new Uint8Array([0, 1, 2, 3, 4, 5])
    const keyData = new Uint8Array(32).fill(9)

    const encrypted = await crypto.encryptMutation({
        operation: proto.SyncdMutation.SyncdOperation.SET,
        keyId,
        keyData,
        index: 'chat:1',
        value: { timestamp: 123 },
        version: 1,
        iv: new Uint8Array(16).fill(1)
    })

    const decrypted = await crypto.decryptMutation({
        operation: proto.SyncdMutation.SyncdOperation.SET,
        keyId,
        keyData,
        indexMac: encrypted.indexMac,
        valueBlob: encrypted.valueBlob
    })

    assert.equal(decrypted.index, 'chat:1')
    assert.equal(decrypted.version, 1)

    const snapshotMac = await crypto.generateSnapshotMac(
        keyData,
        APP_STATE_EMPTY_LT_HASH,
        1,
        WA_APP_STATE_COLLECTIONS.REGULAR
    )
    const patchMac = await crypto.generatePatchMac(
        keyData,
        snapshotMac,
        [encrypted.valueMac],
        1,
        WA_APP_STATE_COLLECTIONS.REGULAR
    )

    assert.equal(snapshotMac.length > 0, true)
    assert.equal(patchMac.length > 0, true)

    const updated = await crypto.ltHashSubtractThenAdd(
        APP_STATE_EMPTY_LT_HASH,
        [encrypted.valueMac],
        []
    )
    assert.equal(updated.hash.length, APP_STATE_EMPTY_LT_HASH.length)
})

test('appstate crypto rejects tampered value and index MACs by default', async () => {
    const crypto = new WaAppStateCrypto()
    const keyId = new Uint8Array([0, 1, 2, 3, 4, 5])
    const keyData = new Uint8Array(32).fill(9)

    const encrypted = await crypto.encryptMutation({
        operation: proto.SyncdMutation.SyncdOperation.SET,
        keyId,
        keyData,
        index: 'chat:1',
        value: { timestamp: 123 },
        version: 1,
        iv: new Uint8Array(16).fill(1)
    })

    const tamperedValueBlob = new Uint8Array(encrypted.valueBlob)
    tamperedValueBlob[tamperedValueBlob.length - 1] ^= 0x01
    await assert.rejects(
        () =>
            crypto.decryptMutation({
                operation: proto.SyncdMutation.SyncdOperation.SET,
                keyId,
                keyData,
                indexMac: encrypted.indexMac,
                valueBlob: tamperedValueBlob
            }),
        /mutation value MAC mismatch/
    )

    const tamperedIndexMac = new Uint8Array(encrypted.indexMac)
    tamperedIndexMac[0] ^= 0x01
    await assert.rejects(
        () =>
            crypto.decryptMutation({
                operation: proto.SyncdMutation.SyncdOperation.SET,
                keyId,
                keyData,
                indexMac: tamperedIndexMac,
                valueBlob: encrypted.valueBlob
            }),
        /mutation index MAC mismatch/
    )
})

test('appstate crypto bypasses value and index MAC checks when skipMacVerification is set', async () => {
    const crypto = new WaAppStateCrypto(undefined, true)
    const keyId = new Uint8Array([0, 1, 2, 3, 4, 5])
    const keyData = new Uint8Array(32).fill(9)

    const encrypted = await crypto.encryptMutation({
        operation: proto.SyncdMutation.SyncdOperation.SET,
        keyId,
        keyData,
        index: 'chat:1',
        value: { timestamp: 123 },
        version: 1,
        iv: new Uint8Array(16).fill(1)
    })

    const tamperedValueBlob = new Uint8Array(encrypted.valueBlob)
    tamperedValueBlob[tamperedValueBlob.length - 1] ^= 0x01
    const tamperedIndexMac = new Uint8Array(encrypted.indexMac)
    tamperedIndexMac[0] ^= 0x01

    const decrypted = await crypto.decryptMutation({
        operation: proto.SyncdMutation.SyncdOperation.SET,
        keyId,
        keyData,
        indexMac: tamperedIndexMac,
        valueBlob: tamperedValueBlob
    })
    assert.equal(decrypted.index, 'chat:1')
    assert.equal(decrypted.version, 1)
    assert.equal(crypto.isMacVerificationSkipped, true)
})

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
    assert.equal((patch.clientDebugData as Uint8Array)?.length > 0, true)
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
