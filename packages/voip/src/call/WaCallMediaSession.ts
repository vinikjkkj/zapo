import type { Logger } from 'zapo-js'
import { toUserJid } from 'zapo-js/protocol'
import { type BinaryNode, getFirstNodeChild, getNodeChildrenByTag } from 'zapo-js/transport'
import { toError, uint8TimingSafeEqual } from 'zapo-js/util'

import type {
    WaCallMediaEvent,
    WaCallMediaKeys,
    WaCallMediaMessage,
    WaCallMediaPlanUpdate,
    WaCallMediaRelay,
    WaCallMediaRelays,
    WaCallMediaSettings,
    WaCallMediaSsrcs,
    WaCallMediaVideo,
    WaCallReaction
} from '@zapo-js/voip-media'

import { readUInt32BE } from '../bytes.js'
import { derivePerJidSrtpKey } from '../crypto/encryption.js'
import {
    generateSecureSsrc,
    WA_AUDIO_CALL_SSRC_SLOTS,
    WA_SSRC_SLOT,
    WA_VIDEO_CALL_SSRC_SLOTS
} from '../crypto/ssrc.js'
import { parseRelayFromAck } from '../relay/relay-ack.js'
import {
    buildScreenShareStanza,
    parseScreenShareNode,
    type PeerScreenShare,
    WA_SCREEN_SHARE_STATE
} from '../signaling/screen-share.js'
import {
    buildAcceptReceiptStanza,
    buildAcceptStanza,
    buildMuteV2Stanza,
    buildPreacceptStanza,
    buildRaiseHandStanza,
    buildRejectStanza,
    buildRelaylatencyForwardStanza,
    buildRelayLatencyStanza,
    buildTerminateStanza,
    buildTransportStanza,
    buildVideoStateStanza,
    decryptCallKey,
    extractNodeInfo,
    extractRelayEndpoints,
    needsDecryption,
    parseMuteV2,
    parseRaiseHandState,
    parseVideoStateNode,
    WA_VIDEO_STATE,
    WA_VIDEO_UPGRADE_RESULT,
    WA_VIDEO_UPGRADE_TIMEOUT_MS,
    type WaVideoUpgradeResult
} from '../signaling/signaling.js'
import { parseVoipSettings, type WaVoipSettings } from '../signaling/voip-settings.js'
import {
    CallDirection,
    CallMediaType,
    CallState,
    EndCallReason,
    type InboundVideoFrame,
    type InboundVideoRtpPacket,
    type PeerVideoStateChange,
    type RelayEndpoint,
    type WaVoipDeps
} from '../types.js'

import { type CallInfo } from './call-state.js'
import type { WaCallMediaLink, WaCallMediaLinkEvents } from './media-link.js'
import {
    type PeerVideoReadyGateReason,
    type PeerVideoReadyTrigger,
    WaPeerVideoReadyGate
} from './WaPeerVideoReadyGate.js'

/**
 * Stream slots a video call registers with the relay and an audio call does not: what
 * an accepted upgrade has to add. Derived from the two lists, so a slot added to the
 * video set later reaches the upgrade path on its own.
 */
const VIDEO_ONLY_SSRC_SLOTS: readonly number[] = WA_VIDEO_CALL_SSRC_SLOTS.filter(
    (slot) => !WA_AUDIO_CALL_SSRC_SLOTS.includes(slot as never)
)

/** Memory guard on a set fed straight from remote stanzas, not a protocol limit. */
const MAX_TRACKED_RAISED_HANDS = 32

/** Same kind of guard as {@link MAX_TRACKED_RAISED_HANDS}, one per peer device. */
const MAX_TRACKED_PEER_APP_DATA_SSRCS = 32

/** Sections and keys of `<voip_settings>` that describe the app-data stream. */
const VOIP_SETTINGS_OPTIONS_SECTION = 'options'
const VOIP_SETTINGS_SFRAME_SECTION = 'sframe'
const ENABLE_APP_DATA_STREAM_KEY = 'enable_app_data_stream'
const APP_DATA_STREAM_VERSION_KEY = 'app_data_stream_version'
const ENABLE_SFRAME_KEY = 'enable_sframe'
const ENABLE_SFRAME_RX_KEY = 'enable_sframe_rx'

/** Whether the profile asked for inbound `<video>` transaction ids to be enforced. */
const VIDEO_STATE_TXN_RECV_ENFORCE_KEY = 'video_state_txn_id_recv_enforce'

/**
 * Whether the server announced SFrame for this call's app data. It takes both gates:
 * with either off the peer expects no trailer and reads the message straight out of the
 * SRTP payload. Absent keys resolve to off.
 */
function resolveAppDataSframe(settings: WaVoipSettings): boolean {
    return (
        settings.getFlag(VOIP_SETTINGS_SFRAME_SECTION, ENABLE_SFRAME_KEY, false) &&
        settings.getFlag(VOIP_SETTINGS_SFRAME_SECTION, ENABLE_SFRAME_RX_KEY, false)
    )
}

/** Deep equality for plan values: bytes by content, arrays and objects field by field. */
function samePlanValue(left: unknown, right: unknown): boolean {
    if (left === right) return true
    if (left instanceof Uint8Array || right instanceof Uint8Array) {
        if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) return false
        if (left.length !== right.length) return false
        for (let i = 0; i < left.length; i++) {
            if (left[i] !== right[i]) return false
        }
        return true
    }
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right)) return false
        return (
            left.length === right.length && left.every((item, i) => samePlanValue(item, right[i]))
        )
    }
    if (left && right && typeof left === 'object' && typeof right === 'object') {
        const leftRecord = left as Record<string, unknown>
        const rightRecord = right as Record<string, unknown>
        const keys = Object.keys(leftRecord)
        return (
            keys.length === Object.keys(rightRecord).length &&
            keys.every((key) => samePlanValue(leftRecord[key], rightRecord[key]))
        )
    }
    return false
}

/** The shape the media plan gives a relay endpoint the server listed. */
function toMediaRelay(endpoint: RelayEndpoint): WaCallMediaRelay {
    return {
        ip: endpoint.ip,
        port: endpoint.port,
        protocol: endpoint.protocol,
        token: endpoint.token,
        authToken: endpoint.authToken,
        rawToken: endpoint.rawToken,
        rawAuthToken: endpoint.rawAuthToken,
        key: endpoint.key,
        relayId: endpoint.relayId,
        name: endpoint.relayName,
        authTokenId: endpoint.authTokenId
    }
}

/**
 * An upgrade request sent from this side and not yet answered. `settle` resolves the
 * promise `requestVideoUpgrade` handed back; dropping the attempt is what keeps the
 * peer's answer, the guard timer and a local cancel from settling it twice.
 */
interface PendingVideoUpgrade {
    readonly timer: ReturnType<typeof setTimeout>
    readonly settle: (result: WaVideoUpgradeResult) => void
    readonly promise: Promise<WaVideoUpgradeResult>
}

export interface WaCallMediaSessionDelegate {
    emitState(call: CallInfo): void
    emitIncoming(call: CallInfo): void
    emitEnded(call: CallInfo): void
    emitPeerMute(call: CallInfo, muted: boolean): void
    emitInboundAudio(call: CallInfo, data: Float32Array): void
    emitInboundVideoRtp(call: CallInfo, packet: InboundVideoRtpPacket): void
    emitInboundVideo(call: CallInfo, frame: InboundVideoFrame): void
    emitScreenShare(call: CallInfo, share: PeerScreenShare): void
    emitPeerVideoState(call: CallInfo, change: PeerVideoStateChange): void
    emitOutboundAudioFinished(call: CallInfo): void
    emitHandRaise(call: CallInfo, participantJid: string, raised: boolean): void
    /** One in-band emoji reaction, deduplicated: the sender repeats it, this fires once. */
    emitCallReaction?(call: CallInfo, reaction: WaCallReaction): void
    /** A change to the media plan, for a host elsewhere to apply; remote media only. */
    emitMediaPlan?(call: CallInfo, message: WaCallMediaMessage): void
    /** Ends the call through its owner, for a session that has to end itself. */
    endCall(call: CallInfo, reason: EndCallReason): void
}

export interface WaCallMediaSessionOptions {
    readonly deps: WaVoipDeps
    readonly logger: Logger
    readonly info: CallInfo
    readonly delegate: WaCallMediaSessionDelegate
    /** Builds the link to wherever this call's media runs, in this process or elsewhere. */
    readonly createMediaLink: (events: WaCallMediaLinkEvents) => WaCallMediaLink
}

/**
 * The signaling of one call, and the source of its media plan: what the stanzas teach the
 * media is derived into the plan and published on the media link.
 */
export class WaCallMediaSession {
    readonly info: CallInfo

    private readonly deps: WaVoipDeps
    private readonly logger: Logger
    private readonly delegate: WaCallMediaSessionDelegate
    private readonly media: WaCallMediaLink
    private initialTransportSent = false
    private outgoingPreacceptSent = false

