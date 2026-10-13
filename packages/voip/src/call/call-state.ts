import type { PeerScreenShare } from '../signaling/screen-share.js'
import type { WaVoipSettings } from '../signaling/voip-settings.js'
import {
    CallDirection,
    CallMediaType,
    CallState,
    type CallTransition,
    type EndCallReason,
    type PeerVideoStateChange,
    type RelayData
} from '../types.js'

import type { WaGroupComposition } from './group-participants.js'

/**
 * What one remote device last announced about its media, keyed by its device jid in the form
 * stanzas arrive from (device 0 bare). Filled on 1:1 calls too.
 */
export interface WaCallParticipantMedia {
    readonly deviceJid: string
    /** Its media sender id on a group call, see `groupSenderId`. */
    senderId?: string
    audioMuted?: boolean
    video?: PeerVideoStateChange
    screenShare?: PeerScreenShare
    /** Whether its media is reaching us, from the media host; absent until it says. */
    receiving?: boolean
}

export interface CallStateData {
    state: CallState
    connectedAt?: Date
    acceptedAt?: Date
    endedAt?: Date
    audioMuted: boolean
    /**
     * Microphone state the peer last announced for itself, `undefined` until it does. An
     * observation, not a local state, so it is recorded directly and not as a transition.
     */
    peerAudioMuted?: boolean
    videoOff: boolean
    /** Local raise-hand state; the remote hands are {@link CallInfo.raisedHands}. */
    handRaised: boolean
    /**
     * Whether this side is sharing right now (the peer's is
     * {@link CallInfo.peerScreenShare}). While set, the call's one video stream carries
     * the screen and not a camera.
     */
    screenSharing: boolean
    silenced?: boolean
    /** Incoming call waiting for a free slot; cannot accept until unblocked. */
    acceptBlocked?: boolean
    endReason?: EndCallReason
    durationSecs?: number
}

export class CallInfo {
    callId: string
    peerJid: string
    callCreator: string
    direction: CallDirection
    mediaType: CallMediaType
    stateData: CallStateData
    createdAt: Date
    /** `group-jid` of the offer: set on a group call, which is what makes it one. */
    groupJid?: string
    /**
     * `joinable` of the offer: others may still join, so one participant's `<terminate>` is not
     * the end of the call; see {@link decideJoinableTerminate}. Independent of {@link groupJid}.
     */
    joinable: boolean
    isOffline: boolean
    callerPn?: string
    encryptionKey?: Uint8Array
    relayData?: RelayData
    electedRelayIdx?: number
    /**
     * Remote participants whose hand is raised, keyed by the device JID the stanza arrived
     * from. An entry survives until that participant lowers the hand.
     */
    readonly raisedHands = new Set<string>()
    /**
     * The last `<voip_settings>` applied, the offer's or a later upgrade's; absent when none
     * was readable.
     */
    voipSettings?: WaVoipSettings
    /**
     * Last screen-share state the peer reported. Updated in place, so a `voip_call_state`
     * listener reads the current value without subscribing to `voip_call_screen_share`.
     */
    peerScreenShare?: PeerScreenShare
    /**
     * Last video state the peer announced, from its `<video>`. Absent until it sends one,
     * which only happens on a mid-call change - a call negotiated as video never does.
     */
    peerVideoState?: PeerVideoStateChange
    /**
     * Who is on a group call: seeded from the offer and replaced whole by every roster that
     * folds in. Absent on a 1:1 call.
     */
    groupComposition?: WaGroupComposition
    /** Per remote device, what it last announced about its media. See {@link WaCallParticipantMedia}. */
    readonly participantMedia = new Map<string, WaCallParticipantMedia>()
    /** Media sender id to the device jid it stands for (device 0 bare), on a group call. */
    readonly groupSenders = new Map<string, string>()

    private constructor(init: {
        callId: string
        peerJid: string
        callCreator: string
        direction: CallDirection
        mediaType: CallMediaType
        stateData: CallStateData
        callerPn?: string
    }) {
        this.callId = init.callId
        this.peerJid = init.peerJid
        this.callCreator = init.callCreator
        this.direction = init.direction
        this.mediaType = init.mediaType
        this.stateData = init.stateData
        this.createdAt = new Date()
        this.joinable = false
        this.isOffline = false
        this.callerPn = init.callerPn
    }

