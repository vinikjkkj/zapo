import type { Logger } from 'zapo-js'
import { normalizeDeviceJid, toUserJid } from 'zapo-js/protocol'
import {
    type BinaryNode,
    findNodeChild,
    getFirstNodeChild,
    getNodeChildrenByTag
} from 'zapo-js/transport'
import { toError, tryAsNumber, uint8TimingSafeEqual } from 'zapo-js/util'

import {
    dialableRelayEndpoints,
    WA_VIDEO_QUALITY,
    type WaCallMediaEvent,
    type WaCallMediaGroup,
    type WaCallMediaKeys,
    type WaCallMediaMessage,
    type WaCallMediaPlanUpdate,
    type WaCallMediaRelay,
    type WaCallMediaRelays,
    type WaCallMediaSettings,
    type WaCallMediaSsrcs,
    type WaCallMediaVideo,
    type WaCallMediaVideoSubscription,
    type WaCallReaction
} from '@zapo-js/voip-media'

import { readUInt32BE } from '../bytes.js'
import { derivePerJidSrtpKey, generateCallKey } from '../crypto/encryption.js'
import { WA_AUDIO_CALL_SSRC_SLOTS, WA_SSRC_SLOT, WA_VIDEO_CALL_SSRC_SLOTS } from '../crypto/ssrc.js'
import { groupParticipantAccountKey, isSameDeviceJid, toDeviceJid } from '../jid.js'
import { parseRelayFromAck } from '../relay/relay-ack.js'
import {
    type GroupCallRoster,
    type GroupInfoParticipant,
    readGroupCallRoster
} from '../signaling/group-info.js'
import {
    buildScreenShareStanza,
    parseScreenShareNode,
    type PeerScreenShare,
    WA_SCREEN_SHARE_STATE
} from '../signaling/screen-share.js'
import {
    buildAcceptReceiptStanza,
    buildAcceptStanza,
    buildEncRekeyStanza,
    buildHeartbeatStanza,
    buildMuteRequestStanza,
    buildMuteV2Stanza,
    buildPeerStateStanza,
    buildPreacceptStanza,
    buildRaiseHandStanza,
    buildRejectStanza,
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
    toCallServerJid,
    WA_PEER_STATE,
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
    type CallVideoSubscription,
    EndCallReason,
    type InboundVideoFrame,
    type InboundVideoRtpPacket,
    type PeerVideoStateChange,
    type RelayData,
    type RelayEndpoint,
    type WaVoipDeps
} from '../types.js'

import { type CallInfo, type WaCallParticipantMedia } from './call-state.js'
import {
    adoptableRelayEndpoints,
    adoptedRelayTransport,
    groupDevicePids,
    groupSenderDeviceJids,
    sameRelayCredentials,
    sameRelayEndpointSet,
    selectVideoSubscriptions,
    WaCallDerivations
} from './group-media-plan.js'
import {
    applyGroupUpdate,
    createGroupComposition,
    diffGroupParticipants,
    isGroupParticipantLeaving,
    WA_CALL_PARTICIPANT_STATE,
    type WaCallGroupParticipant,
    type WaGroupComposition,
    type WaGroupCompositionDiff
} from './group-participants.js'
import type { WaCallMediaLink, WaCallMediaLinkEvents } from './media-link.js'
import {
    type PeerVideoReadyGateReason,
    type PeerVideoReadyTrigger,
    WaPeerVideoReadyGate
} from './WaPeerVideoReadyGate.js'

/** Slots a video call registers with the relay and an audio call does not: what an upgrade adds. */
const VIDEO_ONLY_SSRC_SLOTS: readonly number[] = WA_VIDEO_CALL_SSRC_SLOTS.filter(
    (slot) => !WA_AUDIO_CALL_SSRC_SLOTS.includes(slot as never)
)

/** Memory guard on a set fed straight from remote stanzas, not a protocol limit. */
const MAX_TRACKED_RAISED_HANDS = 32

/** Same kind of guard as {@link MAX_TRACKED_RAISED_HANDS}, one per peer device. */
const MAX_TRACKED_PEER_APP_DATA_SSRCS = 32

/** One entry per device the stanzas name: 32 connected participants, five devices each. */
const MAX_TRACKED_PARTICIPANT_MEDIA = 160

/** How long a connected sender may go unheard before we report it invisible; RTCP counts as heard. */
const PEER_INVISIBLE_AFTER_MS = 20_000

/** Every connected member of a group call sends the call a `<heartbeat>` this often. */
const HEARTBEAT_INTERVAL_MS = 10_000
/** How often that is checked. */
const PEER_INVISIBLE_SWEEP_MS = 5_000

/** Least time between two changes of the video subscriptions. */
const VIDEO_SUBSCRIPTION_MIN_INTERVAL_MS = 2_000

/** Duration of the frame the codec encodes; the server's `frame_ms` has to match to bundle. */
const CODEC_FRAME_MS = 60
/** The bundle the official 1:1 client sends at `maxfpp` 2; more is not sent. */
const MAX_AUDIO_FRAMES_PER_PACKET = 2

