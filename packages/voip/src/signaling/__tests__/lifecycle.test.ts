import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { CallState, EndCallReason, type WaVoipDeps, type WaVoipStores } from '../../types.js'
import {
    buildAcceptStanza,
    buildOfferStanza,
    buildPreacceptStanza,
    buildRejectStanza,
    buildTerminateStanza,
    needsDecryption,
    parseGroupJidAttr,
    parseJoinableAttr,
    parseReRingAttr
} from '../lifecycle.js'

import { CALLER_DEVICE_JID, createOfferDeps } from './_offer-deps.js'

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

test('a reject goes to the caller device, not to its bare user', () => {
    const node = buildRejectStanza('50062877036657:76@lid', 'CALLID', '50062877036657:76@lid')
    assert.equal(
        node.attrs.to,
        '50062877036657:76@lid',
        'a companion caller keeps ringing on a reject addressed to its bare user'
    )
})

test('buildRejectStanza emits a reject payload', () => {
    const node = buildRejectStanza('12345@lid', 'CALLID', '12345@lid')
    const inner = (node.content as unknown as Array<{ tag: string }>)[0]
    assert.equal(inner.tag, 'reject')
})

test('a group reject goes to the call itself, with count 0', () => {
    const node = buildRejectStanza(
        '50062877036657:87@lid',
        '00CAB48DC231B97E24B5B26470C2F752',
        '50062877036657:87@lid',
        true
    )

    assert.equal(node.attrs.to, '00CAB48DC231B97E24B5B26470C2F752@call')
    const inner = (node.content as BinaryNode[])[0]
    assert.equal(inner.tag, 'reject')
    assert.deepEqual(inner.attrs, {
        'call-id': '00CAB48DC231B97E24B5B26470C2F752',
        'call-creator': '50062877036657:87@lid',
        count: '0'
    })

    const oneToOne = (buildRejectStanza('a:1@lid', 'CID', 'a:1@lid').content as BinaryNode[])[0]
    assert.equal(oneToOne.attrs.count, undefined)
})

test('a group preaccept goes to the call itself, with the 1:1 children', () => {
    const callId = '00CAB48DC231B97E24B5B26470C2F752'
    const group = buildPreacceptStanza(
        '50062877036657:87@lid',
        callId,
        '50062877036657:87@lid',
        true
    )
    const oneToOne = buildPreacceptStanza('50062877036657:87@lid', callId, '50062877036657:87@lid')

    assert.equal(group.attrs.to, `${callId}@call`)
    assert.equal(oneToOne.attrs.to, '50062877036657:87@lid')
    const groupInner = (group.content as BinaryNode[])[0]
    const oneToOneInner = (oneToOne.content as BinaryNode[])[0]
    assert.equal(groupInner.tag, 'preaccept')
    assert.deepEqual(groupInner.attrs, oneToOneInner.attrs)
    assert.deepEqual(groupInner.content, oneToOneInner.content)
    assert.deepEqual(
        (groupInner.content as BinaryNode[]).map((child) => [child.tag, child.attrs]),
        [
            ['audio', { enc: 'opus', rate: '16000' }],
            ['encopt', { keygen: '2' }],
            ['capability', { ver: '1' }]
        ]
    )
})

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

test('a group accept is addressed to the call itself and carries encopt', async () => {
    const node = await buildAcceptStanza(
        createAcceptDeps(),
        'CALLID',
        CALLER_DEVICE_JID,
        CALLER_DEVICE_JID,
        false,
        true
    )
    assert.equal(node.attrs.to, 'CALLID@call')

    const accept = (node.content as BinaryNode[])[0]
    assert.equal(accept.attrs['call-id'], 'CALLID')
    assert.equal(accept.attrs['call-creator'], CALLER_DEVICE_JID)

    const children = accept.content as BinaryNode[]
    assert.deepEqual(
        children.map((child) => child.tag),
        ['audio', 'net', 'encopt']
    )
    assert.deepEqual(children.find((child) => child.tag === 'encopt')?.attrs, { keygen: '2' })
    assert.equal(children.find((child) => child.tag === 'net')?.attrs.medium, '3')
})

test('buildAcceptStanza advertises h.264 on a video accept', async () => {
    const accept = ((await buildAccept(true)).content as BinaryNode[])[0]
    const video = (accept.content as BinaryNode[]).find((child) => child.tag === 'video')
    assert.equal(video?.attrs.enc, 'h.264')
})

function createOfferStores(): WaVoipStores {
    return {
        privacyToken: {
            getByJid: async () => undefined
        }
    } as unknown as WaVoipStores
}

async function buildOffer(isVideo: boolean): Promise<BinaryNode> {
    return buildOfferStanza(
        createOfferDeps(),
        createOfferStores(),
        'CALLID',
        new Uint8Array([9, 9, 9]),
        CALLER_DEVICE_JID,
        isVideo
    )
}