    /** The SSRC lists of the plan as last derived; published whole as `ssrcs` on any change. */
    private selfStreamSsrcs: number[] = []
    private peerAudioSsrc = 0
    private peerStreamSsrcs: number[] = []
    private peerVideoStreamSsrcs: number[] = []
    /**
     * App-data SSRCs of the peer's devices: inbound app data is recognized by SSRC,
     * never by payload type, which nothing negotiates.
     */
    private readonly peerAppDataSsrcs = new Set<number>()
    /** Bumped when the SRTP keys change, so the media rebuilds its contexts only then. */
    private keyEpoch = 0
    private lastKeys: WaCallMediaKeys | null = null
    /** Last value published per plan section, so an unchanged one is not sent again. */
    private readonly publishedSections = new Map<string, unknown>()

    /**
     * Our own device jid, as the SSRC derivation takes it: an upgraded call derives a
     * video SSRC long after the jid was resolved.
     */
    private selfDeviceJid = ''
    /** Whether {@link ensureVideoReceivePath} ran; a call negotiated as video never sets it. */
    private videoReceivePathOpened = false
    /**
     * Whether an accepted upgrade opened the local video sender on a call negotiated as
     * audio. Until it does the media drops every video frame: no video RTP leaves before
     * the peer has accepted.
     */
    private videoSendPathOpened = false
    /**
     * Holds our video until the peer can take it: after an accepted peer upgrade, and from the
     * accept on a call born as video. Published as `video.sendHeld`.
     */
    private readonly peerVideoReadyGate = new WaPeerVideoReadyGate((reason, trigger, heldMs) =>
        this.releaseVideoSend(reason, trigger, heldMs)
    )
    /** Whether the one post-active `<mute_v2>` declaration has gone out. */
    private initialMuteAnnounced = false
    /**
     * Our counter behind `transaction-id` on the `<video>` messages we send. Starts at 0
     * so the first one sent is 1, the way the peer numbers its own.
     */
    private videoStateTransactionId = 0
    /** The upgrade request this side sent and is still waiting on, or `null`. */
    private pendingVideoUpgrade: PendingVideoUpgrade | null = null
    /**
     * Whether the peer has an upgrade request outstanding against us, cleared by
     * anything that ends it, ours or its own.
     */
    private peerVideoUpgradeRequested = false
    /**
     * Counts the `<video>` messages from the peer this session has acted on, so an answer
     * that fails to send can tell whether the request it was answering is still the peer's
     * latest word. Sending yields, and a withdrawal arriving in that gap must not be undone
     * by the rollback of the send it raced.
     */
    private peerVideoStateSeen = 0

    private acceptedByJid: string | null = null
    /**
     * Off unless the call's profile turns it on, which is how the reference client reads
     * the same key: with it off a repeated transaction id is counted and logged, and the
     * message is then handled like any other.
     */
    private videoStateTxnEnforced = false

    constructor(options: WaCallMediaSessionOptions) {
        this.deps = options.deps
        this.logger = options.logger
        this.info = options.info
        this.delegate = options.delegate
        this.media = options.createMediaLink({
            onActive: () => this.onMediaActive(),
            onRelayLost: (reason) => this.onRelayLost(reason),
            onReaction: (reaction) => this.delegate.emitCallReaction?.(this.info, reaction),
            onInboundAudio: (pcm) => this.delegate.emitInboundAudio(this.info, pcm),
            onInboundVideoRtp: (packet) => this.delegate.emitInboundVideoRtp(this.info, packet),
            onInboundVideo: (frame) => this.delegate.emitInboundVideo(this.info, frame),
            onOutboundAudioFinished: () => this.delegate.emitOutboundAudioFinished(this.info),
            onPlan: (message) => this.delegate.emitMediaPlan?.(this.info, message)
        })
    }

    get callId(): string {
        return this.info.callId
    }

    shouldIgnoreTerminate(peerJid: string | undefined, reason: string | undefined): boolean {
        return Boolean(
            reason === 'accepted_elsewhere' &&
            peerJid &&
            this.acceptedByJid &&
            peerJid !== this.acceptedByJid
        )
    }

    async initMedia(selfLid: string, peerJid: string): Promise<void> {
        const selfDeviceJid = this.ensureDeviceJid(selfLid)
        const peerDeviceJid = this.ensureDeviceJid(peerJid)
        this.selfDeviceJid = selfDeviceJid
        const relaySlots = this.relaySlots
        this.selfStreamSsrcs = relaySlots.map((slot) => this.ssrcOf(selfDeviceJid, slot))
        this.peerStreamSsrcs = relaySlots.map((slot) => this.ssrcOf(peerDeviceJid, slot))
        if (this.info.mediaType === CallMediaType.Audio) {
            const peerBase = toUserJid(peerJid)
            const peerDevices = (this.info.relayData?.participantJids || [])
                .filter((jid) => toUserJid(jid) === peerBase)
                .map((jid) => this.ensureDeviceJid(jid))
            this.peerStreamSsrcs = this.audioStreamsOf([peerDeviceJid, ...peerDevices])
            this.trackPeerAppDataSsrcs([peerDeviceJid, ...peerDevices])
        } else {
            this.trackPeerAppDataSsrcs([peerDeviceJid])
        }
        this.peerAudioSsrc = this.peerStreamSsrcs[0]
        this.peerVideoStreamSsrcs = this.peerVideoStreamsOf(this.ensureDeviceJid(this.info.peerJid))

        this.logger.debug('call media initialized', {
            callId: this.info.callId,
            selfSsrc: `0x${this.selfStreamSsrcs[0].toString(16).toUpperCase()}`,
            peerSsrc: `0x${this.peerAudioSsrc.toString(16).toUpperCase()}`
        })

        await this.media.start()
        await this.publish({
            mediaType: this.info.mediaType === CallMediaType.Video ? 'video' : 'audio',
            ssrcs: this.buildSsrcs(),
            video: this.videoSection()
        })
    }

    /**
     * Stores the configuration that came in the offer and hands the media what it
     * tunes: the REMB gate, the RTCP interval and the app-data SFrame flag. Called
     * again mid-call for the larger profile that rides an upgrade request.
     *
     * `null` is not an error, it is the common case of an absent or unreadable
     * node, and it leaves the call exactly as it was.
     */
    applyVoipSettings(settings: WaVoipSettings | null): void {
        if (!settings) return

        this.info.voipSettings = settings
        this.videoStateTxnEnforced = settings.getFlag(
            VOIP_SETTINGS_OPTIONS_SECTION,
            VIDEO_STATE_TXN_RECV_ENFORCE_KEY,
            false
        )

        const section: WaCallMediaSettings = {
            rtcpIntervalMs: settings.rtcpIntervalMs,
            disableRtcpRemb: settings.disableRtcpRemb,
            appDataSframe: resolveAppDataSframe(settings)
        }
        void this.publish({ settings: section })

        this.logger.debug('voip settings applied', {
            callId: this.info.callId,
            sectionCount: settings.sectionCount,
            disableRtcpRemb: section.disableRtcpRemb,
            rtcpIntervalMs: section.rtcpIntervalMs,
            appDataStream: settings.getFlag(
                VOIP_SETTINGS_OPTIONS_SECTION,
                ENABLE_APP_DATA_STREAM_KEY,
                false
            ),
            appDataStreamVersion: settings.getNumber(
                VOIP_SETTINGS_OPTIONS_SECTION,
                APP_DATA_STREAM_VERSION_KEY,
                0
            ),
            sframe: settings.getFlag(VOIP_SETTINGS_SFRAME_SECTION, ENABLE_SFRAME_KEY, false),
            sframeRx: settings.getFlag(VOIP_SETTINGS_SFRAME_SECTION, ENABLE_SFRAME_RX_KEY, false)
        })
    }

    resetOutgoingFlags(): void {
        this.initialTransportSent = false
        this.outgoingPreacceptSent = false
    }

    async acceptCall(): Promise<void> {
        if (!this.info.canAccept) {
            throw new Error(
                `Call ${this.info.callId} cannot be accepted in state ${this.info.stateData.state}`
            )
        }

        this.info.applyTransition({ type: 'local_accepted' })
        this.delegate.emitState(this.info)

        const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? ''
        const callId = this.info.callId
        const callCreator = this.info.callCreator
        const peerJid = this.info.peerJid
        const isVideo = this.info.mediaType === CallMediaType.Video
        // Hold before yielding: the peer's `<mute_v2>` answering the accept must find it held.
        if (isVideo) this.holdBornVideoSend()

        const peerBase = toUserJid(peerJid)
        const participantPeers =
            this.info.relayData?.participantJids?.filter(
                (jid) => toUserJid(jid) === peerBase && /:\d+@/.test(jid)
            ) || []
        const participantPeerJid =
            participantPeers.find((jid) => !/:0@/.test(jid)) || participantPeers[0]
        this.acceptedByJid = participantPeerJid || peerJid
        const acceptedPeerDeviceJid = this.ensureDeviceJid(this.acceptedByJid)
        this.peerAudioSsrc = this.ssrcOf(acceptedPeerDeviceJid)
        this.peerVideoStreamSsrcs = this.peerVideoStreamsOf(acceptedPeerDeviceJid)
        await this.publishSsrcsAndKeys(this.deriveKeys())

        try {
            const transportNode = buildTransportStanza(peerJid, callId, callCreator, meId, '1', '1')
            await this.deps.lowLevelCoordinator.sendNode(transportNode)
        } catch (err: unknown) {
            this.logger.error('error sending transport', {
                message: toError(err).message
            })
        }

        if (this.info.encryptionKey) {
            const acceptStanza = await buildAcceptStanza(
                this.deps,
                this.info.callId,
                this.info.peerJid,
                this.info.callCreator,
                isVideo
            )

            try {
                await this.deps.lowLevelCoordinator.sendNode(acceptStanza)
            } catch (err: unknown) {
                this.logger.error('accept send error', {
                    message: toError(err).message
                })
            }
        }

        await this.publish({ relays: this.relaysSection(), accepted: true })

        this.logger.debug('call accepted', { callId })
    }

