import { hkdf, hmacSha256Sign } from '@crypto'
import {
    CHAIN_KEY_LABEL,
    MAX_UNUSED_KEYS,
    MESSAGE_KEY_LABEL,
    SENDER_KEY_FUTURE_MESSAGES_MAX,
    WHISPER_GROUP_INFO
} from '@signal/constants'
import type { SenderKeyRecord, SenderMessageKey } from '@signal/types'
import { assertByteLength, removeAt } from '@util/bytes'

export interface SenderKeyMessageKeyDerivation {
    readonly nextChainKey: Uint8Array
    readonly messageKey: SenderMessageKey
}

export interface SenderKeyMessageKeySelection {
    readonly messageKey: SenderMessageKey
    readonly updatedRecord: SenderKeyRecord
}

export async function selectMessageKey(
    senderKey: SenderKeyRecord,
    targetIteration: number,
    futureMessagesMax?: number
): Promise<SenderKeyMessageKeySelection> {
    const delta = targetIteration - senderKey.iteration
    if (delta > (futureMessagesMax ?? SENDER_KEY_FUTURE_MESSAGES_MAX)) {
        throw new Error('sender key message is too far in future')
    }

    const currentUnused = senderKey.unusedMessageKeys ?? []
    if (delta < 0) {
        const foundIndex = currentUnused.findIndex((entry) => entry.iteration === targetIteration)
        if (foundIndex === -1) {
            throw new Error('sender key message iteration is stale')
        }

        const messageKey = currentUnused[foundIndex]
        const nextUnused = removeAt(currentUnused, foundIndex)
        return {
            messageKey,
            updatedRecord: {
                ...senderKey,
                unusedMessageKeys: nextUnused
            }
        }
    }

    let chainKey = ensureChainKey(senderKey.chainKey)
    const firstDerived = await deriveSenderKeyMsgKeyFromChainKey(senderKey.iteration, chainKey)
    chainKey = firstDerived.nextChainKey
    let messageKey = firstDerived.messageKey
    if (delta === 0) {
        return {
            messageKey,
            updatedRecord: {
                ...senderKey,
                iteration: targetIteration + 1,
                chainKey,
                unusedMessageKeys: currentUnused
            }
        }
    }
    const nextUnused = currentUnused.slice()

    let overflow = delta + currentUnused.length - MAX_UNUSED_KEYS
    if (overflow > 0) {
        nextUnused.splice(0, overflow)
        overflow -= currentUnused.length
    }

    for (let iteration = senderKey.iteration + 1; iteration <= targetIteration; iteration += 1) {
        if (overflow > 0) {
            overflow -= 1
        } else {
            nextUnused.push(messageKey)
        }

        const derived = await deriveSenderKeyMsgKeyFromChainKey(iteration, chainKey)
        chainKey = derived.nextChainKey
        messageKey = derived.messageKey
    }

    return {
        messageKey,
        updatedRecord: {
            ...senderKey,
            iteration: targetIteration + 1,
            chainKey,
            unusedMessageKeys: nextUnused
        }
    }
}

export async function deriveSenderKeyMsgKey(
    iteration: number,
    chainKey: Uint8Array
): Promise<SenderKeyMessageKeyDerivation> {
    return deriveSenderKeyMsgKeyFromChainKey(iteration, ensureChainKey(chainKey))
}

function ensureChainKey(chainKey: Uint8Array): Uint8Array {
    assertByteLength(chainKey, 32, 'sender key chainKey must be 32 bytes')
    return chainKey
}

async function deriveSenderKeyMsgKeyFromChainKey(
    iteration: number,
    chainKey: Uint8Array
): Promise<SenderKeyMessageKeyDerivation> {
    const [nextChainRaw, messageInputKey] = await Promise.all([
        hmacSha256Sign(chainKey, CHAIN_KEY_LABEL),
        hmacSha256Sign(chainKey, MESSAGE_KEY_LABEL)
    ])
    const nextChainKey = nextChainRaw.subarray(0, 32)
    const messageSeed = await hkdf(messageInputKey, null, WHISPER_GROUP_INFO, 50)
    return {
        nextChainKey,
        messageKey: {
            iteration,
            seed: messageSeed
        }
    }
}
