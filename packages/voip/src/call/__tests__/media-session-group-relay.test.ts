import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import {
    CONNECTED,
    createSession,
    dualStack,
    GIG,
    groupUpdate,
    GRU,
    ID,
    LIS,
    offerRelayData,
    PEER,
    PEER_DEVICE,
    PLACED,
    placedGroupCall,
    relayDescriptor,
    type RelaySpec,
    relaysPublished,
    THIRD_DEVICE,
    THREE_WAY,
    toRoster
} from './_group-session.js'

test('a reissued relay moves the call to a new generation of raw udp legs, elected first', async () => {
    const harness = await createSession({ relayData: offerRelayData() })

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GIG, GRU] }) })
    )

    const relays = relaysPublished(harness.link).at(-1)
    assert.ok(relays)
    assert.equal(relays.generation, 1)
    assert.equal(relays.selfPid, 1)
    // Every dialable relay, the elected one first, each over both families.
    assert.deepEqual(
        relays.endpoints.map((endpoint) => [endpoint.name, endpoint.ip, endpoint.transport]),
        [
            ['gru2c01', '10.2.2.2', 'raw-udp'],
            ['gru2c01', 'fd00::2', 'raw-udp'],
            ['gig4c02', '10.3.3.3', 'raw-udp'],
            ['gig4c02', 'fd00::3', 'raw-udp']
        ]
    )
    assert.deepEqual(relays.endpoints[0].rawToken, GRU.token)
    assert.deepEqual(relays.endpoints[2].rawToken, GIG.token)
    assert.equal(relays.endpoints[0].key, 'REISSUEDRELAYKEY')
    // The participant list is kept when the reissue omits it.
    assert.deepEqual(harness.call.relayData?.participantJids, [PEER_DEVICE])
    // The relay is a separate matter from the roster.
    assert.equal(harness.diffs.length, 0)
})

test('an identical reissue dials nothing new, a changed runner-up is a new generation', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GRU, GIG] }) })
    )
    const published = relaysPublished(harness.link).length

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GRU, GIG] }) })
    )
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 3, roster: toRoster(THREE_WAY) })
    )
    assert.equal(relaysPublished(harness.link).length, published)

    // The runner-up is a leg too, so replacing it moves the transport.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GRU, LIS] }) })
    )
    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 2)
    assert.deepEqual(
        [...new Set(relays?.endpoints.map((endpoint) => endpoint.name))],
        ['gru2c01', 'lis1c01']
    )
})

test('a relay re-credited at the same address is redialled with the new token', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GRU, GIG] }) })
    )

    const reminted = Uint8Array.of(0xa9)
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            relay: relayDescriptor({ selfPid: '1', relays: [{ ...GRU, token: reminted }, GIG] })
        })
    )

    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 2)
    assert.deepEqual(
        relays?.endpoints.map((endpoint) => [endpoint.ip, endpoint.rawToken]),
        [
            ['10.2.2.2', reminted],
            ['fd00::2', reminted],
            ['10.3.3.3', GIG.token],
            ['fd00::3', GIG.token]
        ]
    )
})

test('a self_pid change alone republishes the relay under the new pid', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '0', relays: [GRU, GIG] }) })
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '2', relays: [GRU, GIG] }) })
    )

    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 2)
    assert.equal(relays?.selfPid, 2)
    assert.equal(harness.call.relayData?.selfPid, 2)
})

test('the relay of a group update older than the newest one read is ignored', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    const reminted = Uint8Array.of(0xa9)
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 14,
            roster: toRoster(THREE_WAY),
            relay: relayDescriptor({ selfPid: '1', relays: [{ ...GRU, token: reminted }, GIG] })
        })
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 13,
            roster: toRoster(THREE_WAY),
            relay: relayDescriptor({ selfPid: '1', relays: [GRU, GIG] })
        })
    )

    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 1)
    assert.deepEqual(relays?.endpoints[0].rawToken, reminted)
})

test('a new round trip alone, the relays and credentials unchanged, dials nothing new', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GRU, GIG] }) })
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            relay: relayDescriptor({ selfPid: '1', relays: [{ ...GRU, rtt: 99 }, GIG] })
        })
    )

    // Both relays already have legs; the relay layer follows whichever delivers.
    assert.equal(relaysPublished(harness.link).at(-1)?.generation, 1)
})

