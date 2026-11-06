import type { Readable } from 'node:stream'

import { WaCatalogError } from '@client/catalog'
import { requireCatalogRecord } from '@client/events/catalog'
import type { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import { WA_CATALOG } from '@protocol/catalog'
import { TEXT_DECODER, TEXT_ENCODER } from '@util/bytes'
import { tryAsRecord } from '@util/coercion'

/** Executes one catalog HTTP query with bounded response size and cancellation.
 * The deadline and connection cancellation cover both headers and body consumption.
 * Transport failures become WaCatalogError without exposing raw errors or credentials.
 * Authentication values are sent only in the request body.
 * @example `const data = await queryCatalogGraphql(transfer, query)`
 */
export async function queryCatalogGraphql(
    transfer: WaMediaTransferClient,
    query: {
        readonly owner: boolean
        readonly token: string
        readonly docId: string
        readonly variables: Readonly<Record<string, unknown>>
        readonly locale: string
        readonly signal: AbortSignal
    }
): Promise<Record<string, unknown>> {
    const controller = new AbortController()
    let responseBody: Readable | null | undefined
    const abort = (error: WaCatalogError): void => {
        controller.abort(error)
        responseBody?.destroy()
    }
    const onDisconnect = (): void =>
        abort(new WaCatalogError('CATALOG_DISCONNECTED', 'catalog connection closed'))
    const timer = setTimeout(
        () => abort(new WaCatalogError('CATALOG_QUERY_TIMEOUT', 'catalog query timed out')),
        WA_CATALOG.QUERY_TIMEOUT_MS
    )
    query.signal.addEventListener('abort', onDisconnect, { once: true })
    try {
        if (query.signal.aborted) onDisconnect()
        if (controller.signal.aborted) throw controller.signal.reason
        const body = TEXT_ENCODER.encode(
            JSON.stringify({
                access_token: query.token,
                doc_id: query.docId,
                variables: query.variables,
                ...(query.owner ? { locale: query.locale } : { lang: query.locale })
            })
        )
        const response = await transfer.uploadStream({
            url: query.owner ? WA_CATALOG.OWNER_ENDPOINT : WA_CATALOG.PUBLIC_ENDPOINT,
            method: 'POST',
            headers: { Accept: 'application/json' },
            contentType: 'application/json',
            body,
            signal: controller.signal,
            timeoutMs: WA_CATALOG.QUERY_TIMEOUT_MS
        })
        responseBody = response.body
        if (controller.signal.aborted) throw controller.signal.reason
        const bytes = await transfer.readResponseBytes(response, WA_CATALOG.MAX_RESPONSE_BYTES)
        if (controller.signal.aborted) throw controller.signal.reason
        let payload: Record<string, unknown>
        try {
            payload = requireCatalogRecord(JSON.parse(TEXT_DECODER.decode(bytes)))
        } catch {
            throw new WaCatalogError(
                'CATALOG_INVALID_RESPONSE',
                'catalog response is not a JSON object'
            )
        }
        const error = tryAsRecord(Array.isArray(payload.errors) ? payload.errors[0] : payload.error)
        if (error || (Array.isArray(payload.errors) && payload.errors.length > 0) || !response.ok) {
            const remoteCode = typeof error?.code === 'number' ? error.code : response.status
            throw new WaCatalogError('CATALOG_QUERY_FAILED', 'catalog query failed', remoteCode)
        }
        return requireCatalogRecord(payload.data)
    } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason
        if (error instanceof WaCatalogError) throw error
        throw new WaCatalogError('CATALOG_QUERY_FAILED', 'catalog transport failed')
    } finally {
        clearTimeout(timer)
        query.signal.removeEventListener('abort', onDisconnect)
        responseBody?.destroy()
    }
}
