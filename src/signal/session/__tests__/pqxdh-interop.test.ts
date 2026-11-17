import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { toRawPubKey, X25519, xeddsaVerify } from '@crypto'
import { isMlKemSupported, kemDecapsulate } from '@crypto/kem/MlKem'
import { createNoopLogger } from '@infra/log/types'
import { proto } from '@proto'
import { createLegacyPreKeyStore } from '@signal/__tests__/_legacy-pre-key-store'
import { SIGNAL_PQXDH_VERSION } from '@signal/constants'
import { SIGNAL_PQ_DISABLED, toPqSessionAddress } from '@signal/session/pq-scope'
import { SignalProtocol } from '@signal/session/SignalProtocol'
import { deserializePkMsg } from '@signal/session/SignalSerializer'
import type { SignalAddress, SignalPreKeyBundle } from '@signal/types'
import { WaIdentityMemoryStore } from '@store/memory/identity.store'
import { WaPreKeyMemoryStore } from '@store/memory/pre-key.store'
import { WaSessionMemoryStore } from '@store/memory/session.store'
import { WaSignalMemoryStore } from '@store/memory/signal.store'
import { bytesToHex, concatBytes, hexToBytes, uint8Equal } from '@util/bytes'

interface Vectors {
    readonly kem: {
        readonly pkcs8Hex: string
        readonly ciphertextHex: string
        readonly sharedSecretHex: string
    }
    readonly pkmsg: {
        readonly bob: {
            readonly registrationId: number
            readonly identityPrivateKeyHex: string
            readonly identityPublicKey33Hex: string
            readonly signedPreKey: {
                readonly id: number
                readonly privateKeyHex: string
                readonly publicKey33Hex: string
                readonly signatureHex: string
            }
            readonly oneTimePreKey: {
                readonly id: number
                readonly privateKeyHex: string
                readonly publicKey33Hex: string
            }
            readonly kyberPreKey: {
                readonly id: number
                readonly publicKeyHex: string
                readonly pkcs8Hex: string
                readonly signatureHex: string
            }
        }
        readonly alice: {
            readonly registrationId: number
            readonly identityPublicKey33Hex: string
        }
        readonly kemCiphertextHex: string
        readonly messages: readonly {
            readonly counter: number
            readonly plaintextHex: string
            readonly pkmsgHex: string
        }[]
    }
    readonly signature: {
        readonly identityPublicKey33Hex: string
        readonly kyberPublicKeyHex: string
        readonly signatureHex: string
    }
}

const vectors = JSON.parse(
    readFileSync(join(__dirname, 'pqxdh-wa-vectors.json'), 'utf8')
) as Vectors
const { bob, alice } = vectors.pkmsg
const skip = !isMlKemSupported()

const ALICE_ADDRESS: SignalAddress = { user: '5511000000001', server: 'lid', device: 0 }
const ALICE_PQ_ADDRESS = toPqSessionAddress(ALICE_ADDRESS)!

async function buildBob(options: { readonly withKyberKey?: boolean } = {}) {
    const stores = {
        signal: new WaSignalMemoryStore(),
        preKey: new WaPreKeyMemoryStore(),
        session: new WaSessionMemoryStore(),
        identity: new WaIdentityMemoryStore()
    }
    await stores.signal.setRegistrationInfo({
        registrationId: bob.registrationId,
        identityKeyPair: {
            pubKey: toRawPubKey(hexToBytes(bob.identityPublicKey33Hex)),
            privKey: hexToBytes(bob.identityPrivateKeyHex)
        }
    })
    await stores.signal.setSignedPreKey({
        keyId: bob.signedPreKey.id,
        keyPair: {
            pubKey: toRawPubKey(hexToBytes(bob.signedPreKey.publicKey33Hex)),
            privKey: hexToBytes(bob.signedPreKey.privateKeyHex)
        },
        signature: hexToBytes(bob.signedPreKey.signatureHex)
    })
    await stores.preKey.putPreKey({
        keyId: bob.oneTimePreKey.id,
        keyPair: {
            pubKey: toRawPubKey(hexToBytes(bob.oneTimePreKey.publicKey33Hex)),
            privKey: hexToBytes(bob.oneTimePreKey.privateKeyHex)
        }
    })
    if (options.withKyberKey !== false) {
        await stores.preKey.putKyberPreKeys([
            {
                keyId: bob.kyberPreKey.id,
                keyPair: {
                    pubKey: hexToBytes(bob.kyberPreKey.publicKeyHex),
                    privKey: hexToBytes(bob.kyberPreKey.pkcs8Hex)
                },
                signature: hexToBytes(bob.kyberPreKey.signatureHex),
                lastResort: false
            }
        ])
    }
    return { stores, protocol: new SignalProtocol(stores, createNoopLogger(), SIGNAL_PQ_DISABLED) }
}

