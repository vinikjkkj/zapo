import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import { generateSecureSsrc } from '../../crypto/ssrc.js'
import { CallMediaType, type RelayEndpoint, type WaVoipDeps } from '../../types.js'
import { CallInfo } from '../call-state.js'
import { WaCallMediaSession, type WaCallMediaSessionDelegate } from '../WaCallMediaSession.js'

const ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const LATENCY_BASE = 0x2000000

/** An incoming call session whose relay and outgoing stanzas are captured. */
function createIncomingSession(relayData: CallInfo['relayData']): {
    session: WaCallMediaSession
    sent: BinaryNode[]
    subscriptions: number[]
} {
    const call = CallInfo.newIncoming(ID, 'peer@lid', 'peer@lid', undefined, CallMediaType.Audio)
    call.relayData = relayData
    const sent: BinaryNode[] = []
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
        delegate: {
            emitState: () => {},
            emitIncoming: () => {},
            emitEnded: () => {},
            emitInboundAudio: () => {},
            emitInboundVideoRtp: () => {},
            emitInboundVideo: () => {},
            emitOutboundAudioFinished: () => {}
        } satisfies WaCallMediaSessionDelegate
    })

    const subscriptions: number[] = []
    ;(session as unknown as { sctpRelay: unknown }).sctpRelay = {
        configureRelays: async () => {},
        setSsrc: () => {},
        setSubscriptionSsrc: (ssrc: number) => {
            subscriptions.push(ssrc)
        },
        setStreamSsrcs: () => {},
        setParticipantIds: () => {},
        getConnectedCount: () => 0
    }

    return { session, sent, subscriptions }
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
    // Companions ahead of the caller: neither "first listed" nor "first
    // non-zero device" may be what decides.
    const { session, subscriptions } = createIncomingSession({
        endpoints: [],
        participantJids: ['peer:34@lid', 'peer:39@lid', 'peer:0@lid', 'peer@lid']
    })

    await session.acceptCall()

    assert.deepEqual(subscriptions, [generateSecureSsrc(ID, 'peer:0@lid')])
})

test('relaylatency is answered only for our relays, with our latency and address', async () => {
    const ownAddress = new Uint8Array([10, 0, 0, 1, 0x0d, 0x96])
    const { session, sent } = createIncomingSession({
        endpoints: [endpoint({ relayName: 'gru1c01', c2rRtt: 17, addressBytes: ownAddress })],
        participantJids: ['peer:0@lid']
    })

    await session.handleCallRelaylatency(
        relaylatencyNode([
            { name: 'frvd4c01', latencyMs: 6 },
            { name: 'gru1c01', latencyMs: 21 }
        ]),
        'peer@lid'
    )

    assert.equal(sent.length, 1)
    const te = teNodesOf(sent[0])
    assert.equal(te.length, 1)
    assert.equal(te[0].attrs.relay_name, 'gru1c01')
    assert.equal(te[0].attrs.latency, String(LATENCY_BASE + 17))
    assert.deepEqual(te[0].content, ownAddress)
})

test('relaylatency never advertises a relay this client does not dial', async () => {
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

    await session.handleCallRelaylatency(
        relaylatencyNode([
            { name: 'tcp1c01', latencyMs: 5 },
            { name: 'semtoken', latencyMs: 5 },
            { name: 'semendereco', latencyMs: 5 },
            { name: 'gru1c01', latencyMs: 21 }
        ]),
        'peer@lid'
    )

    assert.equal(sent.length, 1)
    assert.deepEqual(
        teNodesOf(sent[0]).map((te) => te.attrs.relay_name),
        ['gru1c01']
    )
})

test('relaylatency naming only relays we were never given is not answered', async () => {
    const { session, sent } = createIncomingSession({
        endpoints: [endpoint({ relayName: 'gru1c01', c2rRtt: 17 })],
        participantJids: ['peer:0@lid']
    })

    await session.handleCallRelaylatency(
        relaylatencyNode([{ name: 'frvd4c01', latencyMs: 6 }]),
        'peer@lid'
    )

    assert.equal(sent.length, 0)
})
