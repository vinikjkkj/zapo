/**
 * Phase 4 cross-check tests for stream:error variants.
 *
 * For each variant we cover, the fake server pushes a `<stream:error/>`
 * stanza to a freshly-connected `WaClient` and asserts the lib reacts with
 * the expected `connection { status: 'close', reason }` event.
 *
 * The reasons we assert against are the constants the lib emits when its
 * own `WaStreamControlCoordinator` parses each variant — they live in
 * `src/protocol/stream.ts` (`WA_DISCONNECT_REASONS`). The fake server only
 * builds the stanza; the lib does the parsing & dispatching.
 *
 * NOTE: this file is allowed to import zapo-js directly because it is a
 * cross-check test that drives the lib end-to-end.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClient } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import {
    buildStreamErrorCode,
    buildStreamErrorDeviceRemoved,
    buildStreamErrorReplaced
} from '../protocol/stream/stream-error'

import { createZapoClient } from './helpers/zapo-client'

interface CloseEvent {
    readonly status: 'close'
    readonly reason: string
}

function waitForCloseReason(client: WaClient, timeoutMs = 5_000): Promise<CloseEvent> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`timed out waiting for connection close after ${timeoutMs}ms`)),
            timeoutMs
        )
        client.on('connection', (event) => {
            if (event.status === 'close') {
                clearTimeout(timer)
                resolve({ status: 'close', reason: String(event.reason) })
            }
        })
    })
}

async function pushStreamErrorAndWaitForClose(
    server: FakeWaServer,
    streamError: ReturnType<typeof buildStreamErrorCode>
): Promise<{ readonly client: WaClient; readonly close: CloseEvent }> {
    server.scenario((s) => {
        s.afterAuth(async (pipeline) => {
            // Hand the pipeline a moment to settle the success node before we
            // intentionally tear it down with the stream:error.
            await new Promise((resolve) => setTimeout(resolve, 30))
            await pipeline.sendStanza(streamError)
        })
    })

    const { client } = createZapoClient(server, { sessionId: `stream-error-${Date.now()}` })
    const closePromise = waitForCloseReason(client)

    await client.connect()
    const close = await closePromise
    return { client, close }
}

test('stream:error code=516 triggers a logout-style close (force_logout)', async () => {
    const server = await FakeWaServer.start()
    try {
        const { client, close } = await pushStreamErrorAndWaitForClose(
            server,
            buildStreamErrorCode(516)
        )
        assert.equal(close.status, 'close')
        assert.equal(close.reason, 'stream_error_force_logout')
        await client.disconnect().catch(() => undefined)
    } finally {
        await server.stop()
    }
})

test('stream:error <conflict type="replaced"/> triggers stream_error_replaced close', async () => {
    const server = await FakeWaServer.start()
    try {
        const { client, close } = await pushStreamErrorAndWaitForClose(
            server,
            buildStreamErrorReplaced()
        )
        assert.equal(close.reason, 'stream_error_replaced')
        await client.disconnect().catch(() => undefined)
    } finally {
        await server.stop()
    }
})

test('stream:error <conflict type="device_removed"/> triggers stream_error_device_removed close', async () => {
    const server = await FakeWaServer.start()
    try {
        const { client, close } = await pushStreamErrorAndWaitForClose(
            server,
            buildStreamErrorDeviceRemoved()
        )
        assert.equal(close.reason, 'stream_error_device_removed')
        await client.disconnect().catch(() => undefined)
    } finally {
        await server.stop()
    }
})
