import assert from 'node:assert/strict'
import test from 'node:test'

import type { Logger } from '@infra/log/types'
import { handleIncomingMessageAck } from '@message/incoming'
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

function createEncryptedMessageNode(): BinaryNode {
    return {
        tag: 'message',
        attrs: {
            id: 'msg-1',
            from: '551100000000@s.whatsapp.net',
            t: '123'
        },
        content: [
            {
                tag: 'enc',
                attrs: {
                    type: 'msg'
                },
                content: new Uint8Array([1, 2, 3])
            }
        ]
    }
}

test('incoming message ack suppresses standard receipt when decrypt failure is delegated', async () => {
    const sentNodes: BinaryNode[] = []
    const decryptFailures: Array<{
        readonly context: {
            readonly messageNode: BinaryNode
            readonly stanzaId: string
            readonly from: string
            readonly participant?: string
            readonly recipient?: string
            readonly t?: string
        }
        readonly error: unknown
    }> = []

    const handled = await handleIncomingMessageAck(createEncryptedMessageNode(), {
        logger: createLogger(),
        sendNode: async (node) => {
            sentNodes.push(node)
        },
        signalProtocol: {
            decryptMessage: async () => {
                throw new Error('decrypt failed')
            }
        } as never,
        onDecryptFailure: async (context, error) => {
            decryptFailures.push({ context, error })
            return true
        }
    })

    assert.equal(handled, true)
    assert.equal(decryptFailures.length, 1)
    assert.deepEqual(decryptFailures[0].context.messageNode, createEncryptedMessageNode())
    assert.equal(decryptFailures[0].context.stanzaId, 'msg-1')
    assert.equal(decryptFailures[0].context.from, '551100000000@s.whatsapp.net')
    assert.equal(decryptFailures[0].context.t, '123')
    assert.match((decryptFailures[0].error as Error).message, /decrypt failed/)
    assert.equal(sentNodes.length, 0)
})

test('incoming message ack falls back to retry receipt when decrypt fails', async () => {
    const sentNodes: BinaryNode[] = []

    const handled = await handleIncomingMessageAck(createEncryptedMessageNode(), {
        logger: createLogger(),
        sendNode: async (node) => {
            sentNodes.push(node)
        },
        signalProtocol: {
            decryptMessage: async () => {
                throw new Error('decrypt failed')
            }
        } as never
    })

    assert.equal(handled, true)
    assert.equal(sentNodes.length, 1)
    assert.equal(sentNodes[0].tag, 'receipt')
    assert.equal(sentNodes[0].attrs.id, 'msg-1')
    assert.equal(sentNodes[0].attrs.to, '551100000000@s.whatsapp.net')
    assert.equal(sentNodes[0].attrs.type, 'retry')
})
