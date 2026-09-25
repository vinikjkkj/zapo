import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import { type PeerScreenShare, WA_SCREEN_SHARE_STATE } from '../../signaling/screen-share.js'
import { CallMediaType, type WaVoipDeps } from '../../types.js'
import { CallInfo } from '../call-state.js'
import { WaCallMediaSession, type WaCallMediaSessionDelegate } from '../WaCallMediaSession.js'

const ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const PEER_JID = 'peer:0@lid'

interface Harness {
    readonly session: WaCallMediaSession
    readonly call: CallInfo
    readonly shares: PeerScreenShare[]
    readonly states: number
    readonly sent: BinaryNode[]
}

/**
 * A session whose only wired dependency is the node sender, so what the screen-share
 * path puts on the wire is visible in `sent` and what it does not is visible by its
 * absence. `mediaType` decides whether the call has a video stream for a share to
 * travel on; `sendNode` replaces the capture when a test needs the send to fail.
 */
function createHarness(
    mediaType: CallMediaType = CallMediaType.Video,
    sendNode?: (node: BinaryNode) => Promise<void>
): Harness {
    const shares: PeerScreenShare[] = []
    const sent: BinaryNode[] = []
    const counters = { states: 0 }
    const call = CallInfo.newIncoming(ID, PEER_JID, PEER_JID, undefined, mediaType)

    const session = new WaCallMediaSession({
        deps: {
            lowLevelCoordinator: {
                sendNode:
                    sendNode ??
                    (async (node: BinaryNode) => {
                        sent.push(node)
                    })
            }
        } as unknown as WaVoipDeps,
        logger: createNoopLogger(),
        info: call,
        delegate: {
            emitState: () => {
                counters.states++
            },
            emitIncoming: () => {},
            emitEnded: () => {},
            emitInboundAudio: () => {},
            emitInboundVideoRtp: () => {},
            emitInboundVideo: () => {},
            emitPeerMute: () => {},
            emitHandRaise: () => {},
            emitPeerVideoState: () => {},
            emitScreenShare: (_call, share) => {
                shares.push(share)
            },
            emitOutboundAudioFinished: () => {}
        } satisfies WaCallMediaSessionDelegate
    })

    return {
        session,
        call,
        shares,
        sent,
        get states() {
            return counters.states
        }
    }
}

/** Drives an incoming call up to the state the in-call actions need. */
function activate(call: CallInfo): void {
    call.applyTransition({ type: 'local_accepted' })
    call.applyTransition({ type: 'media_connected' })
}

/** The one payload child of a stanza the session sent. */
function payload(stanza: BinaryNode): BinaryNode {
    return (stanza.content as BinaryNode[])[0]
}

function screenShareStanza(attrs: Record<string, string>, tag = 'screen_share'): BinaryNode {
    return {
        tag: 'call',
        attrs: { from: 'peer:0@lid', id: 'STANZAID' },
        content: [{ tag, attrs: { 'call-id': ID, ...attrs }, content: undefined }]
    }
}

test('a screen share starting reaches the call and the delegate', (t) => {
    const harness = createHarness()
    t.after(() => harness.session.cleanup())

    harness.session.handleCallScreenShare(
        screenShareStanza({ screenshare_state: '1', version: '3', 'request-state': '1' })
    )

    assert.equal(harness.shares.length, 1)
    assert.deepEqual(harness.shares[0], {
        state: 1,
        requestState: 1,
        version: 3,
        screenWidth: null,
        screenHeight: null,
        deviceOrientation: null
    })
    assert.deepEqual(harness.call.peerScreenShare, harness.shares[0])
    assert.equal(harness.states, 1)
})

test('the screen payload updates the same call state', (t) => {
    const harness = createHarness()
    t.after(() => harness.session.cleanup())

    harness.session.handleCallScreenShare(
        screenShareStanza(
            { screenshare_state: '1', version: '3', screen_width: '2560', screen_height: '1440' },
            'screen'
        )
    )

    assert.equal(harness.call.peerScreenShare?.screenWidth, 2560)
    assert.equal(harness.call.peerScreenShare?.screenHeight, 1440)
})

test('a later state replaces the one before it', (t) => {
    const harness = createHarness()
    t.after(() => harness.session.cleanup())

    harness.session.handleCallScreenShare(
        screenShareStanza({ screenshare_state: '1', version: '3' })
    )
    harness.session.handleCallScreenShare(
        screenShareStanza({ screenshare_state: '2', version: '3' })
    )

    assert.equal(harness.shares.length, 2)
    assert.equal(harness.call.peerScreenShare?.state, 2)
})

