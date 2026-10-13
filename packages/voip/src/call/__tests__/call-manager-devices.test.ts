import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import type { WaCallMediaPlan } from '@zapo-js/voip-media'

import { derivePerJidSrtpKey } from '../../crypto/encryption.js'
import { generateSecureSsrc, WA_SSRC_SLOT, WA_VIDEO_CALL_SSRC_SLOTS } from '../../crypto/ssrc.js'
import { routeCallStanza } from '../../signaling/bridge.js'
import { WaCallManager } from '../WaCallManager.js'

import {
    acceptRelayNode,
    buildAcceptNode,
    buildOfferAckNode,
    buildOfferNode,
    createMockDeps,
    findByInnerTag
} from './_call-manager-fixtures.js'

const VIDEO_OFFER_NODE: BinaryNode = { tag: 'video', attrs: { enc: 'h.264', dec: 'H264' } }

/** The plan a remote media host holds for the call right now. */
function planOf(manager: WaCallManager, callId: string): Partial<WaCallMediaPlan> {
    const snapshot = manager.getMediaSnapshot(callId)
    assert.ok(snapshot, 'the call publishes a media plan')
    return snapshot.plan
}

/** Every stream a call of this media type registers for the device, by slot. */
function streamsOf(callId: string, deviceJid: string, slots: readonly number[]): number[] {
    return slots.map((slot) => generateSecureSsrc(callId, deviceJid, slot))
}

test('the caller keys the peer streams on the device that accepted, not on the first companion', async () => {
    const answered = '2222222222:88@lid'
    const companion = '2222222222:87@lid'
    for (const isVideo of [false, true]) {
        const { deps, stores } = createMockDeps()
        const manager = new WaCallManager({
            deps,
            stores,
            maxConcurrentCalls: 1,
            mediaMode: 'remote'
        })
        const callId = await manager.startCall({ peerJid: '2222222222@lid', isVideo })
        await manager.handleCallAck(
            buildOfferAckNode(callId, ['2222222222:0@lid', companion, answered, '1111111111:3@lid'])
        )

        await routeCallStanza(manager, deps, buildAcceptNode(callId, answered, '1111111111@lid'))

        const label = isVideo ? 'video' : 'audio'
        const plan = planOf(manager, callId)
        assert.equal(plan.ssrcs?.peerAudio, generateSecureSsrc(callId, answered), label)
        assert.deepEqual(
            plan.ssrcs?.peerVideoStreams,
            streamsOf(callId, answered, [
                WA_SSRC_SLOT.VIDEO.MAIN,
                WA_SSRC_SLOT.VIDEO.FEC,
                WA_SSRC_SLOT.VIDEO.OOB_NACK
            ]),
            label
        )
        const callKey = manager.getCall(callId)?.encryptionKey
        assert.ok(callKey)
        assert.deepEqual(plan.keys?.recv, derivePerJidSrtpKey(callKey, answered), label)
        if (isVideo) {
            assert.deepEqual(
                plan.ssrcs?.peerStreams,
                streamsOf(callId, answered, WA_VIDEO_CALL_SSRC_SLOTS),
                label
            )
        }
    }
})

test('the caller takes the answering device and its pid from the accept participant', async () => {
    const answered = '2222222222:88@lid'
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1, mediaMode: 'remote' })
    const callId = await manager.startCall({ peerJid: '2222222222@lid', isVideo: true })
    await manager.handleCallAck(
        buildOfferAckNode(callId, ['2222222222:0@lid', '2222222222:87@lid', answered])
    )

    await routeCallStanza(
        manager,
        deps,
        buildAcceptNode(callId, '2222222222@lid', '1111111111@lid', [
            acceptRelayNode(answered, '3')
        ])
    )

    const plan = planOf(manager, callId)
    assert.equal(plan.ssrcs?.peerAudio, generateSecureSsrc(callId, answered))
    assert.deepEqual(plan.ssrcs?.peerStreams, streamsOf(callId, answered, WA_VIDEO_CALL_SSRC_SLOTS))
    assert.equal(manager.getCall(callId)?.relayData?.peerPid, 3)
})

