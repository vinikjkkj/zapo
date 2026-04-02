import assert from 'node:assert/strict'
import test from 'node:test'

import type { Logger } from '@infra/log/types'
import type { WaMessageClient } from '@message/WaMessageClient'
import { decodeRetryReplayPayload, encodeRetryReplayPayload } from '@retry/codec'
import { RETRY_REASON } from '@retry/constants'
import { parseRetryReceiptRequest, pickRetryStateMax } from '@retry/parse'
import { mapRetryReasonFromError } from '@retry/reason'
import { WaRetryReplayService } from '@retry/replay'
import type { WaRetryOutboundMessageRecord, WaRetryReplayPayload } from '@retry/types'
import type { SignalProtocol } from '@signal/session/SignalProtocol'
import { encodeBinaryNode } from '@transport/binary'
import { buildRetryReceiptNode } from '@transport/node/builders/retry'
import type { BinaryNode } from '@transport/types'
import { TEXT_ENCODER } from '@util/bytes'

function buildOutboundRecord(
    messageId: string,
    replayPayload: WaRetryReplayPayload
): WaRetryOutboundMessageRecord {
    const now = Date.now()
    return {
        messageId,
        toJid: 'target@s.whatsapp.net',
        messageType: 'text',
        replayMode: replayPayload.mode,
        replayPayload: encodeRetryReplayPayload(replayPayload),
        state: 'pending',
        createdAtMs: now,
        updatedAtMs: now,
        expiresAtMs: now + 60_000
    }
}

function createLogger(warnings: string[] = []): Logger {
    return {
        level: 'trace',
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: (message) => {
            warnings.push(message)
        },
        error: () => undefined
    }
}

test('retry replay payload codec round-trips supported modes', () => {
    const plaintextPayload = {
        mode: 'plaintext' as const,
        to: '5511@s.whatsapp.net',
        type: 'text',
        plaintext: new Uint8Array([1, 2, 3])
    }
    assert.deepEqual(
        decodeRetryReplayPayload(encodeRetryReplayPayload(plaintextPayload)),
        plaintextPayload
    )

    const encryptedPayload = {
        mode: 'encrypted' as const,
        to: '5511@s.whatsapp.net',
        type: 'text',
        encType: 'pkmsg' as const,
        ciphertext: new Uint8Array([4, 5]),
        participant: '5511:2@s.whatsapp.net'
    }
    assert.deepEqual(
        decodeRetryReplayPayload(encodeRetryReplayPayload(encryptedPayload)),
        encryptedPayload
    )

    const opaquePayload = {
        mode: 'opaque_node' as const,
        node: new Uint8Array([9, 9])
    }
    assert.deepEqual(
        decodeRetryReplayPayload(encodeRetryReplayPayload(opaquePayload)),
        opaquePayload
    )
})

test('retry replay payload rejects legacy json format', () => {
    const legacyEncoded = TEXT_ENCODER.encode(
        JSON.stringify({
            mode: 'plaintext',
            to: '5511@s.whatsapp.net',
            type: 'text',
            plaintext: 'AQID'
        })
    )
    assert.throws(() => decodeRetryReplayPayload(legacyEncoded), /unsupported codec version/)
})

test('retry state ranking and reason mapping favor higher-priority states', () => {
    assert.equal(pickRetryStateMax('pending', 'read'), 'read')
    assert.equal(pickRetryStateMax('played', 'delivered'), 'played')

    assert.equal(
        mapRetryReasonFromError(new Error('No session found')),
        RETRY_REASON.SignalErrorNoSession
    )
    assert.equal(
        mapRetryReasonFromError(new Error('invalid signature data')),
        RETRY_REASON.SignalErrorInvalidSignature
    )
    assert.equal(mapRetryReasonFromError(new Error('totally unknown error')), undefined)
})

