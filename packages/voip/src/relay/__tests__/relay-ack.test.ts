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