test('an accept participant outside the called user is ignored, pid and all, for the sender', async () => {
    const answered = '2222222222:88@lid'
    for (const participant of ['3333333333:5@lid', '5511999990000:88@s.whatsapp.net']) {
        const { deps, stores } = createMockDeps()
        const manager = new WaCallManager({
            deps,
            stores,
            maxConcurrentCalls: 1,
            mediaMode: 'remote'
        })
        const callId = await manager.startCall({ peerJid: '2222222222@lid', isVideo: true })
        await manager.handleCallAck(
            buildOfferAckNode(callId, ['2222222222:0@lid', '2222222222:87@lid', answered])
        )

        await routeCallStanza(
            manager,
            deps,
            buildAcceptNode(callId, answered, '1111111111@lid', [acceptRelayNode(participant, '9')])
        )

        const plan = planOf(manager, callId)
        assert.equal(plan.ssrcs?.peerAudio, generateSecureSsrc(callId, answered), participant)
        assert.deepEqual(
            plan.ssrcs?.peerStreams,
            streamsOf(callId, answered, WA_VIDEO_CALL_SSRC_SLOTS),
            participant
        )
        assert.equal(manager.getCall(callId)?.relayData?.peerPid, 2, participant)
    }
})

test('an accept from the primary keys on it and sends accepted_elsewhere only to its companions', async () => {
    const primary = '2222222222:0@lid'
    const companions = ['2222222222:87@lid', '2222222222:88@lid']
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1, mediaMode: 'remote' })
    const callId = await manager.startCall({ peerJid: '2222222222@lid', isVideo: true })
    await manager.handleCallAck(
        buildOfferAckNode(callId, [primary, ...companions, '1111111111:3@lid'])
    )
    const before = sent.length

    await routeCallStanza(
        manager,
        deps,
        buildAcceptNode(callId, primary, '1111111111@lid', [acceptRelayNode(primary, '2')])
    )

    const plan = planOf(manager, callId)
    assert.equal(plan.ssrcs?.peerAudio, generateSecureSsrc(callId, primary))
    assert.deepEqual(plan.ssrcs?.peerStreams, streamsOf(callId, primary, WA_VIDEO_CALL_SSRC_SLOTS))
    const elsewhere = findByInnerTag(sent.slice(before), 'terminate')
        .filter((node) => (node.content as BinaryNode[])[0].attrs.reason === 'accepted_elsewhere')
        .map((node) => node.attrs.to)
    assert.deepEqual(elsewhere.sort(), [...companions].sort())
})

test('before any accept the caller subscribes every device of the peer, not one picked from the list', async () => {
    const devices = ['2222222222:0@lid', '2222222222:87@lid', '2222222222:88@lid']
    for (const isVideo of [false, true]) {
        const { deps, stores } = createMockDeps()
        const manager = new WaCallManager({
            deps,
            stores,
            maxConcurrentCalls: 1,
            mediaMode: 'remote'
        })
        const callId = await manager.startCall({ peerJid: '2222222222@lid', isVideo })

        await manager.handleCallAck(buildOfferAckNode(callId, [...devices, '1111111111:3@lid']))

        const label = isVideo ? 'video' : 'audio'
        const ssrcs = planOf(manager, callId).ssrcs
        for (const device of devices) {
            assert.ok(
                ssrcs?.peerStreams.includes(generateSecureSsrc(callId, device)),
                `${label} ${device}`
            )
            assert.ok(
                ssrcs?.peerAppData.includes(
                    generateSecureSsrc(callId, device, WA_SSRC_SLOT.APP_DATA.MAIN)
                ),
                `${label} ${device}`
            )
        }
        assert.notEqual(ssrcs?.peerAudio, generateSecureSsrc(callId, devices[1]), label)
    }
})

test('an incoming video call subscribes to the calling device, not to a companion of the caller', async () => {
    const caller = '2222222222:0@lid'
    const companions = ['2222222222:87@lid', '2222222222:88@lid']
    const { deps, stores } = createMockDeps()
    const sync = deps.signalDeviceSync as unknown as { syncDeviceList: () => Promise<unknown> }
    sync.syncDeviceList = async () => [{ deviceJids: [...companions, caller] }]
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1, mediaMode: 'remote' })
    const callId = 'CA11CA11000000000000000000000060'
    const companionStreams = new Set(
        companions.flatMap((jid) => streamsOf(callId, jid, WA_VIDEO_CALL_SSRC_SLOTS))
    )

    await routeCallStanza(
        manager,
        deps,
        buildOfferNode(callId, caller, undefined, [VIDEO_OFFER_NODE])
    )
    const ringing = planOf(manager, callId).ssrcs
    assert.equal(ringing?.peerAudio, generateSecureSsrc(callId, caller))
    assert.ok(ringing?.peerStreams.every((ssrc) => !companionStreams.has(ssrc)))

    await manager.acceptCall(callId)
    const accepted = planOf(manager, callId).ssrcs
    assert.equal(accepted?.peerAudio, generateSecureSsrc(callId, caller))
    assert.deepEqual(accepted?.peerStreams, streamsOf(callId, caller, WA_VIDEO_CALL_SSRC_SLOTS))
})