test('retry receipt parser validates and decodes built retry nodes', () => {
    const node = buildRetryReceiptNode({
        stanzaId: 'stanza-1',
        to: 'me@s.whatsapp.net',
        participant: 'peer:2@s.whatsapp.net',
        originalMsgId: 'm1',
        retryCount: 2,
        t: '100',
        registrationId: 321,
        error: RETRY_REASON.SignalErrorBadMac,
        keys: {
            identity: new Uint8Array(32).fill(1),
            key: {
                id: 9,
                publicKey: new Uint8Array(32).fill(2)
            },
            skey: {
                id: 10,
                publicKey: new Uint8Array(32).fill(3),
                signature: new Uint8Array(64).fill(4)
            },
            deviceIdentity: new Uint8Array([7])
        }
    })
    const nodeWithInboundAttrs: BinaryNode = {
        ...node,
        attrs: {
            ...node.attrs,
            from: 'peer@s.whatsapp.net',
            offline: '1',
            is_lid: 'true'
        }
    }

    const parsed = parseRetryReceiptRequest(nodeWithInboundAttrs, {
        expectedToJids: ['me@s.whatsapp.net']
    })
    assert.ok(parsed)
    assert.equal(parsed?.stanzaId, 'stanza-1')
    assert.equal(parsed?.retryCount, 2)
    assert.equal(parsed?.regId, 321)
    assert.equal(parsed?.keyBundle?.skey.id, 10)
    assert.equal(parsed?.offline, true)
    assert.equal(parsed?.isLid, true)

    assert.throws(
        () =>
            parseRetryReceiptRequest(
                {
                    ...nodeWithInboundAttrs,
                    attrs: {
                        ...nodeWithInboundAttrs.attrs,
                        to: 'other@s.whatsapp.net'
                    }
                },
                {
                    expectedToJids: ['me@s.whatsapp.net']
                }
            ),
        /does not match local device/
    )

    assert.throws(
        () =>
            parseRetryReceiptRequest({
                tag: 'receipt',
                attrs: { type: 'retry', from: 'a@s.whatsapp.net' }
            }),
        /missing id\/from attrs/
    )
})

test('retry replay service resends plaintext when requester matches destination user', async () => {
    const sendEncryptedCalls: Array<Record<string, unknown>> = []
    const sendNodeCalls: BinaryNode[] = []
    const service = new WaRetryReplayService({
        logger: createLogger(),
        messageClient: {
            sendEncrypted: async (input: unknown) => {
                sendEncryptedCalls.push(input as Record<string, unknown>)
            },
            sendMessageNode: async (node: BinaryNode) => {
                sendNodeCalls.push(node)
            }
        } as unknown as WaMessageClient,
        signalProtocol: {
            encryptMessage: async () => ({
                type: 'msg' as const,
                ciphertext: new Uint8Array([9, 9])
            })
        } as unknown as SignalProtocol,
        getCurrentMeJid: () => null,
        getCurrentMeLid: () => null,
        getCurrentSignedIdentity: () => null
    })

    const outbound = buildOutboundRecord('m-plain-1', {
        mode: 'plaintext',
        to: '5511999999999@s.whatsapp.net',
        type: 'text',
        plaintext: new Uint8Array([1, 2, 3])
    })
    const result = await service.resendOutboundMessage(
        outbound,
        '5511999999999:2@s.whatsapp.net',
        2
    )

    assert.equal(result, 'resent')
    assert.equal(sendEncryptedCalls.length, 1)
    assert.equal(sendNodeCalls.length, 0)
    assert.equal(sendEncryptedCalls[0].encCount, 2)
})

test('retry replay service accepts raw replay payloads from memory store', async () => {
    const sendEncryptedCalls: Array<Record<string, unknown>> = []
    const service = new WaRetryReplayService({
        logger: createLogger(),
        messageClient: {
            sendEncrypted: async (input: unknown) => {
                sendEncryptedCalls.push(input as Record<string, unknown>)
            },
            sendMessageNode: async () => undefined
        } as unknown as WaMessageClient,
        signalProtocol: {
            encryptMessage: async () => ({
                type: 'msg' as const,
                ciphertext: new Uint8Array([4, 4])
            })
        } as unknown as SignalProtocol,
        getCurrentMeJid: () => null,
        getCurrentMeLid: () => null,
        getCurrentSignedIdentity: () => null
    })

    const now = Date.now()
    const outbound: WaRetryOutboundMessageRecord = {
        messageId: 'm-plain-raw',
        toJid: '5511999999999@s.whatsapp.net',
        messageType: 'text',
        replayMode: 'plaintext',
        replayPayload: {
            mode: 'plaintext',
            to: '5511999999999@s.whatsapp.net',
            type: 'text',
            plaintext: new Uint8Array([1, 2, 3])
        },
        state: 'pending',
        createdAtMs: now,
        updatedAtMs: now,
        expiresAtMs: now + 60_000
    }
    const result = await service.resendOutboundMessage(
        outbound,
        '5511999999999:2@s.whatsapp.net',
        1
    )

    assert.equal(result, 'resent')
    assert.equal(sendEncryptedCalls.length, 1)
    assert.equal(sendEncryptedCalls[0].encCount, 1)
})

