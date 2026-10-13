import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { toCallServerJid } from '../call-stanza.js'
import { buildVideoStateStanza, parseVideoStateNode, WA_VIDEO_STATE } from '../video-state.js'

/**
 * The two `<video>` stanzas a client emitted, in this order, when its camera was turned
 * on during an active call. Written out attribute by attribute from that capture.
 */
const CAPTURED_VIDEO_STATE_NODES: readonly BinaryNode[] = [
    {
        tag: 'video',
        attrs: {
            'call-id': '00CEAC2144738E0FAADE17F16BCDBA04',
            'call-creator': '184478207058035:1@lid',
            state: '6',
            device_orientation: '0',
            'transaction-id': '1'
        },
        content: undefined
    },
    {
        tag: 'video',
        attrs: {
            'call-id': '00CEAC2144738E0FAADE17F16BCDBA04',
            'call-creator': '184478207058035:1@lid',
            state: '4',
            device_orientation: '0',
            dec: 'H264',
            'transaction-id': '2'
        },
        content: undefined
    }
]

test('parseVideoStateNode reads the captured transition stanza', () => {
    assert.deepEqual(parseVideoStateNode(CAPTURED_VIDEO_STATE_NODES[0]), {
        state: WA_VIDEO_STATE.Stopped,
        transactionId: 1,
        deviceOrientation: 0,
        decoderCodec: null,
        encoderCodec: null,
        supportedCodecs: null
    })
})

test('parseVideoStateNode reads the captured codec announcement', () => {
    assert.deepEqual(parseVideoStateNode(CAPTURED_VIDEO_STATE_NODES[1]), {
        state: WA_VIDEO_STATE.UpgradeAccept,
        transactionId: 2,
        deviceOrientation: 0,
        decoderCodec: 'H264',
        encoderCodec: null,
        supportedCodecs: null
    })
})

test('parseVideoStateNode leaves the optional attributes null when absent', () => {
    assert.deepEqual(parseVideoStateNode({ tag: 'video', attrs: { state: '1' } }), {
        state: 1,
        transactionId: null,
        deviceOrientation: null,
        decoderCodec: null,
        encoderCodec: null,
        supportedCodecs: null
    })
})

/** `enc` and `dec` are different fields, so a stanza carrying both comes back with both. */
test('parseVideoStateNode keeps the encoder codec apart from the decode capability', () => {
    assert.deepEqual(
        parseVideoStateNode({
            tag: 'video',
            attrs: {
                state: '1',
                enc: 'h.264',
                dec: 'vp8/h.264,VP9,H265,AV1',
                enc_supported: '31',
                'transaction-id': '4'
            }
        }),
        {
            state: WA_VIDEO_STATE.Enabled,
            transactionId: 4,
            deviceOrientation: null,
            decoderCodec: 'vp8/h.264,VP9,H265,AV1',
            encoderCodec: 'h.264',
            supportedCodecs: 31
        }
    )
})

test('parseVideoStateNode rejects a stanza with no readable state', () => {
    assert.equal(parseVideoStateNode({ tag: 'video', attrs: {} }), null)
    assert.equal(parseVideoStateNode({ tag: 'video', attrs: { state: '' } }), null)
    assert.equal(parseVideoStateNode({ tag: 'video', attrs: { state: 'enabled' } }), null)
})

/**
 * The state names and the wire numbers, written out by hand. A value renamed or
 * renumbered in the constant without the wire changing would be invisible to any test
 * that read the number back out of the constant itself.
 */
test('WA_VIDEO_STATE is the wire ordinal, name by name', () => {
    assert.deepEqual(
        { ...WA_VIDEO_STATE },
        {
            Disabled: 0,
            Enabled: 1,
            Paused: 2,
            UpgradeRequest: 3,
            UpgradeAccept: 4,
            UpgradeReject: 5,
            Stopped: 6,
            UpgradeRejectByTimeout: 7,
            UpgradeCancel: 8,
            UpgradeCancelByTimeout: 9,
            UnknownPeer: 10,
            UpgradeRequestV2: 11,
            Xr2dCodecAvatarEnabled: 12,
            Error: 20
        }
    )
})

