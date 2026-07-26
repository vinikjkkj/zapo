import type { WaClient, WaClientEventMap } from 'zapo-js'

import type { FakeWaServer } from '../../api/FakeWaServer'
import type { WaFakeConnectionPipeline } from '../../infra/WaFakeConnectionPipeline'

/**
 * Resolves with the connection of the next client that authenticates
 * unregistered, i.e. a companion waiting to be paired.
 *
 * Filtering by payload matters: `connect()` can resolve a tick before the
 * server fires its own authentication hook, so a plain "next authenticated
 * pipeline" wait races and may hand back the connection that just came up.
 */
export interface LinkedCompanionFixture {
    readonly deviceJid: string
    readonly keyIndex: number
    readonly qr: string
}

/**
 * Runs the QR link end to end: the companion connects and renders a QR, and the
 * already-connected primary signs it. Resolves once the primary has the device
 * jid the server minted.
 */
export async function linkCompanionViaQr(
    server: FakeWaServer,
    primary: WaClient,
    companion: WaClient
): Promise<LinkedCompanionFixture> {
    const pipelinePromise = waitForCompanionPipeline(server)
    const qrPromise = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('auth_qr timed out')), 30_000)
        companion.once('auth_qr', (event: Parameters<WaClientEventMap['auth_qr']>[0]) => {
            clearTimeout(timer)
            resolve(event.qr)
        })
    })
    // connect() only resolves once pairing finishes, so it runs detached.
    void companion.connect().catch(() => undefined)
    await server.offerCompanionPairing(await pipelinePromise)
    const qr = await qrPromise
    const linked = await primary.mobile.linkCompanion(qr)
    return { deviceJid: linked.deviceJid, keyIndex: linked.keyIndex, qr }
}

export function waitForCompanionPipeline(
    server: FakeWaServer,
    timeoutMs = 30_000
): Promise<WaFakeConnectionPipeline> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            unregister()
            reject(new Error('companion pipeline timed out'))
        }, timeoutMs)
        const unregister = server.onAuthenticatedPipeline((pipeline) => {
            if (pipeline.clientPayload?.kind !== 'registration') {
                return
            }
            clearTimeout(timer)
            unregister()
            resolve(pipeline)
        })
    })
}
