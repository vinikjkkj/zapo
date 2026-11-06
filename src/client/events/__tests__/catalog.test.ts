import assert from 'node:assert/strict'
import test from 'node:test'

import {
    parseCatalogNonceNotification,
    parseCatalogProduct,
    parseCatalogTokenResult
} from '@client/events/catalog'

test('catalog parser preserves absent prices, booleans and media without conflating owner/public fields', () => {
    const item = parseCatalogProduct({
        id: '123',
        name: 'Item',
        is_hidden: 'TRUE',
        availability: 'IN_STOCK',
        media: { videos: [{ thumbnail_url: 'https://example.com/poster' }, {}] }
    })
    assert.equal(item.price, null)
    assert.equal(item.salePrice, null)
    assert.equal(item.currencyCode, null)
    assert.equal(item.isHidden, true)
    assert.equal(item.availability, 'IN_STOCK')
    assert.deepEqual(item.images, [])
    assert.deepEqual(item.videos, [
        { id: null, originalUrl: null, thumbnailUrl: 'https://example.com/poster' }
    ])
    const publicItem = parseCatalogProduct({
        id: '1',
        name: 'Item',
        price: '0',
        is_hidden: 'ISHIDDEN_TRUE',
        product_availability: 'OUT_OF_STOCK',
        sale_price: { price: '1234' }
    })
    assert.equal(publicItem.price, 0)
    assert.equal(publicItem.salePrice, 1.234)
    assert.equal(publicItem.isHidden, true)
})

test('catalog parser rejects unsafe or malformed prices and malformed media', () => {
    for (const price of ['9007199254740992', '1.2', 'NaN', '-1', 100]) {
        assert.throws(() => parseCatalogProduct({ id: '1', name: 'Item', price }), {
            code: 'CATALOG_INVALID_RESPONSE'
        })
    }
    assert.throws(() => parseCatalogProduct({ name: 'Item' }), { code: 'CATALOG_INVALID_RESPONSE' })
    assert.throws(() => parseCatalogProduct({ id: '1', name: 'Item', media: { images: [{}] } }), {
        code: 'CATALOG_INVALID_RESPONSE'
    })
})

test('catalog token parser validates sender and required fields without disclosing values', () => {
    assert.throws(
        () => parseCatalogTokenResult({ tag: 'iq', attrs: { type: 'result', from: 'other' } }),
        { code: 'CATALOG_INVALID_RESPONSE' }
    )
    assert.throws(
        () =>
            parseCatalogTokenResult({
                tag: 'iq',
                attrs: { type: 'result', from: 's.whatsapp.net' },
                content: [{ tag: 'access_token', attrs: {}, content: 'secret' }]
            }),
        (error) => {
            assert.doesNotMatch(String(error), /secret/)
            return true
        }
    )
    assert.throws(
        () =>
            parseCatalogNonceNotification({
                tag: 'notification',
                attrs: { from: 's.whatsapp.net', type: 'business' },
                content: [{ tag: 'wa_ad_account_nonce', attrs: {}, content: 'secret' }]
            }),
        { code: 'CATALOG_INVALID_RESPONSE' }
    )
})
