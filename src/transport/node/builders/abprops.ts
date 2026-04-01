import { WA_ABPROPS_PROTOCOL_VERSION } from '@protocol/abprops'
import { WA_DEFAULTS, WA_XMLNS } from '@protocol/constants'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export function buildGetAbPropsIq(options?: {
    readonly hash?: string | null
    readonly refreshId?: number | null
}): BinaryNode {
    const propsAttrs: Record<string, string> = {
        protocol: WA_ABPROPS_PROTOCOL_VERSION
    }
    if (options?.hash) {
        propsAttrs.hash = options.hash
    }
    if (options?.refreshId !== undefined && options.refreshId !== null) {
        propsAttrs.refresh_id = `${options.refreshId}`
    }
    return buildIqNode('get', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.ABPROPS, [
        {
            tag: 'props',
            attrs: propsAttrs
        }
    ])
}