    async rejectCall(reason: EndCallReason = EndCallReason.Declined): Promise<void> {
        this.info.applyTransition({ type: 'local_rejected', reason })
        this.delegate.emitState(this.info)

        const node = buildRejectStanza(this.info.peerJid, this.info.callId, this.info.callCreator)
        try {
            await this.deps.lowLevelCoordinator.sendNode(node)
        } catch (err) {
            this.logger.warn('reject send failed', { message: toError(err).message })
        }
        this.cleanup()
    }

    async endCall(reason: EndCallReason = EndCallReason.UserEnded): Promise<void> {
        if (this.info.isEnded) return

        const connectedAt = this.info.stateData.connectedAt
        const audioDurationMs = connectedAt ? Date.now() - connectedAt.getTime() : undefined

        this.info.applyTransition({ type: 'terminated', reason })

        const terminateTarget = this.acceptedByJid ?? this.info.peerJid
        const node = buildTerminateStanza(
            terminateTarget,
            this.info.callId,
            this.info.callCreator,
            audioDurationMs
        )
        this.delegate.emitEnded(this.info)
        this.delegate.emitState(this.info)
        try {
            await this.deps.lowLevelCoordinator.sendNode(node)
        } catch (err) {
            this.logger.warn('terminate send failed', { message: toError(err).message })
        }
        this.cleanup()
    }

    /**
     * Mutes or unmutes our own capture and announces it to the peer.
     *
     * Muting stays local: the media keeps sending silence, so the stream and its SSRC
     * stay alive. A no-op toggle sends nothing; the once-per-call declaration a
     * starting call needs is {@link announceInitialMuteState}.
     */
    setMute(muted: boolean): void {
        if (!this.info.isActive) return
        if (this.info.stateData.audioMuted === muted) return

        this.info.applyTransition({ type: 'audio_mute_changed', muted })
        this.delegate.emitState(this.info)

        void this.publish({ muted })

        // Fire-and-forget: the microphone is already off and a failed send is only logged.
        const node = buildMuteV2Stanza(
            this.acceptedByJid ?? this.info.peerJid,
            this.info.callId,
            this.info.callCreator,
            muted
        )
        void this.deps.lowLevelCoordinator.sendNode(node).catch((err) => {
            this.logger.warn('mute_v2 announcement failed', {
                muted,
                message: toError(err).message
            })
        })
    }

    /**
     * Announces this side's microphone state once, just after the call goes active.
     * Measured on the wire: both ends of a reference call send it. Without it the peer
     * has nothing to show for this side until the first toggle, which on a call that is
     * never muted never comes. Fire-and-forget, sent once.
     */
    private announceInitialMuteState(): void {
        if (this.initialMuteAnnounced) return
        this.initialMuteAnnounced = true

        const node = buildMuteV2Stanza(
            this.acceptedByJid ?? this.info.peerJid,
            this.info.callId,
            this.info.callCreator,
            this.info.stateData.audioMuted
        )
        void this.deps.lowLevelCoordinator.sendNode(node).catch((err) => {
            this.logger.warn('initial mute_v2 announcement failed', {
                callId: this.info.callId,
                message: toError(err).message
            })
        })
    }

    /**
     * Raises or lowers the local hand and announces it to the peer. Idempotent.
     *
     * The local state moves only after the stanza leaves, so a failed send cannot leave
     * this side believing the peer saw a hand that never arrived; the error is rethrown.
     */
    async setHandRaised(raised: boolean): Promise<void> {
        if (!this.info.isActive) return
        if (this.info.stateData.handRaised === raised) return

        const node = buildRaiseHandStanza(
            this.acceptedByJid ?? this.info.peerJid,
            this.info.callId,
            this.info.callCreator,
            raised
        )

        try {
            await this.deps.lowLevelCoordinator.sendNode(node)
        } catch (err) {
            this.logger.warn('raise hand send failed', {
                raised,
                message: toError(err).message
            })
            throw err
        }

        this.info.applyTransition({ type: 'hand_raise_changed', raised })
        this.delegate.emitState(this.info)
    }

    /**
     * Starts or stops sharing the screen on this call, and tells the peer. The share is not
     * a stream of its own: the screen rides the video stream the call already has, so this
     * only changes what the peer is told the picture *is*, and switching the content is the
     * caller's job. Idempotent, and a no-op on an inactive call.
     *
     * @throws when the send fails, leaving the state untouched, and - starting a share
     * only - on a group call or on a call carrying no video yet
     * ({@link requestVideoUpgrade} first).
     */
    async setScreenShare(sharing: boolean): Promise<void> {
        if (!this.info.isActive) return
        if (this.info.stateData.screenSharing === sharing) return

        if (sharing) {
            if (this.info.groupJid) {
                throw new Error(`Call ${this.info.callId} is a group call, which cannot be shared`)
            }
            if (!this.videoSendActive) {
                throw new Error(`Call ${this.info.callId} carries no video to share the screen on`)
            }
        }

        const peerDeviceJid = this.acceptedByJid ?? this.info.peerJid
        const state = sharing ? WA_SCREEN_SHARE_STATE.Started : WA_SCREEN_SHARE_STATE.Stopped

        try {
            await this.deps.lowLevelCoordinator.sendNode(
                buildScreenShareStanza(
                    peerDeviceJid,
                    this.info.callId,
                    this.info.callCreator,
                    state
                )
            )
        } catch (err) {
            this.logger.warn('screen share request failed', {
                sharing,
                message: toError(err).message
            })
            throw err
        }

        this.info.applyTransition({ type: 'screen_share_changed', sharing })
        this.delegate.emitState(this.info)

        this.logger.debug('screen share state announced', {
            callId: this.info.callId,
            sharing
        })
    }

    async loadAudio(audioPath: string): Promise<void> {
        await this.media.loadAudio(audioPath)
        this.logger.debug('audio loaded for call', { callId: this.info.callId })
    }

    setExternalAudioMode(enabled: boolean): void {
        this.media.setExternalAudioMode(enabled)
        if (enabled) {
            this.logger.debug('external audio mode enabled', { callId: this.info.callId })
        }
    }

    feedLiveAudio(data: Float32Array): number {
        return this.media.feedLiveAudio(data)
    }

    feedLiveVideo(data: Uint8Array, timestampUs: number): number {
        return this.media.sendVideoFrame(data, timestampUs)
    }

    getLiveBufferMs(): number {
        return this.media.getLiveBufferMs()
    }

    async sendIncomingPreaccept(peerJid: string): Promise<void> {
        try {
            const preacceptNode = buildPreacceptStanza(
                peerJid,
                this.info.callId,
                this.info.callCreator
            )
            await this.deps.lowLevelCoordinator.sendNode(preacceptNode)
        } catch (err: unknown) {
            this.logger.error('error sending preaccept', {
                message: toError(err).message
            })
        }
    }

    async sendIncomingRelayLatency(): Promise<void> {
        if (!this.info.relayData) return

        const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? ''
        const callId = this.info.callId
        const callCreator = this.info.callCreator
        const destinationJids = this.info.relayData.participantJids || []
        const seenRelayNames = new Set<string>()

        for (const ep of this.info.relayData.endpoints) {
            const name = ep.relayName || ''
            if (!name || seenRelayNames.has(name)) continue
            seenRelayNames.add(name)

            try {
                const relayData = [
                    {
                        relayName: name,
                        latency: ep.c2rRtt || 0,
                        addressBytes: ep.addressBytes
                    }
                ]
                const relayLatencyNode = buildRelayLatencyStanza(
                    this.info.peerJid,
                    callId,
                    callCreator,
                    relayData,
                    destinationJids,
                    meId
                )
                await this.deps.lowLevelCoordinator.sendNode(relayLatencyNode)
            } catch (err: unknown) {
                this.logger.error('error sending incoming relaylatency', {
                    relayName: name,
                    message: toError(err).message
                })
            }
        }
    }

