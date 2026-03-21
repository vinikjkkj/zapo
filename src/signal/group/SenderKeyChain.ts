import type { CryptoKey } from '@crypto'
import { hkdf, importHmacKey, hmacSign } from '@crypto'
import {
    CHAIN_KEY_LABEL,
    MAX_UNUSED_KEYS,
    MESSAGE_KEY_LABEL,
    SENDER_KEY_FUTURE_MESSAGES_MAX,
    WHISPER_GROUP_INFO
} from '@signal/constants'
import type { SenderKeyRecord, SenderMessageKey } from '@signal/types'
import { assertByteLength, removeAt } from '@util/bytes'

interface SenderChainState {
    readonly chainKey: Uint8Array
    readonly hmacKey: CryptoKey
}

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
    targetIteration: number
): Promise<SenderKeyMessageKeySelection> {
    const delta = targetIteration - senderKey.iteration
    if (delta > SENDER_KEY_FUTURE_MESSAGES_MAX) {
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

    let chainState = await createSenderChainState(senderKey.chainKey)
    const firstDerived = await deriveSenderKeyMsgKeyFromState(senderKey.iteration, chainState)
    chainState = firstDerived.nextState
    let messageKey = firstDerived.messageKey
    if (delta === 0) {
        return {
            messageKey,
            updatedRecord: {
                ...senderKey,
                iteration: targetIteration + 1,
                chainKey: chainState.chainKey,
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

        const derived = await deriveSenderKeyMsgKeyFromState(iteration, chainState)
        chainState = derived.nextState
        messageKey = derived.messageKey
    }

    return {
        messageKey,
        updatedRecord: {
            ...senderKey,
            iteration: targetIteration + 1,
            chainKey: chainState.chainKey,
            unusedMessageKeys: nextUnused
        }
    }
}

export async function deriveSenderKeyMsgKey(
    iteration: number,
    chainKey: Uint8Array
): Promise<SenderKeyMessageKeyDerivation> {
    const state = await createSenderChainState(chainKey)
    const derived = await deriveSenderKeyMsgKeyFromState(iteration, state)
    return {
        nextChainKey: derived.nextState.chainKey,
        messageKey: derived.messageKey
    }
}

async function createSenderChainState(chainKey: Uint8Array): Promise<SenderChainState> {
    assertByteLength(chainKey, 32, 'sender key chainKey must be 32 bytes')
    return {
        chainKey,
        hmacKey: await importHmacKey(chainKey)
    }
}

async function deriveSenderKeyMsgKeyFromState(
    iteration: number,
    state: SenderChainState
): Promise<{ readonly nextState: SenderChainState; readonly messageKey: SenderMessageKey }> {
    const [nextChainRaw, messageInputKey] = await Promise.all([
        hmacSign(state.hmacKey, CHAIN_KEY_LABEL),
        hmacSign(state.hmacKey, MESSAGE_KEY_LABEL)
    ])
    const nextChainKey = nextChainRaw.subarray(0, 32)
    const [nextHmacKey, messageSeed] = await Promise.all([
        importHmacKey(nextChainKey),
        hkdf(messageInputKey, null, WHISPER_GROUP_INFO, 50)
    ])
    return {
        nextState: {
            chainKey: nextChainKey,
            hmacKey: nextHmacKey
        },
        messageKey: {
            iteration,
            seed: messageSeed
        }
    }
}
