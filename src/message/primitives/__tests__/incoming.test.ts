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

test('1:1 message from my hosted device is detected as fromMe', async () => {
    const emitted: WaIncomingMessageEvent[] = []
    await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: {
                id: 'msg-self-hosted',
                from: '133300000000000:99@hosted.lid',
                recipient: '144400000000000@lid',
                sender_pn: '5511999999999@s.whatsapp.net',
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
    assert.equal(key.remoteJidAlt, undefined)
})

test('self-sent 1:1 message with an unresolved chat keeps the own number out of remoteJidAlt', async () => {
    const emitted: WaIncomingMessageEvent[] = []
    await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: {
                id: 'msg-self-no-chat',
                from: '133300000000000:99@hosted.lid',
                sender_pn: '5511999999999@s.whatsapp.net',
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
    assert.equal(key.remoteJidAlt, undefined)
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

async function classifyUnavailable(
    unavailableAttrs: Record<string, string>,
    extraChildren: readonly BinaryNode[] = []
): Promise<WaIncomingUnavailableMessageEvent> {
    const unavailable: WaIncomingUnavailableMessageEvent[] = []
    await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: { id: 'msg-unavailable', from: '5511777777777@s.whatsapp.net', type: 'text' },
            content: [{ tag: 'unavailable', attrs: unavailableAttrs }, ...extraChildren]
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
    return unavailable[0]
}

test('sender-drop placeholder is classified as its own kind', async () => {
    const event = await classifyUnavailable({ type: 'sender_drop' })

    assert.equal(event.kind, 'sender_drop')
})

test('a bot child keeps a sender-drop placeholder classified as bot', async () => {
    const event = await classifyUnavailable({ type: 'sender_drop' }, [
        { tag: 'bot', attrs: { biz_bot: '1' } }
    ])

    assert.equal(event.kind, 'bot')
})

test('hosted="true" keeps a sender-drop placeholder classified as hosted', async () => {
    const event = await classifyUnavailable({ type: 'sender_drop', hosted: 'true' })

    assert.equal(event.kind, 'hosted')
})

test('type="hosted" is not a hosted placeholder', async () => {
    const event = await classifyUnavailable({ type: 'hosted' })

    assert.equal(event.kind, 'other')
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

test('incoming 1:1 message exposes the sender username handle', async () => {
    const emitted: WaIncomingMessageEvent[] = []
    await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: {
                id: 'msg-un',
                from: '5511999999999:12@s.whatsapp.net',
                username: '@joao',
                t: '123'
            },
            content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([1]) }]
        },
        createDecryptingOptions(emitted)
    )

    assert.equal(emitted.length, 1)
    assert.equal(emitted[0].key.senderUsername, 'joao')
    assert.equal(emitted[0].key.recipientUsername, undefined)
})

test('group message prefers participant_username as the sender handle', async () => {
    const emitted: WaIncomingMessageEvent[] = []
    await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: {
                id: 'msg-grp-un',
                from: '123456@g.us',
                participant: '5511999999999:3@s.whatsapp.net',
                username: 'ignored',
                participant_username: 'joao',
                t: '123'
            },
            content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([1]) }]
        },
        createDecryptingOptions(emitted)
    )

    assert.equal(emitted.length, 1)
    assert.equal(emitted[0].key.senderUsername, 'joao')
})

test('self-sent 1:1 message carries the peer handle, not the own one', async () => {
    const emitted: WaIncomingMessageEvent[] = []
    await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: {
                id: 'msg-self-un',
                from: '5511999999999:12@s.whatsapp.net',
                recipient: '5511888888888@s.whatsapp.net',
                username: 'me.handle',
                peer_recipient_username: 'joao',
                t: '123'
            },
            content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([1]) }]
        },
        createDecryptingOptions(emitted, {
            getMeJid: () => '5511999999999:2@s.whatsapp.net'
        })
    )

    assert.equal(emitted.length, 1)
    const { key } = emitted[0]
    assert.equal(key.fromMe, true)
    assert.equal(key.remoteJid, '5511888888888@s.whatsapp.net')
    assert.equal(key.recipientUsername, 'joao')
    assert.equal(
        key.senderUsername,
        undefined,
        'the own handle must not be promoted onto the peer-addressed key'
    )
})

