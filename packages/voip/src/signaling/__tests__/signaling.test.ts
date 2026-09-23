import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { CallState, EndCallReason, type WaVoipDeps } from '../../types.js'
import {
    buildAcceptStanza,
    buildRejectStanza,
    buildRelaylatencyForwardStanza,
    buildTerminateStanza,
    extractNodeInfo,
    extractRelayEndpoints,
    generateCallId,
    generateCallStanzaId,
    needsDecryption
} from '../signaling.js'

test('generateCallId / generateCallStanzaId produce 32-char uppercase hex', () => {
    for (const id of [generateCallId(), generateCallStanzaId()]) {
        assert.match(id, /^[0-9A-F]{32}$/)
    }
})

test('buildTerminateStanza targets the peer device JID with a terminate payload', () => {
    const node = buildTerminateStanza('12345:7@s.whatsapp.net', 'CALLID', '12345@s.whatsapp.net')
    assert.equal(node.tag, 'call')
    assert.equal(node.attrs.to, '12345:7@s.whatsapp.net')
    const inner = (
        node.content as unknown as Array<{ tag: string; attrs: Record<string, string> }>
    )[0]
    assert.equal(inner.tag, 'terminate')
    assert.equal(inner.attrs['call-id'], 'CALLID')
})

test('buildRejectStanza emits a reject payload', () => {
    const node = buildRejectStanza('12345@lid', 'CALLID', '12345@lid')
    const inner = (node.content as unknown as Array<{ tag: string }>)[0]
    assert.equal(inner.tag, 'reject')
})

const CALLER_DEVICE_JID = '50062877036657:76@lid'

function createAcceptDeps(): WaVoipDeps {
    return {
        authClient: {
            getCurrentCredentials: () => ({
                meJid: '1111111111@lid',
                meLid: '1111111111@lid',
                signedIdentity: { details: new Uint8Array([1, 2, 3]) }
            })
        },
        signalProtocol: {
            encryptMessage: async () => ({
                type: 'pkmsg',
                ciphertext: new Uint8Array([1, 2, 3])
            })
        },
        messageDispatch: {
            syncSignalSession: async () => undefined
        }
    } as unknown as WaVoipDeps
}

async function buildAccept(isVideo = false): Promise<BinaryNode> {
    return buildAcceptStanza(
        createAcceptDeps(),
        'CALLID',
        CALLER_DEVICE_JID,
        CALLER_DEVICE_JID,
        isVideo
    )
}

test('buildAcceptStanza ships no enc and no device-identity', async () => {
    const accept = ((await buildAccept()).content as BinaryNode[])[0]
    assert.equal(accept.tag, 'accept')

    const tags = (accept.content as BinaryNode[]).map((child) => child.tag)
    assert.equal(tags.includes('enc'), false)
    assert.equal(tags.includes('device-identity'), false)
})

test('buildAcceptStanza matches the acked accept: audio and net only', async () => {
    const accept = ((await buildAccept()).content as BinaryNode[])[0]
    const children = accept.content as BinaryNode[]

    const audio = children.find((child) => child.tag === 'audio')
    assert.deepEqual(audio?.attrs, { enc: 'opus', rate: '16000' })

    const net = children.find((child) => child.tag === 'net')
    assert.equal(net?.attrs.medium, '3')

    const tags = children.map((child) => child.tag)
    assert.equal(tags.includes('encopt'), false)
    assert.equal(tags.includes('enc'), false)
    assert.equal(tags.includes('device-identity'), false)
    assert.deepEqual(tags, ['audio', 'net'])
})

test('buildAcceptStanza addresses the caller device jid with its suffix', async () => {
    const node = await buildAccept()
    assert.equal(node.attrs.to, CALLER_DEVICE_JID)

    const accept = (node.content as BinaryNode[])[0]
    assert.equal(accept.attrs['call-id'], 'CALLID')
    assert.equal(accept.attrs['call-creator'], CALLER_DEVICE_JID)
})

