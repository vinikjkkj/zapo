import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { createNoopLogger } from '../../logger.js'
import { nodeCrypto } from '../../node/crypto.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

/** A plane whose relay is real but never dialled, recording every loss it reports. */
function createPlane(): { plane: WaCallMediaPlane; lost: string[] } {
    const lost: string[] = []
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        onRelayLost: (reason) => {
            lost.push(reason)
        }
    })

    return { plane, lost }
}

/** Drives the relay's own announcement, without a socket under it. */
function loseRelay(plane: WaCallMediaPlane, reason: string): void {
    ;(
        plane as unknown as {
            sctpRelay: { announceLastLegLost: (reason: string) => void }
        }
    ).sctpRelay.announceLastLegLost(reason)
}

/**
 * Without this the call outlives its media: live to the manager, mute on the
 * wire, and invisible to the library's consumer, who is told nothing at all.
 * The reason has to be its own, because a hangup at either end reports
 * `user_ended` and this is neither.
 */
test('a call that loses its media path is reported, on an event of its own', (t) => {
    const { plane, lost } = createPlane()
    t.after(() => plane.stop())

    loseRelay(plane, 'raw_udp_no_return_path')

    assert.deepEqual(lost, ['raw_udp_no_return_path'])
})

/** A hangup tears the relay down on its way out; that must not end it twice. */
test('a plane that has already stopped does not report the loss', () => {
    const { plane, lost } = createPlane()
    plane.stop()

    loseRelay(plane, 'closed')

    assert.deepEqual(lost, [])
})
