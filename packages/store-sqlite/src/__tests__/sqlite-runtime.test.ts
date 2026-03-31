import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { APP_STATE_EMPTY_LT_HASH } from 'zapo-js/appstate'
import { toSerializedPubKey, X25519 } from 'zapo-js/crypto'
import { WA_APP_STATE_COLLECTIONS } from 'zapo-js/protocol'
import type { WaRetryOutboundMessageRecord } from 'zapo-js/retry'
import type { SenderKeyRecord, SignalAddress, SignalSessionRecord } from 'zapo-js/signal'

import { WaAppStateSqliteStore } from '../appstate.store'
import type { WaSqliteConnection } from '../connection'
import { WaDeviceListSqliteStore } from '../device-list.store'
import { WaIdentitySqliteStore } from '../identity.store'
import { WaMessageSecretSqliteStore } from '../message-secret.store'
import { WaParticipantsSqliteStore } from '../participants.store'
import { WaPreKeySqliteStore } from '../pre-key.store'
import { WaRetrySqliteStore } from '../retry.store'
import { SenderKeySqliteStore } from '../sender-key.store'
import { WaSessionSqliteStore } from '../session.store'
import { WaSignalSqliteStore } from '../signal.store'
import type { WaSqliteStorageOptions } from '../types'

function makeBytes(length: number, seed = 0): Uint8Array {
    const out = new Uint8Array(length)
    for (let index = 0; index < out.length; index += 1) {
        out[index] = (seed + index) & 0xff
    }
    return out
}

function makeSqliteOptions(path: string, sessionId: string): WaSqliteStorageOptions {
    return {
        path,
        sessionId,
        driver: 'better-sqlite3'
    }
}

function makeAppStateKeyId(deviceId: number, epoch: number): Uint8Array {
    const keyId = new Uint8Array(8)
    keyId[0] = (deviceId >> 8) & 0xff
    keyId[1] = deviceId & 0xff
    new DataView(keyId.buffer).setUint32(2, epoch, false)
    return keyId
}

function makeAddress(user: string, device: number): SignalAddress {
    return {
        user,
        server: 's.whatsapp.net',
        device
    }
}

function asConnection(store: object): Promise<WaSqliteConnection> {
    return (store as { readonly getConnection: () => Promise<WaSqliteConnection> }).getConnection()
}

async function makeSessionRecord(seed = 0): Promise<SignalSessionRecord> {
    const [localIdentity, remoteIdentity, sendRatchet, recvRatchet, baseKey] = await Promise.all([
        X25519.generateKeyPair(),
        X25519.generateKeyPair(),
        X25519.generateKeyPair(),
        X25519.generateKeyPair(),
        X25519.generateKeyPair()
    ])

    return {
        local: {
            regId: 100 + seed,
            pubKey: toSerializedPubKey(localIdentity.pubKey)
        },
        remote: {
            regId: 200 + seed,
            pubKey: toSerializedPubKey(remoteIdentity.pubKey)
        },
        rootKey: makeBytes(32, 1 + seed),
        sendChain: {
            ratchetKey: {
                pubKey: toSerializedPubKey(sendRatchet.pubKey),
                privKey: sendRatchet.privKey
            },
            nextMsgIndex: 0,
            chainKey: makeBytes(32, 2 + seed)
        },
        recvChains: [
            {
                ratchetPubKey: toSerializedPubKey(recvRatchet.pubKey),
                nextMsgIndex: 0,
                chainKey: makeBytes(32, 3 + seed),
                unusedMsgKeys: []
            }
        ],
        initialExchangeInfo: {
            remoteOneTimeId: 1,
            remoteSignedId: 1,
            localOneTimePubKey: toSerializedPubKey(baseKey.pubKey)
        },
        prevSendChainHighestIndex: 0,
        aliceBaseKey: toSerializedPubKey(baseKey.pubKey),
        prevSessions: []
    }
}

