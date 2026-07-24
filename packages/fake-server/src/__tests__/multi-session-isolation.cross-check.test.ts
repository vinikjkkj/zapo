import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import { FakeWaServer, type WaFakeConnectionPipeline } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'

import { createZapoClient } from './helpers/zapo-client'

interface PairedClient {
    readonly client: WaClient
    readonly loginPipeline: WaFakeConnectionPipeline
}

function waitForMessage(
    client: WaClient,
    predicate: (event: Parameters<WaClientEventMap['message']>[0]) => boolean,
    timeoutMs = 8_000
): Promise<Parameters<WaClientEventMap['message']>[0]> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('timed out waiting for matching message')),
            timeoutMs
        )
        const listener: WaClientEventMap['message'] = (event) => {
            if (predicate(event)) {
                clearTimeout(timer)
                client.off('message', listener)
                resolve(event)
            }
        }
        client.on('message', listener)
    })
}

/** Pairs a client, waits for its post-pair login pipeline, and returns both. */
async function pairAndLogin(
    server: FakeWaServer,
    sessionId: string,
    deviceJid: string
): Promise<PairedClient> {
    const { client } = createZapoClient(server, { sessionId })

    const materialPromise = new Promise<{
        readonly advSecretKey: Uint8Array
        readonly identityPublicKey: Uint8Array
    }>((resolve) => {
        client.once('auth_qr', (event: Parameters<WaClientEventMap['auth_qr']>[0]) => {
            const parsed = parsePairingQrString(event.qr)
            resolve({
                advSecretKey: parsed.advSecretKey,
                identityPublicKey: parsed.identityPublicKey
            })
        })
    })
    const pairedPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('auth_paired timeout')), 60_000)
        client.once('auth_paired', () => {
            clearTimeout(timer)
            resolve()
        })
    })

    // Register the waiter before connecting so we capture *this* client's
    // registration pipeline, not another already-authenticated one.
    const registrationPipelinePromise = server.waitForNextAuthenticatedPipeline()
    await client.connect()
    const registrationPipeline = await registrationPipelinePromise
    await server.runPairing(registrationPipeline, { deviceJid }, () => materialPromise)

    const loginPipelinePromise = server.waitForNextAuthenticatedPipeline()
    await pairedPromise
    const loginPipeline = await loginPipelinePromise
    return { client, loginPipeline }
}

test('two clients on one server keep peers, prekeys, and captures isolated', async () => {
    // Key each authenticated connection by its login username; registration
    // (pre-pair) connections all fall under one transient bucket.
    const server = await FakeWaServer.start({
        sessionKey: ({ clientPayload }) =>
            clientPayload.kind === 'login' ? String(clientPayload.username) : 'pending'
    })

    const deviceJidA = '5511111111111:1@s.whatsapp.net'
    const deviceJidB = '5522222222222:1@s.whatsapp.net'
    const peerJidA = '5511777777777@s.whatsapp.net'
    const peerJidB = '5522888888888@s.whatsapp.net'

    let a: PairedClient | null = null
    let b: PairedClient | null = null
    try {
        // Pair sequentially so each client's identity is unambiguous.
        a = await pairAndLogin(server, 'iso-a', deviceJidA)
        b = await pairAndLogin(server, 'iso-b', deviceJidB)

        const sessionA = server.sessionFor(a.loginPipeline)
        const sessionB = server.sessionFor(b.loginPipeline)

        // Distinct sessions, and neither is the shared default.
        assert.notEqual(sessionA.id, sessionB.id)
        assert.equal(sessionA.id, '5511111111111')
        assert.equal(sessionB.id, '5522222222222')

        const peerA = await server.createFakePeer({ jid: peerJidA }, a.loginPipeline)
        // peerB is created for its registry side effect (B's session), not driven.
        await server.createFakePeer({ jid: peerJidB }, b.loginPipeline)
        await server.triggerPreKeyUpload(a.loginPipeline)
        await server.triggerPreKeyUpload(b.loginPipeline)

        // Peer registries do not leak across sessions.
        assert.ok(sessionA.registries.peerRegistry.has(peerJidA))
        assert.ok(!sessionA.registries.peerRegistry.has(peerJidB))
        assert.ok(sessionB.registries.peerRegistry.has(peerJidB))
        assert.ok(!sessionB.registries.peerRegistry.has(peerJidA))

        // Each client uploaded its own prekeys into its own dispenser: the
        // dispensers are distinct instances and each captured its own bundle
        // (a shared dispenser would hand back the same object to both).
        assert.notEqual(sessionA.preKeyDispenser, sessionB.preKeyDispenser)
        const bundleA = sessionA.preKeyDispenser.capturedPreKeyBundleSnapshot()
        const bundleB = sessionB.preKeyDispenser.capturedPreKeyBundleSnapshot()
        assert.ok(bundleA)
        assert.ok(bundleB)
        assert.notEqual(bundleA, bundleB)

        // A message from peerA reaches client A only; client B never sees it.
        const receivedByA = waitForMessage(
            a.client,
            (event) => event.message?.conversation === 'hello A'
        )
        let bSawAMessage = false
        const bListener: WaClientEventMap['message'] = (event) => {
            if (event.message?.conversation === 'hello A') bSawAMessage = true
        }
        b.client.on('message', bListener)

        await peerA.sendConversation('hello A')
        const eventA = await receivedByA
        assert.equal(eventA.message?.conversation, 'hello A')

        // The peer↔client channel is isolated: B's session captured nothing
        // from A's exchange.
        const capturedByB = sessionB.capturedStanzaSnapshot()
        assert.equal(
            capturedByB.some((node) => node.tag === 'message'),
            false
        )
        assert.equal(bSawAMessage, false)
        b.client.off('message', bListener)
    } finally {
        await a?.client.disconnect().catch(() => undefined)
        await b?.client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
