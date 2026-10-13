import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CallDirection, CallMediaType, CallState, EndCallReason } from '../../types.js'
import {
    CallInfo,
    decideJoinableTerminate,
    InvalidTransition,
    WA_GROUP_CALL_ENDED_REASON,
    WA_TERMINATE_DECISION
} from '../call-state.js'

const ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

test('newOutgoing starts initiating with creator and audio defaults', () => {
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Audio)
    assert.equal(call.stateData.state, CallState.Initiating)
    assert.equal(call.direction, CallDirection.Outgoing)
    assert.equal(call.isInitiator, true)
    assert.equal(call.callCreator, 'me@lid')
    assert.equal(call.stateData.videoOff, true)
})

test('newIncoming starts incoming-ringing and can accept/reject', () => {
    const call = CallInfo.newIncoming(
        ID,
        'peer@lid',
        'peer@lid',
        '5511@s.whatsapp.net',
        CallMediaType.Video
    )
    assert.equal(call.stateData.state, CallState.IncomingRinging)
    assert.equal(call.direction, CallDirection.Incoming)
    assert.equal(call.canAccept, true)
    assert.equal(call.canReject, true)
    assert.equal(call.stateData.videoOff, false)
})

test('outgoing happy path: initiating -> ringing -> connecting -> active -> ended', () => {
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Audio)

    call.applyTransition({ type: 'offer_sent' })
    assert.equal(call.stateData.state, CallState.Ringing)
    assert.equal(call.isRinging, true)

    call.applyTransition({ type: 'remote_accepted' })
    assert.equal(call.stateData.state, CallState.Connecting)
    assert.ok(call.stateData.acceptedAt instanceof Date)

    call.applyTransition({ type: 'media_connected' })
    assert.equal(call.stateData.state, CallState.Active)
    assert.equal(call.isActive, true)
    assert.ok(call.stateData.connectedAt instanceof Date)

    call.applyTransition({ type: 'terminated', reason: EndCallReason.UserEnded })
    assert.equal(call.stateData.state, CallState.Ended)
    assert.equal(call.isEnded, true)
    assert.equal(call.stateData.endReason, EndCallReason.UserEnded)
    assert.equal(typeof call.stateData.durationSecs, 'number')
})

test('incoming accept path: offer_received -> local_accepted', () => {
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Audio)
    call.applyTransition({ type: 'offer_received', silenced: true })
    assert.equal(call.stateData.state, CallState.IncomingRinging)
    assert.equal(call.stateData.silenced, true)

    call.applyTransition({ type: 'local_accepted' })
    assert.equal(call.stateData.state, CallState.Connecting)
})

test('mute and video toggles apply only in the active state', () => {
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Video)
    call.applyTransition({ type: 'offer_sent' })
    call.applyTransition({ type: 'remote_accepted' })
    call.applyTransition({ type: 'media_connected' })

    call.applyTransition({ type: 'audio_mute_changed', muted: true })
    assert.equal(call.stateData.audioMuted, true)

    call.applyTransition({ type: 'video_state_changed', off: true })
    assert.equal(call.stateData.videoOff, true)
})

test('the hand starts down and only moves while the call is active', () => {
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Audio)
    assert.equal(call.stateData.handRaised, false)
    assert.equal(call.raisedHands.size, 0)

    call.applyTransition({ type: 'offer_sent' })
    assert.throws(
        () => call.applyTransition({ type: 'hand_raise_changed', raised: true }),
        InvalidTransition
    )

    call.applyTransition({ type: 'remote_accepted' })
    call.applyTransition({ type: 'media_connected' })

    call.applyTransition({ type: 'hand_raise_changed', raised: true })
    assert.equal(call.stateData.handRaised, true)

    call.applyTransition({ type: 'hand_raise_changed', raised: false })
    assert.equal(call.stateData.handRaised, false)
})

test('the screen share starts off and only moves while the call is active', () => {
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Video)
    assert.equal(call.stateData.screenSharing, false)

    call.applyTransition({ type: 'offer_sent' })
    assert.throws(
        () => call.applyTransition({ type: 'screen_share_changed', sharing: true }),
        InvalidTransition
    )

    call.applyTransition({ type: 'remote_accepted' })
    call.applyTransition({ type: 'media_connected' })

    call.applyTransition({ type: 'screen_share_changed', sharing: true })
    assert.equal(call.stateData.screenSharing, true)

    call.applyTransition({ type: 'screen_share_changed', sharing: false })
    assert.equal(call.stateData.screenSharing, false)
})

