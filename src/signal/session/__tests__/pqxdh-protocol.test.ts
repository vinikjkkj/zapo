import assert from 'node:assert/strict'
import test from 'node:test'

import { X25519 } from '@crypto'
import { isMlKemSupported } from '@crypto/kem/MlKem'
import { createNoopLogger } from '@infra/log/types'
import { SIGNAL_PQXDH_VERSION, SIGNAL_VERSION } from '@signal/constants'
import {
    generateKyberPreKey,
    generatePreKeyPair,
    generateRegistrationInfo,
    generateSignedPreKey
} from '@signal/registration/keygen'
import { type SignalPqPolicy, toPqSessionAddress } from '@signal/session/pq-scope'
import { SignalProtocol } from '@signal/session/SignalProtocol'
import { deserializePkMsg } from '@signal/session/SignalSerializer'
import type { SignalAddress, SignalPreKeyBundle } from '@signal/types'
import { WaIdentityMemoryStore } from '@store/memory/identity.store'
import { WaPreKeyMemoryStore } from '@store/memory/pre-key.store'
import { WaSessionMemoryStore } from '@store/memory/session.store'
import { WaSignalMemoryStore } from '@store/memory/signal.store'
import { TEXT_ENCODER, uint8Equal } from '@util/bytes'

const skip = !isMlKemSupported()
const PQ_ON: SignalPqPolicy = {
    isKeyUploadEnabled: () => true,
    isOneToOneEnabled: () => true
}
const PQ_OFF: SignalPqPolicy = {
    isKeyUploadEnabled: () => false,
    isOneToOneEnabled: () => false
}

const ALICE: SignalAddress = { user: '5511000000001', server: 'lid', device: 0 }
const BOB: SignalAddress = { user: '5511000000002', server: 'lid', device: 0 }
const ALICE_PQ = toPqSessionAddress(ALICE)!
const BOB_PQ = toPqSessionAddress(BOB)!

function newStores() {
    return {
        signal: new WaSignalMemoryStore(),
        preKey: new WaPreKeyMemoryStore(),
        session: new WaSessionMemoryStore(),
        identity: new WaIdentityMemoryStore()
    }
}

async function buildParties(policy: SignalPqPolicy = PQ_ON) {
    const aliceStores = newStores()
    const bobStores = newStores()
    const [aliceRegistration, bobRegistration] = await Promise.all([
        generateRegistrationInfo(),
        generateRegistrationInfo()
    ])
    await aliceStores.signal.setRegistrationInfo(aliceRegistration)
    await bobStores.signal.setRegistrationInfo(bobRegistration)

    const bobSigned = await generateSignedPreKey(1, bobRegistration.identityKeyPair.privKey)
    const bobOneTime = await generatePreKeyPair(9)
    const bobKyber = await generateKyberPreKey(5, bobRegistration.identityKeyPair.privKey)
    await bobStores.signal.setSignedPreKey(bobSigned)
    await bobStores.preKey.putPreKey(bobOneTime)
    await bobStores.preKey.putKyberPreKeys([bobKyber])

    const bundle: SignalPreKeyBundle = {
        regId: bobRegistration.registrationId,
        identity: bobRegistration.identityKeyPair.pubKey,
        signedKey: {
            id: bobSigned.keyId,
            publicKey: bobSigned.keyPair.pubKey,
            signature: bobSigned.signature
        },
        oneTimeKey: { id: bobOneTime.keyId, publicKey: bobOneTime.keyPair.pubKey },
        kyberKey: {
            id: bobKyber.keyId,
            publicKey: bobKyber.keyPair.pubKey,
            signature: bobKyber.signature
        }
    }
    return {
        aliceStores,
        bobStores,
        bobRegistration,
        bobKyber,
        bundle,
        alice: new SignalProtocol(aliceStores, createNoopLogger(), policy),
        bob: new SignalProtocol(bobStores, createNoopLogger(), PQ_ON)
    }
}

test('a post-quantum address builds a v4 session that Bob decrypts', { skip }, async () => {
    const { alice, bob, bundle, aliceStores, bobStores, bobKyber } = await buildParties()

    await alice.establishOutgoingSession(BOB_PQ, bundle)
    const plaintext = TEXT_ENCODER.encode('hello pq')
    const encrypted = await alice.encryptMessage(BOB_PQ, plaintext)

    assert.equal(encrypted.type, 'pkmsg')
    assert.equal(encrypted.ciphertext[0], 0x44)
    const parsed = deserializePkMsg(encrypted.ciphertext)
    assert.equal(parsed.localKyberPreKeyId, bobKyber.keyId)
    assert.equal(parsed.kemCiphertext?.length, 1568)

    const decrypted = await bob.decryptMessage(ALICE_PQ, {
        type: encrypted.type,
        ciphertext: encrypted.ciphertext
    })
    assert.ok(uint8Equal(decrypted, plaintext))

    // the session sits at the post-quantum address, the identity at the classic one
    assert.equal((await aliceStores.session.getSession(BOB_PQ))?.version, SIGNAL_PQXDH_VERSION)
    assert.equal(await aliceStores.session.getSession(BOB), null)
    assert.ok(await aliceStores.identity.getRemoteIdentity(BOB))
    assert.equal(await aliceStores.identity.getRemoteIdentity(BOB_PQ), null)
    assert.equal(await bobStores.preKey.getKyberPreKeyById(bobKyber.keyId), null)
})

