import {
    aesCbcDecrypt,
    aesCbcEncrypt,
    hkdf,
    hmacSha256Sign,
    prependVersion,
    toSerializedPubKey
} from '@crypto'
import { proto } from '@proto'
import {
    CHAIN_KEY_LABEL,
    FUTURE_MESSAGES_MAX,
    MAX_UNUSED_KEYS,
    MESSAGE_KEY_LABEL,
    SIGNAL_MAC_SIZE,
    SIGNAL_VERSION
} from '@signal/constants'
import {
    decodeSignalMessageKey,
    decodeSignalRecvChain,
    decodeSignalSessionSnapshot,
    encodeSignalRecvChain,
    encodeSignalSessionSnapshot
} from '@signal/encoding'
import {
    calculateRatchet,
    detachSession,
    generateSerializedKeyPair,
    snapshotToRecord
} from '@signal/session/SignalSession'
import type {
    ParsedPreKeySignalMessage,
    ParsedSignalMessage,
    RawSignalRecvChain,
    SignalMessageKey,
    SignalRecvChain,
    SignalSessionRecord
} from '@signal/types'
import { concatBytes, removeAt, uint8Equal } from '@util/bytes'
import { toError } from '@util/primitives'

const MAX_TRACKED_RECV_CHAINS = 4

export interface DecryptOutcome {
    readonly updatedSession: SignalSessionRecord
    readonly plaintext: Uint8Array
    readonly newSessionInfo: {
        readonly newIdentity: Uint8Array | null
        readonly baseSession: SignalSessionRecord
        readonly usedPreKey: number | null
    } | null
}

export function splitMsgKey(index: number, bytes: Uint8Array): SignalMessageKey {
    if (bytes.length < 80) {
        throw new Error('invalid message key length')
    }
    return {
        index,
        cipherKey: bytes.subarray(0, 32),
        macKey: bytes.subarray(32, 64),
        iv: bytes.subarray(64, 80)
    }
}

export async function deriveMsgKey(
    index: number,
    chainKey: Uint8Array
): Promise<{ readonly nextChainKey: Uint8Array; readonly messageKey: SignalMessageKey }> {
    return deriveMsgKeyFromChainKey(index, chainKey)
}

export async function selectMessageKey(
    chain: SignalRecvChain,
    targetCounter: number
): Promise<{ readonly messageKey: SignalMessageKey; readonly updatedChain: SignalRecvChain }> {
    const delta = targetCounter - chain.nextMsgIndex
    if (delta > FUTURE_MESSAGES_MAX) {
        throw new Error('message too far in future')
    }
    const unused = chain.unusedMsgKeys
    if (delta < 0) {
        const idx = unused.findIndex((entry) => entry.index === targetCounter)
        if (idx === -1) {
            throw new Error('duplicate message')
        }
        const messageKey = decodeSignalMessageKey(unused[idx], `unusedMsgKeys[${idx}]`)
        const nextUnused = removeAt(unused, idx)
        return {
            messageKey,
            updatedChain: {
                ratchetPubKey: chain.ratchetPubKey,
                nextMsgIndex: chain.nextMsgIndex,
                chainKey: chain.chainKey,
                unusedMsgKeys: nextUnused
            }
        }
    }

    let chainKey = chain.chainKey
    const first = await deriveMsgKeyFromChainKey(chain.nextMsgIndex, chainKey)
    let currentMessageKey = first.messageKey
    chainKey = first.nextChainKey
    if (delta === 0) {
        return {
            messageKey: currentMessageKey,
            updatedChain: {
                ratchetPubKey: chain.ratchetPubKey,
                nextMsgIndex: targetCounter + 1,
                chainKey,
                unusedMsgKeys: unused
            }
        }
    }
    const nextUnused = unused.slice()

    let overflow = delta + unused.length - MAX_UNUSED_KEYS
    if (overflow > 0) {
        nextUnused.splice(0, overflow)
        overflow -= unused.length
    }
    for (let counter = chain.nextMsgIndex + 1; counter <= targetCounter; counter += 1) {
        if (overflow > 0) {
            overflow -= 1
        } else {
            nextUnused.push({
                index: currentMessageKey.index,
                cipherKey: currentMessageKey.cipherKey,
                macKey: currentMessageKey.macKey,
                iv: currentMessageKey.iv
            })
        }
        const derived = await deriveMsgKeyFromChainKey(counter, chainKey)
        currentMessageKey = derived.messageKey
        chainKey = derived.nextChainKey
    }

    return {
        messageKey: currentMessageKey,
        updatedChain: {
            ratchetPubKey: chain.ratchetPubKey,
            nextMsgIndex: targetCounter + 1,
            chainKey,
            unusedMsgKeys: nextUnused
        }
    }
}