    async handleCallAccept(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        /**
         * A call we offered as video holds our video from the peer's accept: before anything
         * yields, and only while ringing, so a repeated accept cannot undo a release.
         */
        if (
            this.info.stateData.state === CallState.Ringing &&
            this.info.mediaType === CallMediaType.Video
        ) {
            this.holdBornVideoSend()
        }

        let keys: WaCallMediaKeys | null = null

        if (needsDecryption(nodeInfo.tag)) {
            try {
                const peerCallKey = await decryptCallKey(
                    this.deps,
                    nodeInfo.innerNode,
                    peerJid,
                    this.logger.child({ component: 'signaling' })
                )
                if (peerCallKey) {
                    const ourCallKey = this.info.encryptionKey
                    const keysMatch = ourCallKey
                        ? uint8TimingSafeEqual(ourCallKey, peerCallKey)
                        : false
                    if (!keysMatch && ourCallKey) {
                        const meLid = this.deps.authClient.getCurrentCredentials()?.meLid
                        const meJid = this.deps.authClient.getCurrentCredentials()?.meJid
                        const ourCredJid = meLid || meJid || ''
                        const ourBase = ourCredJid ? toUserJid(ourCredJid) : ''
                        const participants = this.info.relayData?.participantJids || []
                        const ourDeviceJid =
                            participants.find((jid) => {
                                const jBase = toUserJid(jid)
                                return jBase === ourBase && /:\d+@/.test(jid)
                            }) || ourCredJid

                        if (ourDeviceJid && peerJid) {
                            try {
                                keys = this.versionKeys(
                                    derivePerJidSrtpKey(
                                        ourCallKey,
                                        this.ensureDeviceJid(ourDeviceJid)
                                    ),
                                    derivePerJidSrtpKey(peerCallKey, this.ensureDeviceJid(peerJid))
                                )
                                this.logger.debug('srtp re-initialized with peer call_key', {
                                    callId: this.info.callId
                                })
                            } catch (err: unknown) {
                                this.logger.error('per-jid srtp re-derivation failed', {
                                    message: toError(err).message
                                })
                            }
                        }
                    }
                }
            } catch (err: unknown) {
                this.logger.error('accept decrypt error', {
                    message: toError(err).message
                })
            }
        }

        try {
            this.info.applyTransition({ type: 'remote_accepted' })
            this.delegate.emitState(this.info)
        } catch (err) {
            this.logger.trace('call transition skipped', { message: toError(err).message })
        }

        const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? ''
        const meLid = this.deps.authClient.getCurrentCredentials()?.meLid
        const ourJid = meLid || meId
        const ourBase = ourJid ? toUserJid(ourJid) : ''
        const callId = this.info.callId
        const callCreator = this.info.callCreator
        const acceptingDeviceJid =
            this.info.mediaType === CallMediaType.Video && !/:\d+@/.test(peerJid)
                ? peerJid
                : this.info.mediaType === CallMediaType.Video
                  ? this.info.relayData?.participantJids?.find((jid) => {
                        const jidBase = toUserJid(jid)
                        return jidBase !== ourBase && /:[1-9]\d*@/.test(jid)
                    }) || peerJid
                  : peerJid

        this.acceptedByJid = acceptingDeviceJid

        /**
         * The derived SSRC is signaling's guess at the answering device. A stream of
         * the peer already seen on the wire outranks it, and the media keeps that one.
         */
        const acceptedPeerDeviceJid = this.ensureDeviceJid(acceptingDeviceJid)
        this.peerAudioSsrc = this.ssrcOf(acceptedPeerDeviceJid)
        this.logger.debug('accept ssrc assigned', {
            callId,
            jid: acceptedPeerDeviceJid,
            ssrc: `0x${this.peerAudioSsrc.toString(16)}`
        })
        this.peerStreamSsrcs = this.relaySlots.map((slot) =>
            this.ssrcOf(acceptedPeerDeviceJid, slot)
        )
        if (this.info.mediaType === CallMediaType.Audio) {
            const peerBase = toUserJid(peerJid)
            const peerDevices = (this.info.relayData?.participantJids || [])
                .filter((jid) => toUserJid(jid) === peerBase)
                .map((jid) => this.ensureDeviceJid(jid))
            this.peerStreamSsrcs = this.audioStreamsOf([acceptedPeerDeviceJid, ...peerDevices])
            this.trackPeerAppDataSsrcs([acceptedPeerDeviceJid, ...peerDevices])
        } else {
            this.trackPeerAppDataSsrcs([acceptedPeerDeviceJid])
        }
        this.peerVideoStreamSsrcs = this.peerVideoStreamsOf(acceptedPeerDeviceJid)
        await this.publishSsrcsAndKeys(keys ?? this.deriveKeys())

        if (this.info.relayData?.participantJids) {
            const otherDevices = this.info.relayData.participantJids.filter((jid) => {
                if (jid === acceptingDeviceJid) return false
                const jidBase = toUserJid(jid)
                if (jidBase === ourBase) return false
                return true
            })

            for (const deviceJid of otherDevices) {
                try {
                    const terminateNode = buildTerminateStanza(
                        deviceJid,
                        callId,
                        callCreator,
                        undefined,
                        'accepted_elsewhere'
                    )
                    await this.deps.lowLevelCoordinator.sendNode(terminateNode)
                } catch (err: unknown) {
                    this.logger.error('error sending terminate_elsewhere', {
                        deviceJid,
                        message: toError(err).message
                    })
                }
            }
        }

        try {
            const transportNode = buildTransportStanza(
                acceptingDeviceJid,
                callId,
                callCreator,
                meId,
                '1',
                '1'
            )
            await this.deps.lowLevelCoordinator.sendNode(transportNode)
        } catch (err: unknown) {
            this.logger.error('error sending transport', {
                message: toError(err).message
            })
        }

        const acceptMsgId = node.attrs?.id
        if (acceptMsgId) {
            try {
                const receiptNode = buildAcceptReceiptStanza(
                    acceptingDeviceJid,
                    acceptMsgId,
                    callId,
                    callCreator,
                    ourJid
                )
                await this.deps.lowLevelCoordinator.sendNode(receiptNode)
            } catch (err: unknown) {
                this.logger.error('error sending accept receipt', {
                    message: toError(err).message
                })
            }
        }

        // With a leg up the media starts at once; with none it dials the relays it holds.
        await this.publish({ accepted: true })
    }

    async handleCallPreaccept(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        if (this.info.direction === CallDirection.Outgoing && this.info.relayData) {
            const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? ''
            const callId = this.info.callId
            const callCreator = this.info.callCreator

            const destinationJids = this.info.relayData.participantJids || []
            const seenRelayNames = new Set<string>()

            for (const ep of this.info.relayData.endpoints) {
                const name = ep.relayName || ''
                if (!name || seenRelayNames.has(name)) continue
                seenRelayNames.add(name)

                try {
                    const relayData = [
                        {
                            relayName: name,
                            latency: ep.c2rRtt || 0,
                            addressBytes: ep.addressBytes
                        }
                    ]
                    const relayLatencyNode = buildRelayLatencyStanza(
                        this.info.peerJid,
                        callId,
                        callCreator,
                        relayData,
                        destinationJids,
                        meId
                    )
                    await this.deps.lowLevelCoordinator.sendNode(relayLatencyNode)
                } catch (err: unknown) {
                    this.logger.error('error sending relaylatency', {
                        relayName: name,
                        message: toError(err).message
                    })
                }
            }

            if (!this.initialTransportSent) {
                try {
                    const basePeerJid = toUserJid(peerJid)
                    const transportNode = buildTransportStanza(
                        basePeerJid,
                        callId,
                        callCreator,
                        meId
                    )
                    await this.deps.lowLevelCoordinator.sendNode(transportNode)
                    this.initialTransportSent = true
                } catch (err: unknown) {
                    this.logger.error('error sending initial transport', {
                        message: toError(err).message
                    })
                }
            }
        }
    }

    /**
     * Hands the relays a `<transport>` lists to the media. The media keeps dialling
     * nothing new while a leg is open, and dials them once the call has none.
     */
    async handleCallTransport(_node: BinaryNode): Promise<void> {
        const nodeInfo = extractNodeInfo(_node)
        if (!nodeInfo) return

        const relays = extractRelayEndpoints(nodeInfo.innerNode)
        if (relays.length === 0) return

        this.info.relayData = {
            ...this.info.relayData,
            endpoints: relays
        }
        await this.publish({ relays: this.relaysSection() })
    }

