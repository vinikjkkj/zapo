import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import {
    buildMuteRequestStanza,
    buildMuteV2Stanza,
    buildRaiseHandStanza,
    parseMuteV2,
    parseRaiseHandState,
    WA_MUTE_REQUEST_STATE
} from '../in-call.js'

/**
 * Node the wire capture of a live raise hand shows, transcribed by hand so the
 * assertions do not read back what the builder produced. The random stanza id is the
 * one field left out.
 */
const RAISE_HAND_CAPTURED_USER_ACTION = {
    tag: 'user_action',
    attrs: {
        'call-id': 'CID',
        'call-creator': '184478207058035:1@lid',
        action: 'raise_hand'
    },
    content: [{ tag: 'raise_hand', attrs: { 'raise-hand-state': '1' } }]
}

test('buildRaiseHandStanza matches the captured user_action layout', () => {
    const node = buildRaiseHandStanza('50062877036657:76@lid', 'CID', '184478207058035:1@lid', true)

    assert.equal(node.tag, 'call')
    assert.equal(node.attrs.to, '50062877036657:76@lid')
    assert.match(node.attrs.id, /^[0-9A-F]{32}$/)
    assert.deepEqual(node.content, [RAISE_HAND_CAPTURED_USER_ACTION])
})

test('buildRaiseHandStanza lowers the hand with state 0', () => {
    const node = buildRaiseHandStanza('p:1@lid', 'CID', 'creator@lid', false)
    const userAction = (node.content as BinaryNode[])[0]
    const raiseHand = (userAction.content as BinaryNode[])[0]
    assert.equal(raiseHand.attrs['raise-hand-state'], '0')
})

test('buildRaiseHandStanza carries broadcast only when asked, on the envelope', () => {
    const off = (
        buildRaiseHandStanza('p:1@lid', 'CID', 'creator@lid', true).content as BinaryNode[]
    )[0]
    assert.equal(off.attrs.broadcast, undefined)

    const on = (
        buildRaiseHandStanza('p:1@lid', 'CID', 'creator@lid', true, true).content as BinaryNode[]
    )[0]
    assert.equal(on.attrs.broadcast, '1')
    // It rides the envelope itself, never the nested state element.
    assert.deepEqual(on.content, [{ tag: 'raise_hand', attrs: { 'raise-hand-state': '1' } }])
})

/**
 * The two shapes a raised hand arrives in, transcribed by hand rather than produced
 * by the builder above, so the parser is measured against a vector and not against
 * itself. `broadcast` is included because a receiver has to ignore it on either shape.
 */
const inboundRaiseHandUserAction = (state: string): BinaryNode => ({
    tag: 'user_action',
    attrs: {
        'call-id': 'F0A1B2C3D4E5F60718293A4B5C6D7E8F',
        'call-creator': '184478207058035:1@lid',
        action: 'raise_hand',
        broadcast: '1'
    },
    content: [{ tag: 'raise_hand', attrs: { 'raise-hand-state': state } }]
})

const inboundRaiseHandLegacy = (state: string): BinaryNode => ({
    tag: 'raise_hand',
    attrs: {
        'call-id': 'F0A1B2C3D4E5F60718293A4B5C6D7E8F',
        'call-creator': '184478207058035:1@lid',
        'raise-hand-state': state,
        broadcast: '1'
    },
    content: undefined
})

test('parseRaiseHandState reads both wire shapes of a raised hand', () => {
    assert.equal(parseRaiseHandState(inboundRaiseHandUserAction('1')), true)
    assert.equal(parseRaiseHandState(inboundRaiseHandUserAction('0')), false)

    assert.equal(parseRaiseHandState(inboundRaiseHandLegacy('1')), true)
    assert.equal(parseRaiseHandState(inboundRaiseHandLegacy('0')), false)
})

test('parseRaiseHandState returns null for another action or an unknown value', () => {
    assert.equal(
        parseRaiseHandState({
            tag: 'user_action',
            attrs: { 'call-id': 'CID', action: 'attribution' },
            content: [{ tag: 'attribution', attrs: { wearable: '1' }, content: undefined }]
        }),
        null
    )
    assert.equal(
        parseRaiseHandState({
            tag: 'user_action',
            attrs: { 'call-id': 'CID', action: 'raise_hand' },
            content: [{ tag: 'raise_hand', attrs: { 'raise-hand-state': '7' } }]
        }),
        null
    )
})

