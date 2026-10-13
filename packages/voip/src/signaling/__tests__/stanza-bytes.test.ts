import assert from 'node:assert/strict'
import { test } from 'node:test'

import { type BinaryNode, encodeBinaryNode } from 'zapo-js/transport'
import { bytesToHex } from 'zapo-js/util'

import type { WaVoipDeps, WaVoipStores } from '../../types.js'
import { buildScreenShareStanza } from '../screen-share.js'
import {
    buildAcceptReceiptStanza,
    buildAcceptStanza,
    buildEncRekeyReceiptStanza,
    buildEncRekeyStanza,
    buildGroupOfferStanza,
    buildHeartbeatStanza,
    buildMuteRequestStanza,
    buildMuteV2Stanza,
    buildOfferStanza,
    buildPeerStateStanza,
    buildPreacceptStanza,
    buildRaiseHandStanza,
    buildRejectStanza,
    buildRelayLatencyStanza,
    buildTerminateStanza,
    buildTransportStanza,
    buildVideoStateStanza,
    WA_PEER_STATE,
    WA_VIDEO_STATE
} from '../signaling.js'

const CALL_ID = 'A1B2C3D4E5F60718293A4B5C6D7E8F90'
const ME = '1111111111:3@lid'
const PEER = '50062877036657:76@lid'

function createDeps(): WaVoipDeps {
    return {
        authClient: {
            getCurrentCredentials: () => ({
                meJid: '5511999999999@s.whatsapp.net',
                meLid: ME,
                signedIdentity: { details: new Uint8Array([1, 2, 3]) }
            })
        },
        signalDeviceSync: {
            syncDeviceList: async () => [{ jid: PEER, deviceJids: [PEER, '50062877036657@lid'] }]
        },
        sessionResolver: {
            ensureSessionsBatch: async (devices: string[]) =>
                devices.map((jid) => ({ address: jid, session: {} }))
        },
        signalProtocol: {
            encryptMessagesBatch: async (entries: unknown[]) =>
                entries.map((_, index) => ({
                    type: index === 0 ? 'pkmsg' : 'msg',
                    ciphertext: new Uint8Array([index, 1, 2, 3])
                }))
        },
        messageDispatch: { syncSignalSession: async () => undefined }
    } as unknown as WaVoipDeps
}

function createStores(tcToken?: Uint8Array): WaVoipStores {
    return {
        privacyToken: { getByJid: async () => (tcToken ? { tcToken } : undefined) }
    } as unknown as WaVoipStores
}

/** Serialises a stanza with its random `id` pinned, attribute order untouched. */
function wireHex(node: BinaryNode): string {
    const attrs = node.attrs.id === undefined ? node.attrs : { ...node.attrs, id: 'ID' }
    return bytesToHex(encodeBinaryNode({ ...node, attrs }))
}