test('sqlite appstate store handles sync keys, collection state and session scoping', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-sqlite-appstate-'))
    const sqlitePath = join(dir, 'state.sqlite')
    const storeA = new WaAppStateSqliteStore(makeSqliteOptions(sqlitePath, 'session-a'))
    const storeB = new WaAppStateSqliteStore(makeSqliteOptions(sqlitePath, 'session-b'))

    try {
        const keyLow = {
            keyId: makeAppStateKeyId(2, 5),
            keyData: makeBytes(32, 1),
            timestamp: 10
        }
        const keyHigh = {
            keyId: makeAppStateKeyId(1, 9),
            keyData: makeBytes(32, 2),
            timestamp: 20
        }

        assert.equal(await storeA.upsertSyncKeys([keyLow, keyHigh]), 2)
        assert.equal(await storeA.upsertSyncKeys([keyLow]), 0)
        assert.deepEqual(await storeA.getSyncKeyData(keyHigh.keyId), keyHigh.keyData)
        assert.deepEqual(await storeA.getSyncKeyDataBatch([]), [])
        assert.deepEqual(
            await storeA.getSyncKeyDataBatch([keyHigh.keyId, makeBytes(8, 9), keyHigh.keyId]),
            [keyHigh.keyData, null, keyHigh.keyData]
        )
        assert.equal(await storeA.getSyncKeyData(makeBytes(8, 9)), null)

        const activeKey = await storeA.getActiveSyncKey()
        assert.ok(activeKey)
        assert.deepEqual(activeKey?.keyId, keyHigh.keyId)

        const indexMap = new Map<string, Uint8Array>([
            ['aa', makeBytes(8, 1)],
            ['bb', makeBytes(8, 2)]
        ])
        await storeA.setCollectionStates([
            {
                collection: WA_APP_STATE_COLLECTIONS.REGULAR,
                version: 11,
                hash: makeBytes(128, 4),
                indexValueMap: indexMap
            }
        ])
        await storeA.setCollectionStates([])

        const regularState = await storeA.getCollectionState(WA_APP_STATE_COLLECTIONS.REGULAR)
        assert.equal(regularState.version, 11)
        assert.equal(regularState.indexValueMap.size, 2)
        assert.deepEqual(regularState.indexValueMap.get('aa'), makeBytes(8, 1))
        const batchStates = await storeA.getCollectionStates([
            WA_APP_STATE_COLLECTIONS.REGULAR,
            WA_APP_STATE_COLLECTIONS.CRITICAL_BLOCK
        ])
        assert.equal(batchStates.length, 2)
        assert.equal(batchStates[0].initialized, true)
        assert.equal(batchStates[0].version, 11)
        assert.equal(batchStates[1].initialized, false)

        const exported = await storeA.exportData()
        assert.equal(exported.keys.length, 2)
        assert.equal(exported.collections.regular?.version, 11)

        assert.equal(await storeB.getSyncKeyData(keyLow.keyId), null)
        const missingState = await storeB.getCollectionState(WA_APP_STATE_COLLECTIONS.REGULAR)
        assert.equal(missingState.version, 0)
        assert.deepEqual(missingState.hash, APP_STATE_EMPTY_LT_HASH)

        await storeA.clear()
        const afterClear = await storeA.exportData()
        assert.equal(afterClear.keys.length, 0)
        assert.deepEqual(afterClear.collections, {})
    } finally {
        await Promise.all([storeA.destroy(), storeB.destroy()])
        await rm(dir, { recursive: true, force: true })
    }
})

