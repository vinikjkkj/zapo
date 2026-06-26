import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CallDirection, CallMediaType, CallState, EndCallReason } from '../../types.js'
import { CallInfo, InvalidTransition } from '../call-state.js'

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

test('terminated cannot fire twice', () => {
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Audio)
    call.applyTransition({ type: 'terminated', reason: EndCallReason.Failed })
    assert.equal(call.stateData.state, CallState.Ended)
    assert.throws(
        () => call.applyTransition({ type: 'terminated', reason: EndCallReason.Failed }),
        InvalidTransition
    )
})
