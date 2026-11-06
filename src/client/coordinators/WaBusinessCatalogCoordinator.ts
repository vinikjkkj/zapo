import {
    WaCatalogError,
    type WaCatalogPage,
    type WaCatalogPageOptions,
    type WaCatalogProduct,
    type WaCatalogQueryOptions
} from '@client/catalog'
import { queryCatalogGraphql } from '@client/catalog-query'
import {
    parseCatalogNonceNotification,
    parseCatalogNonceResult,
    parseCatalogProduct,
    parseCatalogTokenResult,
    requireCatalogRecord
} from '@client/events/catalog'
import type { Logger } from '@infra/log/types'
import type { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import { WA_CATALOG } from '@protocol/catalog'
import { isLidJid, isUserJid, normalizeRecipientJid, toUserJid } from '@protocol/jid'
import { buildCatalogNonceIq, buildCatalogTokenIq } from '@transport/node/builders/catalog'
import { buildAckNode } from '@transport/node/builders/global'
import type { BinaryNode } from '@transport/types'

/** Catalog reads exposed through client.business. Account-owner reads authenticate internally.
 * @example `const page = await client.business.getCatalog(businessJid)`
 */
export interface WaBusinessCatalogOperations {
    /** Reads one catalog page, using the owner view for the current account.
     * @throws WaCatalogError on query, authentication, recovery or malformed-response failures.
     * @example `const next = await client.business.getCatalog(jid, { after: page.after ?? undefined })`
     */
    readonly getCatalog: (jid: string, options?: WaCatalogPageOptions) => Promise<WaCatalogPage>
    /** Reads a product, or null when the server reports it missing.
     * @throws WaCatalogError on other query/authentication failures.
     * @example `const product = await client.business.getProduct(jid, '123')`
     */
    readonly getProduct: (
        jid: string,
        productId: string,
        options?: WaCatalogQueryOptions
    ) => Promise<WaCatalogProduct | null>
}

interface CatalogDependencies {
    readonly logger: Logger
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number
    ) => Promise<BinaryNode>
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly mediaTransfer: WaMediaTransferClient
    readonly isOwnJid: (jid: string) => boolean
    readonly isConnected: () => boolean
    readonly getNonceWaitMs?: () => number
}

/** Validates image dimensions before issuing a catalog request. */
function positiveInteger(value: number, field: string): number {
    if (!Number.isSafeInteger(value) || value <= 0)
        throw new Error(`${field} must be a positive integer`)
    return value
}

/** Preserves opaque product IDs while rejecting empty or padded values. */
function productId(value: string): string {
    if (!value || value.trim() !== value)
        throw new Error('product ID must be non-empty without surrounding whitespace')
    return value
}

/** Normalizes optional catalog metadata and rejects non-string values. */
function nullableText(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null
    if (typeof value !== 'string')
        throw new WaCatalogError('CATALOG_INVALID_RESPONSE', 'catalog text is invalid')
    return value
}

/** Prevents work from a disconnected session from completing on a new connection. */
function assertActive(signal: AbortSignal): void {
    if (signal.aborted)
        throw new WaCatalogError('CATALOG_DISCONNECTED', 'catalog connection closed')
}

/** Creates catalog operations and private connection-scoped authentication state.
 * @example `const catalog = createBusinessCatalogCoordinator(dependencies)`
 */
