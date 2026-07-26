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
