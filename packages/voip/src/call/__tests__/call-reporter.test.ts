import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'

import { CallMediaType } from '../../types.js'
import { CallInfo } from '../call-state.js'
import { WaCallReporter } from '../WaCallReporter.js'

test('a call the app was never told about stays silent, yet its end is remembered', () => {
    const emitter = new EventEmitter()
    const ended: string[] = []
    const reporter = new WaCallReporter({
        emitter,
        endedCalls: { rememberEnded: (callId) => ended.push(callId) },
        participantAudio: false
    })
    const events: string[] = []
    emitter.emit = (event: string | symbol): boolean => {
        events.push(String(event))
        return true
    }

    const call = CallInfo.newIncoming('C', 'p@lid', 'p@lid', undefined, CallMediaType.Audio)
    reporter.emitState(call)
    reporter.emitEnded(call)
    assert.deepEqual(events, [])
    assert.deepEqual(ended, ['C'])

    reporter.announceIncoming(call)
    reporter.emitState(call)
    assert.deepEqual(events, ['call_incoming', 'call_state'])
})

test('the session delegate asks for inbound audio only while somebody listens', () => {
    const emitter = new EventEmitter()
    const delegate = new WaCallReporter({
        emitter,
        endedCalls: { rememberEnded: () => {} },
        participantAudio: false
    }).sessionDelegate(() => {})

    assert.equal(delegate.wantsInboundAudio?.(), false)
    emitter.on('call_inbound_audio', () => {})
    assert.equal(delegate.wantsInboundAudio?.(), true)
    assert.equal(delegate.emitParticipantAudio, undefined)
})
