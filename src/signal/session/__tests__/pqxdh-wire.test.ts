import assert from 'node:assert/strict'
import test from 'node:test'

import { X25519 } from '@crypto/curves/X25519'
import { isMlKemSupported, kemEncapsulate } from '@crypto/kem/MlKem'
import { generateKyberPreKey } from '@signal/registration/keygen'
import { decodeSignalSessionSnapshot, encodeSignalSessionSnapshot } from '@signal/session/encoding'
import { encryptMsg } from '@signal/session/SignalRatchet'
import { deserializePkMsg } from '@signal/session/SignalSerializer'
import { initiateSessionOutgoing, toSerializedKeyPair } from '@signal/session/SignalSession'
import { TEXT_ENCODER, uint8Equal } from '@util/bytes'

const skip = !isMlKemSupported()

async function buildPqSession() {
    const [aliceIdentity, aliceBase, bobIdentity, bobSigned] = await Promise.all([
        X25519.generateKeyPair(),
        X25519.generateKeyPair(),
        X25519.generateKeyPair(),
        X25519.generateKeyPair()
    ])
    const bobKyber = await generateKyberPreKey(9, bobIdentity.privKey)
    const { ciphertext, sharedSecret } = kemEncapsulate(bobKyber.keyPair.pubKey)
    const session = await initiateSessionOutgoing(
        { regId: 111, staticKeyPair: toSerializedKeyPair(aliceIdentity) },
        {
            identity: bobIdentity.pubKey,
            signedKey: { id: 1, publicKey: bobSigned.pubKey },
            regId: 222
        },
        toSerializedKeyPair(aliceBase),
        { kemSharedSecret: sharedSecret, kemCiphertext: ciphertext, kyberPreKeyId: bobKyber.keyId }
    )
    return { session, kemCiphertext: ciphertext, kyberPreKeyId: bobKyber.keyId }
}

test(
    'a PQXDH session emits a v4 pre-key message carrying the KEM ciphertext',
    { skip },
    async () => {
        const { session, kemCiphertext, kyberPreKeyId } = await buildPqSession()

        const [, out] = encryptMsg(session, TEXT_ENCODER.encode('hi'), true)
        assert.equal(out.type, 'pkmsg')
        assert.equal(out.ciphertext[0] >>> 4, 4)

        const parsed = deserializePkMsg(out.ciphertext)
        assert.equal(parsed.localKyberPreKeyId, kyberPreKeyId)
        assert.ok(parsed.kemCiphertext)
        assert.ok(uint8Equal(parsed.kemCiphertext, kemCiphertext))
    }
)

test('a PQXDH session round-trips version + kyber through storage', { skip }, async () => {
    const { session, kemCiphertext, kyberPreKeyId } = await buildPqSession()

    const decoded = decodeSignalSessionSnapshot(encodeSignalSessionSnapshot(session), 'test')
    assert.equal(decoded.version, 4)
    assert.equal(decoded.initialExchangeInfo?.kyberPreKeyId, kyberPreKeyId)
    assert.ok(decoded.initialExchangeInfo?.kemCiphertext)
    assert.ok(uint8Equal(decoded.initialExchangeInfo.kemCiphertext, kemCiphertext))
})

test('a classic session still emits a v3 pre-key message with no kyber', { skip }, async () => {
    const [aliceIdentity, aliceBase, bobIdentity, bobSigned] = await Promise.all([
        X25519.generateKeyPair(),
        X25519.generateKeyPair(),
        X25519.generateKeyPair(),
        X25519.generateKeyPair()
    ])
    const session = await initiateSessionOutgoing(
        { regId: 111, staticKeyPair: toSerializedKeyPair(aliceIdentity) },
        {
            identity: bobIdentity.pubKey,
            signedKey: { id: 1, publicKey: bobSigned.pubKey },
            regId: 222
        },
        toSerializedKeyPair(aliceBase)
    )

    const [, out] = encryptMsg(session, TEXT_ENCODER.encode('hi'), true)
    assert.equal(out.ciphertext[0] >>> 4, 3)

    const parsed = deserializePkMsg(out.ciphertext)
    assert.equal(parsed.localKyberPreKeyId, null)
    assert.equal(parsed.kemCiphertext, null)
})

test(
    'without the pq flag a PQXDH session writes a v3 message with no kyber fields',
    { skip },
    async () => {
        const { session } = await buildPqSession()

        const [, out] = encryptMsg(session, TEXT_ENCODER.encode('hi'))
        assert.equal(out.type, 'pkmsg')
        assert.equal(out.ciphertext[0], 0x33)

        const parsed = deserializePkMsg(out.ciphertext)
        assert.equal(parsed.localKyberPreKeyId, null)
        assert.equal(parsed.kemCiphertext, null)
    }
)
