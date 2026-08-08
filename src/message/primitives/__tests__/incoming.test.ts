import assert from 'node:assert/strict'
import test from 'node:test'

import type {
    WaIncomingDecryptedPayloadEvent,
    WaIncomingMessageEvent,
    WaIncomingUnavailableMessageEvent
} from '@client/types'
import { createNoopLogger } from '@infra/log/types'
import { buildRecoveredIncomingEvent, handleIncomingMessageAck } from '@message/primitives/incoming'
import { proto } from '@proto'
import type { WaRetryDecryptFailureContext } from '@retry/types'
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
    assert.equal(event.resendRequested, false)
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

test('unavailable message asks for a placeholder resend and reports it on the event', async () => {
    const sentNodes: BinaryNode[] = []
    const unavailable: WaIncomingUnavailableMessageEvent[] = []
    const resendContexts: WaRetryDecryptFailureContext[] = []

    const handled = await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: {
                id: 'msg-fanout',
                from: '120363000000000000@g.us',
                participant: '5511777777777:3@s.whatsapp.net',
                type: 'text',
                t: '1781885732'
            },
            content: [{ tag: 'unavailable', attrs: {} }]
        },
        {
            logger: createNoopLogger(),
            sendNode: async (node) => {
                sentNodes.push(node)
            },
            getMeJid: () => '5511999999999@s.whatsapp.net',
            requestPlaceholderResend: (context) => {
                resendContexts.push(context)
                return true
            },
            emitUnavailableMessage: (event) => {
                unavailable.push(event)
            }
        }
    )

    assert.equal(handled, true)
    assert.equal(resendContexts.length, 1)
    assert.equal(resendContexts[0].stanzaId, 'msg-fanout')
    assert.equal(resendContexts[0].from, '120363000000000000@g.us')
    assert.equal(resendContexts[0].participant, '5511777777777:3@s.whatsapp.net')
    assert.equal(resendContexts[0].t, '1781885732')
    assert.equal(unavailable.length, 1)
    assert.equal(unavailable[0].kind, 'other')
    assert.equal(unavailable[0].resendRequested, true)
    assert.equal(sentNodes.length, 1)
    assert.equal(sentNodes[0].tag, 'ack')
})

test('bot fanout placeholder is classified as its own kind', async () => {
    const unavailable: WaIncomingUnavailableMessageEvent[] = []

    await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: { id: 'msg-bot', from: '5511777777777@s.whatsapp.net', type: 'text' },
            content: [
                { tag: 'unavailable', attrs: {} },
                { tag: 'bot', attrs: { biz_bot: '1' } }
            ]
        },
        {
            logger: createNoopLogger(),
            sendNode: async () => undefined,
            requestPlaceholderResend: () => false,
            emitUnavailableMessage: (event) => {
                unavailable.push(event)
            }
        }
    )

    assert.equal(unavailable.length, 1)
    assert.equal(unavailable[0].kind, 'bot')
    assert.equal(unavailable[0].resendRequested, false)
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

test('a decrypted payload is handed over before the library decodes it', async () => {
    const payloads: WaIncomingDecryptedPayloadEvent[] = []
    const emitted: WaIncomingMessageEvent[] = []
    const plaintext = paddedPlaintext({ conversation: 'hi' })

    const handled = await handleIncomingMessageAck(createEncryptedMessageNode(), {
        ...createDecryptingOptions(emitted),
        emitDecryptedPayload: (build) => {
            payloads.push(build())
        }
    })

    assert.equal(handled, true)
    assert.equal(payloads.length, 1)
    // The unpadded bytes, which is what `proto.Message.decode` receives — not
    // the padded ciphertext output and not a re-encoding of the decoded message.
    assert.deepEqual(payloads[0].plaintext, plaintext.subarray(0, plaintext.length - 1))
    assert.equal(payloads[0].encType, 'msg')
    assert.equal(payloads[0].encIndex, 0)
    assert.equal(payloads[0].stanzaId, 'msg-1')
    assert.equal(payloads[0].chatJid, '551100000000@s.whatsapp.net')
    assert.equal(emitted.length, 1, 'and the message still arrives as usual')
})

