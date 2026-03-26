import assert from 'node:assert/strict'
import test from 'node:test'

import { createBusinessCoordinator } from '@client/coordinators/WaBusinessCoordinator'
import { proto } from '@proto'
import { WA_XMLNS } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'

function createIqResult(content?: readonly BinaryNode[]): BinaryNode {
    return {
        tag: 'iq',
        attrs: { type: 'result' },
        content
    }
}

test('business coordinator gets full profile fields', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
        readonly contextData?: Readonly<Record<string, unknown>>
    }> = []

    const coordinator = createBusinessCoordinator({
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
    const coordinator = createBusinessCoordinator({
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
    const coordinator = createBusinessCoordinator({
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

    const coordinator = createBusinessCoordinator({
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

    const coordinator = createBusinessCoordinator({
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

    const coordinator = createBusinessCoordinator({
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

    const coordinator = createBusinessCoordinator({
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
    const coordinator = createBusinessCoordinator({
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
    const coordinator = createBusinessCoordinator({
        queryWithContext: async () => createIqResult()
    })

    const result = await coordinator.getVerifiedName('5511@s.whatsapp.net')
    assert.equal(result, null)
})

test('business coordinator updates cover photo', async () => {
    const calls: Array<{
        readonly context: string
        readonly node: BinaryNode
    }> = []

    const coordinator = createBusinessCoordinator({
        queryWithContext: async (context, node) => {
            calls.push({ context, node })
            return createIqResult()
        }
    })

    await coordinator.updateCoverPhoto('photo-123', '1700000000', 'upload-token-abc')

    assert.equal(calls.length, 1)
    assert.equal(calls[0].context, 'business.updateCoverPhoto')
    assert.equal(calls[0].node.attrs.type, 'set')
    const bizProfile = (calls[0].node.content as readonly BinaryNode[])[0]
    assert.equal(bizProfile.tag, 'business_profile')
    const coverNode = (bizProfile.content as readonly BinaryNode[])[0]
    assert.equal(coverNode.tag, 'cover_photo')
    assert.equal(coverNode.attrs.op, 'update')
    assert.equal(coverNode.attrs.id, 'photo-123')
    assert.equal(coverNode.attrs.ts, '1700000000')
    assert.equal(coverNode.attrs.token, 'upload-token-abc')
})

test('business coordinator parses empty description and guards NaN lat/lng', async () => {
    const coordinator = createBusinessCoordinator({
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

    const coordinator = createBusinessCoordinator({
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
