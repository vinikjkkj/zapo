import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger, type Logger } from 'zapo-js'

import { groupParticipantAccountKey } from '../../jid.js'
import {
    applyGroupUpdate,
    createGroupComposition,
    diffGroupParticipants,
    isGroupParticipantLeaving,
    isGroupParticipantPresent,
    isStaleGroupUpdate,
    WA_CALL_PARTICIPANT_STATE,
    WA_GROUP_REKEY_REASON,
    WA_GROUP_REMOVAL_CAUSE,
    type WaCallGroupParticipant
} from '../group-participants.js'

const ANA: WaCallGroupParticipant = { jid: '1001@lid', devices: ['1001:0@lid'] }
const BRUNO_PHONE: WaCallGroupParticipant = { jid: '1002@lid', devices: ['1002:0@lid'] }
/** The same account as {@link BRUNO_PHONE}, answering on its companion instead. */
const BRUNO_DESKTOP: WaCallGroupParticipant = { jid: '1002@lid', devices: ['1002:21@lid'] }
const BRUNO_BOTH: WaCallGroupParticipant = {
    jid: '1002@lid',
    devices: ['1002:0@lid', '1002:21@lid']
}
const CLARA: WaCallGroupParticipant = { jid: '1003@lid', devices: ['1003:0@lid'] }

/** The `state` spellings, as text. */
const PRESENT_STATES = [
    'connected',
    'outgoing',
    'receipt',
    'creating',
    'invisible',
    'visible',
    'invited'
]
const CLEAN_DEPARTURE_STATES = ['terminated', 'invalid']
const UNEXPECTED_DEPARTURE_STATES = ['rejected', 'timedout', 'cancel_offer']

/** A progression seen on a group call: ordinals 2, 11, 3, 1. */
const WIRE_ORDER = ['outgoing', 'invited', 'receipt', 'connected']

/** Not a wire value: drives the keep-and-log fallback. */
const FABRICATED_OFF_TABLE_STATE = 'zzz_not_a_wire_state'

/** The enum name of ordinal 2 lowercased, which is not its wire spelling. */
const LOWERCASED_ENUM_NAME = 'incoming'

/** Collects the warnings the reconciler emits, so the fallback can be observed. */
function recordingLogger(): {
    readonly logger: Logger
    readonly warnings: { readonly message: string; readonly context?: Record<string, unknown> }[]
} {
    const warnings: { message: string; context?: Record<string, unknown> }[] = []
    const logger: Logger = {
        ...createNoopLogger(),
        warn: (message, context) => {
            warnings.push({ message, context: context ? { ...context } : undefined })
        }
    }
    return { logger, warnings }
}

test('the spellings one account arrives in are one participant, other users are not', () => {
    // The bare spelling and two device suffixes of one account.
    const bare: WaCallGroupParticipant = {
        jid: '184478207058035@lid',
        devices: ['184478207058035:0@lid']
    }
    const zero: WaCallGroupParticipant = {
        jid: '184478207058035:0@lid',
        devices: ['184478207058035:0@lid']
    }
    const one: WaCallGroupParticipant = {
        jid: '184478207058035:1@lid',
        devices: ['184478207058035:0@lid']
    }

    assert.equal(groupParticipantAccountKey(bare.jid), groupParticipantAccountKey(zero.jid))
    assert.equal(groupParticipantAccountKey(bare.jid), groupParticipantAccountKey(one.jid))

    for (const spelling of [bare, zero, one]) {
        const diff = diffGroupParticipants([bare], [spelling], createNoopLogger())
        assert.deepEqual(diff.added, [], spelling.jid)
        assert.deepEqual(diff.removed, [], spelling.jid)
        assert.deepEqual(diff.switched, [], spelling.jid)
        assert.equal(diff.rekeyRequired, false, spelling.jid)
    }

    // The other side of the same assertion: a different user is not folded in with it, or
    // somebody leaving and somebody arriving would read as no change and skip the rekey.
    const otherUser: WaCallGroupParticipant = {
        jid: '184478207058036@lid',
        devices: ['184478207058036:0@lid']
    }
    assert.notEqual(groupParticipantAccountKey(bare.jid), groupParticipantAccountKey(otherUser.jid))

    const across = diffGroupParticipants([bare], [otherUser], createNoopLogger())
    assert.deepEqual(across.added, [otherUser])
    assert.equal(across.removed.length, 1)
    assert.equal(across.rekeyRequired, true)
    assert.equal(across.rekeyReason, WA_GROUP_REKEY_REASON.ParticipantRemoved)
})

