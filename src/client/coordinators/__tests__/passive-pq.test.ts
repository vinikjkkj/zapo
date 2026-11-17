import assert from 'node:assert/strict'
import test from 'node:test'

import { WaPassiveTasksCoordinator } from '@client/coordinators/WaPassiveTasksCoordinator'
import { isMlKemSupported } from '@crypto/kem/MlKem'
import { createNoopLogger } from '@infra/log/types'
import { createLegacyPreKeyStore } from '@signal/__tests__/_legacy-pre-key-store'
import {
    generatePreKeyPair,
    generateRegistrationInfo,
    generateSignedPreKey
} from '@signal/registration/keygen'
import { createSignalPqPolicy, type SignalPqPolicy } from '@signal/session/pq-scope'
import type { WaPreKeyStore } from '@store/contracts/pre-key.store'
import { WaPreKeyMemoryStore } from '@store/memory/pre-key.store'
import { WaSignalMemoryStore } from '@store/memory/signal.store'
import type { BinaryNode } from '@transport/types'
import { delay } from '@util/async'

const skip = !isMlKemSupported()
const ENABLED: SignalPqPolicy = { isKeyUploadEnabled: () => true, isOneToOneEnabled: () => true }
const DISABLED: SignalPqPolicy = {
    isKeyUploadEnabled: () => false,
    isOneToOneEnabled: () => false
}

const RESULT: BinaryNode = { tag: 'iq', attrs: { type: 'result' } }
const REFUSED: BinaryNode = {
    tag: 'iq',
    attrs: { type: 'error' },
    content: [{ tag: 'error', attrs: { code: '406', text: 'not-acceptable' } }]
}

interface Sent {
    readonly context: string
    readonly node: BinaryNode
}

interface HarnessOptions {
    readonly policy?: SignalPqPolicy
    /** Drives the coordinator with a store that has no post-quantum methods. */
    readonly legacyStore?: boolean
    readonly policyFor?: (store: WaPreKeyStore) => SignalPqPolicy
    readonly serverHasPreKeys?: boolean
    readonly batchSize?: number
    readonly maxKeys?: number
    readonly respond?: (
        sent: Sent,
        index: number
    ) => BinaryNode | Error | Promise<BinaryNode | Error>
    /** Overrides the digest check result; `undefined` keeps it valid. */
    readonly digest?: () =>
        | { valid: false; shouldReupload: boolean; preKeyCount: number }
        | undefined
}

