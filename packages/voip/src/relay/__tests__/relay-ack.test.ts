import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { parseRelayFromAck } from '../relay-ack.js'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

function buildRelayAck(): BinaryNode {
    const tokenBytes = new Uint8Array([0xaa, 0xbb, 0xcc])
    const authTokenBytes = new Uint8Array([0x11, 0x22])
    const hbhKey = new Uint8Array(30).fill(7)
    const te2Addr = new Uint8Array([192, 168, 1, 1, 0x0d, 0x96])

    return {
        tag: 'ack',
        attrs: {},
        content: [
            {
                tag: 'user',
                attrs: {},
                content: [
                    { tag: 'device', attrs: { jid: '111@lid' }, content: undefined },
                    { tag: 'device', attrs: { jid: '222@lid' }, content: undefined }
                ]
            },
            {
                tag: 'relay',
                attrs: { uuid: 'UUID-1', self_pid: '5', peer_pid: '7' },
                content: [
                    { tag: 'participant', attrs: { jid: '333@lid' }, content: undefined },
                    { tag: 'key', attrs: {}, content: enc('RELAYKEY') },
                    { tag: 'hbh_key', attrs: {}, content: hbhKey },
                    { tag: 'token', attrs: { id: '1' }, content: tokenBytes },
                    { tag: 'auth_token', attrs: { id: '9' }, content: authTokenBytes },
                    {
                        tag: 'te2',
                        attrs: {
                            token_id: '1',
                            auth_token_id: '9',
                            relay_name: 'r1',
                            protocol: '1',
                            relay_id: '2',
                            c2r_rtt: '40'
                        },
                        content: te2Addr
                    }
                ]
            }
        ]
    }
}

test('parseRelayFromAck extracts relay metadata, participants and hbh key', () => {
    const result = parseRelayFromAck(buildRelayAck())

    assert.equal(result.uuid, 'UUID-1')
    assert.equal(result.selfPid, 5)
    assert.equal(result.peerPid, 7)
    assert.deepEqual([...(result.hbhKey ?? [])], new Array(30).fill(7))

    assert.deepEqual(result.participantJids, ['111@lid', '222@lid', '333@lid'])

    assert.equal(result.relays.length, 1)
    const relay = result.relays[0]
    assert.equal(relay.ip, '192.168.1.1')
    assert.equal(relay.port, 3478)
    assert.equal(relay.key, 'RELAYKEY')
    assert.equal(relay.relayId, 2)
    assert.equal(relay.protocol, 1)
    assert.equal(relay.c2rRtt, 40)
    assert.equal(relay.relayName, 'r1')
    assert.equal(relay.authTokenId, '9')
    assert.deepEqual([...(relay.rawToken ?? [])], [0xaa, 0xbb, 0xcc])
    assert.deepEqual([...(relay.rawAuthToken ?? [])], [0x11, 0x22])
    assert.deepEqual([...(relay.addressBytes ?? [])], [192, 168, 1, 1, 0x0d, 0x96])
})

test('parseRelayFromAck skips te2 entries with a short address', () => {
    const ack: BinaryNode = {
        tag: 'ack',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: { uuid: 'U' },
                content: [
                    { tag: 'te2', attrs: { relay_name: 'r' }, content: new Uint8Array([1, 2, 3]) }
                ]
            }
        ]
    }

    assert.deepEqual(parseRelayFromAck(ack).relays, [])
})

test('parseRelayFromAck returns an empty result for a childless ack', () => {
    const result = parseRelayFromAck({ tag: 'ack', attrs: {}, content: undefined })
    assert.deepEqual(result.relays, [])
    assert.deepEqual(result.participantJids, [])
    assert.equal(result.uuid, '')
    assert.equal(result.hbhKey, undefined)
})

test('parseRelayFromAck deprioritizes FNA relays after non-FNA regardless of rtt', () => {
    const fnaAddr = new Uint8Array([10, 0, 0, 1, 0x0d, 0x96])
    const edgeAddr = new Uint8Array([192, 168, 1, 1, 0x0d, 0x96])

    const ack: BinaryNode = {
        tag: 'ack',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: { uuid: 'U' },
                content: [
                    { tag: 'key', attrs: {}, content: enc('K') },
                    { tag: 'token', attrs: { id: '0' }, content: new Uint8Array([1]) },
                    {
                        tag: 'te2',
                        attrs: {
                            token_id: '0',
                            relay_name: 'alpha',
                            relay_id: '0',
                            c2r_rtt: '18',
                            is_fna: '1'
                        },
                        content: fnaAddr
                    },
                    {
                        tag: 'te2',
                        attrs: { token_id: '0', relay_name: 'zulu', relay_id: '1', c2r_rtt: '40' },
                        content: edgeAddr
                    }
                ]
            }
        ]
    }

    const { relays } = parseRelayFromAck(ack)
    assert.equal(relays.length, 2)
    assert.equal(relays[0].relayName, 'zulu')
    assert.equal(relays[0].isFna, false)
    assert.equal(relays[1].relayName, 'alpha')
    assert.equal(relays[1].isFna, true)
})