/** Pins the fold the `<group_info>` parse also applies, so the two agree on an account. */
test('a hosted lid spelling folds into the plain one, as the parse does today', () => {
    assert.equal(
        groupParticipantAccountKey('1005@hosted.lid'),
        groupParticipantAccountKey('1005@lid')
    )
})

test('the domain is part of the account key, so a non-lid spelling is not folded in', () => {
    const lid: WaCallGroupParticipant = { jid: '1004@lid', devices: ['1004:0@lid'] }
    const pn: WaCallGroupParticipant = {
        jid: '1004@s.whatsapp.net',
        devices: ['1004:0@s.whatsapp.net']
    }

    assert.notEqual(groupParticipantAccountKey(lid.jid), groupParticipantAccountKey(pn.jid))

    const diff = diffGroupParticipants([lid], [pn], createNoopLogger())
    assert.deepEqual(diff.added, [pn])
    assert.equal(diff.removed.length, 1)
})

test('an account that was not on the call is an add, and re-keys', () => {
    const diff = diffGroupParticipants(
        [ANA, BRUNO_PHONE],
        [ANA, BRUNO_PHONE, CLARA],
        createNoopLogger()
    )

    assert.deepEqual(diff.added, [CLARA])
    assert.deepEqual(diff.removed, [])
    assert.deepEqual(diff.switched, [])
    assert.deepEqual(diff.devicesAdded, [])
    assert.equal(diff.rekeyRequired, true)
    assert.equal(diff.rekeyReason, WA_GROUP_REKEY_REASON.ParticipantAdded)
})

test('an account kept on another single device is a switch, not an add plus a remove', () => {
    const diff = diffGroupParticipants([ANA, BRUNO_PHONE], [ANA, BRUNO_DESKTOP], createNoopLogger())

    assert.deepEqual(diff.added, [])
    assert.deepEqual(diff.removed, [])
    assert.deepEqual(diff.devicesAdded, [])
    assert.deepEqual(diff.devicesRemoved, [])
    assert.equal(diff.switched.length, 1)
    assert.equal(diff.switched[0]?.jid, '1002@lid')
    // The device left behind is what the caller terminates with reason `device_switch`.
    assert.equal(diff.switched[0]?.previousDeviceJid, '1002:0@lid')
    assert.equal(diff.switched[0]?.deviceJid, '1002:21@lid')
    assert.equal(diff.switched[0]?.participant, BRUNO_DESKTOP)
})

test('a switch is read even when the account itself is spelled with a device', () => {
    // The same account written bare on one stanza and with a device suffix on another.
    const before: WaCallGroupParticipant = { jid: '1002@lid', devices: ['1002:0@lid'] }
    const after: WaCallGroupParticipant = { jid: '1002:21@lid', devices: ['1002:21@lid'] }

    const diff = diffGroupParticipants([before], [after], createNoopLogger())

    assert.equal(diff.switched.length, 1)
    assert.equal(diff.switched[0]?.previousDeviceJid, '1002:0@lid')
    assert.equal(diff.switched[0]?.deviceJid, '1002:21@lid')
    assert.deepEqual(diff.added, [])
    assert.deepEqual(diff.removed, [])
    assert.equal(diff.rekeyRequired, false)
})

