import type { Logger } from 'zapo-js'
import { canonicalizeSignalServer, parseSignalAddressFromJid, WA_DEFAULTS } from 'zapo-js/protocol'

/**
 * `state` of a `<user>` or `<participant>` as the wire spells it: text from a table of its own,
 * not the enum names lowercased (ordinal 2 is `outgoing`, ordinal 10 `cancel_offer`).
 */
export const WA_CALL_PARTICIPANT_STATE = Object.freeze({
    Invalid: 'invalid',
    Connected: 'connected',
    Outgoing: 'outgoing',
    Receipt: 'receipt',
    Rejected: 'rejected',
    Terminated: 'terminated',
    TimedOut: 'timedout',
    Creating: 'creating',
    Invisible: 'invisible',
    Visible: 'visible',
    CancelOffer: 'cancel_offer',
    Invited: 'invited'
} as const)

const PRESENT_STATES: ReadonlySet<string> = new Set<string>([
    WA_CALL_PARTICIPANT_STATE.Connected,
    WA_CALL_PARTICIPANT_STATE.Outgoing,
    WA_CALL_PARTICIPANT_STATE.Receipt,
    WA_CALL_PARTICIPANT_STATE.Creating,
    WA_CALL_PARTICIPANT_STATE.Invisible,
    WA_CALL_PARTICIPANT_STATE.Visible,
    WA_CALL_PARTICIPANT_STATE.Invited
])

const CLEAN_DEPARTURE_STATES: ReadonlySet<string> = new Set<string>([
    WA_CALL_PARTICIPANT_STATE.Terminated,
    WA_CALL_PARTICIPANT_STATE.Invalid
])

/** Departures from before the participant ever connected. */
const UNEXPECTED_DEPARTURE_STATES: ReadonlySet<string> = new Set<string>([
    WA_CALL_PARTICIPANT_STATE.Rejected,
    WA_CALL_PARTICIPANT_STATE.TimedOut,
    WA_CALL_PARTICIPANT_STATE.CancelOffer
])

/** Why a change asks for new keys. The key is per participant: a device leaving keeps it. */
export const WA_GROUP_REKEY_REASON = Object.freeze({
    ParticipantAdded: 'participant_added',
    ParticipantRemoved: 'participant_removed',
    /** The `rekey` flag of the update: the server asked, whatever the diff shows. */
    UpdateFlag: 'update_flag'
} as const)

export type WaGroupRekeyReason = (typeof WA_GROUP_REKEY_REASON)[keyof typeof WA_GROUP_REKEY_REASON]

/** What took a participant off the call. */
export const WA_GROUP_REMOVAL_CAUSE = Object.freeze({
    /** Left out of a roster, which is always the whole call. */
    Absent: 'absent',
    /** Listed as `terminated` or `invalid`. */
    Departed: 'departed',
    /** Listed as `rejected`, `timedout` or `cancel_offer`. */
    DepartedUnexpected: 'departed_unexpected',
    /** Carrying the in-band nack, whatever its state said. */
    Nacked: 'nacked'
} as const)

export type WaGroupRemovalCause =
    (typeof WA_GROUP_REMOVAL_CAUSE)[keyof typeof WA_GROUP_REMOVAL_CAUSE]

function departureCauseOfState(state: string): WaGroupRemovalCause | null {
    if (CLEAN_DEPARTURE_STATES.has(state)) return WA_GROUP_REMOVAL_CAUSE.Departed
    if (UNEXPECTED_DEPARTURE_STATES.has(state)) return WA_GROUP_REMOVAL_CAUSE.DepartedUnexpected
    return null
}

function isRecognizedState(state: string): boolean {
    return PRESENT_STATES.has(state) || departureCauseOfState(state) !== null
}

/** One participant of a group call. */
export interface WaGroupParticipant {
    /** The account jid; matched through {@link groupParticipantAccountKey}, never as text. */
    readonly jid: string
    /** Device jids, primary first, at most five. Empty for a nacked participant. */
    readonly devices: readonly string[]
    /** One of {@link WA_CALL_PARTICIPANT_STATE}. Absent reports no departure. */
    readonly state?: string
    /** The in-band nack, which overrides the state. */
    readonly nacked?: boolean
    /**
     * `<device pid>` per device jid, from the roster that carried one; 0 is a real pid. A pid
     * that changes is not a change of who is on the call.
     */
    readonly devicePids?: Readonly<Record<string, number>>
}

