import type { Readable } from 'node:stream'
import { promisify } from 'node:util'
import { deflate, unzip } from 'node:zlib'

import { proto, type Proto } from '@proto'
import { toBytesView } from '@util/bytes'
import { PROTO_STREAM_EVENT_KINDS, streamProtoFields } from '@util/proto-stream'
import { PROTO_WIRE_TYPES } from '@util/protoscan'

const deflateAsync = promisify(deflate)
const unzipAsync = promisify(unzip)

export const GROUP_HISTORY_FIELDS = Object.freeze({
    MESSAGES: 1,
    OUT_OF_WINDOW_PINNED_MESSAGES: 4
} as const)

/**
 * Wire form of a group-history bundle: the zlib-compressed blob that is
 * encrypted and uploaded to the media CDN, plus the uncompressed protobuf
 * bytes the sender-side reporting token is computed over.
 */
export interface WaGroupHistoryBundleEncoding {
    /** zlib-compressed `GroupHistory` payload - the blob that gets uploaded. */
    readonly compressed: Uint8Array
    /** Uncompressed `GroupHistory` protobuf bytes. */
    readonly encoded: Uint8Array
}

/**
 * Serializes the messages shared with a member who just joined a group into a
 * `GroupHistory` payload, compressed the way the receiver expects.
 *
 * `outOfWindowPinnedMessages` carries pinned messages older than the shared
 * window, which the receiver injects regardless of the age cutoff.
 *
 * Both arrays are handed to the encoder as-is. The generated type asks for
 * mutable arrays, but encoding only reads them, so the assertion avoids
 * copying every message of the bundle for nothing.
 */
export async function encodeGroupHistoryBundle(
    messages: readonly Proto.IWebMessageInfo[],
    outOfWindowPinnedMessages?: readonly Proto.IWebMessageInfo[]
): Promise<WaGroupHistoryBundleEncoding> {
    const encoded = proto.GroupHistory.encode({
        messages: messages as Proto.IWebMessageInfo[],
        outOfWindowPinnedMessages: outOfWindowPinnedMessages?.length
            ? (outOfWindowPinnedMessages as Proto.IWebMessageInfo[])
            : undefined
    }).finish()
    const compressed = toBytesView(await deflateAsync(encoded))
    return { compressed, encoded }
}

/**
 * Inflates and decodes a downloaded group-history bundle blob.
 *
 * @throws when the blob is not valid zlib or does not decode as `GroupHistory`.
 */
export async function decodeGroupHistoryBundle(blob: Uint8Array): Promise<Proto.GroupHistory> {
    const inflated = toBytesView(await unzipAsync(blob))
    return proto.GroupHistory.decode(inflated)
}

/**
 * `outOfWindow` marks a pinned message from outside the shared window, which the
 * receiver keeps regardless of the age cutoff.
 */
export type WaGroupHistoryMessageHandler = (
    message: Proto.WebMessageInfo,
    outOfWindow: boolean
) => void | Promise<void>

/**
 * Streaming counterpart of {@link decodeGroupHistoryBundle}: walks an inflated
 * bundle and hands out one message at a time, so peak memory tracks the largest
 * single message instead of the whole bundle. `GroupHistory` carries its messages
 * as top-level repeated fields, so no record needs descending into.
 *
 * Comment messages and associated-message lists are skipped, matching what the
 * buffered consumer reads.
 *
 * @throws when the stream is truncated or a record exceeds `maxRecordBytes`.
 */
export async function streamGroupHistoryBundle(
    inflated: Readable,
    onMessage: WaGroupHistoryMessageHandler,
    maxRecordBytes?: number
): Promise<void> {
    await streamProtoFields(
        inflated,
        (event) => {
            if (
                event.kind !== PROTO_STREAM_EVENT_KINDS.FIELD ||
                event.wireType !== PROTO_WIRE_TYPES.LEN
            ) {
                return undefined
            }
            if (event.fieldNumber === GROUP_HISTORY_FIELDS.MESSAGES) {
                return onMessage(proto.WebMessageInfo.decode(event.value), false)
            }
            if (event.fieldNumber === GROUP_HISTORY_FIELDS.OUT_OF_WINDOW_PINNED_MESSAGES) {
                return onMessage(proto.WebMessageInfo.decode(event.value), true)
            }
            return undefined
        },
        maxRecordBytes !== undefined ? { maxFieldBytes: maxRecordBytes } : {}
    )
}