test('sqlite device-list and participants stores cover batch, expiry, cleanup and invalid payloads', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-sqlite-cache-'))
    const sqlitePath = join(dir, 'state.sqlite')
    const deviceStore = new WaDeviceListSqliteStore(
        makeSqliteOptions(sqlitePath, 'session-a'),
        100,
        1
    )
    const participantsStore = new WaParticipantsSqliteStore(
        makeSqliteOptions(sqlitePath, 'session-a'),
        100
    )

    try {
        await deviceStore.upsertUserDevicesBatch([
            {
                userJid: '5511@s.whatsapp.net',
                deviceJids: ['5511@s.whatsapp.net', '5511:1@s.whatsapp.net'],
                updatedAtMs: 1000
            }
        ])
        await deviceStore.upsertUserDevicesBatch([
            {
                userJid: '5522@s.whatsapp.net',
                deviceJids: ['5522@s.whatsapp.net'],
                updatedAtMs: 1000
            },
            {
                userJid: '5533@s.whatsapp.net',
                deviceJids: ['5533@s.whatsapp.net'],
                updatedAtMs: 900
            }
        ])
        await deviceStore.upsertUserDevicesBatch([])

        const [activeDevices] = await deviceStore.getUserDevicesBatch(['5511@s.whatsapp.net'], 1050)
        assert.ok(activeDevices)
        assert.equal(activeDevices?.deviceJids.length, 2)

        const deviceBatch = await deviceStore.getUserDevicesBatch(
            ['5511@s.whatsapp.net', '5533@s.whatsapp.net', 'missing@s.whatsapp.net'],
            1_010
        )
        assert.equal(deviceBatch[0]?.userJid, '5511@s.whatsapp.net')
        assert.equal(deviceBatch[1], null)
        assert.equal(deviceBatch[2], null)

        assert.equal(await deviceStore.cleanupExpired(1_200), 2)
        await deviceStore.clear()
        assert.equal((await deviceStore.getUserDevicesBatch([])).length, 0)

        const deviceDb = await asConnection(deviceStore)
        await deviceStore.upsertUserDevicesBatch([
            {
                userJid: 'broken@s.whatsapp.net',
                deviceJids: ['broken@s.whatsapp.net'],
                updatedAtMs: 2000
            }
        ])
        deviceDb.run(
            `UPDATE device_list_cache
             SET device_jids_json = ?
             WHERE session_id = ? AND user_jid = ?`,
            ['{"invalid":true}', 'session-a', 'broken@s.whatsapp.net']
        )
        await assert.rejects(
            () => deviceStore.getUserDevicesBatch(['broken@s.whatsapp.net'], 2_001),
            /device_jids_json must be an array/
        )

        await participantsStore.upsertGroupParticipants({
            groupJid: '120@g.us',
            participants: ['5511@s.whatsapp.net', '5522@s.whatsapp.net'],
            updatedAtMs: 1000
        })

        const participants = await participantsStore.getGroupParticipants('120@g.us', 1_020)
        assert.ok(participants)
        assert.equal(participants?.participants.length, 2)

        assert.equal(await participantsStore.deleteGroupParticipants('missing@g.us'), 0)
        assert.equal(await participantsStore.cleanupExpired(1_200), 1)

        await participantsStore.upsertGroupParticipants({
            groupJid: 'bad@g.us',
            participants: ['5511@s.whatsapp.net'],
            updatedAtMs: 2000
        })
        const participantsDb = await asConnection(participantsStore)
        participantsDb.run(
            `UPDATE group_participants_cache
             SET participants_json = ?
             WHERE session_id = ? AND group_jid = ?`,
            ['{"invalid":true}', 'session-a', 'bad@g.us']
        )
        await assert.rejects(
            () => participantsStore.getGroupParticipants('bad@g.us', 2_010),
            /participants_json must be an array/
        )
        await participantsStore.clear()
    } finally {
        await Promise.all([deviceStore.destroy(), participantsStore.destroy()])
        await rm(dir, { recursive: true, force: true })
    }
})