const CASES: Readonly<Record<string, () => BinaryNode | Promise<BinaryNode>>> = {
    videoStateEnabled: () =>
        buildVideoStateStanza(PEER, CALL_ID, ME, {
            state: WA_VIDEO_STATE.Enabled,
            transactionId: 2
        }),
    videoStateUpgradeRequest: () =>
        buildVideoStateStanza(`${CALL_ID}@call`, CALL_ID, ME, {
            state: WA_VIDEO_STATE.UpgradeRequest,
            transactionId: 1,
            decoderCodec: 'VP8',
            deviceOrientation: 1
        }),
    videoStateUpgradeRequestV2: () =>
        buildVideoStateStanza(PEER, CALL_ID, ME, {
            state: WA_VIDEO_STATE.UpgradeRequestV2,
            transactionId: 3
        }),
    offerAudio: () =>
        buildOfferStanza(createDeps(), createStores(), CALL_ID, new Uint8Array(32), PEER, false),
    offerVideoTcToken: () =>
        buildOfferStanza(
            createDeps(),
            createStores(new Uint8Array([7, 7])),
            CALL_ID,
            new Uint8Array(32),
            PEER,
            true
        ),
    groupOfferAudio: async () =>
        (
            await buildGroupOfferStanza(
                createDeps(),
                CALL_ID,
                '120363000000000000@g.us',
                [{ jid: '184478207058035@lid', devices: ['184478207058035:1@lid'] }, { jid: PEER }],
                false
            )
        ).node,
    groupOfferVideo: async () =>
        (
            await buildGroupOfferStanza(
                createDeps(),
                CALL_ID,
                '120363000000000000@g.us',
                [{ jid: '184478207058035@lid', devices: ['184478207058035@lid'] }],
                true
            )
        ).node,
    encRekey: () =>
        buildEncRekeyStanza(createDeps(), {
            callId: CALL_ID,
            callCreator: ME,
            transactionId: 5,
            peerDeviceJid: PEER,
            callKey: new Uint8Array(32)
        }),
    acceptAudio: () => buildAcceptStanza(createDeps(), CALL_ID, PEER, PEER, false),
    acceptVideo: () => buildAcceptStanza(createDeps(), CALL_ID, PEER, PEER, true),
    acceptGroupVideo: () => buildAcceptStanza(createDeps(), CALL_ID, PEER, PEER, true, true),
    terminate: () => buildTerminateStanza(PEER, CALL_ID, ME),
    terminateDurationReason: () =>
        buildTerminateStanza(`${CALL_ID}@call`, CALL_ID, ME, 12_345.6, 'setup_failed'),
    reject: () => buildRejectStanza(PEER, CALL_ID, PEER),
    rejectGroup: () => buildRejectStanza(PEER, CALL_ID, PEER, true),
    preaccept: () => buildPreacceptStanza(PEER, CALL_ID, PEER),
    preacceptGroup: () => buildPreacceptStanza(PEER, CALL_ID, PEER, true),
    relayLatency: () =>
        buildRelayLatencyStanza(
            PEER,
            CALL_ID,
            ME,
            [
                { relayName: 'gru1c02', latency: 31, addressBytes: new Uint8Array([1, 2, 3, 4]) },
                { relayName: 'gru1c02', latency: 40 },
                { relayName: 'for1c01', latency: 0 }
            ],
            [PEER, '50062877036657@lid']
        ),
    relayLatencyNoDestination: () =>
        buildRelayLatencyStanza(PEER, CALL_ID, ME, [{ relayName: 'gru1c02', latency: 12 }], []),
    transport: () => buildTransportStanza('50062877036657@lid', CALL_ID, ME),
    transportAccept: () => buildTransportStanza(PEER, CALL_ID, ME, '1', '1'),
    muteV2: () => buildMuteV2Stanza(PEER, CALL_ID, ME, true),
    unmuteV2: () => buildMuteV2Stanza(PEER, CALL_ID, ME, false),
    heartbeat: () => buildHeartbeatStanza(CALL_ID, ME),
    peerState: () =>
        buildPeerStateStanza(CALL_ID, ME, PEER, WA_PEER_STATE.Invisible, 1_760_000_000_123.4),
    muteRequest: () => buildMuteRequestStanza(PEER, CALL_ID, ME),
    raiseHand: () => buildRaiseHandStanza(PEER, CALL_ID, ME, true),
    lowerHandBroadcast: () => buildRaiseHandStanza(PEER, CALL_ID, ME, false, true),
    screenShare: () => buildScreenShareStanza(PEER, CALL_ID, ME, 1),
    screenShareWithId: () => buildScreenShareStanza(PEER, CALL_ID, ME, 2, 4),
    acceptReceipt: () => buildAcceptReceiptStanza(PEER, 'MSGID', CALL_ID, PEER, ME),
    encRekeyReceipt: () => buildEncRekeyReceiptStanza(PEER, 'MSGID', CALL_ID, PEER, ME)
}