test(
    'the Kyber ciphertext made by the web client decapsulates to its shared secret',
    { skip },
    () => {
        const secret = kemDecapsulate(
            hexToBytes(vectors.kem.pkcs8Hex),
            hexToBytes(vectors.kem.ciphertextHex)
        )
        assert.equal(bytesToHex(secret), vectors.kem.sharedSecretHex)
    }
)

test(
    'a tampered Kyber ciphertext decapsulates to a different secret without failing',
    { skip },
    () => {
        const ciphertext = hexToBytes(vectors.kem.ciphertextHex)
        ciphertext[10] ^= 0x01
        const secret = kemDecapsulate(hexToBytes(vectors.kem.pkcs8Hex), ciphertext)
        assert.equal(secret.length, 32)
        assert.notEqual(bytesToHex(secret), vectors.kem.sharedSecretHex)
    }
)

test('the Kyber public-key signature made by the web client verifies over the raw key bytes', async () => {
    const identity = toRawPubKey(hexToBytes(vectors.signature.identityPublicKey33Hex))
    const kyberPublicKey = hexToBytes(vectors.signature.kyberPublicKeyHex)
    const signature = hexToBytes(vectors.signature.signatureHex)
    assert.equal(kyberPublicKey.length, 1568)

    assert.equal(await xeddsaVerify(identity, kyberPublicKey, signature), true)

    // signing a prefixed copy of the key is a different message
    for (const prefix of [0x05, 0x08, 0x00]) {
        const prefixed = concatBytes([new Uint8Array([prefix]), kyberPublicKey])
        assert.equal(await xeddsaVerify(identity, prefixed, signature), false)
    }
    const flipped = kyberPublicKey.slice()
    flipped[0] ^= 0x01
    assert.equal(await xeddsaVerify(identity, flipped, signature), false)
})

test('the signed pre-key signature made by the web client verifies over the 33-byte key', async () => {
    const identity = toRawPubKey(hexToBytes(bob.identityPublicKey33Hex))
    const signedKey33 = hexToBytes(bob.signedPreKey.publicKey33Hex)
    const signature = hexToBytes(bob.signedPreKey.signatureHex)

    assert.equal(await xeddsaVerify(identity, signedKey33, signature), true)
    assert.equal(await xeddsaVerify(identity, toRawPubKey(signedKey33), signature), false)
})

test('the web client pre-key message parses and re-encodes to the same bytes', () => {
    const [first, second] = vectors.pkmsg.messages
    for (const message of [first, second]) {
        const wire = hexToBytes(message.pkmsgHex)
        assert.equal(wire[0], 0x44)

        const parsed = deserializePkMsg(wire)
        assert.equal(parsed.localOneTimeKeyId, bob.oneTimePreKey.id)
        assert.equal(parsed.localSignedPreKeyId, bob.signedPreKey.id)
        assert.equal(parsed.localKyberPreKeyId, bob.kyberPreKey.id)
        assert.equal(parsed.remote.regId, alice.registrationId)
        assert.equal(bytesToHex(parsed.kemCiphertext!), vectors.pkmsg.kemCiphertextHex)
        assert.equal(parsed.counter, message.counter)

        const decoded = proto.PreKeySignalMessage.decode(wire.subarray(1))
        const reencoded = proto.PreKeySignalMessage.encode(decoded).finish()
        assert.equal(bytesToHex(reencoded), bytesToHex(wire.subarray(1)))
        assert.equal(decoded.message![0], 0x44)
    }
    // the repeat before any reply carries the same Kyber ciphertext
    assert.equal(
        bytesToHex(deserializePkMsg(hexToBytes(first.pkmsgHex)).kemCiphertext!),
        bytesToHex(deserializePkMsg(hexToBytes(second.pkmsgHex)).kemCiphertext!)
    )
})

