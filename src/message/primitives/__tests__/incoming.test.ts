import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaIncomingMessageEvent, WaIncomingUnavailableMessageEvent } from '@client/types'
import { createNoopLogger } from '@infra/log/types'
import { buildRecoveredIncomingEvent, handleIncomingMessageAck } from '@message/primitives/incoming'
import { proto } from '@proto'
import { SignalAddressResolver } from '@signal/session/SignalAddressResolver'
import { WaLidPnMappingMemoryStore } from '@store/memory/lid-pn-mapping.store'
import type { BinaryNode } from '@transport/types'

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

// Encodes a message and appends a single PKCS7 pad byte so the handler's
// unpadPkcs7 + proto.Message.decode round-trip yields back the same message.
function paddedPlaintext(message: proto.IMessage): Uint8Array {
    const encoded = proto.Message.encode(message).finish()
    const out = new Uint8Array(encoded.length + 1)
    out.set(encoded, 0)
    out[encoded.length] = 1
    return out
}

function createDecryptingOptions(
    emitted: WaIncomingMessageEvent[],
    overrides: {
        readonly message?: proto.IMessage
        readonly getMeJid?: () => string | null | undefined
        readonly getMeLid?: () => string | null | undefined
    } = {}
) {
    return {
        logger: createNoopLogger(),
        sendNode: async () => undefined,
        getMeJid: overrides.getMeJid,
        getMeLid: overrides.getMeLid,
        signalProtocol: {
            decryptMessage: async () => paddedPlaintext(overrides.message ?? { conversation: 'hi' })
        } as never,
        emitIncomingMessage: (event: WaIncomingMessageEvent) => {
            emitted.push(event)
        }
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
        logger: createNoopLogger(),
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

test('1:1 incoming message strips the device from remoteJid and keeps it in senderDevice', async () => {
    const emitted: WaIncomingMessageEvent[] = []
    const handled = await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: {
                id: 'msg-dev',
                from: '5511999999999:12@s.whatsapp.net',
                t: '123'
            },
            content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([1]) }]
        },
        createDecryptingOptions(emitted)
    )

    assert.equal(handled, true)
    assert.equal(emitted.length, 1)
    const { key } = emitted[0]
    assert.equal(key.remoteJid, '5511999999999@s.whatsapp.net')
    assert.equal(key.senderDevice, 12)
    assert.equal(key.isGroup, false)
    assert.equal(key.participant, undefined)
})

test('direct sender_lid mapping is learned before Signal decrypt', async () => {
    const calls: string[] = []
    const encrypted = createEncryptedMessageNode()
    const node: BinaryNode = {
        ...encrypted,
        attrs: { ...encrypted.attrs, sender_lid: '778899@lid' }
    }

    await handleIncomingMessageAck(node, {
        logger: createNoopLogger(),
        sendNode: async () => undefined,
        signalAddressResolver: {
            learnMessageJidPair: async (firstJid: string, secondJid: string) => {
                calls.push(`learn:${firstJid}:${secondJid}`)
                return true
            }
        } as never,
        signalProtocol: {
            decryptMessage: async () => {
                calls.push('decrypt')
                return paddedPlaintext({ conversation: 'hi' })
            }
        } as never
    })

    assert.deepEqual(calls, ['learn:551100000000@s.whatsapp.net:778899@lid', 'decrypt'])
})

test('mapping-store failures do not interrupt incoming Signal decrypt', async () => {
    const calls: string[] = []
    const warnings: Array<{
        readonly message: string
        readonly id?: unknown
        readonly from?: unknown
        readonly error?: unknown
    }> = []
    const logger = createNoopLogger()
    logger.warn = (message, context) => {
        warnings.push({ message, id: context?.id, from: context?.from, error: context?.message })
    }
    const encrypted = createEncryptedMessageNode()

    const handled = await handleIncomingMessageAck(
        {
            ...encrypted,
            attrs: { ...encrypted.attrs, sender_lid: '778899@lid' }
        },
        {
            logger,
            sendNode: async () => undefined,
            signalAddressResolver: {
                learnMessageJidPair: async () => {
                    calls.push('learn')
                    throw new Error('mapping store unavailable')
                }
            } as never,
            signalProtocol: {
                decryptMessage: async () => {
                    calls.push('decrypt')
                    return paddedPlaintext({ conversation: 'hi' })
                }
            } as never
        }
    )

    assert.equal(handled, true)
    assert.deepEqual(calls, ['learn', 'decrypt'])
    assert.deepEqual(warnings, [
        {
            message: 'failed to learn incoming PN/LID mapping',
            id: encrypted.attrs.id,
            from: encrypted.attrs.from,
            error: 'mapping store unavailable'
        }
    ])
})

