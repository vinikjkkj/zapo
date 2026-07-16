import assert from 'node:assert/strict'
import test from 'node:test'

import { WaMessageCoordinator } from '@client/coordinators/WaMessageCoordinator'
import { createNoopLogger } from '@infra/log/types'
import type { PeerDataOperationRequester } from '@message/primitives/peer-data-operation'
import { proto, type Proto } from '@proto'

interface RequestCall {
    readonly type: Proto.Message.PeerDataOperationRequestType
    readonly body: Proto.Message.IPeerDataOperationRequestMessage
}

function createFakePdo(): {
    readonly requester: PeerDataOperationRequester
    readonly sendCalls: RequestCall[]
    readonly requestCalls: RequestCall[]
} {
    const sendCalls: RequestCall[] = []
    const requestCalls: RequestCall[] = []
    const requester: PeerDataOperationRequester = {
        send: async (type, body) => {
            sendCalls.push({ type, body })
            return { messageId: `mid-${sendCalls.length}` }
        },
        request: async (type, body) => {
            requestCalls.push({ type, body })
            return []
        }
    }
    return { requester, sendCalls, requestCalls }
}

function createCoordinator(peerDataOperation: PeerDataOperationRequester): WaMessageCoordinator {
    return new WaMessageCoordinator({
        messageDispatch: {} as never,
        mediaTransfer: {} as never,
        mediaUploadOptions: {} as never,
        logger: createNoopLogger(),
        messageStore: {} as never,
        messageSecretStore: {} as never,
        trustedContactToken: {} as never,
        emitAddon: () => undefined,
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        peerDataOperation
    })
}

test('requestHistorySync sends HISTORY_SYNC_ON_DEMAND PDO with normalized jid and anchor fields', async () => {
    const pdo = createFakePdo()
    const coordinator = createCoordinator(pdo.requester)

    const result = await coordinator.requestHistorySync({
        chatJid: '120363@g.us',
        oldestMsgId: 'msgid-1',
        oldestMsgFromMe: true,
        oldestMsgTimestampMs: 1_700_000_000_000,
        count: 25
    })

    assert.equal(result.messageId, 'mid-1')
    assert.equal(pdo.sendCalls.length, 1)
    const sent = pdo.sendCalls[0]
    assert.equal(sent.type, proto.Message.PeerDataOperationRequestType.HISTORY_SYNC_ON_DEMAND)
    const req = sent.body.historySyncOnDemandRequest
    assert.ok(req)
    assert.equal(req.chatJid, '120363@g.us')
    assert.equal(req.oldestMsgId, 'msgid-1')
    assert.equal(req.oldestMsgFromMe, true)
    assert.equal(req.oldestMsgTimestampMs, 1_700_000_000_000)
    assert.equal(req.onDemandMsgCount, 25)
    assert.equal(req.supportInlineResponse, true)
})

test('requestHistorySync omits optional anchor fields when not provided', async () => {
    const pdo = createFakePdo()
    const coordinator = createCoordinator(pdo.requester)

    await coordinator.requestHistorySync({ chatJid: '5511999999999@s.whatsapp.net' })

    const req = pdo.sendCalls[0].body.historySyncOnDemandRequest
    assert.ok(req)
    assert.equal(req.oldestMsgId, undefined)
    assert.equal(req.oldestMsgFromMe, undefined)
    assert.equal(req.oldestMsgTimestampMs, undefined)
    assert.equal(req.onDemandMsgCount, undefined)
    assert.equal(req.supportInlineResponse, true)
})

test('requestHistorySync rejects invalid count and timestamp inputs', async () => {
    const pdo = createFakePdo()
    const coordinator = createCoordinator(pdo.requester)

    await assert.rejects(
        () => coordinator.requestHistorySync({ chatJid: 'a@g.us', count: 0 }),
        /invalid count/
    )
    await assert.rejects(
        () => coordinator.requestHistorySync({ chatJid: 'a@g.us', count: 1.5 }),
        /invalid count/
    )
    await assert.rejects(
        () =>
            coordinator.requestHistorySync({
                chatJid: 'a@g.us',
                oldestMsgTimestampMs: -1
            }),
        /invalid oldestMsgTimestampMs/
    )
    assert.equal(pdo.sendCalls.length, 0)
})
