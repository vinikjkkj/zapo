import assert from 'node:assert/strict'
import test from 'node:test'

import { generateFakeNoiseRootCa } from '../../protocol/auth/cert-chain'
import { FakeWaServer } from '../FakeWaServer'

test('a pinned Noise root CA is the one the server presents', async () => {
    const pinned = await generateFakeNoiseRootCa()
    const server = await FakeWaServer.start({ noiseRootCa: pinned })

    try {
        assert.deepEqual(server.noiseRootCa.publicKey, pinned.publicKey)
        assert.equal(server.noiseRootCa.serial, pinned.serial)
    } finally {
        await server.stop()
    }
})

// A client that pinned the anchor must still trust the server after a restart.
test('a pinned root CA survives a stop/start cycle', async () => {
    const pinned = await generateFakeNoiseRootCa()
    const server = await FakeWaServer.start({ noiseRootCa: pinned })
    await server.stop()
    await server.listen()

    try {
        assert.deepEqual(server.noiseRootCa.publicKey, pinned.publicKey)
    } finally {
        await server.stop()
    }
})

// One instance across two cycles, so a `stop()` that retained the generated CA
// would fail here; two instances could not tell that apart.
test('an omitted root CA is regenerated on each listen', async () => {
    const server = await FakeWaServer.start()

    try {
        const first = server.noiseRootCa.publicKey
        await server.stop()
        await server.listen()

        assert.notDeepEqual(server.noiseRootCa.publicKey, first)
    } finally {
        await server.stop()
    }
})
