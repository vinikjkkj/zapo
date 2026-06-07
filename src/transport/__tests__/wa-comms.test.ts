import assert from 'node:assert/strict'
import test from 'node:test'

import { createNoopLogger } from '@infra/log/types'
import type { RawWebSocketConstructor } from '@transport/types'
import { WaComms } from '@transport/WaComms'

const NOOP_SOCKET_CTOR = class {
    public binaryType = 'arraybuffer'
    public readyState = 0
    public onopen: unknown = null
    public onclose: unknown = null
    public onerror: unknown = null
    public onmessage: unknown = null
    public close(): void {
        return
    }
    public send(): void {
        return
    }
} as unknown as RawWebSocketConstructor

function createComms(): WaComms {
    return new WaComms(
        {
            urls: ['wss://example.invalid/ws'],
            rawWebSocketConstructor: NOOP_SOCKET_CTOR,
            noise: {
                clientStaticKeyPair: {
                    pubKey: new Uint8Array(32),
                    privKey: new Uint8Array(32)
                },
                isRegistered: false
            }
        },
        createNoopLogger()
    )
}

test('closeSocketAndResume does not revive a comms that was never started', async () => {
    const comms = createComms()
    assert.equal(comms.getCommsState().started, false)

    await comms.closeSocketAndResume()

    assert.equal(comms.getCommsState().started, false)
    assert.equal(comms.getCommsState().connected, false)
})

test('closeSocketAndResume does not revive a comms after stopComms', async () => {
    const comms = createComms()
    await comms.stopComms()

    await comms.closeSocketAndResume()

    assert.equal(comms.getCommsState().started, false)
    assert.equal(comms.getCommsState().connected, false)
})
