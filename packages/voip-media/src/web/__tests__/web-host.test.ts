import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import { webMediaHost } from '../index.js'

function installPeerConnection(t: TestContext, constructor: unknown): void {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'RTCPeerConnection')
    Object.defineProperty(globalThis, 'RTCPeerConnection', {
        value: constructor,
        configurable: true,
        writable: true
    })
    t.after(() => {
        if (original) Object.defineProperty(globalThis, 'RTCPeerConnection', original)
        else Reflect.deleteProperty(globalThis, 'RTCPeerConnection')
    })
}

test('the browser host builds the peer connection on the configuration given', async (t) => {
    class FakePeerConnection {
        constructor(readonly configuration: RTCConfiguration) {}
    }
    installPeerConnection(t, FakePeerConnection)

    const pc = await webMediaHost.createPeerConnection({ iceServers: [] })

    assert.ok(pc instanceof FakePeerConnection)
    assert.deepEqual(pc.configuration, { iceServers: [] })
})

test('a configuration the browser refuses rejects the promise instead of throwing', async (t) => {
    installPeerConnection(
        t,
        class {
            constructor() {
                throw new SyntaxError('invalid ICE server URL')
            }
        }
    )

    let created: Promise<RTCPeerConnection> | undefined
    assert.doesNotThrow(() => {
        created = webMediaHost.createPeerConnection({ iceServers: [{ urls: 'nope' }] })
    })
    await assert.rejects(created!, /invalid ICE server URL/)
})
