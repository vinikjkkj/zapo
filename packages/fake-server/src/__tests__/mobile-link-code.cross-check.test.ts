import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'

import { waitForCompanionPipeline } from './helpers/companion-pipeline'
import { createZapoClient } from './helpers/zapo-client'
import { createZapoMobileClient } from './helpers/zapo-mobile-client'

const PHONE = '5511970002222'

/**
 * Brings a companion up to the point where it can ask for a pairing code: its
 * connection is live and it has rendered a QR. That mirrors the real flow,
 * where the user is looking at the QR screen when they pick "link with phone
 * number instead", and it is the only client-side signal that the socket is
 * ready for the request.
 */
async function bringCompanionToPairingScreen(
    server: FakeWaServer,
    companion: WaClient
): Promise<void> {
    const qrPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('auth_qr timed out')), 30_000)
        companion.once('auth_qr', () => {
            clearTimeout(timer)
            resolve()
        })
    })
    const pipelinePromise = waitForCompanionPipeline(server)
    // connect() only resolves once pairing finishes, so it runs detached.
    void companion.connect().catch(() => undefined)
    await server.offerCompanionPairing(await pipelinePromise)
    await qrPromise
}

/**
 * The primary records `companion_hello` when the relayed notification lands,
 * and nothing on the client surfaces that moment, so the link attempt is
 * retried until the notification has been processed.
 */
async function linkByCodeWhenReady(
    link: () => Promise<{ readonly deviceJid: string; readonly keyIndex: number }>,
    attempts = 20,
    delayMs = 100
): Promise<{ readonly deviceJid: string; readonly keyIndex: number }> {
    let lastError: unknown
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            return await link()
        } catch (error) {
            lastError = error
            if (!String(error).includes('no pending companion')) {
                throw error
            }
            await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
    }
    throw lastError
}

test('link-code pairing runs end to end between two real clients', async () => {
    const server = await FakeWaServer.start({ tcp: true })
    const { client: primary } = await createZapoMobileClient(server, {
        sessionId: 'link-code-primary',
        phoneNumber: PHONE
    })
    const { client: companion } = createZapoClient(server, {
        sessionId: 'link-code-companion'
    })

    const pairedPromise = new Promise<Parameters<WaClientEventMap['auth_paired']>[0]>(
        (resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('auth_paired timed out')), 30_000)
            companion.once('auth_paired', (event) => {
                clearTimeout(timer)
                resolve(event)
            })
        }
    )

    try {
        await primary.connect()
        await bringCompanionToPairingScreen(server, companion)

        const code = await companion.auth.requestPairingCode(PHONE)
        assert.ok(code.length > 0, 'the companion receives a pairing code')

        const linked = await linkByCodeWhenReady(() => primary.mobile.linkCompanionByCode(code))
        assert.match(linked.deviceJid, new RegExp(`^${PHONE}:\\d+@s\\.whatsapp\\.net$`))

        // Reaching pair-success proves the whole handshake: both sides derived
        // the same adv secret from the code, so the companion's HMAC check on
        // the primary-signed identity passes.
        const paired = await pairedPromise
        assert.equal(paired.credentials.meJid, linked.deviceJid)

        const companions = server.companionHost.linkedCompanions()
        assert.equal(companions.length, 1)
        assert.equal(companions[0].deviceJid, linked.deviceJid)
    } finally {
        await companion.disconnect().catch(() => undefined)
        await primary.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('pairing code request is rejected when the primary is offline', async () => {
    const server = await FakeWaServer.start({ tcp: true })
    const { client: companion } = createZapoClient(server, {
        sessionId: 'link-code-no-primary'
    })

    try {
        await bringCompanionToPairingScreen(server, companion)

        await assert.rejects(
            () => companion.auth.requestPairingCode(PHONE),
            /404|companion hello/,
            'the server refuses to open a handshake with nobody on the other side'
        )
    } finally {
        await companion.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('a second account logging into the same session gets no companion-host wiring', async () => {
    const server = await FakeWaServer.start({ tcp: true })
    const { client: owner } = await createZapoMobileClient(server, {
        sessionId: 'link-code-owner',
        phoneNumber: PHONE
    })
    const intruderPhone = '5511970004444'
    const { client: intruder } = await createZapoMobileClient(server, {
        sessionId: 'link-code-intruder',
        phoneNumber: intruderPhone
    })
    const { client: companion } = createZapoClient(server, {
        sessionId: 'link-code-intruder-companion'
    })

    try {
        await owner.connect()
        await intruder.connect()
        await bringCompanionToPairingScreen(server, companion)

        // The session belongs to the first number, so a code aimed at the
        // second one must not be relayed to its connection - the link would be
        // minted under the owner's number.
        await assert.rejects(
            () => companion.auth.requestPairingCode(intruderPhone),
            /404|companion hello/
        )

        // The owner still works.
        const code = await companion.auth.requestPairingCode(PHONE)
        assert.ok(code.length > 0)
    } finally {
        await companion.disconnect().catch(() => undefined)
        await intruder.disconnect().catch(() => undefined)
        await owner.disconnect().catch(() => undefined)
        await server.stop()
    }
})