test('sqlite retry store tracks outbound state, inbound counters and expiration', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-sqlite-retry-'))
    const sqlitePath = join(dir, 'state.sqlite')
    const store = new WaRetrySqliteStore(makeSqliteOptions(sqlitePath, 'session-a'), 500)

    try {
        assert.equal(store.getTtlMs(), 500)
        assert.equal(store.supportsRawReplayPayload(), false)

        const outbound: WaRetryOutboundMessageRecord = {
            messageId: 'm1',
            toJid: '5511@s.whatsapp.net',
            participantJid: '5512@s.whatsapp.net',
            recipientJid: '5513@s.whatsapp.net',
            eligibleRequesterDeviceJids: ['5511@s.whatsapp.net', '5511:1@s.whatsapp.net'],
            messageType: 'text',
            replayMode: 'encrypted',
            replayPayload: makeBytes(12, 1),
            state: 'pending',
            createdAtMs: 1000,
            updatedAtMs: 1000,
            expiresAtMs: 1500
        }
        await store.upsertOutboundMessage(outbound)

        const loaded = await store.getOutboundMessage('m1')
        assert.ok(loaded)
        assert.equal(loaded?.state, 'pending')
        assert.deepEqual(loaded?.replayPayload, outbound.replayPayload)
        assert.deepEqual(loaded?.eligibleRequesterDeviceJids, [
            '5511@s.whatsapp.net',
            '5511:1@s.whatsapp.net'
        ])
        const eligibleStatus = await store.getOutboundRequesterStatus?.(
            'm1',
            '5511:1@s.whatsapp.net'
        )
        assert.deepEqual(eligibleStatus, { eligible: true, delivered: false })
        const ineligibleStatus = await store.getOutboundRequesterStatus?.(
            'm1',
            '5599@s.whatsapp.net'
        )
        assert.deepEqual(ineligibleStatus, { eligible: false, delivered: false })
        assert.equal(await store.getOutboundMessage('missing'), null)

        await store.updateOutboundMessageState('m1', 'delivered', 1100, 1600)
        await store.markOutboundRequesterDelivered?.('m1', '5511:1@s.whatsapp.net', 1150, 1700)
        const updated = await store.getOutboundMessage('m1')
        assert.equal(updated?.state, 'delivered')
        assert.equal(updated?.updatedAtMs, 1150)
        assert.equal(updated?.expiresAtMs, 1700)
        assert.deepEqual(updated?.deliveredRequesterDeviceJids, ['5511:1@s.whatsapp.net'])
        const deliveredStatus = await store.getOutboundRequesterStatus?.(
            'm1',
            '5511:1@s.whatsapp.net'
        )
        assert.deepEqual(deliveredStatus, { eligible: true, delivered: true })
        await store.markOutboundRequesterDelivered?.('m1', '5511:1@s.whatsapp.net', 1300, 1800)
        const duplicateDelivered = await store.getOutboundMessage('m1')
        assert.equal(duplicateDelivered?.updatedAtMs, 1150)
        assert.equal(duplicateDelivered?.expiresAtMs, 1700)

        assert.equal(await store.incrementInboundCounter('m1', 'req@s.whatsapp.net', 1200, 1300), 1)
        assert.equal(await store.incrementInboundCounter('m1', 'req@s.whatsapp.net', 1250, 1300), 2)
        assert.equal(await store.cleanupExpired(1_100), 0)
        assert.equal(await store.cleanupExpired(2_000), 2)

        await store.clear()
    } finally {
        await store.destroy()
        await rm(dir, { recursive: true, force: true })
    }
})

test('sqlite sender-key store handles lists, batching and deletions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-sqlite-sender-'))
    const sqlitePath = join(dir, 'state.sqlite')
    const store = new SenderKeySqliteStore(makeSqliteOptions(sqlitePath, 'session-a'), 1)
    const senderA = makeAddress('5511', 0)
    const senderB = makeAddress('5522', 1)
    const groupId = '120363000000000000@g.us'

    try {
        const record: SenderKeyRecord = {
            groupId,
            sender: senderA,
            keyId: 1,
            iteration: 0,
            chainKey: makeBytes(32, 1),
            signingPublicKey: makeBytes(33, 2),
            signingPrivateKey: makeBytes(32, 3),
            unusedMessageKeys: [{ iteration: 0, seed: makeBytes(50, 4) }]
        }
        await store.upsertSenderKey(record)
        await store.upsertSenderKeyDistribution({
            groupId,
            sender: senderA,
            keyId: 1,
            timestampMs: 1000
        })
        await store.upsertSenderKeyDistributions([
            {
                groupId,
                sender: senderA,
                keyId: 1,
                timestampMs: 1001
            },
            {
                groupId,
                sender: senderB,
                keyId: 2,
                timestampMs: 1002
            }
        ])
        await store.upsertSenderKeyDistributions([])

        const groupList = await store.getGroupSenderKeyList(groupId)
        assert.equal(groupList.skList.length, 1)
        assert.equal(groupList.skDistribList.length, 2)

        const deviceKey = await store.getDeviceSenderKey(groupId, senderA)
        assert.ok(deviceKey)
        assert.equal(deviceKey?.keyId, 1)
        assert.equal(await store.getDeviceSenderKey(groupId, makeAddress('missing', 0)), null)

        const [distribution] = await store.getDeviceSenderKeyDistributions(groupId, [senderB])
        assert.ok(distribution)
        assert.equal(distribution?.keyId, 2)

        const batched = await store.getDeviceSenderKeyDistributions(groupId, [senderA, senderB])
        assert.equal(batched.length, 2)
        assert.equal(batched[0]?.keyId, 1)
        assert.equal(batched[1]?.keyId, 2)
        assert.equal((await store.getDeviceSenderKeyDistributions(groupId, [])).length, 0)

        assert.equal(await store.markForgetSenderKey(groupId, []), 0)
        assert.ok((await store.deleteDeviceSenderKey(senderB, groupId)) > 0)
        assert.equal(await store.deleteDeviceSenderKey(senderB, groupId), 0)
        assert.ok((await store.markForgetSenderKey(groupId, [senderA])) > 0)
    } finally {
        await store.destroy()
        await rm(dir, { recursive: true, force: true })
    }
})

