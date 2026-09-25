import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { CallState, EndCallReason, type WaVoipDeps, type WaVoipStores } from '../../types.js'
import {
    buildAcceptStanza,
    buildMuteV2Stanza,
    buildOfferStanza,
    buildRaiseHandStanza,
    buildRejectStanza,
    buildRelaylatencyForwardStanza,
    buildTerminateStanza,
    buildVideoStateStanza,
    extractNodeInfo,
    extractRelayEndpoints,
    generateCallId,
    generateCallStanzaId,
    needsDecryption,
    parseMuteV2,
    parseRaiseHandState,
    parseVideoStateNode,
    WA_VIDEO_STATE
} from '../signaling.js'

test('generateCallId / generateCallStanzaId produce 32-char uppercase hex', () => {
    for (const id of [generateCallId(), generateCallStanzaId()]) {
        assert.match(id, /^[0-9A-F]{32}$/)
    }
})

test('buildTerminateStanza targets the peer device JID with a terminate payload', () => {
    const node = buildTerminateStanza('12345:7@s.whatsapp.net', 'CALLID', '12345@s.whatsapp.net')
    assert.equal(node.tag, 'call')
    assert.equal(node.attrs.to, '12345:7@s.whatsapp.net')
    const inner = (
        node.content as unknown as Array<{ tag: string; attrs: Record<string, string> }>
    )[0]
    assert.equal(inner.tag, 'terminate')
    assert.equal(inner.attrs['call-id'], 'CALLID')
})

test('buildRejectStanza emits a reject payload', () => {
    const node = buildRejectStanza('12345@lid', 'CALLID', '12345@lid')
    const inner = (node.content as unknown as Array<{ tag: string }>)[0]
    assert.equal(inner.tag, 'reject')
})

const CALLER_DEVICE_JID = '50062877036657:76@lid'

function createAcceptDeps(): WaVoipDeps {
    return {
        authClient: {
            getCurrentCredentials: () => ({
                meJid: '1111111111@lid',
                meLid: '1111111111@lid',
                signedIdentity: { details: new Uint8Array([1, 2, 3]) }
            })
        },
        signalProtocol: {
            encryptMessage: async () => ({
                type: 'pkmsg',
                ciphertext: new Uint8Array([1, 2, 3])
            })
        },
        messageDispatch: {
            syncSignalSession: async () => undefined
        }
    } as unknown as WaVoipDeps
}

async function buildAccept(isVideo = false): Promise<BinaryNode> {
    return buildAcceptStanza(
        createAcceptDeps(),
        'CALLID',
        CALLER_DEVICE_JID,
        CALLER_DEVICE_JID,
        isVideo
    )
}

test('buildAcceptStanza ships no enc and no device-identity', async () => {
    const accept = ((await buildAccept()).content as BinaryNode[])[0]
    assert.equal(accept.tag, 'accept')

    const tags = (accept.content as BinaryNode[]).map((child) => child.tag)
    assert.equal(tags.includes('enc'), false)
    assert.equal(tags.includes('device-identity'), false)
})

test('buildAcceptStanza matches the acked accept: audio and net only', async () => {
    const accept = ((await buildAccept()).content as BinaryNode[])[0]
    const children = accept.content as BinaryNode[]

    const audio = children.find((child) => child.tag === 'audio')
    assert.deepEqual(audio?.attrs, { enc: 'opus', rate: '16000' })

    const net = children.find((child) => child.tag === 'net')
    assert.equal(net?.attrs.medium, '3')

    const tags = children.map((child) => child.tag)
    assert.equal(tags.includes('encopt'), false)
    assert.equal(tags.includes('enc'), false)
    assert.equal(tags.includes('device-identity'), false)
    assert.deepEqual(tags, ['audio', 'net'])
})

test('buildAcceptStanza addresses the caller device jid with its suffix', async () => {
    const node = await buildAccept()
    assert.equal(node.attrs.to, CALLER_DEVICE_JID)

    const accept = (node.content as BinaryNode[])[0]
    assert.equal(accept.attrs['call-id'], 'CALLID')
    assert.equal(accept.attrs['call-creator'], CALLER_DEVICE_JID)
})

test('buildAcceptStanza advertises h.264 on a video accept', async () => {
    const accept = ((await buildAccept(true)).content as BinaryNode[])[0]
    const video = (accept.content as BinaryNode[]).find((child) => child.tag === 'video')
    assert.equal(video?.attrs.enc, 'h.264')
})

function createOfferDeps(): WaVoipDeps {
    return {
        authClient: {
            getCurrentCredentials: () => ({
                meJid: '1111111111@lid',
                meLid: '1111111111@lid',
                signedIdentity: { details: new Uint8Array([1, 2, 3]) }
            })
        },
        signalDeviceSync: {
            syncDeviceList: async () => [{ deviceJids: [CALLER_DEVICE_JID] }]
        },
        sessionResolver: {
            ensureSessionsBatch: async (devices: string[]) =>
                devices.map((jid) => ({ address: jid, session: {} }))
        },
        signalProtocol: {
            encryptMessagesBatch: async (entries: unknown[]) =>
                entries.map(() => ({
                    type: 'pkmsg',
                    ciphertext: new Uint8Array([1, 2, 3])
                }))
        }
    } as unknown as WaVoipDeps
}

