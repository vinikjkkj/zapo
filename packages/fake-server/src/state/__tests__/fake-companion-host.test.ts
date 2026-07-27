import assert from 'node:assert/strict'
import test from 'node:test'

import { proto } from '../../transport/protos'
import { FakeCompanionHostState, readCompanionKeyIndex } from '../fake-companion-host'

const PRIMARY = { username: '5511999999999', jid: '5511999999999@s.whatsapp.net' }

function buildCompanion(deviceId: number, keyIndex: number) {
    return {
        deviceJid: `${PRIMARY.username}:${deviceId}@s.whatsapp.net`,
        deviceId,
        ref: `ref-${deviceId}`,
        keyIndex,
        deviceIdentityBytes: new Uint8Array([deviceId]),
        linkedAtSeconds: 1_700_000_000
    }
}

test('allocateDeviceId skips slots held by live companions', () => {
    const state = new FakeCompanionHostState()
    assert.equal(state.allocateDeviceId(), 1, 'the primary owns device 0')

    state.recordCompanion(buildCompanion(1, 1))
    assert.equal(state.allocateDeviceId(), 2)

    state.recordCompanion(buildCompanion(2, 2))
    assert.equal(state.allocateDeviceId(), 3)

    state.removeCompanions([buildCompanion(1, 1).deviceJid])
    assert.equal(state.allocateDeviceId(), 1, 'a freed slot is reusable')
})

test('removeCompanions reports only the devices it actually dropped', () => {
    const state = new FakeCompanionHostState()
    const companion = buildCompanion(1, 1)
    state.recordCompanion(companion)

    assert.deepEqual(state.removeCompanions(['5511999999999:9@s.whatsapp.net']), [])
    assert.deepEqual(state.removeCompanions([companion.deviceJid]), [companion.deviceJid])
    assert.deepEqual(state.linkedCompanions(), [])
})

test('listeners fire on link and revoke', () => {
    const state = new FakeCompanionHostState()
    const linked: string[] = []
    const revoked: string[][] = []
    state.onCompanionLinked((companion) => linked.push(companion.deviceJid))
    state.onCompanionsRevoked((jids) => revoked.push([...jids]))

    const companion = buildCompanion(1, 1)
    state.recordCompanion(companion)
    state.removeCompanions([companion.deviceJid])
    // A revoke that matches nothing must stay silent.
    state.removeCompanions([companion.deviceJid])

    assert.deepEqual(linked, [companion.deviceJid])
    assert.deepEqual(revoked, [[companion.deviceJid]])
})

test('bindPrimary exposes the account the session belongs to', () => {
    const state = new FakeCompanionHostState()
    assert.equal(state.primary, null)

    state.bindPrimary(PRIMARY)
    assert.deepEqual(state.primary, PRIMARY)
})

test('recordKeyIndexList decodes the indexes the primary declared valid', () => {
    const state = new FakeCompanionHostState()
    const details = proto.ADVKeyIndexList.encode({
        rawId: 7,
        timestamp: 1_700_000_000,
        currentIndex: 3,
        validIndexes: [0, 1, 3]
    }).finish()
    const bytes = proto.ADVSignedKeyIndexList.encode({
        details,
        accountSignature: new Uint8Array(64)
    }).finish()

    state.recordKeyIndexList(bytes, 1_700_000_000)

    const published = state.publishedKeyIndexList()
    assert.ok(published)
    assert.deepEqual([...published.validIndexes], [0, 1, 3])
    assert.equal(published.currentIndex, 3)
    assert.equal(published.timestampSeconds, 1_700_000_000)
})

test('recordKeyIndexList keeps undecodable bytes observable instead of throwing', () => {
    const state = new FakeCompanionHostState()
    state.recordKeyIndexList(new Uint8Array([0xff, 0xff, 0xff]), 5)

    const published = state.publishedKeyIndexList()
    assert.deepEqual([...(published?.validIndexes ?? [1])], [])
    assert.equal(published?.currentIndex, 0)
})

test('readCompanionKeyIndex unwraps the signed identity, or reports 0', () => {
    const details = proto.ADVDeviceIdentity.encode({
        rawId: 7,
        timestamp: 1_700_000_000,
        keyIndex: 4
    }).finish()
    const signed = proto.ADVSignedDeviceIdentity.encode({
        details,
        accountSignatureKey: new Uint8Array(32),
        accountSignature: new Uint8Array(64)
    }).finish()
    const wrapped = proto.ADVSignedDeviceIdentityHMAC.encode({
        details: signed,
        hmac: new Uint8Array(32)
    }).finish()

    assert.equal(readCompanionKeyIndex(wrapped), 4)
    assert.equal(readCompanionKeyIndex(new Uint8Array([0xff, 0xff])), 0)
})

test('allocateDeviceId reserves the slot so an overlapping link cannot reuse it', () => {
    const state = new FakeCompanionHostState()

    // Two links in flight before either records: the second must not be handed
    // the slot the first is about to take.
    assert.equal(state.allocateDeviceId(), 1)
    assert.equal(state.allocateDeviceId(), 2)

    state.recordCompanion(buildCompanion(1, 1))
    assert.equal(state.allocateDeviceId(), 3, 'recording clears only its own reservation')
})

test('releaseDeviceId frees a slot whose link never completed', () => {
    const state = new FakeCompanionHostState()
    const reserved = state.allocateDeviceId()

    state.releaseDeviceId(reserved)

    assert.equal(state.allocateDeviceId(), reserved)
})

test('bindPrimary keeps the account that claimed the session first', () => {
    const state = new FakeCompanionHostState()
    state.bindPrimary(PRIMARY)
    state.bindPrimary({ username: '5511888888888', jid: '5511888888888@s.whatsapp.net' })

    assert.deepEqual(state.primary, PRIMARY, 'a later login must not retarget device jids')
})
