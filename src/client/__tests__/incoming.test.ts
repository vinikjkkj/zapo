import assert from 'node:assert/strict'
import test from 'node:test'

import { createIncomingNotificationHandler } from '@client/incoming'
import type { Logger } from '@infra/log/types'
import type { BinaryNode } from '@transport/types'

function createLogger(): Logger {
    return {
        level: 'trace',
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
    }
}

test('notification ack includes participant only for mediaretry and psa types', async () => {
    const sent: BinaryNode[] = []
    const handler = createIncomingNotificationHandler({
        logger: createLogger(),
        sendNode: async (node) => {
            sent.push(node)
        },
        emitIncomingNotification: () => undefined,
        emitUnhandledStanza: () => undefined
    })

    await handler({
        tag: 'notification',
        attrs: {
            id: 'mediaretry-1',
            from: 's.whatsapp.net',
            type: 'mediaretry',
            participant: '5511999999999@s.whatsapp.net'
        }
    })
    assert.equal(sent.length, 1)
    assert.equal(sent[0].attrs.participant, '5511999999999@s.whatsapp.net')

    await handler({
        tag: 'notification',
        attrs: {
            id: 'psa-1',
            from: 'status@broadcast',
            type: 'psa',
            participant: '5511888888888@s.whatsapp.net'
        }
    })
    assert.equal(sent.length, 2)
    assert.equal(sent[1].attrs.participant, '5511888888888@s.whatsapp.net')

    await handler({
        tag: 'notification',
        attrs: {
            id: 'contacts-1',
            from: 's.whatsapp.net',
            type: 'contacts',
            participant: '5511777777777@s.whatsapp.net'
        }
    })
    assert.equal(sent.length, 3)
    assert.equal('participant' in sent[2].attrs, false)
})

test('notification ack omits type only for encrypt and devices types', async () => {
    const sent: BinaryNode[] = []
    const handler = createIncomingNotificationHandler({
        logger: createLogger(),
        sendNode: async (node) => {
            sent.push(node)
        },
        emitIncomingNotification: () => undefined,
        emitUnhandledStanza: () => undefined
    })

    await handler({
        tag: 'notification',
        attrs: {
            id: 'encrypt-1',
            from: 's.whatsapp.net',
            type: 'encrypt'
        }
    })
    assert.equal(sent.length, 1)
    assert.equal('type' in sent[0].attrs, false)

    await handler({
        tag: 'notification',
        attrs: {
            id: 'devices-1',
            from: '5511999999999:2@s.whatsapp.net',
            type: 'devices'
        }
    })
    assert.equal(sent.length, 2)
    assert.equal('type' in sent[1].attrs, false)

    await handler({
        tag: 'notification',
        attrs: {
            id: 'server-sync-1',
            from: 's.whatsapp.net',
            type: 'server_sync'
        },
        content: [{ tag: 'collection', attrs: { name: 'regular' } }]
    })
    assert.equal(sent.length, 3)
    assert.equal(sent[2].attrs.type, 'server_sync')
})
