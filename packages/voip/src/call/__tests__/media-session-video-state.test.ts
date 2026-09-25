import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import {
    WA_VIDEO_STATE,
    WA_VIDEO_UPGRADE_RESULT,
    WA_VIDEO_UPGRADE_TIMEOUT_MS
} from '../../signaling/signaling.js'
import { CallMediaType, type PeerVideoStateChange, type WaVoipDeps } from '../../types.js'
import { CallInfo } from '../call-state.js'
import { WaCallMediaSession, type WaCallMediaSessionDelegate } from '../WaCallMediaSession.js'

/**
 * Call id and peer device jid of a capture whose SSRCs were read out of the official
 * client's own logs, so the expected values below are copied, not recomputed.
 */
const CALL_ID = '006AFEADB13F4EDFE9D8BA599B10EA96'
const PEER_DEVICE_JID = '50062877036657:76@lid'
const SELF_DEVICE_JID = '184478207058035:1@lid'

/** Audio slot 0 of that device on that call, from the same capture. */
const PEER_AUDIO_MAIN_SSRC = 0x8ffe17b1
/** Video slot 2 of the same device on the same call. */
const PEER_VIDEO_MAIN_SSRC = 0xeb15721e

interface SubscriptionUpdate {
    readonly selfSsrcs: readonly number[]
    readonly peerSsrcs: readonly number[]
}

interface SessionInternals {
    selfDeviceJid: string
    selfStreamSsrcs: number[]
    peerStreamSsrcs: number[]
    videoRtpSession: { getSsrc: () => number } | null
    videoSendPathOpened: boolean
    sctpRelay: {
        setStreamSsrcs: (selfSsrcs: number[], peerSsrcs: number[]) => void
        resendSubscriptions: () => void
        cleanup: () => void
    }
}

interface Harness {
    readonly session: WaCallMediaSession
    readonly call: CallInfo
    readonly changes: PeerVideoStateChange[]
    readonly subscriptions: SubscriptionUpdate[]
    readonly resendCount: () => number
    readonly internals: SessionInternals
    /** Every `<video>` child this side put on the wire, in order. */
    readonly sentVideoStates: BinaryNode[]
    /**
     * Makes sends reject with this reason, or stops when given `null`. `afterSends` is how
     * many more succeed first, so a failure can be aimed at one send of a sequence.
     */
    readonly failSends: (reason: string | null, afterSends?: number) => void
}

/**
 * A session wired up the way it would be after the peer answered: the peer's audio
 * stream is subscribed, no video stream exists, and the relay is inert.
 */
function createSession(mediaType: CallMediaType = CallMediaType.Audio): Harness {
    const changes: PeerVideoStateChange[] = []
    const subscriptions: SubscriptionUpdate[] = []
    const sentVideoStates: BinaryNode[] = []
    let resends = 0
    let sendFailure: string | null = null
    let sendsBeforeFailure = 0

    const call = CallInfo.newIncoming(
        CALL_ID,
        PEER_DEVICE_JID,
        PEER_DEVICE_JID,
        undefined,
        mediaType
    )
    const deps = {
        lowLevelCoordinator: {
            sendNode: async (node: BinaryNode) => {
                // Thrown before recording: a send that failed never reached the wire.
                if (sendFailure) {
                    if (sendsBeforeFailure > 0) sendsBeforeFailure--
                    else throw new Error(sendFailure)
                }
                const inner = (node.content as BinaryNode[] | undefined)?.[0]
                if (inner?.tag === 'video') sentVideoStates.push(inner)
            }
        }
    } as unknown as WaVoipDeps
    const session = new WaCallMediaSession({
        deps,
        logger: createNoopLogger(),
        info: call,
        delegate: {
            emitState: () => {},
            emitIncoming: () => {},
            emitEnded: () => {},
            emitInboundAudio: () => {},
            emitInboundVideoRtp: () => {},
            emitInboundVideo: () => {},
            emitPeerMute: () => {},
            emitScreenShare: () => {},
            emitHandRaise: () => {},
            emitPeerVideoState: (_call, change) => {
                changes.push(change)
            },
            emitOutboundAudioFinished: () => {}
        } satisfies WaCallMediaSessionDelegate
    })

    const internals = session as unknown as SessionInternals
    internals.selfDeviceJid = SELF_DEVICE_JID
    internals.peerStreamSsrcs = [PEER_AUDIO_MAIN_SSRC]
    internals.sctpRelay = {
        setStreamSsrcs: (selfSsrcs, peerSsrcs) => {
            subscriptions.push({ selfSsrcs: [...selfSsrcs], peerSsrcs: [...peerSsrcs] })
        },
        resendSubscriptions: () => {
            resends++
        },
        cleanup: () => {}
    }

    return {
        session,
        call,
        changes,
        subscriptions,
        resendCount: () => resends,
        internals,
        sentVideoStates,
        failSends: (reason, afterSends = 0) => {
            sendFailure = reason
            sendsBeforeFailure = afterSends
        }
    }
}

