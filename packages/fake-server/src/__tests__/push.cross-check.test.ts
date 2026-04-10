import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { buildCall, buildFailure } from '../protocol/push/call-failure'
import { buildChatstate } from '../protocol/push/chatstate'
import { buildIncomingErrorStanza } from '../protocol/push/error-stanza'
import { buildGroupNotification, buildNotification } from '../protocol/push/notification'
import { buildIncomingPresence } from '../protocol/push/presence'
import { buildReceipt } from '../protocol/push/receipt'

import { createZapoClient } from './helpers/zapo-client'

function waitForEvent<K extends keyof WaClientEventMap>(
    client: WaClient,
    event: K,
    timeoutMs = 5_000
): Promise<Parameters<WaClientEventMap[K]>> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`timed out waiting for "${String(event)}"`)),
            timeoutMs
        )
        client.once(event, ((...args: Parameters<WaClientEventMap[K]>) => {
            clearTimeout(timer)
            resolve(args)
        }) as WaClientEventMap[K])
    })
}

test('server pushes <presence/> and lib emits a presence event', async () => {
    const server = await FakeWaServer.start()

    server.scenario((s) => {
        s.afterAuth(async (pipeline) => {
            await pipeline.sendStanza(
                buildIncomingPresence({
                    from: '5511999999999@s.whatsapp.net',
                    type: 'available'
                })
            )
        })
    })

    const { client } = createZapoClient(server, { sessionId: 'push-presence' })
    const presencePromise = waitForEvent(client, 'presence')

    try {
        await client.connect()
        const [event] = await presencePromise
        assert.equal(event.chatJid, '5511999999999@s.whatsapp.net')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('server pushes <chatstate><composing/></> and lib emits a chatstate event', async () => {
    const server = await FakeWaServer.start()

    server.scenario((s) => {
        s.afterAuth(async (pipeline) => {
            await pipeline.sendStanza(
                buildChatstate({
                    from: '5511999999999@s.whatsapp.net',
                    state: { kind: 'composing' }
                })
            )
        })
    })

    const { client } = createZapoClient(server, { sessionId: 'push-chatstate' })
    const chatstatePromise = waitForEvent(client, 'chatstate')

    try {
        await client.connect()
        const [event] = await chatstatePromise
        assert.equal(event.chatJid, '5511999999999@s.whatsapp.net')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('server pushes free-standing <error/> and lib emits stanza_error', async () => {
    const server = await FakeWaServer.start()

    server.scenario((s) => {
        s.afterAuth(async (pipeline) => {
            await pipeline.sendStanza(
                buildIncomingErrorStanza({ code: 503, text: 'service-unavailable' })
            )
        })
    })

    const { client } = createZapoClient(server, { sessionId: 'push-error' })
    const errorPromise = waitForEvent(client, 'stanza_error')

    try {
        await client.connect()
        const [event] = await errorPromise
        assert.ok(event)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('server pushes <receipt/> and lib emits incoming_receipt', async () => {
    const server = await FakeWaServer.start()

    server.scenario((s) => {
        s.afterAuth(async (pipeline) => {
            await pipeline.sendStanza(
                buildReceipt({
                    id: 'msg-99',
                    from: '5511999999999@s.whatsapp.net',
                    type: 'read',
                    t: 1_700_000_000
                })
            )
        })
    })

    const { client } = createZapoClient(server, { sessionId: 'push-receipt' })
    const receiptPromise = waitForEvent(client, 'message_receipt')

    try {
        await client.connect()
        const [event] = await receiptPromise
        assert.equal(event.chatJid, '5511999999999@s.whatsapp.net')
        assert.equal(event.stanzaId, 'msg-99')
        assert.equal(event.stanzaType, 'read')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('server pushes generic <notification/> and lib emits incoming_notification', async () => {
    const server = await FakeWaServer.start()

    server.scenario((s) => {
        s.afterAuth(async (pipeline) => {
            await pipeline.sendStanza(
                buildNotification({
                    id: 'notif-1',
                    type: 'fake_test',
                    content: [{ tag: 'noop', attrs: {} }]
                })
            )
        })
    })

    const { client } = createZapoClient(server, { sessionId: 'push-notification' })
    const notifPromise = waitForEvent(client, 'notification')

    try {
        await client.connect()
        const [event] = await notifPromise
        assert.equal(event.notificationType, 'fake_test')
        assert.equal(event.stanzaId, 'notif-1')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('server pushes <notification type="group"/> and lib emits a group_event', async () => {
    const server = await FakeWaServer.start()

    server.scenario((s) => {
        s.afterAuth(async (pipeline) => {
            await pipeline.sendStanza(
                buildGroupNotification({
                    id: 'gnotif-1',
                    groupJid: '12345@g.us',
                    participant: '5511999999999@s.whatsapp.net',
                    children: [
                        {
                            tag: 'subject',
                            attrs: { subject: 'New name', subject_t: '1700000000' }
                        }
                    ]
                })
            )
        })
    })

    const { client } = createZapoClient(server, { sessionId: 'push-group' })
    const groupPromise = waitForEvent(client, 'group_event')

    try {
        await client.connect()
        const [event] = await groupPromise
        assert.ok(event)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('server pushes <call/> and lib emits incoming_call', async () => {
    const server = await FakeWaServer.start()

    server.scenario((s) => {
        s.afterAuth(async (pipeline) => {
            await pipeline.sendStanza(
                buildCall({
                    id: 'call-1',
                    from: '5511999999999@s.whatsapp.net',
                    children: [
                        {
                            tag: 'offer',
                            attrs: {
                                'call-id': 'abc',
                                'call-creator': '5511999999999@s.whatsapp.net'
                            }
                        }
                    ]
                })
            )
        })
    })

    const { client } = createZapoClient(server, { sessionId: 'push-call' })
    const callPromise = waitForEvent(client, 'call')

    try {
        await client.connect()
        const [event] = await callPromise
        assert.equal(event.chatJid, '5511999999999@s.whatsapp.net')
        assert.equal(event.stanzaId, 'call-1')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('server pushes <failure/> and lib emits incoming_failure', async () => {
    const server = await FakeWaServer.start()

    server.scenario((s) => {
        s.afterAuth(async (pipeline) => {
            await pipeline.sendStanza(
                buildFailure({ reason: 'unavailable', location: 'middleware' })
            )
        })
    })

    const { client } = createZapoClient(server, { sessionId: 'push-failure' })
    const failurePromise = waitForEvent(client, 'failure')

    try {
        await client.connect()
        const [event] = await failurePromise
        assert.ok(event)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
