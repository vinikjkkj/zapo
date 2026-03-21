import { WA_MESSAGE_TAGS, WA_NODE_TAGS } from '@protocol/constants'
import type { WaParsedRetryRequest, WaRetryKeyBundle } from '@retry/types'
import {
    SIGNAL_KEY_DATA_LENGTH,
    SIGNAL_KEY_ID_LENGTH,
    SIGNAL_REGISTRATION_ID_LENGTH,
    SIGNAL_SIGNATURE_LENGTH
} from '@signal/api/constants'
import { decodeNodeContentBase64OrBytes, findNodeChildrenByTags } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt } from '@util/primitives'

function parseFixedLengthBytes(
    value: BinaryNode['content'],
    byteLength: number,
    field: string
): Uint8Array {
    const out = decodeNodeContentBase64OrBytes(value, field)
    if (out.byteLength !== byteLength) {
        throw new Error(`${field} must be ${byteLength} bytes`)
    }
    return out
}

function parseBigEndianUint(bytes: Uint8Array, field: string): number {
    switch (bytes.byteLength) {
        case 1:
            return bytes[0]
        case 2:
            return (bytes[0] << 8) | bytes[1]
        case 3:
            return ((bytes[0] << 16) | (bytes[1] << 8) | bytes[2]) >>> 0
        case 4:
            return ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0
        default:
            throw new Error(`${field} has invalid byte length`)
    }
}

function requireNode(node: BinaryNode | undefined, message: string): BinaryNode {
    if (!node) {
        throw new Error(message)
    }
    return node
}

function parseRetryKeyBundle(node: BinaryNode | undefined): WaRetryKeyBundle | undefined {
    if (!node) {
        return undefined
    }
    const [identityNode, signedKeyNode, keyNode, deviceIdentityNode] = findNodeChildrenByTags(
        node,
        [WA_NODE_TAGS.IDENTITY, WA_NODE_TAGS.SKEY, WA_NODE_TAGS.KEY, WA_NODE_TAGS.DEVICE_IDENTITY]
    )

    const identity = requireNode(identityNode, 'retry keys section missing identity or skey')
    const signedKey = requireNode(signedKeyNode, 'retry keys section missing identity or skey')
    const [signedKeyIdNode, signedKeyValueNode, signedKeySignatureNode] = findNodeChildrenByTags(
        signedKey,
        [WA_NODE_TAGS.ID, WA_NODE_TAGS.VALUE, WA_NODE_TAGS.SIGNATURE]
    )
    const signedKeyId = requireNode(signedKeyIdNode, 'retry keys section has incomplete skey')
    const signedKeyValue = requireNode(signedKeyValueNode, 'retry keys section has incomplete skey')
    const signedKeySignature = requireNode(
        signedKeySignatureNode,
        'retry keys section has incomplete skey'
    )

    let keyIdNode: BinaryNode | undefined
    let keyValueNode: BinaryNode | undefined
    if (keyNode) {
        const keyNodes = findNodeChildrenByTags(keyNode, [WA_NODE_TAGS.ID, WA_NODE_TAGS.VALUE])
        keyIdNode = keyNodes[0]
        keyValueNode = keyNodes[1]
    }
    const keyId = keyNode ? requireNode(keyIdNode, 'retry keys section has incomplete key') : null
    const keyValue = keyNode
        ? requireNode(keyValueNode, 'retry keys section has incomplete key')
        : null
    return {
        identity: parseFixedLengthBytes(
            identity.content,
            SIGNAL_KEY_DATA_LENGTH,
            'retry.keys.identity'
        ),
        deviceIdentity: deviceIdentityNode
            ? decodeNodeContentBase64OrBytes(
                  deviceIdentityNode.content,
                  'retry.keys.device-identity'
              )
            : undefined,
        key:
            keyId && keyValue
                ? {
                      id: parseBigEndianUint(
                          parseFixedLengthBytes(
                              keyId.content,
                              SIGNAL_KEY_ID_LENGTH,
                              'retry.keys.key.id'
                          ),
                          'retry.keys.key.id'
                      ),
                      publicKey: parseFixedLengthBytes(
                          keyValue.content,
                          SIGNAL_KEY_DATA_LENGTH,
                          'retry.keys.key.value'
                      )
                  }
                : undefined,
        skey: {
            id: parseBigEndianUint(
                parseFixedLengthBytes(
                    signedKeyId.content,
                    SIGNAL_KEY_ID_LENGTH,
                    'retry.keys.skey.id'
                ),
                'retry.keys.skey.id'
            ),
            publicKey: parseFixedLengthBytes(
                signedKeyValue.content,
                SIGNAL_KEY_DATA_LENGTH,
                'retry.keys.skey.value'
            ),
            signature: parseFixedLengthBytes(
                signedKeySignature.content,
                SIGNAL_SIGNATURE_LENGTH,
                'retry.keys.skey.signature'
            )
        }
    }
}

export function parseRetryReceiptRequest(node: BinaryNode): WaParsedRetryRequest | null {
    if (node.tag !== WA_MESSAGE_TAGS.RECEIPT) {
        return null
    }
    const receiptType =
        node.attrs.type === 'retry' || node.attrs.type === 'enc_rekey_retry'
            ? node.attrs.type
            : null
    if (!receiptType) {
        return null
    }
    const stanzaId = node.attrs.id
    const from = node.attrs.from
    if (!stanzaId || !from) {
        throw new Error('retry receipt is missing id/from attrs')
    }

    const [retryNode, registrationNode, keysNode] = findNodeChildrenByTags(node, [
        'retry',
        WA_NODE_TAGS.REGISTRATION,
        'keys'
    ])

    const retry = requireNode(retryNode, 'retry receipt is missing retry child')
    const registrationNodeValue = requireNode(
        registrationNode,
        'retry receipt is missing registration child'
    )
    const originalMsgId = retry.attrs.id
    if (!originalMsgId) {
        throw new Error('retry receipt is missing retry.id')
    }

    const registration = parseFixedLengthBytes(
        registrationNodeValue.content,
        SIGNAL_REGISTRATION_ID_LENGTH,
        'retry.registration'
    )

    return {
        type: receiptType,
        stanzaId,
        from,
        participant: node.attrs.participant,
        recipient: node.attrs.recipient,
        originalMsgId,
        retryCount: parseOptionalInt(retry.attrs.count) ?? 0,
        retryReason: parseOptionalInt(retry.attrs.error ?? node.attrs.error),
        t: retry.attrs.t ?? node.attrs.t,
        regId: parseBigEndianUint(registration, 'retry.registration'),
        keyBundle: parseRetryKeyBundle(keysNode)
    }
}