/** The same session on a connected call, where an in-call upgrade is possible. */
function createActiveSession(mediaType: CallMediaType = CallMediaType.Audio): Harness {
    const harness = createSession(mediaType)
    harness.call.applyTransition({ type: 'local_accepted' })
    harness.call.applyTransition({ type: 'media_connected' })
    return harness
}

/** A `<call>` wrapping one `<video>` child, as the stanza arrives. */
function videoStateStanza(attrs: Record<string, string>): BinaryNode {
    return {
        tag: 'call',
        attrs: { from: PEER_DEVICE_JID, id: 'STANZA1' },
        content: [
            {
                tag: 'video',
                attrs: { 'call-id': CALL_ID, 'call-creator': PEER_DEVICE_JID, ...attrs },
                content: undefined
            }
        ]
    }
}

/**
 * The upgrade request carries the parameter profile that turn needs, and only the
 * receiving side gets one - so this is the only place a second `<voip_settings>`
 * reaches a call, and dropping it leaves an upgraded call on the audio numbers.
 */
test('an upgrade request brings the video parameter profile with it', () => {
    const harness = createSession()

    const stanza: BinaryNode = {
        tag: 'call',
        attrs: { from: PEER_DEVICE_JID, id: 'STANZA1' },
        content: [
            {
                tag: 'video',
                attrs: {
                    'call-id': CALL_ID,
                    'call-creator': PEER_DEVICE_JID,
                    state: '11',
                    'transaction-id': '1',
                    voip_settings: 'video'
                },
                content: [
                    {
                        tag: 'voip_settings',
                        attrs: { uncompressed: '1' },
                        content: Buffer.from(
                            'eyJyYyI6IHsicnRjcF9pbnRlcnZhbF9tcyI6IDI1MDB9fQ==',
                            'base64'
                        )
                    }
                ]
            }
        ]
    }

    harness.session.handleCallVideoState(stanza)

    assert.equal(
        harness.call.voipSettings?.rtcpIntervalMs,
        2500,
        'the profile that rode the request is the one now in force'
    )
})

test('the peer video state is stored on the call and handed to the delegate', () => {
    const harness = createSession()

    harness.session.handleCallVideoState(
        videoStateStanza({
            state: '4',
            device_orientation: '0',
            dec: 'H264',
            'transaction-id': '2'
        })
    )

    assert.deepEqual(harness.call.peerVideoState, {
        state: 4,
        transactionId: 2,
        deviceOrientation: 0,
        decoderCodec: 'H264',
        encoderCodec: null,
        supportedCodecs: null
    })
    assert.equal(harness.changes.length, 1)
    assert.equal(harness.changes[0].state, 4)
    assert.equal(harness.changes[0].decoderCodec, 'H264')

    harness.session.cleanup()
})

