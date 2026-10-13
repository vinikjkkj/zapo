import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import {
    buildEncRekeyReceiptStanza,
    buildEncRekeyStanza,
    buildHeartbeatStanza,
    buildPeerStateStanza,
    WA_PEER_STATE
} from '../group-call.js'

import { CALLER_DEVICE_JID, createOfferDeps } from './_offer-deps.js'

test('an enc_rekey receipt answers the stanza id and names the call', () => {
    const node = buildEncRekeyReceiptStanza(
        CALLER_DEVICE_JID,
        'STANZA',
        'CALLID',
        '1111111111@lid',
        '2222222222@lid'
    )

    assert.equal(node.tag, 'receipt')
    assert.equal(node.attrs.to, CALLER_DEVICE_JID)
    assert.equal(node.attrs.id, 'STANZA')
    assert.equal(node.attrs.from, '2222222222@lid')
    const child = (node.content as BinaryNode[])[0]
    assert.equal(child.tag, 'enc_rekey')
    assert.deepEqual(Object.keys(child.attrs), ['call-creator', 'call-id'])
    assert.deepEqual(child.attrs, { 'call-creator': '1111111111@lid', 'call-id': 'CALLID' })
})

test('an enc_rekey goes to the device it keys, echoing the transaction that asked for it', async () => {
    const node = await buildEncRekeyStanza(createOfferDeps(), {
        callId: 'CALLID',
        callCreator: '1111111111@lid',
        transactionId: 13,
        peerDeviceJid: CALLER_DEVICE_JID,
        callKey: new Uint8Array(32).fill(1)
    })

    assert.equal(node.attrs.to, CALLER_DEVICE_JID)
    const rekey = (node.content as BinaryNode[])[0]
    assert.equal(rekey.tag, 'enc_rekey')
    assert.deepEqual(rekey.attrs, {
        'call-id': 'CALLID',
        'call-creator': '1111111111@lid',
        'transaction-id': '13'
    })
    const children = rekey.content as BinaryNode[]
    // A first message of its session carries our identity, as on the 1:1 offer.
    assert.deepEqual(
        children.map((child) => child.tag),
        ['encopt', 'enc', 'device-identity']
    )
    assert.deepEqual(children[0].attrs, { keygen: '2' })
    assert.deepEqual(children[1].attrs, { v: '2', type: 'pkmsg', count: '0' })
})

/** What every connected member of a group call sends the call every 10 s. */
test('the heartbeat goes to the call itself, naming it and nothing else', () => {
    const callId = '0066C98AE4BB07A4C97A575B7D8A3ACA'
    const node = buildHeartbeatStanza(callId, '50062877036657:87@lid')

    assert.equal(node.attrs.to, `${callId}@call`)
    assert.equal(typeof node.attrs.id, 'string')
    assert.deepEqual(node.content, [
        {
            tag: 'heartbeat',
            attrs: { 'call-id': callId, 'call-creator': '50062877036657:87@lid' }
        }
    ])
})

/** The report a group member sent about a peer whose media stopped, attribute by attribute. */
test('a peer state report names the peer by its bare account, stamped in milliseconds', () => {
    const callId = '005CD73BCDC821735473321395775697'
    const node = buildPeerStateStanza(
        callId,
        '50062877036657:87@lid',
        '76373846659268:3@lid',
        WA_PEER_STATE.Invisible,
        1791858101243
    )

    assert.equal(node.attrs.to, `${callId}@call`)
    assert.deepEqual(node.content, [
        {
            tag: 'peer_state',
            attrs: {
                'call-id': callId,
                'call-creator': '50062877036657:87@lid',
                t: '1791858101243'
            },
            content: [{ tag: 'user', attrs: { state: 'invisible', jid: '76373846659268@lid' } }]
        }
    ])

    const before = Date.now()
    const visible = buildPeerStateStanza(
        callId,
        'c@lid',
        '76373846659268@lid',
        WA_PEER_STATE.Visible
    )
    const report = (visible.content as BinaryNode[])[0]
    assert.equal((report.content as BinaryNode[])[0].attrs.state, 'visible')
    const t = Number(report.attrs.t)
    assert.ok(t >= before && t <= Date.now(), 'epoch milliseconds, not seconds')
})