test('the pre-key message repeats the Kyber ciphertext until Bob answers', { skip }, async () => {
    const { alice, bob, bundle } = await buildParties()
    await alice.establishOutgoingSession(BOB_PQ, bundle)

    const first = await alice.encryptMessage(BOB_PQ, TEXT_ENCODER.encode('one'))
    const second = await alice.encryptMessage(BOB_PQ, TEXT_ENCODER.encode('two'))

    assert.equal(second.type, 'pkmsg')
    const firstParsed = deserializePkMsg(first.ciphertext)
    const secondParsed = deserializePkMsg(second.ciphertext)
    assert.ok(uint8Equal(firstParsed.kemCiphertext!, secondParsed.kemCiphertext!))
    assert.equal(secondParsed.counter, 1)

    for (const message of [first, second]) {
        await bob.decryptMessage(ALICE_PQ, message)
    }
})

test('Bob answers on the post-quantum session and Alice reads it', { skip }, async () => {
    const { alice, bob, bundle } = await buildParties()
    await alice.establishOutgoingSession(BOB_PQ, bundle)
    const first = await alice.encryptMessage(BOB_PQ, TEXT_ENCODER.encode('ping'))
    await bob.decryptMessage(ALICE_PQ, first)

    const reply = await bob.encryptMessage(ALICE_PQ, TEXT_ENCODER.encode('pong'))
    assert.equal(reply.type, 'msg')
    assert.equal(reply.ciphertext[0], 0x44)
    const readBack = await alice.decryptMessage(BOB_PQ, reply)
    assert.equal(new TextDecoder().decode(readBack), 'pong')

    const next = await alice.encryptMessage(BOB_PQ, TEXT_ENCODER.encode('again'))
    assert.equal(next.type, 'msg')
    assert.equal(new TextDecoder().decode(await bob.decryptMessage(ALICE_PQ, next)), 'again')
})

test('a classic address ignores the Kyber key in the bundle', { skip }, async () => {
    const { alice, bundle, aliceStores } = await buildParties()

    await alice.establishOutgoingSession(BOB, bundle)
    const encrypted = await alice.encryptMessage(BOB, TEXT_ENCODER.encode('classic'))

    assert.equal(encrypted.ciphertext[0], 0x33)
    const parsed = deserializePkMsg(encrypted.ciphertext)
    assert.equal(parsed.localKyberPreKeyId, null)
    assert.equal(parsed.kemCiphertext, null)
    assert.equal((await aliceStores.session.getSession(BOB))?.version, undefined)
    assert.equal(await aliceStores.session.getSession(BOB_PQ), null)
})

test(
    'with the policy off a post-quantum session writes version 3 and no Kyber fields',
    { skip },
    async () => {
        const { alice, bundle } = await buildParties(PQ_OFF)
        await alice.establishOutgoingSession(BOB_PQ, bundle)

        const encrypted = await alice.encryptMessage(BOB_PQ, TEXT_ENCODER.encode('quiet'))

        assert.equal(encrypted.ciphertext[0] >>> 4, SIGNAL_VERSION)
        const parsed = deserializePkMsg(encrypted.ciphertext)
        assert.equal(parsed.kemCiphertext, null)
    }
)

test('a post-quantum address needs a Kyber key in the bundle', { skip }, async () => {
    const { alice, bundle, aliceStores } = await buildParties()
    const withoutKyber: SignalPreKeyBundle = { ...bundle, kyberKey: undefined }

    await assert.rejects(
        () => alice.establishOutgoingSession(BOB_PQ, withoutKyber),
        /requires a kyber pre-key/
    )
    assert.equal(await aliceStores.session.getSession(BOB_PQ), null)
})