async function deriveMsgKeyFromChainKey(
    index: number,
    chainKey: Uint8Array
): Promise<{ readonly nextChainKey: Uint8Array; readonly messageKey: SignalMessageKey }> {
    const [nextChainRaw, messageInputKey] = await Promise.all([
        hmacSha256Sign(chainKey, CHAIN_KEY_LABEL),
        hmacSha256Sign(chainKey, MESSAGE_KEY_LABEL)
    ])
    const nextChainKey = nextChainRaw.subarray(0, 32)
    const expanded = await hkdf(messageInputKey, null, 'WhisperMessageKeys', 80)
    return {
        nextChainKey,
        messageKey: splitMsgKey(index, expanded)
    }
}

export async function encryptMsg(
    session: SignalSessionRecord,
    plaintext: Uint8Array
): Promise<readonly [SignalSessionRecord, { type: 'msg' | 'pkmsg'; ciphertext: Uint8Array }]> {
    const { nextChainKey, messageKey } = await deriveMsgKey(
        session.sendChain.nextMsgIndex,
        session.sendChain.chainKey
    )
    const ciphertext = await aesCbcEncrypt(messageKey.cipherKey, messageKey.iv, plaintext)

    const signalPayload = proto.SignalMessage.encode({
        ratchetKey: session.sendChain.ratchetKey.pubKey,
        counter: messageKey.index,
        previousCounter: session.prevSendChainHighestIndex,
        ciphertext
    }).finish()
    const versionedSignalPayload = prependVersion(signalPayload, SIGNAL_VERSION)
    const macInput = concatBytes([
        session.local.pubKey,
        session.remote.pubKey,
        versionedSignalPayload
    ])
    const mac = await hmacSha256Sign(messageKey.macKey, macInput)
    const signalMessage = concatBytes([versionedSignalPayload, mac.subarray(0, SIGNAL_MAC_SIZE)])

    let type: 'msg' | 'pkmsg' = 'msg'
    let output = signalMessage
    if (session.initialExchangeInfo) {
        const preKeyPayload = proto.PreKeySignalMessage.encode({
            registrationId: session.local.regId,
            preKeyId: session.initialExchangeInfo.remoteOneTimeId ?? undefined,
            signedPreKeyId: session.initialExchangeInfo.remoteSignedId,
            baseKey: session.initialExchangeInfo.localOneTimePubKey,
            identityKey: session.local.pubKey,
            message: signalMessage
        }).finish()
        type = 'pkmsg'
        output = prependVersion(preKeyPayload, SIGNAL_VERSION)
    }

    const updated = {
        ...session,
        sendChain: {
            ratchetKey: session.sendChain.ratchetKey,
            nextMsgIndex: messageKey.index + 1,
            chainKey: nextChainKey
        }
    }
    return [updated, { type, ciphertext: output }]
}

export async function decryptMsg(
    session: SignalSessionRecord | null,
    parsed: ParsedSignalMessage,
    onPrevSessionDecryptError?: (error: Error, previousSessionIndex: number) => void
): Promise<DecryptOutcome> {
    if (!session) {
        throw new Error('signal session not found')
    }

    try {
        const [updatedSession, plaintext] = await decryptMsgFromSession(session, parsed)
        return {
            updatedSession,
            plaintext,
            newSessionInfo: null
        }
    } catch (error) {
        for (let i = 0; i < session.prevSessions.length; i += 1) {
            const decodedPrev = decodeSignalSessionSnapshot(
                session.prevSessions[i],
                `prevSessions[${i}]`
            )
            const prevSession = snapshotToRecord(decodedPrev)
            try {
                const [updatedPrev, plaintext] = await decryptMsgFromSession(prevSession, parsed)
                const updatedSession = {
                    ...updatedPrev,
                    prevSessions: [
                        encodeSignalSessionSnapshot(detachSession(session)),
                        ...session.prevSessions.slice(0, i),
                        ...session.prevSessions.slice(i + 1)
                    ]
                }
                return {
                    updatedSession,
                    plaintext,
                    newSessionInfo: {
                        newIdentity: uint8Equal(updatedSession.remote.pubKey, session.remote.pubKey)
                            ? null
                            : updatedSession.remote.pubKey,
                        baseSession: prevSession,
                        usedPreKey: null
                    }
                }
            } catch (prevError) {
                onPrevSessionDecryptError?.(toError(prevError), i)
                continue
            }
        }
        throw error
    }
}