test('recipient_username wins over peer_recipient_username when both are present', async () => {
    const emitted: WaIncomingMessageEvent[] = []
    await handleIncomingMessageAck(
        {
            tag: 'message',
            attrs: {
                id: 'msg-rec-un',
                from: '5511999999999:12@s.whatsapp.net',
                recipient_username: 'primary',
                peer_recipient_username: 'fallback',
                t: '123'
            },
            content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([1]) }]
        },
        createDecryptingOptions(emitted)
    )

    assert.equal(emitted[0].key.recipientUsername, 'primary')
})

const DECRYPT_GROUP_JID = '120363000000000000@g.us'
const DECRYPT_SENDER_JID = '551100000000@s.whatsapp.net'

function createEncsNode(from: string, encTypes: readonly string[]): BinaryNode {
    return {
        tag: 'message',
        attrs: {
            id: 'msg-encs',
            from,
            ...(from === DECRYPT_GROUP_JID ? { participant: DECRYPT_SENDER_JID } : {}),
            t: '123'
        },
        content: encTypes.map((type) => ({
            tag: 'enc',
            attrs: { type },
            content: new Uint8Array([1])
        }))
    }
}

// Each call consumes the next entry: an Error is thrown, null decrypts fine.
function scriptedDecrypt(script: ReadonlyArray<Error | null>, calls: { count: number }) {
    return async (): Promise<Uint8Array> => {
        const outcome = script[calls.count]
        calls.count += 1
        if (outcome) throw outcome
        return paddedPlaintext({ conversation: 'hi' })
    }
}

async function runEncsScenario(
    node: BinaryNode,
    script: {
        readonly signal?: ReadonlyArray<Error | null>
        readonly senderKey?: ReadonlyArray<Error | null>
    }
) {
    const sentNodes: BinaryNode[] = []
    const signalCalls = { count: 0 }
    const senderKeyCalls = { count: 0 }
    await handleIncomingMessageAck(node, {
        logger: createNoopLogger(),
        sendNode: async (sent) => {
            sentNodes.push(sent)
        },
        signalProtocol: {
            decryptMessage: scriptedDecrypt(script.signal ?? [], signalCalls)
        } as never,
        senderKeyManager: {
            decryptGroupMessage: scriptedDecrypt(script.senderKey ?? [], senderKeyCalls),
            processSenderKeyDistributionPayload: async () => undefined
        } as never
    })
    return {
        retries: sentNodes.filter((sent) => sent.attrs.type === 'retry'),
        deliveries: sentNodes.filter((sent) => sent.tag === 'receipt' && !sent.attrs.type),
        signalCalls: signalCalls.count,
        senderKeyCalls: senderKeyCalls.count
    }
}

const DECRYPT_ERROR = new Error('invalid message mac')
const DUPLICATE_ERROR = new Error('duplicate message')

test('group pkmsg decrypted but skmsg failing sends a retry receipt', async () => {
    const result = await runEncsScenario(createEncsNode(DECRYPT_GROUP_JID, ['pkmsg', 'skmsg']), {
        signal: [null],
        senderKey: [new Error('missing sender key')]
    })

    assert.equal(result.retries.length, 1)
    assert.equal(result.deliveries.length, 0)
    assert.equal(result.retries[0].attrs.id, 'msg-encs')
    assert.equal(result.retries[0].attrs.to, DECRYPT_GROUP_JID)
})

test('a stanza where no enc decrypts sends a retry receipt', async () => {
    const pairwise = await runEncsScenario(createEncsNode(DECRYPT_SENDER_JID, ['msg']), {
        signal: [DECRYPT_ERROR]
    })
    assert.equal(pairwise.retries.length, 1)
    assert.equal(pairwise.deliveries.length, 0)

    const group = await runEncsScenario(createEncsNode(DECRYPT_GROUP_JID, ['pkmsg', 'skmsg']), {
        signal: [DECRYPT_ERROR],
        senderKey: [DECRYPT_ERROR]
    })
    assert.equal(group.retries.length, 1)
    assert.equal(group.deliveries.length, 0)
})