test('a payload that decrypts but does not decode is still handed over', async () => {
    // The reason the event exists. Decoding throws, the stanza is reported as
    // unhandled, and the decryption has already advanced the ratchet — so
    // without this the bytes are gone for good.
    const payloads: WaIncomingDecryptedPayloadEvent[] = []
    const emitted: WaIncomingMessageEvent[] = []
    // Field 1 of Message is `conversation`: tag 0x0A, then a length. Declaring
    // 127 bytes and supplying none makes `decode` throw — the bytes are perfectly
    // good, this build just cannot read them. The trailing byte is the PKCS7 pad.
    const undecodable = new Uint8Array([0x0a, 0x7f, 0x01])

    await handleIncomingMessageAck(createEncryptedMessageNode(), {
        ...createDecryptingOptions(emitted),
        signalProtocol: {
            decryptMessage: async () => undecodable
        } as never,
        emitDecryptedPayload: (build) => {
            payloads.push(build())
        }
    })

    assert.equal(payloads.length, 1, 'handed over despite the decode failing')
    assert.deepEqual(payloads[0].plaintext, undecodable.subarray(0, 2))
    assert.equal(emitted.length, 0, 'and nothing was emitted as a message')
})

test('each enc of a multi-device message reports its own index', async () => {
    // The ciphertexts are unrelated, so attributing a payload to the wrong
    // `<enc>` attributes it to the wrong sender.
    const payloads: WaIncomingDecryptedPayloadEvent[] = []
    const emitted: WaIncomingMessageEvent[] = []
    const node: BinaryNode = {
        tag: 'message',
        attrs: { id: 'msg-multi', from: '551100000000@s.whatsapp.net', t: '123' },
        content: [
            { tag: 'enc', attrs: { type: 'pkmsg' }, content: new Uint8Array([1]) },
            { tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([2]) }
        ]
    }

    await handleIncomingMessageAck(node, {
        ...createDecryptingOptions(emitted),
        emitDecryptedPayload: (build) => {
            payloads.push(build())
        }
    })

    assert.deepEqual(
        payloads.map((p) => [p.encIndex, p.encType]),
        [
            [0, 'pkmsg'],
            [1, 'msg']
        ]
    )
})

test('an observer that throws does not turn a good message into a decrypt failure', async () => {
    // The hook is observability. A listener that blows up must not send a
    // message that decrypted perfectly into retry handling.
    const emitted: WaIncomingMessageEvent[] = []
    const unhandled: unknown[] = []

    const handled = await handleIncomingMessageAck(createEncryptedMessageNode(), {
        ...createDecryptingOptions(emitted),
        emitDecryptedPayload: () => {
            throw new Error('observer blew up')
        },
        emitUnhandledStanza: (event) => {
            unhandled.push(event)
        }
    })

    assert.equal(handled, true)
    assert.equal(emitted.length, 1, 'the message still arrives')
    assert.equal(unhandled.length, 0, 'and nothing was reported as undecryptable')
})

test('an observer cannot alter the message the library delivers', async () => {
    // The buffer the observer sees is handed to decode on the next line, so a
    // listener that trims or normalizes in place would change the payload.
    const emitted: WaIncomingMessageEvent[] = []

    await handleIncomingMessageAck(createEncryptedMessageNode(), {
        ...createDecryptingOptions(emitted, { message: { conversation: 'hi' } }),
        emitDecryptedPayload: (build) => {
            build().plaintext.fill(0)
        }
    })

    assert.equal(emitted.length, 1)
    assert.equal(emitted[0]?.message?.conversation, 'hi')
})

test('the payload is only built when the hook asks for it', async () => {
    // The hook is wired unconditionally by the factory, so the optional-call
    // guard never fires in production. Handing over a builder is what keeps
    // the plaintext copy and the redacted node off the path when the event has
    // no listener, which is every session that never subscribes.
    const emitted: WaIncomingMessageEvent[] = []
    let handedBuilder = 0

    await handleIncomingMessageAck(createEncryptedMessageNode(), {
        ...createDecryptingOptions(emitted),
        // What the factory does when nothing is subscribed: take the builder
        // and never call it.
        emitDecryptedPayload: () => {
            handedBuilder += 1
        }
    })

    assert.equal(handedBuilder, 1, 'the hook still runs')
    assert.equal(emitted.length, 1, 'and the message still arrives')

    // And calling it produces a fresh copy each time, so the copy lives in the
    // builder rather than on the path to it.
    const built: WaIncomingDecryptedPayloadEvent[] = []
    await handleIncomingMessageAck(createEncryptedMessageNode(), {
        ...createDecryptingOptions(emitted),
        emitDecryptedPayload: (build) => {
            built.push(build(), build())
        }
    })

    assert.equal(built.length, 2)
    assert.notEqual(built[0]?.plaintext, built[1]?.plaintext, 'each call copies')
    assert.deepEqual(built[0]?.plaintext, built[1]?.plaintext, 'to the same bytes')
})
