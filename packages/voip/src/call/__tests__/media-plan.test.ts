import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'

import type { WaCallMediaMessage } from '@zapo-js/voip-media'

import { WaVoipSettings } from '../../signaling/voip-settings.js'
import { CallMediaType, CallState, EndCallReason, type WaVoipDeps } from '../../types.js'
import { CallInfo } from '../call-state.js'
import { type WaCallMediaLinkEvents, WaRemoteCallMedia } from '../media-link.js'
import { WaCallMediaSession } from '../WaCallMediaSession.js'

import { createSessionDelegate, type RecordingMediaLink, recordMediaLink } from './_helpers.js'

/**
 * Call id and peer device jid of a capture whose SSRCs were read out of the official
 * client's own logs, so the expected values below are copied, not recomputed.
 */
const CALL_ID = '006AFEADB13F4EDFE9D8BA599B10EA96'
const PEER_DEVICE_JID = '50062877036657:76@lid'
const SELF_DEVICE_JID = '184478207058035:1@lid'
const PEER_AUDIO_MAIN_SSRC = 0x8ffe17b1
const PEER_VIDEO_MAIN_SSRC = 0xeb15721e

interface Harness {
    readonly session: WaCallMediaSession
    readonly call: CallInfo
    readonly link: RecordingMediaLink
    readonly ended: EndCallReason[]
    readonly sent: unknown[]
}

function createSession(mediaType: CallMediaType = CallMediaType.Audio): Harness {
    const ended: EndCallReason[] = []
    const sent: unknown[] = []
    const call = CallInfo.newIncoming(
        CALL_ID,
        PEER_DEVICE_JID,
        PEER_DEVICE_JID,
        undefined,
        mediaType
    )
    const { link, createMediaLink } = recordMediaLink()
    const session = new WaCallMediaSession({
        deps: {
            authClient: {
                getCurrentCredentials: () => ({ meJid: SELF_DEVICE_JID, meLid: SELF_DEVICE_JID })
            },
            lowLevelCoordinator: {
                sendNode: async (node: unknown) => {
                    sent.push(node)
                }
            }
        } as unknown as WaVoipDeps,
        logger: createNoopLogger(),
        info: call,
        createMediaLink,
        delegate: createSessionDelegate({
            endCall: (_call, reason) => {
                ended.push(reason)
            }
        })
    })
    return { session, call, link, ended, sent }
}

test('the ssrcs a session publishes are the ones the official client derived', async () => {
    const harness = createSession()

    await harness.session.initMedia(SELF_DEVICE_JID, PEER_DEVICE_JID)

    const ssrcs = harness.link.plan.ssrcs
    assert.ok(ssrcs, 'initMedia publishes the ssrcs section')
    assert.equal(harness.link.started, true, 'the media side is readied first')
    assert.equal(harness.link.plan.mediaType, 'audio')
    assert.equal(ssrcs.peerAudio, PEER_AUDIO_MAIN_SSRC)
    assert.ok(ssrcs.peerStreams.includes(PEER_AUDIO_MAIN_SSRC))
    assert.equal(ssrcs.peerVideoStreams[0], PEER_VIDEO_MAIN_SSRC)
    assert.equal(ssrcs.peerVideoStreams.length, 3)
    harness.session.cleanup()
})

/** The plan names no jid: only the derivation tells our streams from the peer's. */
test('the first plan says whether video may flow: both ways on a video call, neither on a voice call', async () => {
    const voice = createSession()
    await voice.session.initMedia(SELF_DEVICE_JID, PEER_DEVICE_JID)
    assert.deepEqual(voice.link.plan.video, { send: false, receive: false })

    const video = createSession(CallMediaType.Video)
    await video.session.initMedia(SELF_DEVICE_JID, PEER_DEVICE_JID)
    assert.equal(video.link.plan.mediaType, 'video')
    assert.deepEqual(
        video.link.plan.video,
        { send: true, receive: true },
        'a host that captures on video.send gets the camera going on a video call too'
    )
})

test('our own streams are derived from our device, not the peer one', async () => {
    const harness = createSession()

    await harness.session.initMedia(SELF_DEVICE_JID, PEER_DEVICE_JID)

    const ssrcs = harness.link.plan.ssrcs
    assert.ok(ssrcs)
    assert.equal(ssrcs.selfStreams[0], ssrcs.selfAudio)
    assert.ok(!ssrcs.peerStreams.includes(ssrcs.selfAudio))
    assert.ok(ssrcs.selfVideoStreams.includes(ssrcs.selfVideo))
    assert.ok(!ssrcs.selfStreams.includes(ssrcs.selfVideo), 'an audio call registers no video')
    harness.session.cleanup()
})