test('sqlite signal store covers prekeys, sessions, identities and state helpers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-sqlite-signal-'))
    const sqlitePath = join(dir, 'state.sqlite')
    const optionsA = makeSqliteOptions(sqlitePath, 'session-a')
    const signalStore = new WaSignalSqliteStore(optionsA)
    const preKeyStore = new WaPreKeySqliteStore(optionsA, { preKeyBatchSize: 1 })
    const sessionStore = new WaSessionSqliteStore(optionsA, { hasSessionBatchSize: 1 })
    const identityStore = new WaIdentitySqliteStore(optionsA)
    const signalStoreB = new WaSignalSqliteStore(makeSqliteOptions(sqlitePath, 'session-b'))

    try {
        assert.equal(await signalStore.getRegistrationInfo(), null)
        const registrationKeyPair = await X25519.generateKeyPair()
        await signalStore.setRegistrationInfo({
            registrationId: 777,
            identityKeyPair: registrationKeyPair
        })
        assert.equal((await signalStore.getRegistrationInfo())?.registrationId, 777)
        assert.equal(await signalStoreB.getRegistrationInfo(), null)

        const signedPreKeyPair = await X25519.generateKeyPair()
        await signalStore.setSignedPreKey({
            keyId: 11,
            keyPair: signedPreKeyPair,
            signature: makeBytes(64, 3),
            uploaded: false
        })
        assert.equal((await signalStore.getSignedPreKey())?.keyId, 11)
        assert.equal((await signalStore.getSignedPreKeyById(11))?.keyId, 11)
        assert.equal(await signalStore.getSignedPreKeyById(12), null)

        await signalStore.setSignedPreKeyRotationTs(1234)
        assert.equal(await signalStore.getSignedPreKeyRotationTs(), 1234)

        const preKeyPair5 = await X25519.generateKeyPair()
        await preKeyStore.putPreKey({
            keyId: 5,
            keyPair: preKeyPair5,
            uploaded: false
        })
        assert.equal((await preKeyStore.getPreKeyById(5))?.keyId, 5)

        const generated = await preKeyStore.getOrGenPreKeys(2, async (keyId) => {
            const keyPair = await X25519.generateKeyPair()
            return {
                keyId,
                keyPair,
                uploaded: false
            }
        })
        assert.equal(generated.length, 2)
        await assert.rejects(
            () =>
                preKeyStore.getOrGenPreKeys(0, async (keyId) => {
                    const keyPair = await X25519.generateKeyPair()
                    return { keyId, keyPair, uploaded: false }
                }),
            /invalid prekey count/
        )

        assert.deepEqual(await preKeyStore.getPreKeysById([]), [])
        const byIds = await preKeyStore.getPreKeysById([5, generated[1].keyId, 999, 5])
        assert.equal(byIds[0]?.keyId, 5)
        assert.equal(byIds[1]?.keyId, generated[1].keyId)
        assert.equal(byIds[2], null)
        assert.equal(byIds[3]?.keyId, 5)

        assert.equal(await preKeyStore.consumePreKeyById(999), null)
        assert.equal((await preKeyStore.consumePreKeyById(5))?.keyId, 5)
        assert.equal(await preKeyStore.getPreKeyById(5), null)

        const single = await preKeyStore.getOrGenSinglePreKey(async (keyId) => {
            const keyPair = await X25519.generateKeyPair()
            return { keyId, keyPair, uploaded: false }
        })
        assert.ok(single.keyId > 0)

        await assert.rejects(() => preKeyStore.markKeyAsUploaded(-1), /out of boundary/)
        await preKeyStore.markKeyAsUploaded(single.keyId)

        await preKeyStore.setServerHasPreKeys(true)
        assert.equal(await preKeyStore.getServerHasPreKeys(), true)

        const sessionAddressA = makeAddress('5511', 0)
        const sessionAddressB = makeAddress('5522', 0)
        assert.equal(await sessionStore.hasSession(sessionAddressA), false)

        const sessionRecord = await makeSessionRecord(1)
        await sessionStore.setSession(sessionAddressA, sessionRecord)
        assert.equal(await sessionStore.hasSession(sessionAddressA), true)
        assert.deepEqual(await sessionStore.hasSessions([]), [])
        assert.deepEqual(await sessionStore.hasSessions([sessionAddressA, sessionAddressB]), [
            true,
            false
        ])
        assert.deepEqual(await sessionStore.getSessionsBatch([]), [])
        assert.deepEqual(await sessionStore.getSessionsBatch([sessionAddressA, sessionAddressB]), [
            sessionRecord,
            null
        ])
        const sessionRecordB = await makeSessionRecord(2)
        await sessionStore.setSessionsBatch([{ address: sessionAddressB, session: sessionRecordB }])
        assert.deepEqual(await sessionStore.getSessionsBatch([sessionAddressA, sessionAddressB]), [
            sessionRecord,
            sessionRecordB
        ])
        assert.ok(await sessionStore.getSession(sessionAddressA))
        await sessionStore.deleteSession(sessionAddressA)
        assert.equal(await sessionStore.getSession(sessionAddressA), null)

        await identityStore.setRemoteIdentity(sessionAddressA, makeBytes(33, 20))
        assert.deepEqual(await identityStore.getRemoteIdentity(sessionAddressA), makeBytes(33, 20))
        assert.deepEqual(await identityStore.getRemoteIdentities([]), [])
        await identityStore.setRemoteIdentities([])
        await identityStore.setRemoteIdentities([
            { address: sessionAddressA, identityKey: makeBytes(33, 21) },
            { address: sessionAddressB, identityKey: makeBytes(33, 22) }
        ])
        assert.deepEqual(await identityStore.getRemoteIdentity(sessionAddressA), makeBytes(33, 21))
        assert.deepEqual(await identityStore.getRemoteIdentity(sessionAddressB), makeBytes(33, 22))
        assert.deepEqual(
            await identityStore.getRemoteIdentities([
                sessionAddressA,
                sessionAddressB,
                sessionAddressA
            ]),
            [makeBytes(33, 21), makeBytes(33, 22), makeBytes(33, 21)]
        )
    } finally {
        await Promise.all([
            signalStore.destroy(),
            signalStoreB.destroy(),
            preKeyStore.destroy(),
            sessionStore.destroy(),
            identityStore.destroy()
        ])
        await rm(dir, { recursive: true, force: true })
    }
})

