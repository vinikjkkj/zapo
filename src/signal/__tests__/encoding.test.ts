import assert from 'node:assert/strict'
import test from 'node:test'

import { toSerializedPubKey, X25519 } from '@crypto'
import { proto } from '@proto'
import { WA_DEFAULTS } from '@protocol/constants'
import {
    decodeSenderKeyDistributionRow,
    decodeSenderKeyRecord,
    decodeSignalAddressFromRow,
    decodeSignalPreKeyRow,
    decodeSignalRegistrationRow,
    decodeSignalSessionRecord,
    decodeSignalSignedPreKeyRow,
    decodeStoreCount,
    encodeSenderKeyRecord,
    encodeSignalSessionRecord,
    toSignalAddressParts
} from '@signal/encoding'
import type { SignalAddress, SignalSessionRecord } from '@signal/types'

function makeBytes(length: number, seed = 0): Uint8Array {
    const out = new Uint8Array(length)
    for (let index = 0; index < out.length; index += 1) {
        out[index] = (seed + index) & 0xff
    }
    return out
}

async function createSessionRecord(): Promise<SignalSessionRecord> {
    const [localIdentity, remoteIdentity, sendRatchetPair, recvRatchetPair, baseKeyPair] =
        await Promise.all([
            X25519.generateKeyPair(),
            X25519.generateKeyPair(),
            X25519.generateKeyPair(),
            X25519.generateKeyPair(),
            X25519.generateKeyPair()
        ])

    return {
        local: {
            regId: 101,
            pubKey: toSerializedPubKey(localIdentity.pubKey)
        },
        remote: {
            regId: 202,
            pubKey: toSerializedPubKey(remoteIdentity.pubKey)
        },
        rootKey: makeBytes(32, 1),
        sendChain: {
            ratchetKey: {
                pubKey: toSerializedPubKey(sendRatchetPair.pubKey),
                privKey: sendRatchetPair.privKey
            },
            nextMsgIndex: 3,
            chainKey: makeBytes(32, 33)
        },
        recvChains: [
            {
                senderRatchetKey: toSerializedPubKey(recvRatchetPair.pubKey),
                chainKey: { index: 5, key: makeBytes(32, 65) },
                messageKeys: [
                    {
                        index: 4,
                        cipherKey: makeBytes(32, 97),
                        macKey: makeBytes(32, 129),
                        iv: makeBytes(16, 161)
                    }
                ]
            }
        ],
        initialExchangeInfo: {
            remoteOneTimeId: 9,
            remoteSignedId: 8,
            localOneTimePubKey: toSerializedPubKey(baseKeyPair.pubKey)
        },
        prevSendChainHighestIndex: 2,
        aliceBaseKey: toSerializedPubKey(baseKeyPair.pubKey),
        prevSessions: []
    }
}

test('sqlite signal helpers map addresses and primitive rows', () => {
    const signalAddress: SignalAddress = { user: '5511999999999', device: 0 }
    assert.deepEqual(toSignalAddressParts(signalAddress), {
        user: '5511999999999',
        server: WA_DEFAULTS.HOST_DOMAIN,
        device: 0
    })

    const decodedAddress = decodeSignalAddressFromRow({
        sender_user: '5511999999999',
        sender_server: 's.whatsapp.net',
        sender_device: 3
    })
    assert.deepEqual(decodedAddress, {
        user: '5511999999999',
        server: 's.whatsapp.net',
        device: 3
    })

    const registration = decodeSignalRegistrationRow({
        registration_id: 77,
        identity_pub_key: makeBytes(32, 1),
        identity_priv_key: makeBytes(32, 2)
    })
    assert.equal(registration.registrationId, 77)
    assert.equal(registration.identityKeyPair.pubKey.length, 32)

    const preKey = decodeSignalPreKeyRow({
        key_id: 9,
        pub_key: makeBytes(32, 5),
        priv_key: makeBytes(32, 6),
        uploaded: 1
    })
    assert.equal(preKey.keyId, 9)
    assert.equal(preKey.uploaded, true)

    const signedPreKey = decodeSignalSignedPreKeyRow({
        key_id: 10,
        pub_key: makeBytes(32, 7),
        priv_key: makeBytes(32, 8),
        signature: makeBytes(64, 9),
        uploaded: 0
    })
    assert.equal(signedPreKey.keyId, 10)
    assert.equal(signedPreKey.signature.length, 64)
    assert.equal(signedPreKey.uploaded, false)
})

