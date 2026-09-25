import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import {
    buildScreenShareStanza,
    parseScreenShareNode,
    WA_SCREEN_SHARE_SEND_VERSION,
    WA_SCREEN_SHARE_STATE,
    WA_SCREEN_SHARE_VERSION
} from '../screen-share.js'

const CALL_ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const PEER_JID = '50062877036657:76@lid'
const SELF_JID = '184478207058035:1@lid'

/** The one payload child of a built `<call>`. */
function payload(stanza: BinaryNode): BinaryNode {
    return (stanza.content as BinaryNode[])[0]
}

function node(tag: string, attrs: Record<string, string>): BinaryNode {
    return { tag, attrs, content: undefined }
}

/**
 * The wire values of the two enums, written out by hand. They are the whole
 * contract with the peer: a renumbering here is invisible to every other test,
 * because nothing else in this package computes them.
 */
test('the screen share enums carry the wire values', () => {
    assert.equal(WA_SCREEN_SHARE_STATE.NotSupported, 0)
    assert.equal(WA_SCREEN_SHARE_STATE.Started, 1)
    assert.equal(WA_SCREEN_SHARE_STATE.Stopped, 2)
    assert.equal(WA_SCREEN_SHARE_STATE.Failed, 3)

    assert.equal(WA_SCREEN_SHARE_VERSION.Invalid, -1)
    assert.equal(WA_SCREEN_SHARE_VERSION.Legacy, 0)
    assert.equal(WA_SCREEN_SHARE_VERSION.V1, 1)
    assert.equal(WA_SCREEN_SHARE_VERSION.V2, 2)
    assert.equal(WA_SCREEN_SHARE_VERSION.V3, 3)
    assert.equal(WA_SCREEN_SHARE_VERSION.V4, 4)
})

test('parseScreenShareNode reads a dual-stream share starting', () => {
    const share = parseScreenShareNode(
        node('screen_share', {
            'call-id': 'CID',
            'call-creator': '50062877036657:76@lid',
            'request-state': '1',
            screenshare_state: '1',
            version: '3'
        })
    )

    assert.deepEqual(share, {
        state: 1,
        requestState: 1,
        version: 3,
        screenWidth: null,
        screenHeight: null,
        deviceOrientation: null
    })
})

test('parseScreenShareNode reads the geometry the screen payload adds', () => {
    const share = parseScreenShareNode(
        node('screen', {
            'call-creator': '50062877036657:76@lid',
            screenshare_state: '1',
            version: '4',
            screen_width: '1920',
            screen_height: '1080',
            device_orientation: '2',
            enc: 'h.264',
            dec: 'H264'
        })
    )

    assert.deepEqual(share, {
        state: 1,
        requestState: null,
        version: 4,
        screenWidth: 1920,
        screenHeight: 1080,
        deviceOrientation: 2
    })
})

test('parseScreenShareNode accepts the underscore spelling of the request attribute', () => {
    const share = parseScreenShareNode(node('screen_share', { request_state: '2', version: '3' }))

    assert.equal(share?.requestState, 2)
    assert.equal(share?.state, null)
})

test('parseScreenShareNode prefers the hyphen spelling when both are present', () => {
    const share = parseScreenShareNode(
        node('screen_share', { 'request-state': '1', request_state: '2' })
    )

    assert.equal(share?.requestState, 1)
})

test('parseScreenShareNode reads a share stopping', () => {
    const share = parseScreenShareNode(
        node('screen_share', { screenshare_state: '2', version: '3' })
    )

    assert.equal(share?.state, 2)
    assert.equal(share?.version, 3)
})

test('parseScreenShareNode keeps a state it does not model instead of dropping it', () => {
    const share = parseScreenShareNode(node('screen_share', { screenshare_state: '9' }))

    assert.equal(share?.state, 9)
})

test('parseScreenShareNode keeps the negative version sentinel', () => {
    const share = parseScreenShareNode(
        node('screen_share', { screenshare_state: '1', version: '-1' })
    )

    assert.equal(share?.version, -1)
})

test('parseScreenShareNode rejects a node with neither a state nor a request', () => {
    assert.equal(parseScreenShareNode(node('screen_share', { version: '3' })), null)
    assert.equal(parseScreenShareNode(node('screen_share', {})), null)
    assert.equal(parseScreenShareNode({ tag: 'screen_share', attrs: {} }), null)
})

test('parseScreenShareNode reports an unreadable attribute as absent, never as zero', () => {
    const share = parseScreenShareNode(
        node('screen_share', {
            screenshare_state: '1',
            version: '',
            screen_width: 'wide',
            device_orientation: '  3  '
        })
    )

    assert.equal(share?.version, null)
    assert.equal(share?.screenWidth, null)
    assert.equal(share?.deviceOrientation, 3)
})

/**
 * The version a share of ours announces, written out as `2` rather than as
 * `WA_SCREEN_SHARE_VERSION.V2`: the assertion is about the choice of version, not the
 * spelling of the name.
 */
test('a share of ours announces the single-stream version', () => {
    assert.equal(WA_SCREEN_SHARE_SEND_VERSION, 2)
})

test('buildScreenShareStanza asks the peer device for the share', () => {
    const stanza = buildScreenShareStanza(
        PEER_JID,
        CALL_ID,
        SELF_JID,
        WA_SCREEN_SHARE_STATE.Started
    )

    assert.equal(stanza.tag, 'call')
    assert.equal(stanza.attrs.to, PEER_JID)
    assert.equal(typeof stanza.attrs.id, 'string')
    assert.deepEqual(payload(stanza), {
        tag: 'screen_share',
        attrs: {
            'call-id': CALL_ID,
            'call-creator': SELF_JID,
            screenshare_state: '1',
            version: '2'
        }
    })
})

test('buildScreenShareStanza carries the stop request under the same shape', () => {
    const stanza = buildScreenShareStanza(
        PEER_JID,
        CALL_ID,
        SELF_JID,
        WA_SCREEN_SHARE_STATE.Stopped
    )

    assert.equal(payload(stanza).attrs.screenshare_state, '2')
    assert.equal(payload(stanza).attrs.version, '2')
})
