import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import { CallMediaType, type WaVoipDeps } from '../../types.js'
import { CallInfo } from '../call-state.js'
import { WaCallMediaSession, type WaCallMediaSessionDelegate } from '../WaCallMediaSession.js'

const ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const PEER_JID = '50062877036657:76@lid'
const SELF_JID = '184478207058035:1@lid'
/** Another device of this same account, whose hand is not a participant's. */
const SELF_OTHER_DEVICE_JID = '184478207058035:2@lid'

/**
 * Local memory bound on tracked raised hands, written out rather than imported so
 * the assertion states the limit instead of restating whatever the session compiles.
 */
const MAX_TRACKED_RAISED_HANDS = 32

interface HandRaiseObservation {
    readonly participantJid: string
    readonly raised: boolean
}

interface HandRaiseHarness {
    readonly session: WaCallMediaSession
    readonly sent: BinaryNode[]
    readonly handRaises: HandRaiseObservation[]
    readonly states: CallInfo[]
}

/** An active call whose signalling is captured instead of sent. */
function createSession(sendNode?: (node: BinaryNode) => Promise<void>): HandRaiseHarness {
    const sent: BinaryNode[] = []
    const handRaises: HandRaiseObservation[] = []
    const states: CallInfo[] = []

    const call = CallInfo.newOutgoing(ID, PEER_JID, SELF_JID, CallMediaType.Audio)
    const session = new WaCallMediaSession({
        deps: {
            authClient: {
                getCurrentCredentials: () => ({ meJid: SELF_JID, meLid: SELF_JID })
            },
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
            emitState: (info) => {
                states.push(info)
            },
            emitIncoming: () => {},
            emitEnded: () => {},
            emitInboundAudio: () => {},
            emitInboundVideoRtp: () => {},
            emitInboundVideo: () => {},
            emitOutboundAudioFinished: () => {},
            emitPeerMute: () => {},
            emitScreenShare: () => {},
            emitPeerVideoState: () => {},
            emitHandRaise: (_info, participantJid, raised) => {
                handRaises.push({ participantJid, raised })
            }
        } satisfies WaCallMediaSessionDelegate
    })

    ;(session as unknown as { sctpRelay: { cleanup: () => void } }).sctpRelay = {
        cleanup: () => {}
    }

    return { session, sent, handRaises, states }
}

function activate(session: WaCallMediaSession): void {
    session.info.applyTransition({ type: 'offer_sent' })
    session.info.applyTransition({ type: 'remote_accepted' })
    session.info.applyTransition({ type: 'media_connected' })
}

/** Incoming `<call>` carrying one raise-hand `<user_action>`. */
function incomingRaiseHand(state: string): BinaryNode {
    return {
        tag: 'call',
        attrs: { from: PEER_JID, id: 'STANZA1' },
        content: [
            {
                tag: 'user_action',
                attrs: { 'call-id': ID, 'call-creator': SELF_JID, action: 'raise_hand' },
                content: [{ tag: 'raise_hand', attrs: { 'raise-hand-state': state } }]
            }
        ]
    }
}

/**
 * Incoming `<call>` carrying the older top-level `<raise_hand>`, the shape a peer
 * sends with its sender gate off. Written out rather than derived from the one above,
 * since the point is that they differ.
 */
function incomingLegacyRaiseHand(state: string): BinaryNode {
    return {
        tag: 'call',
        attrs: { from: PEER_JID, id: 'STANZA9' },
        content: [
            {
                tag: 'raise_hand',
                attrs: {
                    'call-id': ID,
                    'call-creator': SELF_JID,
                    'raise-hand-state': state,
                    broadcast: '1'
                },
                content: undefined
            }
        ]
    }
}

test('setHandRaised announces the raised hand to the peer device', async () => {
    const { session, sent, states } = createSession()
    activate(session)

    await session.setHandRaised(true)

    assert.equal(sent.length, 1)
    assert.equal(sent[0].tag, 'call')
    assert.equal(sent[0].attrs.to, PEER_JID)
    assert.deepEqual((sent[0].content as BinaryNode[])[0], {
        tag: 'user_action',
        attrs: { 'call-id': ID, 'call-creator': SELF_JID, action: 'raise_hand' },
        content: [{ tag: 'raise_hand', attrs: { 'raise-hand-state': '1' } }]
    })

    assert.equal(session.info.stateData.handRaised, true)
    assert.equal(states.length, 1)
})

test('setHandRaised is idempotent and lowers with state 0', async () => {
    const { session, sent } = createSession()
    activate(session)

    await session.setHandRaised(true)
    await session.setHandRaised(true)
    assert.equal(sent.length, 1)

    await session.setHandRaised(false)
    assert.equal(sent.length, 2)
    const lowered = (sent[1].content as BinaryNode[])[0].content as BinaryNode[]
    assert.equal(lowered[0].attrs['raise-hand-state'], '0')
    assert.equal(session.info.stateData.handRaised, false)
})