test('parseRelayFromAck reads the relay descriptor attributes onto every endpoint', () => {
    const ack: BinaryNode = {
        tag: 'ack',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: {
                    uuid: 'U',
                    domain_name: 'g.whatsapp.net',
                    enable_edgeray_dtls_active_mode: '1'
                },
                content: [
                    { tag: 'key', attrs: {}, content: enc('K') },
                    { tag: 'token', attrs: { id: '0' }, content: new Uint8Array([1]) },
                    {
                        tag: 'te2',
                        attrs: { token_id: '0', relay_id: '0' },
                        content: new Uint8Array([10, 0, 0, 1, 0x0d, 0x96])
                    }
                ]
            }
        ]
    }

    const { relays } = parseRelayFromAck(ack)

    assert.equal(relays.length, 1)
    const relay = relays[0]
    assert.equal(relay.domainName, 'g.whatsapp.net')
    assert.equal(relay.enableEdgerayDtlsActiveMode, true)
})

test('parseRelayFromAck leaves the descriptor fields unset when the attrs are absent', () => {
    const { relays } = parseRelayFromAck(buildRelayAck())

    assert.equal(relays[0].domainName, undefined)
    assert.equal(relays[0].enableEdgerayDtlsActiveMode, undefined)
})

test('parseRelayFromAck accepts te endpoints as well as te2', () => {
    const ack: BinaryNode = {
        tag: 'ack',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: { uuid: 'U' },
                content: [
                    { tag: 'key', attrs: {}, content: enc('K') },
                    { tag: 'token', attrs: { id: '0' }, content: new Uint8Array([9]) },
                    { tag: 'auth_token', attrs: { id: '3' }, content: new Uint8Array([8]) },
                    {
                        tag: 'te',
                        attrs: {
                            token_id: '0',
                            auth_token_id: '3',
                            relay_name: 'legacy',
                            relay_id: '4',
                            c2r_rtt: '12'
                        },
                        content: new Uint8Array([203, 0, 113, 5, 0x0d, 0x96])
                    }
                ]
            }
        ]
    }

    const { relays } = parseRelayFromAck(ack)
    assert.equal(relays.length, 1)
    assert.equal(relays[0].ip, '203.0.113.5')
    assert.equal(relays[0].port, 3478)
    assert.equal(relays[0].relayName, 'legacy')
    assert.equal(relays[0].relayId, 4)
    assert.equal(relays[0].c2rRtt, 12)
    assert.deepEqual([...(relays[0].rawAuthToken ?? [])], [8])
})

test('parseRelayFromAck decodes an 18-byte IPv6 endpoint with a big-endian port', () => {
    const addr = new Uint8Array(18)
    addr.set([0x20, 0x01, 0x0d, 0xb8], 0)
    addr[15] = 0x01
    addr[16] = 0x0d
    addr[17] = 0x96

    const ack: BinaryNode = {
        tag: 'ack',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: { uuid: 'U' },
                content: [
                    { tag: 'key', attrs: {}, content: enc('K') },
                    { tag: 'token', attrs: { id: '0' }, content: new Uint8Array([1]) },
                    { tag: 'te2', attrs: { token_id: '0' }, content: addr }
                ]
            }
        ]
    }

    const { relays } = parseRelayFromAck(ack)
    assert.equal(relays.length, 1)
    assert.equal(relays[0].ip, '2001:db8::1')
    assert.equal(relays[0].port, 3478)
    assert.equal(relays[0].addressBytes?.length, 18)
})

test('parseRelayFromAck skips endpoints whose address is neither 6, 18 nor 24 bytes', () => {
    const ack: BinaryNode = {
        tag: 'ack',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: { uuid: 'U' },
                content: [
                    { tag: 'te2', attrs: {}, content: new Uint8Array(7) },
                    { tag: 'te2', attrs: {}, content: new Uint8Array(20) },
                    { tag: 'te2', attrs: {}, content: new Uint8Array(25) }
                ]
            }
        ]
    }

    assert.deepEqual(parseRelayFromAck(ack).relays, [])
})

