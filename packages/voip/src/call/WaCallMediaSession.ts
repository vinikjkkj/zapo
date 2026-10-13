import type { Logger } from 'zapo-js'
import { toUserJid } from 'zapo-js/protocol'
import { type BinaryNode, findNodeChild, getNodeChildrenByTag } from 'zapo-js/transport'
import { toError, uint8TimingSafeEqual } from 'zapo-js/util'

import {
    type WaCallMediaEvent,
    type WaCallMediaGroup,
    type WaCallMediaKeys,
    type WaCallMediaMessage,
    type WaCallMediaSsrcs,
    type WaCallReaction
} from '@zapo-js/voip-media'

import { derivePerJidSrtpKey } from '../crypto/encryption.js'
import { isSameDeviceJid, toDeviceJid } from '../jid.js'
import { parseRelayFromAck } from '../relay/relay-ack.js'
import { decryptCallKey } from '../signaling/call-key.js'
import { extractNodeInfo, toCallServerJid } from '../signaling/call-stanza.js'
import {
    type GroupCallRoster,
    type GroupInfoParticipant,
    readGroupCallRoster,
    readGroupUpdateTransactionId,
    resolveGroupUpdateTransactionId
} from '../signaling/group-info.js'
import { buildMuteRequestStanza } from '../signaling/in-call.js'
import {
    buildAcceptReceiptStanza,
    buildAcceptStanza,
    buildPreacceptStanza,
    buildRejectStanza,
    buildTerminateStanza,
    needsDecryption
} from '../signaling/lifecycle.js'
import { type PeerScreenShare } from '../signaling/screen-share.js'
import { buildTransportStanza, extractRelayEndpoints } from '../signaling/transport.js'
import { parseVideoStateNode, type WaVideoUpgradeResult } from '../signaling/video-state.js'
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
    type WaVoipDeps
} from '../types.js'

import { isOwnAccountJid, readAnsweringDevice, selfJidOf, toAddressedJid } from './call-jids.js'
import { type CallInfo, trackParticipantMedia } from './call-state.js'
import {
    groupDevicePids,
    type GroupSenders,
    groupSendersOf,
    WaCallDerivations
} from './group-media-plan.js'
import {
    applyGroupUpdate,
    createGroupComposition,
    type WaCallGroupParticipant,
    type WaGroupCompositionDiff
} from './group-participants.js'
import type { WaCallMediaLink, WaCallMediaLinkEvents } from './media-link.js'
import { toMediaSettings } from './media-plan.js'
import { WaCallAnnouncements } from './WaCallAnnouncements.js'
import { WaCallPlanPublisher } from './WaCallPlanPublisher.js'
import { WaCallRelays } from './WaCallRelays.js'
import { WaCallStanzaSender } from './WaCallStanzaSender.js'
import { WaCallStreams } from './WaCallStreams.js'
import { WaCallVideo } from './WaCallVideo.js'
import { WaGroupLiveness } from './WaGroupLiveness.js'
import { WaGroupRekey } from './WaGroupRekey.js'
import { WaGroupRoster } from './WaGroupRoster.js'
import { WaGroupVideoSubscriptions } from './WaGroupVideoSubscriptions.js'

/** The `<terminate>` reason for an offer the server refused. */
const SETUP_FAILED_REASON = 'setup_failed'