test('retry replay service returns ineligible on plaintext destination mismatch', async () => {
    const service = new WaRetryReplayService({
        logger: createLogger(),
        messageClient: {
            sendEncrypted: async () => undefined,
            sendMessageNode: async () => undefined
        } as unknown as WaMessageClient,
        signalProtocol: {
            encryptMessage: async () => ({
                type: 'msg' as const,
                ciphertext: new Uint8Array([1])
            })
        } as unknown as SignalProtocol,
        getCurrentMeJid: () => null,
        getCurrentMeLid: () => null,
        getCurrentSignedIdentity: () => null
    })

    const outbound = buildOutboundRecord('m-plain-2', {
        mode: 'plaintext',
        to: '5511888888888@s.whatsapp.net',
        type: 'text',
        plaintext: new Uint8Array([1])
    })
    const result = await service.resendOutboundMessage(
        outbound,
        '5511999999999:2@s.whatsapp.net',
        1
    )
    assert.equal(result, 'ineligible')
})

test('retry replay service handles group plaintext retries and pkmsg identity guard', async () => {
    const sendNodeCalls: BinaryNode[] = []
    const warnings: string[] = []
    let encType: 'msg' | 'pkmsg' = 'pkmsg'
    const service = new WaRetryReplayService({
        logger: createLogger(warnings),
        messageClient: {
            sendEncrypted: async () => undefined,
            sendMessageNode: async (node: BinaryNode) => {
                sendNodeCalls.push(node)
            }
        } as unknown as WaMessageClient,
        signalProtocol: {
            encryptMessage: async () => ({
                type: encType,
                ciphertext: new Uint8Array([5, 6, 7])
            })
        } as unknown as SignalProtocol,
        getCurrentMeJid: () => null,
        getCurrentMeLid: () => null,
        getCurrentSignedIdentity: () => null
    })

    const outbound = buildOutboundRecord('m-group-1', {
        mode: 'plaintext',
        to: '123456@g.us',
        type: 'text',
        plaintext: new Uint8Array([1, 2, 3, 4])
    })
    const pkmsgResult = await service.resendOutboundMessage(
        outbound,
        '5511999999999:2@s.whatsapp.net',
        1
    )
    assert.equal(pkmsgResult, 'ineligible')
    assert.ok(warnings.some((message) => message.includes('missing signed identity')))
    assert.equal(sendNodeCalls.length, 0)

    encType = 'msg'
    const msgResult = await service.resendOutboundMessage(
        outbound,
        '5511999999999:2@s.whatsapp.net',
        1
    )
    assert.equal(msgResult, 'resent')
    assert.equal(sendNodeCalls.length, 1)
    assert.equal(sendNodeCalls[0].attrs.id, 'm-group-1')
    assert.equal(sendNodeCalls[0].attrs.participant, '5511999999999:2@s.whatsapp.net')
    assert.equal('device_fanout' in sendNodeCalls[0].attrs, false)
    assert.ok(Array.isArray(sendNodeCalls[0].content))
    assert.equal(sendNodeCalls[0].content[0].tag, 'enc')
    assert.equal(sendNodeCalls[0].content[0].attrs.type, 'msg')
    assert.equal(sendNodeCalls[0].content[0].attrs.count, '1')
})