/** The pinned wire bytes of each case: a change here is a change on the wire. */
const EXPECTED: Readonly<Record<string, string>> = {
    videoStateEnabled:
        'f8066411f7014cff075006287703665708fc024944f801f80d5968fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111d055c02dec49fc0448323634ec3e45',
    videoStateUpgradeRequest:
        'f8066411fafb10a1b2c3d4e5f60718293a4b5c6d7e8f906408fc024944f801f80f5968fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111d0a2c055ec49fc03565038ec3e55ec0a59',
    videoStateUpgradeRequestV2:
        'f8066411f7014cff075006287703665708fc024944f801f80f5968fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111d0ecdbc02dec49fc0448323634ec3ea2ec0a59',
    offerAudio:
        'f8066411f7014cff075006287703665708fc024944f801f806ec1c68fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111f807f805a11dec1eec1dec87f805a11dec1eec1dff8316000ff803ec68ec24a2f804b4ec2155fc070105f709e4bb07f802eca9f802f804110cf7014cff0750062877036657f801f8081d51450453412dfc0400010203f804110cfaff075006287703665776f801f8081d5145044d412dfc0401010203f803ec15ec1a45f802e6fc050a03010203',
    offerVideoTcToken:
        'f8066411f7014cff075006287703665708fc024944f801f806ec1c68fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111f809f802e2fc020707f805a11dec1eec1dec87f805a11dec1eec1dff8316000ff80b591ded0cec49fc0448323634ec05ee70ebe9c02df803ec68ec24a2f804b4ec2155fc070105f709e0fa03f802eca9f802f804110cf7014cff0750062877036657f801f8081d51450453412dfc0400010203f804110cfaff075006287703665776f801f8081d5145044d412dfc0401010203f803ec15ec1a45f802e6fc050a03010203',
    groupOfferAudio:
        'f8066411fafb10a1b2c3d4e5f60718293a4b5c6d7e8f906408fc024944f801f808ec1c68fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111fc0967726f75702d6a6964faff091203630000000000001cf804f805a11dec1eec1dec87f805a11dec1eec1dff8316000ff803ec68ec24a2f802ecabf803f8040e0cfaff05111111111176f801f8043b0cf70103ff051111111111f801f804b4ec2155fc070105f709e4bb07f8040e0cfaff88184478207058035f76f801f8033b0cf70101ff88184478207058035ff8040e0cfaff075006287703665776f802f8033b0cfaff075006287703665776f8033b0cf7014cff0750062877036657',
    groupOfferVideo:
        'f8066411fafb10a1b2c3d4e5f60718293a4b5c6d7e8f906408fc024944f801f808ec1c68fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111fc0967726f75702d6a6964faff091203630000000000001cf805f805a11dec1eec1dec87f805a11dec1eec1dff8316000ff80b591ded0cec49fc0448323634ec05ee70ebe9c02df803ec68ec24a2f802ecabf802f8040e0cfaff05111111111176f801f8043b0cf70103ff051111111111f801f804b4ec2155fc070105f709e0fa03f8040e0cfaff88184478207058035f76f801f8033b0cfaff88184478207058035f76',
    encRekey:
        'f8066411f7014cff075006287703665708fc024944f801f808edcd68fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111ec3eec79f803f803ec15ec1a45f8081d51450453412dfc0400010203f802e6fc050a03010203',
    acceptAudio:
        'f8066411f7014cff075006287703665708fc024944f801f806ec6268fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f7014cff0750062877036657f802f805a11dec1eec1dff8316000ff803ec68ec24a2',
    acceptVideo:
        'f8066411f7014cff075006287703665708fc024944f801f806ec6268fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f7014cff0750062877036657f803f805a11dec1eec1dff8316000ff803ec68ec24a2f805591ded0cec49fc0448323634',
    acceptGroupVideo:
        'f8066411fafb10a1b2c3d4e5f60718293a4b5c6d7e8f906408fc024944f801f806ec6268fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f7014cff0750062877036657f804f805a11dec1eec1dff8316000ff803ec68ec24a2f805591ded0cec49fc0448323634f803ec15ec1a45',
    terminate:
        'f8066411f7014cff075006287703665708fc024944f801f805d368fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111',
    terminateDurationReason:
        'f8066411fafb10a1b2c3d4e5f60718293a4b5c6d7e8f906408fc024944f801f80bd368fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff05111111111117ff8312345fec55ff8312345fec2efc0c73657475705f6661696c6564',
    reject: 'f8066411f7014cff075006287703665708fc024944f801f805ed0068fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f7014cff0750062877036657',
    rejectGroup:
        'f8066411fafb10a1b2c3d4e5f60718293a4b5c6d7e8f906408fc024944f801f807ed0068fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f7014cff0750062877036657412d',
    preaccept:
        'f8066411f7014cff075006287703665708fc024944f801f806ec1268fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f7014cff0750062877036657f803f805a11dec1eec1dff8316000ff803ec15ec1a45f804b4ec2155fc070105ff09e4bb07',
    preacceptGroup:
        'f8066411fafb10a1b2c3d4e5f60718293a4b5c6d7e8f906408fc024944f801f806ec1268fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f7014cff0750062877036657f803f805a11dec1eec1dff8316000ff803ec15ec1a45f804b4ec2155fc070105ff09e4bb07',
    relayLatency:
        'f8066411faff07500628770366577608fc024944f801f8064968fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111f803f806d793ff0433554463fc0a72656c61795f6e616d65fc0767727531633032fc0401020304f805d793ff0433554432fc0a72656c61795f6e616d65fc07666f7231633031f802eca9f802f803110cf7014cff0750062877036657f803110cfaff075006287703665776',
    relayLatencyNoDestination:
        'f8066411faff07500628770366577608fc024944f801f8064968fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111f801f805d793ff0433554444fc0a72656c61795f6e616d65fc0767727531633032',
    transport:
        'f8066411faff07500628770366577608fc024944f801f80aec2c68fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111fc167472616e73706f72742d6d6573736167652d747970652dfc0e7032702d63616e642d726f756e642df801f805ec68ec2445ec032d',
    transportAccept:
        'f8066411f7014cff075006287703665708fc024944f801f80aec2c68fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111fc167472616e73706f72742d6d6573736167652d7479706555fc0e7032702d63616e642d726f756e6455f801f805ec68ec2445ec032d',
    muteV2: 'f8066411f7014cff075006287703665708fc024944f801f807ecff68fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111ed4f55',
    unmuteV2:
        'f8066411f7014cff075006287703665708fc024944f801f807ecff68fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111ed4f2d',
    heartbeat:
        'f8066411fafb10a1b2c3d4e5f60718293a4b5c6d7e8f906408fc024944f801f805ec0668fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111',
    peerState:
        'f8066411fafb10a1b2c3d4e5f60718293a4b5c6d7e8f906408fc024944f801f808fc0a706565725f737461746568fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff0511111111111aff871760000000123ff801f8050ed0fc09696e76697369626c650cfaff075006287703665776',
    muteRequest:
        'f8066411f7014cff075006287703665708fc024944f801f807ecff68fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111fc0d726571756573742d737461746555',
    raiseHand:
        'f8066411f7014cff075006287703665708fc024944f801f808fc0b757365725f616374696f6e68fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111edd3fc0a72616973655f68616e64f801f803fc0a72616973655f68616e64fc1072616973652d68616e642d737461746555',
    lowerHandBroadcast:
        'f8066411f7014cff075006287703665708fc024944f801f80afc0b757365725f616374696f6e68fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111edd3fc0a72616973655f68616e640d55f801f803fc0a72616973655f68616e64fc1072616973652d68616e642d73746174652d',
    screenShare:
        'f8066411f7014cff075006287703665708fc024944f801f809fc0c73637265656e5f736861726568fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111fc1173637265656e73686172655f7374617465555445',
    screenShareWithId:
        'f8066411f7014cff075006287703665708fc024944f801f80bfc0c73637265656e5f736861726568fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f70103ff051111111111fc1173637265656e73686172655f7374617465455445fc0f73637265656e5f73686172655f6964ec22',
    acceptReceipt:
        'f8080711f7014cff075006287703665708fc02494406f70103ff051111111111f801f805ec6268fb10a1b2c3d4e5f60718293a4b5c6d7e8f9047f7014cff0750062877036657',
    encRekeyReceipt:
        'f8080711f7014cff075006287703665708fc02494406f70103ff051111111111f801f805edcd47f7014cff075006287703665768fb10a1b2c3d4e5f60718293a4b5c6d7e8f90'
}

test('every <call> builder serialises to the pinned wire bytes', async () => {
    const actual: Record<string, string> = {}
    for (const [name, build] of Object.entries(CASES)) {
        actual[name] = wireHex(await build())
    }
    assert.deepEqual(actual, EXPECTED)
})