    async handleCallAck(node: BinaryNode): Promise<void> {
        const ackType = node.attrs?.type
        if (ackType !== 'offer') return

        const error = node.attrs?.error
        if (error) {
            this.logger.error('ack error', { callId: this.info.callId, error })
            return
        }

        /**
         * A repeat delivery of this ack carries the same ~34 KB base64+JSON payload:
         * applying it twice is harmless, decoding it twice is not free. The skip is for
         * that repeat alone. The other profile the server ships, the larger video one,
         * does reach a call mid-flight - it rides the upgrade request and is applied
         * where that is read, not here.
         */
        if (!this.info.voipSettings) {
            this.applyVoipSettings(parseVoipSettings(node, this.logger))
        }

        const { relays, participantJids, uuid, selfPid, peerPid, hbhKey } = parseRelayFromAck(node)

        if (relays.length === 0) return

        this.info.relayData = {
            endpoints: relays,
            participantJids,
            uuid,
            selfPid,
            peerPid,
            hbhKey
        }

        this.logger.debug('offer ack relays parsed', {
            callId: this.info.callId,
            relayCount: relays.length,
            participantCount: participantJids.length
        })

        if (participantJids.length > 0) {
            const meLid = this.deps.authClient.getCurrentCredentials()?.meLid
            const meId = this.deps.authClient.getCurrentCredentials()?.meJid
            const ourCredJid = meLid || meId || ''
            const ourBase = ourCredJid ? toUserJid(ourCredJid) : ''

            const ourDeviceJid = this.ensureDeviceJid(
                participantJids.find((jid) => {
                    const jidBase = toUserJid(jid)
                    return jidBase === ourBase && /:\d+@/.test(jid)
                }) || ourCredJid
            )
            this.selfDeviceJid = ourDeviceJid

            const peerJids = participantJids.filter((jid) => {
                const jidBase = toUserJid(jid)
                return jidBase !== ourBase
            })
            const peerCandidate =
                peerJids.find((jid) => /:\d+@/.test(jid) && !/:0@/.test(jid)) || peerJids[0]
            const peerDeviceJid = peerCandidate ? this.ensureDeviceJid(peerCandidate) : undefined

            if (this.info.mediaType === CallMediaType.Video) {
                this.selfStreamSsrcs = WA_VIDEO_CALL_SSRC_SLOTS.map((slot) =>
                    this.ssrcOf(ourDeviceJid, slot)
                )
                if (peerDeviceJid) {
                    this.peerStreamSsrcs = WA_VIDEO_CALL_SSRC_SLOTS.map((slot) =>
                        this.ssrcOf(peerDeviceJid, slot)
                    )
                }
            }

            if (peerDeviceJid) {
                this.peerAudioSsrc = this.ssrcOf(peerDeviceJid)
                this.trackPeerAppDataSsrcs([peerDeviceJid])
            }

            let keys: WaCallMediaKeys | null = null
            if (this.info.encryptionKey) {
                keys = this.deriveKeys()
            } else {
                this.logger.debug('no call_key, srtp not initialized', {
                    callId: this.info.callId
                })
            }
            await this.publishSsrcsAndKeys(keys)
        }

        if (this.info.isInitiator && !this.outgoingPreacceptSent) {
            try {
                const preacceptNode = buildPreacceptStanza(
                    this.info.peerJid,
                    this.info.callId,
                    this.info.callCreator
                )
                await this.deps.lowLevelCoordinator.sendNode(preacceptNode)
                this.outgoingPreacceptSent = true
            } catch (err: unknown) {
                this.logger.error('error sending preaccept (caller)', {
                    message: toError(err).message
                })
            }
        }

        await this.publish({ relays: this.relaysSection() })
    }

    async handleCallRelaylatency(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        const inner = nodeInfo.innerNode
        const callId = inner.attrs?.['call-id'] || this.info.callId
        const callCreator = inner.attrs?.['call-creator'] || this.info.callCreator

        const teNodes = getNodeChildrenByTag(inner, 'te')

        if (teNodes.length === 0) return

        const destinationJids = this.info.relayData?.participantJids || []
        if (destinationJids.length > 0) {
            const forwardNode = buildRelaylatencyForwardStanza(
                peerJid,
                callId,
                callCreator,
                teNodes,
                destinationJids
            )

            try {
                await this.deps.lowLevelCoordinator.sendNode(forwardNode)
            } catch (err: unknown) {
                this.logger.error('error forwarding relaylatency', {
                    message: toError(err).message
                })
            }
        }
    }

    handleRelayElection(node: BinaryNode): void {
        const inner = getFirstNodeChild(node)
        if (!inner) return

        let electedRelayIdx: number | undefined
        if (inner.attrs?.['elected_relay_idx'] !== undefined) {
            const parsed = Number(inner.attrs['elected_relay_idx'])
            if (Number.isSafeInteger(parsed) && parsed >= 0) electedRelayIdx = parsed
        } else if (inner.attrs?.['relay_id'] !== undefined) {
            const parsed = Number(inner.attrs['relay_id'])
            if (Number.isSafeInteger(parsed) && parsed >= 0) electedRelayIdx = parsed
        } else if (inner.content instanceof Uint8Array) {
            const bytes = inner.content
            if (bytes.length >= 4) electedRelayIdx = readUInt32BE(bytes, 0)
            else if (bytes.length > 0) electedRelayIdx = bytes[0]
        }

        if (electedRelayIdx !== undefined) {
            this.info.electedRelayIdx = electedRelayIdx
            this.logger.debug('elected relay index', {
                callId: this.info.callId,
                electedRelayIdx
            })
        }
    }

    /**
     * Records the microphone state an inbound `<mute_v2>` announces, once per change.
     * Nothing goes back: it is an announcement, not a request.
     *
     * Two are dropped on purpose: one from another device of our own account, whose mute
     * state is not the peer's, and one carrying `request-state`, a group-call mechanism
     * WhatsApp's own clients drop on a 1:1 call.
     *
     * On a call born as video, the peer's first announcement after the accept is also
     * the sign that it can take our video; see {@link WaPeerVideoReadyGate}.
     */
    handleCallMuteV2(node: BinaryNode, peerJid: string): void {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        if (this.isOwnAccountJid(peerJid)) {
            this.logger.debug('ignoring mute_v2 from another device of this account', { peerJid })
            return
        }

        const payload = parseMuteV2(nodeInfo.innerNode)
        if (payload.isRequest) {
            this.logger.debug('ignoring mute request on a 1:1 call', { peerJid })
            return
        }

        // Any `<mute_v2>` is the sign, so mark it before the checks that drop unreadable states.
        this.peerVideoReadyGate.markPeerReady('born-video')

        if (payload.muted === null) {
            this.logger.debug('mute_v2 carries no readable mute-state', { peerJid })
            return
        }

        if (this.info.stateData.peerAudioMuted === payload.muted) return

        this.info.stateData.peerAudioMuted = payload.muted
        this.delegate.emitPeerMute(this.info, payload.muted)
        this.delegate.emitState(this.info)
    }

    private isOwnAccountJid(jid: string): boolean {
        const creds = this.deps.authClient.getCurrentCredentials()
        const user = toUserJid(jid)
        return (
            (!!creds?.meLid && user === toUserJid(creds.meLid)) ||
            (!!creds?.meJid && user === toUserJid(creds.meJid))
        )
    }

    /** The `<user_action>` envelope carries several actions; only raise hand is read. */
    handleCallUserAction(node: BinaryNode, peerJid: string): void {
        this.applyPeerRaiseHand(node, peerJid)
    }

    /**
     * Handles a top-level `<raise_hand>`: a message type of its own, not a variant of
     * `<user_action>`, and still sent by current clients. Dropping this handler routes
     * those stanzas to the router's default branch and loses the hand silently.
     */
    handleCallRaiseHand(node: BinaryNode, peerJid: string): void {
        this.applyPeerRaiseHand(node, peerJid)
    }

    /**
     * Records the state a stanza of either shape carried. Idempotent, as the sender is.
     *
     * A hand from another device of our own account is dropped, as `<mute_v2>` drops one:
     * the local hand is `stateData.handRaised`, and letting the echo in lists
     * this account among the remote participants holding one up.
     */
    private applyPeerRaiseHand(node: BinaryNode, peerJid: string): void {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        if (this.isOwnAccountJid(peerJid)) {
            this.logger.debug('ignoring raise hand from another device of this account', {
                peerJid
            })
            return
        }

        const raised = parseRaiseHandState(nodeInfo.innerNode)
        if (raised === null) {
            this.logger.trace('call stanza without raise-hand state, ignored', {
                tag: nodeInfo.tag,
                action: nodeInfo.innerNode.attrs?.action
            })
            return
        }

        const raisedHands = this.info.raisedHands
        if (raisedHands.has(peerJid) === raised) return

        if (raised) {
            if (raisedHands.size >= MAX_TRACKED_RAISED_HANDS) {
                this.logger.debug('raised-hand tracking full, state dropped', {
                    participantJid: peerJid,
                    tracked: raisedHands.size
                })
                return
            }
            raisedHands.add(peerJid)
        } else {
            raisedHands.delete(peerJid)
        }

        this.logger.debug('peer raise hand state changed', {
            participantJid: peerJid,
            raised
        })
        this.delegate.emitHandRaise(this.info, peerJid, raised)
    }

    /**
     * Records the screen-share state a `screen_share` or `screen` stanza carried.
     *
     * Nothing extra goes back: the router already acked it and no screen-share tag
     * appears among the message types - by analogy with the video-state ack, not
     * confirmed. The picture itself arrives as ordinary H.264 on the sender's video
     * stream, which the receive path already handles.
     */
    handleCallScreenShare(node: BinaryNode): void {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        const share = parseScreenShareNode(nodeInfo.innerNode)
        if (!share) {
            this.logger.debug('screen share stanza carried no state', {
                callId: this.info.callId,
                tag: nodeInfo.tag
            })
            return
        }

        this.info.peerScreenShare = share
        this.logger.debug('peer screen share state', {
            callId: this.info.callId,
            tag: nodeInfo.tag,
            state: share.state,
            requestState: share.requestState,
            version: share.version
        })

        this.delegate.emitScreenShare(this.info, share)
        this.delegate.emitState(this.info)
    }