async function buildHarness(options: HarnessOptions = {}) {
    const signalStore = new WaSignalMemoryStore()
    const preKeyStore = new WaPreKeyMemoryStore()
    const registration = await generateRegistrationInfo()
    await signalStore.setRegistrationInfo(registration)
    await signalStore.setSignedPreKey(
        await generateSignedPreKey(1, registration.identityKeyPair.privKey)
    )
    await preKeyStore.setServerHasPreKeys(options.serverHasPreKeys ?? true)
    const coordinatorStore: WaPreKeyStore = options.legacyStore
        ? createLegacyPreKeyStore()
        : preKeyStore
    await coordinatorStore.setServerHasPreKeys(options.serverHasPreKeys ?? true)

    const sent: Sent[] = []
    const storedWhenSent: number[] = []
    let settled = false
    let releaseOffline: () => void = () => undefined
    const offlineGate = new Promise<void>((resolve) => {
        releaseOffline = resolve
    })
    const coordinator = new WaPassiveTasksCoordinator({
        logger: createNoopLogger(),
        signalStore,
        preKeyStore: coordinatorStore,
        signalDigestSync: {
            validateLocalKeyBundle: async () =>
                options.digest?.() ?? { valid: true, preKeyCount: 10 }
        } as never,
        signalRotateKey: { rotateSignedPreKey: async () => undefined } as never,
        pqPolicy: options.policyFor?.(coordinatorStore) ?? options.policy ?? ENABLED,
        runtime: {
            queryWithContext: async (context: string, node: BinaryNode) => {
                if (context === 'passive.active') {
                    settled = true
                    return RESULT
                }
                const entry = { context, node }
                sent.push(entry)
                const pqNode = node.attrs.xmlns === 'encrypt' && context.endsWith('.pq')
                if (pqNode) {
                    storedWhenSent.push(
                        (await preKeyStore.getLatestKyberLastResortKey()) === null ? 0 : 1
                    )
                }
                const reply = (await options.respond?.(entry, sent.length - 1)) ?? RESULT
                if (reply instanceof Error) {
                    throw reply
                }
                return reply
            },
            getCurrentCredentials: () => ({ meJid: '551100000000@s.whatsapp.net' }) as never,
            persistServerHasPreKeys: async () => undefined,
            sendNodeDirect: async () => undefined,
            takeDanglingReceipts: () => [],
            requeueDanglingReceipt: () => undefined,
            shouldQueueDanglingReceipt: () => false,
            syncAbProps: () => undefined,
            waitForAbPropsSync: async () => undefined,
            getAbPropNumber: (name) => {
                if (name === 'pq_batch_upload_size') return options.batchSize ?? 10
                if (name === 'pq_max_keys_on_server') return options.maxKeys ?? 200
                return 0
            },
            waitForOfflineDeliveryEnd: () => offlineGate,
            sendInitialPresence: async () => undefined
        }
    })
    return {
        coordinator,
        preKeyStore,
        coordinatorStore,
        sent,
        storedWhenSent,
        isSettled: () => settled,
        releaseOffline,
        pqSent: () => sent.filter((entry) => entry.context.endsWith('.pq'))
    }
}

/** Makes the next classic upload carry one key, so it reaches the wire within milliseconds. */
async function shrinkClassicUpload(store: WaPreKeyMemoryStore) {
    const keys = await store.getOrGenPreKeys(1, generatePreKeyPair)
    store.getOrGenPreKeys = async () => keys
}

async function waitFor(predicate: () => boolean | Promise<boolean>, message: string) {
    const deadline = Date.now() + 15_000
    while (!(await predicate())) {
        if (Date.now() > deadline) {
            throw new Error(message)
        }
        await delay(5)
    }
}

function keyIds(listNode: BinaryNode): number[] {
    return (listNode.content as BinaryNode[]).map((key) => {
        const id = (key.content as BinaryNode[])[0].content as Uint8Array
        return (id[0] << 16) | (id[1] << 8) | id[2]
    })
}

function childOf(node: BinaryNode, tag: string): BinaryNode {
    return (node.content as BinaryNode[]).find((child) => child.tag === tag)!
}

test(
    'the first connect uploads a last-resort key and one batch, then fills the pool',
    { skip },
    async () => {
        const harness = await buildHarness()
        harness.coordinator.startPassiveTasksAfterConnect()
        await waitFor(() => harness.isSettled(), 'passive tasks did not settle')
        await waitFor(
            async () => await harness.preKeyStore.getPqMigrated(),
            'first upload did not finish'
        )

        const [set] = harness.pqSent()
        assert.equal(set.context, 'prekeys.upload.pq')
        const children = set.node.content as BinaryNode[]
        assert.deepEqual(
            children.map((child) => child.tag),
            ['pq_last_resort_key', 'pq_list']
        )
        const lastResortId = keyIds({ tag: 'x', attrs: {}, content: [children[0]] })[0]
        const firstBatch = keyIds(children[1])
        assert.equal(firstBatch.length, 10)
        assert.deepEqual(
            firstBatch,
            Array.from({ length: 10 }, (_unused, index) => firstBatch[0] + index)
        )
        assert.equal(lastResortId, firstBatch[0] + 200)
        // keys are stored before the SET goes out
        assert.equal(harness.storedWhenSent[0], 1)
        assert.equal(await harness.preKeyStore.getPqMigrated(), true)

        // the rest of the pool waits for offline delivery to end
        assert.equal(harness.pqSent().length, 1)
        harness.releaseOffline()
        await waitFor(() => harness.pqSent().length === 20, 'pool was not filled')

        const adds = harness.pqSent().slice(1)
        const addedIds: number[] = []
        for (const add of adds) {
            assert.equal(add.context, 'prekeys.add.pq')
            const content = add.node.content as BinaryNode[]
            assert.deepEqual(
                content.map((child) => child.tag),
                ['op', 'pq_list']
            )
            assert.deepEqual(content[0].attrs, { mode: 'add' })
            addedIds.push(...keyIds(content[1]))
        }
        assert.deepEqual(
            [...firstBatch, ...addedIds],
            Array.from({ length: 200 }, (_unused, index) => firstBatch[0] + index)
        )
        for (const id of [...firstBatch, ...addedIds, lastResortId]) {
            assert.ok(await harness.preKeyStore.getKyberPreKeyById(id), `key ${id} stored`)
        }
        assert.equal((await harness.preKeyStore.getLatestKyberLastResortKey())?.keyId, lastResortId)
    }
)