test('the retry is reported with the skmsg failure when both encs fail', async () => {
    const skmsgError = new Error('missing sender key')
    const failures: unknown[] = []
    await handleIncomingMessageAck(createEncsNode(DECRYPT_GROUP_JID, ['pkmsg', 'skmsg']), {
        logger: createNoopLogger(),
        sendNode: async () => undefined,
        signalProtocol: {
            decryptMessage: scriptedDecrypt([DECRYPT_ERROR], { count: 0 })
        } as never,
        senderKeyManager: {
            decryptGroupMessage: scriptedDecrypt([skmsgError], { count: 0 })
        } as never,
        onDecryptFailure: async (_context, error) => {
            failures.push(error)
            return true
        }
    })

    assert.deepEqual(failures, [skmsgError])
})

test('1:1 stanza with a decrypted enc and a failing enc sends no retry receipt', async () => {
    const result = await runEncsScenario(createEncsNode(DECRYPT_SENDER_JID, ['msg', 'msg']), {
        signal: [null, DECRYPT_ERROR]
    })

    assert.equal(result.signalCalls, 2)
    assert.equal(result.retries.length, 0)
    assert.equal(result.deliveries.length, 1)
})

test('a stanza whose encs all decrypt sends the standard receipt only', async () => {
    const result = await runEncsScenario(createEncsNode(DECRYPT_GROUP_JID, ['pkmsg', 'skmsg']), {
        signal: [null],
        senderKey: [null]
    })

    assert.equal(result.signalCalls, 1)
    assert.equal(result.senderKeyCalls, 1)
    assert.equal(result.retries.length, 0)
    assert.equal(result.deliveries.length, 1)
})

test('group skmsg decrypted but pkmsg failing sends no retry receipt', async () => {
    const result = await runEncsScenario(createEncsNode(DECRYPT_GROUP_JID, ['pkmsg', 'skmsg']), {
        signal: [DECRYPT_ERROR],
        senderKey: [null]
    })

    assert.equal(result.senderKeyCalls, 1)
    assert.equal(result.retries.length, 0)
    assert.equal(result.deliveries.length, 1)
})

test('a duplicate failure with no decrypted enc still sends a retry receipt', async () => {
    const result = await runEncsScenario(createEncsNode(DECRYPT_SENDER_JID, ['msg']), {
        signal: [DUPLICATE_ERROR]
    })

    assert.equal(result.retries.length, 1)
    assert.equal(result.deliveries.length, 0)
})

const SENDER_KEY_DISTRIBUTION = {
    groupId: DECRYPT_GROUP_JID,
    axolotlSenderKeyDistributionMessage: new Uint8Array([1, 2, 3])
}

test('a sender key distribution carrying only the message context is not emitted', async () => {
    const emitted: WaIncomingMessageEvent[] = []

    await handleIncomingMessageAck(
        createEncryptedMessageNode(),
        createDecryptingOptions(emitted, {
            message: {
                senderKeyDistributionMessage: SENDER_KEY_DISTRIBUTION,
                messageContextInfo: {}
            }
        })
    )

    assert.equal(emitted.length, 0)
})

test('a fast ratchet sender key distribution carrying only the message context is not emitted', async () => {
    const emitted: WaIncomingMessageEvent[] = []

    await handleIncomingMessageAck(
        createEncryptedMessageNode(),
        createDecryptingOptions(emitted, {
            message: {
                fastRatchetKeySenderKeyDistributionMessage: SENDER_KEY_DISTRIBUTION,
                messageContextInfo: {}
            }
        })
    )

    assert.equal(emitted.length, 0)
})

test('a sender key distribution next to real content is still emitted', async () => {
    const emitted: WaIncomingMessageEvent[] = []

    await handleIncomingMessageAck(
        createEncryptedMessageNode(),
        createDecryptingOptions(emitted, {
            message: {
                senderKeyDistributionMessage: SENDER_KEY_DISTRIBUTION,
                messageContextInfo: {},
                stickerMessage: {}
            }
        })
    )

    assert.equal(emitted.length, 1)
    assert.ok(emitted[0].message?.stickerMessage)
})

test('a message with the context but no sender key distribution is still emitted', async () => {
    const emitted: WaIncomingMessageEvent[] = []

    await handleIncomingMessageAck(
        createEncryptedMessageNode(),
        createDecryptingOptions(emitted, { message: { messageContextInfo: {} } })
    )

    assert.equal(emitted.length, 1)
})
