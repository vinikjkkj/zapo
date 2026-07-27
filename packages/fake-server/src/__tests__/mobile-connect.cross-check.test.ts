import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'

import { createZapoMobileClient } from './helpers/zapo-mobile-client'

test('mobile client completes the noise handshake over the raw tcp listener', async () => {
    const server = await FakeWaServer.start({ tcp: true })
    const { client, primary } = await createZapoMobileClient(server, {
        sessionId: 'mobile-connect',
        phoneNumber: '5511988887777'
    })

    try {
        await client.connect()

        const pipeline = await server.waitForAuthenticatedPipeline(5_000)
        const payload = pipeline.clientPayload
        assert.ok(payload, 'server should have parsed the mobile login payload')
        assert.equal(payload.kind, 'login')
        if (payload.kind !== 'login') {
            return
        }
        assert.equal(payload.flavor, 'mobile', 'server should classify the payload as mobile')
        assert.equal(payload.username, '5511988887777')
        assert.equal(payload.device, 0, 'a primary is always device 0')
        assert.equal(payload.mobile?.manufacturer, primary.deviceInfo.manufacturer)
        assert.equal(payload.mobile?.device, primary.deviceInfo.device)
        assert.equal(payload.mobile?.appVersion, primary.deviceInfo.appVersion)
        assert.ok(payload.mobile?.phoneId, 'phone id should be advertised')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('tcp url is only exposed when the mobile listener is enabled', async () => {
    const server = await FakeWaServer.start()
    try {
        assert.ok(server.url.startsWith('ws://'))
        assert.throws(() => server.tcpUrl, /no mobile listener/)
    } finally {
        await server.stop()
    }
})

test('both listeners serve the same server identity', async () => {
    const server = await FakeWaServer.start({ tcp: true })
    try {
        assert.ok(server.url.startsWith('ws://'))
        assert.ok(server.tcpUrl.startsWith('tcp://'))
        assert.notEqual(
            server.tcpUrl.split(':')[2],
            server.url.split(':')[2],
            'listeners bind independent ports'
        )
    } finally {
        await server.stop()
    }
})

test('a failed mobile bind rolls back the listeners that already came up', async () => {
    // Free a known websocket port, then make the mobile bind clash.
    const probe = await FakeWaServer.start()
    const wsPort = probe.port
    await probe.stop()

    const occupied = await FakeWaServer.start({ tcp: true })
    const tcpPort = Number(occupied.tcpUrl.split(':')[2])
    const clashing = new FakeWaServer({ port: wsPort, tcp: { port: tcpPort } })

    try {
        await assert.rejects(() => clashing.listen(), 'the mobile listener cannot bind')
        assert.throws(() => clashing.url, /not listening/, 'the server reports itself down')

        // Only possible if the websocket listener was actually closed again.
        const reuse = await FakeWaServer.start({ port: wsPort })
        assert.equal(reuse.port, wsPort)
        await reuse.stop()
    } finally {
        await occupied.stop()
    }
})