function buildDualStackAddress(): Uint8Array {
    const addr = new Uint8Array(24)
    addr.set([203, 0, 113, 9], 0)
    addr[4] = 0x0d
    addr[5] = 0x96
    addr.set([0x20, 0x01, 0x0d, 0xb8], 6)
    addr[21] = 0x02
    addr[22] = 0x1f
    addr[23] = 0x40
    return addr
}

function buildDualStackAck(addr: Uint8Array): BinaryNode {
    return {
        tag: 'ack',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: {
                    uuid: 'U',
                    domain_name: 'g.whatsapp.net',
                    enable_edgeray_dtls_active_mode: '1'
                },
                content: [
                    { tag: 'key', attrs: {}, content: enc('DUALKEY') },
                    { tag: 'token', attrs: { id: '2' }, content: new Uint8Array([0xde, 0xad]) },
                    {
                        tag: 'auth_token',
                        attrs: { id: '4' },
                        content: new Uint8Array([0xbe, 0xef])
                    },
                    {
                        tag: 'te2',
                        attrs: {
                            token_id: '2',
                            auth_token_id: '4',
                            relay_name: 'dual',
                            relay_id: '6',
                            protocol: '0',
                            c2r_rtt: '25',
                            is_fna: '1'
                        },
                        content: addr
                    }
                ]
            }
        ]
    }
}

test('parseRelayFromAck expands a 24-byte dual-stack endpoint into an IPv4 and an IPv6 entry', () => {
    const { relays } = parseRelayFromAck(buildDualStackAck(buildDualStackAddress()))

    assert.equal(relays.length, 2)

    const [v4, v6] = relays
    assert.equal(v4.ip, '203.0.113.9')
    assert.equal(v4.port, 3478)
    assert.deepEqual([...(v4.addressBytes ?? [])], [203, 0, 113, 9, 0x0d, 0x96])

    assert.equal(v6.ip, '2001:db8::2')
    assert.equal(v6.port, 8000)
    assert.equal(v6.addressBytes?.length, 18)
    assert.deepEqual(
        [...(v6.addressBytes ?? [])],
        [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x02, 0x1f, 0x40]
    )
})

test('parseRelayFromAck gives both dual-stack entries the shared fields of their node', () => {
    const { relays } = parseRelayFromAck(buildDualStackAck(buildDualStackAddress()))

    assert.equal(relays.length, 2)
    for (const relay of relays) {
        assert.equal(relay.key, 'DUALKEY')
        assert.equal(relay.relayName, 'dual')
        assert.equal(relay.relayId, 6)
        assert.equal(relay.protocol, 0)
        assert.equal(relay.c2rRtt, 25)
        assert.equal(relay.isFna, true)
        assert.equal(relay.authTokenId, '4')
        assert.deepEqual([...(relay.rawToken ?? [])], [0xde, 0xad])
        assert.deepEqual([...(relay.rawAuthToken ?? [])], [0xbe, 0xef])
        assert.equal(relay.domainName, 'g.whatsapp.net')
        assert.equal(relay.enableEdgerayDtlsActiveMode, true)
    }
})

test('parseRelayFromAck does not alias the source buffer of a dual-stack endpoint', () => {
    const addr = buildDualStackAddress()
    const { relays } = parseRelayFromAck(buildDualStackAck(addr))
    addr.fill(0)

    assert.equal(relays[0].ip, '203.0.113.9')
    assert.deepEqual([...(relays[0].addressBytes ?? [])], [203, 0, 113, 9, 0x0d, 0x96])
    assert.equal(relays[1].ip, '2001:db8::2')
    assert.equal(relays[1].port, 8000)
    assert.deepEqual(
        [...(relays[1].addressBytes ?? [])],
        [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x02, 0x1f, 0x40]
    )
})

test('parseRelayFromAck keeps a dual-stack pair adjacent when sorting by rtt', () => {
    const ack: BinaryNode = {
        tag: 'ack',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: { uuid: 'U' },
                content: [
                    { tag: 'key', attrs: {}, content: enc('K') },
                    { tag: 'token', attrs: { id: '0' }, content: new Uint8Array([1]) },
                    {
                        tag: 'te2',
                        attrs: { token_id: '0', relay_name: 'slow', c2r_rtt: '90' },
                        content: buildDualStackAddress()
                    },
                    {
                        tag: 'te2',
                        attrs: { token_id: '0', relay_name: 'fast', c2r_rtt: '10' },
                        content: new Uint8Array([10, 0, 0, 1, 0x0d, 0x96])
                    }
                ]
            }
        ]
    }

    const { relays } = parseRelayFromAck(ack)
    assert.deepEqual(
        relays.map((relay) => relay.ip),
        ['10.0.0.1', '203.0.113.9', '2001:db8::2']
    )
})