test('a 1:1 offer addresses the peer and keeps its children in order', async () => {
    const node = await buildOffer(false)
    assert.equal(node.attrs.to, CALLER_DEVICE_JID)

    const offer = (node.content as BinaryNode[])[0]
    assert.deepEqual(offer.attrs, { 'call-id': 'CALLID', 'call-creator': '1111111111@lid' })
    assert.deepEqual(
        (offer.content as BinaryNode[]).map((child) => child.tag),
        ['audio', 'audio', 'net', 'capability', 'destination', 'encopt', 'device-identity']
    )

    const videoOffer = ((await buildOffer(true)).content as BinaryNode[])[0]
    assert.deepEqual(
        (videoOffer.content as BinaryNode[]).map((child) => child.tag),
        ['audio', 'audio', 'video', 'net', 'capability', 'destination', 'encopt', 'device-identity']
    )
})

test('buildAcceptStanza advertises the same dec as buildOfferStanza on a video call', async () => {
    const offer = ((await buildOffer(true)).content as BinaryNode[])[0]
    const offerVideo = (offer.content as BinaryNode[]).find((child) => child.tag === 'video')

    const accept = ((await buildAccept(true)).content as BinaryNode[])[0]
    const acceptVideo = (accept.content as BinaryNode[]).find((child) => child.tag === 'video')

    assert.ok(offerVideo?.attrs.dec, 'offer video node is missing dec')
    assert.ok(acceptVideo?.attrs.dec, 'accept video node is missing dec')
    assert.equal(acceptVideo?.attrs.dec, offerVideo?.attrs.dec)
    assert.equal(acceptVideo?.attrs.enc, offerVideo?.attrs.enc)
})

/** Whether the `<capability>` blob sets `index`: LSB-first over the five mask bytes. */
function hasCapability(blob: Uint8Array, index: number): boolean {
    return (blob[2 + (index >> 3)] & (1 << (index & 7))) !== 0
}

test('no offer announces MLow RED or its separate payload type, which this side cannot decode', async () => {
    for (const isVideo of [false, true]) {
        const offer = ((await buildOffer(isVideo)).content as BinaryNode[])[0]
        const capability = (offer.content as BinaryNode[]).find(
            (child) => child.tag === 'capability'
        )
        const blob = capability?.content
        assert.ok(blob instanceof Uint8Array)
        assert.equal(blob[0], 1)
        assert.equal(blob[1], 5)
        assert.equal(hasCapability(blob, 36), false, 'bit 36 is enable_mlow_red')
        assert.equal(hasCapability(blob, 38), false, 'bit 38 is enable_mlow_separate_pt_tx')
        assert.equal(hasCapability(blob, isVideo ? 30 : 24), true, 'the media bit stays')
    }
})

test('the preaccept does not announce MLow RED either', () => {
    const preaccept = (
        buildPreacceptStanza('peer@lid', 'CALL', 'peer@lid').content as BinaryNode[]
    )[0]
    const blob = (preaccept.content as BinaryNode[]).find(
        (child) => child.tag === 'capability'
    )?.content
    assert.ok(blob instanceof Uint8Array)
    assert.equal(hasCapability(blob, 36), false)
    assert.equal(hasCapability(blob, 24), true)
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

function offerNode(attrs: Record<string, string>): BinaryNode {
    return { tag: 'offer', attrs: { 'call-id': 'CID', ...attrs }, content: undefined }
}

test('parseJoinableAttr reads the flag an offer carries, and its absence', () => {
    assert.equal(parseJoinableAttr(offerNode({ joinable: '1' })), true)
    assert.equal(parseJoinableAttr(offerNode({ joinable: 'true' })), true)
    assert.equal(parseJoinableAttr(offerNode({ joinable: '0' })), false)
    assert.equal(parseJoinableAttr(offerNode({})), false)
})

test('parseReRingAttr reads re-ring on an offer, and its absence', () => {
    assert.equal(parseReRingAttr(offerNode({ 're-ring': '1', joinable: '1' })), true)
    assert.equal(parseReRingAttr(offerNode({ 're-ring': '0' })), false)
    assert.equal(parseReRingAttr(offerNode({ joinable: '1' })), false)
})

test('parseGroupJidAttr reads either spelling and reports no group as null', () => {
    const groupJid = '120363000000000000@g.us'

    assert.equal(parseGroupJidAttr(offerNode({ 'group-jid': groupJid })), groupJid)
    assert.equal(parseGroupJidAttr(offerNode({ group_jid: groupJid })), groupJid)
    assert.equal(parseGroupJidAttr(offerNode({ 'group-jid': '' })), null)
    // Joinable and group are independent: an ad-hoc joinable call names no group.
    assert.equal(parseGroupJidAttr(offerNode({ joinable: '1' })), null)
})
