import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'

import { CallMediaType } from '../../types.js'
import { CallInfo } from '../call-state.js'
import { WaJoinableCalls } from '../WaJoinableCalls.js'

function joinableGroupCall(callId: string): CallInfo {
    const info = CallInfo.newIncoming(callId, 'p@lid', 'p@lid', undefined, CallMediaType.Audio)
    info.groupJid = '120363000000000000@g.us'
    info.joinable = true
    return info
}

test('only a joinable group call is remembered, and forget reports whether it was', () => {
    const calls = new WaJoinableCalls(createNoopLogger())
    const oneToOne = CallInfo.newIncoming('O', 'p@lid', 'p@lid', undefined, CallMediaType.Audio)
    calls.remember(oneToOne, 'declined')
    assert.equal(calls.get('O'), undefined)

    calls.remember(joinableGroupCall('G'), 'left')
    assert.equal(calls.get('G')?.cause, 'left')
    assert.equal(calls.forget('G'), true)
    assert.equal(calls.forget('G'), false)
})

test('a call taken for a join that failed is restored as it was', () => {
    const calls = new WaJoinableCalls(createNoopLogger())
    calls.remember(joinableGroupCall('G'), 'rung_out')
    const taken = calls.get('G')
    assert.ok(taken)
    calls.forget('G')

    calls.restore(taken)
    assert.equal(calls.get('G'), taken)
    calls.clear()
    assert.equal(calls.get('G'), undefined)
})
