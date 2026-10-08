import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger, type Logger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import {
    type WaCallMediaMessage,
    WaCallMediaPlane,
    type WaCallMediaPlanUpdate
} from '@zapo-js/voip-media'
import { nodeMediaHost } from '@zapo-js/voip-media/node'

import { readUInt32BE } from '../../bytes.js'
import { WA_VIDEO_STATE, WA_VIDEO_UPGRADE_RESULT } from '../../signaling/signaling.js'
import { CallMediaType, type WaVoipDeps } from '../../types.js'
import { CallInfo } from '../call-state.js'
import {
    type WaCallMediaLink,
    type WaCallMediaLinkEvents,
    WaRemoteCallMedia
} from '../media-link.js'
import { WaCallMediaSession } from '../WaCallMediaSession.js'
import {
    BORN_VIDEO_READY_GUARD_MS,
    BORN_VIDEO_READY_TIMEOUT_MS,
    UPGRADE_VIDEO_READY_GUARD_MS,
    UPGRADE_VIDEO_READY_TIMEOUT_MS,
    WaPeerVideoReadyGate
} from '../WaPeerVideoReadyGate.js'

import { createSessionDelegate } from './_helpers.js'

const CALL_ID = '006AFEADB13F4EDFE9D8BA599B10EA96'
const PEER_DEVICE_JID = '50062877036657:76@lid'
const SELF_DEVICE_JID = '184478207058035:1@lid'
/** Another device of our own account, which a `<mute_v2>` can come from too. */
const OWN_OTHER_DEVICE_JID = '184478207058035:7@lid'

/** One Annex-B access unit each, small enough to go out as a single packet. */
const KEY_FRAME = new Uint8Array([0, 0, 0, 1, 0x65, 0x88, 0x84, 0x00])
const DELTA_FRAME = new Uint8Array([0, 0, 0, 1, 0x41, 0x9a, 0x02, 0x00])

/** A relay that is always up and keeps what the plane hands it. */
class FakeRelay {
    readonly sent: Uint8Array[] = []

    setSsrc(): void {}
    setSubscriptionSsrc(): void {}
    setStreamSsrcs(): void {}
    setParticipantIds(): void {}
    resendSubscriptions(): void {}
    async configureRelays(): Promise<void> {}
    hasConnection(): boolean {
        return true
    }
    getConnectedCount(): number {
        return 1
    }
    setMediaFlowing(): void {}
    sendMedia(data: ArrayBuffer): boolean {
        this.sent.push(new Uint8Array(data))
        return true
    }
    cleanup(): void {}
}

interface PlaneInternals {
    sctpRelay: FakeRelay
    srtpSession: { protect: (packet: { encode(): Uint8Array }) => Uint8Array }
}

/** Feeds every plan change into a real plane, so what reaches the wire is counted. */
class PlaneMediaLink implements WaCallMediaLink {
    readonly plane: WaCallMediaPlane
    readonly relay = new FakeRelay()
    readonly updates: WaCallMediaPlanUpdate[] = []

    constructor(events: WaCallMediaLinkEvents) {
        this.plane = new WaCallMediaPlane({
            ...nodeMediaHost,
            logger: createNoopLogger(),
            onActive: () => events.onActive()
        })
        const internals = this.plane as unknown as PlaneInternals
        internals.sctpRelay = this.relay
        internals.srtpSession = { protect: (packet) => packet.encode() }
    }

    /** No codec: only the video is watched. */
    start(): Promise<void> {
        return Promise.resolve()
    }

    apply(update: WaCallMediaPlanUpdate): Promise<void> {
        this.updates.push(update)
        return this.plane.apply(update)
    }

    stop(): void {
        this.plane.stop()
    }

    sendReaction(): boolean {
        return false
    }

    sendVideoFrame(data: Uint8Array, timestampUs: number): number {
        return this.plane.sendVideoFrame(data, timestampUs)
    }

    loadAudio(): Promise<void> {
        return Promise.resolve()
    }

    setExternalAudioMode(): void {}