    /**
     * Applies a `<video>` from the peer: a mid-call video state change, and with it the
     * audio-to-video upgrade, which has no stanza of its own.
     *
     * A message whose `transaction-id` does not advance past the last one from this peer is
     * a replay, and is dropped only on a call whose profile asks for that - otherwise it is
     * noted and handled like any other. The bridge's ack is transport only, not an
     * acceptance - that is a `<video state='4'>` coming the other way.
     */
    handleCallVideoState(node: BinaryNode): void {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        const change = parseVideoStateNode(nodeInfo.innerNode)
        if (!change) {
            this.logger.debug('video state stanza without a readable state, ignored', {
                callId: this.info.callId
            })
            return
        }

        if (this.isStaleVideoState(change.transactionId)) {
            this.logger.debug('stale video state', {
                callId: this.info.callId,
                transactionId: change.transactionId,
                lastTransactionId: this.info.peerVideoState?.transactionId ?? null,
                enforced: this.videoStateTxnEnforced
            })
            if (this.videoStateTxnEnforced) return
        }

        // The server attaches a second, larger `<voip_settings>` to an upgrade request,
        // carrying the video sections the audio profile lacks. Only the receiver gets one.
        this.applyVoipSettings(parseVoipSettings(node, this.logger))

        this.info.peerVideoState = change
        this.peerVideoStateSeen++
        this.ensureVideoReceivePath()
        this.applyPeerUpgradeState(change.state)

        this.logger.debug('peer video state changed', {
            callId: this.info.callId,
            state: change.state,
            transactionId: change.transactionId,
            decoderCodec: change.decoderCodec,
            encoderCodec: change.encoderCodec
        })

        this.delegate.emitPeerVideoState(this.info, change)
    }

    /**
     * Whether an inbound `<video>` repeats a transaction already seen.
     *
     * `transaction-id` is the sender's own counter and only ever advances, so every
     * message the peer sends - answers to our own included - carries a number above the
     * last one it sent. One that does not advance is a replay. The counter this side
     * stamps on what it sends is a separate one and is never compared against this.
     *
     * Saying so is not the same as acting on it: whether a replay is dropped is a key of
     * the negotiated profile, and the calls measured so far do not carry it. Answering
     * the question apart from enforcing the answer keeps the log honest on a call that
     * handles the message anyway.
     */
    private isStaleVideoState(transactionId: number | null): boolean {
        if (transactionId === null) return false

        const last = this.info.peerVideoState?.transactionId ?? null
        return last !== null && transactionId <= last
    }

    /**
     * Moves the upgrade handshake on the state the peer just announced.
     *
     * The codes split by who they are about: a request is the peer opening a handshake
     * against us and is only recorded, because answering is the caller's decision, while
     * a terminal code settles a request *we* sent - the same code with nothing pending is
     * the peer closing its own, not an answer to us. Either way it clears the peer's
     * outstanding request: left set, a later {@link requestVideoUpgrade} takes the
     * crossing branch and opens our sender against a peer still on audio.
     */
    private applyPeerUpgradeState(state: number): void {
        switch (state) {
            case WA_VIDEO_STATE.UpgradeRequest:
            case WA_VIDEO_STATE.UpgradeRequestV2:
                this.peerVideoUpgradeRequested = true
                return

            case WA_VIDEO_STATE.UpgradeAccept:
                this.peerVideoUpgradeRequested = false
                if (this.pendingVideoUpgrade) {
                    this.openVideoSendPath()
                    this.settleVideoUpgrade(WA_VIDEO_UPGRADE_RESULT.Accepted)
                    // Announced once the sender exists, under our own counter: the id of
                    // an inbound message belongs to the peer's numbering and reusing it
                    // would emit a number below one we already sent.
                    // Swallowed: the send logs its own failure, and an unhandled
                    // rejection ends the process, taking every live call with it.
                    void this.sendVideoState(WA_VIDEO_STATE.Enabled).catch(() => {})
                }
                return

            case WA_VIDEO_STATE.UpgradeReject:
                this.peerVideoUpgradeRequested = false
                this.settleVideoUpgrade(WA_VIDEO_UPGRADE_RESULT.Rejected)
                return

            case WA_VIDEO_STATE.UpgradeRejectByTimeout:
                this.peerVideoUpgradeRequested = false
                this.settleVideoUpgrade(WA_VIDEO_UPGRADE_RESULT.RejectedByTimeout)
                return

            case WA_VIDEO_STATE.Error:
                this.peerVideoUpgradeRequested = false
                this.settleVideoUpgrade(WA_VIDEO_UPGRADE_RESULT.Failed)
                return

            case WA_VIDEO_STATE.UpgradeCancel:
            case WA_VIDEO_STATE.UpgradeCancelByTimeout:
                this.peerVideoUpgradeRequested = false
                return

            /** Peer camera on: releases our video held after the peer's upgrade. */
            case WA_VIDEO_STATE.Enabled:
                this.peerVideoReadyGate.markPeerReady('upgrade')
                return

            /**
             * A camera going off, and also how a peer takes back a request nobody
             * answered in time - measured, and it is what this side sends for that too.
             * Left outstanding, the next {@link acceptVideoUpgrade} would announce video
             * against a peer that has gone back to audio and stopped listening.
             */
            case WA_VIDEO_STATE.Disabled:
                this.peerVideoUpgradeRequested = false
                return

            default:
                return
        }
    }

    /**
     * Asks the peer to turn this audio call into a video call, and resolves with how that
     * ended. **No video RTP leaves until the peer accepts**: the accept is what opens the
     * local sender. The request goes out as `UpgradeRequestV2`, the 1:1 code -
     * `UpgradeRequest` is the group one. A crossing request answers the peer's instead of
     * sending a second, and a second call while one is in flight joins it. Throws when the
     * call is not active or already carries video.
     *
     * Nothing has to be added to `<capability>`: the peer gates the upgrade on indices 4
     * and 11, which an audio offer already carries. Order derived, not captured.
     */
    async requestVideoUpgrade(): Promise<WaVideoUpgradeResult> {
        if (!this.info.isActive) {
            throw new Error(`Call ${this.info.callId} is not active`)
        }
        if (this.videoSendActive) {
            throw new Error(`Call ${this.info.callId} already carries video`)
        }
        if (this.pendingVideoUpgrade) {
            return this.pendingVideoUpgrade.promise
        }
        if (this.peerVideoUpgradeRequested) {
            await this.acceptVideoUpgrade()
            return WA_VIDEO_UPGRADE_RESULT.Accepted
        }

        let settle!: (result: WaVideoUpgradeResult) => void
        const promise = new Promise<WaVideoUpgradeResult>((resolve) => {
            settle = resolve
        })
        const timer = setTimeout(() => {
            this.onVideoUpgradeTimeout()
        }, WA_VIDEO_UPGRADE_TIMEOUT_MS)
        // A guard timer must not keep an otherwise idle program alive.
        timer.unref?.()

        // Armed before the request leaves: the peer can answer while the send is still
        // unwinding, and an answer with no attempt recorded is dropped as stray.
        this.pendingVideoUpgrade = { timer, settle, promise }

        try {
            await this.sendVideoState(WA_VIDEO_STATE.UpgradeRequestV2)
        } catch (err) {
            // Settled only for a second caller that joined this attempt; the first throws.
            this.settleVideoUpgrade(WA_VIDEO_UPGRADE_RESULT.Failed)
            throw err
        }

        this.logger.debug('video upgrade requested', {
            callId: this.info.callId,
            timeoutMs: WA_VIDEO_UPGRADE_TIMEOUT_MS
        })

        return promise
    }

    /**
     * Accepts an upgrade the peer asked for, concluding the handshake and opening the
     * local video sender. No-op when the peer has nothing outstanding: accepting a
     * request never made would announce video on a call the peer thinks is audio.
     *
     * The camera is announced after the accept and after the sender is open, the order the
     * requesting side follows too: `Enabled` claims video is on the wire, so it may not
     * leave before there is a sender, and the sender may not open before the peer knows
     * the upgrade was accepted.
     *
     * Our frames are then held until the peer's camera is on, plus a guard, or three
     * seconds at most; see {@link WaPeerVideoReadyGate}. An upgrade we asked for is not held.
     */
    async acceptVideoUpgrade(): Promise<void> {
        if (!this.peerVideoUpgradeRequested) return

        const seen = this.peerVideoStateSeen
        this.peerVideoUpgradeRequested = false
        try {
            await this.sendVideoState(WA_VIDEO_STATE.UpgradeAccept)
        } catch (err) {
            // The request is still outstanding if the accept never left, and the caller is
            // told so: cleared here, a retry would no-op and the peer would wait forever.
            this.restorePeerRequest(seen)
            throw err
        }

        // Held before the sender opens, so the plan that opens it already holds it.
        this.peerVideoReadyGate.hold('upgrade')
        this.openVideoSendPath()
        // Best effort, unlike the accept: by this point the peer has accepted and the
        // sender is open, so rejecting here would report an upgrade that did happen as
        // having failed. The send logs its own failure.
        await this.sendVideoState(WA_VIDEO_STATE.Enabled).catch(() => {})

        this.logger.debug('video upgrade accepted', { callId: this.info.callId })
    }