test('nothing is generated or sent while post-quantum upload is off', { skip }, async () => {
    const harness = await buildHarness({ policy: DISABLED })
    harness.coordinator.startPassiveTasksAfterConnect()
    await waitFor(() => harness.isSettled(), 'passive tasks did not settle')
    await delay(30)

    assert.equal(harness.pqSent().length, 0)
    assert.equal(await harness.preKeyStore.getLatestKyberLastResortKey(), null)
    assert.equal(await harness.preKeyStore.reserveKyberPreKeyIds(1), 1)
})

test('an already migrated account is not uploaded again', { skip }, async () => {
    const harness = await buildHarness()
    await harness.preKeyStore.setPqMigrated(true)
    harness.coordinator.startPassiveTasksAfterConnect()
    await waitFor(() => harness.isSettled(), 'passive tasks did not settle')
    await delay(30)

    assert.equal(harness.pqSent().length, 0)
})

test('a refused first upload rolls the stored keys back', { skip }, async () => {
    const harness = await buildHarness({ respond: () => REFUSED })
    harness.coordinator.startPassiveTasksAfterConnect()
    await waitFor(() => harness.pqSent().length === 1, 'no upload was sent')
    await waitFor(
        async () => (await harness.preKeyStore.getLatestKyberLastResortKey()) === null,
        'the keys were not rolled back'
    )

    assert.equal(harness.pqSent().length, 1)
    assert.equal(await harness.preKeyStore.getPqMigrated(), false)
    const [set] = harness.pqSent()
    const ids = [
        ...keyIds(childOf(set.node, 'pq_list')),
        keyIds({ tag: 'x', attrs: {}, content: [childOf(set.node, 'pq_last_resort_key')] })[0]
    ]
    for (const id of ids) {
        assert.equal(await harness.preKeyStore.getKyberPreKeyById(id), null)
    }
})

test(
    'an upload with an unknown outcome keeps the keys and stays unmigrated',
    { skip },
    async () => {
        const harness = await buildHarness({ respond: () => new Error('timeout') })
        harness.coordinator.startPassiveTasksAfterConnect()
        await waitFor(() => harness.pqSent().length === 1, 'no upload was sent')
        await delay(30)

        assert.equal(harness.pqSent().length, 1)
        assert.ok(await harness.preKeyStore.getLatestKyberLastResortKey())
        assert.equal(await harness.preKeyStore.getPqMigrated(), false)
    }
)