    feedLiveAudio(): number {
        return 0
    }

    getLiveBufferMs(): number {
        return 0
    }

    handleEvent(): void {}

    snapshot(): WaCallMediaMessage | null {
        return null
    }
}

interface Released {
    readonly reason: unknown
    readonly trigger: unknown
    readonly sinceAcceptMs: unknown
}

interface GateInternals {
    readonly peerVideoReadyGate: {
        readonly isHeld: boolean
        readonly guardTimer: unknown
        readonly timeoutTimer: unknown
    }
}

interface Harness {
    readonly session: WaCallMediaSession
    readonly call: CallInfo
    readonly link: PlaneMediaLink
    /** Every `video send released` the session logged, in order. */
    readonly released: Released[]
    /** Feeds one access unit, the way `feedLiveVideo` does, and returns its packets. */
    readonly feed: (frame: Uint8Array) => number
    /** RTP packets of our video stream the relay took. */
    readonly videoPackets: () => number
}

/** Lets the plan updates the session published without awaiting reach the plane. */
function settle(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve))
}

/** `onSend` sees every stanza the session sends, as it leaves. */
function createDeps(onSend: (node: BinaryNode) => void = () => {}): WaVoipDeps {
    return {
        authClient: {
            getCurrentCredentials: () => ({ meJid: SELF_DEVICE_JID, meLid: SELF_DEVICE_JID })
        },
        messageDispatch: { syncSignalSession: async () => undefined },
        lowLevelCoordinator: {
            sendNode: async (node: BinaryNode) => {
                onSend(node)
            }
        }
    } as unknown as WaVoipDeps
}

/** A session for `call` over a real plane, on a relay that is always up. */
function createHarness(call: CallInfo, onSend?: (node: BinaryNode) => void): Harness {
    const released: Released[] = []
    const logger: Logger = {
        ...createNoopLogger(),
        debug: (message, context) => {
            if (message === 'video send released') {
                released.push({
                    reason: context?.reason,
                    trigger: context?.trigger,
                    sinceAcceptMs: context?.sinceAcceptMs
                })
            }
        }
    }
    let link: PlaneMediaLink | null = null
    const session = new WaCallMediaSession({
        deps: createDeps(onSend),
        logger,
        info: call,
        delegate: createSessionDelegate(),
        createMediaLink: (events) => (link = new PlaneMediaLink(events)),
        // The mocked `Date` only moves with the mocked timers, as a monotonic clock would.
        now: () => Date.now()
    })
    assert.ok(link)
    const planeLink: PlaneMediaLink = link

    let timestampUs = 0
    return {
        session,
        call,
        link: planeLink,
        released,
        feed: (frame) => {
            timestampUs += 66_667
            return session.feedLiveVideo(frame, timestampUs)
        },
        videoPackets: () => {
            const selfVideo = planeLink.updates.find((update) => update.ssrcs)?.ssrcs?.selfVideo
            assert.ok(selfVideo)
            return planeLink.relay.sent.filter(
                (data) => (data[1] < 200 || data[1] > 207) && readUInt32BE(data, 8) === selfVideo
            ).length
        }
    }
}

/** An incoming call, still ringing, its media readied. */
async function createRingingCall(mediaType: CallMediaType): Promise<Harness> {
    const harness = createHarness(
        CallInfo.newIncoming(CALL_ID, PEER_DEVICE_JID, PEER_DEVICE_JID, undefined, mediaType)
    )
    await harness.session.initMedia(SELF_DEVICE_JID, PEER_DEVICE_JID)
    return harness
}

/** An incoming call, answered, with media flowing on a relay that is always up. */
async function createActiveCall(mediaType: CallMediaType = CallMediaType.Audio): Promise<Harness> {
    const harness = await createRingingCall(mediaType)
    await harness.session.acceptCall()
    assert.equal(harness.call.isActive, true, 'the plane flowing is what made the call active')
    return harness
}

