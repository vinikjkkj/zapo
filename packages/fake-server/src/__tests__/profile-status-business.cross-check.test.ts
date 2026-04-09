/**
 * Phase 41 cross-check: profile picture, status, and business profile
 * auto-handlers. Drives the lib's `client.profile.*` and
 * `client.business.*` against the global handlers that mutate / read
 * the centralised registries on `FakeWaServer`.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'

import { createZapoClient } from './helpers/zapo-client'

test('client.profile.getProfilePicture returns a pre-seeded record from the registry', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'profile-pic-get' })
    const targetJid = '5511777777777@s.whatsapp.net'

    server.setProfilePictureRecord(targetJid, {
        id: '111',
        url: 'https://fake-media.local/profile/seed.jpg',
        directPath: '/profile/seed.jpg',
        type: 'image'
    })

    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()
        const result = await client.profile.getProfilePicture(targetJid, 'image')
        assert.equal(result.id, '111')
        assert.equal(result.url, 'https://fake-media.local/profile/seed.jpg')
        assert.equal(result.directPath, '/profile/seed.jpg')
        assert.equal(result.type, 'image')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('client.profile.setProfilePicture mints a new record and fires the listener', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'profile-pic-set' })

    const captured: Array<{ byteLen: number }> = []
    server.onOutboundProfilePictureSet((op) => {
        captured.push({ byteLen: op.imageBytes.length })
    })

    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()
        const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
        const newId = await client.profile.setProfilePicture(bytes)
        assert.ok(newId, 'expected setProfilePicture to return the minted id')
        assert.equal(captured.length, 1, 'expected onOutboundProfilePictureSet to fire')
        assert.equal(captured[0].byteLen, bytes.length)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('client.profile.setStatus reaches the fake server and fires the listener', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'profile-status-set' })

    const captured: Array<{ text: string }> = []
    server.onOutboundStatusSet((op) => {
        captured.push({ text: op.text })
    })

    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()
        await client.profile.setStatus('Hello from cross-check')
        assert.equal(captured.length, 1, 'expected onOutboundStatusSet to fire')
        assert.equal(captured[0].text, 'Hello from cross-check')
        assert.equal(server.latestStatusSnapshot(), 'Hello from cross-check')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('client.business.getBusinessProfile returns a pre-seeded record from the registry', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'business-profile-get' })
    const bizJid = '5511666666666@s.whatsapp.net'

    server.setBusinessProfileRecord(bizJid, {
        jid: bizJid,
        description: 'Fake biz on the corner',
        address: '123 Fake Street',
        email: 'biz@example.com',
        websites: ['https://example.com'],
        categoryIds: ['retail']
    })

    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()
        const profiles = await client.business.getBusinessProfile([bizJid])
        assert.equal(profiles.length, 1)
        const [profile] = profiles
        assert.equal(profile.jid, bizJid)
        assert.equal(profile.description, 'Fake biz on the corner')
        assert.equal(profile.address, '123 Fake Street')
        assert.equal(profile.email, 'biz@example.com')
        assert.deepEqual(
            (profile.websites ?? []).map((w) => w.url),
            ['https://example.com']
        )
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