test('a reissue moving to relays not held publishes them as the next generation', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GRU] }) })
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GIG, LIS] }) })
    )

    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 2)
    assert.deepEqual(
        [...new Set(relays?.endpoints.map((endpoint) => endpoint.name))],
        ['gig4c02', 'lis1c01']
    )
})

test('a reissue with nothing dialable publishes no relays', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    const published = relaysPublished(harness.link).length

    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            relay: relayDescriptor({ selfPid: '1', relays: [GRU, GIG], dialable: false })
        })
    )

    assert.equal(relaysPublished(harness.link).length, published)
})

test("a participant's transport carrying a new relay is followed on a group call", async () => {
    const harness = await createSession({ relayData: offerRelayData() })

    await harness.session.handleCallTransport({
        tag: 'call',
        attrs: { from: PEER_DEVICE },
        content: [
            {
                tag: 'transport',
                attrs: { 'call-id': ID, 'call-creator': PEER_DEVICE },
                content: [relayDescriptor({ selfPid: '1', relays: [GIG] })]
            }
        ]
    })

    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 1)
    assert.equal(relays?.endpoints[0].name, 'gig4c02')

    // A transport repeating the relay already followed changes nothing.
    await harness.session.handleCallTransport({
        tag: 'call',
        attrs: { from: THIRD_DEVICE },
        content: [
            {
                tag: 'transport',
                attrs: { 'call-id': ID, 'call-creator': PEER_DEVICE },
                content: [relayDescriptor({ selfPid: '1', relays: [GIG] })]
            }
        ]
    })
    assert.equal(relaysPublished(harness.link).at(-1)?.generation, 1)
})

test('the relay in the roster that connects our call moves the media, before it starts', async () => {
    const harness = await placedGroupCall()
    const joined = PLACED.map((entry) =>
        entry.jid === PEER ? { ...entry, state: CONNECTED } : entry
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 13,
            roster: toRoster(joined),
            relay: relayDescriptor({ selfPid: '0', relays: [GRU, GIG] })
        })
    )

    const relaysAt = harness.link.updates.findIndex((update) => update.relays?.generation === 1)
    const acceptedAt = harness.link.updates.findIndex((update) => update.accepted === true)
    assert.ok(relaysAt >= 0, 'the reissued relay is adopted')
    assert.ok(acceptedAt > relaysAt, 'and the media starts on it')
    assert.deepEqual(
        relaysPublished(harness.link)
            .at(-1)
            ?.endpoints.map((endpoint) => endpoint.transport),
        ['raw-udp', 'raw-udp', 'raw-udp', 'raw-udp']
    )
})

interface TokenedRelay {
    readonly relay: RelaySpec
    readonly tokenId: string
    readonly authTokenId?: string
}

/** A reissued `<relay>` whose `<te2>`s name their token and auth token by id, as the wire does. */
function tokenedDescriptor(spec: {
    readonly selfPid: string
    readonly tokens: Readonly<Record<string, Uint8Array>>
    readonly authTokens?: Readonly<Record<string, Uint8Array>>
    readonly relays: readonly TokenedRelay[]
}): BinaryNode {
    const content: BinaryNode[] = [{ tag: 'key', attrs: {}, content: 'REISSUEDRELAYKEY' }]
    for (const [id, token] of Object.entries(spec.tokens)) {
        content.push({ tag: 'token', attrs: { id }, content: token })
    }
    for (const [id, token] of Object.entries(spec.authTokens ?? {})) {
        content.push({ tag: 'auth_token', attrs: { id }, content: token })
    }
    spec.relays.forEach(({ relay, tokenId, authTokenId }, index) => {
        content.push({
            tag: 'te2',
            attrs: {
                relay_name: relay.name,
                relay_id: String(index),
                token_id: tokenId,
                ...(authTokenId ? { auth_token_id: authTokenId } : {}),
                ...(relay.rtt !== undefined ? { c2r_rtt: String(relay.rtt) } : {})
            },
            content: dualStack(relay)
        })
    })
    return { tag: 'relay', attrs: { self_pid: spec.selfPid }, content }
}