test('recipient_latest_lid becomes the canonical Signal address after peer metadata', async () => {
    const addressResolver = new SignalAddressResolver(new WaLidPnMappingMemoryStore())
    const encrypted = createEncryptedMessageNode()

    await handleIncomingMessageAck(
        {
            ...encrypted,
            attrs: {
                ...encrypted.attrs,
                recipient: '5511222222222@s.whatsapp.net',
                peer_recipient_lid: '101@lid',
                recipient_latest_lid: '202@lid'
            }
        },
        {
            logger: createNoopLogger(),
            sendNode: async () => undefined,
            getMeJid: () => encrypted.attrs.from,
            signalAddressResolver: addressResolver,
            signalProtocol: {
                decryptMessage: async () => paddedPlaintext({ conversation: 'hi' })
            } as never
        }
    )

    assert.deepEqual(
        await addressResolver.resolve({
            user: '5511222222222',
            server: 's.whatsapp.net',
            device: 7
        }),
        { user: '202', server: 'lid', device: 7 }
    )
})

test('direct recipient metadata takes conservative precedence over peer metadata', async () => {
    const cases = [
        {
            from: '5511999999999@s.whatsapp.net',
            recipient: '5511222222222@s.whatsapp.net',
            recipientAttr: { recipient_lid: '101@lid', peer_recipient_lid: '202@lid' },
            getMeJid: () => '5511999999999@s.whatsapp.net',
            getMeLid: undefined,
            expected: '5511222222222@s.whatsapp.net:101@lid'
        },
        {
            from: '999@lid',
            recipient: '101@lid',
            recipientAttr: {
                recipient_pn: '5511222222222@s.whatsapp.net',
                peer_recipient_pn: '5511333333333@s.whatsapp.net'
            },
            getMeJid: undefined,
            getMeLid: () => '999@lid',
            expected: '101@lid:5511222222222@s.whatsapp.net'
        }
    ] as const

    for (const current of cases) {
        const calls: string[] = []
        await handleIncomingMessageAck(
            {
                tag: 'message',
                attrs: {
                    id: `msg-recipient-${calls.length}`,
                    from: current.from,
                    recipient: current.recipient,
                    recipient_latest_lid: '303@lid',
                    ...current.recipientAttr
                },
                content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([1]) }]
            },
            {
                logger: createNoopLogger(),
                sendNode: async () => undefined,
                getMeJid: current.getMeJid,
                getMeLid: current.getMeLid,
                signalAddressResolver: {
                    learnMessageJidPair: async (firstJid: string, secondJid: string) => {
                        calls.push(`${firstJid}:${secondJid}`)
                        return true
                    },
                    learnPeerRecipientJidPair: async () => {
                        calls.push('unexpected-peer-mapping')
                        return true
                    }
                } as never,
                signalProtocol: {
                    decryptMessage: async () => paddedPlaintext({ conversation: 'hi' })
                } as never
            }
        )
        assert.deepEqual(calls, [current.expected])
    }
})

test('group participant mapping is learned for another device of this account', async () => {
    const calls: string[] = []
    await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: {
                id: 'msg-own-group-participant',
                from: '12345@g.us',
                participant: '999:2@lid',
                participant_pn: '5511999999999@s.whatsapp.net'
            },
            content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([1]) }]
        },
        {
            logger: createNoopLogger(),
            sendNode: async () => undefined,
            getMeLid: () => '999@lid',
            signalAddressResolver: {
                learnMessageJidPair: async (firstJid: string, secondJid: string) => {
                    calls.push(`learn:${firstJid}:${secondJid}`)
                    return true
                }
            } as never,
            signalProtocol: {
                decryptMessage: async () => {
                    calls.push('decrypt')
                    return paddedPlaintext({ conversation: 'hi' })
                }
            } as never
        }
    )

    assert.deepEqual(calls, ['learn:999:2@lid:5511999999999@s.whatsapp.net', 'decrypt'])
})

test('peer-recipient metadata is ignored when the message author is not this account', async () => {
    const addressResolver = new SignalAddressResolver(new WaLidPnMappingMemoryStore())
    const encrypted = createEncryptedMessageNode()

    await handleIncomingMessageAck(
        {
            ...encrypted,
            attrs: {
                ...encrypted.attrs,
                recipient: '5511222222222@s.whatsapp.net',
                peer_recipient_lid: '101@lid'
            }
        },
        {
            logger: createNoopLogger(),
            sendNode: async () => undefined,
            getMeJid: () => '5511999999999@s.whatsapp.net',
            signalAddressResolver: addressResolver,
            signalProtocol: {
                decryptMessage: async () => paddedPlaintext({ conversation: 'hi' })
            } as never
        }
    )

    const recipient = { user: '5511222222222', server: 's.whatsapp.net', device: 7 } as const
    assert.strictEqual(await addressResolver.resolve(recipient), recipient)
})

