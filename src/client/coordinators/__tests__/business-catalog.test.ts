import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'

import { WaCatalogError } from '@client/catalog'
import { createBusinessCatalogCoordinator } from '@client/coordinators/WaBusinessCatalogCoordinator'
import { createNoopLogger } from '@infra/log/types'
import { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import { WA_CATALOG } from '@protocol/catalog'
import type { BinaryNode } from '@transport/types'
import { TEXT_DECODER, TEXT_ENCODER } from '@util/bytes'

const product = {
    id: '123',
    name: 'Coffee',
    description: 'Ground coffee',
    currency: 'BRL',
    price: '100000',
    sale_price: { price: '95000' },
    retailer_id: 'sku',
    url: 'https://example.com/item',
    media: {
        images: [
            {
                id: 'image',
                request_image_url: 'https://example.com/small.jpg',
                original_image_url: 'https://example.com/full.jpg'
            }
        ]
    }
}
const nonceNode: BinaryNode = {
    tag: 'notification',
    attrs: { from: 's.whatsapp.net', id: 'nonce-push', type: 'business', t: '123' },
    content: [{ tag: 'wa_ad_account_nonce', attrs: {}, content: 'private-nonce' }]
}
function result(content: BinaryNode[]): BinaryNode {
    return { tag: 'iq', attrs: { from: 's.whatsapp.net', type: 'result' }, content }
}
type Request = {
    doc_id: string
    access_token: string
    variables: { request: Record<string, Record<string, unknown>> }
    locale?: string
    lang?: string
}
type Coordinator = ReturnType<typeof createBusinessCatalogCoordinator>

function setup(
    options: {
        owner?: boolean
        query?: (node: BinaryNode, coordinator: Coordinator) => Promise<BinaryNode>
        response?: (request: Request) => unknown
        waitMs?: number
    } = {}
) {
    const iq: BinaryNode[] = []
    const acks: BinaryNode[] = []
    const requests: Request[] = []
    const urls: string[] = []
    let coordinator: Coordinator
    class Transfer extends WaMediaTransferClient {
        public override async uploadStream(
            input: Parameters<WaMediaTransferClient['uploadStream']>[0]
        ) {
            assert.ok(input.body instanceof Uint8Array)
            const request = JSON.parse(TEXT_DECODER.decode(input.body)) as Request
            requests.push(request)
            urls.push(input.url!)
            const owner = input.url === WA_CATALOG.OWNER_ENDPOINT
            let data: unknown
            if (request.variables.request.product_catalog) {
                data = {
                    [owner ? 'xfb_whatsapp_catalog' : 'xwa_product_catalog_get_product_catalog']: {
                        product_catalog: {
                            products: [product],
                            paging: { after: 'opaque+/=', before: '' },
                            catalog_id: owner ? 'catalog-id' : null
                        }
                    }
                }
            } else if (request.variables.request.product) {
                data = {
                    [owner ? 'xfb_whatsapp_catalog_product' : 'xwa_product_catalog_get_product']: {
                        product_catalog: { product }
                    }
                }
            }
            return {
                url: input.url!,
                status: 200,
                ok: true,
                headers: {},
                body: Readable.from([
                    TEXT_ENCODER.encode(JSON.stringify(options.response?.(request) ?? { data }))
                ])
            }
        }
    }
    coordinator = createBusinessCatalogCoordinator({
        logger: createNoopLogger(),
        mediaTransfer: new Transfer(),
        isConnected: () => true,
        isOwnJid: () => options.owner ?? false,
        getNonceWaitMs: () => options.waitMs ?? 100,
        sendNode: async (node) => {
            acks.push(node)
        },
        queryWithContext: async (_context, node) => {
            iq.push(node)
            if (options.query) return options.query(node, coordinator)
            if (node.attrs.smax_id === '118') {
                await coordinator.handleCatalogNotification(nonceNode)
                return result([{ tag: 'result', attrs: { status: 'Success' } }])
            }
            return result([
                { tag: 'access_token', attrs: {}, content: 'private-token' },
                { tag: 'session_cookies', attrs: {}, content: 'private-cookies' },
                { tag: 'business_person', attrs: { id: 'person' } }
            ])
        }
    })
    return { coordinator, iq, acks, requests, urls }
}

test('catalog public page preserves cursor and encodes decimal-string dimensions', async () => {
    const { coordinator, requests, iq, urls } = setup()
    const page = await coordinator.getCatalog('5511:4@s.whatsapp.net', {
        after: 'opaque+/=',
        imageWidth: 300,
        locale: 'pt-BR'
    })
    assert.equal(iq.length, 0)
    assert.deepEqual(urls, [WA_CATALOG.PUBLIC_ENDPOINT])
    assert.deepEqual(requests[0], {
        access_token: WA_CATALOG.PUBLIC_APPLICATION_TOKEN,
        doc_id: WA_CATALOG.PUBLIC_CATALOG_QUERY,
        lang: 'pt_BR',
        variables: {
            request: {
                product_catalog: {
                    jid: '5511@s.whatsapp.net',
                    width: '300',
                    height: '100',
                    limit: '10',
                    after: 'opaque+/=',
                    allow_shop_source: 'ALLOWSHOPSOURCE_FALSE'
                }
            }
        }
    })
    assert.equal(page.after, 'opaque+/=')
    assert.equal(page.before, null)
    assert.equal(page.catalogId, null)
    assert.equal(page.products[0].price, 100)
    assert.equal(page.products[0].salePrice, 95)
    assert.equal(page.products[0].images[0].originalUrl, 'https://example.com/full.jpg')
    assert.equal(requests.length, 1)
})

test('catalog owner auth coalesces callers, accepts early push, caches token and resets on disconnect', async () => {
    const { coordinator, requests, iq, acks } = setup({ owner: true })
    const [page, item] = await Promise.all([
        coordinator.getCatalog('5511@s.whatsapp.net'),
        coordinator.getProduct('5511@lid', '123')
    ])
    assert.equal(page.catalogId, 'catalog-id')
    assert.equal(item?.title, 'Coffee')
    assert.equal(iq.length, 2)
    assert.equal(acks.length, 1)
    assert.deepEqual(acks[0].attrs, {
        to: 's.whatsapp.net',
        class: 'notification',
        type: 'business',
        id: 'nonce-push'
    })
    assert.ok(
        requests.every(
            (r) =>
                r.access_token === 'private-token' && r.locale === 'en_US' && r.lang === undefined
        )
    )
    assert.equal(requests[0].variables.request.platform, 'WEB')
    assert.equal(requests[0].variables.request.product_catalog.allow_shop_source, false)
    await coordinator.getCatalog('5511@s.whatsapp.net')
    assert.equal(iq.length, 2)
    coordinator.resetCatalog()
    await coordinator.getCatalog('5511@s.whatsapp.net')
    assert.equal(iq.length, 4)
})

test('catalog missing product maps only the known remote not-found error to null', async () => {
    const missing = setup({
        response: () => ({ errors: [{ code: 2498052, message: 'private server details' }] })
    })
    assert.equal(await missing.coordinator.getProduct('5511@s.whatsapp.net', 'unknown'), null)
    const denied = setup({
        response: () => ({ errors: [{ code: 2498054, message: 'private server details' }] })
    })
    await assert.rejects(
        denied.coordinator.getProduct('5511@s.whatsapp.net', '123'),
        (error: unknown) => {
            assert.ok(error instanceof WaCatalogError)
            assert.equal(error.remoteCode, 2498054)
            assert.doesNotMatch(error.message, /private server/)
            return true
        }
    )
})

test('catalog invalid token clears cache without silently replaying a request', async () => {
    let reject = true
    const { coordinator, iq, requests } = setup({
        owner: true,
        response: () => (reject ? { errors: [{ code: 190 }] } : undefined)
    })
    await assert.rejects(coordinator.getCatalog('5511@s.whatsapp.net'), { remoteCode: 190 })
    assert.equal(requests.length, 1)
    reject = false
    await coordinator.getCatalog('5511@s.whatsapp.net')
    assert.equal(iq.length, 4)
})

test('catalog validates inputs before starting authentication or HTTP', async () => {
    const { coordinator, iq, requests } = setup({ owner: true })
    await assert.rejects(coordinator.getCatalog('123@g.us'), /user JID/)
    await assert.rejects(
        coordinator.getCatalog('5511@s.whatsapp.net', { imageWidth: 1.5 }),
        /positive integer/
    )
    await assert.rejects(coordinator.getProduct('5511@s.whatsapp.net', ''), /non-empty/)
    await assert.rejects(coordinator.getProduct('5511@s.whatsapp.net', ' 123'), /whitespace/)
    assert.equal(iq.length, 0)
    assert.equal(requests.length, 0)
})

test('catalog auth recovery and throttle surface explicitly without public fallback', async () => {
    for (const [code, node] of [
        [
            'CATALOG_RECOVERY_REQUIRED',
            result([
                {
                    tag: 'result',
                    attrs: { status: 'RecoveryRequired', email: 'private@example.com' }
                }
            ])
        ],
        [
            'CATALOG_THROTTLED',
            {
                tag: 'iq',
                attrs: { from: 's.whatsapp.net', type: 'error' },
                content: [{ tag: 'error', attrs: { code: '431', text: 'TOO_MANY_ATTEMPTS' } }]
            }
        ]
    ] as const) {
        const { coordinator, iq, requests } = setup({ owner: true, query: async () => node })
        await assert.rejects(coordinator.getCatalog('5511@s.whatsapp.net'), (error: unknown) => {
            assert.ok(error instanceof WaCatalogError)
            assert.equal(error.code, code)
            assert.doesNotMatch(error.message, /private@example/)
            return true
        })
        assert.equal(iq.length, 1)
        assert.equal(requests.length, 0)
    }
})

test('catalog incorrect nonce retries once and stops after the second exchange failure', async () => {
    const { coordinator, iq } = setup({
        owner: true,
        query: async (node, coordinator) => {
            if (node.attrs.smax_id === '118') {
                await coordinator.handleCatalogNotification(nonceNode)
                return result([{ tag: 'result', attrs: { status: 'Success' } }])
            }
            return {
                tag: 'iq',
                attrs: { from: 's.whatsapp.net', type: 'error' },
                content: [{ tag: 'error', attrs: { code: '432' } }]
            }
        }
    })
    await assert.rejects(coordinator.getCatalog('5511@s.whatsapp.net'), {
        code: 'CATALOG_INCORRECT_NONCE'
    })
    assert.equal(iq.length, 4)
})

test('catalog missing nonce times out; disconnect cancels waiters', async () => {
    const { coordinator, requests } = setup({
        owner: true,
        waitMs: 5,
        query: async () => result([{ tag: 'result', attrs: { status: 'Success' } }])
    })
    await assert.rejects(coordinator.getCatalog('5511@s.whatsapp.net'), {
        code: 'CATALOG_NONCE_TIMEOUT'
    })
    const pending = coordinator.getCatalog('5511@s.whatsapp.net')
    coordinator.resetCatalog()
    await assert.rejects(pending, { code: 'CATALOG_DISCONNECTED' })
    assert.equal(requests.length, 0)
})

test('catalog consumes unsolicited private nonce pushes and ignores unrelated notifications', async () => {
    const { coordinator, acks } = setup()
    assert.equal(await coordinator.handleCatalogNotification(nonceNode), true)
    assert.equal(acks.length, 1)
    assert.equal(
        await coordinator.handleCatalogNotification({
            ...nonceNode,
            attrs: { ...nonceNode.attrs, from: 'attacker@s.whatsapp.net' }
        }),
        false
    )
    assert.equal(
        await coordinator.handleCatalogNotification({
            tag: 'notification',
            attrs: { type: 'business' },
            content: []
        }),
        false
    )
    assert.equal(
        await coordinator.handleCatalogNotification({
            tag: 'ib',
            attrs: {},
            content: [{ tag: 'recovery_nonce', attrs: { code: 'nonce', use_case: '547' } }]
        }),
        true
    )
    assert.equal(acks.length, 1)
})

test('catalog malformed response does not masquerade as an empty catalog', async () => {
    const { coordinator } = setup({ response: () => ({ data: {} }) })
    await assert.rejects(coordinator.getCatalog('5511@s.whatsapp.net'), {
        code: 'CATALOG_INVALID_RESPONSE'
    })
})

test('catalog normalizes nonce and token IQ transport failures', async () => {
    for (const failedId of ['118', '104']) {
        const { coordinator, requests } = setup({
            owner: true,
            query: async (node, coordinator) => {
                if (node.attrs.smax_id === failedId) throw new Error('private IQ details')
                await coordinator.handleCatalogNotification(nonceNode)
                return result([{ tag: 'result', attrs: { status: 'Success' } }])
            }
        })
        await assert.rejects(coordinator.getCatalog('5511@s.whatsapp.net'), {
            name: 'WaCatalogError',
            code: 'CATALOG_AUTH_FAILED',
            message: 'catalog authentication failed'
        })
        assert.equal(requests.length, 0)
    }
})

test('catalog consumes malformed server nonce, rejects authentication and acknowledges the push', async () => {
    let consumed = false
    const { coordinator, acks, requests } = setup({
        owner: true,
        query: async (_node, instance) => {
            consumed = await instance.handleCatalogNotification({
                ...nonceNode,
                attrs: { ...nonceNode.attrs, t: 'invalid' }
            })
            return result([{ tag: 'result', attrs: { status: 'Success' } }])
        }
    })
    await assert.rejects(coordinator.getCatalog('5511@s.whatsapp.net'), {
        code: 'CATALOG_INVALID_RESPONSE'
    })
    assert.equal(consumed, true)
    assert.equal(acks.length, 1)
    assert.equal(requests.length, 0)
    assert.doesNotMatch(JSON.stringify(acks), /private-nonce/)
})

test('catalog consumes malformed unsolicited server nonce without exposing it', async () => {
    const { coordinator, acks } = setup()
    assert.equal(
        await coordinator.handleCatalogNotification({
            ...nonceNode,
            attrs: { ...nonceNode.attrs, t: 'invalid' }
        }),
        true
    )
    assert.equal(acks.length, 1)
    assert.equal(
        await coordinator.handleCatalogNotification({
            tag: 'ib',
            attrs: {},
            content: [{ tag: 'recovery_nonce', attrs: { use_case: '547' } }]
        }),
        true
    )
})
