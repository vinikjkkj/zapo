import assert from 'node:assert/strict'
import test from 'node:test'

import { createNoopLogger } from '@infra/log/types'
import { WA_IQ_TYPES } from '@protocol/constants'
import { buildIqNode, parseIqError, queryWithContext } from '@transport'

test('transport barrel exports iq helpers with expected behavior', async () => {
    const iq = buildIqNode(WA_IQ_TYPES.GET, 's.whatsapp.net', 'w:test')
    assert.equal(iq.tag, 'iq')

    const parsed = parseIqError({
        tag: 'iq',
        attrs: { type: 'error' },
        content: [{ tag: 'error', attrs: { code: '500', type: 'internal' } }]
    })
    assert.equal(parsed.code, '500')

    await assert.rejects(
        () =>
            queryWithContext(
                async () => {
                    throw new Error('x')
                },
                createNoopLogger(),
                'ctx',
                iq,
                10
            ),
        /x/
    )
})