test(
    'zapo as Bob decrypts both pre-key messages the web client wrote as Alice',
    { skip },
    async () => {
        const { stores, protocol } = await buildBob()
        const [first, second] = vectors.pkmsg.messages

        const firstPlaintext = await protocol.decryptMessage(ALICE_PQ_ADDRESS, {
            type: 'pkmsg',
            ciphertext: hexToBytes(first.pkmsgHex)
        })
        assert.equal(bytesToHex(firstPlaintext), first.plaintextHex)

        // one-time keys are spent by the first message
        assert.equal(await stores.preKey.getPreKeyById(bob.oneTimePreKey.id), null)
        assert.equal(await stores.preKey.getKyberPreKeyById(bob.kyberPreKey.id), null)

        const secondPlaintext = await protocol.decryptMessage(ALICE_PQ_ADDRESS, {
            type: 'pkmsg',
            ciphertext: hexToBytes(second.pkmsgHex)
        })
        assert.equal(bytesToHex(secondPlaintext), second.plaintextHex)

        const session = await stores.session.getSession(ALICE_PQ_ADDRESS)
        assert.equal(session?.version, SIGNAL_PQXDH_VERSION)
        assert.equal(await stores.session.getSession(ALICE_ADDRESS), null)
        // the identity lives at the classic address, shared by both session scopes
        const identity = await stores.identity.getRemoteIdentity(ALICE_ADDRESS)
        assert.equal(bytesToHex(identity!), alice.identityPublicKey33Hex)
    }
)

test('a last-resort Kyber key stays after it is used', { skip }, async () => {
    const { stores, protocol } = await buildBob({ withKyberKey: false })
    await stores.preKey.putKyberPreKeys([
        {
            keyId: bob.kyberPreKey.id,
            keyPair: {
                pubKey: hexToBytes(bob.kyberPreKey.publicKeyHex),
                privKey: hexToBytes(bob.kyberPreKey.pkcs8Hex)
            },
            signature: hexToBytes(bob.kyberPreKey.signatureHex),
            lastResort: true
        }
    ])

    await protocol.decryptMessage(ALICE_PQ_ADDRESS, {
        type: 'pkmsg',
        ciphertext: hexToBytes(vectors.pkmsg.messages[0].pkmsgHex)
    })

    assert.ok(await stores.preKey.getKyberPreKeyById(bob.kyberPreKey.id))
})

test('a Kyber ciphertext changed in transit fails the message MAC', { skip }, async () => {
    const { protocol } = await buildBob()
    const wire = hexToBytes(vectors.pkmsg.messages[0].pkmsgHex)
    wire[wire.length - 1000] ^= 0x01

    await assert.rejects(
        () => protocol.decryptMessage(ALICE_PQ_ADDRESS, { type: 'pkmsg', ciphertext: wire }),
        /invalid message mac/
    )
})

test(
    'without the local Kyber key the message falls back to X3DH and fails the MAC',
    { skip },
    async () => {
        const { protocol } = await buildBob({ withKyberKey: false })

        await assert.rejects(
            () =>
                protocol.decryptMessage(ALICE_PQ_ADDRESS, {
                    type: 'pkmsg',
                    ciphertext: hexToBytes(vectors.pkmsg.messages[0].pkmsgHex)
                }),
            /invalid message mac/
        )
    }
)

test(
    'a post-quantum message fails clearly on a runtime without ML-KEM',
    { skip: !skip },
    async () => {
        const { protocol } = await buildBob()

        await assert.rejects(
            () =>
                protocol.decryptMessage(ALICE_PQ_ADDRESS, {
                    type: 'pkmsg',
                    ciphertext: hexToBytes(vectors.pkmsg.messages[0].pkmsgHex)
                }),
            /requires ML-KEM runtime support/
        )
    }
)