test('buildAcceptStanza advertises h.264 on a video accept', async () => {
    const accept = ((await buildAccept(true)).content as BinaryNode[])[0]
    const video = (accept.content as BinaryNode[]).find((child) => child.tag === 'video')
    assert.equal(video?.attrs.enc, 'h.264')
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

test('buildTerminateStanza includes reason and duration attributes', () => {
    const node = buildTerminateStanza('p:0@lid', 'CID', 'creator@lid', 1500, 'accepted_elsewhere')
    const inner = (node.content as BinaryNode[])[0]
    assert.equal(inner.attrs.reason, 'accepted_elsewhere')
    assert.equal(inner.attrs.duration, '1500')
    assert.equal(inner.attrs.audio_duration, '1500')
})

test('buildRelaylatencyForwardStanza wraps te nodes and destinations under the user jid', () => {
    const teNodes: BinaryNode[] = [{ tag: 'te', attrs: { latency: '1' }, content: undefined }]
    const node = buildRelaylatencyForwardStanza(
        '12345:7@s.whatsapp.net',
        'CID',
        'creator@lid',
        teNodes,
        ['a@lid', 'b@lid']
    )

    assert.equal(node.tag, 'call')
    assert.equal(node.attrs.to, '12345@s.whatsapp.net')

    const relaylatency = (node.content as BinaryNode[])[0]
    assert.equal(relaylatency.tag, 'relaylatency')
    assert.equal(relaylatency.attrs['call-id'], 'CID')

    const children = relaylatency.content as BinaryNode[]
    assert.equal(children[0].tag, 'te')
    const destination = children[children.length - 1]
    assert.equal(destination.tag, 'destination')
    assert.deepEqual(
        (destination.content as BinaryNode[]).map((child) => child.attrs.jid),
        ['a@lid', 'b@lid']
    )
})

test('extractNodeInfo reads the inner call tag and ids', () => {
    const node: BinaryNode = {
        tag: 'call',
        attrs: { from: 'peer:0@lid', platform: 'web', version: '2.3' },
        content: [{ tag: 'offer', attrs: { 'call-id': 'CID' }, content: undefined }]
    }
    const info = extractNodeInfo(node)
    assert.ok(info)
    assert.equal(info.tag, 'offer')
    assert.equal(info.callId, 'CID')
    assert.equal(info.peerJid, 'peer:0@lid')
    assert.equal(info.peerPlatform, 'web')
})

test('extractNodeInfo returns null when there is no inner node', () => {
    assert.equal(extractNodeInfo({ tag: 'call', attrs: {}, content: undefined }), null)
})

test('extractRelayEndpoints collects direct and wrapped relays sorted by rtt', () => {
    const node: BinaryNode = {
        tag: 'transport',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: { ip: '1.1.1.1', port: '3480', token: 't1', 'c2r-rtt': '50' },
                content: undefined
            },
            {
                tag: 'relays',
                attrs: {},
                content: [
                    {
                        tag: 'relay',
                        attrs: { ip: '2.2.2.2', port: '3481', token: 't2', 'c2r-rtt': '10' },
                        content: undefined
                    }
                ]
            }
        ]
    }

    const relays = extractRelayEndpoints(node)
    assert.equal(relays.length, 2)
    assert.equal(relays[0].ip, '2.2.2.2')
    assert.equal(relays[0].port, 3481)
    assert.equal(relays[1].ip, '1.1.1.1')
})

test('extractRelayEndpoints drops relays missing ip or token', () => {
    const node: BinaryNode = {
        tag: 'transport',
        attrs: {},
        content: [
            { tag: 'relay', attrs: { ip: '1.1.1.1' }, content: undefined },
            { tag: 'relay', attrs: { token: 'only-token' }, content: undefined }
        ]
    }
    assert.deepEqual(extractRelayEndpoints(node), [])
})