export async function decryptMsgFromSession(
    session: SignalSessionRecord,
    message: ParsedSignalMessage | ParsedPreKeySignalMessage
): Promise<readonly [SignalSessionRecord, Uint8Array]> {
    const ratchetPubKey = toSerializedPubKey(message.ratchetPubKey)
    const recvChainIndex = session.recvChains.findIndex((raw) => {
        const key = raw.senderRatchetKey
        return key !== null && key !== undefined && uint8Equal(key, ratchetPubKey)
    })
    let selectedMessageKey: SignalMessageKey
    let updatedSession: SignalSessionRecord

    if (recvChainIndex === -1) {
        const recvRatchet = await calculateRatchet(
            session.rootKey,
            session.sendChain.ratchetKey,
            ratchetPubKey
        )
        const freshRecvChain: SignalRecvChain = {
            ratchetPubKey,
            nextMsgIndex: 0,
            chainKey: recvRatchet.chainKey,
            unusedMsgKeys: []
        }
        const [selected, newSendRatchet] = await Promise.all([
            selectMessageKey(freshRecvChain, message.counter),
            generateSerializedKeyPair()
        ])
        selectedMessageKey = selected.messageKey

        const sendRatchet = await calculateRatchet(
            recvRatchet.rootKey,
            newSendRatchet,
            ratchetPubKey
        )
        const nextRecvChains: RawSignalRecvChain[] =
            session.recvChains.slice(-MAX_TRACKED_RECV_CHAINS)
        nextRecvChains.push(encodeSignalRecvChain(selected.updatedChain))
        updatedSession = {
            ...session,
            rootKey: sendRatchet.rootKey,
            recvChains: nextRecvChains,
            sendChain: {
                ratchetKey: newSendRatchet,
                nextMsgIndex: 0,
                chainKey: sendRatchet.chainKey
            },
            initialExchangeInfo: null,
            prevSendChainHighestIndex: Math.max(session.sendChain.nextMsgIndex - 1, 0)
        }
    } else {
        const decoded = decodeSignalRecvChain(
            session.recvChains[recvChainIndex],
            `recvChains[${recvChainIndex}]`
        )
        const selected = await selectMessageKey(decoded, message.counter)
        selectedMessageKey = selected.messageKey
        const nextRecvChains: RawSignalRecvChain[] = session.recvChains.slice()
        nextRecvChains[recvChainIndex] = encodeSignalRecvChain(selected.updatedChain)
        updatedSession = {
            ...session,
            recvChains: nextRecvChains
        }
    }

    const payloadWithoutMac = message.versionContentMac.subarray(
        0,
        message.versionContentMac.length - SIGNAL_MAC_SIZE
    )
    const expectedMacInput = concatBytes([
        session.remote.pubKey,
        session.local.pubKey,
        payloadWithoutMac
    ])
    const expectedMac = await hmacSha256Sign(selectedMessageKey.macKey, expectedMacInput)
    const receivedMac = message.versionContentMac.subarray(
        message.versionContentMac.length - SIGNAL_MAC_SIZE
    )
    if (!uint8Equal(expectedMac.subarray(0, SIGNAL_MAC_SIZE), receivedMac)) {
        throw new Error('invalid message mac')
    }

    const plaintext = await aesCbcDecrypt(
        selectedMessageKey.cipherKey,
        selectedMessageKey.iv,
        message.ciphertext
    )
    return [updatedSession, plaintext]
}
