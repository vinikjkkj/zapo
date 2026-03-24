import assert from 'node:assert/strict'
import test from 'node:test'

import {
    createIncomingFailureHandler,
    createIncomingNotificationHandler,
    createIncomingReceiptHandler
} from '@client/incoming'
import type { Logger } from '@infra/log/types'
import { WA_DISCONNECT_REASONS } from '@protocol/constants'
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

test('receipt ack omits participant for server-error receipts', async () => {
    const sent: BinaryNode[] = []
    const handler = createIncomingReceiptHandler({
        logger: createLogger(),
        sendNode: async (node) => {
            sent.push(node)
        },
        emitIncomingReceipt: () => undefined
    })

    await handler({
        tag: 'receipt',
        attrs: {
            id: 'server-error-1',
            from: '5511999999999@s.whatsapp.net',
            type: 'server-error',
            participant: '5511999999999:2@s.whatsapp.net'
        }
    })

    assert.equal(sent.length, 1)
    assert.equal(sent[0].tag, 'ack')
    assert.equal(sent[0].attrs.type, 'server-error')
    assert.equal('participant' in sent[0].attrs, false)
})

test('failure handler maps auth reasons to logout disconnect flow', async () => {
    const disconnectCalls: Array<{
        readonly reason: string
        readonly isLogout: boolean
        readonly code: number | null
    }> = []
    const emitted: unknown[] = []
    let stopCommsCalls = 0
    let clearStoredCredentialsCalls = 0
    const handler = createIncomingFailureHandler({
        logger: createLogger(),
        emitIncomingFailure: (event) => {
            emitted.push(event)
        },
        stopComms: () => {
            stopCommsCalls += 1
        },
        disconnect: async (reason, isLogout, code) => {
            disconnectCalls.push({ reason, isLogout, code })
        },
        clearStoredCredentials: async () => {
            clearStoredCredentialsCalls += 1
        }
    })

    await handler({
        tag: 'failure',
        attrs: {
            id: 'f1',
            from: 's.whatsapp.net',
            reason: '401',
            code: '515'
        }
    })

    assert.equal(emitted.length, 1)
    assert.equal(stopCommsCalls, 1)
    assert.equal(clearStoredCredentialsCalls, 1)
    assert.deepEqual(disconnectCalls, [
        {
            reason: WA_DISCONNECT_REASONS.FAILURE_NOT_AUTHORIZED,
            isLogout: true,
            code: 401
        }
    ])
})

test('failure handler maps disconnect-only reasons without clearing credentials', async () => {
    const disconnectCalls: Array<{
        readonly reason: string
        readonly isLogout: boolean
        readonly code: number | null
    }> = []
    let stopCommsCalls = 0
    let clearStoredCredentialsCalls = 0
    const handler = createIncomingFailureHandler({
        logger: createLogger(),
        emitIncomingFailure: () => undefined,
        stopComms: () => {
            stopCommsCalls += 1
        },
        disconnect: async (reason, isLogout, code) => {
            disconnectCalls.push({ reason, isLogout, code })
        },
        clearStoredCredentials: async () => {
            clearStoredCredentialsCalls += 1
        }
    })

    await handler({
        tag: 'failure',
        attrs: {
            id: 'f2',
            from: 's.whatsapp.net',
            reason: '409'
        }
    })

    assert.equal(stopCommsCalls, 1)
    assert.equal(clearStoredCredentialsCalls, 0)
    assert.deepEqual(disconnectCalls, [
        {
            reason: WA_DISCONNECT_REASONS.FAILURE_BAD_USER_AGENT,
            isLogout: false,
            code: 409
        }
    ])
})