/** A video call this side placed, ringing at the peer, its media readied. */
async function createOutgoingVideoCall(): Promise<Harness> {
    const call = CallInfo.newOutgoing(
        CALL_ID,
        PEER_DEVICE_JID,
        SELF_DEVICE_JID,
        CallMediaType.Video
    )
    call.applyTransition({ type: 'offer_sent' })
    const harness = createHarness(call)
    await harness.session.initMedia(SELF_DEVICE_JID, PEER_DEVICE_JID)
    return harness
}

/** The peer answers the call this side placed. */
async function peerAccepts(harness: Harness): Promise<void> {
    const node: BinaryNode = {
        tag: 'call',
        attrs: { from: PEER_DEVICE_JID, id: 'ACCEPT1' },
        content: [
            {
                tag: 'accept',
                attrs: { 'call-id': CALL_ID, 'call-creator': SELF_DEVICE_JID },
                content: []
            }
        ]
    }
    await harness.session.handleCallAccept(node, PEER_DEVICE_JID)
    await settle()
}

/** A `<mute_v2>` announcing the sender's microphone, from the peer unless `from` says otherwise. */
function muteV2(
    session: WaCallMediaSession,
    attrs: Record<string, string> = { 'mute-state': '0' },
    from: string = PEER_DEVICE_JID
): void {
    const node: BinaryNode = {
        tag: 'call',
        attrs: { from, id: 'MUTE1' },
        content: [
            {
                tag: 'mute_v2',
                attrs: { 'call-id': CALL_ID, 'call-creator': PEER_DEVICE_JID, ...attrs },
                content: undefined
            }
        ]
    }
    session.handleCallMuteV2(node, from)
}

/** A `<video>` from the peer, with its transaction ids advancing on their own. */
function peerState(harness: Harness, state: number): void {
    const transactionId = (harness.call.peerVideoState?.transactionId ?? 0) + 1
    const node: BinaryNode = {
        tag: 'call',
        attrs: { from: PEER_DEVICE_JID, id: 'STANZA1' },
        content: [
            {
                tag: 'video',
                attrs: {
                    'call-id': CALL_ID,
                    'call-creator': PEER_DEVICE_JID,
                    state: String(state),
                    'transaction-id': String(transactionId)
                },
                content: undefined
            }
        ]
    }
    harness.session.handleCallVideoState(node)
}

/** The peer asks for video and this side says yes, the case the gate exists for. */
async function acceptPeerUpgrade(harness: Harness): Promise<void> {
    peerState(harness, WA_VIDEO_STATE.UpgradeRequestV2)
    await harness.session.acceptVideoUpgrade()
    await settle()
}

/** The `video` sections the session handed the media, in order. */
function videoSections(harness: Harness): WaCallMediaPlanUpdate['video'][] {
    return harness.link.updates.filter((update) => 'video' in update).map((update) => update.video)
}

/** Whether the last `video` section before the accept update already held our video. */
function heldWhenAccepted(updates: readonly WaCallMediaPlanUpdate[]): boolean {
    const acceptedAt = updates.findIndex((update) => update.accepted)
    assert.notEqual(acceptedAt, -1, 'the accept reached the media')
    return (
        updates
            .slice(0, acceptedAt + 1)
            .filter((update) => 'video' in update)
            .at(-1)?.video?.sendHeld === true
    )
}