/** The composition this client holds for one group call. */
export interface WaGroupComposition {
    readonly participants: readonly WaGroupParticipant[]
    /** `transaction-id` of the last roster folded in, `null` before the first. */
    readonly lastTransactionId: number | null
}

/** A `group_update` reduced to what reconciliation reads. */
export interface WaGroupUpdate {
    readonly transactionId: number
    /**
     * The whole roster of the update's `<group_info>`: whoever it leaves out is off the call.
     * `undefined` when the update carried none, which leaves the composition alone.
     */
    readonly participants?: readonly WaGroupParticipant[]
    readonly rekey?: boolean
}

/**
 * A participant that replaced its single device with another. The caller recreates its
 * streams and terminates the old device with `device_switch`; the keys stay.
 */
export interface WaGroupDeviceSwitch {
    readonly jid: string
    readonly participant: WaGroupParticipant
    readonly previousDeviceJid: string
    readonly deviceJid: string
}

/** A device gained or lost by a participant who stays on the call. */
export interface WaGroupDeviceChange {
    readonly jid: string
    readonly participant: WaGroupParticipant
    readonly deviceJid: string
}

/** A participant taken off the call, as the call held it. */
export interface WaGroupRemoval {
    readonly jid: string
    readonly participant: WaGroupParticipant
    readonly cause: WaGroupRemovalCause
}

/** What one update did to the composition. The lists do not overlap. */
export interface WaGroupCompositionDiff {
    readonly added: readonly WaGroupParticipant[]
    readonly switched: readonly WaGroupDeviceSwitch[]
    readonly removed: readonly WaGroupRemoval[]
    readonly devicesAdded: readonly WaGroupDeviceChange[]
    readonly devicesRemoved: readonly WaGroupDeviceChange[]
    /** Whether the change crossed the per-participant key boundary. */
    readonly rekeyRequired: boolean
    readonly rekeyReason: WaGroupRekeyReason | null
}

export type WaGroupUpdateOutcome =
    | {
          readonly applied: true
          readonly composition: WaGroupComposition
          readonly diff: WaGroupCompositionDiff
      }
    | {
          readonly applied: false
          readonly discardReason: 'stale'
          readonly transactionId: number
          readonly lastTransactionId: number
      }
    | {
          readonly applied: false
          readonly discardReason: 'no_roster'
          readonly transactionId: number
      }

/**
 * The key an account is matched by: user and canonical domain, device dropped. One account
 * travels bare, as `:0` and as `:76` within a single call.
 */
export function groupParticipantAccountKey(jid: string): string {
    const address = parseSignalAddressFromJid(jid)
    return `${address.user}@${canonicalizeSignalServer(address.server ?? WA_DEFAULTS.HOST_DOMAIN)}`
}

/** Whether a `state` names a participant on the call or arriving; false is not a departure. */
export function isGroupParticipantPresent(state: string): boolean {
    return PRESENT_STATES.has(state)
}

/** Whether an update reports this participant off the call, by nack or by state. */
export function isGroupParticipantLeaving(participant: WaGroupParticipant): boolean {
    return removalCauseOf(participant) !== null
}

function removalCauseOf(participant: WaGroupParticipant): WaGroupRemovalCause | null {
    if (participant.nacked === true) return WA_GROUP_REMOVAL_CAUSE.Nacked
    if (participant.state === undefined) return null
    return departureCauseOfState(participant.state)
}

export function createGroupComposition(
    participants: readonly WaGroupParticipant[],
    transactionId: number | null = null
): WaGroupComposition {
    return { participants, lastTransactionId: transactionId }
}

/**
 * Diffs a whole roster against the composition in hand. A state outside
 * {@link WA_CALL_PARTICIPANT_STATE} keeps its participant and is logged: tearing down someone
 * present cannot be undone, keeping someone a moment too long can.
 */
