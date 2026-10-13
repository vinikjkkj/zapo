import type { Logger } from 'zapo-js'
import { toUserJid } from 'zapo-js/protocol'
import type { BinaryNode } from 'zapo-js/transport'
import { toError } from 'zapo-js/util'

import { groupParticipantAccountKey } from '../jid.js'
import { type GroupCallRoster, readGroupCallRoster } from '../signaling/group-info.js'

import { toAddressedJid } from './call-jids.js'
import type { CallInfo } from './call-state.js'
import { groupSenderDeviceJids } from './group-media-plan.js'
import {
    createGroupComposition,
    diffGroupParticipants,
    isGroupParticipantLeaving,
    WA_CALL_PARTICIPANT_STATE,
    type WaCallGroupParticipant,
    type WaGroupComposition,
    type WaGroupCompositionDiff
} from './group-participants.js'

export interface WaGroupRosterOptions {
    readonly info: CallInfo
    readonly logger: Logger
    /** Our own jid as the call knows it, empty while unknown. */
    readonly selfJid: () => string
}

/** Who is on a group call as this side reads it: seeds, departures and account matching. */
export class WaGroupRoster {
    private readonly info: CallInfo
    private readonly logger: Logger
    private readonly selfJid: () => string
    /** Account keys of roster entries, which are replaced whole and never mutated. */
    private readonly accountKeys = new WeakMap<WaCallGroupParticipant, string>()
    private selfKeyOf: { readonly jid: string; readonly key: string } | null = null

    constructor(options: WaGroupRosterOptions) {
        this.info = options.info
        this.logger = options.logger
        this.selfJid = options.selfJid
    }

    /**
     * Seeds the composition from the `<group_info>` of an offer, leaving out whoever it already
     * reports off the call. An unreadable or empty one seeds nothing and gives `null`.
     */
    seedFromOffer(
        inner: BinaryNode
    ): { readonly participantCount: number; readonly connectedLimit: number } | null {
        let roster: GroupCallRoster
        try {
            roster = readGroupCallRoster(inner)
        } catch (err) {
            this.logger.warn('offer carried an unreadable group_info', {
                callId: this.info.callId,
                message: toError(err).message
            })
            return null
        }
        if (roster.kind !== 'roster') {
            if (roster.kind === 'empty') {
                this.logger.warn('offer carried a group_info listing nobody, no composition set', {
                    callId: this.info.callId
                })
            }
            return null
        }

        const present = roster.participants.filter(
            (participant) => !isGroupParticipantLeaving(participant)
        )
        this.info.groupComposition = createGroupComposition(present)
        return { participantCount: present.length, connectedLimit: roster.info.connectedLimit }
    }

    /** Seeds the composition of a call joined after its ring from the last roster kept. */
    seedJoin(participants: readonly WaCallGroupParticipant[], transactionId: number | null): void {
        this.info.groupComposition = createGroupComposition(
            participants.filter((participant) => !isGroupParticipantLeaving(participant)),
            transactionId
        )
    }

    /** Seeds the composition of a call we place, from the participants our offer named. */
    seedOutgoing(participants: readonly WaCallGroupParticipant[]): void {
        this.info.groupComposition = createGroupComposition(participants)
    }

    /**
     * Takes `peerJid`'s account off the composition, its counter kept, and returns the change;
     * `null` when it was not on it.
     */
    remove(peerJid: string | undefined, reason: string | undefined): WaGroupCompositionDiff | null {
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
            return null
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
        return diff
    }

    logDiff(
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

    selfAccountKey(): string | null {
        const selfJid = this.selfJid()
        if (!selfJid) return null
        if (this.selfKeyOf?.jid !== selfJid) {
            this.selfKeyOf = { jid: selfJid, key: groupParticipantAccountKey(selfJid) }
        }
        return this.selfKeyOf.key
    }

    accountKeyOf(participant: WaCallGroupParticipant): string {
        let key = this.accountKeys.get(participant)
        if (key === undefined) {
            key = groupParticipantAccountKey(participant.jid)
            this.accountKeys.set(participant, key)
        }
        return key
    }

    /** Every device sending into this group call, ourselves left out. */
    senderDevices(): string[] {
        const composition = this.info.groupComposition
        if (!composition) return []
        return groupSenderDeviceJids(composition, this.selfJid(), (participant) =>
            this.accountKeyOf(participant)
        )
    }

    /** The device a jid names on this call, device 0 bare; an account names its first device. */
    participantDeviceOf(jid: string): string | null {
        const key = groupParticipantAccountKey(jid)
        const participant = this.info.groupComposition?.participants.find(
            (entry) => this.accountKeyOf(entry) === key
        )
        if (!participant) return null
        if (toUserJid(jid) === jid) {
            const first = participant.devices[0]
            return first ? toAddressedJid(first, this.logger) : null
        }
        const wanted = toAddressedJid(jid, this.logger)
        const device = participant.devices.find(
            (deviceJid) => toAddressedJid(deviceJid, this.logger) === wanted
        )
        return device ? toAddressedJid(device, this.logger) : null
    }

    /** Whether the roster lists somebody but us connected. */
    hasOtherConnected(): boolean {
        const selfKey = this.selfAccountKey()
        return (this.info.groupComposition?.participants ?? []).some(
            (participant) =>
                participant.state === WA_CALL_PARTICIPANT_STATE.Connected &&
                this.accountKeyOf(participant) !== selfKey
        )
    }

    /** Whether a roster change brought somebody else in, or connected somebody already listed. */
    anyoneArrived(before: WaGroupComposition, after: WaGroupComposition): boolean {
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
}