    static newOutgoing(
        callId: string,
        peerJid: string,
        ourJid: string,
        mediaType: CallMediaType
    ): CallInfo {
        return new CallInfo({
            callId,
            peerJid,
            callCreator: ourJid,
            direction: CallDirection.Outgoing,
            mediaType,
            stateData: {
                state: CallState.Initiating,
                audioMuted: false,
                videoOff: mediaType !== CallMediaType.Video,
                handRaised: false,
                screenSharing: false
            }
        })
    }

    /**
     * A group call we join after its ring, from what was kept of it: no offer comes, our accept
     * to the call is the join. It starts ringing so {@link WaCallMediaSession.acceptCall} takes it.
     */
    static newGroupJoin(
        callId: string,
        callCreator: string,
        mediaType: CallMediaType,
        groupJid?: string
    ): CallInfo {
        const call = CallInfo.newIncoming(callId, callCreator, callCreator, undefined, mediaType)
        call.groupJid = groupJid
        call.joinable = true
        call.isGroupCall = true
        return call
    }

    static newIncoming(
        callId: string,
        peerJid: string,
        callCreator: string,
        callerPn: string | undefined,
        mediaType: CallMediaType
    ): CallInfo {
        return new CallInfo({
            callId,
            peerJid,
            callCreator,
            direction: CallDirection.Incoming,
            mediaType,
            callerPn,
            stateData: {
                state: CallState.IncomingRinging,
                audioMuted: false,
                videoOff: mediaType !== CallMediaType.Video,
                handRaised: false,
                screenSharing: false
            }
        })
    }

    get isInitiator(): boolean {
        return this.direction === CallDirection.Outgoing
    }

    get isActive(): boolean {
        return this.stateData.state === CallState.Active
    }

    get isRinging(): boolean {
        return (
            this.stateData.state === CallState.Ringing ||
            this.stateData.state === CallState.IncomingRinging
        )
    }

    get isEnded(): boolean {
        return this.stateData.state === CallState.Ended
    }

    /**
     * A group call: one the manager marked as such, naming a group, or carrying a roster. A 1:1
     * call that grows into a group offers the newcomer a roster without `group-jid`. `joinable`
     * says nothing: WA Web marks its 1:1 offers joinable too.
     */
    get isGroupCall(): boolean {
        return (
            this.markedGroupCall ||
            this.groupJid !== undefined ||
            this.groupComposition !== undefined
        )
    }

    set isGroupCall(value: boolean) {
        this.markedGroupCall = value
    }

    private markedGroupCall = false

    get canAccept(): boolean {
        return this.stateData.state === CallState.IncomingRinging && !this.stateData.acceptBlocked
    }

    get isAcceptBlocked(): boolean {
        return this.stateData.acceptBlocked === true
    }

    get canReject(): boolean {
        return (
            this.stateData.state === CallState.IncomingRinging ||
            this.stateData.state === CallState.Ringing
        )
    }

