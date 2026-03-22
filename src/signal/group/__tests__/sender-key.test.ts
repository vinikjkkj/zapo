import assert from 'node:assert/strict'
import test from 'node:test'

import { prependVersion } from '@crypto'
import { proto } from '@proto'
import { SIGNAL_GROUP_VERSION, SIGNATURE_SIZE } from '@signal/constants'
import { deriveSenderKeyMsgKey, selectMessageKey } from '@signal/group/SenderKeyChain'
import { parseDistributionPayload, parseSenderKeyMessage } from '@signal/group/SenderKeyCodec'
import { SenderKeyManager } from '@signal/group/SenderKeyManager'
import type { SenderKeyRecord, SignalAddress } from '@signal/types'
import { SenderKeyMemoryStore } from '@store/providers/memory/sender-key.store'
import { concatBytes } from '@util/bytes'

function makeBytes(length: number, seed = 0): Uint8Array {
    const out = new Uint8Array(length)
    for (let index = 0; index < out.length; index += 1) {
        out[index] = (seed + index) & 0xff
    }
    return out
}

function makeAddress(user: string, device: number): SignalAddress {
    return {
        user,
        server: 's.whatsapp.net',
        device
    }
}

function makeSenderKeyRecord(seed = 0): SenderKeyRecord {
    return {
        groupId: '120363000000000000@g.us',
        sender: makeAddress('5511999999999', 0),
        keyId: 10,
        iteration: 0,
        chainKey: makeBytes(32, seed),
        signingPublicKey: prependVersion(makeBytes(32, seed + 1), 0).subarray(0, 33),
        signingPrivateKey: makeBytes(32, seed + 2),
        unusedMessageKeys: []
    }
}

test('sender key chain derives message keys and handles stale/future counters', async () => {
    const senderKey = makeSenderKeyRecord(11)

    const derived = await deriveSenderKeyMsgKey(0, senderKey.chainKey)
    assert.equal(derived.nextChainKey.length, 32)
    assert.equal(derived.messageKey.iteration, 0)
    assert.equal(derived.messageKey.seed.length, 50)

    const selectedFuture = await selectMessageKey(senderKey, 3)
    assert.equal(selectedFuture.messageKey.iteration, 3)
    assert.equal(selectedFuture.updatedRecord.iteration, 4)
    assert.ok((selectedFuture.updatedRecord.unusedMessageKeys?.length ?? 0) > 0)

    const selectedStale = await selectMessageKey(selectedFuture.updatedRecord, 1)
    assert.equal(selectedStale.messageKey.iteration, 1)
    assert.equal(
        (selectedStale.updatedRecord.unusedMessageKeys?.length ?? 0) <
            (selectedFuture.updatedRecord.unusedMessageKeys?.length ?? 0),
        true
    )

    await assert.rejects(
        () => selectMessageKey(selectedStale.updatedRecord, 1),
        /sender key message iteration is stale/
    )
    await assert.rejects(
        () => selectMessageKey(senderKey, 50_000),
        /sender key message is too far in future/
    )
})

test('sender key codec parses distribution and sender-key messages', () => {
    const distributionBody = proto.SenderKeyDistributionMessage.encode({
        id: 7,
        iteration: 2,
        chainKey: makeBytes(32, 1),
        signingKey: makeBytes(32, 2)
    }).finish()
    const distributionPayload = prependVersion(distributionBody, SIGNAL_GROUP_VERSION)
    const parsedDistribution = parseDistributionPayload(distributionPayload)
    assert.equal(parsedDistribution.keyId, 7)
    assert.equal(parsedDistribution.iteration, 2)
    assert.equal(parsedDistribution.chainKey.length, 32)
    assert.equal(parsedDistribution.signingPublicKey.length, 33)

    const senderKeyBody = proto.SenderKeyMessage.encode({
        id: 7,
        iteration: 5,
        ciphertext: makeBytes(24, 9)
    }).finish()
    const versioned = prependVersion(senderKeyBody, SIGNAL_GROUP_VERSION)
    const versionContentMac = concatBytes([versioned, makeBytes(SIGNATURE_SIZE, 10)])
    const parsedSenderKeyMessage = parseSenderKeyMessage(versionContentMac)
    assert.equal(parsedSenderKeyMessage.keyId, 7)
    assert.equal(parsedSenderKeyMessage.iteration, 5)
    assert.equal(parsedSenderKeyMessage.ciphertext.length, 24)

    const invalidDistributionBody = proto.SenderKeyDistributionMessage.encode({
        id: 1,
        iteration: 0,
        chainKey: makeBytes(31, 1),
        signingKey: makeBytes(32, 2)
    }).finish()
    assert.throws(
        () =>
            parseDistributionPayload(prependVersion(invalidDistributionBody, SIGNAL_GROUP_VERSION)),
        /chainKey must be 32 bytes/
    )
})

test('sender key manager handles distribution, encryption/decryption and validation errors', async () => {
    const senderStore = new SenderKeyMemoryStore()
    const receiverStore = new SenderKeyMemoryStore()
    const senderManager = new SenderKeyManager(senderStore)
    const receiverManager = new SenderKeyManager(receiverStore)
    const groupId = '120363000000000000@g.us'
    const sender = makeAddress('5511888888888', 0)
    const participants = [makeAddress('5511000000001', 0), makeAddress('5511000000002', 1)]
    const plaintext = makeBytes(42, 5)

    const prepared = await senderManager.prepareGroupEncryption(groupId, sender, plaintext)
    assert.ok(prepared.distributionMessage.axolotlSenderKeyDistributionMessage)

    const beforeMark = await senderManager.filterParticipantsNeedingDistribution(
        groupId,
        prepared.keyId,
        participants
    )
    assert.equal(beforeMark.length, 2)

    await senderManager.markSenderKeyDistributed(groupId, prepared.keyId, participants.slice(0, 1))
    const afterMark = await senderManager.filterParticipantsNeedingDistribution(
        groupId,
        prepared.keyId,
        participants
    )
    assert.deepEqual(afterMark, [participants[1]])

    await receiverManager.processSenderKeyDistributionPayload(
        groupId,
        sender,
        prepared.distributionMessage.axolotlSenderKeyDistributionMessage
    )

    const decrypted = await receiverManager.decryptGroupMessage({
        groupId,
        sender,
        keyId: prepared.keyId,
        iteration: prepared.ciphertext.iteration,
        ciphertext: prepared.ciphertext.ciphertext
    })
    assert.deepEqual(decrypted, plaintext)

    await assert.rejects(
        () =>
            receiverManager.decryptGroupMessage({
                groupId,
                sender,
                keyId: prepared.keyId + 1,
                iteration: prepared.ciphertext.iteration,
                ciphertext: prepared.ciphertext.ciphertext
            }),
        /sender key id mismatch/
    )

    const tamperedCiphertext = new Uint8Array(prepared.ciphertext.ciphertext)
    tamperedCiphertext[tamperedCiphertext.length - 1] ^= 0x01
    await assert.rejects(
        () =>
            receiverManager.decryptGroupMessage({
                groupId,
                sender,
                ciphertext: tamperedCiphertext
            }),
        /invalid sender key signature/
    )
})