/** The camera sign can precede the peer's inbound stream, hence the guard on top. */
test('after an upgrade the peer asked for, no video leaves before its camera is on and the guard ran', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const harness = await createActiveCall()

    await acceptPeerUpgrade(harness)

    const opening = videoSections(harness).find((video) => video?.send)
    assert.equal(opening?.sendHeld, true, 'the plan that opens the sender already holds it')
    assert.equal(harness.feed(KEY_FRAME), 0)

    t.mock.timers.tick(600)
    assert.equal(harness.feed(KEY_FRAME), 0, 'time alone does not let it go this early')

    peerState(harness, WA_VIDEO_STATE.Enabled)
    t.mock.timers.tick(UPGRADE_VIDEO_READY_GUARD_MS - 1)
    await settle()
    assert.equal(harness.feed(KEY_FRAME), 0, 'the camera is on, but the guard has not run')
    assert.equal(harness.videoPackets(), 0)

    t.mock.timers.tick(1)
    await settle()
    assert.equal(harness.feed(DELTA_FRAME), 0, 'the stream opens on a key frame, not a delta')
    assert.equal(harness.feed(KEY_FRAME), 1)
    assert.equal(harness.feed(DELTA_FRAME), 1)
    assert.equal(harness.videoPackets(), 2, 'nothing fed while held reached the wire')
    assert.deepEqual(harness.released, [
        {
            reason: 'peer-ready',
            trigger: 'upgrade',
            sinceAcceptMs: 600 + UPGRADE_VIDEO_READY_GUARD_MS
        }
    ])
    assert.equal(videoSections(harness).at(-1)?.sendHeld, undefined)

    harness.session.cleanup()
})

test('a peer that never turns its camera on gets our video at the timeout', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const harness = await createActiveCall()

    await acceptPeerUpgrade(harness)
    t.mock.timers.tick(UPGRADE_VIDEO_READY_TIMEOUT_MS - 1)
    await settle()
    assert.equal(harness.feed(KEY_FRAME), 0)

    t.mock.timers.tick(1)
    await settle()
    assert.equal(harness.feed(KEY_FRAME), 1)
    assert.deepEqual(harness.released, [
        { reason: 'timeout', trigger: 'upgrade', sinceAcceptMs: UPGRADE_VIDEO_READY_TIMEOUT_MS }
    ])

    // A camera announced after the timeout finds nothing held and changes nothing.
    peerState(harness, WA_VIDEO_STATE.Enabled)
    t.mock.timers.tick(UPGRADE_VIDEO_READY_GUARD_MS)
    await settle()
    assert.equal(harness.released.length, 1)
    assert.equal(harness.feed(DELTA_FRAME), 1)

    harness.session.cleanup()
})

/** Only a camera announced after our accept counts: the stream for our video comes after it. */
test('a camera the peer announced before our accept does not let the video go', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const harness = await createActiveCall()

    peerState(harness, WA_VIDEO_STATE.UpgradeRequestV2)
    peerState(harness, WA_VIDEO_STATE.Enabled)
    await harness.session.acceptVideoUpgrade()
    t.mock.timers.tick(UPGRADE_VIDEO_READY_GUARD_MS)
    await settle()

    assert.equal(harness.feed(KEY_FRAME), 0)
    assert.deepEqual(harness.released, [])

    harness.session.cleanup()
})

test('an upgrade this side asked for sends as soon as the peer accepts, as before', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const harness = await createActiveCall()

    const pending = harness.session.requestVideoUpgrade()
    await Promise.resolve()
    peerState(harness, WA_VIDEO_STATE.UpgradeAccept)
    assert.equal(await pending, WA_VIDEO_UPGRADE_RESULT.Accepted)
    await settle()

    assert.equal(harness.feed(KEY_FRAME), 1)
    assert.equal(harness.videoPackets(), 1)
    assert.ok(
        videoSections(harness).every((video) => video?.sendHeld === undefined),
        'nothing was ever held, not even at the accept of the voice call'
    )
    assert.deepEqual(harness.released, [])

    harness.session.cleanup()
})

test('a call that ends with the video held lets nothing go and leaves no timer behind', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const harness = await createActiveCall()

    await acceptPeerUpgrade(harness)
    peerState(harness, WA_VIDEO_STATE.Enabled)
    const { peerVideoReadyGate: gate } = harness.session as unknown as GateInternals
    assert.equal(gate.isHeld, true)
    assert.notEqual(gate.guardTimer, null, 'the guard the camera started is running')
    assert.notEqual(gate.timeoutTimer, null, 'and so is the timeout')
    const sectionsBefore = videoSections(harness).length

    harness.session.cleanup()

    assert.equal(gate.isHeld, false)
    assert.equal(gate.guardTimer, null)
    assert.equal(gate.timeoutTimer, null)

    t.mock.timers.tick(UPGRADE_VIDEO_READY_TIMEOUT_MS)
    await settle()

    assert.deepEqual(harness.released, [])
    assert.equal(videoSections(harness).length, sectionsBefore, 'no release was published')
    assert.equal(harness.feed(KEY_FRAME), 0)
    assert.equal(harness.videoPackets(), 0)
})