test('setHandRaised sends nothing before the call is active', async () => {
    const { session, sent } = createSession()

    await session.setHandRaised(true)

    assert.equal(sent.length, 0)
    assert.equal(session.info.stateData.handRaised, false)
})

test('a failed announcement leaves the local hand down and rethrows', async () => {
    const failure = new Error('socket closed')
    const { session, states } = createSession(async () => {
        throw failure
    })
    activate(session)

    await assert.rejects(() => session.setHandRaised(true), failure)

    assert.equal(session.info.stateData.handRaised, false)
    assert.equal(states.length, 0)
})

test('an incoming raise hand is durable state, reported once per change', () => {
    const { session, handRaises } = createSession()
    activate(session)

    session.handleCallUserAction(incomingRaiseHand('1'), PEER_JID)
    assert.deepEqual(handRaises, [{ participantJid: PEER_JID, raised: true }])
    assert.equal(session.info.raisedHands.has(PEER_JID), true)

    session.handleCallUserAction(incomingRaiseHand('1'), PEER_JID)
    assert.equal(handRaises.length, 1)

    session.handleCallUserAction(incomingRaiseHand('0'), PEER_JID)
    assert.deepEqual(handRaises[1], { participantJid: PEER_JID, raised: false })
    assert.equal(session.info.raisedHands.has(PEER_JID), false)
})

test('the legacy raise_hand stanza reaches the same state and event', () => {
    const { session, handRaises } = createSession()
    activate(session)

    session.handleCallRaiseHand(incomingLegacyRaiseHand('1'), PEER_JID)
    assert.deepEqual(handRaises, [{ participantJid: PEER_JID, raised: true }])
    assert.equal(session.info.raisedHands.has(PEER_JID), true)

    session.handleCallRaiseHand(incomingLegacyRaiseHand('0'), PEER_JID)
    assert.deepEqual(handRaises[1], { participantJid: PEER_JID, raised: false })
    assert.equal(session.info.raisedHands.has(PEER_JID), false)
})

test('both message types drive one durable state per participant', () => {
    const { session, handRaises } = createSession()
    activate(session)

    // A peer may switch shapes mid-call, and the state is the participant's,
    // not the message type's: the second stanza is a no-op and the third lowers
    // a hand the other shape raised.
    session.handleCallRaiseHand(incomingLegacyRaiseHand('1'), PEER_JID)
    session.handleCallUserAction(incomingRaiseHand('1'), PEER_JID)
    assert.equal(handRaises.length, 1)

    session.handleCallUserAction(incomingRaiseHand('0'), PEER_JID)
    assert.deepEqual(handRaises, [
        { participantJid: PEER_JID, raised: true },
        { participantJid: PEER_JID, raised: false }
    ])
    assert.equal(session.info.raisedHands.size, 0)
})

test('a user_action carrying another action changes nothing', () => {
    const { session, handRaises } = createSession()
    activate(session)

    session.handleCallUserAction(
        {
            tag: 'call',
            attrs: { from: PEER_JID, id: 'STANZA2' },
            content: [
                {
                    tag: 'user_action',
                    attrs: { 'call-id': ID, action: 'attribution' },
                    content: [{ tag: 'attribution', attrs: { wearable: '1' }, content: undefined }]
                }
            ]
        },
        PEER_JID
    )

    assert.deepEqual(handRaises, [])
    assert.equal(session.info.raisedHands.size, 0)
})

test('raised-hand tracking stops growing at its bound', () => {
    const { session, handRaises } = createSession()
    activate(session)

    for (let index = 0; index < MAX_TRACKED_RAISED_HANDS; index++) {
        session.handleCallUserAction(incomingRaiseHand('1'), `1000000000${index}:1@lid`)
    }
    assert.equal(session.info.raisedHands.size, MAX_TRACKED_RAISED_HANDS)
    assert.equal(handRaises.length, MAX_TRACKED_RAISED_HANDS)

    session.handleCallUserAction(incomingRaiseHand('1'), 'overflow:1@lid')
    assert.equal(session.info.raisedHands.size, MAX_TRACKED_RAISED_HANDS)
    assert.equal(handRaises.length, MAX_TRACKED_RAISED_HANDS)
})

/**
 * The announcement reaches every device of the account, so this side sees its own hand come
 * back. Taken as a participant's it lists this account among the remote hands; `<mute_v2>`
 * drops the same echo, and the local hand is `stateData.handRaised`.
 */
test('a hand announced by another device of this account is not a participant hand', () => {
    const { session, handRaises } = createSession()
    activate(session)

    session.handleCallUserAction(incomingRaiseHand('1'), SELF_OTHER_DEVICE_JID)
    session.handleCallRaiseHand(incomingLegacyRaiseHand('1'), SELF_OTHER_DEVICE_JID)

    assert.equal(session.info.raisedHands.size, 0)
    assert.equal(handRaises.length, 0)
    assert.equal(session.info.stateData.handRaised, false)

    session.handleCallUserAction(incomingRaiseHand('1'), PEER_JID)

    assert.deepEqual([...session.info.raisedHands], [PEER_JID])
})