test('retry replay service handles encrypted mode eligibility', async () => {
    const sendEncryptedCalls: Array<Record<string, unknown>> = []
    const service = new WaRetryReplayService({
        logger: createLogger(),
        messageClient: {
            sendEncrypted: async (input: unknown) => {
                sendEncryptedCalls.push(input as Record<string, unknown>)
            },
            sendMessageNode: async () => undefined
        } as unknown as WaMessageClient,
        signalProtocol: {
            encryptMessage: async () => ({
                type: 'msg' as const,
                ciphertext: new Uint8Array([1])
            })
        } as unknown as SignalProtocol,
        getCurrentMeJid: () => null,
        getCurrentMeLid: () => null,
        getCurrentSignedIdentity: () => null
    })

    const skmsgOutbound = buildOutboundRecord('m-encrypted-skmsg', {
        mode: 'encrypted',
        to: '5511999999999:2@s.whatsapp.net',
        type: 'text',
        encType: 'skmsg',
        ciphertext: new Uint8Array([1, 2])
    })
    assert.equal(
        await service.resendOutboundMessage(skmsgOutbound, '5511999999999:2@s.whatsapp.net', 1),
        'ineligible'
    )

    const mismatchOutbound = buildOutboundRecord('m-encrypted-mismatch', {
        mode: 'encrypted',
        to: '5511999999999:2@s.whatsapp.net',
        type: 'text',
        encType: 'msg',
        ciphertext: new Uint8Array([3, 4])
    })
    assert.equal(
        await service.resendOutboundMessage(mismatchOutbound, '5511999999999:3@s.whatsapp.net', 1),
        'ineligible'
    )

    const okOutbound = buildOutboundRecord('m-encrypted-ok', {
        mode: 'encrypted',
        to: '5511999999999:2@s.whatsapp.net',
        type: 'text',
        encType: 'pkmsg',
        ciphertext: new Uint8Array([5, 6]),
        participant: '5511888888888:1@s.whatsapp.net'
    })
    assert.equal(
        await service.resendOutboundMessage(okOutbound, '5511999999999:2@s.whatsapp.net', 3),
        'resent'
    )
    assert.equal(sendEncryptedCalls.length, 1)
    assert.equal(sendEncryptedCalls[0].encCount, 3)
    assert.equal(sendEncryptedCalls[0].participant, '5511888888888:1@s.whatsapp.net')
})

test('retry replay service handles opaque replay compatibility checks', async () => {
    const sendNodeCalls: BinaryNode[] = []
    const service = new WaRetryReplayService({
        logger: createLogger(),
        messageClient: {
            sendEncrypted: async () => undefined,
            sendMessageNode: async (node: BinaryNode) => {
                sendNodeCalls.push(node)
            }
        } as unknown as WaMessageClient,
        signalProtocol: {
            encryptMessage: async () => ({
                type: 'msg' as const,
                ciphertext: new Uint8Array([1])
            })
        } as unknown as SignalProtocol,
        getCurrentMeJid: () => null,
        getCurrentMeLid: () => null,
        getCurrentSignedIdentity: () => null
    })

    const compatibleNode: BinaryNode = {
        tag: 'message',
        attrs: { id: 'old-id' },
        content: [
            {
                tag: 'participants',
                attrs: {},
                content: [
                    {
                        tag: 'to',
                        attrs: { jid: '5511999999999:2@s.whatsapp.net' }
                    }
                ]
            }
        ]
    }
    const compatible = buildOutboundRecord('m-opaque-ok', {
        mode: 'opaque_node',
        node: encodeBinaryNode(compatibleNode)
    })
    assert.equal(
        await service.resendOutboundMessage(compatible, '5511999999999:2@s.whatsapp.net', 1),
        'resent'
    )
    assert.equal(sendNodeCalls.length, 1)
    assert.equal(sendNodeCalls[0].attrs.id, 'm-opaque-ok')

    const incompatibleNode: BinaryNode = {
        tag: 'message',
        attrs: {},
        content: [
            {
                tag: 'participants',
                attrs: {},
                content: [
                    {
                        tag: 'to',
                        attrs: { jid: '5511999999999:2@s.whatsapp.net' }
                    },
                    {
                        tag: 'to',
                        attrs: { jid: '5511888888888:2@s.whatsapp.net' }
                    }
                ]
            }
        ]
    }
    const incompatible = buildOutboundRecord('m-opaque-bad', {
        mode: 'opaque_node',
        node: encodeBinaryNode(incompatibleNode)
    })
    assert.equal(
        await service.resendOutboundMessage(incompatible, '5511999999999:2@s.whatsapp.net', 1),
        'ineligible'
    )
    assert.equal(sendNodeCalls.length, 1)
})
