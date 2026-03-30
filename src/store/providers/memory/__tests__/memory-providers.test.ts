import assert from 'node:assert/strict'
import test from 'node:test'

import { WA_APP_STATE_COLLECTIONS } from '@protocol/constants'
import { WaAppStateMemoryStore } from '@store/providers/memory/appstate.store'
import { WaDeviceListMemoryStore } from '@store/providers/memory/device-list.store'
import { WaIdentityMemoryStore } from '@store/providers/memory/identity.store'
import { WaMessageSecretMemoryStore } from '@store/providers/memory/message-secret.store'
import { WaMessageMemoryStore } from '@store/providers/memory/message.store'
import { WaPreKeyMemoryStore } from '@store/providers/memory/pre-key.store'
import { WaPrivacyTokenMemoryStore } from '@store/providers/memory/privacy-token.store'
import { WaRetryMemoryStore } from '@store/providers/memory/retry.store'
import { SenderKeyMemoryStore } from '@store/providers/memory/sender-key.store'
import { WaSessionMemoryStore } from '@store/providers/memory/session.store'
import { WaThreadMemoryStore } from '@store/providers/memory/thread.store'

test('memory message/thread stores enforce limits and ordering', async () => {
    const messageStore = new WaMessageMemoryStore({ maxMessages: 2 })
    await messageStore.upsert({ id: 'm1', threadJid: 't1', fromMe: true, timestampMs: 10 })
    await messageStore.upsert({ id: 'm2', threadJid: 't1', fromMe: true, timestampMs: 20 })
    await messageStore.upsert({ id: 'm3', threadJid: 't1', fromMe: true, timestampMs: 30 })

    assert.equal(await messageStore.getById('m1'), null)
    const list = await messageStore.listByThread('t1', 2)
    assert.deepEqual(
        list.map((entry) => entry.id),
        ['m3', 'm2']
    )

    const threadStore = new WaThreadMemoryStore({ maxThreads: 1 })
    await threadStore.upsert({ jid: 'a', unreadCount: 1 })
    await threadStore.upsert({ jid: 'b', unreadCount: 2 })
    assert.equal(await threadStore.getByJid('a'), null)
    assert.ok(await threadStore.getByJid('b'))
})

test('memory retry/device-list stores expire entries and support cleanup', async () => {
    const retryStore = new WaRetryMemoryStore(50)
    const replayPayload = {
        mode: 'plaintext' as const,
        to: 'to',
        type: 'text',
        plaintext: new Uint8Array([1])
    }
    await retryStore.upsertOutboundMessage({
        messageId: 'id-1',
        toJid: 'to',
        eligibleRequesterDeviceJids: ['5511@s.whatsapp.net'],
        messageType: 'text',
        replayMode: 'plaintext',
        replayPayload,
        state: 'pending',
        createdAtMs: 1,
        updatedAtMs: 1,
        expiresAtMs: 5
    })
    await retryStore.markOutboundRequesterDelivered?.('id-1', '5511@s.whatsapp.net', 2, 5)
    const tracked = await retryStore.getOutboundMessage('id-1')
    assert.deepEqual(tracked?.deliveredRequesterDeviceJids, ['5511@s.whatsapp.net'])
    assert.deepEqual(tracked?.replayPayload, replayPayload)
    assert.equal(retryStore.supportsRawReplayPayload?.(), true)
    assert.deepEqual(await retryStore.getOutboundRequesterStatus?.('id-1', '5511@s.whatsapp.net'), {
        eligible: true,
        delivered: true
    })
    assert.deepEqual(await retryStore.getOutboundRequesterStatus?.('id-1', '5522@s.whatsapp.net'), {
        eligible: false,
        delivered: false
    })
    const count = await retryStore.incrementInboundCounter('id-1', 'requester', 0, 5)
    assert.equal(count, 1)
    assert.equal(await retryStore.cleanupExpired(10), 2)
    await retryStore.destroy()

    const deviceListStore = new WaDeviceListMemoryStore(10, { maxUsers: 1 })
    await deviceListStore.upsertUserDevicesBatch([
        {
            userJid: 'u1@s.whatsapp.net',
            deviceJids: ['u1:1@s.whatsapp.net'],
            updatedAtMs: 0
        },
        {
            userJid: 'u2@s.whatsapp.net',
            deviceJids: ['u2:1@s.whatsapp.net'],
            updatedAtMs: 0
        }
    ])

    const [u1Devices, u2Devices] = await deviceListStore.getUserDevicesBatch(
        ['u1@s.whatsapp.net', 'u2@s.whatsapp.net'],
        0
    )
    assert.equal(u1Devices, null)
    assert.ok(u2Devices)
    await deviceListStore.destroy()
})