test('parseRaiseHandState does not invent a flat or underscored spelling', () => {
    // Neither is a wire form: no sender writes the state onto the `user_action`
    // envelope, and the underscored name belongs to log lines and event names.
    assert.equal(
        parseRaiseHandState({
            tag: 'user_action',
            attrs: { 'call-id': 'CID', action: 'raise_hand', 'raise-hand-state': '1' },
            content: undefined
        }),
        null
    )
    assert.equal(
        parseRaiseHandState({
            tag: 'raise_hand',
            attrs: { 'call-id': 'CID', raise_hand_state: '1' },
            content: undefined
        }),
        null
    )
})

test('buildMuteV2Stanza announces the muted state as an attribute of mute_v2', () => {
    const node = buildMuteV2Stanza(
        '50062877036657:76@lid',
        'CA11CA11000000000000000000000001',
        '184478207058035:1@lid',
        true
    )

    assert.equal(node.tag, 'call')
    assert.equal(node.attrs.to, '50062877036657:76@lid')

    const inner = (node.content as BinaryNode[])[0]
    assert.equal(inner.tag, 'mute_v2')
    assert.deepEqual(inner.attrs, {
        'call-id': 'CA11CA11000000000000000000000001',
        'call-creator': '184478207058035:1@lid',
        'mute-state': '1'
    })
    assert.equal(inner.content, undefined)
})

test('buildMuteV2Stanza announces the unmuted state as mute-state 0', () => {
    const node = buildMuteV2Stanza('50062877036657:76@lid', 'CID', '184478207058035:1@lid', false)
    const inner = (node.content as BinaryNode[])[0]
    assert.equal(inner.attrs['mute-state'], '0')
})

test('parseMuteV2 reads the two known mute-state values', () => {
    assert.deepEqual(parseMuteV2({ tag: 'mute_v2', attrs: { 'mute-state': '1' } }), {
        muted: true,
        isRequest: false,
        requestState: null
    })
    assert.deepEqual(parseMuteV2({ tag: 'mute_v2', attrs: { 'mute-state': '0' } }), {
        muted: false,
        isRequest: false,
        requestState: null
    })
})

test('parseMuteV2 refuses to guess an absent or unknown mute-state', () => {
    assert.equal(parseMuteV2({ tag: 'mute_v2', attrs: {} }).muted, null)
    assert.equal(parseMuteV2({ tag: 'mute_v2', attrs: { 'mute-state': '7' } }).muted, null)
    assert.equal(parseMuteV2({ tag: 'mute_v2', attrs: { 'mute-state': 'true' } }).muted, null)
})

test('parseMuteV2 flags a request-state stanza as a request', () => {
    const parsed = parseMuteV2({ tag: 'mute_v2', attrs: { 'request-state': '1' } })
    assert.equal(parsed.isRequest, true)
    assert.equal(parsed.muted, null)
})

test('parseMuteV2 hands request-state over raw, never mapped onto a mute', () => {
    assert.equal(parseMuteV2({ tag: 'mute_v2', attrs: { 'request-state': '1' } }).requestState, '1')
    const unknown = parseMuteV2({ tag: 'mute_v2', attrs: { 'request-state': '2' } })
    assert.equal(unknown.requestState, '2')
    assert.equal(unknown.isRequest, true)
    assert.equal(unknown.muted, null)
})

/** What a group admin sent to the one device it asked to mute, attribute by attribute. */
test('a mute request goes to the target device with request-state and no mute-state', () => {
    const node = buildMuteRequestStanza(
        '184478207058035:9@lid',
        '00FFD3D11243F580F2284050F8ACAF2E',
        '50062877036657:87@lid'
    )

    assert.equal(node.attrs.to, '184478207058035:9@lid')
    const inner = (node.content as BinaryNode[])[0]
    assert.equal(inner.tag, 'mute_v2')
    assert.deepEqual(inner.attrs, {
        'call-id': '00FFD3D11243F580F2284050F8ACAF2E',
        'call-creator': '50062877036657:87@lid',
        'request-state': '1'
    })
    assert.equal(inner.content, undefined)
    assert.equal(WA_MUTE_REQUEST_STATE.Mute, '1')
    assert.deepEqual(parseMuteV2(inner), { muted: null, isRequest: true, requestState: '1' })
})
