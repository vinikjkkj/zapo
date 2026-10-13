import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import { generateSecureSsrc } from '../../crypto/ssrc.js'
import { CallMediaType, type RelayEndpoint, type WaVoipDeps } from '../../types.js'
import { CallInfo } from '../call-state.js'
import {
    type WaCallMediaLink,
    type WaCallMediaLinkEvents,
    WaRemoteCallMedia
} from '../media-link.js'
import { WaCallMediaSession } from '../WaCallMediaSession.js'

import { createSessionDelegate, type RecordingMediaLink, recordMediaLink } from './_helpers.js'

const ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const LATENCY_BASE = 0x2000000

/** An incoming call session whose outgoing stanzas and media plan are captured. */
function createIncomingSession(
    relayData: CallInfo['relayData'],
    remote?: (events: WaCallMediaLinkEvents) => WaCallMediaLink
): {
    session: WaCallMediaSession
    sent: BinaryNode[]
    link: RecordingMediaLink
} {
    const call = CallInfo.newIncoming(ID, 'peer@lid', 'peer@lid', undefined, CallMediaType.Audio)
    call.relayData = relayData
    const sent: BinaryNode[] = []
    const recording = recordMediaLink()
    const link = recording.link
    const createMediaLink = remote ?? recording.createMediaLink
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
    if (inner.tag !== 'relaylatency') return []
    return (inner.content as BinaryNode[]).filter((child) => child.tag === 'te')
}

/** The relay names of each `<relaylatency>` sent, one list per stanza. */
function announced(sent: BinaryNode[]): string[][] {
    return sent
        .map((node) => teNodesOf(node).map((te) => te.attrs.relay_name))
        .filter((names) => names.length > 0)
}

async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve))
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
})

test('our own relaylatency goes out once per relay, however often setup asks for it', async () => {
    const address = new Uint8Array([10, 0, 0, 1, 0x0d, 0x96])
    const { session, sent, link } = createIncomingSession({
        endpoints: [endpoint({ relayName: 'gru1c01', c2rRtt: 17, addressBytes: address })],
        participantJids: ['peer:0@lid']
    })
    link.events.onRelayAnswered('gru1c01')

    await Promise.all([session.sendRelayLatency(), session.sendRelayLatency()])

    assert.deepEqual(
        sent.flatMap(teNodesOf).map((te) => te.attrs.relay_name),
        ['gru1c01']
    )
})

test('the relaylatency an incoming call sends on its own names only the relays it dials', async () => {
    const address = new Uint8Array([10, 0, 0, 4, 0x0d, 0x96])
    const { session, sent, link } = createIncomingSession({
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
    for (const name of ['tcp1c01', 'semtoken', 'semendereco', 'gru1c01']) {
        link.events.onRelayAnswered(name)
    }

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
    const { link, createMediaLink } = recordMediaLink()
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
        createMediaLink,
        delegate: createSessionDelegate()
    })
    link.events.onRelayAnswered('gru1c01')
    link.events.onRelayAnswered('bsb1c01')

    await session.sendRelayLatency()

    assert.equal(sent.length, 1)
})

/** Measured live: a peer that elected a relay we named and never reached sent us nothing. */
test('a relay that never answers is never named in our relaylatency', async () => {
    const { session, sent, link } = createIncomingSession({
        endpoints: [
            endpoint({ ip: '10.0.0.1', relayName: 'gru1c01', addressBytes: new Uint8Array(6) }),
            endpoint({ ip: '10.0.0.2', relayName: 'fcgh68c01', addressBytes: new Uint8Array(6) })
        ],
        participantJids: ['peer:0@lid']
    })

    await session.sendRelayLatency()
    link.events.onRelayAnswered('gru1c01', 40)
    await settle()
    await session.sendRelayLatency()

    assert.deepEqual(announced(sent), [['gru1c01']])
})

