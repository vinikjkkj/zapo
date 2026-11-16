import {
    WaCatalogError,
    type WaCatalogImage,
    type WaCatalogProduct,
    type WaCatalogVideo
} from '@client/catalog'
import { WA_CATALOG } from '@protocol/catalog'
import { WA_DEFAULTS } from '@protocol/defaults'
import { findNodeChild, getNodeTextContent } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { tryAsRecord } from '@util/coercion'

/** Requires a catalog object without retaining untyped response payloads.
 * @example `const record = requireCatalogRecord(data)`
 */
export function requireCatalogRecord(value: unknown): Record<string, unknown> {
    const record = tryAsRecord(value)
    if (!record) throw new WaCatalogError('CATALOG_INVALID_RESPONSE', 'catalog object is missing')
    return record
}

/** Requires a wire string without coercing malformed remote values. */
function requiredString(value: unknown): string {
    if (typeof value !== 'string') {
        throw new WaCatalogError('CATALOG_INVALID_RESPONSE', 'catalog string is missing')
    }
    return value
}

/** Normalizes absent and empty catalog strings to null. */
function nullableString(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null
    return requiredString(value)
}

/** Converts decimal thousandths to major units without accepting unsafe integers. */
function price(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        throw new WaCatalogError('CATALOG_INVALID_RESPONSE', 'catalog price is invalid')
    }
    const amount = Number(value)
    if (!Number.isSafeInteger(amount)) {
        throw new WaCatalogError('CATALOG_INVALID_RESPONSE', 'catalog price exceeds safe precision')
    }
    return amount / 1_000
}

/** Converts a public or owner GraphQL product to the library's typed view.
 * @example `const product = parseCatalogProduct(record)`
 */
export function parseCatalogProduct(value: unknown): WaCatalogProduct {
    const item = requireCatalogRecord(value)
    const media =
        item.media === null || item.media === undefined ? null : requireCatalogRecord(item.media)
    const images: WaCatalogImage[] = []
    const videos: WaCatalogVideo[] = []
    if (media?.images !== null && media?.images !== undefined) {
        if (!Array.isArray(media.images)) {
            throw new WaCatalogError('CATALOG_INVALID_RESPONSE', 'catalog images are invalid')
        }
        for (const value of media.images) {
            const image = requireCatalogRecord(value)
            images.push({
                id: requiredString(image.id),
                requestedUrl: requiredString(image.request_image_url),
                originalUrl: requiredString(image.original_image_url)
            })
        }
    }
    if (media?.videos !== null && media?.videos !== undefined) {
        if (!Array.isArray(media.videos)) {
            throw new WaCatalogError('CATALOG_INVALID_RESPONSE', 'catalog videos are invalid')
        }
        for (const value of media.videos) {
            const video = requireCatalogRecord(value)
            if (
                (video.original_video_url === null || video.original_video_url === undefined) &&
                (video.thumbnail_url === null || video.thumbnail_url === undefined)
            )
                continue
            videos.push({
                id: nullableString(video.id),
                originalUrl: nullableString(video.original_video_url),
                thumbnailUrl: nullableString(video.thumbnail_url)
            })
        }
    }
    const sale =
        item.sale_price === null || item.sale_price === undefined
            ? null
            : requireCatalogRecord(item.sale_price)
    return {
        id: requiredString(item.id),
        title: requiredString(item.name),
        description:
            item.description === null || item.description === undefined
                ? ''
                : requiredString(item.description),
        retailerId:
            item.retailer_id === null || item.retailer_id === undefined
                ? ''
                : requiredString(item.retailer_id),
        url: item.url === null || item.url === undefined ? '' : requiredString(item.url),
        currencyCode: nullableString(item.currency),
        price: price(item.price),
        salePrice: price(sale?.price),
        isHidden:
            item.is_hidden === true ||
            item.is_hidden === 'TRUE' ||
            item.is_hidden === 'ISHIDDEN_TRUE',
        isSanctioned: item.is_sanctioned === true,
        availability: nullableString(item.product_availability ?? item.availability),
        images,
        videos
    }
}