test('a reissue carrying an auth token takes the ordinary path, its credentials carried', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    const token = Uint8Array.of(0x71, 0x72)
    const authToken = Uint8Array.of(0xe1, 0xe2, 0xe3)

    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            relay: tokenedDescriptor({
                selfPid: '0',
                tokens: { '0': token },
                authTokens: { '0': authToken },
                relays: [{ relay: GRU, tokenId: '0', authTokenId: '0' }]
            })
        })
    )

    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 1)
    assert.equal(relays?.endpoints.length, 2)
    for (const endpoint of relays?.endpoints ?? []) {
        assert.equal(endpoint.transport, undefined, 'ice with its auth token, as on a 1:1 call')
        assert.ok(endpoint.authToken)
        assert.deepEqual(endpoint.rawToken, token)
        assert.deepEqual(endpoint.rawAuthToken, authToken)
        assert.equal(endpoint.authTokenId, '0')
    }
})

test('each reissue dials with the token its own token_id names, the newest winning', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    const decoy = Uint8Array.of(0x00)
    const first = Uint8Array.of(0x11)
    const second = Uint8Array.of(0x22)

    // tid 13: the elected relay names token 1.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            relay: tokenedDescriptor({
                selfPid: '0',
                tokens: { '0': decoy, '1': first },
                relays: [
                    { relay: GRU, tokenId: '1' },
                    { relay: GIG, tokenId: '0' }
                ]
            })
        })
    )
    let relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 1)
    assert.deepEqual(
        relays?.endpoints.map((endpoint) => [endpoint.name, endpoint.rawToken]),
        [
            ['gru2c01', first],
            ['gru2c01', first],
            ['gig4c02', decoy],
            ['gig4c02', decoy]
        ]
    )

    // tid 14: the same relay at the same address now names token 0, a different token.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            relay: tokenedDescriptor({
                selfPid: '0',
                tokens: { '0': second, '1': decoy },
                relays: [
                    { relay: GRU, tokenId: '0' },
                    { relay: GIG, tokenId: '1' }
                ]
            })
        })
    )
    relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 2)
    assert.deepEqual(
        relays?.endpoints.map((endpoint) => [endpoint.name, endpoint.rawToken]),
        [
            ['gru2c01', second],
            ['gru2c01', second],
            ['gig4c02', decoy],
            ['gig4c02', decoy]
        ]
    )

    // The same descriptor once more: nothing to redial.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            relay: tokenedDescriptor({
                selfPid: '0',
                tokens: { '0': second, '1': decoy },
                relays: [
                    { relay: GRU, tokenId: '0' },
                    { relay: GIG, tokenId: '1' }
                ]
            })
        })
    )
    assert.equal(relaysPublished(harness.link).at(-1)?.generation, 2)
})

test('a self_pid of 0 is a real pid: published as 0, and told apart from no pid', async () => {
    const harness = await createSession({ relayData: { ...offerRelayData(), selfPid: undefined } })

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '0', relays: [GRU, GIG] }) })
    )
    let relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 1)
    assert.equal(relays?.selfPid, 0)
    assert.equal(relays?.peerPid, 0)
    assert.equal(harness.call.relayData?.selfPid, 0)

    // The same descriptor with pid 0 again is a repeat, not a change.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '0', relays: [GRU, GIG] }) })
    )
    relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 1)
})

test('a re-rung group offer with no relay takes the one the ack of our accept brings', async () => {
    const harness = await createSession()
    await harness.session.acceptCall()
    assert.equal(harness.link.plan.relays, null, 'nothing to dial yet')

    await harness.session.handleCallAck({
        tag: 'ack',
        attrs: { class: 'call', type: 'accept', from: `${ID}@call` },
        content: [relayDescriptor({ selfPid: '2', relays: [GRU] })]
    })

    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 1)
    assert.equal(relays?.selfPid, 2)

    // A 1:1 accept ack is left alone, as before.
    const plain = await createSession({ group: false, relayData: offerRelayData() })
    const before = relaysPublished(plain.link).length
    await plain.session.handleCallAck({
        tag: 'ack',
        attrs: { class: 'call', type: 'accept' },
        content: [relayDescriptor({ selfPid: '2', relays: [GRU] })]
    })
    assert.equal(relaysPublished(plain.link).length, before)
})
