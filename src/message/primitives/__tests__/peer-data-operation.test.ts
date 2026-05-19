import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaIncomingProtocolMessageEvent } from '@client/types'
import { createNoopLogger } from '@infra/log/types'
import { createPeerDataOperationRequester } from '@message/primitives/peer-data-operation'
import type { WaMessagePublishResult } from '@message/types'
import { proto, type Proto } from '@proto'

interface PublishedRequest {
    readonly deviceJid: string
    readonly protocolMessage: Proto.Message.IProtocolMessage
    readonly id: string
}

interface RequesterHarness {
    readonly requester: ReturnType<typeof createPeerDataOperationRequester>
    readonly published: PublishedRequest[]
    readonly emitResponse: (
        stanzaId: string | undefined | null,
        results?: readonly Proto.Message.PeerDataOperationRequestResponseMessage.IPeerDataOperationResult[]
    ) => void
    readonly emitProtocol: (event: WaIncomingProtocolMessageEvent) => void
    readonly listeners: Set<(event: WaIncomingProtocolMessageEvent) => void>
}

function createHarness(opts?: {
    readonly defaultTimeoutMs?: number
    readonly maxPending?: number
}): RequesterHarness {
    const published: PublishedRequest[] = []
    const listeners = new Set<(event: WaIncomingProtocolMessageEvent) => void>()
    let counter = 0

    const requester = createPeerDataOperationRequester({
        logger: createNoopLogger(),
        publishProtocolMessageToDevice: async (deviceJid, protocolMessage, options) => {
            const id = options?.id ?? `auto-${counter}`
            counter += 1
            published.push({ deviceJid, protocolMessage, id })
            return { id } as WaMessagePublishResult
        },
        getCurrentCredentials: () => ({ meJid: '5511920387975:0@s.whatsapp.net' }) as never,
        generateOutgoingMessageId: async () => {
            const id = `msg-${counter}`
            counter += 1
            return id
        },
        subscribeToProtocolMessage: (handler) => {
            listeners.add(handler)
            return () => {
                listeners.delete(handler)
            }
        },
        defaultTimeoutMs: opts?.defaultTimeoutMs ?? 5_000,
        maxPending: opts?.maxPending
    })

    const emitProtocol = (event: WaIncomingProtocolMessageEvent): void => {
        for (const listener of listeners) {
            listener(event)
        }
    }

    const emitResponse: RequesterHarness['emitResponse'] = (stanzaId, results = []) => {
        emitProtocol({
            rawNode: { tag: 'message', attrs: {} },
            isGroupChat: false,
            isBroadcastChat: false,
            protocolMessage: {
                type: proto.Message.ProtocolMessage.Type
                    .PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE,
                peerDataOperationRequestResponseMessage: {
                    stanzaId: stanzaId ?? undefined,
                    peerDataOperationResult: [...results]
                }
            }
        })
    }

    return { requester, published, emitResponse, emitProtocol, listeners }
}

async function flushMicrotasks(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve))
}

test('request publishes a PDO request to self user lid and resolves on matching response', async () => {
    const harness = createHarness()

    const promise = harness.requester.request(
        proto.Message.PeerDataOperationRequestType.PLACEHOLDER_MESSAGE_RESEND,
        {
            placeholderMessageResendRequest: [
                {
                    messageKey: {
                        remoteJid: '123@s.whatsapp.net',
                        fromMe: false,
                        id: 'orig-1'
                    }
                }
            ]
        }
    )
    await flushMicrotasks()

    assert.equal(harness.published.length, 1)
    const sent = harness.published[0]
    assert.equal(sent.deviceJid, '5511920387975@s.whatsapp.net')
    assert.equal(
        sent.protocolMessage.type,
        proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_MESSAGE
    )
    const reqMsg = sent.protocolMessage.peerDataOperationRequestMessage
    assert.equal(
        reqMsg?.peerDataOperationRequestType,
        proto.Message.PeerDataOperationRequestType.PLACEHOLDER_MESSAGE_RESEND
    )
    assert.equal(reqMsg?.placeholderMessageResendRequest?.length, 1)

    harness.emitResponse(sent.id, [
        {
            placeholderMessageResendResponse: { webMessageInfoBytes: new Uint8Array([1, 2, 3]) }
        }
    ])

    const results = await promise
    assert.equal(results.length, 1)
    assert.deepEqual(
        results[0].placeholderMessageResendResponse?.webMessageInfoBytes,
        new Uint8Array([1, 2, 3])
    )
})

