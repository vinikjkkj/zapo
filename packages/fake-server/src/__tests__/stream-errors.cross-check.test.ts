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

test('stream:error code=515 triggers a force-login style close', async () => {
    const server = await FakeWaServer.start()
    try {
        const { client, close } = await pushStreamErrorAndWaitForClose(
            server,
            buildStreamErrorCode(515)
        )
        assert.equal(close.status, 'close')
        assert.equal(close.reason, 'stream_error_force_login')
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
