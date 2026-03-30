import assert from 'node:assert/strict'
import test from 'node:test'

import { toSerializedPubKey } from '@crypto'
import { verifySignalSignature } from '@signal/crypto/WaAdvSignature'
import {
    generatePreKeyPair,
    generateRegistrationId,
    generateRegistrationInfo,
    generateSignedPreKey
} from '@signal/registration/keygen'
import { createAndStoreInitialKeys } from '@signal/registration/utils'
import { WaPreKeyMemoryStore } from '@store/providers/memory/pre-key.store'
import { WaSignalMemoryStore } from '@store/providers/memory/signal.store'

test('registration id generation stays within expected signal range', async () => {
    for (let index = 0; index < 32; index += 1) {
        const registrationId = await generateRegistrationId()
        assert.ok(registrationId >= 1)
        assert.ok(registrationId <= 16_380)
    }
})

test('registration key generation creates prekeys and signed prekeys with valid signatures', async () => {
    const registration = await generateRegistrationInfo()
    assert.ok(registration.registrationId >= 1)
    assert.ok(registration.registrationId <= 16_380)
    assert.equal(registration.identityKeyPair.pubKey.length, 32)
    assert.equal(registration.identityKeyPair.privKey.length, 32)

    const preKey = await generatePreKeyPair(99)
    assert.equal(preKey.keyId, 99)
    assert.equal(preKey.uploaded, false)
    assert.equal(preKey.keyPair.pubKey.length, 32)

    const signedPreKey = await generateSignedPreKey(5, registration.identityKeyPair.privKey)
    const signedPreKeyPub = toSerializedPubKey(signedPreKey.keyPair.pubKey)
    assert.equal(signedPreKey.keyId, 5)
    assert.equal(signedPreKey.uploaded, false)
    assert.equal(signedPreKey.signature.length, 64)
    assert.equal(
        await verifySignalSignature(
            toSerializedPubKey(registration.identityKeyPair.pubKey),
            signedPreKeyPub,
            signedPreKey.signature
        ),
        true
    )
})

test('createAndStoreInitialKeys persists registration, signed prekey and first prekey', async () => {
    const store = new WaSignalMemoryStore()
    const preKeyStore = new WaPreKeyMemoryStore()

    const created = await createAndStoreInitialKeys(store, preKeyStore)
    assert.equal(created.firstPreKey.keyId, 1)
    assert.equal(created.signedPreKey.keyId, 1)

    const persistedRegistration = await store.getRegistrationInfo()
    const persistedSignedPreKey = await store.getSignedPreKey()
    const persistedPreKey = await preKeyStore.getPreKeyById(1)

    assert.ok(persistedRegistration)
    assert.ok(persistedSignedPreKey)
    assert.ok(persistedPreKey)
    assert.equal(persistedRegistration.registrationId, created.registrationInfo.registrationId)
    assert.equal(persistedSignedPreKey.keyId, created.signedPreKey.keyId)
    assert.equal(persistedPreKey.keyId, created.firstPreKey.keyId)
})
