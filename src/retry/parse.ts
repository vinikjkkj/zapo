import { WA_MESSAGE_TAGS, WA_NODE_TAGS } from '@protocol/constants'
import type { WaParsedRetryRequest, WaRetryKeyBundle, WaRetryReceiptType } from '@retry/types'
import {
    SIGNAL_KEY_DATA_LENGTH,
    SIGNAL_KEY_ID_LENGTH,
    SIGNAL_REGISTRATION_ID_LENGTH,
    SIGNAL_SIGNATURE_LENGTH
} from '@signal/api/constants'
import { decodeNodeContentBase64OrBytes, findNodeChild } from '@transport/node/helpers'
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
    if (bytes.byteLength === 0 || bytes.byteLength > 4) {
        throw new Error(`${field} has invalid byte length`)
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes.byteLength === 1) {
        return view.getUint8(0)
    }
    if (bytes.byteLength === 2) {
        return view.getUint16(0)
    }
    return bytes.byteLength === 3 ? (view.getUint16(0) << 8) | view.getUint8(2) : view.getUint32(0)
}

function parseRetryType(value: string | undefined): WaRetryReceiptType | null {
    if (value === 'retry' || value === 'enc_rekey_retry') {
        return value
    }
    return null
}

function parseRetryOptionalInt(value: string | undefined): number | undefined {
    return parseOptionalInt(value)
}

function parseRetryCount(value: string | undefined): number {
    return parseRetryOptionalInt(value) ?? 0
}

function parseRetryReason(value: string | undefined): number | undefined {
    return parseRetryOptionalInt(value)
}

function parseRetryKeyBundle(node: BinaryNode | undefined): WaRetryKeyBundle | undefined {
    if (!node) {
        return undefined
    }
    const identityNode = findNodeChild(node, WA_NODE_TAGS.IDENTITY)
    const signedKeyNode = findNodeChild(node, WA_NODE_TAGS.SKEY)
    if (!identityNode || !signedKeyNode) {
        throw new Error('retry keys section missing identity or skey')
    }

    const signedKeyIdNode = findNodeChild(signedKeyNode, WA_NODE_TAGS.ID)
    const signedKeyValueNode = findNodeChild(signedKeyNode, WA_NODE_TAGS.VALUE)
    const signedKeySignatureNode = findNodeChild(signedKeyNode, WA_NODE_TAGS.SIGNATURE)
    if (!signedKeyIdNode || !signedKeyValueNode || !signedKeySignatureNode) {
        throw new Error('retry keys section has incomplete skey')
    }

    const keyNode = findNodeChild(node, WA_NODE_TAGS.KEY)
    const keyIdNode = keyNode ? findNodeChild(keyNode, WA_NODE_TAGS.ID) : undefined
    const keyValueNode = keyNode ? findNodeChild(keyNode, WA_NODE_TAGS.VALUE) : undefined
    if (keyNode && (!keyIdNode || !keyValueNode)) {
        throw new Error('retry keys section has incomplete key')
    }

    const deviceIdentityNode = findNodeChild(node, WA_NODE_TAGS.DEVICE_IDENTITY)
    return {
        identity: parseFixedLengthBytes(
            identityNode.content,
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
            keyIdNode && keyValueNode
                ? {
                      id: parseBigEndianUint(
                          parseFixedLengthBytes(
                              keyIdNode.content,
                              SIGNAL_KEY_ID_LENGTH,
                              'retry.keys.key.id'
                          ),
                          'retry.keys.key.id'
                      ),
                      publicKey: parseFixedLengthBytes(
                          keyValueNode.content,
                          SIGNAL_KEY_DATA_LENGTH,
                          'retry.keys.key.value'
                      )
                  }
                : undefined,
        skey: {
            id: parseBigEndianUint(
                parseFixedLengthBytes(
                    signedKeyIdNode.content,
                    SIGNAL_KEY_ID_LENGTH,
                    'retry.keys.skey.id'
                ),
                'retry.keys.skey.id'
            ),
            publicKey: parseFixedLengthBytes(
                signedKeyValueNode.content,
                SIGNAL_KEY_DATA_LENGTH,
                'retry.keys.skey.value'
            ),
            signature: parseFixedLengthBytes(
                signedKeySignatureNode.content,
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
    const receiptType = parseRetryType(node.attrs.type)
    if (!receiptType) {
        return null
    }
    const stanzaId = node.attrs.id
    const from = node.attrs.from
    if (!stanzaId || !from) {
        throw new Error('retry receipt is missing id/from attrs')
    }

    const retryNode = findNodeChild(node, 'retry')
    if (!retryNode) {
        throw new Error('retry receipt is missing retry child')
    }
    const registrationNode = findNodeChild(node, WA_NODE_TAGS.REGISTRATION)
    if (!registrationNode) {
        throw new Error('retry receipt is missing registration child')
    }
    const originalMsgId = retryNode.attrs.id
    if (!originalMsgId) {
        throw new Error('retry receipt is missing retry.id')
    }

    const registration = parseFixedLengthBytes(
        registrationNode.content,
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
        retryCount: parseRetryCount(retryNode.attrs.count),
        retryReason: parseRetryReason(retryNode.attrs.error ?? node.attrs.error),
        t: retryNode.attrs.t ?? node.attrs.t,
        regId: parseBigEndianUint(registration, 'retry.registration'),
        keyBundle: parseRetryKeyBundle(findNodeChild(node, 'keys'))
    }
}