test(
    'zapo as Alice builds a session from a bundle signed by the web client and Bob reads it',
    { skip },
    async () => {
        const { stores: bobStores, protocol: bobProtocol } = await buildBob()
        const aliceStores = {
            signal: new WaSignalMemoryStore(),
            preKey: new WaPreKeyMemoryStore(),
            session: new WaSessionMemoryStore(),
            identity: new WaIdentityMemoryStore()
        }
        await aliceStores.signal.setRegistrationInfo({
            registrationId: alice.registrationId,
            identityKeyPair: await X25519.generateKeyPair()
        })
        const aliceProtocol = new SignalProtocol(aliceStores, createNoopLogger(), {
            isKeyUploadEnabled: () => true,
            isOneToOneEnabled: () => true
        })
        const bundle: SignalPreKeyBundle = {
            regId: bob.registrationId,
            identity: toRawPubKey(hexToBytes(bob.identityPublicKey33Hex)),
            signedKey: {
                id: bob.signedPreKey.id,
                publicKey: toRawPubKey(hexToBytes(bob.signedPreKey.publicKey33Hex)),
                signature: hexToBytes(bob.signedPreKey.signatureHex)
            },
            oneTimeKey: {
                id: bob.oneTimePreKey.id,
                publicKey: toRawPubKey(hexToBytes(bob.oneTimePreKey.publicKey33Hex))
            },
            kyberKey: {
                id: bob.kyberPreKey.id,
                publicKey: hexToBytes(bob.kyberPreKey.publicKeyHex),
                signature: hexToBytes(bob.kyberPreKey.signatureHex)
            }
        }
        const bobAddress: SignalAddress = { user: '5511000000002', server: 'lid', device: 0 }
        const bobPqAddress = toPqSessionAddress(bobAddress)!

        await aliceProtocol.establishOutgoingSession(bobPqAddress, bundle)
        const plaintext = new TextEncoder().encode('from zapo')
        const encrypted = await aliceProtocol.encryptMessage(bobPqAddress, plaintext)

        assert.equal(encrypted.type, 'pkmsg')
        assert.equal(encrypted.ciphertext[0], 0x44)
        const parsed = deserializePkMsg(encrypted.ciphertext)
        assert.equal(parsed.localKyberPreKeyId, bob.kyberPreKey.id)
        assert.equal(parsed.kemCiphertext!.length, 1568)
        const decodedFields = proto.PreKeySignalMessage.decode(encrypted.ciphertext.subarray(1))
        assert.equal(decodedFields.message![0], 0x44)

        const decrypted = await bobProtocol.decryptMessage(ALICE_PQ_ADDRESS, {
            type: encrypted.type,
            ciphertext: encrypted.ciphertext
        })
        assert.ok(uint8Equal(decrypted, plaintext))
        assert.equal(await bobStores.preKey.getKyberPreKeyById(bob.kyberPreKey.id), null)
    }
)

test(
    'a post-quantum message fails clearly on a pre-key store without the methods',
    { skip },
    async () => {
        const stores = {
            signal: new WaSignalMemoryStore(),
            preKey: createLegacyPreKeyStore(),
            session: new WaSessionMemoryStore(),
            identity: new WaIdentityMemoryStore()
        }
        await stores.signal.setRegistrationInfo({
            registrationId: bob.registrationId,
            identityKeyPair: {
                pubKey: toRawPubKey(hexToBytes(bob.identityPublicKey33Hex)),
                privKey: hexToBytes(bob.identityPrivateKeyHex)
            }
        })
        await stores.signal.setSignedPreKey({
            keyId: bob.signedPreKey.id,
            keyPair: {
                pubKey: toRawPubKey(hexToBytes(bob.signedPreKey.publicKey33Hex)),
                privKey: hexToBytes(bob.signedPreKey.privateKeyHex)
            },
            signature: hexToBytes(bob.signedPreKey.signatureHex)
        })
        await stores.preKey.putPreKey({
            keyId: bob.oneTimePreKey.id,
            keyPair: {
                pubKey: toRawPubKey(hexToBytes(bob.oneTimePreKey.publicKey33Hex)),
                privKey: hexToBytes(bob.oneTimePreKey.privateKeyHex)
            }
        })
        const protocol = new SignalProtocol(stores, createNoopLogger(), SIGNAL_PQ_DISABLED)

        await assert.rejects(
            () =>
                protocol.decryptMessage(ALICE_PQ_ADDRESS, {
                    type: 'pkmsg',
                    ciphertext: hexToBytes(vectors.pkmsg.messages[0].pkmsgHex)
                }),
            /requires a pre-key store with pq support/
        )
        // the one-time key was not spent by the failed message
        assert.ok(await stores.preKey.getPreKeyById(bob.oneTimePreKey.id))
    }
)