test('the server settings reach the media resolved', () => {
    const harness = createSession()

    harness.session.applyVoipSettings(
        WaVoipSettings.fromJson(
            JSON.stringify({
                rc: { rtcp_interval_ms: '1500' },
                vid_rc: { disable_rtcp_remb: '1' },
                sframe: { enable_sframe: '1', enable_sframe_rx: '1' }
            })
        )
    )

    assert.deepEqual(harness.link.plan.settings, {
        rtcpIntervalMs: 1500,
        disableRtcpRemb: true,
        appDataSframe: true
    })
    harness.session.cleanup()
})

/** SFrame on the app data takes both gates: with either off the peer expects no trailer. */
test('one sframe gate alone does not turn sframe on for the app data', () => {
    const harness = createSession()

    harness.session.applyVoipSettings(
        WaVoipSettings.fromJson(JSON.stringify({ sframe: { enable_sframe: '1' } }))
    )

    assert.equal(harness.link.plan.settings?.appDataSframe, false)
    assert.equal(harness.link.plan.settings?.rtcpIntervalMs, null)
    assert.equal(harness.link.plan.settings?.disableRtcpRemb, false)
    harness.session.cleanup()
})

test('unreadable settings publish nothing', () => {
    const harness = createSession()

    harness.session.applyVoipSettings(null)

    assert.deepEqual(harness.link.updates, [])
    harness.session.cleanup()
})

/**
 * Without this the call outlives its media: live to the manager, mute on the wire,
 * and invisible to the library's consumer, who is told nothing at all.
 */
test('a media side that loses its last relay ends the call, under a reason of its own', () => {
    const harness = createSession()

    harness.link.events.onRelayLost('raw_udp_no_return_path')

    assert.deepEqual(harness.ended, [EndCallReason.RelayLost])
    harness.session.cleanup()
})

/** A hangup tears the media down on its way out; that must not end the call twice. */
test('a relay loss on a call that already ended is not ended again', () => {
    const harness = createSession()
    harness.call.applyTransition({ type: 'terminated', reason: EndCallReason.UserEnded })

    harness.link.events.onRelayLost('closed')

    assert.deepEqual(harness.ended, [])
    harness.session.cleanup()
})

test('media going active moves a connecting call to active and declares its mute state', () => {
    const harness = createSession()
    harness.call.applyTransition({ type: 'local_accepted' })

    harness.link.events.onActive()

    assert.equal(harness.call.stateData.state, CallState.Active)
    assert.equal(harness.sent.length, 1, 'the one post-active mute_v2 goes out')
    harness.link.events.onActive()
    assert.equal(harness.sent.length, 1, 'and only once')
    harness.session.cleanup()
})

test('a call that has not been accepted does not go active on media alone', () => {
    const harness = createSession()

    harness.link.events.onActive()

    assert.notEqual(harness.call.stateData.state, CallState.Active)
    assert.equal(harness.sent.length, 0)
    harness.session.cleanup()
})

test('muting publishes the mute to the media, which keeps the stream alive', () => {
    const harness = createSession()
    harness.call.applyTransition({ type: 'local_accepted' })
    harness.call.applyTransition({ type: 'media_connected' })

    harness.session.setMute(true)
    harness.session.setMute(true)

    assert.deepEqual(harness.link.sections('muted'), [true], 'a repeated toggle publishes nothing')
    harness.session.cleanup()
})

test('tearing the call down stops its media', () => {
    const harness = createSession()

    harness.session.cleanup()

    assert.equal(harness.link.stopped, true)
})

function remoteEvents(messages: WaCallMediaMessage[]): {
    readonly events: WaCallMediaLinkEvents
    readonly counts: { active: number; lost: string[] }
} {
    const counts = { active: 0, lost: [] as string[] }
    return {
        counts,
        events: {
            onActive: () => {
                counts.active++
            },
            onRelayLost: (reason) => {
                counts.lost.push(reason)
            },
            onReaction: () => {},
            onInboundAudio: () => {},
            onInboundVideoRtp: () => {},
            onInboundVideo: () => {},
            onOutboundAudioFinished: () => {},
            onPlan: (message) => {
                messages.push(message)
            }
        }
    }
}

