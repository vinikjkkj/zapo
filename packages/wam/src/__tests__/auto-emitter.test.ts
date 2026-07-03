import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { WaConnectionEvent } from 'zapo-js'

import { WaWamAutoEmitter, type WaWamAutoEmitterContext } from '../WaWamAutoEmitter.js'
import type { WaWamCoordinator } from '../WaWamCoordinator.js'

interface Commit {
    readonly name: string
    readonly payload: unknown
}

function makeHarness() {
    const commits: Commit[] = []
    const handlers = new Map<string, (event: unknown) => void>()
    const coordinator = {
        commit: (name: string, payload: unknown) => commits.push({ name, payload })
    } as unknown as WaWamCoordinator
    const ctx = {
        on: (event: string, handler: (event: unknown) => void) => handlers.set(event, handler),
        off: (event: string, handler: (event: unknown) => void) => {
            if (handlers.get(event) === handler) handlers.delete(event)
        }
    } as unknown as WaWamAutoEmitterContext
    const emit = (event: string, payload: unknown) => handlers.get(event)?.(payload)
    return { commits, handlers, coordinator, ctx, emit }
}

const openEvent = (isNewLogin: boolean): WaConnectionEvent =>
    ({ status: 'open', reason: 'connected', isNewLogin }) as WaConnectionEvent

test('auto-emitter maps a group message to MessageReceive (GROUP, isLid, offline)', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message', {
        key: {
            remoteJid: '123@g.us',
            participant: '456@lid',
            isGroup: true,
            isBroadcast: false,
            isNewsletter: false
        },
        offline: true,
        rawNode: { tag: 'message', attrs: {} }
    })
    assert.deepEqual(h.commits, [
        {
            name: 'MessageReceive',
            payload: {
                messageType: 'GROUP',
                isLid: true,
                messageIsOffline: true,
                typeOfGroup: 'GROUP'
            }
        }
    ])
})

test('auto-emitter maps a 1:1 pn message to INDIVIDUAL without typeOfGroup', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message', {
        key: {
            remoteJid: '5511999999999@s.whatsapp.net',
            isGroup: false,
            isBroadcast: false,
            isNewsletter: false
        },
        rawNode: { tag: 'message', attrs: {} }
    })
    assert.deepEqual(h.commits[0], {
        name: 'MessageReceive',
        payload: { messageType: 'INDIVIDUAL', isLid: false, messageIsOffline: false }
    })
})

test('auto-emitter derives E2eMessageRecv from the raw inbound stanza before MessageReceive', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message', {
        key: {
            remoteJid: '123@g.us',
            participant: '456@lid',
            isGroup: true,
            isBroadcast: false,
            isNewsletter: false
        },
        offline: false,
        rawNode: {
            tag: 'message',
            attrs: { from: '123@g.us' },
            content: [{ tag: 'enc', attrs: { v: '2', type: 'skmsg' } }]
        }
    })
    assert.deepEqual(h.commits[0], {
        name: 'E2eMessageRecv',
        payload: {
            e2eSuccessful: true,
            e2eDestination: 'GROUP',
            isLid: true,
            offline: false,
            e2eCiphertextType: 'SENDER_KEY_MESSAGE',
            e2eCiphertextVersion: 2,
            typeOfGroup: 'GROUP'
        }
    })
    assert.equal(h.commits[1]?.name, 'MessageReceive')
})

test('auto-emitter maps a receipt to ReceiptStanzaReceive with type and count', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('receipt', { status: 'read', messageIds: ['a', 'b', 'c'] })
    assert.deepEqual(h.commits[0], {
        name: 'ReceiptStanzaReceive',
        payload: { receiptStanzaType: 'read', receiptStanzaTotalCount: 3 }
    })
})

test('auto-emitter derives E2eMessageSend from an outbound group media message', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'message',
            attrs: { to: '123@g.us', id: 'm1', type: 'media' },
            content: [{ tag: 'enc', attrs: { v: '2', type: 'skmsg', mediatype: 'image' } }]
        }
    })
    assert.deepEqual(h.commits[0], {
        name: 'E2eMessageSend',
        payload: {
            e2eSuccessful: true,
            e2eDestination: 'GROUP',
            isLid: false,
            e2eCiphertextType: 'SENDER_KEY_MESSAGE',
            e2eCiphertextVersion: 2,
            messageMediaType: 'PHOTO',
            typeOfGroup: 'GROUP'
        }
    })
})

