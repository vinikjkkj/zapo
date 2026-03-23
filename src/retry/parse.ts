import { WA_MESSAGE_TAGS, WA_NODE_TAGS } from '@protocol/constants'
import { normalizeDeviceJid } from '@protocol/jid'
import type { WaParsedRetryRequest, WaRetryKeyBundle, WaRetryOutboundState } from '@retry/types'
import { decodeExactLength, parseUint } from '@signal/api/codec'
import {
    SIGNAL_KEY_DATA_LENGTH,
    SIGNAL_KEY_ID_LENGTH,
    SIGNAL_REGISTRATION_ID_LENGTH,
    SIGNAL_SIGNATURE_LENGTH
} from '@signal/api/constants'
import { decodeNodeContentBase64OrBytes, findNodeChildrenByTags } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt } from '@util/primitives'

const RETRY_STATE_RANK: Readonly<Record<WaRetryOutboundState, number>> = {
    pending: 0,
    delivered: 1,
    read: 2,
    played: 3,
    ineligible: 4
}

function requireNode(node: BinaryNode | undefined, message: string): BinaryNode {
    if (!node) {
        throw new Error(message)
    }
    return node
}

function validateRetryReceiptToAttr(
    to: string | undefined,
    expectedToJids: readonly string[] | undefined
): void {
    if (!to || !expectedToJids || expectedToJids.length === 0) {
        return
    }
    let normalizedTo: string
    try {
        normalizedTo = normalizeDeviceJid(to)
    } catch {
        throw new Error('retry receipt has invalid to attr')
    }
    for (let index = 0; index < expectedToJids.length; index += 1) {
        const expected = expectedToJids[index]?.trim()
        if (!expected) continue
        try {
            if (normalizeDeviceJid(expected) === normalizedTo) {
                return
            }
        } catch {
            continue
        }
    }
    throw new Error('retry receipt to attr does not match local device')
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
        identity: decodeExactLength(
            identity.content,
            'retry.keys.identity',
            SIGNAL_KEY_DATA_LENGTH
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
                      id: parseUint(
                          decodeExactLength(
                              keyId.content,
                              'retry.keys.key.id',
                              SIGNAL_KEY_ID_LENGTH
                          ),
                          'retry.keys.key.id'
                      ),
                      publicKey: decodeExactLength(
                          keyValue.content,
                          'retry.keys.key.value',
                          SIGNAL_KEY_DATA_LENGTH
                      )
                  }
                : undefined,
        skey: {
            id: parseUint(
                decodeExactLength(signedKeyId.content, 'retry.keys.skey.id', SIGNAL_KEY_ID_LENGTH),
                'retry.keys.skey.id'
            ),
            publicKey: decodeExactLength(
                signedKeyValue.content,
                'retry.keys.skey.value',
                SIGNAL_KEY_DATA_LENGTH
            ),
            signature: decodeExactLength(
                signedKeySignature.content,
                'retry.keys.skey.signature',
                SIGNAL_SIGNATURE_LENGTH
            )
        }
    }
}

export function parseRetryReceiptRequest(
    node: BinaryNode,
    options?: { readonly expectedToJids?: readonly string[] }
): WaParsedRetryRequest | null {
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
    validateRetryReceiptToAttr(node.attrs.to, options?.expectedToJids)

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

    const registration = decodeExactLength(
        registrationNodeValue.content,
        'retry.registration',
        SIGNAL_REGISTRATION_ID_LENGTH
    )

    return {
        type: receiptType,
        stanzaId,
        from,
        participant: node.attrs.participant,
        recipient: node.attrs.recipient,
        offline: node.attrs.offline !== undefined,
        isLid: node.attrs.is_lid === 'true',
        originalMsgId,
        retryCount: parseOptionalInt(retry.attrs.count) ?? 0,
        retryReason: parseOptionalInt(retry.attrs.error ?? node.attrs.error),
        t: retry.attrs.t ?? node.attrs.t,
        regId: parseUint(registration, 'retry.registration'),
        keyBundle: parseRetryKeyBundle(keysNode)
    }
}

export function pickRetryStateMax(
    left: WaRetryOutboundState,
    right: WaRetryOutboundState
): WaRetryOutboundState {
    return RETRY_STATE_RANK[left] >= RETRY_STATE_RANK[right] ? left : right
}