test('memory signal/sender-key/appstate stores cover key workflows', async () => {
    const preKeyStore = new WaPreKeyMemoryStore({ maxPreKeys: 4 })
    const sessionStore = new WaSessionMemoryStore()
    const identityStore = new WaIdentityMemoryStore()
    const generated = await preKeyStore.getOrGenPreKeys(2, async (keyId) => ({
        keyId,
        keyPair: {
            pubKey: new Uint8Array(32).fill(keyId),
            privKey: new Uint8Array(32).fill(keyId + 1)
        },
        uploaded: false
    }))

    assert.equal(generated.length, 2)
    await preKeyStore.markKeyAsUploaded(generated[1].keyId)
    assert.equal(await preKeyStore.getServerHasPreKeys(), false)
    await preKeyStore.setServerHasPreKeys(true)
    assert.equal(await preKeyStore.getServerHasPreKeys(), true)
    const addressA = { user: '5511', server: 's.whatsapp.net', device: 0 } as const
    const addressB = { user: '5522', server: 's.whatsapp.net', device: 0 } as const
    const sessionA = {
        local: { regId: 1, pubKey: new Uint8Array(33) },
        remote: { regId: 2, pubKey: new Uint8Array(33) },
        rootKey: new Uint8Array(32),
        recvChains: [
            {
                ratchetPubKey: new Uint8Array(33),
                nextMsgIndex: 0,
                chainKey: new Uint8Array(32),
                unusedMsgKeys: []
            }
        ],
        sendChain: {
            ratchetKey: { pubKey: new Uint8Array(33), privKey: new Uint8Array(32) },
            nextMsgIndex: 0,
            chainKey: new Uint8Array(32)
        },
        initialExchangeInfo: null,
        prevSendChainHighestIndex: 0,
        aliceBaseKey: null,
        prevSessions: []
    } as const
    await sessionStore.setSession(addressA, sessionA)
    assert.deepEqual(await sessionStore.getSessionsBatch([]), [])
    assert.deepEqual(await sessionStore.getSessionsBatch([addressA, addressB]), [sessionA, null])
    const sessionB = {
        ...sessionA,
        remote: { ...sessionA.remote, regId: 3 }
    }
    await sessionStore.setSessionsBatch([{ address: addressB, session: sessionB }])
    assert.deepEqual(await sessionStore.getSessionsBatch([addressA, addressB]), [
        sessionA,
        sessionB
    ])
    await identityStore.setRemoteIdentity(addressA, new Uint8Array([7]))
    assert.deepEqual(await identityStore.getRemoteIdentities([]), [])
    assert.deepEqual(await identityStore.getRemoteIdentities([addressA, addressB, addressA]), [
        new Uint8Array([7]),
        null,
        new Uint8Array([7])
    ])

    const senderKeyStore = new SenderKeyMemoryStore({
        maxSenderKeys: 10,
        maxSenderDistributions: 10
    })
    await senderKeyStore.upsertSenderKey({
        groupId: 'g1',
        sender: { user: 'u', server: 's.whatsapp.net', device: 1 },
        keyId: 1,
        iteration: 0,
        chainKey: new Uint8Array(32),
        signingPublicKey: new Uint8Array(33)
    })
    const senderKey = await senderKeyStore.getDeviceSenderKey('g1', {
        user: 'u',
        server: 's.whatsapp.net',
        device: 1
    })
    assert.ok(senderKey)

    const appStateStore = new WaAppStateMemoryStore(undefined, {
        maxSyncKeys: 10,
        maxCollectionEntries: 10
    })
    const keyId = new Uint8Array([0, 1, 0, 0, 0, 1])
    const inserted = await appStateStore.upsertSyncKeys([
        {
            keyId,
            keyData: new Uint8Array([9]),
            timestamp: 1
        }
    ])
    assert.equal(inserted, 1)
    assert.deepEqual(await appStateStore.getSyncKeyDataBatch([]), [])
    assert.deepEqual(
        await appStateStore.getSyncKeyDataBatch([keyId, new Uint8Array([9, 9, 9]), keyId]),
        [new Uint8Array([9]), null, new Uint8Array([9])]
    )

    await appStateStore.setCollectionStates([
        {
            collection: WA_APP_STATE_COLLECTIONS.REGULAR,
            version: 2,
            hash: new Uint8Array(128),
            indexValueMap: new Map([['a', new Uint8Array([1])]])
        }
    ])
    const state = await appStateStore.getCollectionState(WA_APP_STATE_COLLECTIONS.REGULAR)
    assert.equal(state.version, 2)
    const states = await appStateStore.getCollectionStates([
        WA_APP_STATE_COLLECTIONS.REGULAR,
        WA_APP_STATE_COLLECTIONS.CRITICAL_BLOCK
    ])
    assert.equal(states.length, 2)
    assert.equal(states[0].version, 2)
    assert.equal(states[1].initialized, false)
})

