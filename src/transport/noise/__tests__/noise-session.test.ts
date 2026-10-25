import assert from 'node:assert/strict'
import test from 'node:test'

import { X25519 } from '@crypto'
import { createNoopLogger } from '@infra/log/types'
import { WaNoiseSession } from '@transport/noise/WaNoiseSession'

interface SessionInternals {
    handshakeWaiter: unknown
    handshakeRejecter: unknown
}

async function startPendingHandshake(): Promise<{
    readonly session: WaNoiseSession
    readonly internals: SessionInternals
    readonly started: Promise<void>
}> {
    const session = new WaNoiseSession(() => Promise.resolve(), createNoopLogger())
    const internals = session as unknown as SessionInternals
    const started = session.start({
        clientStaticKeyPair: await X25519.generateKeyPair(),
        isRegistered: false,
        registrationPayload: new Uint8Array([1])
    })
    const deadline = Date.now() + 2_000
    while (internals.handshakeWaiter === null) {
        if (Date.now() > deadline) {
            throw new Error('timed out waiting for the handshake waiter')
        }
        await new Promise<void>((resolve) => setImmediate(resolve))
    }
    return { session, internals, started }
}

test('WaNoiseSession clears the pending waiter when the handshake frame times out', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const { internals, started } = await startPendingHandshake()

    const rejection = assert.rejects(started, /noise handshake frame timeout/)
    t.mock.timers.tick(10_000)
    await rejection

    assert.equal(internals.handshakeWaiter, null)
    assert.equal(internals.handshakeRejecter, null)
})

test('WaNoiseSession.onSocketClosed rejects a pending handshake right away', async () => {
    const { session, internals, started } = await startPendingHandshake()

    const rejection = assert.rejects(started, /socket went away/)
    session.onSocketClosed(new Error('socket went away'))
    await rejection

    assert.equal(internals.handshakeWaiter, null)
    assert.equal(internals.handshakeRejecter, null)
})

test('WaNoiseSession fails the next handshake wait after onSocketClosed', async () => {
    const session = new WaNoiseSession(() => Promise.resolve(), createNoopLogger())
    const started = session.start({
        clientStaticKeyPair: await X25519.generateKeyPair(),
        isRegistered: false,
        registrationPayload: new Uint8Array([1])
    })
    session.onSocketClosed(new Error('closed during setup'))

    await assert.rejects(started, /closed during setup/)
})
