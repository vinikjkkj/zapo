import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import type { WaVoipDeps, WaVoipStores } from '../../types.js'
import { WaCallManager } from '../WaCallManager.js'

const CALLER_DEVICE = '50062877036657:87@lid'

function createManager(sent: BinaryNode[]): WaCallManager {
    const deps = {
        isMobilePrimary: () => false,
        authClient: {
            getCurrentCredentials: () => ({ meJid: '1111111111:3@lid', meLid: '1111111111:3@lid' })
        },
        lowLevelCoordinator: {
            sendNode: async (node: BinaryNode) => {
                sent.push(node)
            }
        },
        signalProtocol: { decryptMessage: async () => new Uint8Array([1, 2, 3]) },
        signalDeviceSync: {
            syncDeviceList: async () => [{ deviceJids: [CALLER_DEVICE] }],
            queryLidsByPhoneJids: async () => []
        },
        messageDispatch: { syncSignalSession: async () => undefined },
        sessionResolver: { ensureSessionsBatch: async () => [] }
    } as unknown as WaVoipDeps
    const stores = { privacyToken: { getByJid: async () => undefined } } as unknown as WaVoipStores
    return new WaCallManager({ deps, stores, mediaMode: 'remote' })
}

/** A 1:1 offer as WA Web sends every one: `joinable='1'`, no `group-jid`, no `<group_info>`. */
function oneToOneOffer(callId: string): BinaryNode {
    return {
        tag: 'call',
        attrs: { from: CALLER_DEVICE, id: 'OFFER', platform: 'web' },
        content: [
            {
                tag: 'offer',
                attrs: { 'call-id': callId, 'call-creator': CALLER_DEVICE, joinable: '1' },
                content: [
                    { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
                    { tag: 'audio', attrs: { enc: 'opus', rate: '8000' } },
                    { tag: 'net', attrs: { medium: '3' } }
                ]
            }
        ]
    }
}

test('a joinable WA Web offer with no roster and no group jid stays a 1:1 call', async () => {
    const sent: BinaryNode[] = []
    const manager = createManager(sent)

    await manager.handleCallOffer(oneToOneOffer('P1'), CALLER_DEVICE)

    const call = manager.getCall('P1')
    assert.ok(call)
    assert.equal(call.joinable, true)
    assert.equal(call.isGroupCall, false)
    const preaccepts = sent.filter(
        (node) =>
            Array.isArray(node.content) && (node.content as BinaryNode[])[0]?.tag === 'preaccept'
    )
    assert.deepEqual(
        preaccepts.map((node) => node.attrs.to),
        [CALLER_DEVICE],
        'the 1:1 preaccept goes to the caller device, not to the call'
    )

    // The caller hanging up while we ring ends the call, as on any 1:1 call.
    await manager.handleCallTerminate(
        {
            tag: 'call',
            attrs: { from: CALLER_DEVICE, id: 'TERM' },
            content: [
                { tag: 'terminate', attrs: { 'call-id': 'P1', 'call-creator': CALLER_DEVICE } }
            ]
        },
        CALLER_DEVICE
    )
    assert.equal(manager.getCall('P1'), null)
    manager.destroy()
})
