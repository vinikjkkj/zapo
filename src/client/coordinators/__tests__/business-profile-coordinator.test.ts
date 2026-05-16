import assert from 'node:assert/strict'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

import { createBusinessCoordinator } from '@client/coordinators/WaBusinessCoordinator'
import { createNoopLogger } from '@infra/log/types'
import { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import { proto } from '@proto'
import { WA_XMLNS } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'
import { TEXT_ENCODER } from '@util/bytes'

function createIqResult(content?: readonly BinaryNode[]): BinaryNode {
    return {
        tag: 'iq',
        attrs: { type: 'result' },
        content
    }
}

type CoordinatorDeps = Parameters<typeof createBusinessCoordinator>[0]

function makeBusinessCoordinator(overrides: Partial<CoordinatorDeps> = {}) {
    return createBusinessCoordinator({
        queryWithContext: async () => createIqResult(),
        mediaTransfer: new WaMediaTransferClient(),
        getMediaConn: () => {
            throw new Error('getMediaConn not stubbed in this test')
        },
        logger: createNoopLogger('error'),
        ...overrides
    })
}

test('business coordinator gets full profile fields', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
        readonly contextData?: Readonly<Record<string, unknown>>
    }> = []

    const coordinator = makeBusinessCoordinator({
        queryWithContext: async (context, node, _timeoutMs, contextData) => {
            calls.push({ context, node, contextData })
            return createIqResult([
                {
                    tag: 'business_profile',
                    attrs: { v: '116' },
                    content: [
                        {
                            tag: 'profile',
                            attrs: { jid: '5511999999999@s.whatsapp.net', tag: '42' },
                            content: [
                                { tag: 'description', attrs: {}, content: 'We sell things' },
                                { tag: 'address', attrs: {}, content: '123 Main St' },
                                { tag: 'email', attrs: {}, content: 'biz@example.com' },
                                { tag: 'website', attrs: {}, content: 'https://example.com' },
                                {
                                    tag: 'website',
                                    attrs: {},
                                    content: 'https://shop.example.com'
                                },
                                { tag: 'latitude', attrs: {}, content: '-23.5505' },
                                { tag: 'longitude', attrs: {}, content: '-46.6333' },
                                {
                                    tag: 'categories',
                                    attrs: {},
                                    content: [
                                        {
                                            tag: 'category',
                                            attrs: { id: '133' },
                                            content: 'Shopping & Retail'
                                        },
                                        {
                                            tag: 'category',
                                            attrs: { id: '200' },
                                            content: 'Food & Beverage'
                                        }
                                    ]
                                },
                                {
                                    tag: 'business_hours',
                                    attrs: { timezone: 'America/Sao_Paulo' },
                                    content: [
                                        {
                                            tag: 'business_hours_config',
                                            attrs: {
                                                day_of_week: 'mon',
                                                mode: 'specific_hours',
                                                open_time: '540',
                                                close_time: '1080'
                                            }
                                        },
                                        {
                                            tag: 'business_hours_config',
                                            attrs: { day_of_week: 'sun', mode: 'closed' }
                                        }
                                    ]
                                },
                                {
                                    tag: 'profile_options',
                                    attrs: {},
                                    content: [
                                        {
                                            tag: 'commerce_experience',
                                            attrs: {},
                                            content: 'CATALOG'
                                        },
                                        { tag: 'cart_enabled', attrs: {}, content: 'true' }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
        }
    })

    const results = await coordinator.getBusinessProfile(['5511999999999@s.whatsapp.net'])

    assert.equal(results.length, 1)
    const biz = results[0]
    assert.equal(biz.jid, '5511999999999@s.whatsapp.net')
    assert.equal(biz.tag, '42')
    assert.equal(biz.description, 'We sell things')
    assert.equal(biz.address, '123 Main St')
    assert.equal(biz.email, 'biz@example.com')
    assert.deepEqual(biz.websites, [
        { url: 'https://example.com' },
        { url: 'https://shop.example.com' }
    ])
    assert.equal(biz.latitude, -23.5505)
    assert.equal(biz.longitude, -46.6333)
    assert.deepEqual(biz.categories, [
        { id: '133', name: 'Shopping & Retail' },
        { id: '200', name: 'Food & Beverage' }
    ])
    const hours = biz.businessHours
    assert.ok(hours)
    assert.equal(hours.timezone, 'America/Sao_Paulo')
    assert.equal(hours.config.length, 2)
    assert.deepEqual(hours.config[0], {
        dayOfWeek: 'mon',
        mode: 'specific_hours',
        openTime: 540,
        closeTime: 1080
    })
    assert.deepEqual(hours.config[1], { dayOfWeek: 'sun', mode: 'closed' })
    assert.deepEqual(biz.profileOptions, {
        commerce_experience: 'CATALOG',
        cart_enabled: 'true'
    })

    assert.equal(calls.length, 1)
    assert.equal(calls[0].context, 'business.getProfile')
    assert.equal(calls[0].node.attrs.xmlns, WA_XMLNS.BUSINESS)
    assert.equal(calls[0].node.attrs.type, 'get')
    assert.deepEqual(calls[0].contextData, { count: 1 })
})

test('business coordinator returns empty for profile with no children', async () => {
    const coordinator = makeBusinessCoordinator({
        queryWithContext: async () =>
            createIqResult([
                {
                    tag: 'business_profile',
                    attrs: { v: '116' },
                    content: [{ tag: 'profile', attrs: { jid: '5511@s.whatsapp.net' } }]
                }
            ])
    })

    const results = await coordinator.getBusinessProfile(['5511@s.whatsapp.net'])
    assert.equal(results.length, 1)
    assert.equal(results[0].jid, '5511@s.whatsapp.net')
    assert.equal(results[0].description, undefined)
})

test('business coordinator skips query for empty jids', async () => {
    const calls: string[] = []
    const coordinator = makeBusinessCoordinator({
        queryWithContext: async (context) => {
            calls.push(context)
            return createIqResult()
        }
    })

    const results = await coordinator.getBusinessProfile([])
    assert.equal(results.length, 0)
    assert.equal(calls.length, 0)
})

test('business coordinator edits profile with delta mutation', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
    }> = []

    const coordinator = makeBusinessCoordinator({
        queryWithContext: async (context, node) => {
            calls.push({ context, node })
            return createIqResult()
        }
    })

    await coordinator.editBusinessProfile({
        description: 'New desc',
        email: 'new@biz.com',
        websites: [{ url: 'https://new.com' }],
        categories: [{ id: '100' }],
        businessHours: {
            timezone: 'UTC',
            config: [{ dayOfWeek: 'mon', mode: 'specific_hours', openTime: 480, closeTime: 1020 }]
        }
    })

    assert.equal(calls.length, 1)
    assert.equal(calls[0].context, 'business.editProfile')
    assert.equal(calls[0].node.attrs.type, 'set')
    assert.equal(calls[0].node.attrs.xmlns, WA_XMLNS.BUSINESS)
    const bizProfile = (calls[0].node.content as readonly BinaryNode[])[0]
    assert.equal(bizProfile.tag, 'business_profile')
    assert.equal(bizProfile.attrs.v, '3')
    assert.equal(bizProfile.attrs.mutation_type, 'delta')
    const children = bizProfile.content as readonly BinaryNode[]
    const tags = children.map((c) => c.tag)
    assert.ok(tags.includes('description'))
    assert.ok(tags.includes('email'))
    assert.ok(tags.includes('website'))
    assert.ok(tags.includes('categories'))
    assert.ok(tags.includes('business_hours'))
    const hoursNode = children.find((c) => c.tag === 'business_hours')!
    assert.equal(hoursNode.attrs.timezone, 'UTC')
    const configNodes = hoursNode.content as readonly BinaryNode[]
    assert.equal(configNodes.length, 1)
    assert.equal(configNodes[0].attrs.day_of_week, 'mon')
    assert.equal(configNodes[0].attrs.open_time, '480')
    assert.equal(configNodes[0].attrs.close_time, '1020')
})

test('business coordinator edits profile with empty websites clears them', async () => {
    const calls: Array<{ readonly node: BinaryNode }> = []

    const coordinator = makeBusinessCoordinator({
        queryWithContext: async (_ctx, node) => {
            calls.push({ node })
            return createIqResult()
        }
    })

    await coordinator.editBusinessProfile({ websites: [] })

    const bizProfile = (calls[0].node.content as readonly BinaryNode[])[0]
    const children = bizProfile.content as readonly BinaryNode[]
    const websiteNode = children.find((c) => c.tag === 'website')
    assert.ok(websiteNode)
    assert.equal(websiteNode.content, undefined)
})

function buildVerifiedNameCertBytes(opts: {
    serial?: number
    issuer?: string
    verifiedName?: string
}): Uint8Array {
    const details = proto.VerifiedNameCertificate.Details.encode({
        serial: opts.serial,
        issuer: opts.issuer,
        verifiedName: opts.verifiedName
    }).finish()
    return proto.VerifiedNameCertificate.encode({ details }).finish()
}

test('business coordinator gets verified name from certificate', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
        readonly contextData?: Readonly<Record<string, unknown>>
    }> = []

    const certBytes = buildVerifiedNameCertBytes({
        serial: 123,
        issuer: 'smb:wa',
        verifiedName: 'My Business Name'
    })

    const coordinator = makeBusinessCoordinator({
        queryWithContext: async (context, node, _timeoutMs, contextData) => {
            calls.push({ context, node, contextData })
            return createIqResult([
                {
                    tag: 'verified_name',
                    attrs: {
                        verified_level: 'high',
                        actual_actors: '0',
                        host_storage: '1',
                        privacy_mode_ts: '1700000000'
                    },
                    content: certBytes
                }
            ])
        }
    })

    const result = await coordinator.getVerifiedName('5511@s.whatsapp.net')

    assert.ok(result)
    assert.equal(result.name, 'My Business Name')
    assert.equal(result.level, 'high')
    assert.equal(result.serial, '123')
    assert.equal(result.isApi, false)
    assert.equal(result.isSmb, true)
    assert.deepEqual(result.privacyMode, {
        actualActors: 0,
        hostStorage: 1,
        privacyModeTs: 1700000000
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].context, 'business.getVerifiedName')
    assert.equal(calls[0].node.attrs.xmlns, WA_XMLNS.BUSINESS)
    assert.equal(calls[0].node.attrs.type, 'get')
    assert.deepEqual(calls[0].contextData, { jid: '5511@s.whatsapp.net' })
    const vnChild = (calls[0].node.content as readonly BinaryNode[])[0]
    assert.equal(vnChild.tag, 'verified_name')
    assert.equal(vnChild.attrs.jid, '5511@s.whatsapp.net')
})

test('business coordinator verified name uses attr serial as fallback', async () => {
    const certBytes = buildVerifiedNameCertBytes({
        issuer: 'ent:wa',
        verifiedName: 'Enterprise Biz'
    })

    const coordinator = makeBusinessCoordinator({
        queryWithContext: async () =>
            createIqResult([
                {
                    tag: 'verified_name',
                    attrs: { verified_level: 'low', serial: '456' },
                    content: certBytes
                }
            ])
    })

    const result = await coordinator.getVerifiedName('5511@s.whatsapp.net')
    assert.ok(result)
    assert.equal(result.serial, '456')
    assert.equal(result.isApi, true)
    assert.equal(result.isSmb, false)
    assert.equal(result.privacyMode, undefined)
})

test('business coordinator verified name without certificate content', async () => {
    const coordinator = makeBusinessCoordinator({
        queryWithContext: async () =>
            createIqResult([
                {
                    tag: 'verified_name',
                    attrs: { verified_level: 'unknown' }
                }
            ])
    })

    const result = await coordinator.getVerifiedName('5511@s.whatsapp.net')
    assert.ok(result)
    assert.equal(result.name, undefined)
    assert.equal(result.isApi, false)
    assert.equal(result.isSmb, false)
})

test('business coordinator returns null for missing verified name', async () => {
    const coordinator = makeBusinessCoordinator({
        queryWithContext: async () => createIqResult()
    })

    const result = await coordinator.getVerifiedName('5511@s.whatsapp.net')
    assert.equal(result, null)
})

test('business coordinator uploads cover photo bytes and finalizes via IQ', async () => {
    const uploadCalls: Array<{ readonly url: string; readonly body: unknown }> = []
    const iqCalls: Array<{ readonly context: string; readonly node: BinaryNode }> = []

    const responseJson = JSON.stringify({
        fbid: 'photo-123',
        ts: '1700000000',
        meta_hmac: 'upload-token-abc'
    })

    const mediaTransfer = {
        uploadStream: async (req: { readonly url: string; readonly body: unknown }) => {
            uploadCalls.push({ url: req.url, body: req.body })
            return { status: 200, ok: true, headers: {}, body: null, url: req.url }
        },
        readResponseBytes: async () => TEXT_ENCODER.encode(responseJson)
    } as unknown as WaMediaTransferClient

    const coordinator = makeBusinessCoordinator({
        queryWithContext: async (context, node) => {
            iqCalls.push({ context, node })
            return createIqResult()
        },
        mediaTransfer,
        getMediaConn: async () => ({
            auth: 'auth-token-xyz',
            hosts: [{ hostname: 'mmg.whatsapp.net', isFallback: false }],
            expiresAtMs: Date.now() + 60_000
        })
    })

    await coordinator.updateCoverPhoto(new Uint8Array([1, 2, 3, 4, 5]))

    assert.equal(uploadCalls.length, 1)
    assert.match(uploadCalls[0].url, /^https:\/\/mmg\.whatsapp\.net\/pps\/biz-cover-photo\//)
    assert.match(uploadCalls[0].url, /[?&]auth=auth-token-xyz/)
    assert.match(uploadCalls[0].url, /[?&]media_id=\d+/)

    assert.equal(iqCalls.length, 1)
    assert.equal(iqCalls[0].context, 'business.updateCoverPhoto')
    const bizProfile = (iqCalls[0].node.content as readonly BinaryNode[])[0]
    const coverNode = (bizProfile.content as readonly BinaryNode[])[0]
    assert.equal(coverNode.tag, 'cover_photo')
    assert.equal(coverNode.attrs.op, 'update')
    assert.equal(coverNode.attrs.id, 'photo-123')
    assert.equal(coverNode.attrs.ts, '1700000000')
    assert.equal(coverNode.attrs.token, 'upload-token-abc')
})

function makeUploadStub(responseBody: string, status = 200) {
    const transfer = {
        uploadStream: async (req: { readonly url: string; readonly body: unknown }) => {
            // Drain the body stream so the underlying file handle is opened and closed
            // before the caller cleans up the temp file (otherwise a lazy-opened
            // stream races with unlink and emits uncaught ENOENT on Linux CI).
            const body = req.body
            if (body instanceof Readable) {
                await new Promise<void>((resolve, reject) => {
                    body.on('data', () => undefined)
                        .on('end', () => resolve())
                        .on('error', (error: Error) => reject(error))
                })
            }
            return {
                status,
                ok: status >= 200 && status < 300,
                headers: {},
                body: null,
                url: req.url
            }
        },
        readResponseBytes: async () => TEXT_ENCODER.encode(responseBody)
    } as unknown as WaMediaTransferClient
    return makeBusinessCoordinator({
        queryWithContext: async () => createIqResult(),
        mediaTransfer: transfer,
        getMediaConn: async () => ({
            auth: 'auth',
            hosts: [{ hostname: 'mmg.whatsapp.net', isFallback: false }],
            expiresAtMs: Date.now() + 60_000
        })
    })
}

test('updateCoverPhoto throws on missing fields in response', async () => {
    const coordinator = makeUploadStub(JSON.stringify({ fbid: 'fb-1', ts: '1700000000' }))
    await assert.rejects(
        () => coordinator.updateCoverPhoto(new Uint8Array([1, 2, 3])),
        /missing fbid\/ts\/meta_hmac/
    )
})

test('updateCoverPhoto throws on non-2xx status', async () => {
    const coordinator = makeUploadStub('{}', 500)
    await assert.rejects(
        () => coordinator.updateCoverPhoto(new Uint8Array([1])),
        /failed with status 500/
    )
})

test('updateCoverPhoto throws on invalid json body', async () => {
    const coordinator = makeUploadStub('not-json', 200)
    await assert.rejects(() => coordinator.updateCoverPhoto(new Uint8Array([1])), /invalid json/)
})

test('updateCoverPhoto accepts a file path source', async () => {
    const filePath = join(tmpdir(), `zapo-cover-test-${Date.now()}-${Math.random()}.bin`)
    await writeFile(filePath, new Uint8Array([10, 20, 30, 40, 50]))
    try {
        const coordinator = makeUploadStub(
            JSON.stringify({ fbid: 'p-1', ts: '1700000000', meta_hmac: 't-1' })
        )
        await coordinator.updateCoverPhoto(filePath)
    } finally {
        await unlink(filePath).catch(() => undefined)
    }
})

test('updateCoverPhoto accepts a Readable source', async () => {
    const coordinator = makeUploadStub(
        JSON.stringify({ fbid: 'p-2', ts: '1700000001', meta_hmac: 't-2' })
    )
    await coordinator.updateCoverPhoto(Readable.from([new Uint8Array([1, 2, 3, 4])]))
})

test('business coordinator parses empty description and guards NaN lat/lng', async () => {
    const coordinator = makeBusinessCoordinator({
        queryWithContext: async () =>
            createIqResult([
                {
                    tag: 'business_profile',
                    attrs: { v: '116' },
                    content: [
                        {
                            tag: 'profile',
                            attrs: { jid: '5511@s.whatsapp.net' },
                            content: [
                                { tag: 'description', attrs: {}, content: '' },
                                { tag: 'latitude', attrs: {}, content: 'not-a-number' },
                                { tag: 'longitude', attrs: {}, content: '' }
                            ]
                        }
                    ]
                }
            ])
    })

    const results = await coordinator.getBusinessProfile(['5511@s.whatsapp.net'])
    assert.equal(results.length, 1)
    assert.equal(results[0].description, '')
    assert.equal(results[0].latitude, undefined)
    assert.equal(results[0].longitude, undefined)
})

test('business coordinator deletes cover photo', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
    }> = []

    const coordinator = makeBusinessCoordinator({
        queryWithContext: async (context, node) => {
            calls.push({ context, node })
            return createIqResult()
        }
    })

    await coordinator.deleteCoverPhoto('photo-456')

    assert.equal(calls.length, 1)
    assert.equal(calls[0].context, 'business.deleteCoverPhoto')
    const bizProfile = (calls[0].node.content as readonly BinaryNode[])[0]
    const coverNode = (bizProfile.content as readonly BinaryNode[])[0]
    assert.equal(coverNode.tag, 'cover_photo')
    assert.equal(coverNode.attrs.op, 'delete')
    assert.equal(coverNode.attrs.id, 'photo-456')
})