test('memory message secret store covers set/get, batch, TTL expiry, bounds and cleanup', async () => {
    const store = new WaMessageSecretMemoryStore(100, { maxSecrets: 2 })

    const secretA = new Uint8Array([1, 2, 3])
    const secretB = new Uint8Array([4, 5, 6])
    const secretC = new Uint8Array([7, 8, 9])

    await store.set('msg-1', secretA)
    await store.set('msg-2', secretB)
    assert.deepEqual(await store.get('msg-1'), secretA)
    assert.deepEqual(await store.get('msg-2'), secretB)
    assert.equal(await store.get('missing'), null)

    // bounds eviction — maxSecrets=2, so msg-1 gets evicted
    await store.set('msg-3', secretC)
    assert.equal(await store.get('msg-1'), null)
    assert.deepEqual(await store.get('msg-3'), secretC)

    // getBatch preserves order and handles missing
    const batch = await store.getBatch(['msg-3', 'missing', 'msg-2'])
    assert.deepEqual(batch, [secretC, null, secretB])

    // empty getBatch
    assert.deepEqual(await store.getBatch([]), [])

    // setBatch
    await store.clear()
    await store.setBatch([
        { messageId: 'b-1', secret: secretA },
        { messageId: 'b-2', secret: secretB }
    ])
    assert.deepEqual(await store.get('b-1'), secretA)
    assert.deepEqual(await store.get('b-2'), secretB)

    // TTL expiry on get
    const expired = await store.get('b-1', Date.now() + 200)
    assert.equal(expired, null)

    // TTL expiry on getBatch
    const expiredBatch = await store.getBatch(['b-2'], Date.now() + 200)
    assert.deepEqual(expiredBatch, [null])

    // cleanupExpired
    await store.clear()
    await store.set('c-1', secretA)
    await store.set('c-2', secretB)
    const removed = await store.cleanupExpired(Date.now() + 200)
    assert.equal(removed, 2)
    assert.equal(await store.get('c-1'), null)

    // clear
    await store.set('d-1', secretA)
    await store.clear()
    assert.equal(await store.get('d-1'), null)

    await store.destroy()
})

test('memory privacy token store merges partial updates and enforces bounds', async () => {
    const store = new WaPrivacyTokenMemoryStore(1)

    await store.upsert({
        jid: 'a@s.whatsapp.net',
        tcToken: new Uint8Array([1, 2, 3]),
        tcTokenTimestamp: 11,
        updatedAtMs: 1
    })
    await store.upsert({
        jid: 'a@s.whatsapp.net',
        tcTokenSenderTimestamp: 22,
        updatedAtMs: 2
    })

    const merged = await store.getByJid('a@s.whatsapp.net')
    assert.ok(merged)
    assert.deepEqual(merged?.tcToken, new Uint8Array([1, 2, 3]))
    assert.equal(merged?.tcTokenTimestamp, 11)
    assert.equal(merged?.tcTokenSenderTimestamp, 22)

    await store.upsert({
        jid: 'b@s.whatsapp.net',
        nctSalt: new Uint8Array([9, 9]),
        updatedAtMs: 3
    })

    assert.equal(await store.getByJid('a@s.whatsapp.net'), null)
    assert.ok(await store.getByJid('b@s.whatsapp.net'))
    assert.equal(await store.deleteByJid('b@s.whatsapp.net'), 1)
    assert.equal(await store.deleteByJid('missing@s.whatsapp.net'), 0)
    await store.destroy()
})