/** Checks a private account IQ result without including secret fields in errors.
 * @example `assertCatalogAuthResult(node)`
 */
export function assertCatalogAuthResult(node: BinaryNode): void {
    if (node.tag !== 'iq' || node.attrs.from !== WA_DEFAULTS.HOST_DOMAIN) {
        throw new WaCatalogError(
            'CATALOG_INVALID_RESPONSE',
            'invalid catalog authentication sender'
        )
    }
    if (node.attrs.type === 'result') return
    const raw = findNodeChild(node, 'error')?.attrs.code
    const numericCode = raw ? Number(raw) : NaN
    const code = Number.isSafeInteger(numericCode) ? numericCode : null
    throw new WaCatalogError(
        code === 431
            ? 'CATALOG_THROTTLED'
            : code === 432
              ? 'CATALOG_INCORRECT_NONCE'
              : 'CATALOG_AUTH_FAILED',
        'catalog authentication failed',
        code
    )
}

/** Parses nonce-request status; recovery is reported without the account email.
 * @example `parseCatalogNonceResult(node)`
 */
export function parseCatalogNonceResult(node: BinaryNode): void {
    assertCatalogAuthResult(node)
    const status = findNodeChild(node, 'result')?.attrs.status
    if (status === 'Success') return
    if (status === 'RecoveryRequired') {
        throw new WaCatalogError(
            'CATALOG_RECOVERY_REQUIRED',
            'catalog account recovery is required'
        )
    }
    throw new WaCatalogError('CATALOG_INVALID_RESPONSE', 'catalog nonce result is invalid')
}

/** Reads a private token from the successful exchange. Never log the return value.
 * @example `const token = parseCatalogTokenResult(node)`
 */
export function parseCatalogTokenResult(node: BinaryNode): string {
    assertCatalogAuthResult(node)
    const accessToken = getNodeTextContent(findNodeChild(node, 'access_token'))
    const cookies = getNodeTextContent(findNodeChild(node, 'session_cookies'))
    const businessPerson = findNodeChild(node, 'business_person')?.attrs.id
    if (!accessToken || cookies === undefined || !businessPerson) {
        throw new WaCatalogError('CATALOG_INVALID_RESPONSE', 'catalog token result is incomplete')
    }
    return accessToken
}

/** Reads the account nonce from its server notification or recovery bulletin.
 * Returns null for unrelated nodes. Never log the returned nonce.
 * @example `const nonce = parseCatalogNonceNotification(node)`
 */
export function parseCatalogNonceNotification(node: BinaryNode): string | null {
    if (node.tag === 'notification' && node.attrs.type === 'business') {
        const nonce = findNodeChild(node, 'wa_ad_account_nonce')
        if (!nonce || node.attrs.from !== WA_DEFAULTS.HOST_DOMAIN) return null
        const text = getNodeTextContent(nonce)
        if (!text || !node.attrs.id || !/^\d+$/.test(node.attrs.t ?? '')) {
            throw new WaCatalogError(
                'CATALOG_INVALID_RESPONSE',
                'catalog nonce notification is invalid'
            )
        }
        return text
    }
    if (
        node.tag === 'ib' &&
        (node.attrs.from === undefined || node.attrs.from === WA_DEFAULTS.HOST_DOMAIN)
    ) {
        const nonce = findNodeChild(node, 'recovery_nonce')
        if (nonce?.attrs.use_case === WA_CATALOG.RECOVERY_USE_CASE) {
            if (!nonce.attrs.code) {
                throw new WaCatalogError(
                    'CATALOG_INVALID_RESPONSE',
                    'catalog recovery nonce is invalid'
                )
            }
            return nonce.attrs.code
        }
    }
    return null
}