test(
    'a full classic upload clears the migrated flag and the keys are redone',
    { skip },
    async () => {
        const harness = await buildHarness({ serverHasPreKeys: false, batchSize: 10, maxKeys: 10 })
        await harness.preKeyStore.setPqMigrated(true)
        harness.coordinator.startPassiveTasksAfterConnect()
        await waitFor(() => harness.isSettled(), 'passive tasks did not settle')
        await waitFor(() => harness.pqSent().length === 1, 'no upload was sent')
        await waitFor(
            async () => await harness.preKeyStore.getPqMigrated(),
            'upload did not finish'
        )

        const contexts = harness.sent.map((entry) => entry.context)
        assert.deepEqual(contexts, ['prekeys.upload', 'prekeys.upload.pq'])
        assert.equal(await harness.preKeyStore.getPqMigrated(), true)
    }
)

test(
    'a full classic upload waits for a post-quantum upload in flight and the keys are redone',
    { skip },
    async () => {
        let releaseSet: () => void = () => undefined
        const setGate = new Promise<void>((resolve) => {
            releaseSet = resolve
        })
        const harness = await buildHarness({
            batchSize: 10,
            maxKeys: 10,
            respond: async (_sent, index) => {
                if (index === 0) await setGate
                return RESULT
            }
        })
        await shrinkClassicUpload(harness.preKeyStore)
        harness.coordinator.startPassiveTasksAfterConnect()
        await waitFor(() => harness.pqSent().length === 1, 'the first SET was not sent')

        const low = harness.coordinator.handlePreKeyLowNotification()
        await delay(50)
        assert.deepEqual(
            harness.sent.map((entry) => entry.context),
            ['prekeys.upload.pq']
        )

        releaseSet()
        await low
        await waitFor(() => harness.pqSent().length === 2, 'the SET was not redone')

        assert.deepEqual(
            harness.sent.map((entry) => entry.context),
            ['prekeys.upload.pq', 'prekeys.upload', 'prekeys.upload.pq']
        )
        assert.equal(await harness.preKeyStore.getPqMigrated(), true)
    }
)

test(
    'the pool fill does not add keys on top of a pool a classic upload wiped',
    { skip },
    async () => {
        let releaseAdd: () => void = () => undefined
        const addGate = new Promise<void>((resolve) => {
            releaseAdd = resolve
        })
        let digestBroken = false
        const harness = await buildHarness({
            batchSize: 5,
            maxKeys: 20,
            digest: () =>
                digestBroken ? { valid: false, shouldReupload: true, preKeyCount: 0 } : undefined,
            respond: async (sent) => {
                if (sent.context === 'prekeys.add.pq') await addGate
                return RESULT
            }
        })
        await shrinkClassicUpload(harness.preKeyStore)
        harness.coordinator.startPassiveTasksAfterConnect()
        await waitFor(() => harness.pqSent().length === 1, 'the SET was not sent')
        harness.releaseOffline()
        await waitFor(() => harness.pqSent().length === 2, 'the first batch was not sent')

        digestBroken = true
        const digest = harness.coordinator.handleDigestNotification()
        await delay(50)
        releaseAdd()
        await digest
        await delay(150)

        const contexts = harness.sent.map((entry) => entry.context)
        const classicAt = contexts.indexOf('prekeys.upload')
        assert.ok(classicAt > 0)
        assert.deepEqual(
            contexts.slice(classicAt + 1).filter((context) => context === 'prekeys.add.pq'),
            []
        )
        assert.equal(await harness.preKeyStore.getPqMigrated(), false)
    }
)

test('a low-pool notification adds one batch of keys', { skip }, async () => {
    const harness = await buildHarness({ batchSize: 4 })
    await harness.preKeyStore.setPqMigrated(true)

    await harness.coordinator.handlePqPreKeyLowNotification()

    assert.equal(harness.sent.length, 1)
    assert.equal(harness.sent[0].context, 'prekeys.add.pq')
    const content = harness.sent[0].node.content as BinaryNode[]
    assert.deepEqual(content[0], { tag: 'op', attrs: { mode: 'add' } })
    const ids = keyIds(content[1])
    assert.equal(ids.length, 4)
    for (const id of ids) {
        assert.ok(await harness.preKeyStore.getKyberPreKeyById(id))
    }
})

