import { proto, type Proto } from '@proto'
import type {
    SignalMessageKey,
    SignalRecvChain,
    SignalSendChain,
    SignalSessionRecord,
    SignalSessionSnapshot
} from '@signal/types'
import { assertByteLength } from '@util/bytes'
import { asBytes, asNumber, asOptionalBytes, asOptionalNumber } from '@util/coercion'

export interface SignalSessionRow extends Record<string, unknown> {
    readonly user: unknown
    readonly server: unknown
    readonly device: unknown
    readonly record: unknown
}

export interface SignalIdentityRow extends Record<string, unknown> {
    readonly identity_key: unknown
}

export function encodeSignalSessionSnapshot(
    session: SignalSessionSnapshot
): Proto.ISessionStructure {
    return {
        sessionVersion: 3,
        localRegistrationId: session.local.regId,
        localIdentityPublic: session.local.pubKey,
        remoteRegistrationId: session.remote.regId,
        remoteIdentityPublic: session.remote.pubKey,
        rootKey: session.rootKey,
        previousCounter: session.prevSendChainHighestIndex,
        senderChain: encodeSignalSendChain(session.sendChain),
        receiverChains: session.recvChains as Proto.SessionStructure.IChain[],
        pendingPreKey: session.initialExchangeInfo
            ? {
                  preKeyId: session.initialExchangeInfo.remoteOneTimeId ?? undefined,
                  signedPreKeyId: session.initialExchangeInfo.remoteSignedId,
                  baseKey: session.initialExchangeInfo.localOneTimePubKey
              }
            : undefined,
        aliceBaseKey: session.aliceBaseKey ?? undefined
    }
}

function encodeSignalSendChain(chain: SignalSendChain): Proto.SessionStructure.IChain {
    return {
        senderRatchetKey: chain.ratchetKey.pubKey,
        senderRatchetKeyPrivate: chain.ratchetKey.privKey,
        chainKey: {
            index: chain.nextMsgIndex,
            key: chain.chainKey
        },
        messageKeys: []
    }
}

export function encodeSignalRecvChain(chain: SignalRecvChain): Proto.SessionStructure.IChain {
    return {
        senderRatchetKey: chain.ratchetPubKey,
        chainKey: {
            index: chain.nextMsgIndex,
            key: chain.chainKey
        },
        messageKeys: chain.unusedMsgKeys as Proto.SessionStructure.Chain.IMessageKey[]
    }
}

export function decodeSignalMessageKey(
    messageKey: Proto.SessionStructure.Chain.IMessageKey,
    field: string
): SignalMessageKey {
    const cipherKey = asBytes(messageKey.cipherKey, `${field}.cipherKey`)
    assertByteLength(cipherKey, 32, `invalid ${field}.cipherKey length ${cipherKey.byteLength}`)
    const macKey = asBytes(messageKey.macKey, `${field}.macKey`)
    assertByteLength(macKey, 32, `invalid ${field}.macKey length ${macKey.byteLength}`)
    const iv = asBytes(messageKey.iv, `${field}.iv`)
    assertByteLength(iv, 16, `invalid ${field}.iv length ${iv.byteLength}`)
    return {
        index: asNumber(messageKey.index, `${field}.index`),
        cipherKey,
        macKey,
        iv
    }
}

export function decodeSignalRecvChain(
    chain: Proto.SessionStructure.IChain,
    field: string
): SignalRecvChain {
    const chainKey = chain.chainKey
    if (!chainKey) {
        throw new Error(`missing ${field}.chainKey`)
    }
    const ratchetPubKey = asBytes(chain.senderRatchetKey, `${field}.senderRatchetKey`)
    assertByteLength(
        ratchetPubKey,
        33,
        `invalid ${field}.senderRatchetKey length ${ratchetPubKey.byteLength}`
    )
    const chainKeyBytes = asBytes(chainKey.key, `${field}.chainKey.key`)
    assertByteLength(
        chainKeyBytes,
        32,
        `invalid ${field}.chainKey.key length ${chainKeyBytes.byteLength}`
    )
    return {
        ratchetPubKey,
        nextMsgIndex: asNumber(chainKey.index, `${field}.chainKey.index`),
        chainKey: chainKeyBytes,
        unusedMsgKeys: chain.messageKeys ?? []
    }
}

