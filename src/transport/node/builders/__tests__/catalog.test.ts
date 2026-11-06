import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCatalogNonceIq, buildCatalogTokenIq } from '@transport/node/builders/catalog'

test('catalog authentication builders encode nonce request and exchange', () => {
    assert.deepEqual(buildCatalogNonceIq(), {
        tag: 'iq',
        attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'fb:thrift_iq', smax_id: '118' }
    })
    assert.deepEqual(buildCatalogTokenIq('nonce'), {
        tag: 'iq',
        attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'fb:thrift_iq', smax_id: '104' },
        content: [
            {
                tag: 'parameters',
                attrs: {},
                content: [{ tag: 'code', attrs: {}, content: 'nonce' }]
            }
        ]
    })
})