test(
    'a low-pool notification does nothing before the first upload or with the policy off',
    { skip },
    async () => {
        const unmigrated = await buildHarness()
        await unmigrated.coordinator.handlePqPreKeyLowNotification()
        assert.equal(unmigrated.sent.length, 0)

        const off = await buildHarness({ policy: DISABLED })
        await off.preKeyStore.setPqMigrated(true)
        await off.coordinator.handlePqPreKeyLowNotification()
        assert.equal(off.sent.length, 0)
    }
)

test('a refused replenish batch is removed from the store', { skip }, async () => {
    const harness = await buildHarness({ batchSize: 3, respond: () => REFUSED })
    await harness.preKeyStore.setPqMigrated(true)

    await harness.coordinator.handlePqPreKeyLowNotification()

    const ids = keyIds(childOf(harness.sent[0].node, 'pq_list'))
    for (const id of ids) {
        assert.equal(await harness.preKeyStore.getKyberPreKeyById(id), null)
    }
})

test('a refused add stops the pool fill and drops only that batch', { skip }, async () => {
    const harness = await buildHarness({
        batchSize: 5,
        maxKeys: 20,
        respond: (_sent, index) => (index === 2 ? REFUSED : RESULT)
    })
    harness.coordinator.startPassiveTasksAfterConnect()
    await waitFor(
        async () => await harness.preKeyStore.getPqMigrated(),
        'first upload did not finish'
    )
    harness.releaseOffline()
    await waitFor(() => harness.pqSent().length === 3, 'adds did not run')
    await delay(50)

    // SET (5 keys) + ADD (5 keys) accepted, the third request refused and no fourth
    assert.equal(harness.pqSent().length, 3)
    const refusedIds = keyIds(childOf(harness.pqSent()[2].node, 'pq_list'))
    for (const id of refusedIds) {
        assert.equal(await harness.preKeyStore.getKyberPreKeyById(id), null)
    }
    const acceptedIds = keyIds(childOf(harness.pqSent()[1].node, 'pq_list'))
    for (const id of acceptedIds) {
        assert.ok(await harness.preKeyStore.getKyberPreKeyById(id))
    }
})

test('a store without post-quantum methods still completes the classic upload', async () => {
    const harness = await buildHarness({ legacyStore: true, serverHasPreKeys: false })
    harness.coordinator.startPassiveTasksAfterConnect()
    await waitFor(() => harness.isSettled(), 'passive tasks did not settle')
    await delay(30)

    assert.deepEqual(
        harness.sent.map((entry) => entry.context),
        ['prekeys.upload']
    )
    assert.equal(await harness.coordinatorStore.getServerHasPreKeys(), true)
})

test(
    'with every gate open a store without the methods gets no post-quantum upload',
    { skip },
    async () => {
        const harness = await buildHarness({
            legacyStore: true,
            serverHasPreKeys: false,
            policyFor: (store) => createSignalPqPolicy(() => true, store)
        })
        harness.coordinator.startPassiveTasksAfterConnect()
        await waitFor(() => harness.isSettled(), 'passive tasks did not settle')
        await delay(30)

        assert.deepEqual(
            harness.sent.map((entry) => entry.context),
            ['prekeys.upload']
        )
        assert.equal(await harness.coordinatorStore.getServerHasPreKeys(), true)
    }
)

test('a low-pool notification of either kind is harmless on a store without the methods', async () => {
    const harness = await buildHarness({ legacyStore: true, serverHasPreKeys: false })

    await harness.coordinator.handlePqPreKeyLowNotification()
    assert.equal(harness.sent.length, 0)

    await harness.coordinator.handlePreKeyLowNotification()
    assert.deepEqual(
        harness.sent.map((entry) => entry.context),
        ['prekeys.upload']
    )
})
