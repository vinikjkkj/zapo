import { proto, type Proto } from '@proto'
import { WA_DEFAULTS } from '@protocol/constants'
import type {
    PreKeyRecord,
    RegistrationInfo,
    SenderKeyDistributionRecord,
    SenderKeyRecord,
    SignalAddress,
    SignalMessageKey,
    SignalRecvChain,
    SignalSendChain,
    SignalSessionRecord,
    SignalSessionSnapshot,
    SignedPreKeyRecord
} from '@signal/types'
import { assertByteLength } from '@util/bytes'
import {
    asBytes,
    asNumber,
    asOptionalBytes,
    asOptionalNumber,
    asString,
    toBoolOrUndef
} from '@util/coercion'

export interface SignalAddressParts {
    readonly user: string
    readonly server: string
    readonly device: number
}

export interface SignalRegistrationRow extends Record<string, unknown> {
    readonly registration_id: unknown
    readonly identity_pub_key: unknown
    readonly identity_priv_key: unknown
}

export interface SignalSignedPreKeyRow extends Record<string, unknown> {
    readonly key_id: unknown
    readonly pub_key: unknown
    readonly priv_key: unknown
    readonly signature: unknown
    readonly uploaded: unknown
}

export interface SignalPreKeyRow extends Record<string, unknown> {
    readonly key_id: unknown
    readonly pub_key: unknown
    readonly priv_key: unknown
    readonly uploaded: unknown
}

export interface SignalMetaRow extends Record<string, unknown> {
    readonly server_has_prekeys: unknown
    readonly next_prekey_id: unknown
    readonly signed_prekey_rotation_ts: unknown
}

export interface SignalSessionRow extends Record<string, unknown> {
    readonly user: unknown
    readonly server: unknown
    readonly device: unknown
    readonly record: unknown
}

export interface SignalIdentityRow extends Record<string, unknown> {
    readonly identity_key: unknown
}

export interface SenderKeyRow extends Record<string, unknown> {
    readonly group_id: unknown
    readonly sender_user: unknown
    readonly sender_server: unknown
    readonly sender_device: unknown
    readonly record: unknown
}

export interface SenderKeyDistributionRow extends Record<string, unknown> {
    readonly group_id: unknown
    readonly sender_user: unknown
    readonly sender_server: unknown
    readonly sender_device: unknown
    readonly key_id: unknown
    readonly timestamp_ms: unknown
}

export interface StoreCountRow extends Record<string, unknown> {
    readonly count: unknown
}

export function toSignalAddressParts(address: SignalAddress): SignalAddressParts {
    return {
        user: address.user,
        server: address.server ?? WA_DEFAULTS.HOST_DOMAIN,
        device: address.device
    }
}

export function decodeSignalAddressFromRow(
    row:
        | Pick<
              SenderKeyRow | SenderKeyDistributionRow | SignalSessionRow,
              'sender_user' | 'sender_server' | 'sender_device'
          >
        | {
              readonly sender_user?: unknown
              readonly sender_server?: unknown
              readonly sender_device?: unknown
          }
): SignalAddress {
    return {
        user: asString(row.sender_user, 'signal.sender_user'),
        server: asString(row.sender_server, 'signal.sender_server'),
        device: asNumber(row.sender_device, 'signal.sender_device')
    }
}

export function decodeSignalRegistrationRow(row: SignalRegistrationRow): RegistrationInfo {
    return {
        registrationId: asNumber(row.registration_id, 'signal_registration.registration_id'),
        identityKeyPair: {
            pubKey: asBytes(row.identity_pub_key, 'signal_registration.identity_pub_key'),
            privKey: asBytes(row.identity_priv_key, 'signal_registration.identity_priv_key')
        }
    }
}

export function decodeSignalPreKeyRow(row: SignalPreKeyRow): PreKeyRecord {
    return {
        keyId: asNumber(row.key_id, 'signal_prekey.key_id'),
        keyPair: {
            pubKey: asBytes(row.pub_key, 'signal_prekey.pub_key'),
            privKey: asBytes(row.priv_key, 'signal_prekey.priv_key')
        },
        uploaded: toBoolOrUndef(row.uploaded)
    }
}