/** The peer's `<mute_v2>` can land shortly before its inbound stream, hence the guard. */
test('a call born as video that we answer sends no video before the peer mute_v2 and the guard', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const harness = await createActiveCall(CallMediaType.Video)

    assert.equal(heldWhenAccepted(harness.link.updates), true, 'held before the media flows')
    assert.equal(harness.feed(KEY_FRAME), 0)

    t.mock.timers.tick(400)
    assert.equal(harness.feed(KEY_FRAME), 0, 'time alone does not let it go this early')

    muteV2(harness.session)
    t.mock.timers.tick(BORN_VIDEO_READY_GUARD_MS - 1)
    await settle()
    assert.equal(harness.feed(KEY_FRAME), 0, 'the peer is up, but the guard has not run')
    assert.equal(harness.videoPackets(), 0)

    t.mock.timers.tick(1)
    await settle()
    assert.equal(harness.feed(DELTA_FRAME), 0, 'the stream opens on a key frame, not a delta')
    assert.equal(harness.feed(KEY_FRAME), 1)
    assert.equal(harness.feed(DELTA_FRAME), 1)
    assert.equal(harness.videoPackets(), 2, 'nothing fed while held reached the wire')
    assert.deepEqual(harness.released, [
        {
            reason: 'peer-ready',
            trigger: 'born-video',
            sinceAcceptMs: 400 + BORN_VIDEO_READY_GUARD_MS
        }
    ])
    assert.equal(videoSections(harness).at(-1)?.sendHeld, undefined)

    harness.session.cleanup()
})

test('a call born as video whose peer sends no mute_v2 gets our video at its own timeout', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const harness = await createActiveCall(CallMediaType.Video)

    t.mock.timers.tick(BORN_VIDEO_READY_TIMEOUT_MS - 1)
    await settle()
    assert.equal(harness.feed(KEY_FRAME), 0)

    t.mock.timers.tick(1)
    await settle()
    assert.equal(harness.feed(KEY_FRAME), 1)
    assert.deepEqual(harness.released, [
        { reason: 'timeout', trigger: 'born-video', sinceAcceptMs: BORN_VIDEO_READY_TIMEOUT_MS }
    ])

    // A mute_v2 after the timeout finds nothing held and changes nothing.
    muteV2(harness.session)
    t.mock.timers.tick(BORN_VIDEO_READY_GUARD_MS)
    await settle()
    assert.equal(harness.released.length, 1)
    assert.equal(harness.feed(DELTA_FRAME), 1)

    harness.session.cleanup()
})

/** A repeat of an already-recorded state still counts after the accept: arrival is the sign. */
test('a mute_v2 the peer sent before our accept does not let the video go', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const harness = await createRingingCall(CallMediaType.Video)

    muteV2(harness.session)
    assert.equal(harness.call.stateData.peerAudioMuted, false)
    await harness.session.acceptCall()
    t.mock.timers.tick(BORN_VIDEO_READY_GUARD_MS)
    await settle()

    assert.equal(harness.feed(KEY_FRAME), 0)
    assert.deepEqual(harness.released, [])

    t.mock.timers.tick(100)
    muteV2(harness.session)
    t.mock.timers.tick(BORN_VIDEO_READY_GUARD_MS)
    await settle()
    assert.equal(harness.feed(KEY_FRAME), 1)
    assert.deepEqual(harness.released, [
        {
            reason: 'peer-ready',
            trigger: 'born-video',
            sinceAcceptMs: 2 * BORN_VIDEO_READY_GUARD_MS + 100
        }
    ])

    harness.session.cleanup()
})

