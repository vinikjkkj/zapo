import type { SenderKeyRecord } from 'zapo-js/signal'

import { signalAddressFromLibsignalString } from '../util/address'

import { toBytes, toOptionalBytes } from './coerce'
import type { BaileysSenderKeyStateStructure } from './types'

/**
 * Promotes the latest of Baileys' up-to-5 historical states (mirrors
 * `getSenderKeyState()`); zapo holds a single state per record.
 */
export function convertBaileysSenderKey(
    groupId: string,
    senderAddrEncoded: string,
    states: readonly BaileysSenderKeyStateStructure[],
    options: { readonly server?: string } = {}
): SenderKeyRecord {
    if (states.length === 0) {
        throw new Error(`baileys sender-key ${groupId}/${senderAddrEncoded}: empty state array`)
    }
    const sender = signalAddressFromLibsignalString(senderAddrEncoded, options)
    const state = states[states.length - 1]
    const field = `senderKeyStates[${states.length - 1}]`

    return {
        groupId,
        sender,
        keyId: state.senderKeyId,
        iteration: state.senderChainKey.iteration,
        chainKey: toBytes(state.senderChainKey.seed, `${field}.senderChainKey.seed`),
        signingPublicKey: toBytes(
            state.senderSigningKey.public,
            `${field}.senderSigningKey.public`
        ),
        signingPrivateKey: toOptionalBytes(
            state.senderSigningKey.private,
            `${field}.senderSigningKey.private`
        ),
        unusedMessageKeys: state.senderMessageKeys.map((key, i) => ({
            iteration: key.iteration,
            seed: toBytes(key.seed, `${field}.senderMessageKeys[${i}].seed`)
        }))
    }
}