test('a video state that does not advance the transaction id is dropped', () => {
    const harness = createSession()

    harness.session.handleCallVideoState(videoStateStanza({ state: '6', 'transaction-id': '7' }))
    harness.session.handleCallVideoState(videoStateStanza({ state: '1', 'transaction-id': '7' }))
    harness.session.handleCallVideoState(videoStateStanza({ state: '0', 'transaction-id': '3' }))

    assert.equal(harness.changes.length, 1)
    assert.equal(harness.call.peerVideoState?.state, 6)
    assert.equal(harness.call.peerVideoState?.transactionId, 7)

    harness.session.handleCallVideoState(videoStateStanza({ state: '2', 'transaction-id': '8' }))

    assert.equal(harness.changes.length, 2)
    assert.equal(harness.call.peerVideoState?.state, 2)

    harness.session.cleanup()
})

test('a stanza with no readable state changes nothing', () => {
    const harness = createSession()

    harness.session.handleCallVideoState(videoStateStanza({ 'transaction-id': '1' }))

    assert.equal(harness.call.peerVideoState, undefined)
    assert.equal(harness.changes.length, 0)
    assert.equal(harness.subscriptions.length, 0)
    assert.equal(harness.resendCount(), 0)

    harness.session.cleanup()
})

test('the first video state subscribes the peer video slots and opens a video rtp session', () => {
    const harness = createSession()

    harness.session.handleCallVideoState(
        videoStateStanza({ state: '6', device_orientation: '0', 'transaction-id': '1' })
    )

    assert.equal(harness.subscriptions.length, 1)
    const peerSsrcs = harness.subscriptions[0].peerSsrcs
    assert.ok(
        peerSsrcs.includes(PEER_AUDIO_MAIN_SSRC),
        'the audio stream stays subscribed after the upgrade'
    )
    assert.ok(
        peerSsrcs.includes(PEER_VIDEO_MAIN_SSRC),
        `expected the peer video slot 0x${PEER_VIDEO_MAIN_SSRC.toString(16)} in the subscription`
    )
    assert.equal(peerSsrcs.length, 4, 'the three video slots join the one audio slot')
    assert.equal(harness.resendCount(), 1)
    assert.notEqual(harness.internals.videoRtpSession, null)

    harness.session.cleanup()
})

test('the video receive path opens once, not on every video state', () => {
    const harness = createSession()

    harness.session.handleCallVideoState(videoStateStanza({ state: '6', 'transaction-id': '1' }))
    harness.session.handleCallVideoState(videoStateStanza({ state: '4', 'transaction-id': '2' }))
    harness.session.handleCallVideoState(videoStateStanza({ state: '1', 'transaction-id': '3' }))

    assert.equal(harness.changes.length, 3)
    assert.equal(harness.subscriptions.length, 1)
    assert.equal(harness.resendCount(), 1)

    harness.session.cleanup()
})

test('a call negotiated as video keeps the subscription it already has', () => {
    const harness = createSession(CallMediaType.Video)

    harness.session.handleCallVideoState(videoStateStanza({ state: '6', 'transaction-id': '1' }))

    assert.equal(harness.call.peerVideoState?.state, 6)
    assert.equal(harness.changes.length, 1)
    assert.equal(harness.subscriptions.length, 0)
    assert.equal(harness.resendCount(), 0)

    harness.session.cleanup()
})

/** The `state` of each `<video>` this side sent, in order, as numbers. */
function sentStates(harness: Harness): number[] {
    return harness.sentVideoStates.map((node) => Number(node.attrs.state))
}

/** A `<video>` the peer sends, with the transaction ids advancing on their own. */
function peerState(harness: Harness, state: number): void {
    const next = (harness.call.peerVideoState?.transactionId ?? 0) + 1
    harness.session.handleCallVideoState(
        videoStateStanza({ state: String(state), 'transaction-id': String(next) })
    )
}