/** The peer answers our accept stanza, so the hold is on before that stanza leaves. */
test('a mute_v2 handled while our accept is still going out counts', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const call = CallInfo.newIncoming(
        CALL_ID,
        PEER_DEVICE_JID,
        PEER_DEVICE_JID,
        undefined,
        CallMediaType.Video
    )
    // The accept stanza only goes out with a call key.
    call.encryptionKey = new Uint8Array(32).fill(7)
    let acceptsSent = 0
    const harness: Harness = createHarness(call, (node) => {
        const inner = Array.isArray(node.content) ? node.content[0] : undefined
        if (inner?.tag !== 'accept') return
        acceptsSent++
        muteV2(harness.session)
    })
    await harness.session.initMedia(SELF_DEVICE_JID, PEER_DEVICE_JID)

    await harness.session.acceptCall()
    assert.equal(acceptsSent, 1)
    t.mock.timers.tick(BORN_VIDEO_READY_GUARD_MS)
    await settle()

    assert.equal(harness.feed(KEY_FRAME), 1)
    assert.deepEqual(harness.released, [
        { reason: 'peer-ready', trigger: 'born-video', sinceAcceptMs: BORN_VIDEO_READY_GUARD_MS }
    ])

    harness.session.cleanup()
})

/** Neither our own account's echo nor a group-call mute request is the peer coming up. */
test('only an announcement from the peer itself lets a call born as video go', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const harness = await createActiveCall(CallMediaType.Video)

    muteV2(harness.session, { 'mute-state': '0' }, OWN_OTHER_DEVICE_JID)
    muteV2(harness.session, { 'request-state': '1' })
    t.mock.timers.tick(BORN_VIDEO_READY_GUARD_MS)
    await settle()

    assert.equal(harness.feed(KEY_FRAME), 0)
    assert.deepEqual(harness.released, [])

    harness.session.cleanup()
})

/** A mute toggle says nothing about the camera, nor a camera about a born-video peer. */
test('each hold waits on its own sign', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })

    const upgrade = await createActiveCall()
    await acceptPeerUpgrade(upgrade)
    muteV2(upgrade.session, { 'mute-state': '1' })
    t.mock.timers.tick(UPGRADE_VIDEO_READY_GUARD_MS)
    await settle()
    assert.equal(upgrade.feed(KEY_FRAME), 0, 'a mute does not release an upgrade')
    assert.deepEqual(upgrade.released, [])
    upgrade.session.cleanup()

    const bornVideo = await createActiveCall(CallMediaType.Video)
    peerState(bornVideo, WA_VIDEO_STATE.Enabled)
    t.mock.timers.tick(BORN_VIDEO_READY_GUARD_MS)
    await settle()
    assert.equal(bornVideo.feed(KEY_FRAME), 0, 'a camera does not release a call born as video')
    assert.deepEqual(bornVideo.released, [])
    bornVideo.session.cleanup()
})

/** The direction this side places: the same sign, after the peer's accept. */
test('a video call we place holds our video from the peer accept until its mute_v2', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const harness = await createOutgoingVideoCall()

    muteV2(harness.session)
    await peerAccepts(harness)
    assert.equal(harness.call.isActive, true)
    assert.equal(heldWhenAccepted(harness.link.updates), true, 'held before the media flows')
    t.mock.timers.tick(BORN_VIDEO_READY_GUARD_MS)
    await settle()
    assert.equal(harness.feed(KEY_FRAME), 0, 'a mute_v2 from before the accept does not count')

    t.mock.timers.tick(150)
    muteV2(harness.session)
    t.mock.timers.tick(BORN_VIDEO_READY_GUARD_MS - 1)
    await settle()
    assert.equal(harness.feed(KEY_FRAME), 0)

    t.mock.timers.tick(1)
    await settle()
    assert.equal(harness.feed(KEY_FRAME), 1)
    assert.deepEqual(harness.released, [
        {
            reason: 'peer-ready',
            trigger: 'born-video',
            sinceAcceptMs: 2 * BORN_VIDEO_READY_GUARD_MS + 150
        }
    ])

    // A repeated accept finds the call no longer ringing and takes nothing back.
    await peerAccepts(harness)
    assert.equal(harness.feed(DELTA_FRAME), 1)
    assert.equal(harness.released.length, 1)

    harness.session.cleanup()
})

