import assert from 'node:assert/strict'
import test from 'node:test'

import { parseMediaConnResponse } from '@media/transfer/conn'
import type { BinaryNode } from '@transport/types'

test('media conn parser validates hosts/auth and ttl semantics', () => {
    const now = 1_000
    const response: BinaryNode = {
        tag: 'iq',
        attrs: { type: 'result' },
        content: [
            {
                tag: 'media_conn',
                attrs: { auth: 'token', ttl: '60' },
                content: [
                    { tag: 'host', attrs: { hostname: 'mmg.whatsapp.net' }, content: undefined },
                    {
                        tag: 'host',
                        attrs: { hostname: 'fallback.host', type: 'fallback' },
                        content: undefined
                    }
                ]
            }
        ]
    }

    const parsed = parseMediaConnResponse(response, now)
    assert.equal(parsed.auth, 'token')
    assert.equal(parsed.hosts.length, 2)
    assert.equal(parsed.expiresAtMs, now + 60_000)

    assert.throws(
        () => parseMediaConnResponse({ tag: 'iq', attrs: { type: 'result' } }, now),
        /missing media_conn node/
    )
})