test('an upgrade request goes out as UpgradeRequestV2 and opens no sender yet', async () => {
    const harness = createActiveSession()

    const pending = harness.session.requestVideoUpgrade()
    await Promise.resolve()

    assert.equal(harness.sentVideoStates.length, 1)
    assert.deepEqual(harness.sentVideoStates[0].attrs, {
        'call-id': CALL_ID,
        'call-creator': PEER_DEVICE_JID,
        state: '11',
        device_orientation: '0',
        dec: 'H264',
        'transaction-id': '1',
        voip_settings: 'video'
    })
    assert.equal(
        harness.internals.videoSendPathOpened,
        false,
        'nothing this side sends can reach the wire before the peer accepts'
    )

    await harness.session.cancelVideoUpgrade()
    await pending
    harness.session.cleanup()
})

test('the peer accept concludes the handshake and opens the local sender', async () => {
    const harness = createActiveSession()
    const audioSsrcCount = harness.internals.selfStreamSsrcs.length

    const pending = harness.session.requestVideoUpgrade()
    await Promise.resolve()
    peerState(harness, WA_VIDEO_STATE.UpgradeAccept)

    assert.equal(await pending, WA_VIDEO_UPGRADE_RESULT.Accepted)
    assert.equal(harness.internals.videoSendPathOpened, true)
    assert.equal(
        harness.internals.selfStreamSsrcs.length,
        audioSsrcCount + 3,
        'the three video slots join the ones this side already registered'
    )
    assert.ok(
        harness.internals.selfStreamSsrcs.includes(
            harness.internals.videoRtpSession?.getSsrc() ?? -1
        ),
        'the relay is told about the very SSRC the video sender stamps its packets with'
    )
    assert.equal(harness.call.stateData.videoOff, false)

    // The accepted side announces its video live, numbered on its own counter: the
    // accept's id belongs to the peer's numbering and is never reused.
    await Promise.resolve()
    assert.deepEqual(
        sentStates(harness),
        [11, 1],
        'the accepted side answers the accept by announcing its video live'
    )
    const announced = harness.sentVideoStates[1]
    assert.equal(
        announced?.attrs['transaction-id'],
        '2',
        'the announcement carries the next id of our own counter, not the accept id'
    )

    harness.session.cleanup()
})

test('a refusal, an unanswered ring and a failure settle apart from each other', async () => {
    const cases: ReadonlyArray<readonly [number, string]> = [
        [WA_VIDEO_STATE.UpgradeReject, WA_VIDEO_UPGRADE_RESULT.Rejected],
        [WA_VIDEO_STATE.UpgradeRejectByTimeout, WA_VIDEO_UPGRADE_RESULT.RejectedByTimeout],
        [WA_VIDEO_STATE.Error, WA_VIDEO_UPGRADE_RESULT.Failed]
    ]

    for (const [state, expected] of cases) {
        const harness = createActiveSession()
        const pending = harness.session.requestVideoUpgrade()
        await Promise.resolve()
        peerState(harness, state)

        assert.equal(await pending, expected)
        assert.equal(
            harness.internals.videoSendPathOpened,
            false,
            `no sender opened on ${expected}`
        )
        assert.equal(harness.call.stateData.videoOff, true)

        harness.session.cleanup()
    }
})

test('a request nobody answers times out and withdraws itself', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const harness = createActiveSession()

    const pending = harness.session.requestVideoUpgrade()
    await Promise.resolve()
    assert.deepEqual(sentStates(harness), [11])

    t.mock.timers.tick(WA_VIDEO_UPGRADE_TIMEOUT_MS)

    assert.equal(await pending, WA_VIDEO_UPGRADE_RESULT.TimedOut)
    await Promise.resolve()
    assert.deepEqual(
        sentStates(harness),
        [11, 0],
        // The two cancel codes are named for this case and are not it: the
        // peer's timer runs a downgrade and announces Disabled, while the
        // cancels belong to a request an application withdraws on purpose.
        'the timer downgrades the call rather than cancelling the request'
    )
    assert.equal(harness.internals.videoSendPathOpened, false)

    harness.session.cleanup()
})

