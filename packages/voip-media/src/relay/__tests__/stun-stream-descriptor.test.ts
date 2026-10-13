import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { bytesToHex } from '../../bytes.js'
import { nodeCrypto } from '../../node/crypto.js'
import { buildSSRCSubscriptionList, buildStreamDescriptor, type StreamLayerSsrcs } from '../stun.js'
import { WaSctpRelay } from '../WaSctpRelay.js'

const LAYER = { Audio: 0, VideoMain: 1, VideoSecondary: 2, AppData: 5 } as const

interface DescriptorEntry {
    readonly layer: number
    readonly payloadType: number
    readonly ssrc: number
    /** Field numbers present, in order. */
    readonly fields: readonly number[]
}

function readVarint(data: Uint8Array, at: number): { value: number; next: number } {
    let value = 0
    let shift = 0
    let index = at
    for (;;) {
        assert.ok(index < data.length, 'varint runs past the end of the attribute')
        const byte = data[index++]
        value += (byte & 0x7f) * 2 ** shift
        if ((byte & 0x80) === 0) return { value, next: index }
        shift += 7
    }
}

/** Reads the descriptor back field by field, independently of the encoder. */
function parseStreamDescriptor(data: Uint8Array): DescriptorEntry[] {
    const entries: DescriptorEntry[] = []
    let at = 0
    while (at < data.length) {
        assert.equal(data[at++], 0x0a, 'every entry is field 1, length-delimited')
        const length = readVarint(data, at)
        at = length.next
        const end = at + length.value
        assert.ok(end <= data.length, 'entry runs past the end of the attribute')

        const fields: number[] = []
        const values = new Map<number, number>()
        while (at < end) {
            const tag = readVarint(data, at)
            assert.equal(tag.value & 0x07, 0, 'every descriptor field is a varint')
            const value = readVarint(data, tag.next)
            at = value.next
            fields.push(tag.value >>> 3)
            values.set(tag.value >>> 3, value.value)
        }
        entries.push({
            layer: values.get(1) ?? 0,
            payloadType: values.get(2) ?? 0,
            ssrc: values.get(3) ?? 0,
            fields
        })
    }
    return entries
}

function triplesOf(layers: readonly StreamLayerSsrcs[]): number[][] {
    return parseStreamDescriptor(buildStreamDescriptor(layers)).map((entry) => [
        entry.layer,
        entry.payloadType,
        entry.ssrc
    ])
}

test('a stream is named by its layer and its entries by their position', () => {
    assert.deepEqual(
        triplesOf([{ layer: LAYER.Audio, ssrcs: [0xaaaa0001, 0xaaaa0002, 0xaaaa0003] }]),
        [
            [LAYER.Audio, 0, 0xaaaa0001],
            [LAYER.Audio, 1, 0xaaaa0002],
            [LAYER.Audio, 2, 0xaaaa0003]
        ]
    )
})

test('an entry writes only the fields that are not at their default, and never field 4', () => {
    const video = parseStreamDescriptor(
        buildStreamDescriptor([{ layer: LAYER.VideoMain, ssrcs: [0xbbbb0001, 0xbbbb0002] }])
    )
    assert.deepEqual(
        video.map((entry) => entry.fields),
        [
            [1, 3],
            [1, 2, 3]
        ]
    )

    const audio = parseStreamDescriptor(
        buildStreamDescriptor([{ layer: LAYER.Audio, ssrcs: [0xbbbb0003, 0xbbbb0004] }])
    )
    assert.deepEqual(
        audio.map((entry) => entry.fields),
        [[3], [2, 3]]
    )
})

/** The official audio media entry for SSRC `0xc1e7a024`, byte for byte. */
test('the audio media entry encodes exactly as the reference client encodes it', () => {
    assert.equal(
        bytesToHex(buildStreamDescriptor([{ layer: LAYER.Audio, ssrcs: [0xc1e7a024] }])),
        '0a0618a4c09e8f0c'
    )
})

test('every layer reaches field 1 as it was given', () => {
    const layers = [LAYER.Audio, LAYER.VideoMain, LAYER.VideoSecondary, 8, 9]
    const entries = parseStreamDescriptor(
        buildStreamDescriptor(layers.map((layer, i) => ({ layer, ssrcs: [0xc0de0000 + i] })))
    )

    assert.deepEqual(
        entries.map((entry) => entry.layer),
        layers
    )
    assert.deepEqual(
        entries.map((entry) => entry.payloadType),
        layers.map(() => 0)
    )
})

test('the app-data stream is declared under payload type 4, one entry only', () => {
    const entries = parseStreamDescriptor(
        buildStreamDescriptor([{ layer: LAYER.AppData, ssrcs: [0x5005, 0x5006] }])
    )

    assert.deepEqual(entries, [{ layer: 5, payloadType: 4, ssrc: 0x5005, fields: [1, 2, 3] }])
})

test('a partial stream drops entries instead of shifting them', () => {
    assert.deepEqual(triplesOf([{ layer: LAYER.Audio, ssrcs: [0x0f0f0001] }]), [
        [LAYER.Audio, 0, 0x0f0f0001]
    ])
    assert.deepEqual(triplesOf([{ layer: LAYER.Audio, ssrcs: [0x0f0f0001, 0, 0x0f0f0003] }]), [
        [LAYER.Audio, 0, 0x0f0f0001],
        [LAYER.Audio, 2, 0x0f0f0003]
    ])
    assert.deepEqual(
        triplesOf([
            { layer: LAYER.Audio, ssrcs: [0x0f0f0001, 0x0f0f0002, 0x0f0f0003, 0x0f0f0004] }
        ]),
        [
            [LAYER.Audio, 0, 0x0f0f0001],
            [LAYER.Audio, 1, 0x0f0f0002],
            [LAYER.Audio, 2, 0x0f0f0003]
        ]
    )
})