test('sqlite signal prekey generation is safe across concurrent sessions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-sqlite-signal-concurrency-'))
    const sqlitePath = join(dir, 'state.sqlite')
    const storeA = new WaPreKeySqliteStore(makeSqliteOptions(sqlitePath, 'session-a'))
    const storeB = new WaPreKeySqliteStore(makeSqliteOptions(sqlitePath, 'session-b'))

    try {
        const generator = async (keyId: number) => {
            await new Promise<void>((resolve) => setTimeout(resolve, 15))
            const keyPair = await X25519.generateKeyPair()
            return {
                keyId,
                keyPair,
                uploaded: false
            }
        }
        const [keysA, keysB] = await Promise.all([
            storeA.getOrGenPreKeys(2, generator),
            storeB.getOrGenPreKeys(2, generator)
        ])
        assert.equal(keysA.length, 2)
        assert.equal(keysB.length, 2)
        assert.equal((await storeA.getPreKeyById(keysA[0].keyId))?.keyId, keysA[0].keyId)
        assert.equal((await storeB.getPreKeyById(keysB[0].keyId))?.keyId, keysB[0].keyId)
    } finally {
        await Promise.all([storeA.destroy(), storeB.destroy()])
        await rm(dir, { recursive: true, force: true })
    }
})

test('sqlite shared connection keeps other session alive after one destroy', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-sqlite-destroy-lifecycle-'))
    const sqlitePath = join(dir, 'state.sqlite')
    const storeA = new WaDeviceListSqliteStore(makeSqliteOptions(sqlitePath, 'session-a'), 1_000, 1)
    const storeB = new WaDeviceListSqliteStore(makeSqliteOptions(sqlitePath, 'session-b'), 1_000, 1)

    try {
        await storeA.upsertUserDevicesBatch([
            {
                userJid: '5511@s.whatsapp.net',
                deviceJids: ['5511@s.whatsapp.net'],
                updatedAtMs: 100
            }
        ])
        await storeB.upsertUserDevicesBatch([
            {
                userJid: '5522@s.whatsapp.net',
                deviceJids: ['5522@s.whatsapp.net'],
                updatedAtMs: 100
            }
        ])
        await storeA.destroy()
        const [snapshot] = await storeB.getUserDevicesBatch(['5522@s.whatsapp.net'], 150)
        assert.ok(snapshot)
        assert.equal(snapshot?.userJid, '5522@s.whatsapp.net')
    } finally {
        await Promise.allSettled([storeA.destroy(), storeB.destroy()])
        await rm(dir, { recursive: true, force: true })
    }
})