test('a request that crosses one from the peer answers it instead of asking again', async () => {
    const harness = createActiveSession()
    peerState(harness, WA_VIDEO_STATE.UpgradeRequestV2)

    assert.equal(await harness.session.requestVideoUpgrade(), WA_VIDEO_UPGRADE_RESULT.Accepted)
    assert.deepEqual(sentStates(harness), [4, 1])
    assert.equal(harness.internals.videoSendPathOpened, true)

    harness.session.cleanup()
})

test('accepting an upgrade the peer asked for opens the sender and announces the camera', async () => {
    const harness = createActiveSession()
    peerState(harness, WA_VIDEO_STATE.UpgradeRequest)

    await harness.session.acceptVideoUpgrade()

    // The camera is announced after the accept, once the sender behind the claim exists,
    // and each `<video>` carries the next id of this side's own counter.
    assert.deepEqual(sentStates(harness), [4, 1])
    assert.deepEqual(
        harness.sentVideoStates.map((node) => node.attrs['transaction-id']),
        ['1', '2']
    )
    assert.equal(harness.internals.videoSendPathOpened, true)
    assert.equal(harness.call.stateData.videoOff, false)

    harness.session.cleanup()
})

test('rejecting one answers it and leaves the call on audio', async () => {
    const harness = createActiveSession()
    peerState(harness, WA_VIDEO_STATE.UpgradeRequestV2)

    await harness.session.rejectVideoUpgrade()

    assert.deepEqual(sentStates(harness), [5])
    assert.equal(harness.internals.videoSendPathOpened, false)
    assert.equal(harness.call.stateData.videoOff, true)

    harness.session.cleanup()
})

test('answering a request the peer never made sends nothing', async () => {
    const harness = createActiveSession()

    await harness.session.acceptVideoUpgrade()
    await harness.session.rejectVideoUpgrade()

    assert.deepEqual(sentStates(harness), [])
    assert.equal(harness.internals.videoSendPathOpened, false)

    harness.session.cleanup()
})

test('a peer that withdraws its own request leaves nothing to answer', async () => {
    const harness = createActiveSession()
    peerState(harness, WA_VIDEO_STATE.UpgradeRequestV2)
    peerState(harness, WA_VIDEO_STATE.UpgradeCancelByTimeout)

    await harness.session.acceptVideoUpgrade()

    assert.deepEqual(sentStates(harness), [])

    harness.session.cleanup()
})

test('cancelling withdraws the request and settles the caller waiting on it', async () => {
    const harness = createActiveSession()

    const pending = harness.session.requestVideoUpgrade()
    await Promise.resolve()
    await harness.session.cancelVideoUpgrade()

    assert.equal(await pending, WA_VIDEO_UPGRADE_RESULT.Cancelled)
    assert.deepEqual(sentStates(harness), [11, 8])
    assert.equal(harness.internals.videoSendPathOpened, false)

    harness.session.cleanup()
})

test('a second request joins the one in flight instead of opening another', async () => {
    const harness = createActiveSession()

    const first = harness.session.requestVideoUpgrade()
    await Promise.resolve()
    const second = harness.session.requestVideoUpgrade()
    await Promise.resolve()

    assert.deepEqual(sentStates(harness), [11])

    peerState(harness, WA_VIDEO_STATE.UpgradeAccept)
    assert.equal(await first, WA_VIDEO_UPGRADE_RESULT.Accepted)
    assert.equal(await second, WA_VIDEO_UPGRADE_RESULT.Accepted)

    harness.session.cleanup()
})

test('the transaction id counts the messages this side sends, from 1', async () => {
    const harness = createActiveSession()

    const pending = harness.session.requestVideoUpgrade()
    await Promise.resolve()
    await harness.session.cancelVideoUpgrade()
    await pending

    assert.deepEqual(
        harness.sentVideoStates.map((node) => node.attrs['transaction-id']),
        ['1', '2']
    )

    harness.session.cleanup()
})