test('the account decides the switch: another account of the same shape is two participants', () => {
    // One participant in, one out, one device each, device jids differing: the two diffs
    // are the same shape and differ only in whether the account jid matched.
    const sameAccount = diffGroupParticipants([BRUNO_PHONE], [BRUNO_DESKTOP], createNoopLogger())
    assert.equal(sameAccount.switched.length, 1)
    assert.deepEqual(sameAccount.added, [])
    assert.deepEqual(sameAccount.removed, [])
    assert.equal(sameAccount.rekeyRequired, false)
    assert.equal(sameAccount.rekeyReason, null)

    const otherAccount = diffGroupParticipants([BRUNO_PHONE], [CLARA], createNoopLogger())
    assert.deepEqual(otherAccount.switched, [])
    assert.deepEqual(otherAccount.added, [CLARA])
    assert.equal(otherAccount.removed.length, 1)
    assert.equal(otherAccount.removed[0]?.participant, BRUNO_PHONE)
    assert.equal(otherAccount.rekeyRequired, true)
    assert.equal(otherAccount.rekeyReason, WA_GROUP_REKEY_REASON.ParticipantRemoved)
})

test('an account left out of the roster is removed, and re-keys', () => {
    const diff = diffGroupParticipants([ANA, BRUNO_PHONE, CLARA], [ANA, CLARA], createNoopLogger())

    assert.deepEqual(diff.removed, [
        { jid: '1002@lid', participant: BRUNO_PHONE, cause: WA_GROUP_REMOVAL_CAUSE.Absent }
    ])
    assert.deepEqual(diff.added, [])
    // Gone whole: its device is not reported a second time as a device that left.
    assert.deepEqual(diff.devicesRemoved, [])
    assert.equal(diff.rekeyRequired, true)
    assert.equal(diff.rekeyReason, WA_GROUP_REKEY_REASON.ParticipantRemoved)
})

test('the twelve spellings of the table are each accounted for, and no more', () => {
    const table: readonly string[] = Object.values(WA_CALL_PARTICIPANT_STATE)
    assert.equal(table.length, 12)

    // Every spelling lands in exactly one bucket: nothing falls through to the keep-and-log
    // fallback, and nothing is claimed by two rules at once.
    assert.deepEqual(
        [...table].sort(),
        [...PRESENT_STATES, ...CLEAN_DEPARTURE_STATES, ...UNEXPECTED_DEPARTURE_STATES].sort()
    )

    for (const state of WIRE_ORDER) assert.ok(table.includes(state), state)
})

test('a state of the present set takes nobody off the call', () => {
    for (const state of PRESENT_STATES) {
        assert.equal(isGroupParticipantPresent(state), true, state)

        const { logger, warnings } = recordingLogger()
        // Whole roster, ANA included: leaving her out would remove her, which is a different
        // rule and would hide the one under test.
        const diff = diffGroupParticipants(
            [ANA, BRUNO_PHONE],
            [ANA, { jid: '1002@lid', devices: ['1002:0@lid'], state }],
            logger
        )

        assert.deepEqual(diff.removed, [], state)
        assert.deepEqual(diff.added, [], state)
        assert.deepEqual(diff.devicesRemoved, [], state)
        assert.equal(diff.rekeyRequired, false, state)
        // A spelling the table names is not worth a word.
        assert.deepEqual(warnings, [], state)
    }
})

test('a state of the clean departure set takes the participant off the call', () => {
    for (const state of CLEAN_DEPARTURE_STATES) {
        const { logger, warnings } = recordingLogger()
        const diff = diffGroupParticipants(
            [ANA, BRUNO_PHONE],
            [ANA, { jid: '1002@lid', devices: ['1002:0@lid'], state }],
            logger
        )

        assert.deepEqual(
            diff.removed,
            [{ jid: '1002@lid', participant: BRUNO_PHONE, cause: WA_GROUP_REMOVAL_CAUSE.Departed }],
            state
        )
        assert.deepEqual(diff.added, [], state)
        assert.equal(diff.rekeyReason, WA_GROUP_REKEY_REASON.ParticipantRemoved, state)
        assert.deepEqual(warnings, [], state)
    }
})