test('auto-emitter derives isLid + retryCount for a lid pkmsg retry, and ignores non-messages', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', { node: { tag: 'ack', attrs: {} } })
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'message',
            attrs: { to: '456@lid', id: 'm2', addressing_mode: 'lid' },
            content: [{ tag: 'enc', attrs: { v: '2', type: 'pkmsg', count: '2' } }]
        }
    })
    assert.equal(h.commits.length, 2)
    assert.deepEqual(h.commits[0], {
        name: 'E2eMessageSend',
        payload: {
            e2eSuccessful: true,
            e2eDestination: 'INDIVIDUAL',
            isLid: true,
            e2eCiphertextType: 'PREKEY_MESSAGE',
            e2eCiphertextVersion: 2,
            retryCount: 2
        }
    })
    assert.equal(h.commits[1]?.name, 'WebcMessageSend')
})

test('auto-emitter fires MessageHighRetryCount only for retry receipts at/above the threshold', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    const retryReceipt = (count: string) => ({
        node: {
            tag: 'receipt',
            attrs: { type: 'retry', from: '123@g.us', is_lid: 'false' },
            content: [{ tag: 'retry', attrs: { count, id: 'm1' } }]
        }
    })
    h.emit('debug_transport_node_in', retryReceipt('3'))
    assert.equal(h.commits.length, 0)
    h.emit('debug_transport_node_in', retryReceipt('5'))
    assert.deepEqual(h.commits[0], {
        name: 'MessageHighRetryCount',
        payload: { retryCount: 5, messageType: 'GROUP', isSenderLidBased: false }
    })
})

test('auto-emitter fires MessageSend when an ack matches a tracked outbound message', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'message',
            attrs: { to: '5511999999999@s.whatsapp.net', id: 'sendme' },
            content: [{ tag: 'enc', attrs: { v: '2', type: 'msg' } }]
        }
    })
    h.commits.length = 0
    h.emit('debug_transport_node_in', {
        node: { tag: 'ack', attrs: { class: 'message', id: 'sendme' } }
    })
    assert.deepEqual(h.commits[0], {
        name: 'MessageSend',
        payload: {
            messageSendResult: 'OK',
            messageType: 'INDIVIDUAL',
            isLid: false,
            e2eCiphertextType: 'MESSAGE'
        }
    })
    h.commits.length = 0
    h.emit('debug_transport_node_in', {
        node: { tag: 'ack', attrs: { class: 'message', id: 'nope' } }
    })
    assert.equal(h.commits.length, 0)
})

test('auto-emitter reports ClockSkewDifferenceT once when a stanza timestamp is far off', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_in', { node: { tag: 'message', attrs: { t: '0' } } })
    assert.equal(h.commits.length, 1)
    assert.equal(h.commits[0]?.name, 'ClockSkewDifferenceT')
    assert.ok((h.commits[0]?.payload as { clockSkewHourly: number }).clockSkewHourly > 0)
    h.emit('debug_transport_node_in', { node: { tag: 'receipt', attrs: { t: '0' } } })
    assert.equal(h.commits.length, 1)
})

test('auto-emitter does not report clock skew for an in-sync timestamp', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    const nowSeconds = String(Math.floor(Date.now() / 1000))
    h.emit('debug_transport_node_in', { node: { tag: 'message', attrs: { t: nowSeconds } } })
    assert.equal(h.commits.length, 0)
})

test('auto-emitter commits WebcSocketConnect with PAGE_LOAD on a fresh login', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('connection', openEvent(true))
    assert.deepEqual(h.commits, [
        { name: 'WebcSocketConnect', payload: { webcSocketConnectReason: 'PAGE_LOAD' } }
    ])
})

test('auto-emitter uses RECONNECT when it is not a new login', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('connection', openEvent(false))
    assert.equal(
        (h.commits[0]?.payload as { webcSocketConnectReason: string }).webcSocketConnectReason,
        'RECONNECT'
    )
})

test('auto-emitter maps an unhandled stanza to UnknownStanza', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_unhandled_stanza', {
        reason: 'no handler',
        rawNode: { tag: 'notification', attrs: { type: 'shmex' } }
    })
    assert.deepEqual(h.commits[0], {
        name: 'UnknownStanza',
        payload: { unknownStanzaTag: 'notification', unknownStanzaType: 'shmex' }
    })
})

test('auto-emitter maps a history-sync chunk to MdBootstrapHistoryDataReceived', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('history_sync_chunk', { syncType: 2, messagesCount: 10, chunkOrder: 3, progress: 40 })
    assert.deepEqual(h.commits[0], {
        name: 'MdBootstrapHistoryDataReceived',
        payload: { historySyncChunkOrder: 3, historySyncStageProgress: 40 }
    })
})

test('auto-emitter ignores non-open connection events and detaches on dispose', () => {
    const h = makeHarness()
    const emitter = new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('connection', { status: 'close', reason: 'lost', isNewLogin: false })
    assert.equal(h.commits.length, 0)
    emitter.dispose()
    assert.equal(h.handlers.size, 0)
})
