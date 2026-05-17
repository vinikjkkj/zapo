import { WA_NODE_TAGS } from '@protocol/constants'
import {
    SIGNAL_KEY_DATA_LENGTH,
    SIGNAL_KEY_ID_LENGTH,
    SIGNAL_SIGNATURE_LENGTH
} from '@signal/api/constants'
import { decodeNodeContentBase64OrBytes, findNodeChildrenByTags } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'

export function decodeExactLength(
    value: BinaryNode['content'],
    field: string,
    expectedLength: number
): Uint8Array {
    const bytes = decodeNodeContentBase64OrBytes(value, field)
    if (bytes.byteLength !== expectedLength) {
        throw new Error(`${field} must be ${expectedLength} bytes`)
    }
    return bytes
}

export function parseUint(bytes: Uint8Array, field: string): number {
    if (bytes.byteLength === 1) {
        return bytes[0]
    }
    if (bytes.byteLength === 2) {
        return (bytes[0] << 8) | bytes[1]
    }
    if (bytes.byteLength === 3) {
        return (bytes[0] << 16) | (bytes[1] << 8) | bytes[2]
    }
    if (bytes.byteLength === 4) {
        return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false)
    }
    throw new Error(`${field} has invalid byte length`)
}

export interface ParsedSignalKeyBundleNode {
    readonly identity: Uint8Array
    readonly signedKey: {
        readonly id: number
        readonly publicKey: Uint8Array
        readonly signature: Uint8Array
    }
    readonly oneTimeKey?: {
        readonly id: number
        readonly publicKey: Uint8Array
    }
    readonly deviceIdentity?: Uint8Array
}

/**
 * Parses the shared `<identity><skey id|value|signature><key id|value><device-identity>`
 * shape used by session pre-key bundles, missing pre-key device bundles, and retry
 * receipt key bundles. Caller is responsible for parsing the `<registration>` node
 * separately when it lives at the same level (it's omitted from retry bundles).
 */
export function parseSignalKeyBundleFromNode(
    node: BinaryNode,
    fieldPrefix: string
): ParsedSignalKeyBundleNode {
    const [identityNode, signedKeyNode, oneTimeKeyNode, deviceIdentityNode] =
        findNodeChildrenByTags(node, [
            WA_NODE_TAGS.IDENTITY,
            WA_NODE_TAGS.SKEY,
            WA_NODE_TAGS.KEY,
            WA_NODE_TAGS.DEVICE_IDENTITY
        ] as const)
    if (!identityNode) {
        throw new Error(`${fieldPrefix} missing identity node`)
    }
    if (!signedKeyNode) {
        throw new Error(`${fieldPrefix} missing signed pre-key node`)
    }

    const identity = decodeExactLength(
        identityNode.content,
        `${fieldPrefix}.identity`,
        SIGNAL_KEY_DATA_LENGTH
    )

    const [signedKeyIdNode, signedKeyValueNode, signedKeySignatureNode] = findNodeChildrenByTags(
        signedKeyNode,
        [WA_NODE_TAGS.ID, WA_NODE_TAGS.VALUE, WA_NODE_TAGS.SIGNATURE] as const
    )
    if (!signedKeyIdNode || !signedKeyValueNode || !signedKeySignatureNode) {
        throw new Error(`${fieldPrefix} signed pre-key is incomplete`)
    }
    const signedKey = {
        id: parseUint(
            decodeExactLength(
                signedKeyIdNode.content,
                `${fieldPrefix}.skey.id`,
                SIGNAL_KEY_ID_LENGTH
            ),
            `${fieldPrefix}.skey.id`
        ),
        publicKey: decodeExactLength(
            signedKeyValueNode.content,
            `${fieldPrefix}.skey.value`,
            SIGNAL_KEY_DATA_LENGTH
        ),
        signature: decodeExactLength(
            signedKeySignatureNode.content,
            `${fieldPrefix}.skey.signature`,
            SIGNAL_SIGNATURE_LENGTH
        )
    }

    let oneTimeKey: ParsedSignalKeyBundleNode['oneTimeKey']
    if (oneTimeKeyNode) {
        const [oneTimeKeyIdNode, oneTimeKeyValueNode] = findNodeChildrenByTags(oneTimeKeyNode, [
            WA_NODE_TAGS.ID,
            WA_NODE_TAGS.VALUE
        ] as const)
        if (!oneTimeKeyIdNode || !oneTimeKeyValueNode) {
            throw new Error(`${fieldPrefix} one-time pre-key is incomplete`)
        }
        oneTimeKey = {
            id: parseUint(
                decodeExactLength(
                    oneTimeKeyIdNode.content,
                    `${fieldPrefix}.key.id`,
                    SIGNAL_KEY_ID_LENGTH
                ),
                `${fieldPrefix}.key.id`
            ),
            publicKey: decodeExactLength(
                oneTimeKeyValueNode.content,
                `${fieldPrefix}.key.value`,
                SIGNAL_KEY_DATA_LENGTH
            )
        }
    }

    let deviceIdentity: Uint8Array | undefined
    if (deviceIdentityNode) {
        deviceIdentity = decodeNodeContentBase64OrBytes(
            deviceIdentityNode.content,
            `${fieldPrefix}.device-identity`
        )
    }

    return { identity, signedKey, oneTimeKey, deviceIdentity }
}