test('self sender_lid metadata takes precedence over peer-recipient metadata', async () => {
    const addressResolver = new SignalAddressResolver(new WaLidPnMappingMemoryStore())
    const encrypted = createEncryptedMessageNode()

    await handleIncomingMessageAck(
        {
            ...encrypted,
            attrs: {
                ...encrypted.attrs,
                sender_lid: '909@lid',
                recipient: '5511222222222@s.whatsapp.net',
                peer_recipient_lid: '101@lid'
            }
        },
        {
            logger: createNoopLogger(),
            sendNode: async () => undefined,
            getMeJid: () => encrypted.attrs.from,
            signalAddressResolver: addressResolver,
            signalProtocol: {
                decryptMessage: async () => paddedPlaintext({ conversation: 'hi' })
            } as never
        }
    )

    assert.equal(
        (
            await addressResolver.resolve({
                user: '551100000000',
                server: 's.whatsapp.net',
                device: 0
            })
        ).user,
        '909'
    )
    const recipient = { user: '5511222222222', server: 's.whatsapp.net', device: 0 } as const
    assert.strictEqual(await addressResolver.resolve(recipient), recipient)
})

test('1:1 message authored by my own other device is fromMe with the recipient as remoteJid', async () => {
    const emitted: WaIncomingMessageEvent[] = []
    const handled = await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: {
                id: 'msg-self',
                from: '5511999999999:12@s.whatsapp.net',
                recipient: '5511888888888@s.whatsapp.net',
                t: '123'
            },
            content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([1]) }]
        },
        createDecryptingOptions(emitted, {
            getMeJid: () => '5511999999999:2@s.whatsapp.net'
        })
    )

    assert.equal(handled, true)
    assert.equal(emitted.length, 1)
    const { key } = emitted[0]
    assert.equal(key.fromMe, true)
    assert.equal(key.remoteJid, '5511888888888@s.whatsapp.net')
    assert.equal(key.senderDevice, 12)
    assert.equal(key.isGroup, false)
    assert.equal(key.participant, undefined)
})

test('1:1 self-sent message resolves the chat from the deviceSentMessage destination', async () => {
    const emitted: WaIncomingMessageEvent[] = []
    const handled = await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: {
                id: 'msg-dsm',
                from: '5511999999999:12@s.whatsapp.net',
                t: '123'
            },
            content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([1]) }]
        },
        createDecryptingOptions(emitted, {
            getMeJid: () => '5511999999999@s.whatsapp.net',
            message: {
                deviceSentMessage: {
                    destinationJid: '5511888888888@s.whatsapp.net',
                    message: { conversation: 'hi from my phone' }
                }
            }
        })
    )

    assert.equal(handled, true)
    assert.equal(emitted.length, 1)
    const { key } = emitted[0]
    assert.equal(key.fromMe, true)
    assert.equal(key.remoteJid, '5511888888888@s.whatsapp.net')
})

test('1:1 message from my lid identity is detected as fromMe', async () => {
    const emitted: WaIncomingMessageEvent[] = []
    await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: {
                id: 'msg-self-lid',
                from: '133300000000000:5@lid',
                recipient: '144400000000000@lid',
                t: '123'
            },
            content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([1]) }]
        },
        createDecryptingOptions(emitted, {
            getMeJid: () => '5511999999999@s.whatsapp.net',
            getMeLid: () => '133300000000000@lid'
        })
    )

    assert.equal(emitted.length, 1)
    const { key } = emitted[0]
    assert.equal(key.fromMe, true)
    assert.equal(key.remoteJid, '144400000000000@lid')
})

test('1:1 incoming message from a peer stays fromMe false with the peer as remoteJid', async () => {
    const emitted: WaIncomingMessageEvent[] = []
    await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: {
                id: 'msg-peer',
                from: '5511888888888:3@s.whatsapp.net',
                t: '123'
            },
            content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([1]) }]
        },
        createDecryptingOptions(emitted, {
            getMeJid: () => '5511999999999@s.whatsapp.net'
        })
    )

    assert.equal(emitted.length, 1)
    const { key } = emitted[0]
    assert.equal(key.fromMe, false)
    assert.equal(key.remoteJid, '5511888888888@s.whatsapp.net')
})