test('a state of the unexpected departure set takes it off the call, and says so', () => {
    for (const state of UNEXPECTED_DEPARTURE_STATES) {
        const diff = diffGroupParticipants(
            [ANA, BRUNO_PHONE],
            [ANA, { jid: '1002@lid', devices: ['1002:0@lid'], state }],
            createNoopLogger()
        )

        assert.equal(diff.removed.length, 1, state)
        assert.equal(diff.removed[0]?.participant, BRUNO_PHONE, state)
        assert.equal(diff.removed[0]?.cause, WA_GROUP_REMOVAL_CAUSE.DepartedUnexpected, state)
    }
})

test('a state off the table keeps the participant, and says so in the log', () => {
    const offTable: WaCallGroupParticipant = {
        jid: '1002@lid',
        devices: ['1002:0@lid'],
        state: FABRICATED_OFF_TABLE_STATE
    }

    assert.equal(isGroupParticipantPresent(FABRICATED_OFF_TABLE_STATE), false)
    assert.equal(isGroupParticipantLeaving(offTable), false)

    const { logger, warnings } = recordingLogger()
    const diff = diffGroupParticipants([ANA, BRUNO_PHONE], [ANA, offTable], logger)

    // Keeping somebody a moment too long is recoverable; tearing down somebody who is
    // present is not, so a spelling this build cannot read removes nobody.
    assert.deepEqual(diff.removed, [])
    assert.deepEqual(diff.added, [])
    assert.equal(diff.rekeyRequired, false)

    // The log is what carries the unread spelling back out.
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]?.message ?? '', /state not recognized/)
    assert.deepEqual(warnings[0]?.context, {
        jid: '1002@lid',
        state: FABRICATED_OFF_TABLE_STATE
    })
})

test('the lowercased enum name is not the wire spelling, and is not read as one', () => {
    // The ordinal that reads `outgoing` would read `incoming` if the table were the names
    // lowercased. It is not, so this reaches the keep-and-log fallback like any other
    // stranger - and above all it is not silently taken for a departure.
    assert.equal(isGroupParticipantPresent(LOWERCASED_ENUM_NAME), false)

    const { logger, warnings } = recordingLogger()
    const diff = diffGroupParticipants(
        [ANA, BRUNO_PHONE],
        [ANA, { jid: '1002@lid', devices: ['1002:0@lid'], state: LOWERCASED_ENUM_NAME }],
        logger
    )

    assert.deepEqual(diff.removed, [])
    assert.equal(warnings.length, 1)
})

test('a state off the table survives a whole update, composition and all', () => {
    const offTable: WaCallGroupParticipant = {
        jid: '1002@lid',
        devices: ['1002:0@lid'],
        state: FABRICATED_OFF_TABLE_STATE
    }
    const { logger, warnings } = recordingLogger()
    const outcome = applyGroupUpdate(
        createGroupComposition([ANA, BRUNO_PHONE], 1),
        {
            transactionId: 2,
            participants: [ANA, offTable]
        },
        logger
    )

    assert.equal(outcome.applied, true)
    if (!outcome.applied) return

    assert.deepEqual(outcome.diff.removed, [])
    assert.deepEqual(outcome.composition.participants, [ANA, offTable])
    // Once, not once per pass over the list.
    assert.equal(warnings.length, 1)
})

test('a participant progressing through the arrival states is never removed', () => {
    let composition = createGroupComposition([ANA], 0)

    for (const [index, state] of WIRE_ORDER.entries()) {
        const { logger, warnings } = recordingLogger()
        const outcome = applyGroupUpdate(
            composition,
            {
                transactionId: index + 1,
                participants: [ANA, { jid: '1002@lid', devices: ['1002:0@lid'], state }]
            },
            logger
        )

        assert.equal(outcome.applied, true, state)
        if (!outcome.applied) return

        assert.deepEqual(outcome.diff.removed, [], state)
        assert.deepEqual(warnings, [], state)
        composition = outcome.composition
    }

    assert.deepEqual(composition.participants, [
        ANA,
        { jid: '1002@lid', devices: ['1002:0@lid'], state: 'connected' }
    ])
})

