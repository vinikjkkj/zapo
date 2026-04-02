import { WA_NODE_TAGS } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'

export function buildOfflineBatchNode(count: number): BinaryNode {
    return {
        tag: WA_NODE_TAGS.INFO_BULLETIN,
        attrs: {},
        content: [
            {
                tag: 'offline_batch',
                attrs: { count: String(count) },
                content: undefined
            }
        ]
    }
}