/** Stands in for the `<group_info>` of an update that carried none. */
const NO_LISTED_PARTICIPANTS: readonly GroupInfoParticipant[] = []

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
    private readonly stanzas: WaCallStanzaSender
    private readonly plan: WaCallPlanPublisher
    private readonly streams: WaCallStreams
    private readonly relays: WaCallRelays
    private readonly subscriptions: WaGroupVideoSubscriptions
    private readonly roster: WaGroupRoster
    private readonly rekey: WaGroupRekey
    private readonly liveness: WaGroupLiveness
    private readonly announcements: WaCallAnnouncements
    private readonly video: WaCallVideo
    private initialTransportSent = false
    private outgoingPreacceptSent = false

    private acceptedByJid: string | null = null
    private readonly now: () => number
    /** Whether a repeated `<video>` transaction id is dropped rather than only logged. */
    private videoStateTxnEnforced = false
    private readonly derivations: WaCallDerivations

    constructor(options: WaCallMediaSessionOptions) {
        this.deps = options.deps
        this.logger = options.logger
        this.info = options.info
        this.delegate = options.delegate
        this.now = options.now ?? (() => performance.now())
        this.derivations = new WaCallDerivations(options.info.callId)
        this.subscriptions = new WaGroupVideoSubscriptions({
            info: options.info,
            logger: options.logger,
            now: this.now,
            onChange: () => {
                void this.syncGroupMedia()
            }
        })
        this.stanzas = new WaCallStanzaSender(options.deps, options.logger, options.info)
        this.streams = new WaCallStreams({
            info: options.info,
            logger: options.logger,
            deps: options.deps,
            derivations: this.derivations
        })
        this.media = options.createMediaLink({
            onActive: () => this.onMediaActive(),
            onRelayLost: (reason) => this.onRelayLost(reason),
            onRelayAnswered: (name, rttMs) => this.relays.onAnswered(name, rttMs),
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
            onSenderMedia: (senderId, receiving) =>
                this.liveness.handleSenderMedia(senderId, receiving),
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
        this.plan = new WaCallPlanPublisher(this.media, options.logger, options.info)
        this.relays = new WaCallRelays({
            info: options.info,
            logger: options.logger,
            stanzas: this.stanzas,
            plan: this.plan
        })
        this.roster = new WaGroupRoster({
            info: options.info,
            logger: options.logger,
            selfJid: () => selfJidOf(this.deps) || this.streams.deviceJid
        })
        this.rekey = new WaGroupRekey({
            info: options.info,
            logger: options.logger,
            deps: options.deps,
            stanzas: this.stanzas,
            roster: this.roster,
            installKey: (callKey, transactionId) => this.applyCallKey(callKey, transactionId)
        })
        this.liveness = new WaGroupLiveness({
            info: options.info,
            logger: options.logger,
            now: this.now,
            stanzas: this.stanzas,
            roster: this.roster,
            delegate: options.delegate
        })
        this.announcements = new WaCallAnnouncements({
            info: options.info,
            logger: options.logger,
            deps: options.deps,
            stanzas: this.stanzas,
            plan: this.plan,
            delegate: options.delegate,
            target: () => this.inCallTarget(),
            onPeerMuteAnnounced: () => this.video.markPeerReady('born-video')
        })
        this.video = new WaCallVideo({
            info: options.info,
            logger: options.logger,
            stanzas: this.stanzas,
            plan: this.plan,
            delegate: options.delegate,
            target: () => this.inCallTarget(),
            onReceivePathOpened: () => this.onVideoReceivePathOpened(),
            now: options.now
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

    /**
     * The device a media event came from: its sender's on a group call, the answering device on
     * a 1:1 call, `undefined` when a group sender is unknown.
     */
    private senderJidOf(senderId: string | undefined): string | undefined {
        if (senderId !== undefined) return this.info.groupSenders.get(senderId)
        if (this.isGroupCall) return undefined
        return toAddressedJid(this.acceptedByJid ?? this.info.peerJid, this.logger)
    }

    /** Forgets a device that left the call: its media state, and a hand it still had up. */
    private forgetParticipantDevice(deviceJid: string): void {
        const key = toAddressedJid(deviceJid, this.logger)
        this.info.participantMedia.delete(key)
        this.liveness.forget(key, deviceJid)
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
        this.streams.initialize(selfLid, peerJid)

        await this.media.start()
        await this.plan.publish({
            mediaType: this.info.mediaType === CallMediaType.Video ? 'video' : 'audio',
            ssrcs: this.buildSsrcs(),
            video: this.video.section()
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

        const section = toMediaSettings(settings)
        void this.plan.publish({ settings: section })

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
        if (isVideo) this.video.holdBornVideoSend()

        // The offer's sender (a bare jid is device 0), not a companion from participantJids.
        const acceptedPeerDeviceJid = toDeviceJid(peerJid)
        this.acceptedByJid = acceptedPeerDeviceJid
        this.streams.subscribeAnswered(acceptedPeerDeviceJid)
        await this.publishSsrcsAndKeys(this.deriveKeys())

        await this.stanzas.sendLogged(
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
            await this.stanzas.sendLogged(() => acceptStanza, 'accept send error')
        }
        this.liveness.startHeartbeat()

        await this.plan.publish({ relays: this.relays.section(), accepted: true })

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
        await this.stanzas.sendLogged(() => node, 'reject send failed', 'warn')
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
        await this.stanzas.sendLogged(() => node, 'terminate send failed', 'warn')
        this.cleanup()
    }

    /** Mutes our capture and announces it; the media keeps sending silence on the same SSRC. */
    setMute(muted: boolean): void {
        this.announcements.setMute(muted)
    }

    /** Raises or lowers our hand; the state moves only once the stanza left, else it rethrows. */
    setHandRaised(raised: boolean): Promise<void> {
        return this.announcements.setHandRaised(raised)
    }

    /**
     * Tells the peer our video stream now carries the screen, or no longer; feeding it is the
     * caller's job. @throws when the send fails, or to start one on a call with no video yet.
     */
    setScreenShare(sharing: boolean): Promise<void> {
        return this.announcements.setScreenShare(sharing, this.video.sendActive)
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
        if (this.isGroupCall && !this.video.groupSending) return 0
        return this.media.sendVideoFrame(data, timestampUs)
    }

    getLiveBufferMs(): number {
        return this.media.getLiveBufferMs()
    }

    /** A group callee preaccepts to the call itself, which is where its capability goes. */
    async sendIncomingPreaccept(peerJid: string): Promise<void> {
        await this.stanzas.sendLogged(
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
    sendRelayLatency(): Promise<void> {
        return this.relays.sendLatency()
    }

    /**
     * An `<accept>`: the peer answering a 1:1 call we placed, a group participant joining, or on
     * an incoming 1:1 call another device of this account, which ends our ring.
     */
    async handleCallAccept(node: BinaryNode, peerJid: string): Promise<void> {
        if (
            this.isGroupCall &&
            (this.info.direction === CallDirection.Outgoing || !isOwnAccountJid(this.deps, peerJid))
        ) {
            this.handleGroupAccept(peerJid)
            return
        }
        if (this.info.direction === CallDirection.Incoming) {
            if (!isOwnAccountJid(this.deps, peerJid)) {
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

        const answering = readAnsweringDevice(nodeInfo.innerNode, peerJid, this.info, this.logger)
        const acceptingDeviceJid = answering.jid
        const acceptedPeerDeviceJid = toDeviceJid(acceptingDeviceJid)

        // Held before anything yields, and only while ringing: a repeated accept cannot undo a release.
        if (
            this.info.stateData.state === CallState.Ringing &&
            this.info.mediaType === CallMediaType.Video
        ) {
            this.video.holdBornVideoSend()
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
                        const ourDeviceJid = this.streams.relayDeviceJid()
                        if (ourDeviceJid) {
                            try {
                                keys = this.streams.versionKeys(
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

        this.streams.subscribeAccepted(acceptedPeerDeviceJid, acceptingDeviceJid)
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
                    await this.stanzas.send(terminateNode)
                } catch (err: unknown) {
                    this.logger.error('error sending terminate_elsewhere', {
                        deviceJid,
                        message: toError(err).message
                    })
                }
            }
        }

        await this.stanzas.sendLogged(
            () => buildTransportStanza(acceptingDeviceJid, callId, callCreator, '1', '1'),
            'error sending transport'
        )

        const acceptMsgId = node.attrs?.id
        if (acceptMsgId) {
            await this.stanzas.sendLogged(
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
        await this.plan.publish({ accepted: true })
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
        this.liveness.startHeartbeat()
        void this.plan.publish({ accepted: true })
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

    async handleCallPreaccept(node: BinaryNode, peerJid: string): Promise<void> {
        if (!extractNodeInfo(node)) return
        if (this.info.direction !== CallDirection.Outgoing || !this.info.relayData) return

        await this.relays.sendLatency()
        if (this.initialTransportSent) return
        this.initialTransportSent = await this.stanzas.sendLogged(
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
            await this.relays.adoptReissued(nodeInfo.innerNode, null)
            return
        }

        const relays = extractRelayEndpoints(nodeInfo.innerNode)
        if (relays.length === 0) return

        this.info.relayData = {
            ...this.info.relayData,
            endpoints: relays
        }
        await this.plan.publish({ relays: this.relays.section() })
    }

    async handleCallAck(node: BinaryNode): Promise<void> {
        const ackType = node.attrs?.type
        // A re-rung group offer comes with no relay: the ack of our accept may bring it.
        if (ackType === 'accept' && this.isGroupCall) {
            await this.relays.adoptReissued(node, null)
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
        if (endpoints.length === 0 || this.relays.hasAdopted) return

        this.info.relayData = relayData

        this.logger.debug('offer ack relays parsed', {
            callId: this.info.callId,
            relayCount: endpoints.length,
            participantCount: participantJids.length
        })

        if (participantJids.length > 0) {
            this.streams.subscribeFromOfferAck(participantJids, this.acceptedByJid)

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
            this.outgoingPreacceptSent = await this.stanzas.sendLogged(
                () =>
                    buildPreacceptStanza(
                        this.info.peerJid,
                        this.info.callId,
                        this.info.callCreator
                    ),
                'error sending preaccept (caller)'
            )
        }

        await this.plan.publish({ relays: this.relays.section() })
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
        this.relays.recordElection(node)
    }

    /**
     * Records the microphone state a `<mute_v2>` announces; one from our own account, or a mute
     * request on a 1:1 call, is dropped. Also the born-video sign our held video waits on.
     */
    handleCallMuteV2(node: BinaryNode, peerJid: string): void {
        this.announcements.handleMuteV2(node, peerJid)
    }

    /**
     * Asks a group participant's device to mute; it decides. An account names its first device.
     * @throws on a 1:1 call, for somebody not on the call, or when the send fails.
     */
    async requestParticipantMute(participantJid: string): Promise<void> {
        if (!this.isGroupCall) {
            throw new Error(`Call ${this.info.callId} is not a group call`)
        }
        const target = this.roster.participantDeviceOf(participantJid)
        if (!target) {
            throw new Error(`${participantJid} is not on call ${this.info.callId}`)
        }
        await this.stanzas.send(
            buildMuteRequestStanza(target, this.info.callId, this.info.callCreator)
        )
        this.logger.debug('mute requested of a participant', {
            callId: this.info.callId,
            participantJid: target
        })
    }

    /** The `<user_action>` envelope carries several actions; only raise hand is read. */
    handleCallUserAction(node: BinaryNode, peerJid: string): void {
        this.announcements.handleRaiseHand(node, peerJid)
    }

    /** A top-level `<raise_hand>`: a message type of its own, still sent beside `<user_action>`. */
    handleCallRaiseHand(node: BinaryNode, peerJid: string): void {
        this.announcements.handleRaiseHand(node, peerJid)
    }

    /** Records the screen-share state a `screen_share` or `screen` stanza carried; nothing goes back. */
    handleCallScreenShare(node: BinaryNode, participantJid?: string): void {
        this.announcements.handleScreenShare(
            node,
            participantJid ?? this.acceptedByJid ?? this.info.peerJid
        )
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

        const key = toAddressedJid(
            participantJid ?? this.acceptedByJid ?? this.info.peerJid,
            this.logger
        )
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
        this.video.onPeerVideoState(change.state)

        const entry = trackParticipantMedia(this.info, key, this.logger)
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
        const seeded = this.roster.seedFromOffer(inner)
        if (!seeded) return
        // A key that beat the offer was installed before anyone could be keyed with it.
        if (this.info.encryptionKey) void this.syncGroupMedia()
        this.logger.debug('group call composition seeded from the offer', {
            callId: this.info.callId,
            participantCount: seeded.participantCount,
            connectedLimit: seeded.connectedLimit
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
        this.roster.seedJoin(context.participants, context.transactionId)
        if (context.relayData) this.info.relayData = context.relayData
        this.applyVoipSettings(context.voipSettings ?? null)
    }

    /** Seeds the composition of a group call we place, from the participants our offer named. */
    seedOutgoingGroupComposition(participants: readonly WaCallGroupParticipant[]): void {
        this.roster.seedOutgoing(participants)
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

        await this.relays.adoptReissued(inner, readGroupUpdateTransactionId(inner))

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
        const transactionId = resolveGroupUpdateTransactionId(
            inner,
            listed,
            composition.lastTransactionId,
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
            if (rekeyAnnounced && this.rekey.accept(transactionId)) {
                await this.rekey.run(transactionId, listed)
            }
            return
        }

        const rekeyAccepted = rekeyAnnounced && this.rekey.accept(transactionId)
        this.info.groupComposition = outcome.composition
        this.roster.logDiff('group call composition changed', outcome.diff)
        this.forgetDepartedDevices(outcome.diff)
        await this.syncGroupMedia()
        this.subscriptions.refresh()
        // The creator hears no `<accept>`: a roster listing somebody else connected is the join.
        const joined = this.roster.hasOtherConnected() && this.joinPlacedGroupCall('roster')

        this.delegate.emitParticipantsChanged?.(this.info, outcome.diff)
        this.delegate.emitState(this.info)
        if (joined) {
            this.liveness.startHeartbeat()
            await this.plan.publish({ accepted: true })
        }
        if (this.roster.anyoneArrived(composition, outcome.composition)) {
            this.announcements.rebroadcast()
        }

        if (rekeyAccepted) await this.rekey.run(transactionId, listed)
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
        const diff = this.roster.remove(peerJid, reason)
        if (!diff) return
        this.forgetDepartedDevices(diff)
        this.roster.logDiff('group participant left the call', diff, {
            peerJid,
            reason: reason ?? null
        })
        void this.syncGroupMedia()

        this.delegate.emitParticipantsChanged?.(this.info, diff)
        this.delegate.emitState(this.info)
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
            this.subscriptions.current
        )
    }

    /** The sending devices and their streams, derived once for everything one sync publishes. */
    private groupSenders(): GroupSenders {
        return groupSendersOf(this.roster.senderDevices(), this.derivations, this.video.coversVideo)
    }

    /** Republishes what a group call derives from its composition and key, together. */
    private async syncGroupMedia(): Promise<void> {
        if (!this.isGroupCall) return
        const senders = this.groupSenders()
        this.syncGroupSenders(senders.devices)
        const keys = this.info.encryptionKey ? this.deriveKeys() : null
        const group = keys ? this.groupSection(senders) : null
        await this.plan.publish({
            ...(this.streams.deviceJid ? { ssrcs: this.buildSsrcs(senders) } : {}),
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
            const key = toAddressedJid(deviceJid, this.logger)
            senders.set(senderId, key)
            const entry = trackParticipantMedia(this.info, key, this.logger)
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
        const entry = trackParticipantMedia(this.info, participantJid, this.logger)
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
        this.video.ensureReceivePath()
        this.subscriptions.refresh()

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
        const upgraderJid = toAddressedJid(upgrader, this.logger)
        if (!this.video.claimGroupUpgrade()) return

        const asked = this.video.upgradePending || isOwnAccountJid(this.deps, upgraderJid)
        this.applyVoipSettings(parseVoipSettings(node, this.logger))
        this.video.ensureReceivePath()
        this.info.mediaType = CallMediaType.Video
        this.video.applyGroupUpgrade(asked)

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
    setVideoEnabled(enabled: boolean): Promise<void> {
        return this.video.setGroupEnabled(enabled)
    }

    /**
     * Overrides whose video is asked of the SFU; `null` hands it back to the policy: every
     * camera that is on, at most four, once more than two are connected.
     */
    setVideoSubscriptions(subscriptions: readonly CallVideoSubscription[] | null): void {
        this.subscriptions.set(subscriptions)
    }

    /**
     * A group sender's media started or stopped reaching us, as the media host reports it.
     * Edge-triggered: an unchanged state is not reported again.
     */
    handleSenderMedia(senderId: string, receiving: boolean): void {
        this.liveness.handleSenderMedia(senderId, receiving)
    }

    /** Whether a `<video>` fails to advance the sender's own counter past the last one seen. */
    private isStaleVideoState(transactionId: number | null, last: number | null): boolean {
        return transactionId !== null && last !== null && transactionId <= last
    }

    /**
     * Asks the peer to turn this audio call into video, resolving with the outcome; no video
     * leaves until it accepts. A crossing request is answered instead, a second call joins the
     * first. @throws when the call is not active or already carries video.
     */
    requestVideoUpgrade(): Promise<WaVideoUpgradeResult> {
        return this.video.requestUpgrade()
    }

    /**
     * Accepts the peer's upgrade request: the accept, then our sender, then `Enabled`, our frames
     * held until the peer is ready. No-op when the peer has nothing outstanding.
     */
    acceptVideoUpgrade(): Promise<void> {
        return this.video.acceptUpgrade()
    }

    /** Declines an upgrade the peer asked for. No-op when it asked for none. */
    rejectVideoUpgrade(): Promise<void> {
        return this.video.rejectUpgrade()
    }

    /** Withdraws the request this side sent. No-op when nothing is in flight. */
    cancelVideoUpgrade(): Promise<void> {
        return this.video.cancelUpgrade()
    }

    /** Subscribes the peer's video streams, the receive path having just opened. */
    private onVideoReceivePathOpened(): void {
        const peerDeviceJid = toDeviceJid(this.acceptedByJid ?? this.info.peerJid)
        this.streams.openPeerVideo(peerDeviceJid)
        void this.plan.publish({ ssrcs: this.buildSsrcs(), video: this.video.section() })
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
            this.announcements.announceInitialMute()
            this.liveness.startHeartbeat()
            this.liveness.startSweep()
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
        this.video.reset()
        this.acceptedByJid = null
        this.liveness.stop()
        this.subscriptions.stop()
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

    private publishSsrcsAndKeys(keys: WaCallMediaKeys | null): Promise<void> {
        return this.plan.publish(
            keys ? { ssrcs: this.buildSsrcs(), keys } : { ssrcs: this.buildSsrcs() }
        )
    }

    /** The plan's `ssrcs`; on a group call every sender's streams, `group` when already derived. */
    private buildSsrcs(group?: GroupSenders): WaCallMediaSsrcs {
        return this.streams.build(
            this.isGroupCall && this.streams.deviceJid ? (group ?? this.groupSenders()) : undefined
        )
    }

    /** The SRTP keys of the call key: ours to send, the answering device's to receive. */
    private deriveKeys(): WaCallMediaKeys | null {
        return this.streams.deriveKeys(this.acceptedByJid || this.info.peerJid)
    }
}