export function createBusinessCatalogCoordinator(deps: CatalogDependencies) {
    let controller = new AbortController()
    let cachedToken: string | null = null
    let tokenPromise: Promise<string> | null = null
    let pendingNonce: {
        readonly resolve: (nonce: string) => void
        readonly reject: (error: unknown) => void
    } | null = null

    /** Registers the nonce waiter before its IQ and retries once after recovery is requested. */
    async function acquireToken(signal: AbortSignal): Promise<string> {
        for (let attempt = 0; attempt < 2; attempt++) {
            assertActive(signal)
            let pending!: NonNullable<typeof pendingNonce>
            const noncePromise = new Promise<string>((resolve, reject) => {
                pending = { resolve, reject }
            })
            pendingNonce = pending
            const configuredWait = deps.getNonceWaitMs?.() ?? WA_CATALOG.NONCE_WAIT_MS
            const waitMs =
                configuredWait > 0 && Number.isFinite(configuredWait)
                    ? configuredWait
                    : WA_CATALOG.NONCE_WAIT_MS
            const timer = setTimeout(
                () =>
                    pending.reject(
                        new WaCatalogError('CATALOG_NONCE_TIMEOUT', 'catalog nonce timed out')
                    ),
                waitMs
            )
            try {
                const [, nonce] = await Promise.all([
                    deps
                        .queryWithContext(
                            'business.catalogNonce',
                            buildCatalogNonceIq(),
                            WA_CATALOG.QUERY_TIMEOUT_MS
                        )
                        .then(parseCatalogNonceResult),
                    noncePromise
                ])
                assertActive(signal)
                const node = await deps.queryWithContext(
                    'business.catalogToken',
                    buildCatalogTokenIq(nonce),
                    WA_CATALOG.QUERY_TIMEOUT_MS
                )
                assertActive(signal)
                return parseCatalogTokenResult(node)
            } catch (error) {
                assertActive(signal)
                if (!(error instanceof WaCatalogError))
                    throw new WaCatalogError('CATALOG_AUTH_FAILED', 'catalog authentication failed')
                if (error.code !== 'CATALOG_INCORRECT_NONCE' || attempt !== 0) throw error
            } finally {
                clearTimeout(timer)
                if (pendingNonce === pending) pendingNonce = null
            }
        }
        throw new WaCatalogError('CATALOG_AUTH_FAILED', 'catalog authentication failed')
    }

    /** Shares one authentication exchange and caches its token only for the active connection. */
    function getToken(signal: AbortSignal): Promise<string> {
        if (cachedToken) return Promise.resolve(cachedToken)
        if (tokenPromise) return tokenPromise
        const promise = acquireToken(signal)
            .then((token) => {
                assertActive(signal)
                cachedToken = token
                return token
            })
            .finally(() => {
                if (tokenPromise === promise) tokenPromise = null
            })
        tokenPromise = promise
        return promise
    }

    /** Validates query options and captures the current connection cancellation signal. */
    function prepare(jid: string, options: WaCatalogQueryOptions | undefined) {
        const normalized = normalizeRecipientJid(jid)
        const userJid = toUserJid(normalized, { canonicalizeSignalServer: true })
        if (!isUserJid(userJid) && !isLidJid(userJid))
            throw new Error('catalog requires a user JID')
        const width = String(positiveInteger(options?.imageWidth ?? 100, 'imageWidth'))
        const height = String(positiveInteger(options?.imageHeight ?? 100, 'imageHeight'))
        const locale = (options?.locale ?? 'en_US').replace(/-/g, '_')
        if (!locale) throw new Error('catalog locale cannot be empty')
        if (!deps.isConnected())
            throw new WaCatalogError('CATALOG_DISCONNECTED', 'catalog requires a connected client')
        return {
            jid: userJid,
            width,
            height,
            locale,
            owner: deps.isOwnJid(userJid),
            signal: controller.signal
        }
    }

    /** Selects the public or owner GraphQL operation and invalidates rejected owner credentials. */
    async function query(
        request: ReturnType<typeof prepare>,
        publicId: string,
        ownerId: string,
        variables: Readonly<Record<string, unknown>>
    ) {
        const token = request.owner
            ? await getToken(request.signal)
            : WA_CATALOG.PUBLIC_APPLICATION_TOKEN
        assertActive(request.signal)
        try {
            const data = await queryCatalogGraphql(deps.mediaTransfer, {
                owner: request.owner,
                token,
                docId: request.owner ? ownerId : publicId,
                variables,
                locale: request.locale,
                signal: request.signal
            })
            assertActive(request.signal)
            return data
        } catch (error) {
            assertActive(request.signal)
            if (
                request.owner &&
                cachedToken === token &&
                error instanceof WaCatalogError &&
                (error.remoteCode === 190 || error.remoteCode === 400)
            )
                cachedToken = null
            throw error
        }
    }

    const operations: WaBusinessCatalogOperations = {
        getCatalog: async (jid, options) => {
            const request = prepare(jid, options)
            const data = await query(
                request,
                WA_CATALOG.PUBLIC_CATALOG_QUERY,
                WA_CATALOG.OWNER_CATALOG_QUERY,
                {
                    request: {
                        product_catalog: {
                            jid: request.jid,
                            width: request.width,
                            height: request.height,
                            limit: '10',
                            after: options?.after,
                            allow_shop_source: request.owner ? false : 'ALLOWSHOPSOURCE_FALSE'
                        },
                        ...(request.owner ? { platform: 'WEB' } : {})
                    }
                }
            )
            const container = requireCatalogRecord(
                data[
                    request.owner
                        ? 'xfb_whatsapp_catalog'
                        : 'xwa_product_catalog_get_product_catalog'
                ]
            )
            const catalog =
                container.product_catalog === null || container.product_catalog === undefined
                    ? null
                    : requireCatalogRecord(container.product_catalog)
            const values = catalog ? catalog.products : []
            if (!Array.isArray(values))
                throw new WaCatalogError('CATALOG_INVALID_RESPONSE', 'catalog products are invalid')
            const paging =
                catalog?.paging === null || catalog?.paging === undefined
                    ? null
                    : requireCatalogRecord(catalog.paging)
            return {
                products: values.map(parseCatalogProduct),
                after: nullableText(paging?.after),
                before: nullableText(paging?.before),
                catalogId: nullableText(catalog?.catalog_id),
                catalogName: nullableText(catalog?.catalog_name)
            }
        },
        getProduct: async (jid, id, options) => {
            productId(id)
            const request = prepare(jid, options)
            try {
                const data = await query(
                    request,
                    WA_CATALOG.PUBLIC_PRODUCT_QUERY,
                    WA_CATALOG.OWNER_PRODUCT_QUERY,
                    {
                        request: {
                            product: {
                                jid: request.jid,
                                product_id: id,
                                width: request.width,
                                height: request.height,
                                fetch_compliance_info: 'false'
                            }
                        }
                    }
                )
                const container = requireCatalogRecord(
                    data[
                        request.owner
                            ? 'xfb_whatsapp_catalog_product'
                            : 'xwa_product_catalog_get_product'
                    ]
                )
                const catalog = requireCatalogRecord(container.product_catalog)
                return parseCatalogProduct(catalog.product)
            } catch (error) {
                if (error instanceof WaCatalogError && error.remoteCode === 2498052) return null
                throw error
            }
        }
    }

    return {
        ...operations,
        handleCatalogNotification: async (node: BinaryNode): Promise<boolean> => {
            try {
                const nonce = parseCatalogNonceNotification(node)
                if (nonce === null) return false
                pendingNonce?.resolve(nonce)
            } catch (error) {
                if (!(error instanceof WaCatalogError)) throw error
                pendingNonce?.reject(error)
                deps.logger.trace('invalid catalog nonce consumed', { code: error.code })
            }
            // Consume malformed private pushes too, so generic events never expose the nonce.
            if (node.tag === 'notification' && node.attrs.id)
                await deps.sendNode(buildAckNode({ kind: 'notification', node }))
            return true
        },
        resetCatalog: (): void => {
            const error = new WaCatalogError('CATALOG_DISCONNECTED', 'catalog connection closed')
            controller.abort(error)
            controller = new AbortController()
            pendingNonce?.reject(error)
            pendingNonce = null
            cachedToken = null
            tokenPromise = null
        }
    }
}