function decodeSignalSendChain(
    chain: Proto.SessionStructure.IChain,
    field: string
): SignalSendChain {
    const chainKey = chain.chainKey
    if (!chainKey) {
        throw new Error(`missing ${field}.chainKey`)
    }
    const privateKey = asOptionalBytes(
        chain.senderRatchetKeyPrivate,
        `${field}.senderRatchetKeyPrivate`
    )
    if (!privateKey) {
        throw new Error(`missing ${field}.senderRatchetKeyPrivate`)
    }
    assertByteLength(
        privateKey,
        32,
        `invalid ${field}.senderRatchetKeyPrivate length ${privateKey.byteLength}`
    )
    const ratchetPubKey = asBytes(chain.senderRatchetKey, `${field}.senderRatchetKey`)
    assertByteLength(
        ratchetPubKey,
        33,
        `invalid ${field}.senderRatchetKey length ${ratchetPubKey.byteLength}`
    )
    const chainKeyBytes = asBytes(chainKey.key, `${field}.chainKey.key`)
    assertByteLength(
        chainKeyBytes,
        32,
        `invalid ${field}.chainKey.key length ${chainKeyBytes.byteLength}`
    )
    return {
        ratchetKey: {
            pubKey: ratchetPubKey,
            privKey: privateKey
        },
        nextMsgIndex: asNumber(chainKey.index, `${field}.chainKey.index`),
        chainKey: chainKeyBytes
    }
}

export function decodeSignalSessionSnapshot(
    session: Proto.ISessionStructure,
    field: string
): SignalSessionSnapshot {
    const senderChain = session.senderChain
    if (!senderChain) {
        throw new Error(`missing ${field}.senderChain`)
    }
    const pendingPreKey = session.pendingPreKey
    const localPubKey = asBytes(session.localIdentityPublic, `${field}.localIdentityPublic`)
    assertByteLength(
        localPubKey,
        33,
        `invalid ${field}.localIdentityPublic length ${localPubKey.byteLength}`
    )
    const remotePubKey = asBytes(session.remoteIdentityPublic, `${field}.remoteIdentityPublic`)
    assertByteLength(
        remotePubKey,
        33,
        `invalid ${field}.remoteIdentityPublic length ${remotePubKey.byteLength}`
    )
    const rootKey = asBytes(session.rootKey, `${field}.rootKey`)
    assertByteLength(rootKey, 32, `invalid ${field}.rootKey length ${rootKey.byteLength}`)
    const localOneTimePubKey = pendingPreKey
        ? asBytes(pendingPreKey.baseKey, `${field}.pendingPreKey.baseKey`)
        : null
    if (localOneTimePubKey) {
        assertByteLength(
            localOneTimePubKey,
            33,
            `invalid ${field}.pendingPreKey.baseKey length ${localOneTimePubKey.byteLength}`
        )
    }
    const aliceBaseKey = asOptionalBytes(session.aliceBaseKey, `${field}.aliceBaseKey`) ?? null
    if (aliceBaseKey) {
        assertByteLength(
            aliceBaseKey,
            33,
            `invalid ${field}.aliceBaseKey length ${aliceBaseKey.byteLength}`
        )
    }
    return {
        local: {
            regId: asNumber(session.localRegistrationId, `${field}.localRegistrationId`),
            pubKey: localPubKey
        },
        remote: {
            regId: asNumber(session.remoteRegistrationId, `${field}.remoteRegistrationId`),
            pubKey: remotePubKey
        },
        rootKey,
        sendChain: decodeSignalSendChain(senderChain, `${field}.senderChain`),
        recvChains: session.receiverChains ?? [],
        initialExchangeInfo: pendingPreKey
            ? {
                  remoteOneTimeId:
                      asOptionalNumber(pendingPreKey.preKeyId, `${field}.pendingPreKey.preKeyId`) ??
                      null,
                  remoteSignedId: asNumber(
                      pendingPreKey.signedPreKeyId,
                      `${field}.pendingPreKey.signedPreKeyId`
                  ),
                  localOneTimePubKey: localOneTimePubKey!
              }
            : null,
        prevSendChainHighestIndex:
            asOptionalNumber(session.previousCounter, `${field}.previousCounter`) ?? 0,
        aliceBaseKey
    }
}

/**
 * Serializes a {@link SignalSessionRecord} (current + previous sessions) into
 * the Signal `RecordStructure` protobuf encoding used by the session stores.
 */
export function encodeSignalSessionRecord(record: SignalSessionRecord): Uint8Array {
    return proto.RecordStructure.encode({
        currentSession: encodeSignalSessionSnapshot(record),
        previousSessions: record.prevSessions as Proto.ISessionStructure[]
    }).finish()
}

/**
 * Decodes a Signal `RecordStructure` payload (as stored on disk) back into a
 * {@link SignalSessionRecord}. Throws when the current session is missing.
 */
export function decodeSignalSessionRecord(raw: unknown): SignalSessionRecord {
    const decoded = proto.RecordStructure.decode(asBytes(raw, 'signal_sessions.record'))
    if (!decoded.currentSession) {
        throw new Error('missing signal_sessions.record.currentSession')
    }
    const current = decodeSignalSessionSnapshot(
        decoded.currentSession,
        'signal_sessions.currentSession'
    )
    return {
        ...current,
        prevSessions: decoded.previousSessions ?? []
    }
}

/** Reads a stored remote identity blob into a Uint8Array (validates byte-shape). */
export function decodeSignalRemoteIdentity(raw: unknown): Uint8Array {
    return asBytes(raw, 'signal_identity.identity_key')
}
