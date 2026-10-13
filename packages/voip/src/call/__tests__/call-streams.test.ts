import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'

import { CallMediaType, type WaVoipDeps } from '../../types.js'
import { CallInfo } from '../call-state.js'
import { WaCallDerivations } from '../group-media-plan.js'
import { WaCallStreams } from '../WaCallStreams.js'

const CALL_ID = '006AFEADB13F4EDFE9D8BA599B10EA96'
const PEER_DEVICE_JID = '50062877036657:76@lid'
const SELF_DEVICE_JID = '184478207058035:1@lid'

function createStreams(): { streams: WaCallStreams; call: CallInfo } {
    const call = CallInfo.newIncoming(
        CALL_ID,
        PEER_DEVICE_JID,
        PEER_DEVICE_JID,
        undefined,
        CallMediaType.Audio
    )
    const deps = {
        authClient: {
            getCurrentCredentials: () => ({ meJid: SELF_DEVICE_JID, meLid: SELF_DEVICE_JID })
        }
    } as unknown as WaVoipDeps
    const streams = new WaCallStreams({
        info: call,
        logger: createNoopLogger(),
        deps,
        derivations: new WaCallDerivations(CALL_ID)
    })
    return { streams, call }
}

/** The accept re-derives the keys the ack already did; that is not a key change. */
test('keys derived again to the same material keep their epoch', () => {
    const { streams, call } = createStreams()
    call.encryptionKey = new Uint8Array(32).fill(7)

    const first = streams.deriveKeys(call.peerJid)
    const again = streams.deriveKeys(call.peerJid)
    call.encryptionKey = new Uint8Array(32).fill(8)
    const changed = streams.deriveKeys(call.peerJid)

    assert.ok(first && again && changed)
    assert.equal(again.epoch, first.epoch)
    assert.equal(changed.epoch, first.epoch + 1)
})