/** Frames per audio packet: `rc.maxfpp`, capped at 2, and 1 unless `frame_ms` is our 60 ms. */
function resolveAudioFramesPerPacket(settings: WaVoipSettings): number {
    const frameMs = settings.audioFrameMs ?? CODEC_FRAME_MS
    const maxFramesPerPacket = settings.audioMaxFramesPerPacket ?? 1
    if (frameMs !== CODEC_FRAME_MS || maxFramesPerPacket < 2) return 1
    return Math.min(Math.trunc(maxFramesPerPacket), MAX_AUDIO_FRAMES_PER_PACKET)
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

/** The `<terminate>` reason for an offer the server refused. */
const SETUP_FAILED_REASON = 'setup_failed'

/** Stands in for the `<group_info>` of an update that carried none. */
const NO_LISTED_PARTICIPANTS: readonly GroupInfoParticipant[] = []

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

/** Our own jid as the credentials name it, lid first; empty before login. */
export function selfJidOf(deps: Pick<WaVoipDeps, 'authClient'>): string {
    const creds = deps.authClient.getCurrentCredentials()
    return creds?.meLid || creds?.meJid || ''
}

/** The `transaction-id` of a `group_update`: its `<group_info>`'s, else the wrapper's. */
export function readGroupUpdateTransactionId(inner: BinaryNode): number | null {
    return (
        tryAsNumber(findNodeChild(inner, 'group_info')?.attrs?.['transaction-id']) ??
        tryAsNumber(inner.attrs?.['transaction-id'])
    )
}

type SendLogLevel = 'trace' | 'warn' | 'error'

/** One relay as our `<te>` names it. */
interface OwnRelayLatency {
    readonly relayName: string
    readonly latency: number
    readonly addressBytes: Uint8Array
}

/** An upgrade request this side sent and nobody answered yet; dropped once settled. */
interface PendingVideoUpgrade {
    readonly timer: ReturnType<typeof setTimeout>
    readonly settle: (result: WaVideoUpgradeResult) => void
    readonly promise: Promise<WaVideoUpgradeResult>
}

export interface WaCallMediaSessionDelegate {
    emitState(call: CallInfo): void
    emitIncoming(call: CallInfo): void
    emitEnded(call: CallInfo): void
    /** `participantJid` is the device that announced it, device 0 bare. */
    emitPeerMute(call: CallInfo, muted: boolean, participantJid?: string): void
    emitInboundAudio(call: CallInfo, data: Float32Array): void
    emitInboundVideoRtp(
        call: CallInfo,
        packet: InboundVideoRtpPacket,
        participantJid?: string
    ): void
    emitInboundVideo(call: CallInfo, frame: InboundVideoFrame, participantJid?: string): void
    emitScreenShare(call: CallInfo, share: PeerScreenShare, participantJid?: string): void
    emitPeerVideoState(call: CallInfo, change: PeerVideoStateChange, participantJid?: string): void
    emitOutboundAudioFinished(call: CallInfo): void
    emitHandRaise(call: CallInfo, participantJid: string, raised: boolean): void
    /** One in-band emoji reaction, deduplicated: the sender repeats it, this fires once. */
    emitCallReaction?(call: CallInfo, reaction: WaCallReaction, participantJid?: string): void
    /** A participant asked us to mute, with `request-state` as it arrived. Nothing is muted. */
    emitMuteRequested?(call: CallInfo, participantJid: string, requestState: string): void
    /** A group participant's media started or stopped reaching us. */
    emitParticipantMedia?(call: CallInfo, participantJid: string, receiving: boolean): void
    /** One group participant's decoded audio, before the mix. */
    emitParticipantAudio?(call: CallInfo, participantJid: string, pcm: Float32Array): void
    /** The server turned a group call into a video call, at `upgraderJid`'s request when known. */
    emitVideoUpgraded?(call: CallInfo, upgraderJid: string | null): void
    /** Whether anything takes {@link emitInboundAudio} right now; absent means always. */
    wantsInboundAudio?(): boolean
    /** A change to the media plan, for a host elsewhere to apply; remote media only. */
    emitMediaPlan?(call: CallInfo, message: WaCallMediaMessage): void
    /** Who joined, left or moved on a group call; `call.groupComposition` is the result. */
    emitParticipantsChanged?(call: CallInfo, diff: WaGroupCompositionDiff): void
    /** A problem the call carries on through. */
    emitError?(call: CallInfo, error: Error): void
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
    /** Monotonic clock the video hold is timed on, in ms; `performance.now` by default. */
    readonly now?: () => number
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
    /** Relays our own `<relaylatency>` already named; bounded by the relays the server lists. */
    private readonly announcedRelayNames = new Set<string>()
    /** Relays the media heard answer, with the round trip it measured; only these are named. */
    private readonly answeredRelays = new Map<string, number | undefined>()
    /** Set once setup first asks for our `<relaylatency>`; a relay answering later is named then. */
    private relayLatencyOpened = false

    /** The SSRC lists of the plan as last derived; published whole as `ssrcs` on any change. */
    private selfStreamSsrcs: number[] = []
    private peerAudioSsrc = 0
    private peerStreamSsrcs: number[] = []
    private peerVideoStreamSsrcs: number[] = []
    /** App-data SSRCs of the peer's devices: inbound app data is recognized by SSRC alone. */
    private readonly peerAppDataSsrcs = new Set<number>()
    /** Bumped when the SRTP keys change, so the media rebuilds its contexts only then. */
    private keyEpoch = 0
    private lastKeys: WaCallMediaKeys | null = null
    /** Last value published per plan section, so an unchanged one is not sent again. */
    private readonly publishedSections = new Map<string, unknown>()

    /** Our own device jid, as the SSRC derivation takes it. */
    private selfDeviceJid = ''
    /** Whether {@link ensureVideoReceivePath} ran; a call negotiated as video never sets it. */
    private videoReceivePathOpened = false
    /** Whether an accepted upgrade opened our video sender on a call negotiated as audio. */
    private videoSendPathOpened = false
    /** Holds our video until the peer can take it; published as `video.sendHeld`. */
    private readonly peerVideoReadyGate: WaPeerVideoReadyGate
    /** Whether the one post-active `<mute_v2>` declaration has gone out. */
    private initialMuteAnnounced = false
    /** Our counter behind `transaction-id` on the `<video>` we send; the first one is 1. */
    private videoStateTransactionId = 0
    /** The upgrade request this side sent and is still waiting on, or `null`. */
    private pendingVideoUpgrade: PendingVideoUpgrade | null = null
    /** Whether the peer has an upgrade request outstanding against us. */
    private peerVideoUpgradeRequested = false
    /** Counts the peer's `<video>` acted on, so a failed answer can tell whether it raced one. */
    private peerVideoStateSeen = 0

    private acceptedByJid: string | null = null
    /** Whether our camera is on in a group call; `null` follows the call's media type. */
    private groupVideoSend: boolean | null = null
    /** Whether the server's `<av_upgrade>` turned this group call into a video call. */
    private groupVideoUpgraded = false
    /** Video subscriptions the app set, in place of the policy's; `null` for the policy. */
    private videoSubscriptionOverride: readonly WaCallMediaVideoSubscription[] | null = null
    private videoSubscriptions: readonly WaCallMediaVideoSubscription[] = []
    private videoSubscriptionsChangedAt: number | null = null
    private videoSubscriptionTimer: ReturnType<typeof setTimeout> | null = null
    /** Since when we have been waiting on each connected group sender's media, by device. */
    private readonly senderWaitingSince = new Map<string, number>()
    private readonly invisibleReported = new Set<string>()
    private invisibleSweep: ReturnType<typeof setInterval> | null = null
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null
    private readonly now: () => number
    /** The relays a `group_update` moved the call to, published in place of the offer's. */
    private adoptedRelays: WaCallMediaRelays | null = null
    private relayGeneration = 0
    /** The `transaction-id` of the newest `group_update` whose `<relay>` was read. */
    private relayTransactionId: number | null = null
    /** The highest `transaction-id` whose rekey this side ran; ordered apart from rosters. */
    private lastHonouredRekeyTransactionId: number | null = null
    /** Whether a repeated `<video>` transaction id is dropped rather than only logged. */
    private videoStateTxnEnforced = false
    private readonly derivations: WaCallDerivations
    /** Account keys of roster entries, which are replaced whole and never mutated. */
    private readonly accountKeys = new WeakMap<WaCallGroupParticipant, string>()
    private selfKeyOf: { readonly jid: string; readonly key: string } | null = null

    constructor(options: WaCallMediaSessionOptions) {
        this.deps = options.deps
        this.logger = options.logger
        this.info = options.info
        this.delegate = options.delegate
        this.now = options.now ?? (() => performance.now())
        this.derivations = new WaCallDerivations(options.info.callId)
        this.peerVideoReadyGate = new WaPeerVideoReadyGate(
            (reason, trigger, heldMs) => this.releaseVideoSend(reason, trigger, heldMs),
            options.now
        )
        this.media = options.createMediaLink({
            onActive: () => this.onMediaActive(),
            onRelayLost: (reason) => this.onRelayLost(reason),
            onRelayAnswered: (name, rttMs) => this.onRelayAnswered(name, rttMs),
            onReaction: (reaction, senderId) =>
                this.delegate.emitCallReaction?.(this.info, reaction, this.senderJidOf(senderId)),
            onInboundAudio: (pcm) => this.delegate.emitInboundAudio(this.info, pcm),
            wantsInboundAudio: () => this.delegate.wantsInboundAudio?.() ?? true,
            onInboundVideoRtp: (packet) =>
                this.delegate.emitInboundVideoRtp(
                    this.info,
                    packet,
                    this.senderJidOf(packet.senderId)
                ),
            onInboundVideo: (frame) =>
                this.delegate.emitInboundVideo(this.info, frame, this.senderJidOf(frame.senderId)),
            onOutboundAudioFinished: () => this.delegate.emitOutboundAudioFinished(this.info),
            onPlan: (message) => this.delegate.emitMediaPlan?.(this.info, message),
            onError: (error) => this.delegate.emitError?.(this.info, error),
            onSenderMedia: (senderId, receiving) => this.handleSenderMedia(senderId, receiving),
            // Only when something listens: every frame of every sender is copied.
            ...(this.delegate.emitParticipantAudio && {
                onSenderAudio: (senderId: string, pcm: Float32Array) => {
                    const participantJid = this.info.groupSenders.get(senderId)
                    if (participantJid) {
                        this.delegate.emitParticipantAudio?.(this.info, participantJid, pcm)
                    }
                }
            })
        })
    }

    get callId(): string {
        return this.info.callId
    }

    private get isGroupCall(): boolean {
        return this.info.isGroupCall
    }

    /** Where our in-call stanzas go: the call itself on a group call, else the answering device. */
    private inCallTarget(): string {
        return this.isGroupCall
            ? toCallServerJid(this.info.callId)
            : (this.acceptedByJid ?? this.info.peerJid)
    }

    /** The media entry of a device, created on first sight; `null` once tracking is full. */
    private participantEntry(deviceJid: string): WaCallParticipantMedia | null {
        const media = this.info.participantMedia
        const existing = media.get(deviceJid)
        if (existing) return existing
        if (media.size >= MAX_TRACKED_PARTICIPANT_MEDIA) {
            this.logger.debug('participant media tracking full, state dropped', {
                callId: this.info.callId,
                participantJid: deviceJid
            })
            return null
        }
        const entry: WaCallParticipantMedia = { deviceJid }
        media.set(deviceJid, entry)
        return entry
    }

    /**
     * The device a media event came from: its sender's on a group call, the answering device on
     * a 1:1 call, `undefined` when a group sender is unknown.
     */
    private senderJidOf(senderId: string | undefined): string | undefined {
        if (senderId !== undefined) return this.info.groupSenders.get(senderId)
        if (this.isGroupCall) return undefined
        return this.toAddressedJid(this.acceptedByJid ?? this.info.peerJid)
    }

    /** Forgets a device that left the call: its media state, and a hand it still had up. */
    private forgetParticipantDevice(deviceJid: string): void {
        const key = this.toAddressedJid(deviceJid)
        this.info.participantMedia.delete(key)
        this.senderWaitingSince.delete(key)
        this.invisibleReported.delete(groupParticipantAccountKey(deviceJid))
        if (this.info.raisedHands.delete(key)) {
            this.delegate.emitHandRaise(this.info, key, false)
        }
    }

    /**
     * Drops an `accepted_elsewhere` from a peer device other than the one that answered a call
     * we placed. Never on an incoming call: there the caller sends it about our own devices.
     */
    shouldIgnoreTerminate(peerJid: string | undefined, reason: string | undefined): boolean {
        return Boolean(
            this.info.direction === CallDirection.Outgoing &&
            reason === 'accepted_elsewhere' &&
            peerJid &&
            this.acceptedByJid &&
            !isSameDeviceJid(peerJid, this.acceptedByJid)
        )
    }

    async initMedia(selfLid: string, peerJid: string): Promise<void> {
        const selfDeviceJid = toDeviceJid(selfLid)
        const peerDeviceJid = toDeviceJid(peerJid)
        this.selfDeviceJid = selfDeviceJid
        const relaySlots = this.relaySlots
        this.selfStreamSsrcs = relaySlots.map((slot) => this.ssrcOf(selfDeviceJid, slot))
        this.peerStreamSsrcs = relaySlots.map((slot) => this.ssrcOf(peerDeviceJid, slot))
        if (this.info.mediaType === CallMediaType.Audio) {
            const peerBase = toUserJid(peerJid)
            const peerDevices = (this.info.relayData?.participantJids || [])
                .filter((jid) => toUserJid(jid) === peerBase)
                .map((jid) => toDeviceJid(jid))
            this.peerStreamSsrcs = this.audioStreamsOf([peerDeviceJid, ...peerDevices])
            this.trackPeerAppDataSsrcs([peerDeviceJid, ...peerDevices])
        } else {
            this.trackPeerAppDataSsrcs([peerDeviceJid])
        }
        this.peerAudioSsrc = this.peerStreamSsrcs[0]
        this.peerVideoStreamSsrcs = this.peerVideoStreamsOf(toDeviceJid(this.info.peerJid))

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
     * Stores the call's `<voip_settings>` and hands the media what it tunes; again mid-call for
     * the profile an upgrade request carries. `null`, an absent or unreadable node, changes nothing.
     */
    applyVoipSettings(settings: WaVoipSettings | null): void {
        if (!settings) return

        this.info.voipSettings = settings
        this.videoStateTxnEnforced = settings.videoStateTxnRecvEnforce

        const section: WaCallMediaSettings = {
            rtcpIntervalMs: settings.rtcpIntervalMs,
            disableRtcpRemb: settings.disableRtcpRemb,
            appDataSframe: settings.sframe && settings.sframeRx,
            audioFramesPerPacket: resolveAudioFramesPerPacket(settings)
        }
        void this.publish({ settings: section })

        this.logger.debug('voip settings applied', {
            callId: this.info.callId,
            sectionCount: settings.sectionCount,
            disableRtcpRemb: section.disableRtcpRemb,
            rtcpIntervalMs: section.rtcpIntervalMs,
            audioFramesPerPacket: section.audioFramesPerPacket,
            appDataStream: settings.appDataStream,
            appDataStreamVersion: settings.appDataStreamVersion,
            sframe: settings.sframe,
            sframeRx: settings.sframeRx
        })
    }

    async acceptCall(): Promise<void> {
        if (!this.info.canAccept) {
            throw new Error(
                `Call ${this.info.callId} cannot be accepted in state ${this.info.stateData.state}`
            )
        }

        this.info.applyTransition({ type: 'local_accepted' })
        this.delegate.emitState(this.info)

        const callId = this.info.callId
        const callCreator = this.info.callCreator
        const peerJid = this.info.peerJid
        const isVideo = this.info.mediaType === CallMediaType.Video
        // Hold before yielding: the peer's `<mute_v2>` answering the accept must find it held.
        if (isVideo) this.holdBornVideoSend()

        // The offer's sender (a bare jid is device 0), not a companion from participantJids.
        const acceptedPeerDeviceJid = toDeviceJid(peerJid)
        this.acceptedByJid = acceptedPeerDeviceJid
        this.peerAudioSsrc = this.ssrcOf(acceptedPeerDeviceJid)
        this.peerVideoStreamSsrcs = this.peerVideoStreamsOf(acceptedPeerDeviceJid)
        await this.publishSsrcsAndKeys(this.deriveKeys())

        await this.sendLogged(
            () => buildTransportStanza(peerJid, callId, callCreator, '1', '1'),
            'error sending transport'
        )

        // A group offer carries no key: it arrives over `enc_rekey` once the accept is in.
        if (this.info.encryptionKey || this.isGroupCall) {
            const acceptStanza = await buildAcceptStanza(
                this.deps,
                this.info.callId,
                this.info.peerJid,
                this.info.callCreator,
                isVideo,
                this.isGroupCall
            )
            await this.sendLogged(() => acceptStanza, 'accept send error')
        }
        this.startHeartbeat()

        await this.publish({ relays: this.relaysSection(), accepted: true })

        this.logger.debug('call accepted', { callId })
    }

    async rejectCall(reason: EndCallReason = EndCallReason.Declined): Promise<void> {
        this.info.applyTransition({ type: 'local_rejected', reason })
        this.delegate.emitState(this.info)

        const node = buildRejectStanza(
            this.info.peerJid,
            this.info.callId,
            this.info.callCreator,
            this.isGroupCall
        )
        await this.sendLogged(() => node, 'reject send failed', 'warn')
        this.cleanup()
    }

    /** Ends the call; on a group call only this side leaves, as {@link leaveCall}. */
    async endCall(reason: EndCallReason = EndCallReason.UserEnded): Promise<void> {
        if (this.info.isEnded) return
        await this.terminate(reason, undefined)
    }

    /**
     * Leaves a group call the others stay on: one reason-less terminate to the call itself.
     * @throws on a call that is no group's.
     */
    async leaveCall(reason: EndCallReason = EndCallReason.UserEnded): Promise<void> {
        if (!this.isGroupCall) {
            throw new Error(`call ${this.info.callId} is not a group call, end it instead`)
        }
        if (this.info.isEnded) return
        await this.terminate(reason, undefined)
    }

    /** The terminate of this call: to the call itself on a group call, else the answering device. */
    buildTerminateStanza(audioDurationMs?: number, wireReason?: string): BinaryNode {
        return buildTerminateStanza(
            this.inCallTarget(),
            this.info.callId,
            this.info.callCreator,
            audioDurationMs,
            wireReason
        )
    }

    private async terminate(reason: EndCallReason, wireReason: string | undefined): Promise<void> {
        const connectedAt = this.info.stateData.connectedAt
        const audioDurationMs = connectedAt ? Date.now() - connectedAt.getTime() : undefined

        this.info.applyTransition({ type: 'terminated', reason })

        const node = this.buildTerminateStanza(audioDurationMs, wireReason)
        this.delegate.emitEnded(this.info)
        this.delegate.emitState(this.info)
        await this.sendLogged(() => node, 'terminate send failed', 'warn')
        this.cleanup()
    }

    /** Mutes our capture and announces it; the media keeps sending silence on the same SSRC. */
    setMute(muted: boolean): void {
        if (!this.info.isActive) return
        if (this.info.stateData.audioMuted === muted) return

        this.info.applyTransition({ type: 'audio_mute_changed', muted })
        this.delegate.emitState(this.info)

        void this.publish({ muted })
        this.sendDetached(this.muteV2Stanza(muted), 'mute_v2 announcement failed', 'warn', {
            muted
        })
    }

    /** Announces our microphone state once the call is active; the peer shows nothing until then. */
    private announceInitialMuteState(): void {
        if (this.initialMuteAnnounced) return
        this.initialMuteAnnounced = true
        this.sendDetached(
            this.muteV2Stanza(this.info.stateData.audioMuted),
            'initial mute_v2 announcement failed'
        )
    }

    /** Raises or lowers our hand; the state moves only once the stanza left, else it rethrows. */
    async setHandRaised(raised: boolean): Promise<void> {
        if (!this.info.isActive) return
        if (this.info.stateData.handRaised === raised) return

        const node = buildRaiseHandStanza(
            this.inCallTarget(),
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

    /** `screen_share_id` of the last start or stop sent; each one sent takes the next. */
    private screenShareId = 0

    /**
     * Tells the peer our video stream now carries the screen, or no longer; feeding it is the
     * caller's job. @throws when the send fails, or to start one on a call with no video yet.
     */
    async setScreenShare(sharing: boolean): Promise<void> {
        if (!this.info.isActive) return
        if (this.info.stateData.screenSharing === sharing) return

        if (sharing && !this.videoSendActive) {
            throw new Error(`Call ${this.info.callId} carries no video to share the screen on`)
        }

        const peerDeviceJid = this.inCallTarget()
        const state = sharing ? WA_SCREEN_SHARE_STATE.Started : WA_SCREEN_SHARE_STATE.Stopped

        try {
            await this.deps.lowLevelCoordinator.sendNode(
                buildScreenShareStanza(
                    peerDeviceJid,
                    this.info.callId,
                    this.info.callCreator,
                    state,
                    ++this.screenShareId
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

    /** `0` with our group camera off: nothing leaves after the `<video state='6'>`. */
    feedLiveVideo(data: Uint8Array, timestampUs: number): number {
        if (this.isGroupCall && !this.groupVideoSending) return 0
        return this.media.sendVideoFrame(data, timestampUs)
    }

    getLiveBufferMs(): number {
        return this.media.getLiveBufferMs()
    }

    /** A group callee preaccepts to the call itself, which is where its capability goes. */
    async sendIncomingPreaccept(peerJid: string): Promise<void> {
        await this.sendLogged(
            () =>
                buildPreacceptStanza(
                    peerJid,
                    this.info.callId,
                    this.info.callCreator,
                    this.isGroupCall
                ),
            'error sending preaccept'
        )
    }

    /**
     * One `<relaylatency>` per relay that answered us, each once per call: every device of the
     * peer preaccepts, and a name is claimed before its send yields. Stops once the call has
     * ended. The callee dials only on accept, so it names nothing while it rings.
     */
    async sendRelayLatency(): Promise<void> {
        this.relayLatencyOpened = true
        if (!this.info.relayData) return

        const destinationJids = this.info.relayData.participantJids || []

        for (const relay of this.dialableRelayLatencies()) {
            if (this.info.isEnded) return
            if (this.announcedRelayNames.has(relay.relayName)) continue
            this.announcedRelayNames.add(relay.relayName)
            const sent = await this.sendLogged(
                () =>
                    buildRelayLatencyStanza(
                        this.info.peerJid,
                        this.info.callId,
                        this.info.callCreator,
                        [relay],
                        destinationJids
                    ),
                'error sending relaylatency',
                'error',
                { relayName: relay.relayName }
            )
            if (!sent) this.announcedRelayNames.delete(relay.relayName)
        }
    }

    /**
     * What `<te>` may say about our relays: only the ones we dial and that answered, once per
     * name, with our own latency and address. Naming another makes the peer elect a relay we
     * are not on.
     */
    private dialableRelayLatencies(): OwnRelayLatency[] {
        const seen = new Set<string>()
        const relays: OwnRelayLatency[] = []
        for (const ep of dialableRelayEndpoints(this.info.relayData?.endpoints ?? [])) {
            if (!ep.relayName || !ep.addressBytes || seen.has(ep.relayName)) continue
            if (!this.answeredRelays.has(ep.relayName)) continue
            seen.add(ep.relayName)
            relays.push({
                relayName: ep.relayName,
                latency: ep.c2rRtt ?? this.answeredRelays.get(ep.relayName) ?? 0,
                addressBytes: ep.addressBytes
            })
        }
        return relays
    }

    /** A relay the server listed answered our media; named at once if setup already announced. */
    private onRelayAnswered(name: string, rttMs?: number): void {
        if (this.answeredRelays.has(name)) return
        if (!this.info.relayData?.endpoints.some((ep) => ep.relayName === name)) return
        const measured =
            typeof rttMs === 'number' && Number.isFinite(rttMs) && rttMs >= 0
                ? Math.round(rttMs)
                : undefined
        this.answeredRelays.set(name, measured)
        if (this.relayLatencyOpened) void this.sendRelayLatency()
    }

    /**
     * An `<accept>`: the peer answering a 1:1 call we placed, a group participant joining, or on
     * an incoming 1:1 call another device of this account, which ends our ring.
     */
    async handleCallAccept(node: BinaryNode, peerJid: string): Promise<void> {
        if (
            this.isGroupCall &&
            (this.info.direction === CallDirection.Outgoing || !this.isOwnAccountJid(peerJid))
        ) {
            this.handleGroupAccept(peerJid)
            return
        }
        if (this.info.direction === CallDirection.Incoming) {
            if (!this.isOwnAccountJid(peerJid)) {
                this.logger.warn('accept from another account on an incoming call, ignored', {
                    callId: this.info.callId,
                    from: peerJid
                })
                return
            }
            if (this.info.isRinging) this.handleCallTerminate('accepted_elsewhere')
            return
        }

        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        const answering = this.readAnsweringDevice(nodeInfo.innerNode, peerJid)
        const acceptingDeviceJid = answering.jid
        const acceptedPeerDeviceJid = toDeviceJid(acceptingDeviceJid)

        // Held before anything yields, and only while ringing: a repeated accept cannot undo a release.
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
                        const ourDeviceJid = this.ourRelayDeviceJid()
                        if (ourDeviceJid) {
                            try {
                                keys = this.versionKeys(
                                    derivePerJidSrtpKey(ourCallKey, toDeviceJid(ourDeviceJid)),
                                    derivePerJidSrtpKey(peerCallKey, acceptedPeerDeviceJid)
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

        const ourJid = selfJidOf(this.deps)
        const ourBase = ourJid ? toUserJid(ourJid) : ''
        const callId = this.info.callId
        const callCreator = this.info.callCreator

        this.acceptedByJid = acceptingDeviceJid
        if (answering.pid !== undefined && this.info.relayData) {
            this.info.relayData.peerPid = answering.pid
        }

        // A stream of the peer already seen on the wire outranks this, and the media keeps it.
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
            const peerBase = toUserJid(acceptingDeviceJid)
            const peerDevices = (this.info.relayData?.participantJids || [])
                .filter((jid) => toUserJid(jid) === peerBase)
                .map((jid) => toDeviceJid(jid))
            this.peerStreamSsrcs = this.audioStreamsOf([acceptedPeerDeviceJid, ...peerDevices])
            this.trackPeerAppDataSsrcs([acceptedPeerDeviceJid, ...peerDevices])
        } else {
            this.trackPeerAppDataSsrcs([acceptedPeerDeviceJid])
        }
        this.peerVideoStreamSsrcs = this.peerVideoStreamsOf(acceptedPeerDeviceJid)
        await this.publishSsrcsAndKeys(keys ?? this.deriveKeys())

        if (this.info.relayData?.participantJids) {
            const otherDevices = this.info.relayData.participantJids.filter((jid) => {
                if (isSameDeviceJid(jid, acceptingDeviceJid)) return false
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

        await this.sendLogged(
            () => buildTransportStanza(acceptingDeviceJid, callId, callCreator, '1', '1'),
            'error sending transport'
        )

        const acceptMsgId = node.attrs?.id
        if (acceptMsgId) {
            await this.sendLogged(
                () =>
                    buildAcceptReceiptStanza(
                        acceptingDeviceJid,
                        acceptMsgId,
                        callId,
                        callCreator,
                        ourJid
                    ),
                'error sending accept receipt'
            )
        }

        // With a leg up the media starts at once; with none it dials the relays it holds.
        await this.publish({ accepted: true })
    }

    /** An `<accept>` on a group call; the roster usually connects a call we placed first. */
    private handleGroupAccept(peerJid: string): void {
        if (!this.joinPlacedGroupCall('accept')) {
            this.logger.debug('group accept from a participant', {
                callId: this.info.callId,
                from: peerJid
            })
            return
        }
        this.delegate.emitState(this.info)
        this.startHeartbeat()
        void this.publish({ accepted: true })
    }

    /**
     * Moves a group call we placed out of ringing, once: the first participant joined. The
     * caller emits the state and publishes `accepted`, which is what starts the media.
     */
    private joinPlacedGroupCall(trigger: 'accept' | 'roster'): boolean {
        if (
            this.info.direction !== CallDirection.Outgoing ||
            this.info.stateData.state !== CallState.Ringing
        ) {
            return false
        }
        this.info.applyTransition({ type: 'remote_accepted' })
        this.logger.debug('group call joined', { callId: this.info.callId, trigger })
        return true
    }

    /** Whether the roster lists somebody but us connected. */
    private hasOtherParticipantConnected(): boolean {
        const selfKey = this.selfAccountKey()
        return (this.info.groupComposition?.participants ?? []).some(
            (participant) =>
                participant.state === WA_CALL_PARTICIPANT_STATE.Connected &&
                this.accountKeyOf(participant) !== selfKey
        )
    }

    async handleCallPreaccept(node: BinaryNode, peerJid: string): Promise<void> {
        if (!extractNodeInfo(node)) return
        if (this.info.direction !== CallDirection.Outgoing || !this.info.relayData) return

        await this.sendRelayLatency()
        if (this.initialTransportSent) return
        this.initialTransportSent = await this.sendLogged(
            () => buildTransportStanza(toUserJid(peerJid), this.info.callId, this.info.callCreator),
            'error sending initial transport'
        )
    }

    /**
     * Hands the relays a `<transport>` lists to the media, dialled once the call has no leg; on
     * a group call its `<relay>` is followed like a reissue.
     */
    async handleCallTransport(node: BinaryNode): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        if (this.isGroupCall) {
            await this.adoptReissuedRelays(nodeInfo.innerNode, null)
            return
        }

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
        // A re-rung group offer comes with no relay: the ack of our accept may bring it.
        if (ackType === 'accept' && this.isGroupCall) {
            await this.adoptReissuedRelays(node, null)
            return
        }
        if (ackType !== 'offer') return

        const error = node.attrs?.error
        if (error) {
            this.logger.warn('offer refused by the server, call ended', {
                callId: this.info.callId,
                error
            })
            if (!this.info.isEnded) {
                await this.terminate(EndCallReason.SetupFailed, SETUP_FAILED_REASON)
            }
            return
        }

        // A repeated ack carries the same settings, costly to decode again.
        if (!this.info.voipSettings) {
            this.applyVoipSettings(parseVoipSettings(node, this.logger))
        }

        const relayData = parseRelayFromAck(node)
        const { endpoints, participantJids } = relayData
        if (endpoints.length === 0 || this.adoptedRelays) return

        this.info.relayData = relayData

        this.logger.debug('offer ack relays parsed', {
            callId: this.info.callId,
            relayCount: endpoints.length,
            participantCount: participantJids.length
        })

        if (participantJids.length > 0) {
            const ourJid = selfJidOf(this.deps)
            const ourBase = ourJid ? toUserJid(ourJid) : ''
            const ourDeviceJid = toDeviceJid(this.ourRelayDeviceJid())
            this.selfDeviceJid = ourDeviceJid

            // Until an accept names the answering device, every device of the peer is subscribed.
            const peerDevices = this.acceptedByJid
                ? [toDeviceJid(this.acceptedByJid)]
                : Array.from(
                      new Set(
                          participantJids
                              .filter((jid) => toUserJid(jid) !== ourBase)
                              .map((jid) => toDeviceJid(jid))
                      )
                  )

            if (this.info.mediaType === CallMediaType.Video) {
                this.selfStreamSsrcs = WA_VIDEO_CALL_SSRC_SLOTS.map((slot) =>
                    this.ssrcOf(ourDeviceJid, slot)
                )
                if (peerDevices.length > 0) {
                    this.peerStreamSsrcs = Array.from(
                        new Set(
                            peerDevices.flatMap((jid) =>
                                WA_VIDEO_CALL_SSRC_SLOTS.map((slot) => this.ssrcOf(jid, slot))
                            )
                        )
                    )
                }
            } else if (!this.acceptedByJid && peerDevices.length > 0) {
                this.peerStreamSsrcs = this.audioStreamsOf(peerDevices)
            }

            if (this.acceptedByJid) this.peerAudioSsrc = this.ssrcOf(peerDevices[0])
            this.trackPeerAppDataSsrcs(peerDevices)

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

        if (this.info.isInitiator && !this.outgoingPreacceptSent && !this.isGroupCall) {
            this.outgoingPreacceptSent = await this.sendLogged(
                () =>
                    buildPreacceptStanza(
                        this.info.peerJid,
                        this.info.callId,
                        this.info.callCreator
                    ),
                'error sending preaccept (caller)'
            )
        }

        await this.publish({ relays: this.relaysSection() })
    }

    /**
     * Records the peer's relay latencies and sends nothing back: answering every one made two
     * clients that both answer bounce it between them forever.
     */
    handleCallRelaylatency(node: BinaryNode, peerJid: string): void {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return
        this.logger.trace('peer relay latencies received', {
            callId: this.info.callId,
            from: peerJid,
            relays: getNodeChildrenByTag(nodeInfo.innerNode, 'te').length
        })
    }

    /** Logged only: the media elects its own relay. */
    handleRelayElection(node: BinaryNode): void {
        const inner = getFirstNodeChild(node)
        if (!inner) return

        let electedRelayIdx: number | undefined
        const attr = inner.attrs?.['elected_relay_idx'] ?? inner.attrs?.['relay_id']
        if (attr !== undefined) {
            const parsed = Number(attr)
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
     * Records the microphone state a `<mute_v2>` announces; one from our own account, or a mute
     * request on a 1:1 call, is dropped. Also the born-video sign of {@link WaPeerVideoReadyGate}.
     */
    handleCallMuteV2(node: BinaryNode, peerJid: string): void {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        if (this.isOwnAccountJid(peerJid)) {
            this.logger.debug('ignoring mute_v2 from another device of this account', { peerJid })
            return
        }

        const key = this.toAddressedJid(peerJid)
        const payload = parseMuteV2(nodeInfo.innerNode)
        if (payload.isRequest) {
            if (!this.isGroupCall) {
                this.logger.debug('ignoring mute request on a 1:1 call', { peerJid })
                return
            }
            this.handleMuteRequest(payload.requestState ?? '', key)
            return
        }

        // Any `<mute_v2>` is the sign, so mark it before the checks that drop unreadable states.
        this.peerVideoReadyGate.markPeerReady('born-video')

        if (payload.muted === null) {
            this.logger.debug('mute_v2 carries no readable mute-state', { peerJid })
            return
        }

        const entry = this.participantEntry(key)
        if (this.isGroupCall) {
            if (!entry || entry.audioMuted === payload.muted) return
            entry.audioMuted = payload.muted
        } else {
            if (this.info.stateData.peerAudioMuted === payload.muted) return
            this.info.stateData.peerAudioMuted = payload.muted
            if (entry) entry.audioMuted = payload.muted
        }

        this.delegate.emitPeerMute(this.info, payload.muted, key)
        this.delegate.emitState(this.info)
    }

    /** A participant asked us to mute. Reported, never applied: muting is the app's call. */
    private handleMuteRequest(requestState: string, participantJid: string): void {
        this.logger.debug('mute requested by a participant', {
            callId: this.info.callId,
            participantJid,
            requestState
        })
        this.delegate.emitMuteRequested?.(this.info, participantJid, requestState)
    }

    /**
     * Asks a group participant's device to mute; it decides. An account names its first device.
     * @throws on a 1:1 call, for somebody not on the call, or when the send fails.
     */
    async requestParticipantMute(participantJid: string): Promise<void> {
        if (!this.isGroupCall) {
            throw new Error(`Call ${this.info.callId} is not a group call`)
        }
        const target = this.participantDeviceOf(participantJid)
        if (!target) {
            throw new Error(`${participantJid} is not on call ${this.info.callId}`)
        }
        await this.deps.lowLevelCoordinator.sendNode(
            buildMuteRequestStanza(target, this.info.callId, this.info.callCreator)
        )
        this.logger.debug('mute requested of a participant', {
            callId: this.info.callId,
            participantJid: target
        })
    }

    /** The device a jid names on this call, device 0 bare; an account names its first device. */
    private participantDeviceOf(jid: string): string | null {
        const key = groupParticipantAccountKey(jid)
        const participant = this.info.groupComposition?.participants.find(
            (entry) => this.accountKeyOf(entry) === key
        )
        if (!participant) return null
        if (toUserJid(jid) === jid) {
            const first = participant.devices[0]
            return first ? this.toAddressedJid(first) : null
        }
        const wanted = this.toAddressedJid(jid)
        const device = participant.devices.find(
            (deviceJid) => this.toAddressedJid(deviceJid) === wanted
        )
        return device ? this.toAddressedJid(device) : null
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

    /** A top-level `<raise_hand>`: a message type of its own, still sent beside `<user_action>`. */
    handleCallRaiseHand(node: BinaryNode, peerJid: string): void {
        this.applyPeerRaiseHand(node, peerJid)
    }

    /** Records the hand a stanza of either shape carried; one from our own account is dropped. */
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

    /** Records the screen-share state a `screen_share` or `screen` stanza carried; nothing goes back. */
    handleCallScreenShare(node: BinaryNode, participantJid?: string): void {
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

        const key = this.toAddressedJid(participantJid ?? this.acceptedByJid ?? this.info.peerJid)
        const entry = this.participantEntry(key)
        if (entry) entry.screenShare = share
        if (!this.isGroupCall) this.info.peerScreenShare = share
        this.logger.debug('peer screen share state', {
            callId: this.info.callId,
            participantJid: key,
            tag: nodeInfo.tag,
            state: share.state,
            requestState: share.requestState,
            version: share.version
        })

        this.delegate.emitScreenShare(this.info, share, key)
        this.delegate.emitState(this.info)
    }

    /**
     * Applies a `<video>` from the peer: a video state change, and with it the upgrade handshake.
     * A replayed `transaction-id` is dropped only when the profile enforces it.
     */
    handleCallVideoState(node: BinaryNode, participantJid?: string): void {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        const change = parseVideoStateNode(nodeInfo.innerNode)
        if (!change) {
            this.logger.debug('video state stanza without a readable state, ignored', {
                callId: this.info.callId
            })
            return
        }

        const key = this.toAddressedJid(participantJid ?? this.acceptedByJid ?? this.info.peerJid)
        if (this.isGroupCall) {
            this.applyGroupVideoState(node, change, key)
            return
        }

        if (
            this.isStaleVideoState(
                change.transactionId,
                this.info.peerVideoState?.transactionId ?? null
            )
        ) {
            this.logger.debug('stale video state', {
                callId: this.info.callId,
                transactionId: change.transactionId,
                lastTransactionId: this.info.peerVideoState?.transactionId ?? null,
                enforced: this.videoStateTxnEnforced
            })
            if (this.videoStateTxnEnforced) return
        }

        // An upgrade request carries the larger video profile.
        this.applyVoipSettings(parseVoipSettings(node, this.logger))

        this.info.peerVideoState = change
        this.peerVideoStateSeen++
        this.ensureVideoReceivePath()
        this.applyPeerUpgradeState(change.state)

        const entry = this.participantEntry(key)
        if (entry) entry.video = change

        this.logger.debug('peer video state changed', {
            callId: this.info.callId,
            state: change.state,
            transactionId: change.transactionId,
            decoderCodec: change.decoderCodec,
            encoderCodec: change.encoderCodec
        })

        this.delegate.emitPeerVideoState(this.info, change, key)
    }

    /**
     * Seeds a group call's composition from the `<group_info>` of its offer, leaving out whoever
     * it already reports off the call. An unreadable or empty one seeds nothing.
     */
    seedGroupComposition(inner: BinaryNode): void {
        let roster: GroupCallRoster
        try {
            roster = readGroupCallRoster(inner)
        } catch (err) {
            this.logger.warn('offer carried an unreadable group_info', {
                callId: this.info.callId,
                message: toError(err).message
            })
            return
        }
        if (roster.kind !== 'roster') {
            if (roster.kind === 'empty') {
                this.logger.warn('offer carried a group_info listing nobody, no composition set', {
                    callId: this.info.callId
                })
            }
            return
        }

        const present = roster.participants.filter(
            (participant) => !isGroupParticipantLeaving(participant)
        )
        this.info.groupComposition = createGroupComposition(present)
        // A key that beat the offer was installed before anyone could be keyed with it.
        if (this.info.encryptionKey) void this.syncGroupMedia()
        this.logger.debug('group call composition seeded from the offer', {
            callId: this.info.callId,
            participantCount: present.length,
            connectedLimit: roster.info.connectedLimit
        })
    }

    /**
     * Seeds a group call we join after its ring from what was kept of it: the last roster seen,
     * the server's settings and, when known, its relay. Without a relay the media waits for the
     * one the `group_update` answering our accept brings.
     */
    seedGroupJoin(context: {
        readonly participants: readonly WaCallGroupParticipant[]
        readonly transactionId: number | null
        readonly relayData?: RelayData
        readonly voipSettings?: WaVoipSettings | null
    }): void {
        this.info.groupComposition = createGroupComposition(
            context.participants.filter((participant) => !isGroupParticipantLeaving(participant)),
            context.transactionId
        )
        if (context.relayData) this.info.relayData = context.relayData
        this.applyVoipSettings(context.voipSettings ?? null)
    }

    /** Seeds the composition of a group call we place, from the participants our offer named. */
    seedOutgoingGroupComposition(participants: readonly WaCallGroupParticipant[]): void {
        this.info.groupComposition = createGroupComposition(participants)
    }

    /**
     * Applies a `<group_update>`: first a reissued `<relay>`, whatever the roster says, then the
     * roster, then the rekey it asks of us. A stale roster is dropped but its rekey is not. A
     * roster listing somebody else connected is what connects a call we placed.
     */
    async handleCallGroupUpdate(node: BinaryNode): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return
        const inner = nodeInfo.innerNode

        await this.adoptReissuedRelays(inner, readGroupUpdateTransactionId(inner))

        // Only `av-upgrader` is an upgrade; `av-upgradable` rides every call as a capability.
        const upgrader = findNodeChild(inner, 'av_upgrade')?.attrs?.['av-upgrader']
        if (upgrader) this.applyGroupVideoUpgrade(node, upgrader)

        let roster: GroupCallRoster
        try {
            roster = readGroupCallRoster(inner)
        } catch (err) {
            this.logger.warn('group update carried an unreadable group_info', {
                callId: this.info.callId,
                message: toError(err).message
            })
            return
        }
        if (roster.kind === 'empty') {
            this.logger.warn('group update carried a group_info listing nobody, composition kept', {
                callId: this.info.callId
            })
        }

        const listed = roster.kind === 'roster' ? roster.info.participants : NO_LISTED_PARTICIPANTS
        const composition = this.info.groupComposition ?? createGroupComposition([])
        const transactionId = this.groupUpdateTransactionId(
            inner,
            listed,
            composition,
            roster.kind === 'roster' ? roster.info.transactionId : null
        )
        const rekeyAnnounced =
            (roster.kind === 'roster' && roster.info.rekey) ||
            listed.some((participant) => participant.rekey)
        const outcome = applyGroupUpdate(
            composition,
            {
                transactionId,
                participants: roster.kind === 'roster' ? roster.participants : undefined,
                rekey: rekeyAnnounced
            },
            this.logger
        )

        if (!outcome.applied) {
            this.logger.debug('group update not folded in', {
                callId: this.info.callId,
                discardReason: outcome.discardReason,
                transactionId,
                rekeyAnnounced
            })
            if (rekeyAnnounced && this.acceptAnnouncedRekey(transactionId)) {
                await this.runGroupRekeyFanout(transactionId, listed)
            }
            return
        }

        const rekeyAccepted = rekeyAnnounced && this.acceptAnnouncedRekey(transactionId)
        this.info.groupComposition = outcome.composition
        this.logGroupDiff('group call composition changed', outcome.diff)
        this.forgetDepartedDevices(outcome.diff)
        await this.syncGroupMedia()
        this.refreshVideoSubscriptions()
        // The creator hears no `<accept>`: a roster listing somebody else connected is the join.
        const joined = this.hasOtherParticipantConnected() && this.joinPlacedGroupCall('roster')

        this.delegate.emitParticipantsChanged?.(this.info, outcome.diff)
        this.delegate.emitState(this.info)
        if (joined) {
            this.startHeartbeat()
            await this.publish({ accepted: true })
        }
        if (this.anyoneArrived(composition, outcome.composition)) this.rebroadcastOwnState()

        if (rekeyAccepted) await this.runGroupRekeyFanout(transactionId, listed)
    }

    /**
     * Follows a `<relay>` a `group_update` or `<transport>` reissues: a new generation of every
     * dialable relay, elected first, when addresses, credentials or pids changed. An identical
     * repeat or an older `group_update` publishes nothing; an omitted participant list is kept.
     */
    private async adoptReissuedRelays(
        inner: BinaryNode,
        transactionId: number | null
    ): Promise<void> {
        const {
            endpoints: relays,
            participantJids,
            uuid,
            selfPid,
            peerPid
        } = parseRelayFromAck(inner)
        if (relays.length === 0) return

        const newest = this.relayTransactionId
        if (transactionId !== null && newest !== null && transactionId < newest) {
            this.logger.debug('relay descriptor of an older group update, ignored', {
                callId: this.info.callId,
                transactionId,
                newestTransactionId: newest
            })
            return
        }
        if (transactionId !== null) this.relayTransactionId = transactionId

        const current = this.info.relayData
        const elected = adoptableRelayEndpoints(relays)
        const held = current ? adoptableRelayEndpoints(current.endpoints) : []
        const unchanged =
            current !== undefined &&
            (elected.length > 0
                ? sameRelayCredentials(held, elected) &&
                  current.selfPid === selfPid &&
                  current.peerPid === peerPid
                : sameRelayEndpointSet(current.endpoints, relays))
        if (unchanged) {
            this.logger.debug('relay descriptor reissued, already followed', {
                callId: this.info.callId,
                transactionId,
                endpointCount: relays.length,
                electedRelay: elected[0]?.relayName
            })
            return
        }

        this.info.relayData = {
            endpoints: relays,
            participantJids: current?.participantJids?.length
                ? current.participantJids
                : participantJids,
            uuid: uuid || current?.uuid,
            selfPid,
            peerPid
        }
        if (elected.length === 0) {
            this.logger.debug('relay descriptor reissued with nothing dialable', {
                callId: this.info.callId,
                endpointCount: relays.length
            })
            return
        }

        const endpoints = elected.map((endpoint): WaCallMediaRelay => {
            const relay = toMediaRelay(endpoint)
            const transport = adoptedRelayTransport(endpoint)
            return transport ? { ...relay, transport } : relay
        })
        this.adoptedRelays = {
            endpoints,
            selfPid,
            peerPid,
            generation: ++this.relayGeneration
        }
        this.logger.debug('relay descriptor reissued, call moved', {
            callId: this.info.callId,
            transactionId,
            electedRelay: elected[0].relayName,
            relayNames: [...new Set(elected.map((endpoint) => endpoint.relayName))],
            endpointsPublished: elected.length,
            electedRtt: elected[0].c2rRtt,
            generation: this.relayGeneration,
            selfPid,
            peerPid,
            transports: endpoints.map((endpoint) => endpoint.transport ?? 'default'),
            tokenIds: elected.map((endpoint) => endpoint.tokenId ?? null),
            tokenLengths: elected.map(
                (endpoint) => endpoint.rawToken?.length ?? endpoint.token.length
            ),
            authTokenIds: elected.map((endpoint) =>
                endpoint.authToken ? endpoint.authTokenId : null
            ),
            authTokenLengths: elected.map(
                (endpoint) => endpoint.rawAuthToken?.length ?? endpoint.authToken?.length ?? 0
            )
        })
        await this.publish({ relays: this.adoptedRelays })
    }

    /** Whether the rekey announced under `transactionId` is ours to run; records it when it is. */
    private acceptAnnouncedRekey(transactionId: number): boolean {
        const honoured = this.lastHonouredRekeyTransactionId
        if (honoured !== null && transactionId <= honoured) {
            this.logger.debug('group rekey already answered at this transaction id or newer', {
                callId: this.info.callId,
                transactionId,
                honouredTransactionId: honoured
            })
            return false
        }
        this.lastHonouredRekeyTransactionId = transactionId
        return true
    }

    /**
     * Runs the rekey a `<group_info rekey>` makes us master of: a new call key, installed and sent
     * in one `<enc_rekey>` per device of every other connected participant but `tos_not_accepted`.
     */
    private async runGroupRekeyFanout(
        transactionId: number,
        listed: readonly GroupInfoParticipant[]
    ): Promise<void> {
        const composition = this.info.groupComposition
        const selfKey = this.selfAccountKey()
        if (composition === undefined || selfKey === null) {
            this.logger.warn('group rekey asked of us, not run', {
                callId: this.info.callId,
                transactionId,
                reason: composition === undefined ? 'no_composition' : 'no_self_jid'
            })
            return
        }

        const connected = composition.participants.filter(
            (participant) => participant.state === WA_CALL_PARTICIPANT_STATE.Connected
        )
        const selfConnected = connected.some(
            (participant) => this.accountKeyOf(participant) === selfKey
        )
        if (!selfConnected || connected.length < 2) {
            this.logger.debug('group rekey asked of us, not run', {
                callId: this.info.callId,
                transactionId,
                reason: selfConnected ? 'nobody_else_connected' : 'self_not_connected',
                connectedCount: connected.length
            })
            return
        }

        const termsNotAccepted = new Set(
            listed
                .filter((participant) => participant.tosNotAccepted)
                .map((participant) => groupParticipantAccountKey(participant.jid))
        )

        const callKey = generateCallKey()
        await this.applyCallKey(callKey, transactionId)

        let sent = 0
        let skipped = 0
        let lastError = ''
        const failed: string[] = []
        for (const participant of connected) {
            const accountKey = this.accountKeyOf(participant)
            if (accountKey === selfKey) continue
            if (termsNotAccepted.has(accountKey)) {
                skipped++
                continue
            }
            for (const deviceJid of participant.devices) {
                try {
                    const stanza = await buildEncRekeyStanza(this.deps, {
                        callId: this.info.callId,
                        callCreator: this.info.callCreator,
                        transactionId,
                        peerDeviceJid: deviceJid,
                        callKey
                    })
                    await this.deps.lowLevelCoordinator.sendNode(stanza)
                    sent++
                } catch (err) {
                    failed.push(deviceJid)
                    lastError = toError(err).message
                }
            }
        }

        if (failed.length > 0) {
            this.logger.warn('group rekey did not reach every device', {
                callId: this.info.callId,
                transactionId,
                message: lastError,
                droppedCount: failed.length,
                totalExpected: sent + failed.length,
                sample: failed.slice(0, 3)
            })
        }
        this.logger.debug('group rekey distributed', {
            callId: this.info.callId,
            transactionId,
            connectedCount: connected.length,
            sent,
            failed: failed.length,
            skipped
        })
    }

    /**
     * Installs a group call key, from an `<enc_rekey>` or from our own rekey, and republishes
     * the keys and every sender's. A key equal to the one installed changes nothing; a call
     * that is no group's ignores it.
     */
    async applyCallKey(callKey: Uint8Array, transactionId: number | null): Promise<void> {
        if (!this.isGroupCall) {
            this.logger.debug('call key for a call that is no group, ignored', {
                callId: this.info.callId,
                transactionId
            })
            return
        }
        const installed = this.info.encryptionKey
        if (installed && uint8TimingSafeEqual(installed, callKey)) {
            this.logger.debug('call key repeated, already installed', {
                callId: this.info.callId,
                transactionId
            })
            return
        }

        this.info.encryptionKey = callKey
        this.logger.debug('group call key installed', { callId: this.info.callId, transactionId })
        await this.syncGroupMedia()
    }

    /**
     * Takes the sender of a `<terminate>` off a group call that goes on. Not a roster, so the
     * `transaction-id` the server orders rosters by does not move.
     */
    removeGroupParticipant(peerJid: string | undefined, reason: string | undefined): void {
        const composition = this.info.groupComposition
        const key = peerJid ? groupParticipantAccountKey(peerJid) : null
        const departing =
            key === null
                ? undefined
                : composition?.participants.find(
                      (participant) => this.accountKeyOf(participant) === key
                  )
        if (!composition || !departing) {
            this.logger.debug('group participant left, not on the composition', {
                callId: this.info.callId,
                peerJid: peerJid ?? null,
                reason: reason ?? null
            })
            return
        }

        const remaining = composition.participants.filter(
            (participant) => participant !== departing
        )
        const diff = diffGroupParticipants(
            composition.participants,
            [...remaining, { ...departing, state: WA_CALL_PARTICIPANT_STATE.Terminated }],
            this.logger
        )
        this.info.groupComposition = {
            participants: remaining,
            lastTransactionId: composition.lastTransactionId
        }
        this.forgetDepartedDevices(diff)
        this.logGroupDiff('group participant left the call', diff, {
            peerJid,
            reason: reason ?? null
        })
        void this.syncGroupMedia()

        this.delegate.emitParticipantsChanged?.(this.info, diff)
        this.delegate.emitState(this.info)
    }

    /**
     * The number an update is ordered by: its `<group_info>`'s, else the wrapper's, else the
     * highest a participant carries, else one past the last applied.
     */
    private groupUpdateTransactionId(
        inner: BinaryNode,
        listed: readonly GroupInfoParticipant[],
        composition: WaGroupComposition,
        rosterTransactionId: number | null
    ): number {
        if (rosterTransactionId !== null) return rosterTransactionId
        const own = tryAsNumber(inner.attrs?.['transaction-id'])
        if (own !== null) return own

        let highest: number | null = null
        for (const participant of listed) {
            const id = participant.transactionId
            if (id !== null && (highest === null || id > highest)) highest = id
        }
        return highest ?? (composition.lastTransactionId ?? 0) + 1
    }

    private logGroupDiff(
        message: string,
        diff: WaGroupCompositionDiff,
        context: Record<string, unknown> = {}
    ): void {
        this.logger.debug(message, {
            callId: this.info.callId,
            ...context,
            added: diff.added.length,
            removed: diff.removed.length,
            switched: diff.switched.length,
            devicesAdded: diff.devicesAdded.length,
            devicesRemoved: diff.devicesRemoved.length,
            rekeyRequired: diff.rekeyRequired,
            rekeyReason: diff.rekeyReason,
            participantCount: this.info.groupComposition?.participants.length ?? 0
        })
    }

    private selfAccountKey(): string | null {
        const selfJid = selfJidOf(this.deps) || this.selfDeviceJid
        if (!selfJid) return null
        if (this.selfKeyOf?.jid !== selfJid) {
            this.selfKeyOf = { jid: selfJid, key: groupParticipantAccountKey(selfJid) }
        }
        return this.selfKeyOf.key
    }

    private accountKeyOf(participant: WaCallGroupParticipant): string {
        let key = this.accountKeys.get(participant)
        if (key === undefined) {
            key = groupParticipantAccountKey(participant.jid)
            this.accountKeys.set(participant, key)
        }
        return key
    }

    /** Every device sending into this group call, ourselves left out. */
    private groupSenderDevices(): string[] {
        const composition = this.info.groupComposition
        if (!composition) return []
        return groupSenderDeviceJids(
            composition,
            selfJidOf(this.deps) || this.selfDeviceJid,
            (participant) => this.accountKeyOf(participant)
        )
    }

    /** Whether every sender's video gets keyed: a video call, or video receiving opened. */
    private get groupCoversVideo(): boolean {
        return this.info.mediaType === CallMediaType.Video || this.videoReceivePathOpened
    }

    /** The plan's `group` section, once there is a key and a composition to derive it from. */
    private groupSection(senders: GroupSenders): WaCallMediaGroup | null {
        const callKey = this.info.encryptionKey
        if (!callKey || !this.info.groupComposition) return null
        return this.derivations.groupSection(
            callKey,
            senders.devices,
            senders.streamsOf,
            groupDevicePids(this.info.groupComposition),
            this.videoSubscriptions
        )
    }

    /** The sending devices and their streams, derived once for everything one sync publishes. */
    private groupSenders(): GroupSenders {
        const devices = this.groupSenderDevices()
        const coversVideo = this.groupCoversVideo
        const streams = new Map<string, number[]>()
        return {
            devices,
            streamsOf: (deviceJid) => {
                let found = streams.get(deviceJid)
                if (!found) {
                    found = this.derivations.senderStreams(deviceJid, coversVideo)
                    streams.set(deviceJid, found)
                }
                return found
            }
        }
    }

    /** Republishes what a group call derives from its composition and key, together. */
    private async syncGroupMedia(): Promise<void> {
        if (!this.isGroupCall) return
        const senders = this.groupSenders()
        this.syncGroupSenders(senders.devices)
        const keys = this.info.encryptionKey ? this.deriveKeys() : null
        const group = keys ? this.groupSection(senders) : null
        await this.publish({
            ...(this.selfDeviceJid ? { ssrcs: this.buildSsrcs(senders) } : {}),
            ...(keys ? { keys } : {}),
            ...(group ? { group } : {})
        })
    }

    /** Maps each sender id back to its device, and its media entry to the sender id. */
    private syncGroupSenders(devices: readonly string[]): void {
        const senders = this.info.groupSenders
        senders.clear()
        for (const deviceJid of devices) {
            const senderId = this.derivations.senderId(deviceJid)
            const key = this.toAddressedJid(deviceJid)
            senders.set(senderId, key)
            const entry = this.participantEntry(key)
            if (entry) entry.senderId = senderId
        }
    }

    /** Forgets every device a roster change took off the call. */
    private forgetDepartedDevices(diff: WaGroupCompositionDiff): void {
        for (const removal of diff.removed) {
            for (const deviceJid of removal.participant.devices) {
                this.forgetParticipantDevice(deviceJid)
            }
        }
        for (const change of diff.devicesRemoved) this.forgetParticipantDevice(change.deviceJid)
        for (const change of diff.switched) this.forgetParticipantDevice(change.previousDeviceJid)
    }

    /**
     * Applies a `<video>` a group participant sent: its own camera, per device, ordered by its
     * own counter. None of the 1:1 upgrade handshake applies.
     */
    private applyGroupVideoState(
        node: BinaryNode,
        change: PeerVideoStateChange,
        participantJid: string
    ): void {
        const entry = this.participantEntry(participantJid)
        const last = entry?.video?.transactionId ?? null
        if (this.isStaleVideoState(change.transactionId, last)) {
            this.logger.debug('stale video state', {
                callId: this.info.callId,
                participantJid,
                transactionId: change.transactionId,
                lastTransactionId: last,
                enforced: this.videoStateTxnEnforced
            })
            if (this.videoStateTxnEnforced) return
        }

        this.applyVoipSettings(parseVoipSettings(node, this.logger))
        if (entry) entry.video = change
        this.ensureVideoReceivePath()
        this.refreshVideoSubscriptions()

        this.logger.debug('participant video state changed', {
            callId: this.info.callId,
            participantJid,
            state: change.state,
            transactionId: change.transactionId
        })
        this.delegate.emitPeerVideoState(this.info, change, participantJid)
    }

    /**
     * The server turned this group call into a video call: our receive path opens, the requester's
     * camera goes on, and a camera that stays off is announced as stopped.
     */
    private applyGroupVideoUpgrade(node: BinaryNode, upgrader: string): void {
        const upgraderJid = this.toAddressedJid(upgrader)
        if (this.groupVideoUpgraded) return
        this.groupVideoUpgraded = true

        const asked = this.pendingVideoUpgrade !== null || this.isOwnAccountJid(upgraderJid)
        this.applyVoipSettings(parseVoipSettings(node, this.logger))
        this.ensureVideoReceivePath()
        this.info.mediaType = CallMediaType.Video

        if (asked) {
            this.settleVideoUpgrade(WA_VIDEO_UPGRADE_RESULT.Accepted)
            this.applyGroupVideoSend(true)
        } else if (this.groupVideoSend !== true) {
            this.groupVideoSend = false
            void this.publish({ video: this.videoSection() })
            this.sendVideoStateDetached(WA_VIDEO_STATE.Stopped)
        }

        this.logger.debug('group call upgraded to video', {
            callId: this.info.callId,
            upgraderJid,
            asked
        })
        this.delegate.emitVideoUpgraded?.(this.info, upgraderJid)
    }

    /**
     * Turns our camera on or off on a group call; a 1:1 call uses {@link requestVideoUpgrade}.
     * @throws on a 1:1 call, or when the send fails, leaving the camera as it was.
     */
    async setVideoEnabled(enabled: boolean): Promise<void> {
        if (!this.isGroupCall) {
            throw new Error(`Call ${this.info.callId} is not a group call; request an upgrade`)
        }
        if (!this.info.isActive || this.groupVideoSending === enabled) return

        await this.sendVideoState(enabled ? WA_VIDEO_STATE.Enabled : WA_VIDEO_STATE.Stopped)
        this.applyGroupVideoSend(enabled)
    }

    private get groupVideoSending(): boolean {
        return this.groupVideoSend ?? this.info.mediaType === CallMediaType.Video
    }

    private applyGroupVideoSend(enabled: boolean): void {
        this.groupVideoSend = enabled
        if (enabled) this.ensureVideoReceivePath()
        void this.publish({ video: this.videoSection() })
        if (enabled) {
            this.announceVideoLive()
            return
        }
        if (!this.info.isActive || this.info.stateData.videoOff) return
        this.info.applyTransition({ type: 'video_state_changed', off: true })
        this.delegate.emitState(this.info)
    }

    /**
     * Asks the server to turn a group audio call into a video call: `UpgradeRequest` to the
     * call. Resolves `accepted` once its `<av_upgrade>` arrives, our camera then on, or
     * `timeout`. On a call already carrying video it only turns our camera on.
     */
    private async requestGroupVideoUpgrade(): Promise<WaVideoUpgradeResult> {
        if (!this.info.isActive) {
            throw new Error(`Call ${this.info.callId} is not active`)
        }
        if (this.groupVideoSending) {
            throw new Error(`Call ${this.info.callId} already carries video`)
        }
        if (this.info.mediaType === CallMediaType.Video) {
            await this.setVideoEnabled(true)
            return WA_VIDEO_UPGRADE_RESULT.Accepted
        }
        if (this.pendingVideoUpgrade) return this.pendingVideoUpgrade.promise

        let settle!: (result: WaVideoUpgradeResult) => void
        const promise = new Promise<WaVideoUpgradeResult>((resolve) => {
            settle = resolve
        })
        const timer = setTimeout(() => this.onVideoUpgradeTimeout(), WA_VIDEO_UPGRADE_TIMEOUT_MS)
        timer.unref?.()
        this.pendingVideoUpgrade = { timer, settle, promise }

        try {
            await this.sendVideoState(WA_VIDEO_STATE.UpgradeRequest)
        } catch (err) {
            this.settleVideoUpgrade(WA_VIDEO_UPGRADE_RESULT.Failed)
            throw err
        }
        return promise
    }

    /**
     * Overrides whose video is asked of the SFU; `null` hands it back to the policy: every
     * camera that is on, at most four, once more than two are connected.
     */
    setVideoSubscriptions(subscriptions: readonly CallVideoSubscription[] | null): void {
        this.videoSubscriptionOverride =
            subscriptions === null
                ? null
                : subscriptions.flatMap((subscription) => {
                      const senderId = this.info.participantMedia.get(
                          this.toAddressedJid(subscription.participantJid)
                      )?.senderId
                      return senderId
                          ? [
                                {
                                    senderId,
                                    quality: subscription.quality ?? WA_VIDEO_QUALITY.Default
                                }
                            ]
                          : []
                  })
        this.refreshVideoSubscriptions()
    }

    /** Recomputes the video subscriptions, at most once per {@link VIDEO_SUBSCRIPTION_MIN_INTERVAL_MS}. */
    private refreshVideoSubscriptions(): void {
        if (!this.isGroupCall || this.videoSubscriptionTimer) return
        const next = this.videoSubscriptionOverride ?? this.policyVideoSubscriptions()
        if (samePlanValue(next, this.videoSubscriptions)) return

        const since =
            this.videoSubscriptionsChangedAt === null
                ? Infinity
                : this.now() - this.videoSubscriptionsChangedAt
        if (since < VIDEO_SUBSCRIPTION_MIN_INTERVAL_MS) {
            this.videoSubscriptionTimer = setTimeout(() => {
                this.videoSubscriptionTimer = null
                this.refreshVideoSubscriptions()
            }, VIDEO_SUBSCRIPTION_MIN_INTERVAL_MS - since)
            this.videoSubscriptionTimer.unref?.()
            return
        }

        this.videoSubscriptions = next
        this.videoSubscriptionsChangedAt = this.now()
        this.logger.debug('video subscriptions changed', {
            callId: this.info.callId,
            subscriptions: next.length
        })
        void this.syncGroupMedia()
    }

    private policyVideoSubscriptions(): WaCallMediaVideoSubscription[] {
        const connected = (this.info.groupComposition?.participants ?? []).filter(
            (participant) => participant.state === WA_CALL_PARTICIPANT_STATE.Connected
        ).length
        const senders: { senderId: string; videoEnabled: boolean }[] = []
        for (const [senderId, deviceJid] of this.info.groupSenders) {
            const state = this.info.participantMedia.get(deviceJid)?.video?.state
            senders.push({ senderId, videoEnabled: state === WA_VIDEO_STATE.Enabled })
        }
        return selectVideoSubscriptions(senders, connected)
    }

    /**
     * A group sender's media started or stopped reaching us, as the media host reports it.
     * Edge-triggered: an unchanged state is not reported again.
     */
    handleSenderMedia(senderId: string, receiving: boolean): void {
        const participantJid = this.info.groupSenders.get(senderId)
        if (!participantJid) {
            this.logger.debug('media of an unknown group sender', {
                callId: this.info.callId,
                senderId,
                receiving
            })
            return
        }
        const entry = this.participantEntry(participantJid)
        if (entry) {
            if (entry.receiving === receiving) return
            entry.receiving = receiving
        }
        if (receiving) {
            this.senderWaitingSince.delete(participantJid)
            this.invisibleReported.delete(groupParticipantAccountKey(participantJid))
        } else {
            this.senderWaitingSince.set(participantJid, this.now())
        }
        this.delegate.emitParticipantMedia?.(this.info, participantJid, receiving)
    }

    /**
     * Reports invisible, once, each connected member none of whose devices was heard for
     * {@link PEER_INVISIBLE_AFTER_MS}; nobody while nobody at all is heard, our own path down.
     */
    private sweepInvisibleSenders(): void {
        const media = this.info.participantMedia
        if (!this.hearsAnySender()) return

        const selfKey = this.selfAccountKey()
        const now = this.now()
        for (const participant of this.info.groupComposition?.participants ?? []) {
            if (participant.state !== WA_CALL_PARTICIPANT_STATE.Connected) continue
            const accountKey = this.accountKeyOf(participant)
            if (accountKey === selfKey || this.invisibleReported.has(accountKey)) continue
            if (participant.devices.length === 0) continue

            let silentMs = Infinity
            for (const deviceJid of participant.devices) {
                const key = this.toAddressedJid(deviceJid)
                if (media.get(key)?.receiving === true) {
                    silentMs = -1
                    break
                }
                const since = this.senderWaitingSince.get(key)
                if (since === undefined) this.senderWaitingSince.set(key, now)
                silentMs = Math.min(silentMs, since === undefined ? 0 : now - since)
            }
            if (silentMs < PEER_INVISIBLE_AFTER_MS) continue

            this.invisibleReported.add(accountKey)
            this.reportPeerInvisible(participant.jid, silentMs)
        }
    }

    private hearsAnySender(): boolean {
        for (const entry of this.info.participantMedia.values()) {
            if (entry.receiving === true) return true
        }
        return false
    }

    private reportPeerInvisible(peerJid: string, silentMs: number): void {
        this.logger.debug('reporting a peer invisible', {
            callId: this.info.callId,
            peerJid,
            silentMs: Math.round(silentMs)
        })
        this.sendDetached(
            buildPeerStateStanza(
                this.info.callId,
                this.info.callCreator,
                peerJid,
                WA_PEER_STATE.Invisible
            ),
            'peer_state send failed'
        )
    }

    /** Sends the call a `<heartbeat>` now and on every interval while this group call lasts. */
    private startHeartbeat(): void {
        if (!this.isGroupCall || this.heartbeatTimer || this.info.isEnded) return
        const intervalMs = this.info.voipSettings?.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS
        this.sendHeartbeat()
        this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), intervalMs)
        this.heartbeatTimer.unref?.()
        this.logger.debug('group heartbeat started', { callId: this.info.callId, intervalMs })
    }

    private sendHeartbeat(): void {
        this.sendDetached(
            buildHeartbeatStanza(this.info.callId, this.info.callCreator),
            'heartbeat send failed',
            'trace'
        )
    }

    /** Whether a roster change brought somebody else in, or connected somebody already listed. */
    private anyoneArrived(before: WaGroupComposition, after: WaGroupComposition): boolean {
        const selfKey = this.selfAccountKey()
        const connectedBefore = new Set<string>()
        const listedBefore = new Set<string>()
        for (const participant of before.participants) {
            const key = this.accountKeyOf(participant)
            listedBefore.add(key)
            if (participant.state === WA_CALL_PARTICIPANT_STATE.Connected) connectedBefore.add(key)
        }
        return after.participants.some((participant) => {
            const key = this.accountKeyOf(participant)
            if (key === selfKey) return false
            if (!listedBefore.has(key)) return true
            return (
                participant.state === WA_CALL_PARTICIPANT_STATE.Connected &&
                !connectedBefore.has(key)
            )
        })
    }

    /**
     * Re-announces our own state to the call when somebody arrives, since nothing else tells a
     * newcomer: our mute state always, our hand only while it is up. Video is not replayed.
     */
    private rebroadcastOwnState(): void {
        if (!this.info.isActive) return
        this.sendDetached(
            this.muteV2Stanza(this.info.stateData.audioMuted),
            'state re-broadcast failed'
        )
        if (this.info.stateData.handRaised) {
            this.sendDetached(
                buildRaiseHandStanza(
                    this.inCallTarget(),
                    this.info.callId,
                    this.info.callCreator,
                    true
                ),
                'state re-broadcast failed'
            )
        }
        this.logger.debug('own state re-broadcast to the call', {
            callId: this.info.callId,
            handRaised: this.info.stateData.handRaised
        })
    }

    /** Whether a `<video>` fails to advance the sender's own counter past the last one seen. */
    private isStaleVideoState(transactionId: number | null, last: number | null): boolean {
        return transactionId !== null && last !== null && transactionId <= last
    }

    /**
     * Moves the upgrade handshake on the peer's state: a request is only recorded, a terminal
     * code settles ours. Every code but `Enabled` clears the peer's outstanding request.
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
                    this.sendVideoStateDetached(WA_VIDEO_STATE.Enabled)
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

            case WA_VIDEO_STATE.Enabled:
                this.peerVideoReadyGate.markPeerReady('upgrade')
                return

            // Also how a peer takes back a request nobody answered in time.
            case WA_VIDEO_STATE.Disabled:
                this.peerVideoUpgradeRequested = false
                return

            default:
                return
        }
    }

    /**
     * Asks the peer to turn this audio call into video, resolving with the outcome; no video
     * leaves until it accepts. A crossing request is answered instead, a second call joins the
     * first. @throws when the call is not active or already carries video.
     */
    async requestVideoUpgrade(): Promise<WaVideoUpgradeResult> {
        if (this.isGroupCall) return this.requestGroupVideoUpgrade()
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
        timer.unref?.()

        // Armed before the request leaves: the peer can answer while the send still unwinds.
        this.pendingVideoUpgrade = { timer, settle, promise }

        try {
            await this.sendVideoState(WA_VIDEO_STATE.UpgradeRequestV2)
        } catch (err) {
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
     * Accepts the peer's upgrade request: the accept, then our sender, then `Enabled`, our frames
     * held by {@link WaPeerVideoReadyGate}. No-op when the peer has nothing outstanding.
     */
    async acceptVideoUpgrade(): Promise<void> {
        if (!this.peerVideoUpgradeRequested) return

        const seen = this.peerVideoStateSeen
        this.peerVideoUpgradeRequested = false
        try {
            await this.sendVideoState(WA_VIDEO_STATE.UpgradeAccept)
        } catch (err) {
            this.restorePeerRequest(seen)
            throw err
        }

        // Held before the sender opens, so the plan that opens it already holds it.
        this.peerVideoReadyGate.hold('upgrade')
        this.openVideoSendPath()
        // Best effort: the upgrade did happen, so a failed announcement is only logged.
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
            this.restorePeerRequest(seen)
            throw err
        }

        this.logger.debug('video upgrade rejected', { callId: this.info.callId })
    }

    /** Puts back the peer request an answer that never left cleared, unless the peer spoke since. */
    private restorePeerRequest(seen: number): void {
        if (this.peerVideoStateSeen !== seen) return
        this.peerVideoUpgradeRequested = true
    }

    /** Withdraws the request this side sent. No-op when nothing is in flight. */
    async cancelVideoUpgrade(): Promise<void> {
        if (!this.pendingVideoUpgrade) return

        // No rollback: the promise is settled for good, and the peer's own timer ends its wait.
        this.settleVideoUpgrade(WA_VIDEO_UPGRADE_RESULT.Cancelled)
        await this.sendVideoState(WA_VIDEO_STATE.UpgradeCancel)

        this.logger.debug('video upgrade cancelled', { callId: this.info.callId })
    }

    /**
     * Ends a request the peer never answered, the call staying audio. The withdrawal is
     * `Disabled`, not `UpgradeCancelByTimeout`: the cancel codes are a deliberate withdrawal.
     */
    private onVideoUpgradeTimeout(): void {
        if (!this.pendingVideoUpgrade) return
        if (this.isGroupCall) {
            this.settleVideoUpgrade(WA_VIDEO_UPGRADE_RESULT.TimedOut)
            this.logger.debug('group video upgrade timed out', { callId: this.info.callId })
            return
        }

        this.settleVideoUpgrade(WA_VIDEO_UPGRADE_RESULT.TimedOut)
        this.peerVideoUpgradeRequested = false
        this.logger.debug('video upgrade timed out, staying on audio', {
            callId: this.info.callId,
            timeoutMs: WA_VIDEO_UPGRADE_TIMEOUT_MS
        })

        this.sendVideoStateDetached(WA_VIDEO_STATE.Disabled)
    }

    /** Settles and drops the request in flight; every path ending a handshake comes here. */
    private settleVideoUpgrade(result: WaVideoUpgradeResult): void {
        const pending = this.pendingVideoUpgrade
        if (!pending) return

        this.pendingVideoUpgrade = null
        clearTimeout(pending.timer)
        pending.settle(result)
    }

    /** Sends one `<video>`, numbered by our own counter, never by an id the peer sent. */
    private async sendVideoState(state: number): Promise<void> {
        this.videoStateTransactionId++
        const id = this.videoStateTransactionId
        const node = buildVideoStateStanza(
            this.inCallTarget(),
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

    /** {@link sendVideoState} for a caller that does not wait: the failure is already logged. */
    private sendVideoStateDetached(state: number): void {
        void this.sendVideoState(state).catch(() => {})
    }

    /**
     * Opens our video sender on a call negotiated as audio, once the upgrade is agreed; unlike
     * {@link ensureVideoReceivePath}, which any sign of peer video opens. Idempotent.
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

    /** Records our video as live, the one part a call negotiated as video also needs. */
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
        if (this.isGroupCall) return this.groupVideoSending
        return this.info.mediaType === CallMediaType.Video || this.videoSendPathOpened
    }

    /**
     * Opens the video receive path on a call negotiated as audio: the peer's video streams and
     * the RTP session its key frame requests ride on. Our sender stays off. Idempotent.
     */
    private ensureVideoReceivePath(): void {
        if (this.videoReceivePathOpened || this.info.mediaType === CallMediaType.Video) return
        this.videoReceivePathOpened = true

        const peerDeviceJid = toDeviceJid(this.acceptedByJid ?? this.info.peerJid)
        this.peerVideoStreamSsrcs = this.peerVideoStreamsOf(peerDeviceJid)
        void this.publish({ ssrcs: this.buildSsrcs(), video: this.videoSection() })
        // Any participant may turn a camera on, so every sender's video gets keyed.
        if (this.isGroupCall) void this.syncGroupMedia()

        this.logger.debug('video receive path opened mid-call', {
            callId: this.info.callId,
            peerDeviceJid
        })
    }

    /** The media has no relay leg left and nothing reopens one: the call ends as a hangup. */
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
            this.startHeartbeat()
            if (this.isGroupCall && !this.invisibleSweep) {
                this.invisibleSweep = setInterval(
                    () => this.sweepInvisibleSenders(),
                    PEER_INVISIBLE_SWEEP_MS
                )
                this.invisibleSweep.unref?.()
            }
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

    /**
     * `reason` is the `<terminate>` reason. Only an incoming call keeps the elsewhere reasons:
     * on an outgoing one `accepted_elsewhere` comes from the peer's companions.
     */
    handleCallTerminate(reason?: string): void {
        let endReason = EndCallReason.UserEnded
        if (this.info.direction === CallDirection.Incoming) {
            if (reason === 'accepted_elsewhere') endReason = EndCallReason.AcceptedElsewhere
            else if (reason === 'rejected_elsewhere') endReason = EndCallReason.RejectedElsewhere
        }
        try {
            this.info.applyTransition({
                type: 'terminated',
                reason: endReason
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
        if (this.invisibleSweep) clearInterval(this.invisibleSweep)
        this.invisibleSweep = null
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
        this.heartbeatTimer = null
        if (this.videoSubscriptionTimer) clearTimeout(this.videoSubscriptionTimer)
        this.videoSubscriptionTimer = null
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

    private buildSsrcs(group?: GroupSenders): WaCallMediaSsrcs {
        const self = this.selfDeviceJid
        const base: WaCallMediaSsrcs = {
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
        if (!this.isGroupCall || !self) return base

        // Every sender's streams and app data, in place of the 1:1 sets.
        const senders = group ?? this.groupSenders()
        const peerStreams = new Set<number>()
        const peerAppData: number[] = []
        for (const deviceJid of senders.devices) {
            for (const ssrc of senders.streamsOf(deviceJid)) peerStreams.add(ssrc)
            peerAppData.push(this.ssrcOf(deviceJid, WA_SSRC_SLOT.APP_DATA.MAIN))
        }
        return {
            ...base,
            peerStreams: peerStreams.size > 0 ? [...peerStreams] : base.peerStreams,
            peerAppData: peerAppData.length > 0 ? peerAppData : base.peerAppData,
            selfLayers: this.derivations.selfStreamLayers(self)
        }
    }

    private relaysSection(): WaCallMediaRelays | null {
        if (this.adoptedRelays) return this.adoptedRelays
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
        const send =
            this.isGroupCall && this.groupVideoSend !== null
                ? this.groupVideoSend
                : videoCall || this.videoSendPathOpened
        return {
            send,
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

    private ssrcOf(deviceJid: string, slot = 0): number {
        return this.derivations.ssrc(deviceJid, slot)
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

    /**
     * The peer device that won a call we placed: the `<relay><participant>` of its `<accept>`
     * when it is a device of the called user, else the device the accept came from. `pid` is
     * the participant's, as on the wire. No pn/lid mapping: another domain falls back too.
     */
    private readAnsweringDevice(
        accept: BinaryNode,
        fromJid: string
    ): { jid: string; pid?: number } {
        for (const relay of getNodeChildrenByTag(accept, 'relay')) {
            for (const participant of getNodeChildrenByTag(relay, 'participant')) {
                const jid = participant.attrs?.jid
                if (!jid) continue
                if (!this.isCalledUser(jid)) {
                    this.logger.debug('accept participant not of the called user, ignored', {
                        callId: this.info.callId,
                        participant: jid,
                        from: fromJid
                    })
                    continue
                }
                const pid = Number(participant.attrs.pid)
                return {
                    jid: this.toAddressedJid(jid),
                    pid: participant.attrs.pid && Number.isSafeInteger(pid) ? pid : undefined
                }
            }
        }
        return { jid: fromJid }
    }

    private isCalledUser(jid: string): boolean {
        try {
            return toUserJid(jid) === toUserJid(this.info.peerJid)
        } catch (err) {
            this.logger.trace('unreadable jid, not the called user', {
                jid,
                message: toError(err).message
            })
            return false
        }
    }

    /** The form stanzas are addressed to and arrive from: device 0 bare. */
    private toAddressedJid(jid: string): string {
        try {
            return normalizeDeviceJid(jid)
        } catch (err) {
            this.logger.trace('device jid kept as received', {
                jid,
                message: toError(err).message
            })
            return jid
        }
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

        const ourDeviceJid = toDeviceJid(this.ourRelayDeviceJid())
        if (!ourDeviceJid) {
            this.logger.debug('no own jid, srtp not initialized', { callId: this.info.callId })
            return null
        }
        const peerDeviceJid = toDeviceJid(this.acceptedByJid || this.info.peerJid)

        try {
            const keys = this.versionKeys(
                this.derivations.srtpKey(callKey, ourDeviceJid),
                this.derivations.srtpKey(callKey, peerDeviceJid)
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

    /** Our device as the relay lists it among the participants, else our account jid. */
    private ourRelayDeviceJid(): string {
        const ourJid = selfJidOf(this.deps)
        const ourBase = ourJid ? toUserJid(ourJid) : ''
        const participants = this.info.relayData?.participantJids || []
        return participants.find((jid) => toUserJid(jid) === ourBase && /:\d+@/.test(jid)) || ourJid
    }

    private muteV2Stanza(muted: boolean): BinaryNode {
        return buildMuteV2Stanza(
            this.inCallTarget(),
            this.info.callId,
            this.info.callCreator,
            muted
        )
    }

    /** Sends a stanza built in the same guard, logging a failure; `false` when it failed. */
    private async sendLogged(
        build: () => BinaryNode,
        failure: string,
        level: SendLogLevel = 'error',
        context?: Record<string, unknown>
    ): Promise<boolean> {
        try {
            await this.deps.lowLevelCoordinator.sendNode(build())
            return true
        } catch (err) {
            this.logger[level](failure, {
                callId: this.info.callId,
                ...context,
                message: toError(err).message
            })
            return false
        }
    }

    /** Sends a stanza nobody waits on; a failure is only logged. */
    private sendDetached(
        node: BinaryNode,
        failure: string,
        level: SendLogLevel = 'warn',
        context?: Record<string, unknown>
    ): void {
        void this.sendLogged(() => node, failure, level, context)
    }
}

/** A group call's sending devices with their streams, shared by one sync's sections. */
interface GroupSenders {
    readonly devices: readonly string[]
    readonly streamsOf: (deviceJid: string) => number[]
}
