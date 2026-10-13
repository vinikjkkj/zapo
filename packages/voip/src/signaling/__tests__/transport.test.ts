import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { extractRelayEndpoints } from '../transport.js'

test('extractRelayEndpoints collects direct and wrapped relays sorted by rtt', () => {
    const node: BinaryNode = {
        tag: 'transport',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: { ip: '1.1.1.1', port: '3480', token: 't1', 'c2r-rtt': '50' },
                content: undefined
            },
            {
                tag: 'relays',
                attrs: {},
                content: [
                    {
                        tag: 'relay',
                        attrs: { ip: '2.2.2.2', port: '3481', token: 't2', 'c2r-rtt': '10' },
                        content: undefined
                    }
                ]
            }
        ]
    }

    const relays = extractRelayEndpoints(node)
    assert.equal(relays.length, 2)
    assert.equal(relays[0].ip, '2.2.2.2')
    assert.equal(relays[0].port, 3481)
    assert.equal(relays[1].ip, '1.1.1.1')
})

test('extractRelayEndpoints drops relays missing ip or token', () => {
    const node: BinaryNode = {
        tag: 'transport',
        attrs: {},
        content: [
            { tag: 'relay', attrs: { ip: '1.1.1.1' }, content: undefined },
            { tag: 'relay', attrs: { token: 'only-token' }, content: undefined }
        ]
    }
    assert.deepEqual(extractRelayEndpoints(node), [])
})