test('an upgrade is refused outright on a call that cannot carry one', async () => {
    const ringing = createSession()
    await assert.rejects(
        () => ringing.session.requestVideoUpgrade(),
        /is not active/,
        'a call that is not up yet has nothing to upgrade'
    )
    ringing.session.cleanup()

    const video = createActiveSession(CallMediaType.Video)
    await assert.rejects(
        () => video.session.requestVideoUpgrade(),
        /already carries video/,
        'a call negotiated as video was never audio'
    )
    video.session.cleanup()
})

test('tearing the call down settles a handshake still waiting on the peer', async () => {
    const harness = createActiveSession()

    const pending = harness.session.requestVideoUpgrade()
    await Promise.resolve()
    harness.session.cleanup()

    assert.equal(await pending, WA_VIDEO_UPGRADE_RESULT.Cancelled)
})

/**
 * Every code that ends the handshake ends the peer's request with it. Left set, the next
 * `requestVideoUpgrade` takes the crossing branch and accepts a request nobody holds -
 * opening this side's video sender against a peer that thinks the call is audio.
 */
test('a terminal code leaves the peer with no request to accept', async () => {
    const terminal = [
        WA_VIDEO_STATE.UpgradeReject,
        WA_VIDEO_STATE.UpgradeRejectByTimeout,
        WA_VIDEO_STATE.Error
    ]

    for (const state of terminal) {
        const harness = createActiveSession()
        peerState(harness, WA_VIDEO_STATE.UpgradeRequestV2)
        peerState(harness, state)

        await harness.session.acceptVideoUpgrade()

        assert.deepEqual(sentStates(harness), [], `state ${state} left a request outstanding`)
        assert.equal(harness.internals.videoSendPathOpened, false)

        // And the next request opens a handshake instead of answering the dead one.
        const next = harness.session.requestVideoUpgrade()
        await Promise.resolve()
        assert.deepEqual(sentStates(harness), [11])
        await harness.session.cancelVideoUpgrade()
        assert.equal(await next, WA_VIDEO_UPGRADE_RESULT.Cancelled)

        harness.session.cleanup()
    }
})

test('a request that times out closes one the peer crossed it with', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const harness = createActiveSession()

    const pending = harness.session.requestVideoUpgrade()
    await Promise.resolve()
    peerState(harness, WA_VIDEO_STATE.UpgradeRequestV2)

    t.mock.timers.tick(WA_VIDEO_UPGRADE_TIMEOUT_MS)
    assert.equal(await pending, WA_VIDEO_UPGRADE_RESULT.TimedOut)
    await Promise.resolve()

    await harness.session.acceptVideoUpgrade()

    assert.deepEqual(sentStates(harness), [11, 0], 'the downgrade was not followed by an accept')
    assert.equal(harness.internals.videoSendPathOpened, false)

    harness.session.cleanup()
})

/**
 * The peer numbers what it sends on its own counter, answers included, so the announcement
 * that follows our accept already sits above the request it sent and the replay rule passes
 * it with no exemption of any kind. A genuine repeat of that same announcement advances
 * nothing and is still dropped.
 */
test('the peer announcement after our accept clears the replay rule on its own', async () => {
    const harness = createActiveSession()
    peerState(harness, WA_VIDEO_STATE.UpgradeRequestV2)

    await harness.session.acceptVideoUpgrade()
    const before = harness.changes.length

    peerState(harness, WA_VIDEO_STATE.Enabled)

    assert.equal(harness.call.peerVideoState?.state, WA_VIDEO_STATE.Enabled)
    assert.equal(
        harness.call.peerVideoState?.transactionId,
        2,
        'the peer counter moved past its own request'
    )
    assert.equal(harness.changes.length, before + 1)

    harness.session.handleCallVideoState(
        videoStateStanza({ state: String(WA_VIDEO_STATE.Enabled), 'transaction-id': '2' })
    )

    assert.equal(harness.changes.length, before + 1, 'the repeat was dropped')

    // Nothing about the id this side stamped on its own accept makes an inbound message
    // fresh: the two counters are separate spaces and only the peer's is compared here.
    harness.session.handleCallVideoState(
        videoStateStanza({ state: String(WA_VIDEO_STATE.Stopped), 'transaction-id': '1' })
    )

    assert.equal(harness.call.peerVideoState?.state, WA_VIDEO_STATE.Enabled)
    assert.equal(harness.changes.length, before + 1)

    harness.session.cleanup()
})

