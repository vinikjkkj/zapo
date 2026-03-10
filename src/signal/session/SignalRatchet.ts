import { webcrypto } from 'node:crypto'

import {
    hkdf,
    hkdfSplit,
    importAesCbcKey,
    importHmacKey,
    hmacSign,
    prependVersion,
    toSerializedPubKey
} from '../../crypto'
import { proto } from '../../proto'
import {
    CHAIN_KEY_LABEL,
    FUTURE_MESSAGES_MAX,
    MAX_UNUSED_KEYS,
    MSG_KEY_LABEL,
    SIGNAL_MAC_SIZE,
    SIGNAL_VERSION
} from '../../signal/constants'
import type {
    ParsedPreKeySignalMessage,
    ParsedSignalMessage,
    SignalMessageKey,
    SignalRecvChain,
    SignalSerializedKeyPair,
    SignalSessionRecord
} from '../../signal/types'
import { cloneBytes, concatBytes, removeAt, toBytesView, uint8Equal } from '../../util/bytes'

import {
    detachSession,
    ecdh,
    makeFreshRecvChain,
    makeFreshSendChain,
    makeRecvChain,
    makeSendChain,
    ratchetSession,
    setPrevSessions,
    snapshotToRecord,
    updateChains
} from './SignalSession'

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
        cipherKey: cloneBytes(bytes.subarray(0, 32)),
        macKey: cloneBytes(bytes.subarray(32, 64)),
        iv: cloneBytes(bytes.subarray(64, 80))
    }
}

export async function deriveMsgKey(
    index: number,
    chainKey: Uint8Array
): Promise<{ readonly nextChainKey: Uint8Array; readonly messageKey: SignalMessageKey }> {
    const hmacKey = await importHmacKey(chainKey)
    const [messageInputKey, nextChainRaw] = await Promise.all([
        hmacSign(hmacKey, MSG_KEY_LABEL),
        hmacSign(hmacKey, CHAIN_KEY_LABEL)
    ])
    const expanded = await hkdf(cloneBytes(messageInputKey), null, 'WhisperMessageKeys', 80)
    const messageKey = splitMsgKey(index, expanded)
    return {
        nextChainKey: cloneBytes(nextChainRaw.subarray(0, 32)),
        messageKey
    }
}

export async function calculateRatchet(
    rootKey: Uint8Array,
    localRatchet: SignalSerializedKeyPair,
    remoteRatchetPubKey: Uint8Array
): Promise<{ readonly rootKey: Uint8Array; readonly chainKey: Uint8Array }> {
    const sharedSecret = await ecdh(localRatchet.privKey, remoteRatchetPubKey)
    const [nextRootKey, chainKey] = await hkdfSplit(sharedSecret, 'WhisperRatchet', rootKey)
    return {
        rootKey: nextRootKey,
        chainKey
    }
}

