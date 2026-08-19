import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'

import { TRUE_WEB_CLIENT_RELAY_PORT } from '../../relay/WaSctpRelay.js'
import { CallMediaType, type RelayEndpoint, type WaVoipDeps } from '../../types.js'
import { CallInfo } from '../call-state.js'
import { WaCallMediaSession, type WaCallMediaSessionDelegate } from '../WaCallMediaSession.js'

const ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

interface ConfiguredRelay {
    readonly ip: string
    readonly port: number
    readonly name?: string
}

/** A session whose relay configuration is captured instead of dialled. */
function createSession(useOriginalRelayPort = false): {
    session: WaCallMediaSession
    configured: ConfiguredRelay[]
} {
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Audio)
    const session = new WaCallMediaSession({
        deps: {} as unknown as WaVoipDeps,
        logger: createNoopLogger(),
        info: call,
        useOriginalRelayPort,
        delegate: {
            emitState: () => {},
            emitIncoming: () => {},
            emitEnded: () => {},
            emitInboundAudio: () => {},
            emitOutboundAudioFinished: () => {}
        } satisfies WaCallMediaSessionDelegate
    })

    const configured: ConfiguredRelay[] = []
    ;(
        session as unknown as {
            sctpRelay: {
                configureRelays: (relays: ConfiguredRelay[]) => Promise<void>
                setSsrc: (ssrc: number) => void
                setSubscriptionSsrc: (ssrc: number) => void
                getConnectedCount: () => number
            }
        }
    ).sctpRelay = {
        configureRelays: async (relays) => {
            configured.push(...relays)
        },
        setSsrc: () => {},
        setSubscriptionSsrc: () => {},
        getConnectedCount: () => 0
    }

    return { session, configured }
}

function connectRelays(session: WaCallMediaSession, endpoints: RelayEndpoint[]): Promise<void> {
    return (
        session as unknown as {
            connectRelays: (endpoints: RelayEndpoint[]) => Promise<void>
        }
    ).connectRelays(endpoints)
}

function endpoint(overrides: Partial<RelayEndpoint> = {}): RelayEndpoint {
    return {
        ip: '192.168.1.1',
        port: 3480,
        token: 'TOKEN',
        key: 'RELAYKEY',
        relayId: 0,
        rawToken: new Uint8Array([1, 2, 3]),
        ...overrides
    }
}

test('every relay is dialled on the web client port', async () => {
    const { session, configured } = createSession()

    await connectRelays(session, [endpoint({ ip: '10.0.0.1', port: 3480 })])

    assert.equal(configured.length, 1)
    assert.equal(configured[0].ip, '10.0.0.1')
    assert.equal(configured[0].port, TRUE_WEB_CLIENT_RELAY_PORT)
})

test('an endpoint advertising the faux port is still dialled on the web client port', async () => {
    const { session, configured } = createSession()

    await connectRelays(session, [endpoint({ ip: '10.0.0.1', port: 3478 })])

    assert.equal(configured[0].port, TRUE_WEB_CLIENT_RELAY_PORT)
})

test('a relay without a name is named for the address it dials', async () => {
    const { session, configured } = createSession()

    await connectRelays(session, [endpoint({ ip: '10.0.0.1', port: 3478 })])

    assert.equal(configured[0].name, `10.0.0.1:${TRUE_WEB_CLIENT_RELAY_PORT}`)
})

test('the advertised port is dialled when the escape hatch is set', async () => {
    const { session, configured } = createSession(true)

    await connectRelays(session, [endpoint({ ip: '10.0.0.1', port: 47001 })])

    assert.equal(configured[0].port, 47001)
    assert.equal(configured[0].name, '10.0.0.1:47001')
})

test('endpoints of one host on different ports stay distinct under the escape hatch', async () => {
    const { session, configured } = createSession(true)

    await connectRelays(session, [
        endpoint({ ip: '10.0.0.1', port: 3478, relayId: 0 }),
        endpoint({ ip: '10.0.0.1', port: 3480, relayId: 1 })
    ])

    assert.deepEqual(
        configured.map((relay) => relay.port),
        [3478, 3480]
    )
})
