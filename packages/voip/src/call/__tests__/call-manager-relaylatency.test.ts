import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { routeCallStanza } from '../../signaling/bridge.js'
import { WaCallManager } from '../WaCallManager.js'

import {
    buildOfferAckNode,
    buildOfferNode,
    createMockDeps,
    findByInnerTag,
    settle
} from './_call-manager-fixtures.js'

/** What a remote media host reports as each relay first answers one of its legs. */
function answerRelays(manager: WaCallManager, callId: string, names: readonly string[]): void {
    for (const name of names) {
        manager.handleMediaEvent(callId, { type: 'relay_answered', name })
    }
}

test('the relaylatency a caller sends on the preaccept names only the relays it dials', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1, mediaMode: 'remote' })
    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    await manager.handleCallAck(
        buildOfferAckNode(
            callId,
            ['2222222222:0@lid', '1111111111:3@lid'],
            [
                { name: 'tcp1c01', ip: [10, 0, 0, 2], protocol: '1', c2rRtt: 5 },
                { name: 'gru1c01', ip: [10, 0, 0, 1], c2rRtt: 17 }
            ]
        )
    )
    answerRelays(manager, callId, ['tcp1c01', 'gru1c01'])
    const before = sent.length

    await routeCallStanza(manager, deps, {
        tag: 'call',
        attrs: { from: '2222222222:0@lid', id: 'PREACCEPTMSGID' },
        content: [
            { tag: 'preaccept', attrs: { 'call-id': callId, 'call-creator': '1111111111@lid' } }
        ]
    })

    const advertised = findByInnerTag(sent.slice(before), 'relaylatency').flatMap((node) =>
        ((node.content as BinaryNode[])[0].content as BinaryNode[])
            .filter((child) => child.tag === 'te')
            .map((te) => [te.attrs.relay_name, te.attrs.latency, te.content])
    )
    assert.deepEqual(advertised, [
        ['gru1c01', String(0x2000000 + 17), new Uint8Array([10, 0, 0, 1, 0x0d, 0x96])]
    ])
})

function preacceptNode(callId: string, from: string): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: `PREACCEPT${from}` },
        content: [
            { tag: 'preaccept', attrs: { 'call-id': callId, 'call-creator': '1111111111@lid' } }
        ]
    }
}

/** The relay names our `<te>` nodes carried, one entry per node sent. */
function announcedRelayNames(sent: readonly BinaryNode[]): string[] {
    return findByInnerTag(sent, 'relaylatency').flatMap((node) =>
        ((node.content as BinaryNode[])[0].content as BinaryNode[])
            .filter((child) => child.tag === 'te')
            .map((te) => te.attrs.relay_name)
    )
}

test('a caller announces each relay once, however many devices of the peer preaccept', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1, mediaMode: 'remote' })
    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    await manager.handleCallAck(
        buildOfferAckNode(
            callId,
            ['2222222222@lid'],
            [
                { name: 'gru1c01', ip: [10, 0, 0, 1], c2rRtt: 17 },
                { name: 'gig4c02', ip: [10, 0, 0, 2], c2rRtt: 25 }
            ]
        )
    )
    answerRelays(manager, callId, ['gru1c01', 'gig4c02'])
    const before = sent.length

    await routeCallStanza(manager, deps, preacceptNode(callId, '2222222222:0@lid'))
    await routeCallStanza(manager, deps, preacceptNode(callId, '2222222222:5@lid'))

    assert.deepEqual(announcedRelayNames(sent.slice(before)), ['gru1c01', 'gig4c02'])
})

function peerRelaylatencyNode(callId: string, from: string, latency: number): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: `RELAYLATENCY${latency}` },
        content: [
            {
                tag: 'relaylatency',
                attrs: { 'call-id': callId, 'call-creator': from },
                content: [
                    {
                        tag: 'te',
                        attrs: { relay_name: 'gru1c01', latency: String(latency) },
                        content: new Uint8Array([10, 9, 9, 9, 0x0d, 0x96])
                    }
                ]
            }
        ]
    }
}

test('after setup a call sends no relaylatency, however many the peer sends', async () => {
    const relays = [
        { name: 'gru1c01', ip: [10, 0, 0, 1], c2rRtt: 17 },
        { name: 'gig4c02', ip: [10, 0, 0, 2], c2rRtt: 25 }
    ] as const
    const peer = '2222222222:0@lid'
    for (const direction of ['outgoing', 'incoming'] as const) {
        const { deps, stores, sent } = createMockDeps()
        const manager = new WaCallManager({
            deps,
            stores,
            maxConcurrentCalls: 1,
            mediaMode: 'remote'
        })
        let callId = 'CA11CA110000000000000000000000A0'
        if (direction === 'outgoing') {
            callId = await manager.startCall({ peerJid: '2222222222@lid' })
            await manager.handleCallAck(buildOfferAckNode(callId, ['2222222222@lid'], relays))
            answerRelays(manager, callId, ['gru1c01', 'gig4c02'])
            await routeCallStanza(manager, deps, preacceptNode(callId, peer))
        } else {
            const relayNode = (buildOfferAckNode(callId, [], relays).content as BinaryNode[])[0]
            await routeCallStanza(
                manager,
                deps,
                buildOfferNode(callId, peer, undefined, [relayNode])
            )
            answerRelays(manager, callId, ['gru1c01', 'gig4c02'])
            await settle()
        }
        assert.deepEqual(announcedRelayNames(sent), ['gru1c01', 'gig4c02'], direction)
        const afterSetup = sent.length

        for (let i = 0; i < 5; i++) {
            await routeCallStanza(manager, deps, peerRelaylatencyNode(callId, peer, 0x2000000 + i))
        }

        assert.deepEqual(findByInnerTag(sent.slice(afterSetup), 'relaylatency'), [], direction)
    }
})

test('a relay reachable over IPv4 and IPv6 is announced once, by its IPv4 address', async () => {
    const ipv6 = [0x26, 0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0x0d, 0x96]
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1, mediaMode: 'remote' })
    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    await manager.handleCallAck(
        buildOfferAckNode(
            callId,
            ['2222222222@lid'],
            [{ name: 'gru1c01', ip: [10, 0, 0, 1], c2rRtt: 17, ipv6 }]
        )
    )
    answerRelays(manager, callId, ['gru1c01'])
    const before = sent.length

    await routeCallStanza(manager, deps, preacceptNode(callId, '2222222222:0@lid'))

    const te = findByInnerTag(sent.slice(before), 'relaylatency').flatMap((node) =>
        ((node.content as BinaryNode[])[0].content as BinaryNode[]).filter(
            (child) => child.tag === 'te'
        )
    )
    assert.deepEqual(
        te.map((node) => [node.attrs.relay_name, node.content]),
        [['gru1c01', new Uint8Array([10, 0, 0, 1, 0x0d, 0x96])]]
    )
})
