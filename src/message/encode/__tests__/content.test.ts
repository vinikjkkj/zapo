import assert from 'node:assert/strict'
import test from 'node:test'

import {
    getContentType,
    isSendMediaMessage,
    resolveButtonAddonKind,
    resolveDecryptFailAttr,
    resolveEditAttr,
    resolveEncMediaType,
    resolveMessageTypeAttr,
    resolveMetaAttrs,
    resolveOutboundMessageAttrs
} from '@message/encode/content'
import { unwrapDeviceSentMessage, wrapDeviceSentMessage } from '@message/encode/device-sent'
import { unpadPkcs7, writeRandomPadMax16 } from '@message/encode/padding'
import { proto, type Proto } from '@proto'

test('content helpers detect media payload and resolve message type', () => {
    assert.equal(
        isSendMediaMessage({ type: 'image', media: new Uint8Array([1]), mimetype: 'x' }),
        true
    )
    assert.equal(isSendMediaMessage({}), false)

    assert.equal(resolveMessageTypeAttr({ reactionMessage: {} }), 'reaction')
    assert.equal(resolveMessageTypeAttr({ imageMessage: {} }), 'media')
    assert.equal(resolveMessageTypeAttr({ conversation: 'text' }), 'text')
    assert.equal(resolveMessageTypeAttr({ pollCreationMessage: {} }), 'poll')
})

test('getContentType picks the payload key, including the unsuffixed ones', () => {
    assert.equal(getContentType(undefined), undefined)
    assert.equal(getContentType({}), undefined)
    assert.equal(getContentType({ conversation: 'hi' }), 'conversation')
    assert.equal(getContentType({ imageMessage: {} }), 'imageMessage')
    assert.equal(
        getContentType({ senderKeyDistributionMessage: {}, imageMessage: {} }),
        'imageMessage'
    )
    // group-history payload keys do not end in `Message`
    assert.equal(getContentType({ messageHistoryBundle: {} }), 'messageHistoryBundle')
    assert.equal(getContentType({ messageHistoryNotice: {} }), 'messageHistoryNotice')
})

test('getContentType skips keys that are present but hold no payload', () => {
    assert.equal(
        getContentType({ messageHistoryBundle: undefined, imageMessage: {} }),
        'imageMessage'
    )
    assert.equal(getContentType({ imageMessage: null, conversation: 'hi' }), 'conversation')
    assert.equal(getContentType({ imageMessage: undefined }), undefined)
})

test('resolveButtonAddonKind classifies list/interactive incl. documentWithCaption wrap', () => {
    assert.equal(resolveButtonAddonKind({ listMessage: {} }), 'list')
    assert.equal(resolveButtonAddonKind({ buttonsMessage: {} }), 'interactive')
    assert.equal(
        resolveButtonAddonKind({ interactiveMessage: { nativeFlowMessage: {} } }),
        'interactive'
    )
    assert.equal(
        resolveButtonAddonKind({
            interactiveMessage: {
                nativeFlowMessage: {
                    buttons: [{ name: 'payment_info', buttonParamsJson: '{}' }]
                }
            }
        }),
        'payment_info'
    )
    assert.equal(
        resolveButtonAddonKind({
            interactiveMessage: {
                nativeFlowMessage: {
                    buttons: [{ name: 'review_and_pay', buttonParamsJson: '{}' }]
                }
            }
        }),
        'order_details'
    )
    assert.equal(resolveButtonAddonKind({ interactiveMessage: {} }), null)
    assert.equal(resolveButtonAddonKind({ conversation: 'hi' }), null)
    assert.equal(
        resolveButtonAddonKind({ documentWithCaptionMessage: { message: { listMessage: {} } } }),
        'list'
    )
    assert.equal(
        resolveButtonAddonKind({
            documentWithCaptionMessage: {
                message: { interactiveMessage: { nativeFlowMessage: {} } }
            }
        }),
        'interactive'
    )
})

test('resolveEditAttr maps protobuf to correct edit attribute values', () => {
    assert.equal(resolveEditAttr({ conversation: 'hello' }), null)
    assert.equal(resolveEditAttr({ protocolMessage: { type: 0 } }), '7')
    assert.equal(resolveEditAttr({ protocolMessage: { type: 14 } }), '1')
    assert.equal(resolveEditAttr({ reactionMessage: { text: '' } }), '7')
})

