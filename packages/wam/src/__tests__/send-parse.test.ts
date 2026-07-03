import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js'

import {
    ciphertextTypeKey,
    e2eDestinationKey,
    findFirstEncNode,
    mediaTypeKey
} from '../send-parse.js'

const enc = (attrs: Record<string, string>): BinaryNode => ({ tag: 'enc', attrs })

test('findFirstEncNode finds direct, group and participant-nested enc nodes', () => {
    const direct: BinaryNode = { tag: 'message', attrs: {}, content: [enc({ type: 'msg' })] }
    assert.equal(findFirstEncNode(direct)?.attrs.type, 'msg')

    const nested: BinaryNode = {
        tag: 'message',
        attrs: {},
        content: [
            {
                tag: 'participants',
                attrs: {},
                content: [{ tag: 'to', attrs: {}, content: [enc({ type: 'pkmsg' })] }]
            }
        ]
    }
    assert.equal(findFirstEncNode(nested)?.attrs.type, 'pkmsg')

    const none: BinaryNode = { tag: 'message', attrs: {}, content: [{ tag: 'x', attrs: {} }] }
    assert.equal(findFirstEncNode(none), null)
    assert.equal(findFirstEncNode({ tag: 'message', attrs: {} }), null)
})

test('ciphertextTypeKey maps enc type attr to the E2E_CIPHERTEXT_TYPE key', () => {
    assert.equal(ciphertextTypeKey('msg'), 'MESSAGE')
    assert.equal(ciphertextTypeKey('pkmsg'), 'PREKEY_MESSAGE')
    assert.equal(ciphertextTypeKey('skmsg'), 'SENDER_KEY_MESSAGE')
    assert.equal(ciphertextTypeKey('msmsg'), 'MESSAGE_SECRET_MESSAGE')
    assert.equal(ciphertextTypeKey('nope'), null)
    assert.equal(ciphertextTypeKey(undefined), null)
})

test('e2eDestinationKey maps the recipient jid to the destination', () => {
    assert.equal(e2eDestinationKey('123@g.us'), 'GROUP')
    assert.equal(e2eDestinationKey('status@broadcast'), 'STATUS')
    assert.equal(e2eDestinationKey('abc@newsletter'), 'CHANNEL')
    assert.equal(e2eDestinationKey('5511999999999@s.whatsapp.net'), 'INDIVIDUAL')
    assert.equal(e2eDestinationKey('456@lid'), 'INDIVIDUAL')
})

test('mediaTypeKey maps the enc mediatype attr to the MEDIA_TYPE key', () => {
    assert.equal(mediaTypeKey('image'), 'PHOTO')
    assert.equal(mediaTypeKey('ptt'), 'PTT')
    assert.equal(mediaTypeKey('document'), 'DOCUMENT')
    assert.equal(mediaTypeKey('carrier-pigeon'), null)
    assert.equal(mediaTypeKey(undefined), null)
})