/** Ringing here, an accept is another device of ours answering, not the peer taking our call. */
test('an accept on a call we have not answered holds nothing', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const harness = await createRingingCall(CallMediaType.Video)
    const node: BinaryNode = {
        tag: 'call',
        attrs: { from: OWN_OTHER_DEVICE_JID, id: 'ACCEPT1' },
        content: [
            {
                tag: 'accept',
                attrs: { 'call-id': CALL_ID, 'call-creator': PEER_DEVICE_JID },
                content: []
            }
        ]
    }

    await harness.session.handleCallAccept(node, OWN_OTHER_DEVICE_JID)
    await settle()

    const { peerVideoReadyGate: gate } = harness.session as unknown as GateInternals
    assert.equal(gate.isHeld, false)
    assert.equal(gate.timeoutTimer, null)
    assert.ok(videoSections(harness).every((video) => video?.sendHeld === undefined))

    harness.session.cleanup()
})

/** A wall clock adjusted mid-hold must not skew the time held that gets logged. */
test('the time held is measured on the monotonic clock, not the wall clock', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10_000_000 })
    let monotonicMs = 0
    const held: number[] = []
    const gate = new WaPeerVideoReadyGate(
        (_reason, _trigger, heldMs) => held.push(heldMs),
        () => monotonicMs
    )

    gate.hold('born-video')
    t.mock.timers.setTime(10_000_000 + 3_600_000)
    monotonicMs += BORN_VIDEO_READY_TIMEOUT_MS
    t.mock.timers.tick(BORN_VIDEO_READY_TIMEOUT_MS)

    assert.deepEqual(held, [BORN_VIDEO_READY_TIMEOUT_MS])
})

test('a call born as video that the peer ends while held lets nothing go and leaves no timer', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const harness = await createActiveCall(CallMediaType.Video)

    muteV2(harness.session)
    const { peerVideoReadyGate: gate } = harness.session as unknown as GateInternals
    assert.notEqual(gate.guardTimer, null, 'the guard the mute_v2 started is running')
    assert.notEqual(gate.timeoutTimer, null, 'and so is the timeout')

    harness.session.handleCallTerminate()

    assert.equal(gate.isHeld, false)
    assert.equal(gate.guardTimer, null)
    assert.equal(gate.timeoutTimer, null)

    t.mock.timers.tick(BORN_VIDEO_READY_TIMEOUT_MS)
    await settle()
    assert.deepEqual(harness.released, [])
    assert.equal(harness.videoPackets(), 0)
})

/** A host elsewhere learns of the hold from the plan alone, in the order the media needs. */
test('the hold reaches a remote media host through the plan', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const messages: WaCallMediaMessage[] = []
    const session = new WaCallMediaSession({
        deps: createDeps(),
        logger: createNoopLogger(),
        info: CallInfo.newIncoming(
            CALL_ID,
            PEER_DEVICE_JID,
            PEER_DEVICE_JID,
            undefined,
            CallMediaType.Video
        ),
        delegate: createSessionDelegate({
            emitMediaPlan: (_call, message) => {
                messages.push(message)
            }
        }),
        createMediaLink: (events) => new WaRemoteCallMedia(CALL_ID, events)
    })

    await session.initMedia(SELF_DEVICE_JID, PEER_DEVICE_JID)
    await session.acceptCall()
    assert.equal(heldWhenAccepted(messages.map((message) => message.plan)), true)

    muteV2(session)
    t.mock.timers.tick(BORN_VIDEO_READY_GUARD_MS)
    assert.deepEqual(messages.at(-1)?.plan, { video: { send: true, receive: true } })

    session.cleanup()
})