test('a stanza with no state changes nothing and emits nothing', (t) => {
    const harness = createHarness()
    t.after(() => harness.session.cleanup())

    harness.session.handleCallScreenShare(screenShareStanza({ version: '3' }))

    assert.equal(harness.shares.length, 0)
    assert.equal(harness.states, 0)
    assert.equal(harness.call.peerScreenShare, undefined)
})

test('a call stanza with no payload child is ignored', (t) => {
    const harness = createHarness()
    t.after(() => harness.session.cleanup())

    harness.session.handleCallScreenShare({
        tag: 'call',
        attrs: { from: 'peer:0@lid', id: 'STANZAID' },
        content: undefined
    })

    assert.equal(harness.shares.length, 0)
    assert.equal(harness.call.peerScreenShare, undefined)
})

test('reading a screen share puts nothing back on the wire', (t) => {
    const harness = createHarness()
    t.after(() => harness.session.cleanup())

    harness.session.handleCallScreenShare(
        screenShareStanza({ screenshare_state: '1', version: '3' })
    )

    assert.deepEqual(harness.sent, [])
})

test('starting a share announces it with one stanza', async (t) => {
    const harness = createHarness()
    t.after(() => harness.session.cleanup())
    activate(harness.call)

    await harness.session.setScreenShare(true)

    // Transcribed from a capture of the reference client sharing: one
    // self-closed node, these four attributes, and nothing beside it.
    assert.equal(harness.sent.length, 1)
    assert.equal(harness.sent[0].attrs.to, PEER_JID)
    assert.deepEqual(payload(harness.sent[0]), {
        tag: 'screen_share',
        attrs: {
            'call-id': ID,
            'call-creator': PEER_JID,
            screenshare_state: '1',
            version: '2'
        }
    })

    assert.equal(harness.call.stateData.screenSharing, true)
    assert.equal(harness.states, 1)
})

test('stopping a share announces the stop and clears the local state', async (t) => {
    const harness = createHarness()
    t.after(() => harness.session.cleanup())
    activate(harness.call)

    await harness.session.setScreenShare(true)
    await harness.session.setScreenShare(false)

    assert.equal(harness.sent.length, 2)
    assert.equal(
        payload(harness.sent[1]).attrs.screenshare_state,
        String(WA_SCREEN_SHARE_STATE.Stopped)
    )
    assert.equal(harness.call.stateData.screenSharing, false)
})

test('announcing the state already in force sends nothing', async (t) => {
    const harness = createHarness()
    t.after(() => harness.session.cleanup())
    activate(harness.call)

    await harness.session.setScreenShare(false)
    await harness.session.setScreenShare(true)
    await harness.session.setScreenShare(true)

    assert.equal(harness.sent.length, 1)
    assert.equal(harness.states, 1)
})

test('a share on a call that is not active is a no-op', async (t) => {
    const harness = createHarness()
    t.after(() => harness.session.cleanup())

    await harness.session.setScreenShare(true)

    assert.deepEqual(harness.sent, [])
    assert.equal(harness.call.stateData.screenSharing, false)
})

/**
 * The screen travels on the call's video stream, so a voice call has nothing to carry
 * it: the upgrade comes first, and the refusal beats an announcement whose picture
 * could never arrive.
 */
test('a share on a call with no video is refused and announces nothing', async (t) => {
    const harness = createHarness(CallMediaType.Audio)
    t.after(() => harness.session.cleanup())
    activate(harness.call)

    await assert.rejects(() => harness.session.setScreenShare(true), /carries no video/)

    assert.deepEqual(harness.sent, [])
    assert.equal(harness.call.stateData.screenSharing, false)
})

/** The peer's own handler refuses a share in a group call outright. */
test('a share on a group call is refused and announces nothing', async (t) => {
    const harness = createHarness()
    t.after(() => harness.session.cleanup())
    activate(harness.call)
    harness.call.groupJid = '120363000000000000@g.us'

    await assert.rejects(() => harness.session.setScreenShare(true), /group call/)

    assert.deepEqual(harness.sent, [])
    assert.equal(harness.call.stateData.screenSharing, false)
})

/**
 * The local state moves after the request, never before it: a peer that never
 * heard the request must not be believed to be rendering a share.
 */
test('a failed request leaves the local state where it was', async (t) => {
    const harness = createHarness(CallMediaType.Video, async () => {
        throw new Error('socket closed')
    })
    t.after(() => harness.session.cleanup())
    activate(harness.call)

    await assert.rejects(() => harness.session.setScreenShare(true), /socket closed/)

    assert.equal(harness.call.stateData.screenSharing, false)
    assert.equal(harness.states, 0)
})