/** A host joining then has the whole plan, and the numbers show when it missed one. */
test('remote media numbers the plan, whole first and in changes after', async () => {
    const messages: WaCallMediaMessage[] = []
    const link = new WaRemoteCallMedia(CALL_ID, remoteEvents(messages).events)

    await link.apply({ mediaType: 'audio', muted: false })
    await link.apply({ muted: true })

    assert.deepEqual(
        messages.map((message) => ({ seq: message.seq, full: message.full, plan: message.plan })),
        [
            { seq: 0, full: true, plan: { mediaType: 'audio', muted: false } },
            { seq: 1, full: false, plan: { muted: true } }
        ]
    )
    assert.equal(messages[0].callId, CALL_ID)
    assert.deepEqual(link.snapshot(), {
        v: 1,
        callId: CALL_ID,
        seq: 1,
        full: true,
        plan: { mediaType: 'audio', muted: true }
    })
})

test('a host that asks to resync gets the whole plan under the last number', async () => {
    const messages: WaCallMediaMessage[] = []
    const link = new WaRemoteCallMedia(CALL_ID, remoteEvents(messages).events)
    await link.apply({ mediaType: 'audio' })
    await link.apply({ muted: true })

    link.handleEvent({ type: 'resync', lastSeq: 0 })

    const resent = messages.at(-1)
    assert.equal(resent?.full, true)
    assert.equal(resent?.seq, 1)
    assert.deepEqual(resent?.plan, { mediaType: 'audio', muted: true })
})

test('remote media reports the host going active once, and its relay losses', () => {
    const messages: WaCallMediaMessage[] = []
    const { events, counts } = remoteEvents(messages)
    const link = new WaRemoteCallMedia(CALL_ID, events)

    link.handleEvent({ type: 'active' })
    link.handleEvent({ type: 'active' })
    link.handleEvent({ type: 'relay_lost', reason: 'closed' })

    assert.equal(counts.active, 1)
    assert.deepEqual(counts.lost, ['closed'])
})

test('remote media leaves audio, video and reactions to the host carrying it', () => {
    const link = new WaRemoteCallMedia(CALL_ID, remoteEvents([]).events)

    assert.equal(link.sendReaction(), false)
    assert.equal(link.sendVideoFrame(), 0)
    assert.equal(link.getLiveBufferMs(), 0)
    assert.throws(() => link.feedLiveAudio(), /remotely/)
    assert.throws(() => link.setExternalAudioMode(), /remotely/)
})

test('stopped remote media publishes and reports nothing more', async () => {
    const messages: WaCallMediaMessage[] = []
    const { events, counts } = remoteEvents(messages)
    const link = new WaRemoteCallMedia(CALL_ID, events)

    link.stop()
    await link.apply({ muted: true })
    link.handleEvent({ type: 'active' })

    assert.deepEqual(messages, [])
    assert.equal(counts.active, 0)
})

interface PublishingInternals {
    publish(update: Record<string, unknown>): Promise<void>
    deriveKeys(): { epoch: number } | null
}

/** On a remote host every section is a message on the wire; an unchanged one is noise. */
test('a section identical to the one last published is not handed over again', () => {
    const harness = createSession()
    const settings = WaVoipSettings.fromJson(JSON.stringify({ vid_rc: { disable_rtcp_remb: '1' } }))

    harness.session.applyVoipSettings(settings)
    harness.session.applyVoipSettings(settings)

    assert.equal(harness.link.sections('settings').length, 1)
    harness.session.cleanup()
})

test('an update keeps only the sections that changed, and an empty one is not sent', async () => {
    const harness = createSession()
    const internals = harness.session as unknown as PublishingInternals

    await internals.publish({ mediaType: 'audio', muted: false })
    await internals.publish({ mediaType: 'audio', muted: true })
    await internals.publish({ mediaType: 'audio', muted: true })

    assert.deepEqual(harness.link.updates, [{ mediaType: 'audio', muted: false }, { muted: true }])
    harness.session.cleanup()
})

/** A relay list handed over again is how a media side with no leg left is asked to dial. */
test('relays are handed over again even when they did not change', async () => {
    const harness = createSession()
    const internals = harness.session as unknown as PublishingInternals
    const relays = { endpoints: [], selfPid: 1, peerPid: 2 }

    await internals.publish({ relays })
    await internals.publish({ relays: { ...relays } })

    assert.equal(harness.link.sections('relays').length, 2)
    harness.session.cleanup()
})

/** The accept re-derives the keys the ack already did; that is not a key change. */
test('keys derived again to the same material keep their epoch', () => {
    const harness = createSession()
    harness.call.encryptionKey = new Uint8Array(32).fill(7)
    const internals = harness.session as unknown as PublishingInternals

    const first = internals.deriveKeys()
    const again = internals.deriveKeys()
    harness.call.encryptionKey = new Uint8Array(32).fill(8)
    const changed = internals.deriveKeys()

    assert.ok(first && again && changed)
    assert.equal(again.epoch, first.epoch)
    assert.equal(changed.epoch, first.epoch + 1)
    harness.session.cleanup()
})