test('a roster carrying no state at all reports no departure', () => {
    assert.equal(isGroupParticipantLeaving(BRUNO_PHONE), false)

    const diff = diffGroupParticipants([ANA, BRUNO_PHONE], [ANA, BRUNO_PHONE], createNoopLogger())

    assert.deepEqual(diff.removed, [])
})

test('the nack takes the participant down whatever its state said', () => {
    const connectedAndNacked: WaCallGroupParticipant = {
        jid: '1002@lid',
        devices: ['1002:0@lid'],
        state: 'connected',
        nacked: true
    }
    assert.equal(isGroupParticipantLeaving(connectedAndNacked), true)

    const diff = diffGroupParticipants(
        [ANA, BRUNO_PHONE],
        [ANA, connectedAndNacked],
        createNoopLogger()
    )

    assert.equal(diff.removed.length, 1)
    assert.equal(diff.removed[0]?.cause, WA_GROUP_REMOVAL_CAUSE.Nacked)
    assert.equal(diff.removed[0]?.participant, BRUNO_PHONE)
})

test('a participant reported leaving does not stay stuck in the composition', () => {
    const composition = createGroupComposition([ANA, BRUNO_PHONE, CLARA], 1)
    const outcome = applyGroupUpdate(
        composition,
        {
            transactionId: 2,
            participants: [
                ANA,
                CLARA,
                { jid: '1002@lid', devices: ['1002:0@lid'], state: 'terminated' }
            ]
        },
        createNoopLogger()
    )

    assert.equal(outcome.applied, true)
    if (!outcome.applied) return

    assert.equal(outcome.diff.removed.length, 1)
    assert.deepEqual(outcome.composition.participants, [ANA, CLARA])
})

test('a roster reporting a leave in its own list names the state, not an absence', () => {
    const composition = createGroupComposition([ANA, BRUNO_PHONE], 3)
    const staying = { jid: '1001@lid', devices: ['1001:0@lid'], state: 'connected' }
    const outcome = applyGroupUpdate(
        composition,
        {
            transactionId: 4,
            // The roster lists both, so the removal is read off the entry, not off a silence.
            participants: [staying, { jid: '1002@lid', devices: ['1002:0@lid'], state: 'rejected' }]
        },
        createNoopLogger()
    )

    assert.equal(outcome.applied, true)
    if (!outcome.applied) return

    assert.equal(outcome.diff.removed.length, 1)
    assert.equal(outcome.diff.removed[0]?.cause, WA_GROUP_REMOVAL_CAUSE.DepartedUnexpected)
    assert.deepEqual(outcome.composition.participants, [staying])
})

test('a departure for an account the call never held is not an arrival', () => {
    const diff = diffGroupParticipants(
        [ANA],
        [ANA, { jid: '1003@lid', devices: ['1003:0@lid'], state: 'terminated' }],
        createNoopLogger()
    )

    assert.deepEqual(diff.added, [])
    assert.deepEqual(diff.removed, [])
    assert.equal(diff.rekeyRequired, false)
})

test('one device of a participant who stays is a device removal, and does not re-key', () => {
    const diff = diffGroupParticipants([ANA, BRUNO_BOTH], [ANA, BRUNO_PHONE], createNoopLogger())

    assert.deepEqual(diff.removed, [])
    assert.equal(diff.devicesRemoved.length, 1)
    assert.equal(diff.devicesRemoved[0]?.jid, '1002@lid')
    assert.equal(diff.devicesRemoved[0]?.deviceJid, '1002:21@lid')
    // The key is per participant, and this participant is still on the call.
    assert.equal(diff.rekeyRequired, false)
    assert.equal(diff.rekeyReason, null)
})

test('a further device of a participant who stays is a device add, and does not re-key', () => {
    const diff = diffGroupParticipants([ANA, BRUNO_PHONE], [ANA, BRUNO_BOTH], createNoopLogger())

    assert.deepEqual(diff.added, [])
    assert.deepEqual(diff.switched, [])
    assert.equal(diff.devicesAdded.length, 1)
    assert.equal(diff.devicesAdded[0]?.deviceJid, '1002:21@lid')
    assert.equal(diff.rekeyRequired, false)
})

