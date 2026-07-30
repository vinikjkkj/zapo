import { promisify } from 'node:util'
import { deflate, unzip } from 'node:zlib'

import { proto, type Proto } from '@proto'
import { toBytesView } from '@util/bytes'

const deflateAsync = promisify(deflate)
const unzipAsync = promisify(unzip)

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
