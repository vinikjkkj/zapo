import assert from 'node:assert/strict'
import test from 'node:test'

import { X25519 } from '@crypto/curves/X25519'
import { isMlKemSupported, kemDecapsulate, kemEncapsulate } from '@crypto/kem/MlKem'
import { generateKyberPreKey } from '@signal/registration/keygen'
import {
    initiateSessionIncoming,
    initiateSessionOutgoing,
    toSerializedKeyPair
} from '@signal/session/SignalSession'
import { uint8Equal } from '@util/bytes'

const skip = !isMlKemSupported()

async function buildParties() {
    const [aliceIdentity, aliceBase, bobIdentity, bobSigned, bobOneTime] = await Promise.all([
        X25519.generateKeyPair(),
        X25519.generateKeyPair(),
        X25519.generateKeyPair(),
        X25519.generateKeyPair(),
        X25519.generateKeyPair()
    ])
    const bobKyber = await generateKyberPreKey(5, bobIdentity.privKey)
    return { aliceIdentity, aliceBase, bobIdentity, bobSigned, bobOneTime, bobKyber }
}

test('PQXDH initiator and responder derive the same chain key', { skip }, async () => {
    const p = await buildParties()
    const { ciphertext, sharedSecret } = kemEncapsulate(p.bobKyber.keyPair.pubKey)

    const alice = await initiateSessionOutgoing(
        { regId: 111, staticKeyPair: toSerializedKeyPair(p.aliceIdentity) },
        {
            identity: p.bobIdentity.pubKey,
            signedKey: { id: 1, publicKey: p.bobSigned.pubKey },
            oneTimeKey: { id: 2, publicKey: p.bobOneTime.pubKey },
            regId: 222
        },
        toSerializedKeyPair(p.aliceBase),
        {
            kemSharedSecret: sharedSecret,
            kemCiphertext: ciphertext,
            kyberPreKeyId: p.bobKyber.keyId
        }
    )

    const bobSecret = kemDecapsulate(p.bobKyber.keyPair.privKey, ciphertext)
    const bob = await initiateSessionIncoming(
        { regId: 222, staticKeyPair: toSerializedKeyPair(p.bobIdentity) },
        { regId: 111, pubKey: p.aliceIdentity.pubKey },
        p.aliceBase.pubKey,
        {
            signed: toSerializedKeyPair(p.bobSigned),
            oneTime: toSerializedKeyPair(p.bobOneTime),
            ratchet: toSerializedKeyPair(p.bobSigned)
        },
        bobSecret
    )

    const aliceRecvChainKey = alice.recvChains[0]?.chainKey?.key
    assert.ok(aliceRecvChainKey)
    assert.ok(uint8Equal(aliceRecvChainKey, bob.sendChain.chainKey))
    assert.equal(alice.initialExchangeInfo?.kyberPreKeyId, p.bobKyber.keyId)
})

test('a PQXDH session and a classic session derive different keys', { skip }, async () => {
    const p = await buildParties()
    const { ciphertext, sharedSecret } = kemEncapsulate(p.bobKyber.keyPair.pubKey)
    const local = { regId: 111, staticKeyPair: toSerializedKeyPair(p.aliceIdentity) }
    const bundle = {
        identity: p.bobIdentity.pubKey,
        signedKey: { id: 1, publicKey: p.bobSigned.pubKey },
        regId: 222
    }
    const base = toSerializedKeyPair(p.aliceBase)

    const pq = await initiateSessionOutgoing(local, bundle, base, {
        kemSharedSecret: sharedSecret,
        kemCiphertext: ciphertext,
        kyberPreKeyId: p.bobKyber.keyId
    })
    const classic = await initiateSessionOutgoing(local, bundle, base)

    const pqChainKey = pq.recvChains[0]?.chainKey?.key
    const classicChainKey = classic.recvChains[0]?.chainKey?.key
    assert.ok(pqChainKey && classicChainKey)
    assert.ok(!uint8Equal(pqChainKey, classicChainKey))
    assert.equal(classic.initialExchangeInfo?.kyberPreKeyId, undefined)
})
