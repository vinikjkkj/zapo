import { WA_DEFAULTS, WA_IQ_TYPES, WA_NODE_TAGS, WA_XMLNS } from '@protocol/constants'
import { decodeNodeContentUtf8OrBytes, findNodeChild } from '@transport/node/helpers'
import { decodeMexArgoResponse, isMexArgoDecoderAvailable } from '@transport/node/mex/argo-decoder'
import { assertIqResult } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'
import { TEXT_DECODER } from '@util/bytes'
import { toError } from '@util/primitives'

const MEX_DEFAULT_TIMEOUT_MS = 32_000

export interface WaMexQuerySocket {
    readonly query: (node: BinaryNode, timeoutMs: number) => Promise<BinaryNode>
}

export interface WaMexQueryArgs {
    readonly docId: string
    readonly clientDocId: string
    /** Passed verbatim — caller wraps under `input` only when the op's schema requires it. */
    readonly variables: Readonly<Record<string, unknown>>
    readonly opName: string
    readonly timeoutMs?: number
    readonly iqId?: string
}

export interface WaMexResponse {
    readonly raw: BinaryNode
    readonly data: unknown
}

interface MexGraphQlError {
    readonly message?: string
    readonly path?: readonly string[]
    readonly extensions?: { readonly error_code?: number; readonly severity?: string }
}

export async function dispatchMexQuery(
    socket: WaMexQuerySocket,
    args: WaMexQueryArgs
): Promise<WaMexResponse> {
    const body = JSON.stringify({
        queryId: args.clientDocId,
        variables: args.variables
    })
    const node: BinaryNode = {
        tag: WA_NODE_TAGS.IQ,
        attrs: {
            ...(args.iqId ? { id: args.iqId } : {}),
            to: WA_DEFAULTS.HOST_DOMAIN,
            type: WA_IQ_TYPES.GET,
            xmlns: WA_XMLNS.MEX
        },
        content: [
            {
                tag: 'query',
                attrs: { query_id: args.docId },
                content: body
            }
        ]
    }
    const response = await socket.query(node, args.timeoutMs ?? MEX_DEFAULT_TIMEOUT_MS)
    assertIqResult(response, `mex/${args.opName}`)
    const data = await parseMexResultPayload(response, args.opName)
    return { raw: response, data }
}

async function parseMexResultPayload(node: BinaryNode, opName: string): Promise<unknown> {
    const result = findNodeChild(node, 'result')
    if (!result) {
        throw new Error(`mex/${opName} response missing <result>`)
    }
    const format = result.attrs.format ?? 'json'
    const rawBytes = decodeNodeContentUtf8OrBytes(result.content, `mex/${opName}/result`)

    if (format === 'argo') {
        if (!(await isMexArgoDecoderAvailable())) {
            throw new Error(
                `mex/${opName} argo response received but 'argo-codec' not installed; ${rawBytes.length}B; ` +
                    `strings: ${extractVisibleStrings(rawBytes)}`
            )
        }
        let decoded
        try {
            decoded = await decodeMexArgoResponse(rawBytes)
        } catch (error) {
            throw new Error(
                `mex/${opName} argo decode failed: ${toError(error).message}; ` +
                    `${rawBytes.length}B; strings: ${extractVisibleStrings(rawBytes)}`
            )
        }
        if (decoded.errors.length > 0) {
            const summary = decoded.errors
                .map((e) => {
                    const code = e.extensions?.error_code ?? e.extensions?.code ?? '?'
                    const sev = e.extensions?.severity
                    return `${code}${sev ? `/${String(sev)}` : ''}: ${e.message} @${e.path ?? ''}`
                })
                .join('; ')
            throw new Error(`mex/${opName} errors: ${summary}`)
        }
        return decoded.data
    }

    return extractGraphQlData(JSON.parse(TEXT_DECODER.decode(rawBytes)), opName)
}

function extractVisibleStrings(bytes: Uint8Array): string {
    return TEXT_DECODER.decode(bytes)
        .replace(/[\x00-\x1f\x7f-\xff]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function extractGraphQlData(payload: unknown, opName: string): unknown {
    const json = (payload ?? {}) as {
        readonly data?: unknown
        readonly errors?: readonly MexGraphQlError[]
    }
    if (json.errors && json.errors.length > 0) {
        const summary = json.errors
            .map(
                (e) =>
                    `${e.extensions?.error_code ?? '?'}: ${e.message ?? '?'} @${(e.path ?? []).join('.')}`
            )
            .join('; ')
        throw new Error(`mex/${opName} errors: ${summary}`)
    }
    return json.data ?? null
}