test('an account on two devices swapping one is not a switch', () => {
    const swapped: WaCallGroupParticipant = {
        jid: '1002@lid',
        devices: ['1002:0@lid', '1002:33@lid']
    }
    const diff = diffGroupParticipants([BRUNO_BOTH], [swapped], createNoopLogger())

    assert.deepEqual(diff.switched, [])
    assert.equal(diff.devicesAdded.length, 1)
    assert.equal(diff.devicesAdded[0]?.deviceJid, '1002:33@lid')
    assert.equal(diff.devicesRemoved.length, 1)
    assert.equal(diff.devicesRemoved[0]?.deviceJid, '1002:21@lid')
    assert.equal(diff.rekeyRequired, false)
})

test('an account listed again with the same device is no change at all', () => {
    const diff = diffGroupParticipants([ANA, BRUNO_PHONE], [BRUNO_PHONE, ANA], createNoopLogger())

    assert.deepEqual(diff.added, [])
    assert.deepEqual(diff.removed, [])
    assert.deepEqual(diff.switched, [])
    assert.deepEqual(diff.devicesAdded, [])
    assert.deepEqual(diff.devicesRemoved, [])
    assert.equal(diff.rekeyRequired, false)
})

/**
 * The contrast that decides the whole model, and it needs both halves: without the second,
 * a reconciler that removed on every update would pass the first, and without the first, one
 * that never removed on absence would pass the second.
 */
test('a roster that omits a participant removes it, and re-keys', () => {
    const composition = createGroupComposition([ANA, BRUNO_PHONE, CLARA], 5)
    const outcome = applyGroupUpdate(
        composition,
        {
            transactionId: 6,
            // A whole roster, and BRUNO is simply not in it. Nothing says he left; the list is
            // the server's whole picture of the call, and he is not in the picture.
            participants: [ANA, CLARA]
        },
        createNoopLogger()
    )

    assert.equal(outcome.applied, true)
    if (!outcome.applied) return

    assert.deepEqual(outcome.diff.removed, [
        { jid: '1002@lid', participant: BRUNO_PHONE, cause: WA_GROUP_REMOVAL_CAUSE.Absent }
    ])
    assert.deepEqual(outcome.diff.added, [])
    assert.deepEqual(outcome.composition.participants, [ANA, CLARA])
    assert.equal(outcome.composition.lastTransactionId, 6)
    // A participant is off the call, so the key it held has to go out of the call with it.
    assert.equal(outcome.diff.rekeyRequired, true)
    assert.equal(outcome.diff.rekeyReason, WA_GROUP_REKEY_REASON.ParticipantRemoved)
})

test('an update with no group_info removes nobody, and does not move the counter', () => {
    const composition = createGroupComposition([ANA, BRUNO_PHONE, CLARA], 5)
    // A `media_type` change, say. It carried no `<group_info>`, so it is not a roster of one
    // participant - it is silence about all of them.
    const outcome = applyGroupUpdate(composition, { transactionId: 6 }, createNoopLogger())

    assert.equal(outcome.applied, false)
    if (outcome.applied) return

    assert.equal(outcome.discardReason, 'no_roster')
    assert.equal(outcome.transactionId, 6)

    // The counter stays where it was: re-reading a roster is idempotent, while dropping one
    // as stale would leave this client holding a call the server has moved on from.
    assert.equal(composition.lastTransactionId, 5)
    const later = applyGroupUpdate(
        composition,
        { transactionId: 6, participants: [ANA, CLARA] },
        createNoopLogger()
    )
    assert.equal(later.applied, true)
})

test('a roster replaces the list, which is how a divergence is resolved', () => {
    const composition = createGroupComposition([ANA, BRUNO_PHONE, CLARA], 1)
    const outcome = applyGroupUpdate(
        composition,
        {
            transactionId: 2,
            participants: [ANA, BRUNO_DESKTOP, CLARA]
        },
        createNoopLogger()
    )

    assert.equal(outcome.applied, true)
    if (!outcome.applied) return

    assert.equal(outcome.diff.switched.length, 1)
    assert.deepEqual(outcome.diff.removed, [])
    assert.deepEqual(outcome.composition.participants, [ANA, BRUNO_DESKTOP, CLARA])
})