test('a relay that answers is named once, however often it answers or setup asks', async () => {
    const { session, sent, link } = createIncomingSession({
        endpoints: [
            endpoint({ relayName: 'gru1c01', c2rRtt: 17, addressBytes: new Uint8Array(6) })
        ],
        participantJids: ['peer:0@lid']
    })
    await session.sendRelayLatency()
    assert.deepEqual(announced(sent), [])

    link.events.onRelayAnswered('gru1c01', 40)
    link.events.onRelayAnswered('gru1c01', 40)
    await settle()
    await session.sendRelayLatency()

    assert.deepEqual(announced(sent), [['gru1c01']])
    assert.equal(teNodesOf(sent[0])[0].attrs.latency, String(LATENCY_BASE + 17))
})

test('relays answering at different times are named as they answer, none twice', async () => {
    const { session, sent, link } = createIncomingSession({
        endpoints: ['gru1c01', 'bsb1c01', 'for1c01'].map((relayName, i) =>
            endpoint({ ip: `10.0.0.${i + 1}`, relayName, addressBytes: new Uint8Array(6) })
        ),
        participantJids: ['peer:0@lid']
    })
    await session.sendRelayLatency()

    link.events.onRelayAnswered('bsb1c01')
    await settle()
    link.events.onRelayAnswered('gru1c01')
    link.events.onRelayAnswered('bsb1c01')
    await settle()
    link.events.onRelayAnswered('for1c01')
    await settle()

    assert.deepEqual(announced(sent), [['bsb1c01'], ['gru1c01'], ['for1c01']])
})

/** The caller's relays answer while it rings; its first relaylatency still waits for the preaccept. */
test('a relay that answers before setup asks for our relaylatency waits for it', async () => {
    const { session, sent, link } = createIncomingSession({
        endpoints: [endpoint({ relayName: 'gru1c01', addressBytes: new Uint8Array(6) })],
        participantJids: ['peer:0@lid']
    })

    link.events.onRelayAnswered('gru1c01')
    await settle()
    assert.deepEqual(announced(sent), [])

    await session.sendRelayLatency()
    assert.deepEqual(announced(sent), [['gru1c01']])
})

test('a relay the remote host reports answering is named, with the round trip it measured', async () => {
    const { session, sent } = createIncomingSession(
        {
            endpoints: [
                endpoint({ ip: '10.0.0.1', relayName: 'gru1c01', addressBytes: new Uint8Array(6) }),
                endpoint({
                    ip: '10.0.0.2',
                    relayName: 'fcgh68c01',
                    addressBytes: new Uint8Array(6)
                })
            ],
            participantJids: ['peer:0@lid']
        },
        (events) => new WaRemoteCallMedia(ID, events)
    )
    await session.sendRelayLatency()

    session.handleMediaEvent({ type: 'relay_answered', name: 'gru1c01', rttMs: 23 })
    await settle()

    assert.deepEqual(
        sent.flatMap(teNodesOf).map((te) => [te.attrs.relay_name, te.attrs.latency]),
        [['gru1c01', String(LATENCY_BASE + 23)]]
    )
})

/**
 * A host older than `relay_answered` reports no relay, so naming only the ones that answered
 * would name none: once its media is up, every relay we dial is named, as it was before.
 */
test('a remote host that reports no answers gets every relay we dial named once its media is up', async () => {
    const endpoints = [
        endpoint({ ip: '10.0.0.1', relayName: 'gru1c01', addressBytes: new Uint8Array(6) }),
        endpoint({ ip: '10.0.0.2', relayName: 'fcgh68c01', addressBytes: new Uint8Array(6) })
    ]
    const legacy = createIncomingSession(
        { endpoints, participantJids: ['peer:0@lid'] },
        (events) => new WaRemoteCallMedia(ID, events)
    )
    const current = createIncomingSession(
        { endpoints, participantJids: ['peer:0@lid'] },
        (events) => new WaRemoteCallMedia(ID, events)
    )

    for (const { session } of [legacy, current]) {
        await session.sendRelayLatency()
        await session.acceptCall()
    }
    legacy.session.handleMediaEvent({ type: 'active' })
    current.session.handleMediaEvent({ type: 'active', reportsRelayAnswers: true })
    await settle()

    assert.deepEqual(announced(legacy.sent).flat().sort(), ['fcgh68c01', 'gru1c01'])
    assert.deepEqual(announced(current.sent), [])
})