function createOfferStores(): WaVoipStores {
    return {
        privacyToken: {
            getByJid: async () => undefined
        }
    } as unknown as WaVoipStores
}

async function buildOffer(isVideo: boolean): Promise<BinaryNode> {
    return buildOfferStanza(
        createOfferDeps(),
        createOfferStores(),
        'CALLID',
        new Uint8Array([9, 9, 9]),
        CALLER_DEVICE_JID,
        isVideo
    )
}

test('buildAcceptStanza advertises the same dec as buildOfferStanza on a video call', async () => {
    const offer = ((await buildOffer(true)).content as BinaryNode[])[0]
    const offerVideo = (offer.content as BinaryNode[]).find((child) => child.tag === 'video')

    const accept = ((await buildAccept(true)).content as BinaryNode[])[0]
    const acceptVideo = (accept.content as BinaryNode[]).find((child) => child.tag === 'video')

    assert.ok(offerVideo?.attrs.dec, 'offer video node is missing dec')
    assert.ok(acceptVideo?.attrs.dec, 'accept video node is missing dec')
    assert.equal(acceptVideo?.attrs.dec, offerVideo?.attrs.dec)
    assert.equal(acceptVideo?.attrs.enc, offerVideo?.attrs.enc)
})

test('needsDecryption only flags encrypted payload tags', () => {
    assert.equal(needsDecryption('accept'), true)
    assert.equal(needsDecryption('preaccept'), true)
    assert.equal(needsDecryption('offer'), false)
    assert.equal(needsDecryption('terminate'), false)
})

test('enums expose the documented call states', () => {
    assert.equal(CallState.Active, 'active')
    assert.equal(EndCallReason.UserEnded, 'user_ended')
})

test('buildTerminateStanza includes reason and duration attributes', () => {
    const node = buildTerminateStanza('p:0@lid', 'CID', 'creator@lid', 1500, 'accepted_elsewhere')
    const inner = (node.content as BinaryNode[])[0]
    assert.equal(inner.attrs.reason, 'accepted_elsewhere')
    assert.equal(inner.attrs.duration, '1500')
    assert.equal(inner.attrs.audio_duration, '1500')
})

test('buildRelaylatencyForwardStanza wraps te nodes and destinations under the user jid', () => {
    const teNodes: BinaryNode[] = [{ tag: 'te', attrs: { latency: '1' }, content: undefined }]
    const node = buildRelaylatencyForwardStanza(
        '12345:7@s.whatsapp.net',
        'CID',
        'creator@lid',
        teNodes,
        ['a@lid', 'b@lid']
    )

    assert.equal(node.tag, 'call')
    assert.equal(node.attrs.to, '12345@s.whatsapp.net')

    const relaylatency = (node.content as BinaryNode[])[0]
    assert.equal(relaylatency.tag, 'relaylatency')
    assert.equal(relaylatency.attrs['call-id'], 'CID')

    const children = relaylatency.content as BinaryNode[]
    assert.equal(children[0].tag, 'te')
    const destination = children[children.length - 1]
    assert.equal(destination.tag, 'destination')
    assert.deepEqual(
        (destination.content as BinaryNode[]).map((child) => child.attrs.jid),
        ['a@lid', 'b@lid']
    )
})

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

test('extractNodeInfo reads the inner call tag and ids', () => {
    const node: BinaryNode = {
        tag: 'call',
        attrs: { from: 'peer:0@lid', platform: 'web', version: '2.3' },
        content: [{ tag: 'offer', attrs: { 'call-id': 'CID' }, content: undefined }]
    }
    const info = extractNodeInfo(node)
    assert.ok(info)
    assert.equal(info.tag, 'offer')
    assert.equal(info.callId, 'CID')
    assert.equal(info.peerJid, 'peer:0@lid')
    assert.equal(info.peerPlatform, 'web')
})

test('extractNodeInfo returns null when there is no inner node', () => {
    assert.equal(extractNodeInfo({ tag: 'call', attrs: {}, content: undefined }), null)
})

test('extractRelayEndpoints collects direct and wrapped relays sorted by rtt', () => {
    const node: BinaryNode = {
        tag: 'transport',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: { ip: '1.1.1.1', port: '3480', token: 't1', 'c2r-rtt': '50' },
                content: undefined
            },
            {
                tag: 'relays',
                attrs: {},
                content: [
                    {
                        tag: 'relay',
                        attrs: { ip: '2.2.2.2', port: '3481', token: 't2', 'c2r-rtt': '10' },
                        content: undefined
                    }
                ]
            }
        ]
    }

    const relays = extractRelayEndpoints(node)
    assert.equal(relays.length, 2)
    assert.equal(relays[0].ip, '2.2.2.2')
    assert.equal(relays[0].port, 3481)
    assert.equal(relays[1].ip, '1.1.1.1')
})

test('extractRelayEndpoints drops relays missing ip or token', () => {
    const node: BinaryNode = {
        tag: 'transport',
        attrs: {},
        content: [
            { tag: 'relay', attrs: { ip: '1.1.1.1' }, content: undefined },
            { tag: 'relay', attrs: { token: 'only-token' }, content: undefined }
        ]
    }
    assert.deepEqual(extractRelayEndpoints(node), [])
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
        isRequest: false
    })
    assert.deepEqual(parseMuteV2({ tag: 'mute_v2', attrs: { 'mute-state': '0' } }), {
        muted: false,
        isRequest: false
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
