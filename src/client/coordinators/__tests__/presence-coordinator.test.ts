import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaAuthCredentials } from '@auth/types'
import { createPresenceCoordinator } from '@client/coordinators/WaPresenceCoordinator'
import type { BinaryNode } from '@transport/types'

function makeHarness(credentials: Partial<WaAuthCredentials> | null = null) {
    const sent: BinaryNode[] = []
    const coordinator = createPresenceCoordinator({
        sendNode: async (node) => {
            sent.push(node)
        },
        getCurrentCredentials: () => (credentials as WaAuthCredentials | null) ?? null
    })
    return { coordinator, sent }
}

test('presence.send emits a presence node with the current display name', async () => {
    const { coordinator, sent } = makeHarness({ meDisplayName: 'Vinicius' })
    await coordinator.send('available')
    assert.deepEqual(sent, [
        {
            tag: 'presence',
            attrs: { type: 'available', name: 'Vinicius' }
        }
    ])
})

test('presence.send omits name when credentials are absent', async () => {
    const { coordinator, sent } = makeHarness(null)
    await coordinator.send('unavailable')
    assert.equal(sent.length, 1)
    assert.equal(sent[0].tag, 'presence')
    assert.equal(sent[0].attrs.type, 'unavailable')
    assert.equal(sent[0].attrs.name, undefined)
})

test('presence.sendChatstate forwards jid and chatstate options to the builder', async () => {
    const { coordinator, sent } = makeHarness()
    await coordinator.sendChatstate('5511999999999@s.whatsapp.net', { state: 'composing' })
    assert.equal(sent.length, 1)
    assert.equal(sent[0].tag, 'chatstate')
    assert.equal(sent[0].attrs.to, '5511999999999@s.whatsapp.net')
})

test('presence.subscribe sends a presence subscribe node for the jid', async () => {
    const { coordinator, sent } = makeHarness()
    await coordinator.subscribe('5511999999999@s.whatsapp.net')
    assert.equal(sent.length, 1)
    assert.equal(sent[0].tag, 'presence')
    assert.equal(sent[0].attrs.type, 'subscribe')
    assert.equal(sent[0].attrs.to, '5511999999999@s.whatsapp.net')
})