    /** Declines an upgrade the peer asked for. No-op when it asked for none. */
    async rejectVideoUpgrade(): Promise<void> {
        if (!this.peerVideoUpgradeRequested) return

        const seen = this.peerVideoStateSeen
        this.peerVideoUpgradeRequested = false
        try {
            await this.sendVideoState(WA_VIDEO_STATE.UpgradeReject)
        } catch (err) {
            // As in acceptVideoUpgrade: a refusal that never left leaves the peer's
            // request outstanding, and clearing it would make the retry a no-op.
            this.restorePeerRequest(seen)
            throw err
        }

        this.logger.debug('video upgrade rejected', { callId: this.info.callId })
    }

    /**
     * Puts back the peer request an answer cleared, when that answer never left.
     *
     * Only when the peer has said nothing since: sending yields, and a withdrawal that
     * lands in that gap already cleared the request for good. Restoring it then would let
     * a later accept open the video sender against a peer back on audio - the same state
     * an unhandled `Disabled` used to leave behind.
     */
    private restorePeerRequest(seen: number): void {
        if (this.peerVideoStateSeen !== seen) return
        this.peerVideoUpgradeRequested = true
    }

    /** Withdraws the request this side sent. No-op when nothing is in flight. */
    async cancelVideoUpgrade(): Promise<void> {
        if (!this.pendingVideoUpgrade) return

        /**
         * No rollback here, unlike accepting and rejecting: those clear a flag, which can
         * be put back, while this settles the caller's promise, which cannot be unsettled.
         * A cancel that fails to leave costs the peer nothing - its own guard timer expires
         * and it withdraws the request itself.
         */
        this.settleVideoUpgrade(WA_VIDEO_UPGRADE_RESULT.Cancelled)
        await this.sendVideoState(WA_VIDEO_STATE.UpgradeCancel)

        this.logger.debug('video upgrade cancelled', { callId: this.info.callId })
    }

    /**
     * Ends a request the peer never answered: this side stops waiting and the call stays
     * audio.
     *
     * The withdrawal travels as `Disabled`, **not** as `UpgradeCancelByTimeout`, whose
     * name invites exactly that swap: the peer's own timer runs a downgrade too, and the
     * cancel codes belong to a deliberate withdrawal ({@link cancelVideoUpgrade}).
     * Nothing is sent once the request is no longer outstanding.
     */
    private onVideoUpgradeTimeout(): void {
        if (!this.pendingVideoUpgrade) return

        this.settleVideoUpgrade(WA_VIDEO_UPGRADE_RESULT.TimedOut)
        // The `Disabled` closes a request of the peer that crossed ours, too.
        this.peerVideoUpgradeRequested = false
        this.logger.debug('video upgrade timed out, staying on audio', {
            callId: this.info.callId,
            timeoutMs: WA_VIDEO_UPGRADE_TIMEOUT_MS
        })

        // Swallowed: logged inside, and an unhandled rejection ends the process.
        void this.sendVideoState(WA_VIDEO_STATE.Disabled).catch(() => {})
    }

    /**
     * Settles the request in flight, if any, and drops it. Every path that ends a
     * handshake goes through here, which is what keeps the resolver single-use.
     */
    private settleVideoUpgrade(result: WaVideoUpgradeResult): void {
        const pending = this.pendingVideoUpgrade
        if (!pending) return

        this.pendingVideoUpgrade = null
        clearTimeout(pending.timer)
        pending.settle(result)
    }

    /**
     * Sends one `<video>` of our own, numbered with the next id of our own counter.
     *
     * The counter belongs to this side alone and only advances; an id read off an inbound
     * `<video>` is never reused, since the peer numbers its messages on its own counter and
     * drops anything of ours that does not move past the last id we sent.
     */
    private async sendVideoState(state: number): Promise<void> {
        this.videoStateTransactionId++
        const id = this.videoStateTransactionId
        const node = buildVideoStateStanza(
            this.acceptedByJid ?? this.info.peerJid,
            this.info.callId,
            this.info.callCreator,
            { state, transactionId: id }
        )

        try {
            await this.deps.lowLevelCoordinator.sendNode(node)
        } catch (err) {
            this.logger.warn('video state send failed', {
                callId: this.info.callId,
                state,
                message: toError(err).message
            })
            throw err
        }
    }

    /**
     * Opens the local video sender on a call negotiated as audio, once both sides have
     * agreed the upgrade. Until it runs the media drops every video frame.
     *
     * Deliberately **not** merged into {@link ensureVideoReceivePath}: the receive path
     * costs nothing and may open on the first sign of peer video, while this one puts our
     * video on the wire and may only open on an agreement. It also has the media register
     * our video SSRCs with the relay, which an audio call never did, or the relay drops
     * what it does not know. Idempotent, and a no-op on a video call.
     */
    private openVideoSendPath(): void {
        this.ensureVideoReceivePath()

        if (this.videoSendPathOpened || this.info.mediaType === CallMediaType.Video) {
            // Nothing to open, but a hold may have started; an unchanged section is not sent.
            void this.publish({ video: this.videoSection() })
            this.announceVideoLive()
            return
        }
        this.videoSendPathOpened = true

        void this.publish({ video: this.videoSection() })
        this.announceVideoLive()

        this.logger.debug('video send path opened mid-call', { callId: this.info.callId })
    }

    /**
     * Records that video is now live on this side, separately from the transport work
     * around it: this is the only part a call negotiated as video also needs.
     */
    private announceVideoLive(): void {
        if (!this.info.stateData.videoOff) return

        try {
            this.info.applyTransition({ type: 'video_state_changed', off: false })
        } catch (err) {
            this.logger.trace('video state transition skipped', {
                message: toError(err).message
            })
            return
        }
        this.delegate.emitState(this.info)
    }

    private get videoSendActive(): boolean {
        return this.info.mediaType === CallMediaType.Video || this.videoSendPathOpened
    }

    /**
     * Opens the video receive path on a call negotiated as audio, so video the peer starts
     * halfway through has somewhere to land: the media subscribes the relay to the peer's
     * video streams and opens the video RTP session the key frame request and the
     * bandwidth estimate ride on. Without them an inbound stream stays a trickle with no
     * decodable start.
     *
     * The local sender stays off - that needs an agreement, {@link openVideoSendPath}.
     * Idempotent, and a no-op on a video call.
     */
    private ensureVideoReceivePath(): void {
        if (this.videoReceivePathOpened || this.info.mediaType === CallMediaType.Video) return
        this.videoReceivePathOpened = true

        const peerDeviceJid = this.ensureDeviceJid(this.acceptedByJid ?? this.info.peerJid)
        this.peerVideoStreamSsrcs = this.peerVideoStreamsOf(peerDeviceJid)
        void this.publish({ ssrcs: this.buildSsrcs(), video: this.videoSection() })

        this.logger.debug('video receive path opened mid-call', {
            callId: this.info.callId,
            peerDeviceJid
        })
    }

    /**
     * The media has no relay leg left, and nothing reopens one. What is left is a
     * call that is live to the manager and mute on the wire.
     *
     * The terminate that follows is the ordinary one, the same a hangup sends,
     * because leaving the peer on a call we cannot carry is that same call
     * seen from their side. Whether the official client terminates here, and
     * with which `reason` attribute, is not captured; if it carries one, that
     * is where it belongs.
     */
    private onRelayLost(reason: string): void {
        if (this.info.isEnded) return

        this.logger.warn('call lost its last relay leg', {
            callId: this.info.callId,
            reason
        })
        this.delegate.endCall(this.info, EndCallReason.RelayLost)
    }

    /** Media is flowing: a call still connecting goes active and declares its mute state. */
    private onMediaActive(): void {
        if (this.info.stateData.state !== CallState.Connecting) return
        try {
            this.info.applyTransition({ type: 'media_connected' })
            this.delegate.emitState(this.info)
            this.announceInitialMuteState()
            this.logger.debug('media flowing, call active', { callId: this.info.callId })
        } catch (err) {
            this.logger.trace('call transition skipped', { message: toError(err).message })
        }
    }

    /** An event from the host that carries this call's media elsewhere. */
    handleMediaEvent(event: WaCallMediaEvent): void {
        this.media.handleEvent(event)
    }

    /** The whole media plan as it stands, or `null` when the media runs in this process. */
    getMediaSnapshot(): WaCallMediaMessage | null {
        return this.media.snapshot()
    }

