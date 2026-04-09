/**
 * Phase 35 cross-check: lib survives a stream:error and reconnects.
 *
 * Scenario:
 *   1. Connect a fresh client → first authenticated pipeline.
 *   2. Server pushes a `<stream:error code=515/>` (force-login) to the
 *      first pipeline. The lib closes the socket cleanly and dials
 *      again — node-ws on the fake server side accepts the new
 *      connection and a SECOND pipeline reaches the authenticated
 *      state.
 *   3. Test asserts both pipelines were observed AND that the second
 *      one is a different `WaFakeConnectionPipeline` instance from
 *      the first.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'
import { buildStreamErrorCode } from '../protocol/stream/stream-error'

import { createZapoClient } from './helpers/zapo-client'

test('client reconnects after a stream:error and the fake server sees a fresh pipeline', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'reconnect-after-error' })

    try {
        await client.connect()
        const firstPipeline = await server.waitForAuthenticatedPipeline()

        // Pre-arm a wait for the NEXT authenticated pipeline before we
        // push the stream:error so we don't race with the lib.
        const secondPipelinePromise = server.waitForNextAuthenticatedPipeline()

        // Force the lib to close + reconnect via a stream:error
        // 515 (force-login). The lib's stream-control coordinator
        // tears the current socket down and dials a fresh one.
        await firstPipeline.sendStanza(buildStreamErrorCode(515))

        const secondPipeline = await secondPipelinePromise
        assert.notEqual(
            secondPipeline,
            firstPipeline,
            'second pipeline should be a fresh instance'
        )
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
