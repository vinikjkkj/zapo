import type { WaSuccessPersistAttributes } from '@auth/types'
import { WA_STREAM_SIGNALING } from '@protocol/constants'
import { findNodeChild, hasNodeChild } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { base64ToBytesChecked } from '@util/bytes'
import { parseOptionalInt, parseStrictUnsignedInt } from '@util/primitives'

export type WaStreamControlNodeResult =
    | { readonly kind: 'xmlstreamend' }
    | { readonly kind: 'stream_error_code'; readonly code: number }
    | { readonly kind: 'stream_error_replaced' }
    | { readonly kind: 'stream_error_device_removed' }
    | { readonly kind: 'stream_error_ack'; readonly id?: string }
    | { readonly kind: 'stream_error_xml_not_well_formed' }
    | { readonly kind: 'stream_error_other' }

export function parseStreamControlNode(node: BinaryNode): WaStreamControlNodeResult | null {
    if (node.tag === WA_STREAM_SIGNALING.XML_STREAM_END_TAG) {
        return {
            kind: 'xmlstreamend'
        }
    }
    if (node.tag !== WA_STREAM_SIGNALING.STREAM_ERROR_TAG) {
        return null
    }

    const conflictNode = findNodeChild(node, WA_STREAM_SIGNALING.CONFLICT_TAG)
    if (conflictNode) {
        if (conflictNode.attrs.type === WA_STREAM_SIGNALING.REPLACED_TYPE) {
            return {
                kind: 'stream_error_replaced'
            }
        }
        return {
            kind: 'stream_error_device_removed'
        }
    }

    const codeRaw = node.attrs.code
    if (codeRaw) {
        const code = parseStrictUnsignedInt(codeRaw)
        if (code !== undefined) {
            return {
                kind: 'stream_error_code',
                code
            }
        }
    }

    const ackNode = findNodeChild(node, WA_STREAM_SIGNALING.ACK_TAG)
    if (ackNode) {
        return {
            kind: 'stream_error_ack',
            id: ackNode.attrs.id
        }
    }

    if (hasNodeChild(node, WA_STREAM_SIGNALING.XML_NOT_WELL_FORMED_TAG)) {
        return {
            kind: 'stream_error_xml_not_well_formed'
        }
    }

    return {
        kind: 'stream_error_other'
    }
}

export function parseCompanionEncStatic(
    value: string | undefined,
    onError?: (error: Error) => void
): Uint8Array | undefined {
    if (!value) {
        return undefined
    }
    try {
        return base64ToBytesChecked(value, 'success.companion_enc_static')
    } catch (error) {
        if (error instanceof Error) {
            onError?.(error)
        }
        return undefined
    }
}

export function parseSuccessPersistAttributes(
    node: BinaryNode,
    onCompanionParseError?: (error: Error) => void
): WaSuccessPersistAttributes {
    return {
        meLid: node.attrs.lid,
        meDisplayName: node.attrs.display_name,
        companionEncStatic: parseCompanionEncStatic(
            node.attrs.companion_enc_static,
            onCompanionParseError
        ),
        lastSuccessTs: parseOptionalInt(node.attrs.t),
        propsVersion: parseOptionalInt(node.attrs.props),
        abPropsVersion: parseOptionalInt(node.attrs.abprops),
        connectionLocation: node.attrs.location,
        accountCreationTs: parseOptionalInt(node.attrs.creation)
    }
}
