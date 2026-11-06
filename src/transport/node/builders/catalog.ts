import { WA_CATALOG } from '@protocol/catalog'
import { WA_DEFAULTS } from '@protocol/defaults'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

/** Requests delivery of an account nonce through a business notification.
 * @example `const node = buildCatalogNonceIq()`
 */
export function buildCatalogNonceIq(): BinaryNode {
    return buildIqNode('get', WA_DEFAULTS.HOST_DOMAIN, WA_CATALOG.AUTH_XMLNS, undefined, {
        smax_id: WA_CATALOG.NONCE_SMAX_ID
    })
}

/** Exchanges a single-use nonce for a private catalog account token.
 * @example `const node = buildCatalogTokenIq(nonce)`
 */
export function buildCatalogTokenIq(nonce: string): BinaryNode {
    return buildIqNode(
        'get',
        WA_DEFAULTS.HOST_DOMAIN,
        WA_CATALOG.AUTH_XMLNS,
        [{ tag: 'parameters', attrs: {}, content: [{ tag: 'code', attrs: {}, content: nonce }] }],
        { smax_id: WA_CATALOG.TOKEN_SMAX_ID }
    )
}
