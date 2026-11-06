import assert from 'node:assert/strict'
import test from 'node:test'

import { buildNewsletterMessageContent } from '@client/newsletter/content'
import { createNoopLogger } from '@infra/log/types'
import type { WaSendBusinessMessage } from '@message/types'

const kinds: readonly WaSendBusinessMessage['type'][] = [
    'buttons',
    'interactive',
    'list',
    'carousel',
    'native-form',
    'payment',
    'charge',
    'catalog',
    'product'
]
for (const type of kinds) {
    test(`newsletter rejects typed ${type} before upload or raw protobuf encoding`, async () => {
        await assert.rejects(
            buildNewsletterMessageContent({ logger: createNoopLogger() }, {
                type
            } as WaSendBusinessMessage),
            new RegExp(`newsletter sends do not accept typed business content: ${type}`)
        )
    })
}
