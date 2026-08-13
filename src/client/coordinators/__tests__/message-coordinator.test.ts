import assert from 'node:assert/strict'
import test from 'node:test'

import { WaMessageCoordinator } from '@client/coordinators/WaMessageCoordinator'
import { createNoopLogger } from '@infra/log/types'
import type { WaMediaRetryRequest, WaMediaRetryRequester } from '@message/primitives/media-retry'
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

function createCoordinator(
    peerDataOperation: PeerDataOperationRequester,
    mediaRetry: Partial<WaMediaRetryRequester> = {}
): WaMessageCoordinator {
    return new WaMessageCoordinator({
        messageDispatch: {} as never,
        mediaTransfer: {} as never,
        mediaRetry: mediaRetry as WaMediaRetryRequester,
        mediaUploadOptions: {} as never,
        logger: createNoopLogger(),
        messageStore: {} as never,
        messageSecretStore: {} as never,
        trustedContactToken: {} as never,
        emitAddon: () => undefined,
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        peerDataOperation,
        isGroupHistorySendEnabled: () => true,
        getAbPropNumber: () => 100
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
        /count must be a positive safe integer/
    )
    await assert.rejects(
        () => coordinator.requestHistorySync({ chatJid: 'a@g.us', count: 1.5 }),
        /count must be a positive safe integer/
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

test('requestMediaReupload derives the request from an incoming message event', async () => {
    const calls: WaMediaRetryRequest[] = []
    const coordinator = createCoordinator(createFakePdo().requester, {
        request: async (input) => {
            calls.push(input)
            return {
                messageId: input.messageId,
                result: 'success',
                resultCode: 1,
                directPath: '/v/x'
            }
        }
    })
    const mediaKey = new Uint8Array(32).fill(3)

    const result = await coordinator.requestMediaReupload({
        rawNode: { tag: 'message', attrs: {} },
        key: {
            remoteJid: '120363@g.us',
            id: 'MSG1',
            fromMe: false,
            isGroup: true,
            isBroadcast: false,
            isNewsletter: false,
            senderDevice: 0,
            participant: '5511@s.whatsapp.net'
        },
        offline: false,
        message: { imageMessage: { directPath: '/v/old', mediaKey } }
    } as never)

    assert.equal(result.directPath, '/v/x')
    assert.equal(calls.length, 1)
    assert.deepEqual(
        { ...calls[0], mediaKey: undefined },
        {
            messageId: 'MSG1',
            chatJid: '120363@g.us',
            fromMe: false,
            participant: '5511@s.whatsapp.net',
            mediaKey: undefined,
            timeoutMs: undefined
        }
    )
    assert.deepEqual(calls[0].mediaKey, mediaKey)
})

test('requestMediaReupload rejects newsletters and messages without media', () => {
    const coordinator = createCoordinator(createFakePdo().requester)
    const base = {
        rawNode: { tag: 'message', attrs: {} },
        offline: false,
        message: { imageMessage: { directPath: '/v/x', mediaKey: new Uint8Array(32) } }
    }
    const key = {
        remoteJid: '123@newsletter',
        id: 'MSG1',
        fromMe: false,
        isGroup: false,
        isBroadcast: false,
        isNewsletter: true,
        senderDevice: 0
    }

    assert.throws(() => coordinator.requestMediaReupload({ ...base, key } as never), /newsletter/)
    assert.throws(
        () =>
            coordinator.requestMediaReupload({
                ...base,
                key: { ...key, isNewsletter: false },
                message: { conversation: 'hi' }
            } as never),
        /no downloadable media/
    )
})
