import type { Logger } from '../../infra/log/types'
import { WA_IQ_TYPES, WA_NODE_TAGS } from '../../protocol/constants'
import { toError } from '../../util/primitives'
import type { BinaryNode } from '../types'

import { findNodeChild } from './helpers'

export function buildIqNode(
    type: 'get' | 'set',
    to: string,
    xmlns: string,
    content?: BinaryNode['content'],
    attrs: Readonly<Record<string, string>> = {}
): BinaryNode {
    return {
        tag: WA_NODE_TAGS.IQ,
        attrs: {
            to,
            type,
            xmlns,
            ...attrs
        },
        ...(content !== undefined ? { content } : {})
    }
}

export function parseIqError(node: BinaryNode): {
    readonly code: string
    readonly text: string
    readonly numericCode?: number
} {
    const errorNode = findNodeChild(node, WA_NODE_TAGS.ERROR)
    const code = errorNode?.attrs.code ?? node.attrs.type ?? 'unknown'
    const text = errorNode?.attrs.text ?? errorNode?.attrs.type ?? 'unknown'
    const parsedCode = Number.parseInt(code, 10)
    return {
        code,
        text,
        ...(Number.isSafeInteger(parsedCode) ? { numericCode: parsedCode } : {})
    }
}

export function assertIqResult(node: BinaryNode, context: string): void {
    if (node.tag !== WA_NODE_TAGS.IQ) {
        throw new Error(`${context} returned non-iq node (${node.tag})`)
    }
    if (node.attrs.type === WA_IQ_TYPES.RESULT) {
        return
    }
    const error = parseIqError(node)
    throw new Error(`${context} iq failed (${error.code}: ${error.text})`)
}

export async function queryWithContext(
    query: (node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode>,
    logger: Logger,
    context: string,
    node: BinaryNode,
    timeoutMs: number,
    contextData: Readonly<Record<string, unknown>> = {}
): Promise<BinaryNode> {
    try {
        return await query(node, timeoutMs)
    } catch (error) {
        const normalized = toError(error)
        logger.warn('query failed', {
            context,
            message: normalized.message,
            tag: node.tag,
            id: node.attrs.id,
            type: node.attrs.type,
            ...contextData
        })
        throw normalized
    }
}
