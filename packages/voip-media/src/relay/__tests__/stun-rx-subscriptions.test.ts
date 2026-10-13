import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { bytesToHex, TEXT_ENCODER } from '../../bytes.js'
import { nodeCrypto } from '../../node/crypto.js'
import { buildAllocateForRelay, buildRxSubscriptions, buildStreamDescriptor } from '../stun.js'
import { WaSctpRelay } from '../WaSctpRelay.js'

const STUN_ALLOCATE = 0x0003
const ATTR_RX_SUBSCRIPTIONS = 0x4021

/** Captured from the official client: pid 0 at quality 2, then pid 2 at quality 2. */
const OFFICIAL_RX_SUBSCRIPTIONS = '12021002120408021002'

/** Every attribute of a STUN message as `[type, value]`, read independently of the encoder. */
function attributesOf(packet: Uint8Array): Array<[number, Uint8Array]> {
    const end = 20 + ((packet[2] << 8) | packet[3])
    const attributes: Array<[number, Uint8Array]> = []
    for (let at = 20; at + 4 <= end; ) {
        const type = (packet[at] << 8) | packet[at + 1]
        const length = (packet[at + 2] << 8) | packet[at + 3]
        attributes.push([type, packet.subarray(at + 4, at + 4 + length)])
        at += 4 + length + ((4 - (length % 4)) % 4)
    }
    return attributes
}

function allocate(rxSubscriptions?: Uint8Array | null): Uint8Array {
    return buildAllocateForRelay(
        nodeCrypto,
        new Uint8Array([1, 2, 3, 4]),
        buildStreamDescriptor([{ layer: 0, ssrcs: [0x11223344] }]),
        TEXT_ENCODER.encode('relay-key'),
        '192.0.2.10',
        3478,
        new Uint8Array(12),
        rxSubscriptions
    )
}

test('the rx subscriptions encode exactly as the official client encodes them', () => {
    assert.equal(
        bytesToHex(
            buildRxSubscriptions([
                { pid: 0, quality: 2 },
                { pid: 2, quality: 2 }
            ])
        ),
        OFFICIAL_RX_SUBSCRIPTIONS
    )
})

test('an rx subscription leaves fields at their default out, and never writes field 1', () => {
    assert.equal(bytesToHex(buildRxSubscriptions([{ pid: 3, quality: 0 }])), '12020803')
    assert.equal(bytesToHex(buildRxSubscriptions([{ pid: 0, quality: 0 }])), '1200')
    assert.equal(buildRxSubscriptions([]).length, 0)
})

test('the allocate carries 0x4021 between the credential and the stream descriptor', () => {
    const rx = buildRxSubscriptions([{ pid: 2, quality: 2 }])
    const attributes = attributesOf(allocate(rx))

    assert.deepEqual(
        attributes.map(([type]) => type),
        [0x4000, 0x4021, 0x4024, 0x0016, 0x0008]
    )
    assert.deepEqual(attributes[1][1], rx)
})

test('without rx subscriptions, or with none, the allocate carries no 0x4021', () => {
    for (const rx of [undefined, null, new Uint8Array(0)]) {
        assert.deepEqual(
            attributesOf(allocate(rx)).map(([type]) => type),
            [0x4000, 0x4024, 0x0016, 0x0008]
        )
    }
})

/** A relay with one raw leg that records what it sends, opened and registered. */
async function openRelay(t: TestContext): Promise<{ relay: WaSctpRelay; sent: Uint8Array[] }> {
    const sent: Uint8Array[] = []
    const relay = new WaSctpRelay({
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        createRawUdpLeg: (options) => {
            let open = false
            return {
                get isOpen() {
                    return open
                },
                open: () =>
                    queueMicrotask(() => {
                        open = true
                        options.onOpen()
                    }),
                send: (data) => {
                    sent.push(data.slice())
                    return open
                },
                close: () => {
                    open = false
                }
            }
        }
    })
    t.after(() => relay.cleanup())
    relay.setSsrc(0x11223344)
    return { relay, sent }
}

async function dial(relay: WaSctpRelay): Promise<void> {
    await relay.configureRelays([
        {
            ip: '10.0.0.1',
            port: 3478,
            token: 'token',
            rawToken: new Uint8Array([1, 2, 3]),
            key: 'relay-key',
            relayId: 1
        }
    ])
    await new Promise<void>((resolve) => setImmediate(resolve))
}

function rxOfAllocates(sent: readonly Uint8Array[]): Array<string | null> {
    return sent
        .filter((datagram) => ((datagram[0] << 8) | datagram[1]) === STUN_ALLOCATE)
        .map((packet) => {
            const rx = attributesOf(packet).find(([type]) => type === ATTR_RX_SUBSCRIPTIONS)
            return rx ? bytesToHex(rx[1]) : null
        })
}

test('a raw leg announces the rx subscriptions set before it opened', async (t) => {
    const { relay, sent } = await openRelay(t)
    relay.setRxSubscriptions(
        buildRxSubscriptions([
            { pid: 0, quality: 2 },
            { pid: 2, quality: 2 }
        ])
    )
    await dial(relay)

    assert.deepEqual(rxOfAllocates(sent), [OFFICIAL_RX_SUBSCRIPTIONS])
})

test('a change of rx subscriptions is re-announced on open legs, a repeat is not', async (t) => {
    const { relay, sent } = await openRelay(t)
    await dial(relay)
    assert.deepEqual(rxOfAllocates(sent), [null], 'no 0x4021 until one is set')
    sent.length = 0

    const rx = buildRxSubscriptions([{ pid: 2, quality: 2 }])
    relay.setRxSubscriptions(rx)
    assert.deepEqual(rxOfAllocates(sent), [bytesToHex(rx)])

    relay.setRxSubscriptions(rx.slice())
    assert.equal(rxOfAllocates(sent).length, 1, 'the same bytes again re-announce nothing')

    rx.fill(0)
    relay.resendSubscriptions()
    assert.equal(rxOfAllocates(sent)[1], '120408021002', 'the bytes were copied')

    relay.setRxSubscriptions(null)
    assert.deepEqual(rxOfAllocates(sent).slice(2), [null], 'cleared, and announced without it')
})