    applyTransition(transition: CallTransition): void {
        const s = this.stateData

        switch (transition.type) {
            case 'offer_sent':
                if (s.state !== CallState.Initiating) {
                    throw new InvalidTransition(s.state, transition.type)
                }

                s.state = CallState.Ringing
                break

            case 'offer_received':
                if (s.state !== CallState.Initiating) {
                    throw new InvalidTransition(s.state, transition.type)
                }

                s.state = CallState.IncomingRinging
                s.silenced = transition.silenced
                break

            case 'remote_accepted':
                if (s.state !== CallState.Ringing) {
                    throw new InvalidTransition(s.state, transition.type)
                }

                s.state = CallState.Connecting
                s.acceptedAt = new Date()
                break

            case 'local_accepted':
                if (s.state !== CallState.IncomingRinging) {
                    throw new InvalidTransition(s.state, transition.type)
                }

                s.state = CallState.Connecting
                s.acceptedAt = new Date()
                break

            case 'remote_rejected':
                if (s.state !== CallState.Ringing) {
                    throw new InvalidTransition(s.state, transition.type)
                }

                s.state = CallState.Ended
                s.endedAt = new Date()
                s.endReason = transition.reason
                break

            case 'local_rejected':
                if (s.state !== CallState.IncomingRinging) {
                    throw new InvalidTransition(s.state, transition.type)
                }

                s.state = CallState.Ended
                s.endedAt = new Date()
                s.endReason = transition.reason
                break

            case 'media_connected':
                if (s.state !== CallState.Connecting) {
                    throw new InvalidTransition(s.state, transition.type)
                }

                s.state = CallState.Active
                s.connectedAt = new Date()
                s.videoOff = this.mediaType !== CallMediaType.Video
                break

            case 'terminated':
                if (s.state === CallState.Ended) {
                    throw new InvalidTransition(s.state, transition.type)
                }

                if (
                    (s.state === CallState.Active || s.state === CallState.OnHold) &&
                    s.connectedAt
                ) {
                    s.durationSecs = Math.floor((Date.now() - s.connectedAt.getTime()) / 1000)
                }

                s.state = CallState.Ended
                s.endedAt = new Date()
                s.endReason = transition.reason
                s.handRaised = false
                s.screenSharing = false
                this.raisedHands.clear()
                this.participantMedia.clear()
                break

            case 'hold':
                if (s.state !== CallState.Active) {
                    throw new InvalidTransition(s.state, transition.type)
                }

                s.state = CallState.OnHold
                break

            case 'resume':
                if (s.state !== CallState.OnHold) {
                    throw new InvalidTransition(s.state, transition.type)
                }

                s.state = CallState.Active
                break

            case 'audio_mute_changed':
                if (s.state !== CallState.Active) {
                    throw new InvalidTransition(s.state, transition.type)
                }

                s.audioMuted = transition.muted
                break

            case 'video_state_changed':
                if (s.state !== CallState.Active) {
                    throw new InvalidTransition(s.state, transition.type)
                }

                s.videoOff = transition.off
                break

            case 'hand_raise_changed':
                if (s.state !== CallState.Active) {
                    throw new InvalidTransition(s.state, transition.type)
                }

                s.handRaised = transition.raised
                break

            case 'screen_share_changed':
                if (s.state !== CallState.Active) {
                    throw new InvalidTransition(s.state, transition.type)
                }

                s.screenSharing = transition.sharing
                break

            default:
                throw new InvalidTransition(s.state, (transition as { type: string }).type)
        }
    }
}

export class InvalidTransition extends Error {
    currentState: string
    attempted: string

    constructor(currentState: string, attempted: string) {
        super(`invalid transition '${attempted}' in state '${currentState}'`)
        this.name = 'InvalidTransition'
        this.currentState = currentState
        this.attempted = attempted
    }
}

/** `<terminate>` reasons that hand the call to another device of this account. */
const HANDED_OVER_REASONS: ReadonlySet<string> = new Set([
    'accepted_elsewhere',
    'rejected_elsewhere',
    'device_switch'
])

/**
 * The `<terminate>` reason the server sends when a group call is over for everybody, once its
 * last member left; clients never send it. Any other terminate is one participant leaving.
 */
export const WA_GROUP_CALL_ENDED_REASON = 'group_call_ended'

/** What a `<terminate>` does to the call it names. */
export const WA_TERMINATE_DECISION = Object.freeze({
    End: 'end',
    /** Keep the call and let the consumer see a terminate arrived. */
    Ignore: 'ignore',
    /** Keep the call and report nothing. */
    IgnoreSilently: 'ignore_silently',
    /** Keep the call and take the sender off its composition. */
    RemoveParticipant: 'remove_participant'
} as const)

export type WaTerminateDecision = (typeof WA_TERMINATE_DECISION)[keyof typeof WA_TERMINATE_DECISION]

/**
 * What a `<terminate>` does to a joinable group call: an accept in flight is kept whatever the
 * reason, a handover reason ends it, an active call loses only the sender, the rest is kept.
 */
export function decideJoinableTerminate(
    call: CallInfo,
    reason: string | undefined
): WaTerminateDecision {
    if (!call.joinable || !call.isGroupCall || call.isEnded) return WA_TERMINATE_DECISION.End

    const state = call.stateData.state
    const terminateReason = reason ? reason : null

    if (terminateReason === WA_GROUP_CALL_ENDED_REASON) return WA_TERMINATE_DECISION.End

    if (state === CallState.Connecting && call.direction === CallDirection.Incoming) {
        return WA_TERMINATE_DECISION.Ignore
    }
    if (terminateReason !== null && HANDED_OVER_REASONS.has(terminateReason)) {
        return WA_TERMINATE_DECISION.End
    }

    if (state === CallState.Active || state === CallState.OnHold) {
        return WA_TERMINATE_DECISION.RemoveParticipant
    }
    if (terminateReason === null && state === CallState.IncomingRinging) {
        return WA_TERMINATE_DECISION.IgnoreSilently
    }
    return WA_TERMINATE_DECISION.Ignore
}
