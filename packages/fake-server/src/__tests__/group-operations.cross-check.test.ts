/**
 * Phase 27 cross-check: group operation IQs the lib sends via
 * `client.group.*` reach the fake server and resolve.
 *
 * Each operation registers a one-shot inline handler that asserts the
 * inbound IQ shape and returns a minimal `result` echo. The lib's
 * coordinator only requires `attrs.type === 'result'` for the
 * participant change / leave / setSubject / setDescription / setSetting
 * methods; createGroup additionally parses a `<group>` metadata
 * payload, so the test ships one.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'
import { buildIqResult } from '../protocol/iq/router'
import type { BinaryNode } from '../transport/codec'

import { createZapoClient } from './helpers/zapo-client'

function findChild(node: BinaryNode, tag: string): BinaryNode | undefined {
    if (!Array.isArray(node.content)) return undefined
    return node.content.find((child) => child.tag === tag)
}

function attachGroupMetadataResult(server: FakeWaServer): void {
    // Inbound: <iq xmlns=w:g2 type=set to=g.us><create subject=...><participant jid=.../></create></iq>
    // Reply: <iq type=result><group jid=120363... subject=... creation=...><participant jid=...></group></iq>
    server.registerIqHandler(
        { xmlns: 'w:g2', type: 'set', childTag: 'create' },
        (iq) => {
            const create = findChild(iq, 'create')
            const participantJids: string[] = []
            if (create && Array.isArray(create.content)) {
                for (const child of create.content) {
                    if (child.tag === 'participant' && child.attrs.jid) {
                        participantJids.push(child.attrs.jid)
                    }
                }
            }
            const result = buildIqResult(iq)
            return {
                ...result,
                attrs: { ...result.attrs, from: '@g.us' },
                content: [
                    {
                        tag: 'group',
                        attrs: {
                            id: '120363999999999999@g.us',
                            subject: create?.attrs.subject ?? 'New Group',
                            creation: String(Math.floor(Date.now() / 1_000)),
                            creator: participantJids[0] ?? ''
                        },
                        content: participantJids.map((jid) => ({
                            tag: 'participant',
                            attrs: { jid }
                        }))
                    }
                ]
            }
        },
        'group-create'
    )
}

test('client.group.createGroup sends a w:g2 IQ and parses the metadata response', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'group-create' })
    attachGroupMetadataResult(server)

    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()

        const captured = server.expectIq(
            { xmlns: 'w:g2', type: 'set', childTag: 'create' },
            { timeoutMs: 5_000 }
        )

        await client.group.createGroup('Cross-check Group', [
            '5511777777777@s.whatsapp.net',
            '5511666666666@s.whatsapp.net'
        ])

        const iq = await captured
        const create = findChild(iq, 'create')
        assert.ok(create, 'IQ should carry a <create> child')
        assert.equal(create.attrs.subject, 'Cross-check Group')
        const participants = Array.isArray(create.content)
            ? create.content.filter((child) => child.tag === 'participant')
            : []
        assert.equal(participants.length, 2)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('client.group participant change methods round-trip via the fake server', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'group-participants' })

    const groupJid = '120363111111111111@g.us'

    // Echo handler — accepts add/remove/promote/demote and returns
    // success (the lib's coordinator only checks `type=result`).
    for (const action of ['add', 'remove', 'promote', 'demote'] as const) {
        server.registerIqHandler(
            { xmlns: 'w:g2', type: 'set', childTag: action },
            (iq) => buildIqResult(iq),
            `group-${action}`
        )
    }

    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()

        const peerA = '5511777777777@s.whatsapp.net'
        const peerB = '5511666666666@s.whatsapp.net'

        // Drive every participant change action and assert the IQ
        // landed on the wire with the right child tag.
        const seenActions = new Set<string>()
        const watchPromise = (async () => {
            const stream = ['add', 'remove', 'promote', 'demote'] as const
            for (const action of stream) {
                const iq = await server.expectIq(
                    { xmlns: 'w:g2', type: 'set', childTag: action },
                    { timeoutMs: 5_000 }
                )
                const child = findChild(iq, action)
                assert.ok(child, `${action} IQ should carry a <${action}> child`)
                seenActions.add(action)
            }
        })()

        await client.group.addParticipants(groupJid, [peerA])
        await client.group.removeParticipants(groupJid, [peerA])
        await client.group.promoteParticipants(groupJid, [peerB])
        await client.group.demoteParticipants(groupJid, [peerB])
        await watchPromise

        assert.deepEqual(
            [...seenActions].sort(),
            ['add', 'demote', 'promote', 'remove']
        )
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('client.group.setSubject and setDescription emit the right IQ child tags', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'group-meta-set' })

    const groupJid = '120363222222222222@g.us'

    server.registerIqHandler(
        { xmlns: 'w:g2', type: 'set', childTag: 'subject' },
        (iq) => buildIqResult(iq),
        'group-subject'
    )
    server.registerIqHandler(
        { xmlns: 'w:g2', type: 'set', childTag: 'description' },
        (iq) => buildIqResult(iq),
        'group-description'
    )

    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()

        const subjectPromise = server.expectIq(
            { xmlns: 'w:g2', type: 'set', childTag: 'subject' },
            { timeoutMs: 5_000 }
        )
        const descPromise = server.expectIq(
            { xmlns: 'w:g2', type: 'set', childTag: 'description' },
            { timeoutMs: 5_000 }
        )

        await client.group.setSubject(groupJid, 'Updated Subject')
        await client.group.setDescription(groupJid, 'Updated Description')

        const decodeContent = (content: BinaryNode['content']): string => {
            if (typeof content === 'string') return content
            if (content instanceof Uint8Array) return new TextDecoder().decode(content)
            return ''
        }

        const subjectIq = await subjectPromise
        const subjectChild = findChild(subjectIq, 'subject')
        assert.ok(subjectChild)
        assert.equal(decodeContent(subjectChild.content), 'Updated Subject')

        const descIq = await descPromise
        const descChild = findChild(descIq, 'description')
        assert.ok(descChild)
        const bodyChild = findChild(descChild, 'body')
        assert.ok(bodyChild)
        assert.equal(decodeContent(bodyChild.content), 'Updated Description')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