test('the ten self streams of a group call give ten entries in the order given', () => {
    const layers: StreamLayerSsrcs[] = [
        { layer: LAYER.Audio, ssrcs: [0x101, 0x102, 0x103] },
        { layer: LAYER.VideoMain, ssrcs: [0x201, 0x202, 0x203] },
        { layer: LAYER.VideoSecondary, ssrcs: [0x301, 0x302, 0x303] },
        { layer: LAYER.AppData, ssrcs: [0x501] }
    ]

    assert.deepEqual(triplesOf(layers), [
        [0, 0, 0x101],
        [0, 1, 0x102],
        [0, 2, 0x103],
        [1, 0, 0x201],
        [1, 1, 0x202],
        [1, 2, 0x203],
        [2, 0, 0x301],
        [2, 1, 0x302],
        [2, 2, 0x303],
        [5, 4, 0x501]
    ])
})

test('no layers give an empty descriptor', () => {
    assert.equal(buildStreamDescriptor([]).length, 0)
    assert.equal(buildStreamDescriptor([{ layer: LAYER.Audio, ssrcs: [0, 0] }]).length, 0)
})

test('the 1:1 list keeps its participant ids and payload type 1', () => {
    assert.deepEqual(
        parseStreamDescriptor(buildSSRCSubscriptionList([0x11], [0x22], 7, 9)).map((entry) => [
            entry.layer,
            entry.payloadType,
            entry.ssrc
        ]),
        [
            [7, 1, 0x11],
            [9, 1, 0x22]
        ]
    )
})

const ATTR_STREAM_DESCRIPTOR = 0x4024
const STUN_ALLOCATE = 0x0003
const SELF_AUDIO = 0x11223344
const PEER_AUDIO = 0x55667788

function streamDescriptorOf(allocate: Uint8Array): Uint8Array {
    const end = 20 + ((allocate[2] << 8) | allocate[3])
    for (let at = 20; at + 4 <= end; ) {
        const type = (allocate[at] << 8) | allocate[at + 1]
        const length = (allocate[at + 2] << 8) | allocate[at + 3]
        if (type === ATTR_STREAM_DESCRIPTOR) return allocate.subarray(at + 4, at + 4 + length)
        at += 4 + length + ((4 - (length % 4)) % 4)
    }
    assert.fail('the allocate carries no stream descriptor')
}

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
    relay.setSsrc(SELF_AUDIO)
    relay.setSubscriptionSsrc(PEER_AUDIO)
    relay.setStreamSsrcs([SELF_AUDIO], [PEER_AUDIO])
    relay.setParticipantIds(1, 2)
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

function allocates(sent: readonly Uint8Array[]): Uint8Array[] {
    return sent.filter((datagram) => ((datagram[0] << 8) | datagram[1]) === STUN_ALLOCATE)
}

const GROUP_LAYERS: StreamLayerSsrcs[] = [
    { layer: LAYER.Audio, ssrcs: [SELF_AUDIO, 0x11223345, 0x11223346] },
    { layer: LAYER.AppData, ssrcs: [0x11223347] }
]

test('with self layers set, the allocate declares them and no peer ssrc or participant id', async (t) => {
    const { relay, sent } = await openRelay(t)
    relay.setSelfLayers(GROUP_LAYERS)
    await dial(relay)

    const [allocate] = allocates(sent)
    assert.ok(allocate, 'the leg registered')
    assert.deepEqual(
        parseStreamDescriptor(streamDescriptorOf(allocate)).map((entry) => [
            entry.layer,
            entry.payloadType,
            entry.ssrc
        ]),
        [
            [0, 0, SELF_AUDIO],
            [0, 1, 0x11223345],
            [0, 2, 0x11223346],
            [5, 4, 0x11223347]
        ]
    )
})

test('without self layers the allocate keeps the 1:1 list', async (t) => {
    const { relay, sent } = await openRelay(t)
    await dial(relay)

    const [allocate] = allocates(sent)
    assert.ok(allocate, 'the leg registered')
    assert.deepEqual(
        parseStreamDescriptor(streamDescriptorOf(allocate)).map((entry) => [
            entry.layer,
            entry.payloadType,
            entry.ssrc
        ]),
        [
            [1, 1, SELF_AUDIO],
            [2, 1, PEER_AUDIO]
        ]
    )
})

test('a change of self layers is announced on the open legs, a repeat is not', async (t) => {
    const { relay, sent } = await openRelay(t)
    relay.setSelfLayers(GROUP_LAYERS)
    await dial(relay)
    sent.length = 0

    relay.setSelfLayers(GROUP_LAYERS.map((layer) => ({ ...layer, ssrcs: [...layer.ssrcs] })))
    assert.deepEqual(allocates(sent), [], 'the same streams again re-announce nothing')

    relay.setSelfLayers([{ layer: LAYER.Audio, ssrcs: [0x0a0b0c0d] }])
    assert.equal(allocates(sent).length, 1)
    assert.deepEqual(
        parseStreamDescriptor(streamDescriptorOf(allocates(sent)[0])).map((entry) => entry.ssrc),
        [0x0a0b0c0d]
    )

    relay.setSelfLayers(null)
    assert.equal(allocates(sent).length, 2, 'back to the 1:1 list, announced')
    assert.deepEqual(
        parseStreamDescriptor(streamDescriptorOf(allocates(sent)[1])).map((entry) => entry.layer),
        [1, 2]
    )
})