test('hold and resume cycle through on-hold', () => {
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Audio)
    call.applyTransition({ type: 'offer_sent' })
    call.applyTransition({ type: 'remote_accepted' })
    call.applyTransition({ type: 'media_connected' })

    call.applyTransition({ type: 'hold' })
    assert.equal(call.stateData.state, CallState.OnHold)
    call.applyTransition({ type: 'resume' })
    assert.equal(call.stateData.state, CallState.Active)
})

test('illegal transitions throw InvalidTransition', () => {
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Audio)
    call.applyTransition({ type: 'offer_sent' })

    assert.throws(() => call.applyTransition({ type: 'offer_sent' }), InvalidTransition)
    assert.throws(
        () => call.applyTransition({ type: 'audio_mute_changed', muted: true }),
        InvalidTransition
    )
})

/**
 * The in-call affordances are live state, not a record of the call: a hand still up or a
 * share still on after the call ended reads as somebody currently holding one.
 */
test('terminated puts every hand down and stops the share', () => {
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Video)
    call.applyTransition({ type: 'offer_sent' })
    call.applyTransition({ type: 'remote_accepted' })
    call.applyTransition({ type: 'media_connected' })
    call.applyTransition({ type: 'hand_raise_changed', raised: true })
    call.applyTransition({ type: 'screen_share_changed', sharing: true })
    call.raisedHands.add('peer:1@lid')

    call.applyTransition({ type: 'terminated', reason: EndCallReason.UserEnded })

    assert.equal(call.stateData.handRaised, false)
    assert.equal(call.stateData.screenSharing, false)
    assert.equal(call.raisedHands.size, 0)
})

test('terminated cannot fire twice', () => {
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Audio)
    call.applyTransition({ type: 'terminated', reason: EndCallReason.Failed })
    assert.equal(call.stateData.state, CallState.Ended)
    assert.throws(
        () => call.applyTransition({ type: 'terminated', reason: EndCallReason.Failed }),
        InvalidTransition
    )
})

/** An incoming joinable call, still ringing, with no group jid unless one is given. */
function joinableIncoming(groupJid: string | null = '120363000000000000@g.us'): CallInfo {
    const call = CallInfo.newIncoming(ID, 'peer@lid', 'peer@lid', undefined, CallMediaType.Audio)
    call.joinable = true
    call.groupJid = groupJid ?? undefined
    return call
}

/** The same call after we accepted it, which is where the join is in flight. */
function acceptSent(groupJid?: string | null): CallInfo {
    const call = joinableIncoming(groupJid)
    call.applyTransition({ type: 'local_accepted' })
    return call
}

test('a terminate on a call nobody may join always ends it', () => {
    const ringing = CallInfo.newIncoming(ID, 'peer@lid', 'peer@lid', undefined, CallMediaType.Audio)
    assert.equal(decideJoinableTerminate(ringing, undefined), WA_TERMINATE_DECISION.End)

    const accepted = CallInfo.newIncoming(
        ID,
        'peer@lid',
        'peer@lid',
        undefined,
        CallMediaType.Audio
    )
    accepted.applyTransition({ type: 'local_accepted' })
    assert.equal(decideJoinableTerminate(accepted, undefined), WA_TERMINATE_DECISION.End)
})

test('the joinable flag alone decides the same terminate in the same state', () => {
    const nonJoinable = acceptSent()
    nonJoinable.joinable = false

    assert.equal(decideJoinableTerminate(nonJoinable, undefined), WA_TERMINATE_DECISION.End)
    assert.equal(decideJoinableTerminate(acceptSent(), undefined), WA_TERMINATE_DECISION.Ignore)
})

test('a joinable terminate is ignored while our accept is in flight, reason or not', () => {
    assert.equal(decideJoinableTerminate(acceptSent(), undefined), WA_TERMINATE_DECISION.Ignore)
    assert.equal(decideJoinableTerminate(acceptSent(), 'hangup'), WA_TERMINATE_DECISION.Ignore)

    // The state wins over a handover reason, on a joinable call only.
    for (const reason of ['accepted_elsewhere', 'rejected_elsewhere', 'device_switch']) {
        assert.equal(decideJoinableTerminate(acceptSent(), reason), WA_TERMINATE_DECISION.Ignore)
    }
})

