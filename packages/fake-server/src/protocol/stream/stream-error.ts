/**
 * Builders for `<stream:error/>` stanzas.
 *
 * Source: /deobfuscated/WAWebHandleS/WAWebHandleStreamError.js
 *
 * Variants the WhatsApp Web client recognizes (parser at line 2 of the
 * deobfuscated file):
 *
 *   <stream:error code="515"/>                          → force login (5xx)
 *   <stream:error code="516"/>                          → force logout (5xx)
 *   <stream:error code="<5xx>"/>                        → other 5xx → resume socket
 *   <stream:error><conflict type="replaced"/></stream:error>        → replaced
 *   <stream:error><conflict type="device_removed"/></stream:error>  → device removed
 *   <stream:error><ack id="..."/></stream:error>                    → ack error
 *   <stream:error><xml-not-well-formed/></stream:error>             → bad xml
 *
 * Each builder returns a `BinaryNode` ready to be pushed via
 * `pipeline.sendStanza`. The fake server only knows how to *send* these —
 * the *interpretation* lives entirely on the client side.
 */

import type { BinaryNode } from '../../transport/codec'

const STREAM_ERROR_TAG = 'stream:error'

/** `<stream:error code="<n>"/>` — used for 515 (force login) and 516 (force logout). */
export function buildStreamErrorCode(code: number): BinaryNode {
    return {
        tag: STREAM_ERROR_TAG,
        attrs: { code: String(code) }
    }
}

/** `<stream:error><conflict type="replaced"/></stream:error>`. */
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

/** `<stream:error><conflict type="device_removed"/></stream:error>`. */
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

/** `<stream:error><ack id="..."/></stream:error>`. */
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

/** `<stream:error><xml-not-well-formed/></stream:error>`. */
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
