import assert from 'node:assert/strict'
import test from 'node:test'

import {
    createIncomingFailureHandler,
    createIncomingNotificationHandler,
    createIncomingReceiptHandler,
    createIncomingRegistrationNotificationHandler
} from '@client/incoming'
import type { WaAccountTakeoverNoticeEvent, WaRegistrationCodeEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import {
    WA_DISCONNECT_REASONS,
    WA_NOTIFICATION_TYPES,
    WA_REGISTRATION_NOTIFICATION_TAGS
} from '@protocol/constants'
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

test('registration notification handler emits registration_code event and acks', async () => {
    const sent: BinaryNode[] = []
    const codes: WaRegistrationCodeEvent[] = []
    const takeovers: WaAccountTakeoverNoticeEvent[] = []
    const handler = createIncomingRegistrationNotificationHandler({
        logger: createLogger(),
        sendNode: async (node) => {
            sent.push(node)
        },
        emitRegistrationCode: (event) => {
            codes.push(event)
        },
        emitAccountTakeoverNotice: (event) => {
            takeovers.push(event)
        }
    })

    const handled = await handler({
        tag: 'notification',
        attrs: {
            id: 'reg-1',
            from: 's.whatsapp.net',
            type: WA_NOTIFICATION_TYPES.REGISTRATION
        },
        content: [
            {
                tag: WA_REGISTRATION_NOTIFICATION_TAGS.WA_OLD_REGISTRATION,
                attrs: {
                    code: '987654',
                    expiry_t: '1700000123',
                    device_id: 'OTHER_DEVICE'
                }
            }
        ]
    })

    assert.equal(handled, true)
    assert.equal(codes.length, 1)
    assert.equal(codes[0].code, '987654')
    assert.equal(codes[0].expiryTimestampMs, 1700000123 * 1000)
    assert.equal(codes[0].fromDeviceId, 'OTHER_DEVICE')
    assert.equal(takeovers.length, 0)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].tag, 'ack')
    assert.equal(sent[0].attrs.type, WA_NOTIFICATION_TYPES.REGISTRATION)
    assert.equal(sent[0].attrs.id, 'reg-1')
    assert.equal(sent[0].attrs.class, 'notification')
})

test('registration notification handler emits account_takeover_notice for device_logout child', async () => {
    const sent: BinaryNode[] = []
    const codes: WaRegistrationCodeEvent[] = []
    const takeovers: WaAccountTakeoverNoticeEvent[] = []
    const handler = createIncomingRegistrationNotificationHandler({
        logger: createLogger(),
        sendNode: async (node) => {
            sent.push(node)
        },
        emitRegistrationCode: (event) => {
            codes.push(event)
        },
        emitAccountTakeoverNotice: (event) => {
            takeovers.push(event)
        }
    })

    const handled = await handler({
        tag: 'notification',
        attrs: {
            id: 'reg-2',
            from: 's.whatsapp.net',
            type: WA_NOTIFICATION_TYPES.REGISTRATION
        },
        content: [
            {
                tag: WA_REGISTRATION_NOTIFICATION_TAGS.DEVICE_LOGOUT,
                attrs: {
                    id: 'logout-xyz',
                    t: '1700000456'
                }
            }
        ]
    })

    assert.equal(handled, true)
    assert.equal(codes.length, 0)
    assert.equal(takeovers.length, 1)
    assert.equal(takeovers[0].serverToken, 'logout-xyz')
    assert.equal(takeovers[0].attemptTimestampMs, 1700000456 * 1000)
    assert.equal(sent.length, 1)
})

test('registration notification handler defers to default handler for unrecognized payloads', async () => {
    const sent: BinaryNode[] = []
    const codes: WaRegistrationCodeEvent[] = []
    const takeovers: WaAccountTakeoverNoticeEvent[] = []
    const handler = createIncomingRegistrationNotificationHandler({
        logger: createLogger(),
        sendNode: async (node) => {
            sent.push(node)
        },
        emitRegistrationCode: (event) => {
            codes.push(event)
        },
        emitAccountTakeoverNotice: (event) => {
            takeovers.push(event)
        }
    })

    const handledOther = await handler({
        tag: 'notification',
        attrs: { id: 'x', from: 's.whatsapp.net', type: 'server_sync' }
    })
    assert.equal(handledOther, false)

    const handledUnknownChild = await handler({
        tag: 'notification',
        attrs: { id: 'r', from: 's.whatsapp.net', type: WA_NOTIFICATION_TYPES.REGISTRATION },
        content: [{ tag: 'unknown', attrs: {} }]
    })
    assert.equal(handledUnknownChild, false)

    assert.equal(codes.length, 0)
    assert.equal(takeovers.length, 0)
    assert.equal(sent.length, 0)
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