test('group incoming message keeps the group remoteJid and carries the device on the participant', async () => {
    const emitted: WaIncomingMessageEvent[] = []
    const handled = await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: {
                id: 'msg-grp',
                from: '120363000000000000@g.us',
                participant: '5511999999999:7@s.whatsapp.net',
                t: '123'
            },
            content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([1]) }]
        },
        createDecryptingOptions(emitted)
    )

    assert.equal(handled, true)
    assert.equal(emitted.length, 1)
    const { key } = emitted[0]
    assert.equal(key.remoteJid, '120363000000000000@g.us')
    assert.equal(key.isGroup, true)
    assert.equal(key.participant, '5511999999999@s.whatsapp.net')
    assert.equal(key.senderDevice, 7)
})

test('recovered self group message resolves participant from originalSelfAuthorUserJidString', () => {
    const event = buildRecoveredIncomingEvent(
        {
            key: { remoteJid: '120363000000000000@g.us', fromMe: true, id: 'ID-0' },
            message: { conversation: 'hello' },
            messageTimestamp: 1700000000,
            originalSelfAuthorUserJidString: '133300000000000@lid'
        },
        '5511999999999:2@s.whatsapp.net'
    )

    assert.equal(event.key.fromMe, true)
    assert.equal(event.key.isGroup, true)
    assert.equal(event.key.participant, '133300000000000@lid')
    assert.equal(event.rawNode.attrs.participant, '133300000000000@lid')
})

test('recovered self group message falls back to the me user when no self author is present', () => {
    const event = buildRecoveredIncomingEvent(
        {
            key: { remoteJid: '120363000000000000@g.us', fromMe: true, id: 'ID-1' },
            message: { conversation: 'hello' }
        },
        '5511999999999:2@s.whatsapp.net'
    )

    assert.equal(event.key.participant, '5511999999999@s.whatsapp.net')
})

test('recovered self group message keeps an explicit participant over the self author', () => {
    const event = buildRecoveredIncomingEvent(
        {
            key: {
                remoteJid: '120363000000000000@g.us',
                fromMe: true,
                id: 'ID-2',
                participant: '5511777777777@s.whatsapp.net'
            },
            originalSelfAuthorUserJidString: '133300000000000@lid'
        },
        '5511999999999:2@s.whatsapp.net'
    )

    assert.equal(event.key.participant, '5511777777777@s.whatsapp.net')
})

test('recovered self 1:1 message keeps participant unset', () => {
    const event = buildRecoveredIncomingEvent(
        {
            key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: true, id: 'ID-3' },
            message: { conversation: 'hello' },
            originalSelfAuthorUserJidString: '133300000000000@lid'
        },
        '5511999999999:2@s.whatsapp.net'
    )

    assert.equal(event.key.participant, undefined)
})

test('view-once-unavailable message acks instead of delivery-receipting and emits a typed event', async () => {
    const sentNodes: BinaryNode[] = []
    const unavailable: WaIncomingUnavailableMessageEvent[] = []

    const handled = await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: {
                id: 'msg-vou',
                from: '53979165777985@lid',
                type: 'media',
                notify: 'vini',
                sender_pn: '5511982905991@s.whatsapp.net',
                t: '1781885732'
            },
            content: [
                {
                    tag: 'reporting',
                    attrs: {},
                    content: [{ tag: 'reporting_tag', attrs: {}, content: new Uint8Array([1]) }]
                },
                { tag: 'unavailable', attrs: { type: 'view_once' } }
            ]
        },
        {
            logger: createNoopLogger(),
            sendNode: async (node) => {
                sentNodes.push(node)
            },
            getMeJid: () => '5511999999999@s.whatsapp.net',
            emitUnavailableMessage: (event) => {
                unavailable.push(event)
            }
        }
    )

    assert.equal(handled, true)
    assert.equal(unavailable.length, 1)
    const event = unavailable[0]
    assert.equal(event.kind, 'view_once')
    assert.equal(event.key.remoteJid, '53979165777985@lid')
    assert.equal(event.key.id, 'msg-vou')
    assert.equal(event.key.fromMe, false)
    assert.equal(event.pushName, 'vini')
    assert.equal(event.timestampSeconds, 1781885732)
    assert.equal(sentNodes.length, 1)
    assert.equal(sentNodes[0].tag, 'ack')
    assert.equal(sentNodes[0].attrs.class, 'message')
    assert.equal(sentNodes[0].attrs.id, 'msg-vou')
    assert.equal(sentNodes[0].attrs.to, '53979165777985@lid')
    assert.equal(sentNodes[0].attrs.type, 'media')
})

test('incoming message ack falls back to retry receipt when decrypt fails', async () => {
    const sentNodes: BinaryNode[] = []

    const handled = await handleIncomingMessageAck(createEncryptedMessageNode(), {
        logger: createNoopLogger(),
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
