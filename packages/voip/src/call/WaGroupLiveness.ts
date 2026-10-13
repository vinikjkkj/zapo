import type { Logger } from 'zapo-js'

import { groupParticipantAccountKey } from '../jid.js'
import {
    buildHeartbeatStanza,
    buildPeerStateStanza,
    WA_PEER_STATE
} from '../signaling/group-call.js'

import { toAddressedJid } from './call-jids.js'
import { type CallInfo, trackParticipantMedia } from './call-state.js'
import { WA_CALL_PARTICIPANT_STATE } from './group-participants.js'
import type { WaCallStanzaSender } from './WaCallStanzaSender.js'
import type { WaGroupRoster } from './WaGroupRoster.js'

/** How long a connected sender may go unheard before we report it invisible; RTCP counts as heard. */
const PEER_INVISIBLE_AFTER_MS = 20_000

/** Every connected member of a group call sends the call a `<heartbeat>` this often. */
const HEARTBEAT_INTERVAL_MS = 10_000
/** How often that is checked. */
const PEER_INVISIBLE_SWEEP_MS = 5_000

/** Where a sender's media edge is reported. */
export interface WaGroupLivenessDelegate {
    emitParticipantMedia?(call: CallInfo, participantJid: string, receiving: boolean): void
}

export interface WaGroupLivenessOptions {
    readonly info: CallInfo
    readonly logger: Logger
    readonly now: () => number
    readonly stanzas: WaCallStanzaSender
    readonly roster: Pick<WaGroupRoster, 'accountKeyOf' | 'selfAccountKey'>
    readonly delegate: WaGroupLivenessDelegate
}

/** Keeps a connected group call alive and its members' visibility honest: heartbeat and sweep. */
export class WaGroupLiveness {
    private readonly info: CallInfo
    private readonly logger: Logger
    private readonly now: () => number
    private readonly stanzas: WaCallStanzaSender
    private readonly roster: Pick<WaGroupRoster, 'accountKeyOf' | 'selfAccountKey'>
    private readonly delegate: WaGroupLivenessDelegate
    /** Since when we have been waiting on each connected group sender's media, by device. */
    private readonly senderWaitingSince = new Map<string, number>()
    private readonly invisibleReported = new Set<string>()
    private invisibleSweep: ReturnType<typeof setInterval> | null = null
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null

    constructor(options: WaGroupLivenessOptions) {
        this.info = options.info
        this.logger = options.logger
        this.now = options.now
        this.stanzas = options.stanzas
        this.roster = options.roster
        this.delegate = options.delegate
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
        const entry = trackParticipantMedia(this.info, participantJid, this.logger)
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

    /** Forgets what was tracked of a device that left, `key` its addressed form. */
    forget(key: string, deviceJid: string): void {
        this.senderWaitingSince.delete(key)
        this.invisibleReported.delete(groupParticipantAccountKey(deviceJid))
    }

    /** Sends the call a `<heartbeat>` now and on every interval while this group call lasts. */
    startHeartbeat(): void {
        if (!this.info.isGroupCall || this.heartbeatTimer || this.info.isEnded) return
        const intervalMs = this.info.voipSettings?.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS
        this.sendHeartbeat()
        this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), intervalMs)
        this.heartbeatTimer.unref?.()
        this.logger.debug('group heartbeat started', { callId: this.info.callId, intervalMs })
    }

    /** Starts checking, on a group call, for members nobody hears. */
    startSweep(): void {
        if (!this.info.isGroupCall || this.invisibleSweep) return
        this.invisibleSweep = setInterval(
            () => this.sweepInvisibleSenders(),
            PEER_INVISIBLE_SWEEP_MS
        )
        this.invisibleSweep.unref?.()
    }

    /** Stops the sweep, then the heartbeat. */
    stop(): void {
        if (this.invisibleSweep) clearInterval(this.invisibleSweep)
        this.invisibleSweep = null
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
        this.heartbeatTimer = null
    }

    /**
     * Reports invisible, once, each connected member none of whose devices was heard for
     * {@link PEER_INVISIBLE_AFTER_MS}; nobody while nobody at all is heard, our own path down.
     */
    private sweepInvisibleSenders(): void {
        const media = this.info.participantMedia
        if (!this.hearsAnySender()) return

        const selfKey = this.roster.selfAccountKey()
        const now = this.now()
        for (const participant of this.info.groupComposition?.participants ?? []) {
            if (participant.state !== WA_CALL_PARTICIPANT_STATE.Connected) continue
            const accountKey = this.roster.accountKeyOf(participant)
            if (accountKey === selfKey || this.invisibleReported.has(accountKey)) continue
            if (participant.devices.length === 0) continue

            let silentMs = Infinity
            for (const deviceJid of participant.devices) {
                const key = toAddressedJid(deviceJid, this.logger)
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
        this.stanzas.sendDetached(
            buildPeerStateStanza(
                this.info.callId,
                this.info.callCreator,
                peerJid,
                WA_PEER_STATE.Invisible
            ),
            'peer_state send failed'
        )
    }

    private sendHeartbeat(): void {
        this.stanzas.sendDetached(
            buildHeartbeatStanza(this.info.callId, this.info.callCreator),
            'heartbeat send failed',
            'trace'
        )
    }
}