test('resolveEncMediaType maps protobuf to correct media type string', () => {
    assert.equal(resolveEncMediaType({ imageMessage: {} }), 'image')
    assert.equal(resolveEncMediaType({ videoMessage: { gifPlayback: true } }), 'gif')
    assert.equal(resolveEncMediaType({ audioMessage: { ptt: true } }), 'ptt')
    assert.equal(resolveEncMediaType({ documentMessage: {} }), 'document')
})

test('resolveMetaAttrs returns attrs for polls events and view-once', () => {
    assert.deepEqual(resolveMetaAttrs({ pollCreationMessage: {} }), { polltype: 'creation' })
    assert.deepEqual(resolveMetaAttrs({ eventMessage: {} }), { event_type: 'creation' })
    assert.deepEqual(resolveMetaAttrs({ viewOnceMessage: { message: {} } }), { view_once: 'true' })
})

test('device-sent wrapping preserves context and unwrap restores nested payload', () => {
    const wrapped = wrapDeviceSentMessage(
        {
            conversation: 'hello',
            messageContextInfo: {}
        },
        '5511@s.whatsapp.net'
    )

    assert.ok(wrapped.deviceSentMessage)
    const unwrapped = unwrapDeviceSentMessage(wrapped)
    assert.ok(unwrapped)
    assert.equal(unwrapped?.conversation, 'hello')

    assert.equal(unwrapDeviceSentMessage({ conversation: 'x' }), null)
})

test('padding helpers add random padding and reverse pkcs7', async () => {
    const input = new Uint8Array([1, 2, 3])
    const padded = await writeRandomPadMax16(input)
    assert.ok(padded.length > input.length)

    const unpadded = unpadPkcs7(new Uint8Array([10, 11, 2, 2]))
    assert.deepEqual(unpadded, new Uint8Array([10, 11]))
    assert.throws(() => unpadPkcs7(new Uint8Array([])), /empty bytes/)
})

test('resolveOutboundMessageAttrs matches the individual resolvers', () => {
    const corpus: Proto.IMessage[] = [
        { conversation: 'texto simples' },
        { extendedTextMessage: { text: 'link', matchedText: 'https://x.com' } },
        { imageMessage: { url: 'x', mimetype: 'image/jpeg' } },
        { audioMessage: { ptt: true } },
        { videoMessage: { gifPlayback: true } },
        { reactionMessage: { text: '' } },
        { reactionMessage: { text: '👍' } },
        {
            protocolMessage: {
                type: proto.Message.ProtocolMessage.Type.REVOKE,
                key: { fromMe: true }
            }
        },
        { protocolMessage: { type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT } },
        { pollCreationMessageV3: { name: 'enquete' } },
        { pollUpdateMessage: { vote: { encPayload: new Uint8Array(4) } } },
        { eventMessage: { name: 'evento' } },
        { listMessage: { title: 'lista' } },
        { buttonsMessage: { contentText: 'botoes' } },
        { interactiveMessage: { nativeFlowMessage: {} } },
        { pinInChatMessage: { key: { id: '1' } } },
        { ephemeralMessage: { message: { conversation: 'efemera' } } },
        { viewOnceMessage: { message: { imageMessage: { url: 'x' } } } },
        { ephemeralMessage: { message: { viewOnceMessageV2: { message: { videoMessage: {} } } } } },
        { deviceSentMessage: { message: { extendedTextMessage: { text: 'ds' } } } }
    ]
    for (const message of corpus) {
        const combined = resolveOutboundMessageAttrs(message)
        const label = JSON.stringify(message).slice(0, 60)
        assert.equal(combined.buttonAddonKind, resolveButtonAddonKind(message), label)
        assert.equal(combined.typeAttr, resolveMessageTypeAttr(message), label)
        assert.equal(combined.edit, resolveEditAttr(message), label)
        assert.equal(combined.mediatype, resolveEncMediaType(message), label)
        assert.deepEqual(combined.metaAttrs, resolveMetaAttrs(message), label)
        assert.equal(combined.decryptFail, resolveDecryptFailAttr(message), label)
    }
})