test('sqlite signal helpers encode/decode signal sessions', async () => {
    const session = await createSessionRecord()
    const encoded = encodeSignalSessionRecord(session)
    const decoded = decodeSignalSessionRecord(encoded)

    assert.equal(decoded.local.regId, session.local.regId)
    assert.equal(decoded.remote.regId, session.remote.regId)
    assert.equal(decoded.sendChain.nextMsgIndex, session.sendChain.nextMsgIndex)
    assert.equal(decoded.recvChains.length, 1)
    assert.equal(decoded.recvChains[0].messageKeys!.length, 1)

    const invalidRecord = proto.RecordStructure.encode({
        currentSession: {
            sessionVersion: 3,
            localRegistrationId: 1,
            localIdentityPublic: makeBytes(33, 1),
            remoteRegistrationId: 2,
            remoteIdentityPublic: makeBytes(33, 2),
            rootKey: makeBytes(32, 3),
            senderChain: {
                senderRatchetKey: makeBytes(33, 4),
                senderRatchetKeyPrivate: makeBytes(32, 5),
                chainKey: {
                    index: 0,
                    key: makeBytes(31, 6)
                }
            },
            receiverChains: []
        }
    }).finish()

    assert.throws(
        () => decodeSignalSessionRecord(invalidRecord),
        /senderChain\.chainKey\.key length 31/
    )
})

test('sqlite signal helpers encode/decode sender key records and distribution rows', async () => {
    const signingPair = await X25519.generateKeyPair()
    const sender: SignalAddress = {
        user: '5511888888888',
        server: 's.whatsapp.net',
        device: 1
    }
    const record = {
        groupId: '120363000000000000@g.us',
        sender,
        keyId: 55,
        iteration: 12,
        chainKey: makeBytes(32, 11),
        signingPublicKey: toSerializedPubKey(signingPair.pubKey),
        signingPrivateKey: signingPair.privKey,
        unusedMessageKeys: [
            { iteration: 11, seed: makeBytes(50, 12) },
            { iteration: 10, seed: makeBytes(50, 13) }
        ]
    }

    const encoded = encodeSenderKeyRecord(record)
    const decoded = decodeSenderKeyRecord(encoded, record.groupId, record.sender)
    assert.equal(decoded.keyId, 55)
    assert.equal(decoded.iteration, 12)
    assert.equal(decoded.unusedMessageKeys?.length, 2)
    assert.equal(decoded.signingPublicKey[0], record.signingPublicKey[0])

    const distribution = decodeSenderKeyDistributionRow({
        group_id: record.groupId,
        sender_user: sender.user,
        sender_server: sender.server,
        sender_device: sender.device,
        key_id: 55,
        timestamp_ms: 123_456
    })
    assert.equal(distribution.groupId, record.groupId)
    assert.equal(distribution.keyId, 55)
    assert.equal(distribution.sender.device, 1)

    const emptyEncoded = proto.SenderKeyRecordStructure.encode({
        senderKeyStates: []
    }).finish()
    assert.throws(
        () => decodeSenderKeyRecord(emptyEncoded, record.groupId, sender),
        /missing sender_keys\.record\.senderKeyStates\[0\]/
    )
})

test('sqlite signal helpers decode count rows safely', () => {
    assert.equal(decodeStoreCount(null, 'count.field'), 0)
    assert.equal(decodeStoreCount({ count: 12 }, 'count.field'), 12)
})
