/** Catalog image URLs. Upload the image before using it in a product message.
 * @example `const imageUrl = product.images[0]?.originalUrl`
 */
export interface WaCatalogImage {
    readonly id: string
    readonly requestedUrl: string
    readonly originalUrl: string
}

/** Catalog video URLs, independent of message media uploads.
 * @example `const url = product.videos[0]?.originalUrl`
 */
export interface WaCatalogVideo {
    readonly id: string | null
    readonly originalUrl: string | null
    readonly thumbnailUrl: string | null
}

/** A catalog product. Prices are major currency units; absent prices are null.
 * @example `const product = await client.business.getProduct(jid, productId)`
 */
export interface WaCatalogProduct {
    readonly id: string
    readonly title: string
    readonly description: string
    readonly retailerId: string
    readonly url: string
    readonly currencyCode: string | null
    readonly price: number | null
    readonly salePrice: number | null
    readonly isHidden: boolean
    readonly isSanctioned: boolean
    readonly availability: string | null
    readonly images: readonly WaCatalogImage[]
    readonly videos: readonly WaCatalogVideo[]
}

/** Image dimensions and response locale for catalog queries.
 * @example `const options: WaCatalogQueryOptions = { imageWidth: 300, imageHeight: 300 }`
 */
export interface WaCatalogQueryOptions {
    /** Positive integer; defaults to 100. */
    readonly imageWidth?: number
    /** Positive integer; defaults to 100. */
    readonly imageHeight?: number
    /** Defaults to en_US. Hyphens are converted to underscores. */
    readonly locale?: string
}

/** Explicit pagination for a catalog. No additional pages are fetched automatically.
 * @example `const options: WaCatalogPageOptions = { after: page.after ?? undefined }`
 */
export interface WaCatalogPageOptions extends WaCatalogQueryOptions {
    readonly after?: string
}

/** One catalog page. A null cursor means there is no next page.
 * Owner-only metadata is null when not supplied by the server.
 * @example `const page = await client.business.getCatalog(jid)`
 */
export interface WaCatalogPage {
    readonly products: readonly WaCatalogProduct[]
    readonly after: string | null
    readonly before: string | null
    readonly catalogId: string | null
    readonly catalogName: string | null
}

/** Catalog failure without raw server payloads or authentication material.
 * `remoteCode` is the server's numeric error code when available.
 * HTTP deadlines use CATALOG_QUERY_TIMEOUT; connection cancellation uses CATALOG_DISCONNECTED.
 * Other HTTP transport failures use CATALOG_QUERY_FAILED; IQ transport failures use CATALOG_AUTH_FAILED.
 * Raw transport errors are not retained because they may contain sensitive details.
 * @example `if (error instanceof WaCatalogError && error.code === 'CATALOG_RECOVERY_REQUIRED') requestAccountRecovery()`
 */
export class WaCatalogError extends Error {
    public readonly name = 'WaCatalogError'

    public constructor(
        public readonly code: string,
        message: string,
        public readonly remoteCode: number | null = null
    ) {
        super(message)
    }
}
