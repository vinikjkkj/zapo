import type { Logger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'
import { toError } from 'zapo-js/util'

import { extractNodeInfo } from '../signaling/call-stanza.js'
import {
    buildMuteV2Stanza,
    buildRaiseHandStanza,
    parseMuteV2,
    parseRaiseHandState
} from '../signaling/in-call.js'
import {
    buildScreenShareStanza,
    parseScreenShareNode,
    type PeerScreenShare,
    WA_SCREEN_SHARE_STATE
} from '../signaling/screen-share.js'
import type { WaVoipDeps } from '../types.js'

import { isOwnAccountJid, toAddressedJid } from './call-jids.js'
import { type CallInfo, trackParticipantMedia } from './call-state.js'
import type { WaCallPlanPublisher } from './WaCallPlanPublisher.js'
import type { WaCallStanzaSender } from './WaCallStanzaSender.js'

/** Memory guard on a set fed straight from remote stanzas, not a protocol limit. */
const MAX_TRACKED_RAISED_HANDS = 32

/** Where the in-call states the peers announce are reported. */
export interface WaCallAnnouncementsDelegate {
    emitState(call: CallInfo): void
    emitPeerMute(call: CallInfo, muted: boolean, participantJid?: string): void
    emitHandRaise(call: CallInfo, participantJid: string, raised: boolean): void
    emitScreenShare(call: CallInfo, share: PeerScreenShare, participantJid?: string): void
    emitMuteRequested?(call: CallInfo, participantJid: string, requestState: string): void
}

export interface WaCallAnnouncementsOptions {
    readonly info: CallInfo
    readonly logger: Logger
    readonly deps: Pick<WaVoipDeps, 'authClient'>
    readonly stanzas: WaCallStanzaSender
    readonly plan: WaCallPlanPublisher
    readonly delegate: WaCallAnnouncementsDelegate
    /** Where our in-call stanzas go. */
    readonly target: () => string
    /** A peer's `<mute_v2>` arrived: the born-video sign that it can take our video. */
    readonly onPeerMuteAnnounced: () => void
}

/** The in-call states each side announces: microphone, raised hand, screen share, mute requests. */
export class WaCallAnnouncements {
    private readonly info: CallInfo
    private readonly logger: Logger
    private readonly deps: Pick<WaVoipDeps, 'authClient'>
    private readonly stanzas: WaCallStanzaSender
    private readonly plan: WaCallPlanPublisher
    private readonly delegate: WaCallAnnouncementsDelegate
    private readonly target: () => string
    private readonly onPeerMuteAnnounced: () => void
    /** Whether the one post-active `<mute_v2>` declaration has gone out. */
    private initialMuteAnnounced = false
    /** `screen_share_id` of the last start or stop sent; each one sent takes the next. */
    private screenShareId = 0

    constructor(options: WaCallAnnouncementsOptions) {
        this.info = options.info
        this.logger = options.logger
        this.deps = options.deps
        this.stanzas = options.stanzas
        this.plan = options.plan
        this.delegate = options.delegate
        this.target = options.target
        this.onPeerMuteAnnounced = options.onPeerMuteAnnounced
    }

    /** Mutes our capture and announces it; the media keeps sending silence on the same SSRC. */
    setMute(muted: boolean): void {
        if (!this.info.isActive) return
        if (this.info.stateData.audioMuted === muted) return

        this.info.applyTransition({ type: 'audio_mute_changed', muted })
        this.delegate.emitState(this.info)

        void this.plan.publish({ muted })
        this.stanzas.sendDetached(this.muteV2Stanza(muted), 'mute_v2 announcement failed', 'warn', {
            muted
        })
    }

    /** Announces our microphone state once the call is active; the peer shows nothing until then. */
    announceInitialMute(): void {
        if (this.initialMuteAnnounced) return
        this.initialMuteAnnounced = true
        this.stanzas.sendDetached(
            this.muteV2Stanza(this.info.stateData.audioMuted),
            'initial mute_v2 announcement failed'
        )
    }

    /** Raises or lowers our hand; the state moves only once the stanza left, else it rethrows. */
    async setHandRaised(raised: boolean): Promise<void> {
        if (!this.info.isActive) return
        if (this.info.stateData.handRaised === raised) return

        const node = buildRaiseHandStanza(
            this.target(),
            this.info.callId,
            this.info.callCreator,
            raised
        )

        try {
            await this.stanzas.send(node)
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
     * Tells the peer our video stream now carries the screen, or no longer. @throws when the
     * send fails, or to start one while `videoSendActive` is false.
     */
    async setScreenShare(sharing: boolean, videoSendActive: boolean): Promise<void> {
        if (!this.info.isActive) return
        if (this.info.stateData.screenSharing === sharing) return

        if (sharing && !videoSendActive) {
            throw new Error(`Call ${this.info.callId} carries no video to share the screen on`)
        }

        const peerDeviceJid = this.target()
        const state = sharing ? WA_SCREEN_SHARE_STATE.Started : WA_SCREEN_SHARE_STATE.Stopped

        try {
            await this.stanzas.send(
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

    /**
     * Records the microphone state a `<mute_v2>` announces; one from our own account, or a mute
     * request on a 1:1 call, is dropped.
     */
    handleMuteV2(node: BinaryNode, peerJid: string): void {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        if (isOwnAccountJid(this.deps, peerJid)) {
            this.logger.debug('ignoring mute_v2 from another device of this account', { peerJid })
            return
        }

        const key = toAddressedJid(peerJid, this.logger)
        const payload = parseMuteV2(nodeInfo.innerNode)
        if (payload.isRequest) {
            if (!this.info.isGroupCall) {
                this.logger.debug('ignoring mute request on a 1:1 call', { peerJid })
                return
            }
            this.handleMuteRequest(payload.requestState ?? '', key)
            return
        }

        // Any `<mute_v2>` is the sign, so mark it before the checks that drop unreadable states.
        this.onPeerMuteAnnounced()

        if (payload.muted === null) {
            this.logger.debug('mute_v2 carries no readable mute-state', { peerJid })
            return
        }

        const entry = trackParticipantMedia(this.info, key, this.logger)
        if (this.info.isGroupCall) {
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

    /** Records the hand a stanza of either shape carried; one from our own account is dropped. */
    handleRaiseHand(node: BinaryNode, peerJid: string): void {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        if (isOwnAccountJid(this.deps, peerJid)) {
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
     * Records the screen-share state a `screen_share` or `screen` stanza carried, as `senderJid`'s;
     * nothing goes back.
     */
    handleScreenShare(node: BinaryNode, senderJid: string): void {
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

        const key = toAddressedJid(senderJid, this.logger)
        const entry = trackParticipantMedia(this.info, key, this.logger)
        if (entry) entry.screenShare = share
        if (!this.info.isGroupCall) this.info.peerScreenShare = share
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
     * Re-announces our own state to the call when somebody arrives, since nothing else tells a
     * newcomer: our mute state always, our hand only while it is up. Video is not replayed.
     */
    rebroadcast(): void {
        if (!this.info.isActive) return
        this.stanzas.sendDetached(
            this.muteV2Stanza(this.info.stateData.audioMuted),
            'state re-broadcast failed'
        )
        if (this.info.stateData.handRaised) {
            this.stanzas.sendDetached(
                buildRaiseHandStanza(this.target(), this.info.callId, this.info.callCreator, true),
                'state re-broadcast failed'
            )
        }
        this.logger.debug('own state re-broadcast to the call', {
            callId: this.info.callId,
            handRaised: this.info.stateData.handRaised
        })
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

    private muteV2Stanza(muted: boolean): BinaryNode {
        return buildMuteV2Stanza(this.target(), this.info.callId, this.info.callCreator, muted)
    }
}
