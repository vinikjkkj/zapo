/**
 * Phase 42 cross-check: gap-fill handlers landed on top of Phase 38.
 *
 * Covers the four handlers and seeders that have no public lib API
 * hook (or that fire only from background paths the cross-check suite
 * does not currently exercise):
 *
 *   1. `setPrivacyDisallowedList` seeder + `client.privacy.getDisallowedList`.
 *   2. Trusted-contact privacy-token issue (`<iq xmlns="privacy" type="set"><tokens>`).
 *   3. Newsletter `my_addons` metadata sync.
 *   4. Dirty-bits `<clean>` clear.
 *   5. AB-props seeder via `setAbProps`.
 *
 * For the three background-only IQs we feed a synthetic stanza through
 * `server.routeIqForTest`, which returns the response the global
 * handler would have written back on the wire.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'
import type { BinaryNode } from '../transport/codec'

import { createZapoClient } from './helpers/zapo-client'

test('client.privacy.getDisallowedList returns the seeded jids per category', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'privacy-disallowed' })
    const seededJids = ['5511aaa@s.whatsapp.net', '5511bbb@s.whatsapp.net']
    server.setPrivacyDisallowedList('groupadd', seededJids)

    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()
        const result = await client.privacy.getDisallowedList('groupAdd')
        assert.deepEqual([...result.jids], seededJids)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('privacy-token-issue handler captures the issued tokens and acks', async () => {
    const server = await FakeWaServer.start()
    const captured: Array<{ jid: string; timestampS: number; type: string }> = []
    server.onOutboundPrivacyTokenIssue((op) => {
        captured.push({ jid: op.jid, timestampS: op.timestampS, type: op.type })
    })

    const iq: BinaryNode = {
        tag: 'iq',
        attrs: {
            id: 'iq-tok-1',
            type: 'set',
            to: 's.whatsapp.net',
            xmlns: 'privacy'
        },
        content: [
            {
                tag: 'tokens',
                attrs: {},
                content: [
                    {
                        tag: 'token',
                        attrs: {
                            jid: '5511777777777@s.whatsapp.net',
                            t: '1700000000',
                            type: 'trusted_contact'
                        }
                    }
                ]
            }
        ]
    }

    try {
        const result = await server.routeIqForTest(iq)
        assert.ok(result)
        assert.equal(result.attrs.type, 'result')
        assert.equal(captured.length, 1)
        assert.equal(captured[0].jid, '5511777777777@s.whatsapp.net')
        assert.equal(captured[0].timestampS, 1_700_000_000)
        assert.equal(captured[0].type, 'trusted_contact')

        const snapshot = server.privacyTokensIssuedSnapshot()
        assert.equal(snapshot.size, 1)
        assert.ok(snapshot.has('5511777777777@s.whatsapp.net'))
    } finally {
        await server.stop()
    }
})

test('newsletter-my-addons handler returns a well-formed <my_addons/> result', async () => {
    const server = await FakeWaServer.start()
    const iq: BinaryNode = {
        tag: 'iq',
        attrs: {
            id: 'iq-news-1',
            type: 'get',
            to: 's.whatsapp.net',
            xmlns: 'newsletter'
        },
        content: [{ tag: 'my_addons', attrs: { limit: '1' } }]
    }

    try {
        const result = await server.routeIqForTest(iq)
        assert.ok(result)
        assert.equal(result.attrs.type, 'result')
        const children = Array.isArray(result.content) ? result.content : []
        const myAddons = children.find((c) => c.tag === 'my_addons')
        assert.ok(myAddons, 'expected <my_addons/> child')
    } finally {
        await server.stop()
    }
})

test('dirty-bits-clear handler captures the cleared bits and acks', async () => {
    const server = await FakeWaServer.start()
    const captured: Array<{
        bits: ReadonlyArray<{ readonly type: string; readonly timestamp: number }>
    }> = []
    server.onOutboundDirtyBitsClear((op) => {
        captured.push({ bits: op.bits })
    })

    const iq: BinaryNode = {
        tag: 'iq',
        attrs: {
            id: 'iq-dirty-1',
            type: 'set',
            to: 's.whatsapp.net',
            xmlns: 'urn:xmpp:whatsapp:dirty'
        },
        content: [
            {
                tag: 'clean',
                attrs: { type: 'account_sync', timestamp: '1700000000' }
            },
            {
                tag: 'clean',
                attrs: { type: 'groups', timestamp: '1700000050' }
            }
        ]
    }

    try {
        const result = await server.routeIqForTest(iq)
        assert.ok(result)
        assert.equal(result.attrs.type, 'result')
        assert.equal(captured.length, 1)
        assert.equal(captured[0].bits.length, 2)
        assert.equal(captured[0].bits[0].type, 'account_sync')
        assert.equal(captured[0].bits[0].timestamp, 1_700_000_000)
        assert.equal(captured[0].bits[1].type, 'groups')
        assert.equal(captured[0].bits[1].timestamp, 1_700_000_050)
    } finally {
        await server.stop()
    }
})

test('setAbProps seeds the experiment payload returned by the abprops handler', async () => {
    const server = await FakeWaServer.start()
    server.setAbProps({
        hash: 'seeded-hash',
        refreshSeconds: 3600,
        refreshId: 99,
        props: [{ configCode: 4321, configValue: 'on' }]
    })

    const iq: BinaryNode = {
        tag: 'iq',
        attrs: {
            id: 'iq-abt-1',
            type: 'get',
            to: 's.whatsapp.net',
            xmlns: 'abt'
        },
        content: [{ tag: 'props', attrs: { protocol: '1' } }]
    }

    try {
        const result = await server.routeIqForTest(iq)
        assert.ok(result)
        const children = Array.isArray(result.content) ? result.content : []
        const props = children.find((c) => c.tag === 'props')
        assert.ok(props)
        assert.equal(props!.attrs.hash, 'seeded-hash')
        assert.equal(props!.attrs.refresh, '3600')
        assert.equal(props!.attrs.refresh_id, '99')
        const propChildren = Array.isArray(props!.content) ? props!.content : []
        assert.equal(propChildren.length, 1)
        assert.equal(propChildren[0].attrs.config_code, '4321')
        assert.equal(propChildren[0].attrs.config_value, 'on')
    } finally {
        await server.stop()
    }
})
