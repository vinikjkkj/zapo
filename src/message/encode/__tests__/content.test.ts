import assert from 'node:assert/strict'
import test from 'node:test'

import {
    isSendMediaMessage,
    resolveButtonAddonKind,
    resolveEditAttr,
    resolveEncMediaType,
    resolveMessageTypeAttr,
    resolveMetaAttrs
} from '@message/encode/content'
import { unwrapDeviceSentMessage, wrapDeviceSentMessage } from '@message/encode/device-sent'
import { unpadPkcs7, writeRandomPadMax16 } from '@message/encode/padding'

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

test('resolveButtonAddonKind classifies list/interactive incl. documentWithCaption wrap', () => {
    assert.equal(resolveButtonAddonKind({ listMessage: {} }), 'list')
    assert.equal(resolveButtonAddonKind({ buttonsMessage: {} }), 'interactive')
    assert.equal(
        resolveButtonAddonKind({ interactiveMessage: { nativeFlowMessage: {} } }),
        'interactive'
    )
    assert.equal(resolveButtonAddonKind({ interactiveMessage: {} }), null)
    assert.equal(resolveButtonAddonKind({ conversation: 'hi' }), null)
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
