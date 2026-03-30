import assert from 'node:assert/strict'
import test from 'node:test'

import * as signal from '@signal'
import {
    CHAIN_KEY_LABEL,
    MESSAGE_KEY_LABEL,
    SIGNAL_GROUP_VERSION,
    SIGNAL_MAC_SIZE,
    SIGNAL_PREFIX,
    SIGNAL_VERSION,
    WHISPER_GROUP_INFO
} from '@signal/constants'
import { WaPreKeyMemoryStore } from '@store/providers/memory/pre-key.store'
import { WaSignalMemoryStore } from '@store/providers/memory/signal.store'

test('signal constants expose expected protocol invariants', () => {
    assert.equal(SIGNAL_VERSION, 3)
    assert.equal(SIGNAL_GROUP_VERSION, 3)
    assert.equal(SIGNAL_MAC_SIZE, 8)
    assert.equal(SIGNAL_PREFIX.length, 32)
    assert.equal(WHISPER_GROUP_INFO.length > 0, true)
    assert.deepEqual(MESSAGE_KEY_LABEL, new Uint8Array([1]))
    assert.deepEqual(CHAIN_KEY_LABEL, new Uint8Array([2]))
})

test('signal index exports stable public APIs', () => {
    assert.equal(typeof signal.SignalProtocol, 'function')
    assert.equal(typeof signal.SignalSessionSyncApi, 'function')
    assert.equal(typeof signal.SignalDeviceSyncApi, 'function')
    assert.equal(typeof signal.SignalIdentitySyncApi, 'function')
    assert.equal(typeof signal.SignalRotateKeyApi, 'function')
    assert.equal(typeof signal.SenderKeyManager, 'function')
    assert.equal(typeof signal.generateRegistrationInfo, 'function')
    assert.equal(typeof signal.generateSignedPreKey, 'function')
    assert.equal(typeof signal.buildPreKeyUploadIq, 'function')
    assert.equal(typeof signal.parsePreKeyUploadFailure, 'function')
})

test('signal barrel utility createAndStoreInitialKeys integrates with memory store', async () => {
    const store = new WaSignalMemoryStore()
    const preKeyStore = new WaPreKeyMemoryStore()
    const created = await signal.createAndStoreInitialKeys(store, preKeyStore)

    assert.equal(created.firstPreKey.keyId, 1)
    assert.equal(created.signedPreKey.keyId, 1)
    assert.ok(await store.getRegistrationInfo())
    assert.ok(await store.getSignedPreKey())
    assert.ok(await preKeyStore.getPreKeyById(created.firstPreKey.keyId))
})
