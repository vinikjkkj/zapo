/**
 * Phase 40 cross-check: group operation auto-handlers (no inline IQ
 * registration). Drives `client.group.*` against the global handlers
 * that mutate the centralised group registry.
 *
 * Replaces the older `group-operations.cross-check.test.ts` pattern
 * where every test had to register inline `<iq xmlns=w:g2>` handlers.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'

import { createZapoClient } from './helpers/zapo-client'

test('client.group.createGroup mints a new group in the registry and returns metadata', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'group-create-auto' })
    const captured: Array<{ action: string; subject?: string }> = []
    server.onOutboundGroupOp((op) => {
        if (op.action === 'create') {
            captured.push({ action: op.action, subject: op.subject })
        }
    })
    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()
        const result = await client.group.createGroup('My Test Group', [
            '5511777777777@s.whatsapp.net',
            '5511666666666@s.whatsapp.net'
        ])
        assert.equal(captured.length, 1, 'expected create op listener to fire')
        assert.equal(captured[0].subject, 'My Test Group')
        // The lib parses the metadata; we trust the cross-check
        // succeeded since it asserts iq result.
        assert.ok(result, 'createGroup should return a metadata BinaryNode')

        // The registry has the new group.
        const groups = server.groupRegistrySnapshot()
        assert.equal(groups.size, 1)
        const [metadata] = groups.values()
        assert.equal(metadata.subject, 'My Test Group')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('client.group.{add,remove}Participants mutate the registry via auto handlers', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'group-participants-auto' })

    const groupJid = '120363222222222222@g.us'

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()

        // Pre-create participants + group via the registry.
        const peerA = await server.createFakePeer({ jid: '5511aaa@s.whatsapp.net' }, pipeline)
        const peerB = await server.createFakePeer({ jid: '5511bbb@s.whatsapp.net' }, pipeline)
        await server.createFakePeer({ jid: '5511ccc@s.whatsapp.net' }, pipeline)
        server.createFakeGroup({
            groupJid,
            subject: 'Mutating Group',
            participants: [peerA, peerB]
        })

        const captured: string[] = []
        server.onOutboundGroupOp((op) => {
            captured.push(`${op.action}:${(op.participantJids ?? []).join(',')}`)
        })

        // add peerC
        await client.group.addParticipants(groupJid, ['5511ccc@s.whatsapp.net'])
        let snapshot = server.groupRegistrySnapshot().get(groupJid)!
        assert.equal(snapshot.participants.length, 3)

        // remove peerB
        await client.group.removeParticipants(groupJid, ['5511bbb@s.whatsapp.net'])
        snapshot = server.groupRegistrySnapshot().get(groupJid)!
        assert.equal(snapshot.participants.length, 2)
        const remainingJids = snapshot.participants.map((p) => p.jid)
        assert.ok(remainingJids.includes('5511aaa@s.whatsapp.net'))
        assert.ok(remainingJids.includes('5511ccc@s.whatsapp.net'))

        assert.deepEqual(captured, [
            'add:5511ccc@s.whatsapp.net',
            'remove:5511bbb@s.whatsapp.net'
        ])
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('client.group.setSubject + setDescription update the registry', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'group-meta-auto' })

    const groupJid = '120363333333333333@g.us'

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        const peerA = await server.createFakePeer({ jid: '5511aaa@s.whatsapp.net' }, pipeline)
        server.createFakeGroup({
            groupJid,
            subject: 'Old Subject',
            participants: [peerA]
        })

        await client.group.setSubject(groupJid, 'New Subject')
        await client.group.setDescription(groupJid, 'New Description Body')

        const snapshot = server.groupRegistrySnapshot().get(groupJid)!
        assert.equal(snapshot.subject, 'New Subject')
        assert.equal(snapshot.description, 'New Description Body')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('client.group.leaveGroup removes the group from the registry', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'group-leave-auto' })

    const groupJid = '120363444444444444@g.us'

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        const peerA = await server.createFakePeer({ jid: '5511aaa@s.whatsapp.net' }, pipeline)
        server.createFakeGroup({
            groupJid,
            subject: 'Doomed Group',
            participants: [peerA]
        })

        await client.group.leaveGroup([groupJid])

        assert.equal(server.groupRegistrySnapshot().size, 0)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