/** Only the incoming side sends an accept; an outgoing connecting call honours a terminate. */
test('the outgoing side of connecting is not an accept in flight', () => {
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Audio)
    call.joinable = true
    call.groupJid = '120363000000000000@g.us'
    call.applyTransition({ type: 'offer_sent' })
    call.applyTransition({ type: 'remote_accepted' })

    assert.equal(call.isGroupCall, true)
    assert.equal(decideJoinableTerminate(call, 'accepted_elsewhere'), WA_TERMINATE_DECISION.End)
    // The incoming side in the same state keeps the call: its accept is in flight.
    assert.equal(
        decideJoinableTerminate(acceptSent(), 'accepted_elsewhere'),
        WA_TERMINATE_DECISION.Ignore
    )
})

test('the server ending an established joinable call ends it, held or not', () => {
    const active = acceptSent()
    active.applyTransition({ type: 'media_connected' })
    assert.equal(
        decideJoinableTerminate(active, WA_GROUP_CALL_ENDED_REASON),
        WA_TERMINATE_DECISION.End
    )

    const held = acceptSent()
    held.applyTransition({ type: 'media_connected' })
    held.applyTransition({ type: 'hold' })
    assert.equal(
        decideJoinableTerminate(held, WA_GROUP_CALL_ENDED_REASON),
        WA_TERMINATE_DECISION.End
    )
})

test('a joinable terminate that hands the call to another of our devices ends it', () => {
    for (const reason of ['accepted_elsewhere', 'rejected_elsewhere', 'device_switch']) {
        assert.equal(decideJoinableTerminate(joinableIncoming(), reason), WA_TERMINATE_DECISION.End)
    }
})

test('any other joinable terminate outside an established call is ignored', () => {
    assert.equal(
        decideJoinableTerminate(joinableIncoming(), undefined),
        WA_TERMINATE_DECISION.IgnoreSilently
    )
    assert.equal(
        decideJoinableTerminate(joinableIncoming(), 'hangup'),
        WA_TERMINATE_DECISION.Ignore
    )

    const outgoing = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Audio)
    outgoing.joinable = true
    outgoing.groupJid = '120363000000000000@g.us'
    outgoing.applyTransition({ type: 'offer_sent' })
    assert.equal(decideJoinableTerminate(outgoing, undefined), WA_TERMINATE_DECISION.Ignore)
})

test('a bare joinable terminate on the ring of a group call is ignored in silence', () => {
    const group = joinableIncoming('120363000000000000@g.us')
    assert.equal(decideJoinableTerminate(group, undefined), WA_TERMINATE_DECISION.IgnoreSilently)

    // An empty reason is still a bare terminate.
    assert.equal(decideJoinableTerminate(group, ''), WA_TERMINATE_DECISION.IgnoreSilently)
    // A reason takes it out of that path: it is no longer a bare terminate.
    assert.equal(decideJoinableTerminate(group, 'hangup'), WA_TERMINATE_DECISION.Ignore)
    // A joinable 1:1 call, as WA Web offers every one, ends like any 1:1 call.
    assert.equal(
        decideJoinableTerminate(joinableIncoming(null), undefined),
        WA_TERMINATE_DECISION.End
    )
    // Past the ring it is reported too, even on a group call.
    assert.equal(
        decideJoinableTerminate(acceptSent('120363000000000000@g.us'), undefined),
        WA_TERMINATE_DECISION.Ignore
    )
})

test('a terminate on an already ended joinable call ends it, leaving nothing behind', () => {
    const call = joinableIncoming('120363000000000000@g.us')
    call.applyTransition({ type: 'terminated', reason: EndCallReason.UserEnded })

    assert.equal(decideJoinableTerminate(call, undefined), WA_TERMINATE_DECISION.End)
})

const GROUP_JID = '120363000000000000@g.us'

function activeGroupCall(): CallInfo {
    const call = acceptSent(GROUP_JID)
    call.applyTransition({ type: 'media_connected' })
    return call
}

