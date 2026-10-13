import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger, type Logger } from '../../logger.js'
import { nodeCrypto } from '../../node/crypto.js'
import { WaSctpRelay } from '../WaSctpRelay.js'

import {
    ADVERTISED_PORT,
    createFakeLeg,
    createHarness,
    endpoint,
    type FakeLeg,
    flush,
    idOf,
    MEDIA,
    OFFER,
    REISSUE
} from './_relay-harness.js'

test('with raw udp legs only where required, the other relays stay on WebRTC', async (t) => {
    let webrtcDials = 0
    const harness = createHarness(t, {
        rawUdpLegs: 'required',
        createPeerConnection: () => {
            webrtcDials++
            return Promise.reject(new Error('no WebRTC here'))
        }
    })

    await harness.relay.configureRelays([
        { ...endpoint(OFFER[0]), originalPort: 3480 },
        endpoint(REISSUE[0], { transport: 'raw-udp' })
    ])
    await flush()

    assert.deepEqual(
        harness.legs.map((leg) => [leg.ip, leg.port]),
        [[REISSUE[0], ADVERTISED_PORT]],
        'only the relay that requires it rides raw udp, on its advertised port'
    )
    assert.equal(webrtcDials, 1, 'the offer relay went to WebRTC')
})

test('by default a host with raw udp legs dials every relay over raw udp', async (t) => {
    const harness = createHarness(t)

    await harness.relay.configureRelays([
        endpoint(OFFER[0]),
        endpoint(REISSUE[0], { transport: 'raw-udp' })
    ])
    await flush()

    assert.deepEqual(
        harness.legs.map((leg) => [leg.ip, leg.port]),
        [
            [OFFER[0], ADVERTISED_PORT],
            [REISSUE[0], ADVERTISED_PORT]
        ]
    )
})

test('a relay that requires raw udp is skipped by a host without it, in one warning', async (t) => {
    let webrtcDials = 0
    const warnings: string[] = []
    const logger = createNoopLogger()
    logger.warn = (message) => {
        warnings.push(message)
    }
    const relay = new WaSctpRelay({
        crypto: nodeCrypto,
        logger,
        createPeerConnection: () => {
            webrtcDials++
            return Promise.reject(new Error('no WebRTC here'))
        }
    })
    t.after(() => relay.cleanup())

    await relay.configureRelays(
        [
            { ...endpoint(OFFER[0]), originalPort: 3480 },
            endpoint(REISSUE[0], { transport: 'raw-udp' }),
            endpoint(REISSUE[1], { transport: 'raw-udp' })
        ],
        { generation: 1 }
    )

    assert.equal(webrtcDials, 1, 'only the relay that needs no raw udp was dialled')
    assert.equal(
        warnings.filter((message) => message.includes('need raw udp')).length,
        1,
        'the skipped relays are reported together'
    )
})

/** A WARP frame around the media packet, 8-byte header. */
const FRAMED_MEDIA = new Uint8Array([0x09, 0x02, 0x01, 0x93, 0x01, 0x00, 0x01, 0x93, ...MEDIA])

test('a warp-framed datagram reaches the owner untouched and is traced as a frame', async (t) => {
    const received: Array<[Uint8Array, string]> = []
    const traces: string[] = []
    const answered: string[] = []
    const logger: Logger = {
        ...createNoopLogger(),
        level: 'trace',
        trace: (message) => {
            traces.push(message)
        },
        child: () => logger
    }
    const legs: FakeLeg[] = []
    const relay = new WaSctpRelay({
        crypto: nodeCrypto,
        logger,
        createPeerConnection: () => Promise.reject(new Error('this test dials no WebRTC leg')),
        createRawUdpLeg: (options) => createFakeLeg(options, legs, new Set([OFFER[0]])),
        onReceive: (data, connectionId) => received.push([data, connectionId]),
        onRelayAnswered: (name) => answered.push(name)
    })
    t.after(() => relay.cleanup())
    await relay.configureRelays([endpoint(OFFER[0])])
    legs[0].release()

    legs[0].deliver(FRAMED_MEDIA)

    assert.deepEqual(received, [[FRAMED_MEDIA, idOf(OFFER[0])]])
    assert.deepEqual(answered, [OFFER[0]], 'a frame is the relay answering')
    assert.ok(traces.includes('warp frame received'))
    assert.ok(!traces.includes('stun response received'))
    assert.ok(!traces.includes('unparseable stun-like packet'))
})