test('sqlite signal prekey generation keeps monotonic progress for overlapping same-session calls', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-sqlite-signal-same-session-concurrency-'))
    const sqlitePath = join(dir, 'state.sqlite')
    const store = new WaPreKeySqliteStore(makeSqliteOptions(sqlitePath, 'session-a'))

    try {
        const generator = async (keyId: number) => {
            await new Promise<void>((resolve) => setTimeout(resolve, 10))
            const keyPair = await X25519.generateKeyPair()
            return {
                keyId,
                keyPair,
                uploaded: false
            }
        }
        await Promise.all([
            store.getOrGenPreKeys(3, generator),
            store.getOrGenPreKeys(3, generator)
        ])

        const sixKeys = await store.getOrGenPreKeys(6, generator)
        assert.equal(sixKeys.length, 6)
        const keyIds = sixKeys.map((record) => record.keyId).sort((left, right) => left - right)
        assert.deepEqual(keyIds, [1, 2, 3, 4, 5, 6])
    } finally {
        await store.destroy()
        await rm(dir, { recursive: true, force: true })
    }
})

test('sqlite message-secret store covers set/get, batch, TTL expiry and cleanup', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-sqlite-msgsecret-'))
    const sqlitePath = join(dir, 'state.sqlite')
    const store = new WaMessageSecretSqliteStore(makeSqliteOptions(sqlitePath, 'session-a'), 100)

    try {
        const entryA = { secret: new Uint8Array([1, 2, 3]), senderJid: 'alice@s.whatsapp.net' }
        const entryB = { secret: new Uint8Array([4, 5, 6]), senderJid: 'bob@s.whatsapp.net' }

        await store.set('msg-1', entryA)
        await store.set('msg-2', entryB)

        assert.deepEqual(await store.get('msg-1', Date.now()), entryA)
        assert.deepEqual(await store.get('msg-2', Date.now()), entryB)
        assert.equal(await store.get('missing', Date.now()), null)

        // getBatch preserves order and handles missing
        const batch = await store.getBatch(['msg-2', 'missing', 'msg-1'], Date.now())
        assert.equal(batch.length, 3)
        assert.deepEqual(batch[0], entryB)
        assert.equal(batch[1], null)
        assert.deepEqual(batch[2], entryA)

        // empty getBatch
        assert.deepEqual(await store.getBatch([], Date.now()), [])

        // setBatch
        const entryC = { secret: new Uint8Array([7, 8, 9]), senderJid: 'carol@s.whatsapp.net' }
        const entryD = { secret: new Uint8Array([10, 11, 12]), senderJid: 'dave@s.whatsapp.net' }
        await store.setBatch([
            { messageId: 'msg-3', entry: entryC },
            { messageId: 'msg-4', entry: entryD }
        ])
        assert.deepEqual(await store.get('msg-3', Date.now()), entryC)
        assert.deepEqual(await store.get('msg-4', Date.now()), entryD)

        // TTL expiry — reading after TTL returns null
        const expired = await store.get('msg-1', Date.now() + 200)
        assert.equal(expired, null)

        // cleanupExpired
        assert.ok((await store.cleanupExpired(Date.now() + 200)) >= 1)

        // clear
        await store.set('msg-5', entryA)
        await store.clear()
        assert.equal(await store.get('msg-5', Date.now()), null)
    } finally {
        await store.destroy?.()
        await rm(dir, { recursive: true, force: true })
    }
})