/**
 * A `<video>` this side sends, against the shape captured from the official client:
 * same attribute names, state as a bare decimal, and `dec` on a message the capture
 * did not carry it on - deliberate, since the peer's parser refuses a `<video>` with
 * neither `enc` nor `dec`.
 */
test('buildVideoStateStanza writes the upgrade request as the raw ordinal', () => {
    const node = buildVideoStateStanza(
        '50062877036657:76@lid',
        '00CEAC2144738E0FAADE17F16BCDBA04',
        '184478207058035:1@lid',
        { state: WA_VIDEO_STATE.UpgradeRequestV2, transactionId: 1 }
    )

    assert.equal(node.tag, 'call')
    assert.equal(node.attrs.to, '50062877036657:76@lid')

    const inner = (node.content as BinaryNode[])[0]
    assert.equal(inner.tag, 'video')
    assert.deepEqual(inner.attrs, {
        'call-id': '00CEAC2144738E0FAADE17F16BCDBA04',
        'call-creator': '184478207058035:1@lid',
        state: '11',
        device_orientation: '0',
        dec: 'H264',
        'transaction-id': '1',
        // A real peer answers a request without this with `Error`.
        voip_settings: 'video'
    })
})

/** The upgrade request a group participant sent to the call, attribute by attribute. */
test('the group upgrade request is the video stanza with state 3, sent to the call', () => {
    const callId = '00FFD3D11243F580F2284050F8ACAF2E'
    const node = buildVideoStateStanza(toCallServerJid(callId), callId, '50062877036657:87@lid', {
        state: WA_VIDEO_STATE.UpgradeRequest,
        transactionId: 1
    })

    assert.equal(node.attrs.to, `${callId}@call`)
    const inner = (node.content as BinaryNode[])[0]
    assert.equal(inner.tag, 'video')
    assert.deepEqual(inner.attrs, {
        'call-id': callId,
        'call-creator': '50062877036657:87@lid',
        state: '3',
        device_orientation: '0',
        dec: 'H264',
        voip_settings: 'video',
        'transaction-id': '1'
    })
})

test('only the upgrade request carries voip_settings', () => {
    for (const state of [
        WA_VIDEO_STATE.UpgradeAccept,
        WA_VIDEO_STATE.Enabled,
        WA_VIDEO_STATE.Disabled,
        WA_VIDEO_STATE.UpgradeReject
    ]) {
        const node = buildVideoStateStanza('peer@lid', 'CID', 'creator@lid', {
            state,
            transactionId: 1
        })
        const inner = (node.content as BinaryNode[])[0]
        assert.equal(
            inner.attrs.voip_settings,
            undefined,
            `state ${state} must not ask for a settings profile`
        )
    }

    const grouped = buildVideoStateStanza('peer@lid', 'CID', 'creator@lid', {
        state: WA_VIDEO_STATE.UpgradeRequest,
        transactionId: 1
    })
    assert.equal((grouped.content as BinaryNode[])[0].attrs.voip_settings, 'video')
})

test('buildVideoStateStanza takes the codec and orientation when they are given', () => {
    const node = buildVideoStateStanza('50062877036657:76@lid', 'CID', '184478207058035:1@lid', {
        state: WA_VIDEO_STATE.UpgradeAccept,
        transactionId: 9,
        decoderCodec: 'vp8/h.264',
        deviceOrientation: 3
    })

    const inner = (node.content as BinaryNode[])[0]
    assert.equal(inner.attrs.state, '4')
    assert.equal(inner.attrs.dec, 'vp8/h.264')
    assert.equal(inner.attrs.device_orientation, '3')
    assert.equal(inner.attrs['transaction-id'], '9')
})

/**
 * Round-trip in the direction that matters: what we write, the other side's parser reads
 * back as the same state, against the hand-written numbers above.
 */
test('a built video state parses back to the state it was given', () => {
    for (const state of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 20]) {
        const node = buildVideoStateStanza('peer@lid', 'CID', 'creator@lid', {
            state,
            transactionId: 1
        })
        const inner = (node.content as BinaryNode[])[0]
        assert.equal(parseVideoStateNode(inner)?.state, state)
    }
})