test('a terminate with a reason on an established group call takes only the sender off', () => {
    assert.equal(
        decideJoinableTerminate(activeGroupCall(), 'terminated'),
        WA_TERMINATE_DECISION.RemoveParticipant
    )
    assert.equal(
        decideJoinableTerminate(activeGroupCall(), 'user_invisible'),
        WA_TERMINATE_DECISION.RemoveParticipant
    )

    const held = activeGroupCall()
    held.applyTransition({ type: 'hold' })
    assert.equal(
        decideJoinableTerminate(held, 'terminated'),
        WA_TERMINATE_DECISION.RemoveParticipant
    )
})

test('a bare terminate on an established group call is a participant hanging up', () => {
    assert.equal(
        decideJoinableTerminate(activeGroupCall(), undefined),
        WA_TERMINATE_DECISION.RemoveParticipant
    )
    assert.equal(
        decideJoinableTerminate(activeGroupCall(), ''),
        WA_TERMINATE_DECISION.RemoveParticipant
    )
})

test('group_call_ended or a handover ends an established group call', () => {
    assert.equal(
        decideJoinableTerminate(activeGroupCall(), WA_GROUP_CALL_ENDED_REASON),
        WA_TERMINATE_DECISION.End
    )
    assert.equal(
        decideJoinableTerminate(activeGroupCall(), 'device_switch'),
        WA_TERMINATE_DECISION.End
    )
})

test('a 1:1 call grown into a group carries a roster and no group jid, and loses one participant', () => {
    const call = acceptSent(null)
    call.groupComposition = { participants: [], lastTransactionId: null }
    call.applyTransition({ type: 'media_connected' })

    assert.equal(call.isGroupCall, true)
    assert.equal(decideJoinableTerminate(call, undefined), WA_TERMINATE_DECISION.RemoveParticipant)
})

test('a joinable 1:1 call keeps every 1:1 rule: any terminate ends it, accept in flight or not', () => {
    for (const call of [joinableIncoming(null), acceptSent(null)]) {
        assert.equal(call.isGroupCall, false)
        for (const reason of [undefined, 'accepted_elsewhere', 'hangup']) {
            assert.equal(decideJoinableTerminate(call, reason), WA_TERMINATE_DECISION.End, reason)
        }
    }
})

test('a call is a group call when it names a group or carries a roster, not when only joinable', () => {
    const plain = CallInfo.newIncoming(ID, 'peer@lid', 'peer@lid', undefined, CallMediaType.Audio)
    assert.equal(plain.isGroupCall, false)

    const named = CallInfo.newIncoming(ID, 'peer@lid', 'peer@lid', undefined, CallMediaType.Audio)
    named.groupJid = '120363000000000000@g.us'
    assert.equal(named.isGroupCall, true)

    const rostered = CallInfo.newIncoming(
        ID,
        'peer@lid',
        'peer@lid',
        undefined,
        CallMediaType.Audio
    )
    rostered.groupComposition = { participants: [], lastTransactionId: null }
    assert.equal(rostered.isGroupCall, true)

    assert.equal(joinableIncoming(null).isGroupCall, false)
})

test('a call starts neither joinable nor with a composition', () => {
    const call = CallInfo.newIncoming(ID, 'peer@lid', 'peer@lid', undefined, CallMediaType.Audio)

    assert.equal(call.joinable, false)
    assert.equal(call.groupComposition, undefined)
    assert.equal(call.groupJid, undefined)
})

test('the server ending a group call ends it in any state, the ring included', () => {
    const ringing = joinableIncoming(GROUP_JID)
    assert.equal(
        decideJoinableTerminate(ringing, WA_GROUP_CALL_ENDED_REASON),
        WA_TERMINATE_DECISION.End
    )
    assert.equal(
        decideJoinableTerminate(acceptSent(GROUP_JID), WA_GROUP_CALL_ENDED_REASON),
        WA_TERMINATE_DECISION.End
    )
})

test('the manager can mark a call as a group call', () => {
    const call = CallInfo.newIncoming(ID, 'peer@lid', 'peer@lid', undefined, CallMediaType.Audio)
    call.isGroupCall = true
    assert.equal(call.isGroupCall, true)
})