export function diffGroupParticipants(
    current: readonly WaGroupParticipant[],
    incoming: readonly WaGroupParticipant[],
    logger: Logger
): WaGroupCompositionDiff {
    const added: WaGroupParticipant[] = []
    const switched: WaGroupDeviceSwitch[] = []
    const removed: WaGroupRemoval[] = []
    const devicesAdded: WaGroupDeviceChange[] = []
    const devicesRemoved: WaGroupDeviceChange[] = []

    const before = new Map<string, WaGroupParticipant>()
    for (const participant of current) {
        before.set(groupParticipantAccountKey(participant.jid), participant)
    }

    const listed = new Set<string>()
    for (const participant of incoming) {
        const key = groupParticipantAccountKey(participant.jid)
        listed.add(key)
        const previous = before.get(key)

        if (participant.state !== undefined && !isRecognizedState(participant.state)) {
            logger.warn('group call participant state not recognized, keeping the participant', {
                jid: participant.jid,
                state: participant.state
            })
        }

        const cause = removalCauseOf(participant)
        if (cause !== null) {
            if (previous) removed.push({ jid: previous.jid, participant: previous, cause })
            continue
        }

        if (!previous) {
            added.push(participant)
            continue
        }

        const previousDeviceJid = previous.devices[0]
        const deviceJid = participant.devices[0]
        if (
            previous.devices.length === 1 &&
            participant.devices.length === 1 &&
            previousDeviceJid !== undefined &&
            deviceJid !== undefined &&
            previousDeviceJid !== deviceJid
        ) {
            switched.push({ jid: participant.jid, participant, previousDeviceJid, deviceJid })
            continue
        }

        for (const device of participant.devices) {
            if (!previous.devices.includes(device)) {
                devicesAdded.push({ jid: participant.jid, participant, deviceJid: device })
            }
        }
        for (const device of previous.devices) {
            if (!participant.devices.includes(device)) {
                devicesRemoved.push({ jid: participant.jid, participant, deviceJid: device })
            }
        }
    }

    for (const participant of current) {
        if (!listed.has(groupParticipantAccountKey(participant.jid))) {
            removed.push({
                jid: participant.jid,
                participant,
                cause: WA_GROUP_REMOVAL_CAUSE.Absent
            })
        }
    }

    const rekeyReason =
        removed.length > 0
            ? WA_GROUP_REKEY_REASON.ParticipantRemoved
            : added.length > 0
              ? WA_GROUP_REKEY_REASON.ParticipantAdded
              : null

    return {
        added,
        switched,
        removed,
        devicesAdded,
        devicesRemoved,
        rekeyRequired: rekeyReason !== null,
        rekeyReason
    }
}

/** Whether an update repeats or predates the `transaction-id` already applied. */
export function isStaleGroupUpdate(
    composition: WaGroupComposition,
    update: WaGroupUpdate
): boolean {
    const last = composition.lastTransactionId
    return last !== null && update.transactionId <= last
}

/**
 * Folds one update into a composition. A roster replaces the composition minus whoever it
 * reports leaving; an update without one moves neither the participants nor the counter.
 */
export function applyGroupUpdate(
    composition: WaGroupComposition,
    update: WaGroupUpdate,
    logger: Logger
): WaGroupUpdateOutcome {
    const roster = update.participants
    if (roster === undefined) {
        return { applied: false, discardReason: 'no_roster', transactionId: update.transactionId }
    }

    if (isStaleGroupUpdate(composition, update)) {
        return {
            applied: false,
            discardReason: 'stale',
            transactionId: update.transactionId,
            lastTransactionId: composition.lastTransactionId ?? update.transactionId
        }
    }

    const diff = diffGroupParticipants(composition.participants, roster, logger)

    return {
        applied: true,
        composition: {
            participants: roster.filter((participant) => removalCauseOf(participant) === null),
            lastTransactionId: update.transactionId
        },
        diff:
            update.rekey === true && !diff.rekeyRequired
                ? { ...diff, rekeyRequired: true, rekeyReason: WA_GROUP_REKEY_REASON.UpdateFlag }
                : diff
    }
}