test('a Kyber key with a bad signature creates no session', { skip }, async () => {
    const { alice, bundle, aliceStores } = await buildParties()
    const badSignature = bundle.kyberKey!.signature.slice()
    badSignature[3] ^= 0x01

    await assert.rejects(
        () =>
            alice.establishOutgoingSession(BOB_PQ, {
                ...bundle,
                kyberKey: { ...bundle.kyberKey!, signature: badSignature }
            }),
        /signature invalid/
    )
    assert.equal(await aliceStores.session.getSession(BOB_PQ), null)
    assert.equal(await aliceStores.session.getSession(BOB), null)
})

test('a Kyber key signed by another identity creates no session', { skip }, async () => {
    const { alice, bundle } = await buildParties()
    const stranger = await X25519.generateKeyPair()
    const foreign = await generateKyberPreKey(6, stranger.privKey)

    await assert.rejects(
        () =>
            alice.establishOutgoingSession(BOB_PQ, {
                ...bundle,
                kyberKey: {
                    id: foreign.keyId,
                    publicKey: foreign.keyPair.pubKey,
                    signature: foreign.signature
                }
            }),
        /signature invalid/
    )
})

test(
    'a signed pre-key with a bad signature creates no post-quantum session',
    { skip },
    async () => {
        const { alice, bundle } = await buildParties()
        const badSignature = bundle.signedKey.signature.slice()
        badSignature[0] ^= 0x01

        await assert.rejects(
            () =>
                alice.establishOutgoingSession(BOB_PQ, {
                    ...bundle,
                    signedKey: { ...bundle.signedKey, signature: badSignature }
                }),
            /signature invalid/
        )
    }
)

test('a tampered Kyber ciphertext fails the message MAC', { skip }, async () => {
    const { alice, bob, bundle } = await buildParties()
    await alice.establishOutgoingSession(BOB_PQ, bundle)
    const encrypted = await alice.encryptMessage(BOB_PQ, TEXT_ENCODER.encode('x'))
    const wire = encrypted.ciphertext.slice()
    wire[wire.length - 700] ^= 0x01

    await assert.rejects(
        () => bob.decryptMessage(ALICE_PQ, { type: 'pkmsg', ciphertext: wire }),
        /invalid message mac/
    )
})

test('the batch persist keeps the identity at the classic address', { skip }, async () => {
    const { alice, bundle, aliceStores } = await buildParties()

    const prepared = await alice.prepareOutgoingSession(BOB_PQ, bundle, { knownAbsent: true })
    const result = await alice.persistOutgoingSessionsBatch([
        { address: BOB_PQ, session: prepared.session, remoteIdentity: prepared.remoteIdentity }
    ])

    assert.equal(result.resolved.length, 1)
    assert.ok(await aliceStores.session.getSession(BOB_PQ))
    assert.ok(await aliceStores.identity.getRemoteIdentity(BOB))
    assert.equal(await aliceStores.identity.getRemoteIdentity(BOB_PQ), null)
})

test('a state holding Kyber keys still receives classic messages on any runtime', async () => {
    const aliceStores = newStores()
    const bobStores = newStores()
    const [aliceRegistration, bobRegistration] = await Promise.all([
        generateRegistrationInfo(),
        generateRegistrationInfo()
    ])
    await aliceStores.signal.setRegistrationInfo(aliceRegistration)
    await bobStores.signal.setRegistrationInfo(bobRegistration)
    const bobSigned = await generateSignedPreKey(1, bobRegistration.identityKeyPair.privKey)
    const bobOneTime = await generatePreKeyPair(9)
    await bobStores.signal.setSignedPreKey(bobSigned)
    await bobStores.preKey.putPreKey(bobOneTime)
    await bobStores.preKey.putKyberPreKeys([
        {
            keyId: 5,
            keyPair: { pubKey: new Uint8Array(1568).fill(1), privKey: new Uint8Array(64).fill(2) },
            signature: new Uint8Array(64).fill(3),
            lastResort: true
        }
    ])
    const alice = new SignalProtocol(aliceStores, createNoopLogger(), PQ_OFF)
    const bob = new SignalProtocol(bobStores, createNoopLogger(), PQ_OFF)

    await alice.establishOutgoingSession(BOB, {
        regId: bobRegistration.registrationId,
        identity: bobRegistration.identityKeyPair.pubKey,
        signedKey: {
            id: bobSigned.keyId,
            publicKey: bobSigned.keyPair.pubKey,
            signature: bobSigned.signature
        },
        oneTimeKey: { id: bobOneTime.keyId, publicKey: bobOneTime.keyPair.pubKey }
    })
    const encrypted = await alice.encryptMessage(BOB, TEXT_ENCODER.encode('classic'))
    const plaintext = await bob.decryptMessage(ALICE, encrypted)

    assert.equal(new TextDecoder().decode(plaintext), 'classic')
    assert.ok(await bobStores.preKey.getKyberPreKeyById(5))
})
