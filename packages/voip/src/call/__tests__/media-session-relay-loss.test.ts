import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'

import { CallMediaType, EndCallReason, type WaVoipDeps } from '../../types.js'
import { CallInfo } from '../call-state.js'
import { WaCallMediaSession } from '../WaCallMediaSession.js'

import { createSessionDelegate } from './_helpers.js'

const ID = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

interface EndRequest {
    readonly callId: string
    readonly reason: EndCallReason
}

function createSession(): { session: WaCallMediaSession; ended: EndRequest[] } {
    const ended: EndRequest[] = []
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Audio)
    const session = new WaCallMediaSession({
        deps: {} as unknown as WaVoipDeps,
        logger: createNoopLogger(),
        info: call,
        delegate: createSessionDelegate({
            endCall: (endedCall, reason) => {
                ended.push({ callId: endedCall.callId, reason })
            }
        })
    })

    return { session, ended }
}

/** Drives the relay's own announcement, without a socket under it. */
function loseRelay(session: WaCallMediaSession, reason: string): void {
    ;(
        session as unknown as {
            sctpRelay: { emit: (event: string, payload: { reason: string }) => boolean }
        }
    ).sctpRelay.emit('relay_lost', { reason })
}

/**
 * Without this the call outlives its media: live to the manager, mute on the
 * wire, and invisible to the library's consumer, who is told nothing at all.
 * The reason has to be its own, because a hangup at either end reports
 * `user_ended` and this is neither.
 */
test('a call that loses its media path is ended, under a reason of its own', () => {
    const { session, ended } = createSession()

    loseRelay(session, 'raw_udp_no_return_path')

    assert.deepEqual(ended, [{ callId: ID, reason: EndCallReason.RelayLost }])
})

/** A hangup tears the relay down on its way out; that must not end it twice. */
test('a call that has already ended is not ended again', () => {
    const { session, ended } = createSession()
    session.info.applyTransition({ type: 'terminated', reason: EndCallReason.UserEnded })

    loseRelay(session, 'closed')

    assert.deepEqual(ended, [])
})