export function decodeSignalSignedPreKeyRow(row: SignalSignedPreKeyRow): SignedPreKeyRecord {
    return {
        keyId: asNumber(row.key_id, 'signal_signed_prekey.key_id'),
        keyPair: {
            pubKey: asBytes(row.pub_key, 'signal_signed_prekey.pub_key'),
            privKey: asBytes(row.priv_key, 'signal_signed_prekey.priv_key')
        },
        signature: asBytes(row.signature, 'signal_signed_prekey.signature'),
        uploaded: toBoolOrUndef(row.uploaded)
    }
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

export function encodeSignalSessionRecord(record: SignalSessionRecord): Uint8Array {
    return proto.RecordStructure.encode({
        currentSession: encodeSignalSessionSnapshot(record),
        previousSessions: record.prevSessions as Proto.ISessionStructure[]
    }).finish()
}

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

export function encodeSenderKeyRecord(record: SenderKeyRecord): Uint8Array {
    return proto.SenderKeyRecordStructure.encode({
        senderKeyStates: [
            {
                senderKeyId: record.keyId,
                senderChainKey: {
                    iteration: record.iteration,
                    seed: record.chainKey
                },
                senderSigningKey: {
                    public: record.signingPublicKey,
                    private: record.signingPrivateKey
                },
                senderMessageKeys: (() => {
                    const src = record.unusedMessageKeys ?? []
                    const arr = new Array<{ iteration: number; seed: Uint8Array }>(src.length)
                    for (let i = 0; i < src.length; i += 1) {
                        const messageKey = src[i]
                        arr[i] = {
                            iteration: messageKey.iteration,
                            seed: messageKey.seed
                        }
                    }
                    return arr
                })()
            }
        ]
    }).finish()
}

function decodeSenderKeyState(
    state: Proto.ISenderKeyStateStructure,
    field: string
): {
    readonly keyId: number
    readonly iteration: number
    readonly chainKey: Uint8Array
    readonly signingPublicKey: Uint8Array
    readonly signingPrivateKey?: Uint8Array
    readonly unusedMessageKeys: readonly { readonly iteration: number; readonly seed: Uint8Array }[]
} {
    if (!state.senderChainKey) {
        throw new Error(`missing ${field}.senderChainKey`)
    }
    if (!state.senderSigningKey) {
        throw new Error(`missing ${field}.senderSigningKey`)
    }
    return {
        keyId: asNumber(state.senderKeyId, `${field}.senderKeyId`),
        iteration: asNumber(state.senderChainKey.iteration, `${field}.senderChainKey.iteration`),
        chainKey: asBytes(state.senderChainKey.seed, `${field}.senderChainKey.seed`),
        signingPublicKey: asBytes(
            state.senderSigningKey.public,
            `${field}.senderSigningKey.public`
        ),
        signingPrivateKey:
            state.senderSigningKey.private !== null && state.senderSigningKey.private !== undefined
                ? asBytes(state.senderSigningKey.private, `${field}.senderSigningKey.private`)
                : undefined,
        unusedMessageKeys: (() => {
            const src = state.senderMessageKeys ?? []
            const arr = new Array<{ readonly iteration: number; readonly seed: Uint8Array }>(
                src.length
            )
            for (let i = 0; i < src.length; i += 1) {
                const messageKey = src[i]
                arr[i] = {
                    iteration: asNumber(
                        messageKey.iteration,
                        `${field}.senderMessageKeys[${i}].iteration`
                    ),
                    seed: asBytes(messageKey.seed, `${field}.senderMessageKeys[${i}].seed`)
                }
            }
            return arr
        })()
    }
}

export function decodeSenderKeyRecord(
    raw: unknown,
    groupId: string,
    sender: SignalAddress
): SenderKeyRecord {
    const decoded = proto.SenderKeyRecordStructure.decode(asBytes(raw, 'sender_keys.record'))
    const state = decoded.senderKeyStates?.[0]
    if (!state) {
        throw new Error('missing sender_keys.record.senderKeyStates[0]')
    }
    const parsed = decodeSenderKeyState(state, 'sender_keys.record.senderKeyStates[0]')
    return {
        groupId,
        sender,
        keyId: parsed.keyId,
        iteration: parsed.iteration,
        chainKey: parsed.chainKey,
        signingPublicKey: parsed.signingPublicKey,
        signingPrivateKey: parsed.signingPrivateKey,
        unusedMessageKeys: parsed.unusedMessageKeys
    }
}

export function decodeSenderKeyDistributionRow(
    row: SenderKeyDistributionRow
): SenderKeyDistributionRecord {
    return {
        groupId: asString(row.group_id, 'sender_key_distribution.group_id'),
        sender: {
            user: asString(row.sender_user, 'sender_key_distribution.sender_user'),
            server: asString(row.sender_server, 'sender_key_distribution.sender_server'),
            device: asNumber(row.sender_device, 'sender_key_distribution.sender_device')
        },
        keyId: asNumber(row.key_id, 'sender_key_distribution.key_id'),
        timestampMs: asNumber(row.timestamp_ms, 'sender_key_distribution.timestamp_ms')
    }
}

export function decodeStoreCount(row: StoreCountRow | null, field: string): number {
    return row ? asNumber(row.count, field) : 0
}

export function decodeSignalRemoteIdentity(raw: unknown): Uint8Array {
    return asBytes(raw, 'signal_identity.identity_key')
}