test('an update whose transaction id went backwards is discarded', () => {
    const composition = createGroupComposition([ANA, BRUNO_PHONE], 7)
    const update = {
        transactionId: 6,
        participants: [ANA]
    } as const

    assert.equal(isStaleGroupUpdate(composition, update), true)

    const outcome = applyGroupUpdate(composition, update, createNoopLogger())
    assert.equal(outcome.applied, false)
    if (outcome.applied) return

    assert.equal(outcome.discardReason, 'stale')
    assert.equal(outcome.transactionId, 6)
    assert.equal(outcome.lastTransactionId, 7)
})

test('an update repeating the transaction id already applied is discarded', () => {
    const composition = createGroupComposition([ANA, BRUNO_PHONE], 7)
    const outcome = applyGroupUpdate(
        composition,
        {
            transactionId: 7,
            participants: [ANA, BRUNO_PHONE, CLARA]
        },
        createNoopLogger()
    )

    assert.equal(outcome.applied, false)
})

test('successive updates run against the one counter', () => {
    const composition = createGroupComposition([ANA], 1)
    const first = applyGroupUpdate(
        composition,
        {
            transactionId: 2,
            participants: [ANA, CLARA]
        },
        createNoopLogger()
    )

    assert.equal(first.applied, true)
    if (!first.applied) return
    assert.equal(first.composition.lastTransactionId, 2)

    // The next one carries the tid already applied, so it is late whatever it says.
    const repeat = applyGroupUpdate(
        first.composition,
        {
            transactionId: 2,
            participants: [ANA]
        },
        createNoopLogger()
    )

    assert.equal(repeat.applied, false)
})

test('the first update applies whatever its transaction id', () => {
    const composition = createGroupComposition([ANA])
    const update = {
        transactionId: 41,
        participants: [ANA, CLARA]
    } as const

    assert.equal(isStaleGroupUpdate(composition, update), false)

    const outcome = applyGroupUpdate(composition, update, createNoopLogger())
    assert.equal(outcome.applied, true)
    if (!outcome.applied) return

    assert.deepEqual(outcome.diff.added, [CLARA])
    assert.equal(outcome.composition.lastTransactionId, 41)
})

test('the rekey flag of an update re-keys a composition that did not move', () => {
    const composition = createGroupComposition([ANA, BRUNO_PHONE], 2)
    const outcome = applyGroupUpdate(
        composition,
        {
            transactionId: 3,
            participants: [ANA, BRUNO_PHONE],
            rekey: true
        },
        createNoopLogger()
    )

    assert.equal(outcome.applied, true)
    if (!outcome.applied) return

    assert.equal(outcome.diff.rekeyRequired, true)
    assert.equal(outcome.diff.rekeyReason, WA_GROUP_REKEY_REASON.UpdateFlag)
})

test('an update without the rekey flag still re-keys on a participant leaving', () => {
    const composition = createGroupComposition([ANA, BRUNO_PHONE], 2)
    const outcome = applyGroupUpdate(
        composition,
        {
            transactionId: 3,
            participants: [ANA],
            rekey: false
        },
        createNoopLogger()
    )

    assert.equal(outcome.applied, true)
    if (!outcome.applied) return

    assert.equal(outcome.diff.rekeyRequired, true)
    assert.equal(outcome.diff.rekeyReason, WA_GROUP_REKEY_REASON.ParticipantRemoved)
})

test('a nacked participant carries no device and owns no stream', () => {
    // Nacked here is the wire shape of an account that brought no device, not the in-band
    // flag that takes one off the call.
    const deviceless: WaCallGroupParticipant = { jid: '1003@lid', devices: [] }
    const diff = diffGroupParticipants([ANA], [ANA, deviceless], createNoopLogger())

    assert.deepEqual(diff.added, [deviceless])
    assert.deepEqual(diff.devicesAdded, [])
})
