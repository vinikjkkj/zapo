import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import { generateSecureSsrc } from '../../crypto/ssrc.js'
import { CallMediaType, type RelayEndpoint, type WaVoipDeps } from '../../types.js'
import { CallInfo } from '../call-state.js'
import { WaCallMediaSession } from '../WaCallMediaSession.js'

import { createSessionDelegate, type RecordingMediaLink, recordMediaLink } from './_helpers.js'

const ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const LATENCY_BASE = 0x2000000

/** An incoming call session whose outgoing stanzas and media plan are captured. */
function createIncomingSession(relayData: CallInfo['relayData']): {
    session: WaCallMediaSession
    sent: BinaryNode[]
    link: RecordingMediaLink
} {
    const call = CallInfo.newIncoming(ID, 'peer@lid', 'peer@lid', undefined, CallMediaType.Audio)
    call.relayData = relayData
    const sent: BinaryNode[] = []
    const { link, createMediaLink } = recordMediaLink()
    const session = new WaCallMediaSession({
        deps: {
            authClient: { getCurrentCredentials: () => ({ meJid: 'me@s.whatsapp.net' }) },
            lowLevelCoordinator: {
                sendNode: async (node: BinaryNode) => {
                    sent.push(node)
                }
            }
        } as unknown as WaVoipDeps,
        logger: createNoopLogger(),
        info: call,
        createMediaLink,
        delegate: createSessionDelegate()
    })
    return { session, sent, link }
}

function relaylatencyNode(entries: Array<{ name: string; latencyMs: number }>): BinaryNode {
    return {
        tag: 'call',
        attrs: { from: 'peer@lid', id: 'STANZA' },
        content: [
            {
                tag: 'relaylatency',
                attrs: { 'call-id': ID, 'call-creator': 'peer@lid' },
                content: entries.map(({ name, latencyMs }) => ({
                    tag: 'te',
                    attrs: { relay_name: name, latency: String(LATENCY_BASE + latencyMs) },
                    content: new Uint8Array([9, 9, 9, 9, 0x0d, 0x96])
                }))
            }
        ]
    }
}

function teNodesOf(node: BinaryNode): BinaryNode[] {
    const inner = (node.content as BinaryNode[])[0]
    return (inner.content as BinaryNode[]).filter((child) => child.tag === 'te')
}

function endpoint(overrides: Partial<RelayEndpoint> = {}): RelayEndpoint {
    return {
        ip: '10.0.0.1',
        port: 3478,
        token: 'TOKEN',
        key: 'RELAYKEY',
        relayId: 0,
        rawToken: new Uint8Array([1, 2, 3]),
        ...overrides
    }
}

test('accepting subscribes to the calling device, not a companion of the peer', async () => {
    // Companions ahead of the caller: neither "first listed" nor "first non-zero" may decide.
    const { session, link } = createIncomingSession({
        endpoints: [],
        participantJids: ['peer:34@lid', 'peer:39@lid', 'peer:0@lid', 'peer@lid']
    })

    await session.acceptCall()

    assert.equal(link.plan.ssrcs?.peerAudio, generateSecureSsrc(ID, 'peer:0@lid'))
})

/** Answering made two clients that both answer bounce the stanza between them forever. */
test('a received relaylatency is only consumed: nothing goes back, however many arrive', async () => {
    const address = new Uint8Array([10, 0, 0, 1, 0x0d, 0x96])
    const { session, sent } = createIncomingSession({
        endpoints: [endpoint({ relayName: 'gru1c01', c2rRtt: 17, addressBytes: address })],
        participantJids: ['peer:0@lid']
    })

    for (let i = 0; i < 5; i++) {
        session.handleCallRelaylatency(
            relaylatencyNode([
                { name: 'frvd4c01', latencyMs: 6 },
                { name: 'gru1c01', latencyMs: 21 + i }
            ]),
            'peer@lid'
        )
    }

    assert.equal(sent.length, 0)
    const { peerRelayLatencies } = session as unknown as {
        peerRelayLatencies: Map<string, number>
    }
    assert.deepEqual(
        [...peerRelayLatencies],
        [
            ['frvd4c01', LATENCY_BASE + 6],
            ['gru1c01', LATENCY_BASE + 25]
        ]
    )
})

test('our own relaylatency goes out once per relay, however often setup asks for it', async () => {
    const address = new Uint8Array([10, 0, 0, 1, 0x0d, 0x96])
    const { session, sent } = createIncomingSession({
        endpoints: [endpoint({ relayName: 'gru1c01', c2rRtt: 17, addressBytes: address })],
        participantJids: ['peer:0@lid']
    })

    await session.sendRelayLatency()
    await session.sendRelayLatency()

    assert.deepEqual(
        sent.flatMap(teNodesOf).map((te) => te.attrs.relay_name),
        ['gru1c01']
    )
})

test('the relaylatency an incoming call sends on its own names only the relays it dials', async () => {
    const address = new Uint8Array([10, 0, 0, 4, 0x0d, 0x96])
    const { session, sent } = createIncomingSession({
        endpoints: [
            endpoint({ ip: '10.0.0.1', relayName: 'tcp1c01', protocol: 1, addressBytes: address }),
            endpoint({
                ip: '10.0.0.2',
                relayName: 'semtoken',
                rawToken: undefined,
                addressBytes: address
            }),
            endpoint({ ip: '10.0.0.3', relayName: 'semendereco' }),
            endpoint({ ip: '10.0.0.4', relayName: 'gru1c01', c2rRtt: 17, addressBytes: address })
        ],
        participantJids: ['peer:0@lid']
    })

    await session.sendRelayLatency()

    assert.deepEqual(
        sent.flatMap(teNodesOf).map((te) => [te.attrs.relay_name, te.attrs.latency, te.content]),
        [['gru1c01', String(LATENCY_BASE + 17), address]]
    )
})

test('incoming relaylatency stops once the call ends between relays', async () => {
    const call = CallInfo.newIncoming(ID, 'peer@lid', 'peer@lid', undefined, CallMediaType.Audio)
    call.relayData = {
        endpoints: [
            endpoint({
                ip: '10.0.0.1',
                relayName: 'gru1c01',
                addressBytes: new Uint8Array([10, 0, 0, 1, 0x0d, 0x96])
            }),
            endpoint({
                ip: '10.0.0.2',
                relayName: 'bsb1c01',
                addressBytes: new Uint8Array([10, 0, 0, 2, 0x0d, 0x96])
            })
        ],
        participantJids: ['peer:0@lid']
    }
    const sent: BinaryNode[] = []
    const session: WaCallMediaSession = new WaCallMediaSession({
        deps: {
            authClient: { getCurrentCredentials: () => ({ meJid: 'me@s.whatsapp.net' }) },
            lowLevelCoordinator: {
                sendNode: async (node: BinaryNode) => {
                    sent.push(node)
                    // The peer hangs up while the first relaylatency is in flight.
                    session.handleCallTerminate()
                }
            }
        } as unknown as WaVoipDeps,
        logger: createNoopLogger(),
        info: call,
        createMediaLink: recordMediaLink().createMediaLink,
        delegate: createSessionDelegate()
    })

    await session.sendRelayLatency()

    assert.equal(sent.length, 1)
})
