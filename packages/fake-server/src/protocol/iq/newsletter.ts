/** Builds the `newsletter/my_addons` IQ result expected by the lib. */

import type { BinaryNode } from '../../transport/codec'

import { buildIqResult } from './router'

export function buildNewsletterMyAddonsResult(iq: BinaryNode): BinaryNode {
    const result = buildIqResult(iq)
    return {
        ...result,
        content: [
            {
                tag: 'my_addons',
                attrs: {}
            }
        ]
    }
}
