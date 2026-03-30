import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { MongoClient } from 'mongodb'
import { toSerializedPubKey, X25519 } from 'zapo-js/crypto'
import { WA_APP_STATE_COLLECTIONS } from 'zapo-js/protocol'
import type { SignalAddress, SignalSessionRecord } from 'zapo-js/signal'

import { createMongoStore, type WaMongoStoreResult } from '../index'

const host = process.env.ZAPO_TEST_MONGO_HOST
const port = process.env.ZAPO_TEST_MONGO_PORT
let sessionSeed = 0

function nextSessionId(label: string): string {
    sessionSeed += 1
    return `test-session-${label}-${Date.now()}-${sessionSeed}`
}

function makeAddress(user: string, device: number): SignalAddress {
    return { user, server: 's.whatsapp.net', device }
}

async function makeSessionRecord(seed: number): Promise<SignalSessionRecord> {
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
        rootKey: new Uint8Array(32).fill((10 + seed) & 0xff),
        sendChain: {
            ratchetKey: {
                pubKey: toSerializedPubKey(sendRatchet.pubKey),
                privKey: sendRatchet.privKey
            },
            nextMsgIndex: 0,
            chainKey: new Uint8Array(32).fill((11 + seed) & 0xff)
        },
        recvChains: [
            {
                ratchetPubKey: toSerializedPubKey(recvRatchet.pubKey),
                nextMsgIndex: 0,
                chainKey: new Uint8Array(32).fill((12 + seed) & 0xff),
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

describe('store-mongo integration', { timeout: 60_000 }, () => {
    let client: MongoClient | undefined
    let store: WaMongoStoreResult | undefined

    before(async () => {
        if (!host || !port) return

        client = new MongoClient(`mongodb://${host}:${port}`, {
            directConnection: true
        })
        await client.connect()

        store = createMongoStore({
            db: client.db('zapo_test')
        })
    })

    after(async () => {
        if (store) await store.destroy()
        if (client) await client.close()
    })

    it('auth: save, load, clear', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const auth = store.stores.auth('test-session')
        assert.equal(await auth.load(), null)

        const creds = {
            noiseKeyPair: { pubKey: new Uint8Array(32), privKey: new Uint8Array(32) },
            registrationInfo: {
                registrationId: 12345,
                identityKeyPair: { pubKey: new Uint8Array(33), privKey: new Uint8Array(32) }
            },
            signedPreKey: {
                keyId: 1,
                keyPair: { pubKey: new Uint8Array(33), privKey: new Uint8Array(32) },
                signature: new Uint8Array(64),
                uploaded: false
            },
            advSecretKey: new Uint8Array(32)
        }
        await auth.save(creds)

        const loaded = await auth.load()
        assert.ok(loaded)
        assert.equal(loaded.registrationInfo.registrationId, 12345)
        assert.equal(loaded.noiseKeyPair.pubKey.length, creds.noiseKeyPair.pubKey.length)
        assert.ok(loaded.noiseKeyPair.pubKey.every((b, i) => b === creds.noiseKeyPair.pubKey[i]))

        await auth.clear()
        assert.equal(await auth.load(), null)
    })

    it('messages: upsert, getById, listByThread, deleteById', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const messages = store.stores.messages('test-session')

        await messages.upsert({
            id: 'msg-1',
            threadJid: 'thread-1',
            fromMe: true,
            timestampMs: 1000
        })
        await messages.upsert({
            id: 'msg-2',
            threadJid: 'thread-1',
            fromMe: false,
            timestampMs: 2000
        })

        const msg = await messages.getById('msg-1')
        assert.ok(msg)
        assert.equal(msg.id, 'msg-1')
        assert.equal(msg.fromMe, true)

        const list = await messages.listByThread('thread-1')
        assert.equal(list.length, 2)
        assert.equal(list[0].id, 'msg-2')

        const deleted = await messages.deleteById('msg-1')
        assert.equal(deleted, 1)
        assert.equal(await messages.getById('msg-1'), null)

        await messages.clear()
    })

    it('retry: upsertOutbound, getOutbound, incrementInbound, cleanupExpired', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const retry = store.caches.retry('test-session')
        await retry.clear()
        const now = Date.now()

        await retry.upsertOutboundMessage({
            messageId: 'retry-1',
            toJid: 'to@s.whatsapp.net',
            messageType: 'text',
            replayMode: 'plaintext',
            replayPayload: new Uint8Array([1, 2, 3]),
            state: 'pending',
            createdAtMs: now,
            updatedAtMs: now,
            expiresAtMs: now + 60_000,
            eligibleRequesterDeviceJids: ['dev1@s.whatsapp.net'],
            deliveredRequesterDeviceJids: undefined
        })

        const outbound = await retry.getOutboundMessage('retry-1')
        assert.ok(outbound)
        assert.equal(outbound.messageId, 'retry-1')
        assert.equal(outbound.state, 'pending')

        const count = await retry.incrementInboundCounter(
            'inbound-1',
            'requester@s.whatsapp.net',
            now,
            now + 60_000
        )
        assert.equal(count, 1)

        const count2 = await retry.incrementInboundCounter(
            'inbound-1',
            'requester@s.whatsapp.net',
            now,
            now + 60_000
        )
        assert.equal(count2, 2)

        const cleaned = await retry.cleanupExpired(now + 120_000)
        assert.equal(cleaned, 0) // MongoDB uses native TTL indexes, cleanupExpired is a no-op

        await retry.clear()
    })

    it('signal: registration and prekeys', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const signal = store.stores.signal('test-session')

        assert.equal(await signal.getRegistrationInfo(), null)

        const regInfo = {
            registrationId: 42,
            identityKeyPair: {
                pubKey: new Uint8Array(33).fill(1),
                privKey: new Uint8Array(32).fill(2)
            }
        }
        await signal.setRegistrationInfo(regInfo)

        const loaded = await signal.getRegistrationInfo()
        assert.ok(loaded)
        assert.equal(loaded.registrationId, 42)

        await signal.clear()
    })

    it('mailbox stores: thread/contact/privacy-token coalesce updates', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('mailbox')
        const threads = store.stores.threads(sessionId)
        const contacts = store.stores.contacts(sessionId)
        const privacyTokens = store.stores.privacyToken(sessionId)

        await threads.upsert({
            jid: 'chat-1@s.whatsapp.net',
            name: 'Chat 1',
            unreadCount: 3
        })
        await threads.upsert({
            jid: 'chat-1@s.whatsapp.net',
            archived: true
        })
        const thread = await threads.getByJid('chat-1@s.whatsapp.net')
        assert.ok(thread)
        assert.equal(thread.name, 'Chat 1')
        assert.equal(thread.unreadCount, 3)
        assert.equal(thread.archived, true)

        await contacts.upsert({
            jid: 'alice@s.whatsapp.net',
            displayName: 'Alice',
            lastUpdatedMs: 1_000
        })
        await contacts.upsert({
            jid: 'alice@s.whatsapp.net',
            phoneNumber: '5511999999999',
            lastUpdatedMs: 2_000
        })
        const contact = await contacts.getByJid('alice@s.whatsapp.net')
        assert.ok(contact)
        assert.equal(contact.displayName, 'Alice')
        assert.equal(contact.phoneNumber, '5511999999999')
        assert.equal(contact.lastUpdatedMs, 2_000)

        await privacyTokens.upsert({
            jid: 'alice@s.whatsapp.net',
            tcToken: new Uint8Array([1, 2, 3]),
            updatedAtMs: 10
        })
        await privacyTokens.upsert({
            jid: 'alice@s.whatsapp.net',
            nctSalt: new Uint8Array([7, 8, 9]),
            updatedAtMs: 11
        })
        const privacy = await privacyTokens.getByJid('alice@s.whatsapp.net')
        assert.ok(privacy)
        assert.deepEqual(Array.from(privacy.tcToken ?? []), [1, 2, 3])
        assert.deepEqual(Array.from(privacy.nctSalt ?? []), [7, 8, 9])
        assert.equal(privacy.updatedAtMs, 11)

        await Promise.all([threads.clear(), contacts.clear(), privacyTokens.clear()])
    })

    it('appstate: sync keys and collection state roundtrip', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('appstate')
        const appState = store.stores.appState(sessionId)
        await appState.clear()

        const keyId = new Uint8Array([1, 2, 3, 4])
        const keyData = new Uint8Array([9, 8, 7, 6])
        const inserted = await appState.upsertSyncKeys([
            {
                keyId,
                keyData,
                timestamp: 123_456
            }
        ])
        assert.equal(inserted, 1)

        const activeKey = await appState.getActiveSyncKey()
        assert.ok(activeKey)
        assert.deepEqual(Array.from(activeKey.keyId), Array.from(keyId))
        assert.deepEqual(Array.from(activeKey.keyData), Array.from(keyData))

        const collection = WA_APP_STATE_COLLECTIONS.REGULAR_LOW
        const hash = new Uint8Array([5, 6, 7])
        const indexValueMap = new Map<string, Uint8Array>([['aa11', new Uint8Array([4, 2])]])
        await appState.setCollectionStates([
            {
                collection,
                version: 2,
                hash,
                indexValueMap
            }
        ])

        const state = await appState.getCollectionState(collection)
        assert.equal(state.initialized, true)
        assert.equal(state.version, 2)
        assert.deepEqual(Array.from(state.hash), [5, 6, 7])
        assert.deepEqual(Array.from(state.indexValueMap.get('aa11') ?? []), [4, 2])

        const states = await appState.getCollectionStates([
            collection,
            WA_APP_STATE_COLLECTIONS.REGULAR
        ])
        assert.equal(states.length, 2)
        assert.equal(states[0].initialized, true)
        assert.equal(states[1].initialized, false)

        await appState.clear()
    })

    it('retry: requester status and delivered transition', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('retry')
        const retry = store.caches.retry(sessionId)
        await retry.clear()
        const now = Date.now()
        const expiresAtMs = now + 60_000

        await retry.upsertOutboundMessage({
            messageId: 'retry-status-1',
            toJid: 'to@s.whatsapp.net',
            messageType: 'text',
            replayMode: 'plaintext',
            replayPayload: new Uint8Array([1, 2, 3]),
            state: 'pending',
            createdAtMs: now,
            updatedAtMs: now,
            expiresAtMs,
            eligibleRequesterDeviceJids: ['dev1@s.whatsapp.net', 'dev2@s.whatsapp.net'],
            deliveredRequesterDeviceJids: undefined
        })

        const before = await retry.getOutboundRequesterStatus(
            'retry-status-1',
            'dev1@s.whatsapp.net'
        )
        assert.deepEqual(before, { eligible: true, delivered: false })

        await retry.markOutboundRequesterDelivered(
            'retry-status-1',
            'dev1@s.whatsapp.net',
            now + 1,
            expiresAtMs
        )

        const after = await retry.getOutboundRequesterStatus(
            'retry-status-1',
            'dev1@s.whatsapp.net'
        )
        assert.deepEqual(after, { eligible: true, delivered: true })

        const nonEligible = await retry.getOutboundRequesterStatus(
            'retry-status-1',
            'unknown@s.whatsapp.net'
        )
        assert.deepEqual(nonEligible, { eligible: false, delivered: false })

        await retry.clear()
    })

    it('messages: upsertBatch and beforeTimestamp pagination', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('messages-batch')
        const messages = store.stores.messages(sessionId)

        await messages.upsertBatch([
            {
                id: 'b-msg-1',
                threadJid: 'batch-thread@s.whatsapp.net',
                fromMe: true,
                timestampMs: 1_000
            },
            {
                id: 'b-msg-2',
                threadJid: 'batch-thread@s.whatsapp.net',
                fromMe: false,
                timestampMs: 2_000
            },
            {
                id: 'b-msg-3',
                threadJid: 'batch-thread@s.whatsapp.net',
                fromMe: true,
                timestampMs: 3_000
            }
        ])

        const latestTwo = await messages.listByThread('batch-thread@s.whatsapp.net', 2)
        assert.equal(latestTwo.length, 2)
        assert.equal(latestTwo[0].id, 'b-msg-3')
        assert.equal(latestTwo[1].id, 'b-msg-2')

        const beforeThreeThousand = await messages.listByThread(
            'batch-thread@s.whatsapp.net',
            10,
            3_000
        )
        assert.equal(beforeThreeThousand.length, 2)
        assert.equal(beforeThreeThousand[0].id, 'b-msg-2')
        assert.equal(beforeThreeThousand[1].id, 'b-msg-1')

        await messages.clear()
    })

    it('cache stores: participants and device-list basic lifecycle', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('caches')
        const participants = store.caches.participants(sessionId)
        const deviceList = store.caches.deviceList(sessionId)
        const now = Date.now()

        await participants.upsertGroupParticipants({
            groupJid: 'group-1@g.us',
            participants: ['a@s.whatsapp.net', 'b@s.whatsapp.net'],
            updatedAtMs: now
        })
        const participantSnapshot = await participants.getGroupParticipants('group-1@g.us', now)
        assert.ok(participantSnapshot)
        assert.deepEqual(participantSnapshot.participants, ['a@s.whatsapp.net', 'b@s.whatsapp.net'])
        assert.equal(await participants.deleteGroupParticipants('group-1@g.us'), 1)
        assert.equal(await participants.getGroupParticipants('group-1@g.us', now), null)
        assert.equal(await participants.cleanupExpired(now + 60_000), 0)

        await deviceList.upsertUserDevicesBatch([
            {
                userJid: 'user-1@s.whatsapp.net',
                deviceJids: ['user-1:1@s.whatsapp.net', 'user-1:2@s.whatsapp.net'],
                updatedAtMs: now
            },
            {
                userJid: 'user-2@s.whatsapp.net',
                deviceJids: ['user-2:1@s.whatsapp.net'],
                updatedAtMs: now
            }
        ])
        const devices = await deviceList.getUserDevicesBatch(
            ['user-2@s.whatsapp.net', 'missing@s.whatsapp.net', 'user-1@s.whatsapp.net'],
            now
        )
        assert.equal(devices.length, 3)
        assert.equal(devices[0]?.userJid, 'user-2@s.whatsapp.net')
        assert.equal(devices[1], null)
        assert.deepEqual(devices[2]?.deviceJids, [
            'user-1:1@s.whatsapp.net',
            'user-1:2@s.whatsapp.net'
        ])
        assert.equal(await deviceList.deleteUserDevices('user-1@s.whatsapp.net'), 1)
        assert.equal(
            (await deviceList.getUserDevicesBatch(['user-1@s.whatsapp.net'], now))[0],
            null
        )
        assert.equal(await deviceList.cleanupExpired(now + 60_000), 0)

        await Promise.all([participants.clear(), deviceList.clear()])
    })

    it('signal: prekey generation mark-uploaded and consume', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('signal-prekeys')
        const preKey = store.stores.preKey(sessionId)
        await preKey.clear()

        const generated = await preKey.getOrGenPreKeys(2, (keyId) => ({
            keyId,
            keyPair: {
                pubKey: new Uint8Array(33).fill(keyId % 255),
                privKey: new Uint8Array(32).fill((keyId + 1) % 255)
            },
            uploaded: false
        }))
        assert.equal(generated.length, 2)

        await preKey.markKeyAsUploaded(generated[0].keyId)
        const uploadedRecord = await preKey.getPreKeyById(generated[0].keyId)
        assert.ok(uploadedRecord)
        assert.equal(uploadedRecord.uploaded, true)

        const consumed = await preKey.consumePreKeyById(generated[0].keyId)
        assert.ok(consumed)
        assert.equal(consumed.keyId, generated[0].keyId)
        assert.equal(await preKey.getPreKeyById(generated[0].keyId), null)

        await preKey.clear()
    })

    it('auth: saves and loads optional credential fields', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('auth-optional')
        const auth = store.stores.auth(sessionId)
        await auth.clear()

        const creds = {
            noiseKeyPair: {
                pubKey: new Uint8Array(32).fill(1),
                privKey: new Uint8Array(32).fill(2)
            },
            registrationInfo: {
                registrationId: 54321,
                identityKeyPair: {
                    pubKey: new Uint8Array(33).fill(3),
                    privKey: new Uint8Array(32).fill(4)
                }
            },
            signedPreKey: {
                keyId: 9,
                keyPair: {
                    pubKey: new Uint8Array(33).fill(5),
                    privKey: new Uint8Array(32).fill(6)
                },
                signature: new Uint8Array(64).fill(7),
                uploaded: false
            },
            advSecretKey: new Uint8Array(32).fill(8),
            meJid: 'me@s.whatsapp.net',
            meLid: '12345@lid',
            meDisplayName: 'Zapo User',
            companionEncStatic: new Uint8Array([10, 11, 12]),
            platform: 'android',
            serverStaticKey: new Uint8Array([13, 14, 15]),
            serverHasPreKeys: true,
            routingInfo: new Uint8Array([16, 17]),
            lastSuccessTs: 99_001,
            propsVersion: 7,
            abPropsVersion: 8,
            connectionLocation: 'br',
            accountCreationTs: 88_002
        }

        await auth.save(creds)
        const loaded = await auth.load()
        assert.ok(loaded)
        assert.equal(loaded.meJid, creds.meJid)
        assert.equal(loaded.meLid, creds.meLid)
        assert.equal(loaded.meDisplayName, creds.meDisplayName)
        assert.equal(loaded.platform, creds.platform)
        assert.equal(loaded.serverHasPreKeys, true)
        assert.deepEqual(Array.from(loaded.routingInfo ?? []), [16, 17])
        assert.equal(loaded.propsVersion, 7)
        assert.equal(loaded.abPropsVersion, 8)
        assert.equal(loaded.connectionLocation, 'br')
        assert.equal(loaded.accountCreationTs, 88_002)

        await auth.clear()
    })

    it('retry: updateOutboundMessageState and deleteOutboundMessage', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('retry-update')
        const retry = store.caches.retry(sessionId)
        await retry.clear()

        const now = Date.now()
        const expiresAtMs = now + 120_000
        await retry.upsertOutboundMessage({
            messageId: 'retry-update-1',
            toJid: 'to@s.whatsapp.net',
            messageType: 'text',
            replayMode: 'plaintext',
            replayPayload: new Uint8Array([31, 32]),
            state: 'pending',
            createdAtMs: now,
            updatedAtMs: now,
            expiresAtMs
        })

        await retry.updateOutboundMessageState('retry-update-1', 'delivered', now + 5, expiresAtMs)
        const updated = await retry.getOutboundMessage('retry-update-1')
        assert.ok(updated)
        assert.equal(updated.state, 'delivered')
        assert.equal(updated.updatedAtMs, now + 5)

        const deleted = await retry.deleteOutboundMessage('retry-update-1')
        assert.equal(deleted, 1)
        assert.equal(await retry.getOutboundMessage('retry-update-1'), null)

        await retry.clear()
    })

    it('sender-key: upsert batch, lookup and forget by participant', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('sender-key')
        const senderKey = store.stores.senderKey(sessionId)
        await senderKey.clear()

        const senderA = { user: '11111', server: 's.whatsapp.net', device: 1 } as const
        const senderB = { user: '22222', server: 's.whatsapp.net', device: 2 } as const
        const groupId = 'group-1@g.us'
        const now = Date.now()

        await senderKey.upsertSenderKey({
            groupId,
            sender: senderA,
            keyId: 10,
            iteration: 1,
            chainKey: new Uint8Array(32).fill(1),
            signingPublicKey: new Uint8Array(32).fill(2),
            signingPrivateKey: new Uint8Array(32).fill(3)
        })
        await senderKey.upsertSenderKey({
            groupId,
            sender: senderB,
            keyId: 11,
            iteration: 1,
            chainKey: new Uint8Array(32).fill(4),
            signingPublicKey: new Uint8Array(32).fill(5),
            signingPrivateKey: new Uint8Array(32).fill(6)
        })

        await senderKey.upsertSenderKeyDistribution({
            groupId,
            sender: senderA,
            keyId: 10,
            timestampMs: now
        })
        await senderKey.upsertSenderKeyDistributions([
            {
                groupId,
                sender: senderB,
                keyId: 11,
                timestampMs: now + 1
            }
        ])

        const groupList = await senderKey.getGroupSenderKeyList(groupId)
        assert.equal(groupList.skList.length, 2)
        assert.equal(groupList.skDistribList.length, 2)

        const senderAKey = await senderKey.getDeviceSenderKey(groupId, senderA)
        assert.ok(senderAKey)
        assert.equal(senderAKey.keyId, 10)

        const distributions = await senderKey.getDeviceSenderKeyDistributions(groupId, [
            senderA,
            { user: '99999', server: 's.whatsapp.net', device: 9 }
        ])
        assert.equal(distributions.length, 2)
        assert.equal(distributions[0]?.keyId, 10)
        assert.equal(distributions[1], null)

        const forgotten = await senderKey.markForgetSenderKey(groupId, [senderA])
        assert.ok(forgotten >= 1)
        assert.equal(await senderKey.getDeviceSenderKey(groupId, senderA), null)
        assert.ok(await senderKey.getDeviceSenderKey(groupId, senderB))

        await senderKey.clear()
    })

    it('signal: signed prekey and meta snapshot', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('signal-meta')
        const signal = store.stores.signal(sessionId)
        const preKey = store.stores.preKey(sessionId)
        await signal.clear()

        await signal.setSignedPreKey({
            keyId: 21,
            keyPair: {
                pubKey: new Uint8Array(33).fill(9),
                privKey: new Uint8Array(32).fill(10)
            },
            signature: new Uint8Array(64).fill(11),
            uploaded: true
        })
        await signal.setSignedPreKeyRotationTs(123_456)
        await preKey.setServerHasPreKeys(true)

        const byId = await signal.getSignedPreKeyById(21)
        assert.ok(byId)
        assert.equal(byId.keyId, 21)
        assert.equal(byId.uploaded, true)
        assert.equal(await signal.getSignedPreKeyRotationTs(), 123_456)
        assert.equal(await preKey.getServerHasPreKeys(), true)

        const signedPreKey = await signal.getSignedPreKey()
        const signedPreKeyRotationTs = await signal.getSignedPreKeyRotationTs()
        const serverHasPreKeys = await preKey.getServerHasPreKeys()
        assert.equal(serverHasPreKeys, true)
        assert.equal(signedPreKeyRotationTs, 123_456)
        assert.equal(signedPreKey?.keyId, 21)

        await signal.clear()
    })

    it('signal: getPreKeysById preserves order and missing entries', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('signal-prekeys-order')
        const preKey = store.stores.preKey(sessionId)
        await preKey.clear()

        await preKey.putPreKey({
            keyId: 1,
            keyPair: {
                pubKey: new Uint8Array(33).fill(1),
                privKey: new Uint8Array(32).fill(2)
            },
            uploaded: false
        })
        await preKey.putPreKey({
            keyId: 3,
            keyPair: {
                pubKey: new Uint8Array(33).fill(3),
                privKey: new Uint8Array(32).fill(4)
            },
            uploaded: false
        })

        const records = await preKey.getPreKeysById([3, 2, 1, 3])
        assert.equal(records.length, 4)
        assert.equal(records[0]?.keyId, 3)
        assert.equal(records[1], null)
        assert.equal(records[2]?.keyId, 1)
        assert.equal(records[3]?.keyId, 3)

        await preKey.clear()
    })

    it('appstate: exportData returns keys and collections snapshot', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('appstate-export')
        const appState = store.stores.appState(sessionId)
        await appState.clear()

        await appState.upsertSyncKeys([
            {
                keyId: new Uint8Array([1, 1, 1, 1]),
                keyData: new Uint8Array([9, 9, 9, 9]),
                timestamp: 111
            },
            {
                keyId: new Uint8Array([2, 2, 2, 2]),
                keyData: new Uint8Array([8, 8, 8, 8]),
                timestamp: 222
            }
        ])

        await appState.setCollectionStates([
            {
                collection: WA_APP_STATE_COLLECTIONS.REGULAR,
                version: 3,
                hash: new Uint8Array([1, 1, 1]),
                indexValueMap: new Map<string, Uint8Array>([['aa', new Uint8Array([9])]])
            },
            {
                collection: WA_APP_STATE_COLLECTIONS.CRITICAL_BLOCK,
                version: 4,
                hash: new Uint8Array([2, 2, 2]),
                indexValueMap: new Map<string, Uint8Array>([['bb', new Uint8Array([8])]])
            }
        ])

        const exported = await appState.exportData()
        assert.equal(exported.keys.length, 2)
        assert.equal(exported.collections[WA_APP_STATE_COLLECTIONS.REGULAR]?.version, 3)
        assert.deepEqual(
            Array.from(exported.collections[WA_APP_STATE_COLLECTIONS.REGULAR]?.hash ?? []),
            [1, 1, 1]
        )
        assert.deepEqual(
            Array.from(
                exported.collections[WA_APP_STATE_COLLECTIONS.REGULAR]?.indexValueMap.aa ??
                    new Uint8Array()
            ),
            [9]
        )
        assert.equal(exported.collections[WA_APP_STATE_COLLECTIONS.CRITICAL_BLOCK]?.version, 4)

        await appState.clear()
    })

    it('messages: binary payload roundtrip', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('messages-binary')
        const messages = store.stores.messages(sessionId)
        await messages.clear()

        await messages.upsert({
            id: 'bin-msg-1',
            threadJid: 'thread-bin@s.whatsapp.net',
            senderJid: 'alice@s.whatsapp.net',
            participantJid: 'alice:1@s.whatsapp.net',
            fromMe: false,
            timestampMs: 4_321,
            encType: 'msg',
            plaintext: new Uint8Array([1, 2, 3]),
            messageBytes: new Uint8Array([4, 5, 6, 7])
        })

        const loaded = await messages.getById('bin-msg-1')
        assert.ok(loaded)
        assert.equal(loaded.senderJid, 'alice@s.whatsapp.net')
        assert.equal(loaded.participantJid, 'alice:1@s.whatsapp.net')
        assert.equal(loaded.encType, 'msg')
        assert.deepEqual(Array.from(loaded.plaintext ?? []), [1, 2, 3])
        assert.deepEqual(Array.from(loaded.messageBytes ?? []), [4, 5, 6, 7])

        const listed = await messages.listByThread('thread-bin@s.whatsapp.net')
        assert.equal(listed.length, 1)
        assert.equal(listed[0].id, 'bin-msg-1')

        await messages.clear()
    })

    it('messages: upsert same id can move message across threads', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('messages-move')
        const messages = store.stores.messages(sessionId)
        await messages.clear()

        await messages.upsert({
            id: 'move-msg-1',
            threadJid: 'thread-a@s.whatsapp.net',
            fromMe: true,
            timestampMs: 1_000
        })
        await messages.upsert({
            id: 'move-msg-1',
            threadJid: 'thread-b@s.whatsapp.net',
            fromMe: false,
            timestampMs: 2_000
        })

        const loaded = await messages.getById('move-msg-1')
        assert.ok(loaded)
        assert.equal(loaded.threadJid, 'thread-b@s.whatsapp.net')
        assert.equal(loaded.fromMe, false)
        assert.equal(loaded.timestampMs, 2_000)

        const listA = await messages.listByThread('thread-a@s.whatsapp.net')
        const listB = await messages.listByThread('thread-b@s.whatsapp.net')
        assert.equal(listA.length, 0)
        assert.equal(listB.length, 1)
        assert.equal(listB[0].id, 'move-msg-1')

        await messages.clear()
    })

    it('retry: requester status is null when no eligible requesters', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('retry-no-eligible')
        const retry = store.caches.retry(sessionId)
        await retry.clear()

        const now = Date.now()
        const expiresAtMs = now + 60_000
        await retry.upsertOutboundMessage({
            messageId: 'retry-no-eligible-1',
            toJid: 'to@s.whatsapp.net',
            messageType: 'text',
            replayMode: 'plaintext',
            replayPayload: new Uint8Array([1]),
            state: 'pending',
            createdAtMs: now,
            updatedAtMs: now,
            expiresAtMs
        })

        const status = await retry.getOutboundRequesterStatus(
            'retry-no-eligible-1',
            'dev1@s.whatsapp.net'
        )
        assert.equal(status, null)

        await retry.markOutboundRequesterDelivered(
            'retry-no-eligible-1',
            'dev1@s.whatsapp.net',
            now + 1,
            expiresAtMs
        )
        const afterMark = await retry.getOutboundRequesterStatus(
            'retry-no-eligible-1',
            'dev1@s.whatsapp.net'
        )
        assert.equal(afterMark, null)

        await retry.clear()
    })

    it('signal: remote identities batch roundtrip keeps order and nulls', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('signal-identities')
        const identity = store.stores.identity(sessionId)
        await identity.clear()

        const addressA = { user: '11111', server: 's.whatsapp.net', device: 1 } as const
        const addressB = { user: '22222', server: 's.whatsapp.net', device: 2 } as const
        const missing = { user: '99999', server: 's.whatsapp.net', device: 9 } as const

        await identity.setRemoteIdentities([
            { address: addressA, identityKey: new Uint8Array([1, 2, 3]) },
            { address: addressB, identityKey: new Uint8Array([4, 5, 6]) }
        ])

        const single = await identity.getRemoteIdentity(addressA)
        assert.deepEqual(Array.from(single ?? []), [1, 2, 3])

        const batch = await identity.getRemoteIdentities([addressB, missing, addressA])
        assert.equal(batch.length, 3)
        assert.deepEqual(Array.from(batch[0] ?? []), [4, 5, 6])
        assert.equal(batch[1], null)
        assert.deepEqual(Array.from(batch[2] ?? []), [1, 2, 3])

        await identity.clear()
    })

    it('sender-key: deleteDeviceSenderKey without group clears all groups for sender', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('sender-key-delete-all')
        const senderKey = store.stores.senderKey(sessionId)
        await senderKey.clear()

        const senderA = { user: '11111', server: 's.whatsapp.net', device: 1 } as const
        const senderB = { user: '22222', server: 's.whatsapp.net', device: 1 } as const
        const groupA = 'group-a@g.us'
        const groupB = 'group-b@g.us'
        const now = Date.now()

        await senderKey.upsertSenderKey({
            groupId: groupA,
            sender: senderA,
            keyId: 1,
            iteration: 1,
            chainKey: new Uint8Array(32).fill(1),
            signingPublicKey: new Uint8Array(32).fill(2),
            signingPrivateKey: new Uint8Array(32).fill(3)
        })
        await senderKey.upsertSenderKey({
            groupId: groupB,
            sender: senderA,
            keyId: 2,
            iteration: 1,
            chainKey: new Uint8Array(32).fill(4),
            signingPublicKey: new Uint8Array(32).fill(5),
            signingPrivateKey: new Uint8Array(32).fill(6)
        })
        await senderKey.upsertSenderKey({
            groupId: groupA,
            sender: senderB,
            keyId: 3,
            iteration: 1,
            chainKey: new Uint8Array(32).fill(7),
            signingPublicKey: new Uint8Array(32).fill(8),
            signingPrivateKey: new Uint8Array(32).fill(9)
        })

        await senderKey.upsertSenderKeyDistribution({
            groupId: groupA,
            sender: senderA,
            keyId: 1,
            timestampMs: now
        })
        await senderKey.upsertSenderKeyDistribution({
            groupId: groupB,
            sender: senderA,
            keyId: 2,
            timestampMs: now + 1
        })

        const deleted = await senderKey.deleteDeviceSenderKey(senderA)
        assert.ok(deleted >= 3)
        assert.equal(await senderKey.getDeviceSenderKey(groupA, senderA), null)
        assert.equal(await senderKey.getDeviceSenderKey(groupB, senderA), null)
        assert.ok(await senderKey.getDeviceSenderKey(groupA, senderB))

        await senderKey.clear()
    })

    it('signal: session lifecycle and batch queries', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('signal-sessions')
        const session = store.stores.session(sessionId)
        await session.clear()

        const addressA = makeAddress('11111', 1)
        const addressB = makeAddress('22222', 2)
        const addressC = makeAddress('33333', 3)
        const sessionA = await makeSessionRecord(1)
        const sessionB = await makeSessionRecord(2)

        assert.equal(await session.hasSession(addressA), false)
        await session.setSession(addressA, sessionA)
        await session.setSessionsBatch([{ address: addressB, session: sessionB }])

        const hasBatch = await session.hasSessions([addressA, addressB, addressC])
        assert.deepEqual(hasBatch, [true, true, false])

        const sessionsBatch = await session.getSessionsBatch([addressB, addressC, addressA])
        assert.equal(sessionsBatch[0]?.local.regId, sessionB.local.regId)
        assert.equal(sessionsBatch[1], null)
        assert.equal(sessionsBatch[2]?.local.regId, sessionA.local.regId)

        await session.deleteSession(addressA)
        assert.equal(await session.hasSession(addressA), false)

        await session.clear()
    })

    it('appstate: updating same collection replaces previous index entries', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('appstate-overwrite')
        const appState = store.stores.appState(sessionId)
        await appState.clear()

        const collection = WA_APP_STATE_COLLECTIONS.REGULAR_HIGH
        await appState.setCollectionStates([
            {
                collection,
                version: 1,
                hash: new Uint8Array([1]),
                indexValueMap: new Map<string, Uint8Array>([
                    ['aa', new Uint8Array([1])],
                    ['bb', new Uint8Array([2])]
                ])
            }
        ])
        await appState.setCollectionStates([
            {
                collection,
                version: 2,
                hash: new Uint8Array([2]),
                indexValueMap: new Map<string, Uint8Array>([['cc', new Uint8Array([3])]])
            }
        ])

        const state = await appState.getCollectionState(collection)
        assert.equal(state.version, 2)
        assert.equal(state.indexValueMap.size, 1)
        assert.equal(state.indexValueMap.has('aa'), false)
        assert.deepEqual(Array.from(state.indexValueMap.get('cc') ?? []), [3])

        await appState.clear()
    })

    it('retry: inbound counters are isolated by message and requester', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('retry-inbound-isolation')
        const retry = store.caches.retry(sessionId)
        await retry.clear()

        const now = Date.now()
        const expiresAtMs = now + 60_000
        assert.equal(await retry.incrementInboundCounter('msg-1', 'dev-a', now, expiresAtMs), 1)
        assert.equal(await retry.incrementInboundCounter('msg-1', 'dev-a', now, expiresAtMs), 2)
        assert.equal(await retry.incrementInboundCounter('msg-1', 'dev-b', now, expiresAtMs), 1)
        assert.equal(await retry.incrementInboundCounter('msg-2', 'dev-a', now, expiresAtMs), 1)

        await retry.clear()
    })

    it('sender-key: deleteDeviceSenderKey with group keeps other groups', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('sender-key-delete-group')
        const senderKey = store.stores.senderKey(sessionId)
        await senderKey.clear()

        const sender = { user: '11111', server: 's.whatsapp.net', device: 1 } as const
        await senderKey.upsertSenderKey({
            groupId: 'group-a@g.us',
            sender,
            keyId: 1,
            iteration: 1,
            chainKey: new Uint8Array(32).fill(1),
            signingPublicKey: new Uint8Array(32).fill(2),
            signingPrivateKey: new Uint8Array(32).fill(3)
        })
        await senderKey.upsertSenderKey({
            groupId: 'group-b@g.us',
            sender,
            keyId: 2,
            iteration: 1,
            chainKey: new Uint8Array(32).fill(4),
            signingPublicKey: new Uint8Array(32).fill(5),
            signingPrivateKey: new Uint8Array(32).fill(6)
        })

        const deleted = await senderKey.deleteDeviceSenderKey(sender, 'group-a@g.us')
        assert.ok(deleted >= 1)
        assert.equal(await senderKey.getDeviceSenderKey('group-a@g.us', sender), null)
        assert.ok(await senderKey.getDeviceSenderKey('group-b@g.us', sender))

        await senderKey.clear()
    })

    it('contacts: upsertBatch updates records and delete missing returns zero', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('contacts-batch')
        const contacts = store.stores.contacts(sessionId)
        await contacts.clear()

        await contacts.upsertBatch([
            {
                jid: 'a@s.whatsapp.net',
                displayName: 'Alice',
                lastUpdatedMs: 1_000
            },
            {
                jid: 'b@s.whatsapp.net',
                displayName: 'Bob',
                lastUpdatedMs: 1_000
            }
        ])
        await contacts.upsertBatch([
            {
                jid: 'a@s.whatsapp.net',
                phoneNumber: '551100000001',
                lastUpdatedMs: 2_000
            }
        ])

        const alice = await contacts.getByJid('a@s.whatsapp.net')
        assert.ok(alice)
        assert.equal(alice.displayName, 'Alice')
        assert.equal(alice.phoneNumber, '551100000001')
        assert.equal(alice.lastUpdatedMs, 2_000)

        assert.equal(await contacts.deleteByJid('missing@s.whatsapp.net'), 0)
        await contacts.clear()
    })

    it('threads: list respects limit and delete missing returns zero', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('threads-limit')
        const threads = store.stores.threads(sessionId)
        await threads.clear()

        await threads.upsertBatch([
            { jid: 'thread-1@s.whatsapp.net', name: 'Thread 1' },
            { jid: 'thread-2@s.whatsapp.net', name: 'Thread 2' },
            { jid: 'thread-3@s.whatsapp.net', name: 'Thread 3' }
        ])

        const limited = await threads.list(2)
        assert.equal(limited.length, 2)
        assert.equal(await threads.deleteByJid('missing@s.whatsapp.net'), 0)

        await threads.clear()
    })

    it('appstate: getSyncKeyDataBatch preserves duplicates and missing keys', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('appstate-batch-keys')
        const appState = store.stores.appState(sessionId)
        await appState.clear()

        const keyA = new Uint8Array([1, 1, 1, 1])
        const keyB = new Uint8Array([2, 2, 2, 2])
        const dataA = new Uint8Array([9, 9])
        const dataB = new Uint8Array([8, 8])
        await appState.upsertSyncKeys([
            { keyId: keyA, keyData: dataA, timestamp: 10 },
            { keyId: keyB, keyData: dataB, timestamp: 20 }
        ])

        const resolved = await appState.getSyncKeyDataBatch([keyB, new Uint8Array([7]), keyA, keyB])
        assert.equal(resolved.length, 4)
        assert.deepEqual(Array.from(resolved[0] ?? []), [8, 8])
        assert.equal(resolved[1], null)
        assert.deepEqual(Array.from(resolved[2] ?? []), [9, 9])
        assert.deepEqual(Array.from(resolved[3] ?? []), [8, 8])

        await appState.clear()
    })

    it('signal: markKeyAsUploaded rejects out-of-bound key id', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('signal-upload-boundary')
        const preKey = store.stores.preKey(sessionId)
        await preKey.clear()

        await preKey.putPreKey({
            keyId: 1,
            keyPair: {
                pubKey: new Uint8Array(33).fill(1),
                privKey: new Uint8Array(32).fill(2)
            },
            uploaded: false
        })

        await assert.rejects(async () => preKey.markKeyAsUploaded(9_999), /out of boundary/)

        await preKey.clear()
    })

    it('messages: listByThread limit keeps newest ordering', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('messages-limit')
        const messages = store.stores.messages(sessionId)
        await messages.clear()

        await messages.upsertBatch([
            {
                id: 'limit-msg-1',
                threadJid: 'limit-thread@s.whatsapp.net',
                fromMe: true,
                timestampMs: 1_000
            },
            {
                id: 'limit-msg-2',
                threadJid: 'limit-thread@s.whatsapp.net',
                fromMe: true,
                timestampMs: 2_000
            },
            {
                id: 'limit-msg-3',
                threadJid: 'limit-thread@s.whatsapp.net',
                fromMe: true,
                timestampMs: 3_000
            }
        ])

        const limited = await messages.listByThread('limit-thread@s.whatsapp.net', 2)
        assert.equal(limited.length, 2)
        assert.equal(limited[0]?.id, 'limit-msg-3')
        assert.equal(limited[1]?.id, 'limit-msg-2')

        await messages.clear()
    })

    it('contacts: records are isolated by session id', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionA = nextSessionId('contacts-session-a')
        const sessionB = nextSessionId('contacts-session-b')
        const contactsA = store.stores.contacts(sessionA)
        const contactsB = store.stores.contacts(sessionB)
        await Promise.all([contactsA.clear(), contactsB.clear()])

        await contactsA.upsert({
            jid: 'iso@s.whatsapp.net',
            displayName: 'Isolated',
            lastUpdatedMs: 1_000
        })

        assert.ok(await contactsA.getByJid('iso@s.whatsapp.net'))
        assert.equal(await contactsB.getByJid('iso@s.whatsapp.net'), null)

        await Promise.all([contactsA.clear(), contactsB.clear()])
    })

    it('appstate: getCollectionStates keeps requested order', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('appstate-collections-order')
        const appState = store.stores.appState(sessionId)
        await appState.clear()

        await appState.setCollectionStates([
            {
                collection: WA_APP_STATE_COLLECTIONS.REGULAR,
                version: 11,
                hash: new Uint8Array([1, 1]),
                indexValueMap: new Map<string, Uint8Array>([['ra', new Uint8Array([1])]])
            },
            {
                collection: WA_APP_STATE_COLLECTIONS.CRITICAL_UNBLOCK_LOW,
                version: 22,
                hash: new Uint8Array([2, 2]),
                indexValueMap: new Map<string, Uint8Array>([['cb', new Uint8Array([2])]])
            }
        ])

        const states = await appState.getCollectionStates([
            WA_APP_STATE_COLLECTIONS.CRITICAL_UNBLOCK_LOW,
            WA_APP_STATE_COLLECTIONS.REGULAR
        ])
        assert.equal(states.length, 2)
        assert.equal(states[0].version, 22)
        assert.deepEqual(Array.from(states[0].hash), [2, 2])
        assert.equal(states[1].version, 11)
        assert.deepEqual(Array.from(states[1].hash), [1, 1])

        await appState.clear()
    })

    it('signal: getSession returns null for missing and value for existing', async (t) => {
        if (!store) return t.skip('ZAPO_TEST_MONGO_* not set')

        const sessionId = nextSessionId('signal-get-session')
        const session = store.stores.session(sessionId)
        await session.clear()

        const addressA = makeAddress('77777', 1)
        const addressMissing = makeAddress('88888', 2)
        const record = await makeSessionRecord(7)
        await session.setSession(addressA, record)

        const loaded = await session.getSession(addressA)
        assert.ok(loaded)
        assert.equal(loaded.local.regId, record.local.regId)
        assert.equal(await session.getSession(addressMissing), null)

        await session.clear()
    })
})