export async function selectMessageKey(
    chain: SignalRecvChain,
    targetCounter: number
): Promise<{ readonly messageKey: SignalMessageKey; readonly updatedChain: SignalRecvChain }> {
    const delta = targetCounter - chain.nextMsgIndex
    if (delta > FUTURE_MESSAGES_MAX) {
        throw new Error('message too far in future')
    }
    const unused = chain.unusedMsgKeys.slice()
    if (delta < 0) {
        const idx = unused.findIndex((entry) => entry.index === targetCounter)
        if (idx === -1) {
            throw new Error('duplicate message')
        }
        const messageKey = unused[idx]
        const nextUnused = removeAt(unused, idx)
        return {
            messageKey,
            updatedChain: makeRecvChain(
                chain.ratchetPubKey,
                chain.nextMsgIndex,
                chain.chainKey,
                nextUnused
            )
        }
    }

    const first = await deriveMsgKey(chain.nextMsgIndex, chain.chainKey)
    let currentMessageKey = first.messageKey
    let nextChainKey = first.nextChainKey
    let nextUnused = unused.slice()

    if (delta > 0) {
        let overflow = delta + unused.length - MAX_UNUSED_KEYS
        if (overflow > 0) {
            nextUnused = unused.slice(overflow)
            overflow -= unused.length
        }
        for (let counter = chain.nextMsgIndex + 1; counter <= targetCounter; counter += 1) {
            if (overflow > 0) {
                overflow -= 1
            } else {
                nextUnused.push(currentMessageKey)
            }
            const derived = await deriveMsgKey(counter, nextChainKey)
            currentMessageKey = derived.messageKey
            nextChainKey = derived.nextChainKey
        }
    }

    return {
        messageKey: currentMessageKey,
        updatedChain: makeRecvChain(
            chain.ratchetPubKey,
            targetCounter + 1,
            nextChainKey,
            nextUnused
        )
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
    const cipherKey = await importAesCbcKey(messageKey.cipherKey)
    const macKey = await importHmacKey(messageKey.macKey)
    const ciphertext = toBytesView(
        await webcrypto.subtle.encrypt({ name: 'AES-CBC', iv: messageKey.iv }, cipherKey, plaintext)
    )

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
    const mac = await hmacSign(macKey, macInput)
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

    const updatedSendChain = makeSendChain(
        session.sendChain.ratchetKey,
        messageKey.index + 1,
        nextChainKey
    )
    const updated = updateChains(session, session.recvChains, updatedSendChain)
    return [updated, { type, ciphertext: output }]
}

export async function decryptMsg(
    session: SignalSessionRecord | null,
    parsed: ParsedSignalMessage,
    decryptMsgFromSessionFn: (
        session: SignalSessionRecord,
        message: ParsedSignalMessage | ParsedPreKeySignalMessage
    ) => Promise<readonly [SignalSessionRecord, Uint8Array]>
): Promise<DecryptOutcome> {
    if (!session) {
        throw new Error('signal session not found')
    }

    try {
        const [updatedSession, plaintext] = await decryptMsgFromSessionFn(session, parsed)
        return {
            updatedSession,
            plaintext,
            newSessionInfo: null
        }
    } catch (error) {
        const prev = session.prevSessions
        for (let i = 0; i < prev.length; i += 1) {
            const prevSession = snapshotToRecord(prev[i])
            try {
                const [updatedPrev, plaintext] = await decryptMsgFromSessionFn(prevSession, parsed)
                const updatedSession = setPrevSessions(updatedPrev, [
                    detachSession(session),
                    ...session.prevSessions.slice(0, i),
                    ...session.prevSessions.slice(i + 1)
                ])
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
            } catch {
                continue
            }
        }
        throw error
    }
}

export async function decryptMsgFromSession(
    session: SignalSessionRecord,
    message: ParsedSignalMessage | ParsedPreKeySignalMessage,
    generateSerializedKeyPair: () => Promise<SignalSerializedKeyPair>
): Promise<readonly [SignalSessionRecord, Uint8Array]> {
    const ratchetPubKey = toSerializedPubKey(message.ratchetPubKey)
    const recvChainIndex = session.recvChains.findIndex((entry) =>
        uint8Equal(entry.ratchetPubKey, ratchetPubKey)
    )
    let selectedMessageKey: SignalMessageKey
    let updatedSession: SignalSessionRecord

    if (recvChainIndex === -1) {
        const recvRatchet = await calculateRatchet(
            session.rootKey,
            session.sendChain.ratchetKey,
            ratchetPubKey
        )
        const freshRecvChain = makeFreshRecvChain(ratchetPubKey, recvRatchet.chainKey)
        const selected = await selectMessageKey(freshRecvChain, message.counter)
        selectedMessageKey = selected.messageKey

        const newSendRatchet = await generateSerializedKeyPair()
        const sendRatchet = await calculateRatchet(
            recvRatchet.rootKey,
            newSendRatchet,
            ratchetPubKey
        )
        const nextRecvChains = session.recvChains.slice(-4)
        nextRecvChains.push(selected.updatedChain)
        updatedSession = ratchetSession(
            session,
            nextRecvChains,
            makeFreshSendChain(newSendRatchet, sendRatchet.chainKey),
            sendRatchet.rootKey
        )
    } else {
        const selected = await selectMessageKey(session.recvChains[recvChainIndex], message.counter)
        selectedMessageKey = selected.messageKey
        const nextRecvChains = session.recvChains.slice()
        nextRecvChains[recvChainIndex] = selected.updatedChain
        updatedSession = updateChains(session, nextRecvChains, session.sendChain)
    }

    const cipherKey = await importAesCbcKey(selectedMessageKey.cipherKey)
    const macKey = await importHmacKey(selectedMessageKey.macKey)
    const payloadWithoutMac = message.versionContentMac.subarray(
        0,
        message.versionContentMac.length - SIGNAL_MAC_SIZE
    )
    const expectedMacInput = concatBytes([
        session.remote.pubKey,
        session.local.pubKey,
        payloadWithoutMac
    ])
    const expectedMac = await hmacSign(macKey, expectedMacInput)
    const receivedMac = message.versionContentMac.subarray(
        message.versionContentMac.length - SIGNAL_MAC_SIZE
    )
    if (!uint8Equal(expectedMac.subarray(0, SIGNAL_MAC_SIZE), receivedMac)) {
        throw new Error('invalid message mac')
    }

    const plaintext = toBytesView(
        await webcrypto.subtle.decrypt(
            { name: 'AES-CBC', iv: selectedMessageKey.iv },
            cipherKey,
            message.ciphertext
        )
    )
    return [updatedSession, plaintext]
}