test('request rejects with timeout error after configured timeout', async () => {
    const harness = createHarness({ defaultTimeoutMs: 20 })

    await assert.rejects(
        harness.requester.request(
            proto.Message.PeerDataOperationRequestType.HISTORY_SYNC_ON_DEMAND,
            { historySyncOnDemandRequest: { chatJid: 'a@s.whatsapp.net' } }
        ),
        /timed out/
    )
})

test('request honours per-call timeout override', async () => {
    const harness = createHarness({ defaultTimeoutMs: 5_000 })

    const start = Date.now()
    await assert.rejects(
        harness.requester.request(
            proto.Message.PeerDataOperationRequestType.UPLOAD_STICKER,
            { requestStickerReupload: [{ fileSha256: 'abc' }] },
            { timeoutMs: 25 }
        ),
        /timed out/
    )
    assert.ok(Date.now() - start < 1_000, 'should not wait for default timeout')
})

test('irrelevant or unmatched protocol messages do not resolve pending requests', async () => {
    const harness = createHarness({ defaultTimeoutMs: 40 })

    const promise = harness.requester.request(
        proto.Message.PeerDataOperationRequestType.GENERATE_LINK_PREVIEW,
        { requestUrlPreview: [{ url: 'https://example.com' }] }
    )
    harness.emitProtocol({
        rawNode: { tag: 'message', attrs: {} },
        isGroupChat: false,
        isBroadcastChat: false,
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.APP_STATE_SYNC_KEY_REQUEST
        }
    })
    harness.emitResponse(undefined, [])
    harness.emitResponse('unrelated-id', [])

    await assert.rejects(promise, /timed out/)
})

test('multiple concurrent requests correlate independently by stanzaId', async () => {
    const harness = createHarness()

    const promiseA = harness.requester.request(
        proto.Message.PeerDataOperationRequestType.UPLOAD_STICKER,
        { requestStickerReupload: [{ fileSha256: 'a' }] }
    )
    const promiseB = harness.requester.request(
        proto.Message.PeerDataOperationRequestType.UPLOAD_STICKER,
        { requestStickerReupload: [{ fileSha256: 'b' }] }
    )
    await flushMicrotasks()

    assert.notEqual(harness.published[0].id, harness.published[1].id)

    harness.emitResponse(harness.published[1].id, [
        { stickerMessage: { fileSha256: new Uint8Array([0xbb]) } }
    ])
    harness.emitResponse(harness.published[0].id, [
        { stickerMessage: { fileSha256: new Uint8Array([0xaa]) } }
    ])

    const [resA, resB] = await Promise.all([promiseA, promiseB])
    assert.deepEqual(resA[0].stickerMessage?.fileSha256, new Uint8Array([0xaa]))
    assert.deepEqual(resB[0].stickerMessage?.fileSha256, new Uint8Array([0xbb]))
})

test('send returns published message id without registering pending entry', async () => {
    const harness = createHarness()

    const result = await harness.requester.send(
        proto.Message.PeerDataOperationRequestType.PLACEHOLDER_MESSAGE_RESEND,
        {
            placeholderMessageResendRequest: [
                { messageKey: { remoteJid: '1@s.whatsapp.net', fromMe: false, id: 'x' } }
            ]
        }
    )
    assert.equal(result.messageId, harness.published[0].id)
})

test('bounded pending map evicts oldest entry when full', async () => {
    const harness = createHarness({ defaultTimeoutMs: 5_000, maxPending: 2 })

    const promiseA = harness.requester.request(
        proto.Message.PeerDataOperationRequestType.UPLOAD_STICKER,
        { requestStickerReupload: [{ fileSha256: 'a' }] }
    )
    const promiseB = harness.requester.request(
        proto.Message.PeerDataOperationRequestType.UPLOAD_STICKER,
        { requestStickerReupload: [{ fileSha256: 'b' }] }
    )
    const promiseC = harness.requester.request(
        proto.Message.PeerDataOperationRequestType.UPLOAD_STICKER,
        { requestStickerReupload: [{ fileSha256: 'c' }] }
    )

    await assert.rejects(promiseA, /evicted/i)

    harness.emitResponse(harness.published[1].id, [])
    harness.emitResponse(harness.published[2].id, [])

    const [resB, resC] = await Promise.all([promiseB, promiseC])
    assert.equal(resB.length, 0)
    assert.equal(resC.length, 0)
})