/**
 * Second upgrade in the same call: our counter has already passed the id the peer stamps on
 * its accept, so numbering the announcement under that id would emit a number below one we
 * sent and the peer would drop it - leaving it unaware our video went live.
 */
test('a second upgrade cycle announces video above every id this side has sent', async () => {
    const harness = createActiveSession()

    const refused = harness.session.requestVideoUpgrade()
    await Promise.resolve()
    peerState(harness, WA_VIDEO_STATE.UpgradeReject)
    assert.equal(await refused, WA_VIDEO_UPGRADE_RESULT.Rejected)

    const accepted = harness.session.requestVideoUpgrade()
    await Promise.resolve()
    peerState(harness, WA_VIDEO_STATE.UpgradeAccept)
    assert.equal(await accepted, WA_VIDEO_UPGRADE_RESULT.Accepted)

    assert.deepEqual(sentStates(harness), [11, 11, 1])
    assert.deepEqual(
        harness.sentVideoStates.map((node) => node.attrs['transaction-id']),
        ['1', '2', '3'],
        'the announcement advances our counter instead of repeating the accept id 2'
    )

    harness.session.cleanup()
})

/**
 * The two sends an accept makes answer to the caller differently, because by the time the
 * second goes out the upgrade has already happened.
 */
test('an accept that never left is retryable; a lost announcement does not undo one that did', async () => {
    const failing = createActiveSession()
    peerState(failing, WA_VIDEO_STATE.UpgradeRequestV2)

    failing.failSends('offline')
    await assert.rejects(() => failing.session.acceptVideoUpgrade(), /offline/)
    assert.deepEqual(sentStates(failing), [], 'nothing reached the wire')
    assert.equal(failing.internals.videoSendPathOpened, false, 'no sender on a lost accept')

    /**
     * The request has to still be outstanding: had accepting cleared it, this retry would
     * no-op and the peer would wait forever on a request nobody ever answers.
     */
    failing.failSends(null)
    await failing.session.acceptVideoUpgrade()
    assert.deepEqual(sentStates(failing), [WA_VIDEO_STATE.UpgradeAccept, WA_VIDEO_STATE.Enabled])
    assert.equal(failing.internals.videoSendPathOpened, true)
    failing.session.cleanup()

    const announcing = createActiveSession()
    peerState(announcing, WA_VIDEO_STATE.UpgradeRequestV2)

    // Only the announcement fails, so the accept is out and the sender is open.
    announcing.failSends('offline', 1)
    await announcing.session.acceptVideoUpgrade()

    assert.deepEqual(sentStates(announcing), [WA_VIDEO_STATE.UpgradeAccept])
    assert.equal(announcing.internals.videoSendPathOpened, true)
    announcing.session.cleanup()
})

/**
 * Measured against the reference client: a request nobody answered in time is taken back
 * with `Disabled`, not with either cancel code - which is also what this side sends when
 * its own guard timer fires.
 */
test('a request the peer takes back cannot be accepted afterwards', async () => {
    const harness = createActiveSession()

    peerState(harness, WA_VIDEO_STATE.UpgradeRequestV2)
    peerState(harness, WA_VIDEO_STATE.Disabled)

    await harness.session.acceptVideoUpgrade()

    assert.deepEqual(sentStates(harness), [], 'nothing was announced to a peer back on audio')
    assert.equal(harness.internals.videoSendPathOpened, false)

    harness.session.cleanup()
})
