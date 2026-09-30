import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveOutboundStanzaShape } from '@client/coordinators/WaMessageDispatchCoordinator'
import { resolveOutboundMessageAttrs } from '@message/encode/content'
import type { Proto } from '@proto'

const LIST: Proto.IMessage = {
    listMessage: {
        title: 'menu',
        buttonText: 'open',
        listType: 1,
        sections: [{ title: 'main', rows: [{ title: 'a', rowId: 'a' }] }]
    }
}

function shapeOf(message: Proto.IMessage, isGroup: boolean) {
    return resolveOutboundStanzaShape(resolveOutboundMessageAttrs(message), isGroup)
}

test('resolveOutboundStanzaShape keeps a direct list flat next to its <biz> companion', () => {
    assert.deepEqual(shapeOf(LIST, false), { type: 'text', mediatype: undefined })
})

test('resolveOutboundStanzaShape keeps type=media and mediatype=list on a group list', () => {
    assert.deepEqual(shapeOf(LIST, true), { type: 'media', mediatype: 'list' })
})

test('resolveOutboundStanzaShape sees a group list through an ephemeral wrapper', () => {
    assert.deepEqual(shapeOf({ ephemeralMessage: { message: LIST } }, true), {
        type: 'media',
        mediatype: 'list'
    })
})

test('resolveOutboundStanzaShape keeps a group buttons message flat', () => {
    assert.deepEqual(shapeOf({ buttonsMessage: { contentText: 'pick one' } }, true), {
        type: 'text',
        mediatype: undefined
    })
})

test('resolveOutboundStanzaShape passes through a message without a <biz> companion', () => {
    assert.deepEqual(shapeOf({ imageMessage: {} }, true), { type: 'media', mediatype: 'image' })
    assert.deepEqual(shapeOf({ conversation: 'hi' }, false), {
        type: 'text',
        mediatype: undefined
    })
})
