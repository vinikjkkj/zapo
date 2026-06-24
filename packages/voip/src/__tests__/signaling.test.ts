import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    buildOfferStanza,
    buildRejectStanza,
    buildTerminateStanza,
    createCallAck,
    generateCallId,
    generateCallStanzaId,
    needsDecryption
} from '../signaling.js'
import { CallState, EndCallReason } from '../types.js'
import type { VoipSocket } from '../voip-socket.js'

function stubSocket(overrides: Partial<VoipSocket> = {}): VoipSocket {
    return {
        getCredentials: () => ({
            meJid: '111@s.whatsapp.net',
            meLid: '222@lid',
            signedIdentity: { details: new Uint8Array([1]) }
        }),
        sendNode: async () => {},
        query: async () => ({ tag: 'iq', attrs: {} }),
        encryptMessage: async () => ({ type: 'pkmsg', ciphertext: new Uint8Array([9]) }),
        encryptMessagesBatch: async (requests) =>
            requests.map((_, index) => ({
                type: index === 0 ? 'pkmsg' : 'msg',
                ciphertext: new Uint8Array([index])
            })),
        decryptMessage: async () => new Uint8Array([7]),
        syncSignalSession: async () => {},
        syncDeviceList: async () => [
            {
                jid: '5511999@s.whatsapp.net',
                deviceJids: ['5511999:0@s.whatsapp.net', '5511999:1@s.whatsapp.net']
            }
        ],
        queryLidsByPhoneJids: async (jids) =>
            jids.map((jid) => ({ phoneJid: jid, lidJid: '333@lid' })),
        getPrivacyToken: async () => new Uint8Array([0xab]),
        ...overrides
    }
}

test('generateCallId / generateCallStanzaId produce 32-char uppercase hex', () => {
    for (const id of [generateCallId(), generateCallStanzaId()]) {
        assert.match(id, /^[0-9A-F]{32}$/)
    }
})

test('buildTerminateStanza targets a device-less JID with a terminate payload', () => {
    const node = buildTerminateStanza('12345:7@s.whatsapp.net', 'CALLID', '12345@s.whatsapp.net')
    assert.equal(node.tag, 'call')
    assert.equal(node.attrs.to, '12345@s.whatsapp.net')
    const inner = (node.content as Array<{ tag: string; attrs: Record<string, string> }>)[0]
    assert.equal(inner.tag, 'terminate')
    assert.equal(inner.attrs['call-id'], 'CALLID')
})

test('buildRejectStanza emits a reject payload', () => {
    const node = buildRejectStanza('12345@lid', 'CALLID', '12345@lid')
    const inner = (node.content as ReadonlyArray<{ tag: string }>)[0]
    assert.equal(inner.tag, 'reject')
})

test('createCallAck builds a class=call ack', () => {
    const ack = createCallAck('MSGID', '12345@lid', 'offer')
    assert.deepEqual(ack, {
        tag: 'ack',
        attrs: { id: 'MSGID', to: '12345@lid', class: 'call', type: 'offer' }
    })
})

test('needsDecryption only flags encrypted payload tags', () => {
    assert.equal(needsDecryption('accept'), true)
    assert.equal(needsDecryption('preaccept'), true)
    assert.equal(needsDecryption('offer'), false)
    assert.equal(needsDecryption('terminate'), false)
})

test('enums expose the documented call states', () => {
    assert.equal(CallState.Active, 'active')
    assert.equal(EndCallReason.UserEnded, 'user_ended')
})

test('buildOfferStanza encrypts per device and assembles the offer', async () => {
    const node = await buildOfferStanza(
        stubSocket(),
        'CALLID',
        new Uint8Array(32),
        '5511999@s.whatsapp.net',
        [],
        false
    )

    assert.equal(node.tag, 'call')
    const offer = (
        node.content as Array<{ tag: string; attrs: Record<string, string>; content: unknown }>
    )[0]
    assert.equal(offer.tag, 'offer')
    assert.equal(offer.attrs['call-id'], 'CALLID')
    assert.equal(offer.attrs['call-creator'], '222@lid')

    const children = offer.content as Array<{ tag: string; content: unknown }>
    const destination = children.find((c) => c.tag === 'destination')
    assert.ok(destination, 'destination node present')

    const tos = destination.content as Array<{
        tag: string
        attrs: Record<string, string>
        content: unknown
    }>
    assert.equal(tos.length, 2, 'one <to> per device')
    assert.equal(tos[0].tag, 'to')
    const enc = (tos[0].content as Array<{ tag: string; attrs: Record<string, string> }>)[0]
    assert.equal(enc.tag, 'enc')
    assert.equal(enc.attrs.v, '2')
    assert.equal(enc.attrs.type, 'pkmsg')

    // pkmsg in the batch => device-identity is attached; tctoken => privacy node
    assert.ok(children.some((c) => c.tag === 'device-identity'))
    assert.ok(children.some((c) => c.tag === 'privacy'))
})
