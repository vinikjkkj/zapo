/** Builders for `<stream:error/>` stanzas pushed to the client. */

import type { BinaryNode } from '../../transport/codec'

const STREAM_ERROR_TAG = 'stream:error'

export function buildStreamErrorCode(code: number): BinaryNode {
    return {
        tag: STREAM_ERROR_TAG,
        attrs: { code: String(code) }
    }
}

export function buildStreamErrorReplaced(): BinaryNode {
    return {
        tag: STREAM_ERROR_TAG,
        attrs: {},
        content: [
            {
                tag: 'conflict',
                attrs: { type: 'replaced' }
            }
        ]
    }
}

export function buildStreamErrorDeviceRemoved(): BinaryNode {
    return {
        tag: STREAM_ERROR_TAG,
        attrs: {},
        content: [
            {
                tag: 'conflict',
                attrs: { type: 'device_removed' }
            }
        ]
    }
}

export function buildStreamErrorAck(id: string): BinaryNode {
    return {
        tag: STREAM_ERROR_TAG,
        attrs: {},
        content: [
            {
                tag: 'ack',
                attrs: { id }
            }
        ]
    }
}

export function buildStreamErrorXmlNotWellFormed(): BinaryNode {
    return {
        tag: STREAM_ERROR_TAG,
        attrs: {},
        content: [
            {
                tag: 'xml-not-well-formed',
                attrs: {}
            }
        ]
    }
}
