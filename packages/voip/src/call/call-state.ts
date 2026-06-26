import {
    CallDirection,
    CallMediaType,
    CallState,
    type CallTransition,
    type EndCallReason,
    type RelayData
} from '../types.js'

export interface CallStateData {
    state: CallState
    connectedAt?: Date
    acceptedAt?: Date
    endedAt?: Date
    audioMuted: boolean
    videoOff: boolean
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
    groupJid?: string
    isOffline: boolean
    callerPn?: string
    encryptionKey?: Uint8Array
    relayData?: RelayData
    electedRelayIdx?: number

    private constructor(
        init: Partial<CallInfo> & {
            callId: string
            peerJid: string
            callCreator: string
            direction: CallDirection
            mediaType: CallMediaType
            stateData: CallStateData
        }
    ) {
        this.callId = init.callId
        this.peerJid = init.peerJid
        this.callCreator = init.callCreator
        this.direction = init.direction
        this.mediaType = init.mediaType
        this.stateData = init.stateData
        this.createdAt = init.createdAt ?? new Date()
        this.groupJid = init.groupJid
        this.isOffline = init.isOffline ?? false
        this.callerPn = init.callerPn
        this.encryptionKey = init.encryptionKey
        this.relayData = init.relayData
        this.electedRelayIdx = init.electedRelayIdx
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
                videoOff: mediaType !== CallMediaType.Video
            }
        })
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
                videoOff: mediaType !== CallMediaType.Video
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

                if (s.state === CallState.Active && s.connectedAt) {
                    s.durationSecs = Math.floor((Date.now() - s.connectedAt.getTime()) / 1000)
                } else if (s.state === CallState.OnHold && s.connectedAt) {
                    s.durationSecs = Math.floor((Date.now() - s.connectedAt.getTime()) / 1000)
                }

                s.state = CallState.Ended
                s.endedAt = new Date()
                s.endReason = transition.reason
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
