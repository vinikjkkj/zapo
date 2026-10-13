import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import {
    createSession,
    groupUpdate,
    innerOf,
    PEER_DEVICE,
    PEER_SECOND_DEVICE,
    SELF,
    sentWithTag,
    THIRD,
    THIRD_DEVICE,
    THREE_WAY,
    toRoster
} from './_group-session.js'

test('a rekey asked of us mints a key and sends it once per device of each connected peer', async () => {
    const harness = await createSession()

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 13, rekey: true, roster: toRoster(THREE_WAY) })
    )

    const rekeys = sentWithTag(harness, 'enc_rekey')
    assert.deepEqual(
        rekeys.map((node) => node.attrs.to),
        [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE]
    )
    for (const node of rekeys) {
        const inner = innerOf(node)
        assert.equal(inner.attrs['transaction-id'], '13')
        assert.deepEqual(
            (inner.content as BinaryNode[]).map((child) => child.tag),
            ['encopt', 'enc']
        )
    }
    assert.ok(harness.call.encryptionKey, 'the key is ours, installed')
    assert.ok(harness.link.plan.keys)
})

test('the fan-out skips who has not accepted the terms and survives an unreachable device', async () => {
    const harness = await createSession()
    harness.unreachable.add(PEER_SECOND_DEVICE)
    const roster = toRoster(THREE_WAY).map((entry) =>
        entry.jid === THIRD ? { ...entry, tosNotAccepted: true } : entry
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 2, rekey: true, roster })
    )

    assert.deepEqual(
        sentWithTag(harness, 'enc_rekey').map((node) => node.attrs.to),
        [PEER_DEVICE]
    )
})

test('no rekey goes out unless asked, with us and somebody else connected', async () => {
    const plain = await createSession()
    await plain.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 2, roster: toRoster(THREE_WAY) })
    )
    assert.equal(sentWithTag(plain, 'enc_rekey').length, 0)

    const notConnected = await createSession()
    await notConnected.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 2,
            rekey: true,
            roster: toRoster(THREE_WAY).map((entry) =>
                entry.jid === SELF ? { ...entry, state: 'invited' } : entry
            )
        })
    )
    assert.equal(sentWithTag(notConnected, 'enc_rekey').length, 0)
    assert.equal(notConnected.call.encryptionKey, undefined)

    const alone = await createSession()
    await alone.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 2,
            rekey: true,
            roster: toRoster(THREE_WAY).map((entry) =>
                entry.jid === SELF ? entry : { ...entry, state: 'invited' }
            )
        })
    )
    assert.equal(sentWithTag(alone, 'enc_rekey').length, 0)
})

test('a rekey on a stale roster still runs; one already answered does not run again', async () => {
    const harness = await createSession()
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 14, roster: toRoster(THREE_WAY) })
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 12, rekey: true, roster: toRoster(THREE_WAY) })
    )
    assert.equal(sentWithTag(harness, 'enc_rekey').length, 3, 'the late update carried the rekey')
    assert.equal(harness.call.groupComposition?.lastTransactionId, 14, 'its roster was not taken')

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 12, rekey: true, roster: toRoster(THREE_WAY) })
    )
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 11, rekey: true, roster: toRoster(THREE_WAY) })
    )
    assert.equal(sentWithTag(harness, 'enc_rekey').length, 3)
})