    handleCallTerminate(): void {
        try {
            this.info.applyTransition({
                type: 'terminated',
                reason: EndCallReason.UserEnded
            })
        } catch (err) {
            this.logger.trace('call transition skipped', { message: toError(err).message })
        }

        this.delegate.emitEnded(this.info)
        this.delegate.emitState(this.info)
        this.cleanup()
    }

    cleanup(): void {
        this.media.stop()
        this.initialTransportSent = false
        this.outgoingPreacceptSent = false
        this.videoReceivePathOpened = false
        // Anything still waiting on a handshake is settled, not left pending forever.
        this.settleVideoUpgrade(WA_VIDEO_UPGRADE_RESULT.Cancelled)
        this.peerVideoUpgradeRequested = false
        this.peerVideoStateSeen = 0
        this.videoSendPathOpened = false
        this.peerVideoReadyGate.cancel()
        this.videoStateTransactionId = 0
        this.acceptedByJid = null
    }

    /**
     * Sends one emoji reaction in-band on the media socket. Returns whether the first
     * packet left; a `false` does not lose it, the retransmission carries it.
     */
    sendReaction(reaction: string): boolean {
        if (!this.info.isActive) {
            this.logger.debug('reaction dropped, call not active', { callId: this.info.callId })
            return false
        }
        return this.media.sendReaction(reaction)
    }

    /**
     * Hands a plan change to the media, leaving out sections equal to the last published ones;
     * `relays` always goes, since resending it asks a leg-less media side to dial. Failures log.
     */
    private async publish(update: WaCallMediaPlanUpdate): Promise<void> {
        let changed: Record<string, unknown> | null = null
        for (const [section, value] of Object.entries(update)) {
            if (
                section !== 'relays' &&
                this.publishedSections.has(section) &&
                samePlanValue(this.publishedSections.get(section), value)
            ) {
                continue
            }
            this.publishedSections.set(section, value)
            ;(changed ??= {})[section] = value
        }
        if (!changed) return

        try {
            await this.media.apply(changed)
        } catch (err: unknown) {
            this.logger.error('media plan update failed', {
                callId: this.info.callId,
                message: toError(err).message
            })
        }
    }

    private publishSsrcsAndKeys(keys: WaCallMediaKeys | null): Promise<void> {
        return this.publish(
            keys ? { ssrcs: this.buildSsrcs(), keys } : { ssrcs: this.buildSsrcs() }
        )
    }

    /** Keeps the last epoch for unchanged keys, so the media's SRTP contexts keep their state. */
    private versionKeys(
        send: WaCallMediaKeys['send'],
        recv: WaCallMediaKeys['recv']
    ): WaCallMediaKeys {
        const last = this.lastKeys
        if (last && samePlanValue(last.send, send) && samePlanValue(last.recv, recv)) {
            return last
        }
        this.lastKeys = { epoch: ++this.keyEpoch, send, recv }
        return this.lastKeys
    }

    private buildSsrcs(): WaCallMediaSsrcs {
        const self = this.selfDeviceJid
        return {
            selfAudio: self ? this.ssrcOf(self, WA_SSRC_SLOT.AUDIO.MAIN) : 0,
            selfVideo: self ? this.ssrcOf(self, WA_SSRC_SLOT.VIDEO.MAIN) : 0,
            selfAppData: self ? this.ssrcOf(self, WA_SSRC_SLOT.APP_DATA.MAIN) : 0,
            selfStreams: [...this.selfStreamSsrcs],
            selfVideoStreams: self ? this.videoOnlyStreamsOf(self) : [],
            peerAudio: this.peerAudioSsrc,
            peerStreams: [...this.peerStreamSsrcs],
            peerVideoStreams: [...this.peerVideoStreamSsrcs],
            peerAppData: [...this.peerAppDataSsrcs]
        }
    }

    private relaysSection(): WaCallMediaRelays | null {
        const relayData = this.info.relayData
        if (!relayData) return null
        return {
            endpoints: relayData.endpoints.map(toMediaRelay),
            selfPid: relayData.selfPid,
            peerPid: relayData.peerPid
        }
    }

    /**
     * What video may flow each way; a media host reads this, not the media type, to capture.
     * `sendHeld` is present only while the peer is not ready for our video.
     */
    private videoSection(): WaCallMediaVideo {
        const videoCall = this.info.mediaType === CallMediaType.Video
        return {
            send: videoCall || this.videoSendPathOpened,
            receive: videoCall || this.videoReceivePathOpened,
            ...(this.peerVideoReadyGate.isHeld && { sendHeld: true })
        }
    }

    /** Holds our video from the accept of a born-video call; published before media can flow. */
    private holdBornVideoSend(): void {
        this.peerVideoReadyGate.hold('born-video')
        void this.publish({ video: this.videoSection() })
    }

    /** Lets our held video go, the gate having opened: the peer is ready, or never said so. */
    private releaseVideoSend(
        reason: PeerVideoReadyGateReason,
        trigger: PeerVideoReadyTrigger,
        heldMs: number
    ): void {
        this.logger.debug('video send released', {
            callId: this.info.callId,
            reason,
            trigger,
            sinceAcceptMs: heldMs
        })
        void this.publish({ video: this.videoSection() })
    }

    private get relaySlots(): readonly number[] {
        return this.info.mediaType === CallMediaType.Video
            ? WA_VIDEO_CALL_SSRC_SLOTS
            : WA_AUDIO_CALL_SSRC_SLOTS
    }

    private ssrcOf(deviceJid: string, slot?: number): number {
        return generateSecureSsrc(this.info.callId, deviceJid, slot)
    }

    /** The audio and app-data streams of every device listed, each once. */
    private audioStreamsOf(deviceJids: readonly string[]): number[] {
        return Array.from(
            new Set(
                deviceJids.flatMap((jid) => [
                    this.ssrcOf(jid, WA_SSRC_SLOT.AUDIO.MAIN),
                    this.ssrcOf(jid, WA_SSRC_SLOT.APP_DATA.MAIN)
                ])
            )
        )
    }

    /** The streams video adds to a device's registration: {@link VIDEO_ONLY_SSRC_SLOTS}. */
    private videoOnlyStreamsOf(deviceJid: string): number[] {
        return VIDEO_ONLY_SSRC_SLOTS.map((slot) => this.ssrcOf(deviceJid, slot))
    }

    /** The peer's three video streams, subscribed to once its video can arrive. */
    private peerVideoStreamsOf(peerDeviceJid: string): number[] {
        return [WA_SSRC_SLOT.VIDEO.MAIN, WA_SSRC_SLOT.VIDEO.FEC, WA_SSRC_SLOT.VIDEO.OOB_NACK].map(
            (slot) => this.ssrcOf(peerDeviceJid, slot)
        )
    }

    private trackPeerAppDataSsrcs(deviceJids: readonly string[]): void {
        for (const jid of deviceJids) {
            if (!jid) continue
            if (this.peerAppDataSsrcs.size >= MAX_TRACKED_PEER_APP_DATA_SSRCS) break
            this.peerAppDataSsrcs.add(this.ssrcOf(jid, WA_SSRC_SLOT.APP_DATA.MAIN))
        }
    }

    private ensureDeviceJid(jid: string): string {
        if (/:\d+@/.test(jid)) return jid
        return jid.replace('@', ':0@')
    }

    /**
     * Derives the SRTP keys from the call key: ours to send, the answering device's to receive.
     * `null` without a call key or on failure, leaving the media's keys as they were.
     */
    private deriveKeys(): WaCallMediaKeys | null {
        const callKey = this.info.encryptionKey
        if (!callKey) {
            this.logger.debug('no call_key, srtp not initialized', { callId: this.info.callId })
            return null
        }

        const meLid = this.deps.authClient.getCurrentCredentials()?.meLid
        const meId = this.deps.authClient.getCurrentCredentials()?.meJid
        const ourCredJid = meLid || meId || ''
        const ourBase = toUserJid(ourCredJid)
        const participants = this.info.relayData?.participantJids || []

        const ourDeviceJid = this.ensureDeviceJid(
            participants.find((jid) => {
                const jBase = toUserJid(jid)
                return jBase === ourBase && /:\d+@/.test(jid)
            }) || ourCredJid
        )

        let rawPeerJid = this.acceptedByJid || this.info.peerJid
        if (!this.acceptedByJid) {
            const peerFromParticipants = participants.find((jid) => {
                const jBase = toUserJid(jid)
                return jBase !== ourBase
            })
            if (peerFromParticipants) rawPeerJid = peerFromParticipants
        }
        const peerDeviceJid = this.ensureDeviceJid(rawPeerJid)

        try {
            const keys = this.versionKeys(
                derivePerJidSrtpKey(callKey, ourDeviceJid),
                derivePerJidSrtpKey(callKey, peerDeviceJid)
            )
            this.logger.debug('srtp per-jid keys initialized', {
                callId: this.info.callId,
                sendJid: ourDeviceJid,
                recvJid: peerDeviceJid
            })
            return keys
        } catch (err: unknown) {
            this.logger.debug('srtp key derivation failed', {
                callId: this.info.callId,
                message: toError(err).message
            })
            return null
        }
    }
}
