import type { Proto } from 'zapo-js/proto'
import type { SignalAddress, SignalSessionRecord } from 'zapo-js/signal'
import { base64ToBytes, bytesToBase64 } from 'zapo-js/util'

import { signalAddressFromLibsignalString } from '../util/address'

import { toBytes } from './coerce'
import type {
    BaileysChain,
    BaileysSerializedSessionEntry,
    BaileysSerializedSessionRecord
} from './types'

const SIGNAL_VERSION = 3
const CHAIN_TYPE_SENDING = 1
const BASE_KEY_TYPE_OURS = 1

/**
 * Local pair isn't in the Baileys session entry — it lives in `creds.registrationId`
 * and `creds.signedIdentityKey.public`. The 32-byte raw form is auto-prefixed to 33B.
 */
export interface BaileysLocalIdentity {
    readonly regId: number
    readonly identityPubKey: Uint8Array
}

function normalizeKey33(input: Uint8Array, field: string): Uint8Array {
    if (input.length === 33) return input
    if (input.length === 32) {
        const out = new Uint8Array(33)
        out[0] = 0x05
        out.set(input, 1)
        return out
    }
    throw new Error(`baileys.${field}: expected 32 or 33 bytes, got ${input.length}`)
}

function pickCurrentEntry(
    sessions: Readonly<Record<string, BaileysSerializedSessionEntry>>
): { readonly key: string; readonly entry: BaileysSerializedSessionEntry } | null {
    const entries = Object.entries(sessions)
    if (entries.length === 0) return null

    let openKey: string | null = null
    let openEntry: BaileysSerializedSessionEntry | null = null
    let fallbackKey: string | null = null
    let fallbackEntry: BaileysSerializedSessionEntry | null = null
    let fallbackUsed = -1

    for (let i = 0; i < entries.length; i += 1) {
        const [k, e] = entries[i]
        if (e.indexInfo.closed === -1 && openEntry === null) {
            openKey = k
            openEntry = e
        }
        const used = e.indexInfo.used ?? 0
        if (used >= fallbackUsed) {
            fallbackKey = k
            fallbackEntry = e
            fallbackUsed = used
        }
    }

    if (openKey !== null && openEntry !== null) {
        return { key: openKey, entry: openEntry }
    }
    if (fallbackKey !== null && fallbackEntry !== null) {
        return { key: fallbackKey, entry: fallbackEntry }
    }
    return null
}

function findSendChain(
    entry: BaileysSerializedSessionEntry,
    ratchetPubKeyBytes: Uint8Array
): { readonly key: string; readonly chain: BaileysChain } | null {
    const expected = bytesToBase64(ratchetPubKeyBytes)
    const direct = entry._chains[expected]
    if (direct) return { key: expected, chain: direct }
    for (const key of Object.keys(entry._chains)) {
        const chain = entry._chains[key]
        if (chain.chainType === CHAIN_TYPE_SENDING) return { key, chain }
    }
    return null
}

function recvChainsProtoFromEntry(
    entry: BaileysSerializedSessionEntry,
    sendChainKey: string | null
): Proto.SessionStructure.IChain[] {
    // messageKeys dropped: Baileys stores raw HKDF seeds, zapo expects
    // pre-derived {cipherKey,macKey,iv} — not interconvertible without re-running KDF.
    const out: Proto.SessionStructure.IChain[] = []
    for (const key of Object.keys(entry._chains)) {
        if (key === sendChainKey) continue
        const chain = entry._chains[key]
        if (chain.chainType === CHAIN_TYPE_SENDING) continue
        const ratchetPubKey = normalizeKey33(
            base64ToBytes(key),
            `recvChain[${key}].senderRatchetKey`
        )
        out.push({
            senderRatchetKey: ratchetPubKey,
            chainKey: {
                index: chain.chainKey.counter,
                key: toBytes(chain.chainKey.key, `recvChain[${key}].chainKey.key`)
            },
            messageKeys: []
        })
    }
    return out
}

function snapshotProtoFromEntry(
    entry: BaileysSerializedSessionEntry,
    local: BaileysLocalIdentity,
    field: string
): Proto.ISessionStructure {
    const ratchetPubKey = normalizeKey33(
        toBytes(entry.currentRatchet.ephemeralKeyPair.pubKey, `${field}.currentRatchet.pubKey`),
        `${field}.currentRatchet.pubKey`
    )
    const ratchetPrivKey = toBytes(
        entry.currentRatchet.ephemeralKeyPair.privKey,
        `${field}.currentRatchet.privKey`
    )
    const sendInfo = findSendChain(entry, ratchetPubKey)
    const sendChainKey = sendInfo?.key ?? null

    const remotePubKey = normalizeKey33(
        toBytes(entry.indexInfo.remoteIdentityKey, `${field}.indexInfo.remoteIdentityKey`),
        `${field}.indexInfo.remoteIdentityKey`
    )
    const localPubKey = normalizeKey33(local.identityPubKey, 'local.identityPubKey')

    const senderChain: Proto.SessionStructure.IChain = sendInfo
        ? {
              senderRatchetKey: ratchetPubKey,
              senderRatchetKeyPrivate: ratchetPrivKey,
              chainKey: {
                  index: sendInfo.chain.chainKey.counter,
                  key: toBytes(sendInfo.chain.chainKey.key, `${field}.sendChain.key`)
              },
              messageKeys: []
          }
        : {
              senderRatchetKey: ratchetPubKey,
              senderRatchetKeyPrivate: ratchetPrivKey,
              chainKey: { index: 0, key: new Uint8Array(32) },
              messageKeys: []
          }

    const aliceBaseKey =
        entry.indexInfo.baseKeyType === BASE_KEY_TYPE_OURS
            ? normalizeKey33(
                  toBytes(entry.indexInfo.baseKey, `${field}.indexInfo.baseKey`),
                  `${field}.indexInfo.baseKey`
              )
            : undefined

    const pendingPreKey: Proto.SessionStructure.IPendingPreKey | undefined = entry.pendingPreKey
        ? {
              preKeyId: entry.pendingPreKey.preKeyId,
              signedPreKeyId: entry.pendingPreKey.signedKeyId,
              baseKey: normalizeKey33(
                  toBytes(entry.pendingPreKey.baseKey, `${field}.pendingPreKey.baseKey`),
                  `${field}.pendingPreKey.baseKey`
              )
          }
        : undefined

    return {
        sessionVersion: SIGNAL_VERSION,
        localRegistrationId: local.regId,
        localIdentityPublic: localPubKey,
        remoteRegistrationId: entry.registrationId,
        remoteIdentityPublic: remotePubKey,
        rootKey: toBytes(entry.currentRatchet.rootKey, `${field}.currentRatchet.rootKey`),
        previousCounter: entry.currentRatchet.previousCounter,
        senderChain,
        receiverChains: recvChainsProtoFromEntry(entry, sendChainKey),
        pendingPreKey,
        aliceBaseKey
    }
}

function recordFromEntry(
    entry: BaileysSerializedSessionEntry,
    local: BaileysLocalIdentity,
    field: string,
    prevSessions: readonly Proto.ISessionStructure[]
): SignalSessionRecord {
    const ratchetPubKey = normalizeKey33(
        toBytes(entry.currentRatchet.ephemeralKeyPair.pubKey, `${field}.currentRatchet.pubKey`),
        `${field}.currentRatchet.pubKey`
    )
    const ratchetPrivKey = toBytes(
        entry.currentRatchet.ephemeralKeyPair.privKey,
        `${field}.currentRatchet.privKey`
    )
    const sendInfo = findSendChain(entry, ratchetPubKey)
    const sendChainKey = sendInfo?.key ?? null

    const remotePubKey = normalizeKey33(
        toBytes(entry.indexInfo.remoteIdentityKey, `${field}.indexInfo.remoteIdentityKey`),
        `${field}.indexInfo.remoteIdentityKey`
    )
    const localPubKey = normalizeKey33(local.identityPubKey, 'local.identityPubKey')

    const sendChain = sendInfo
        ? {
              ratchetKey: { pubKey: ratchetPubKey, privKey: ratchetPrivKey },
              nextMsgIndex: sendInfo.chain.chainKey.counter,
              chainKey: toBytes(sendInfo.chain.chainKey.key, `${field}.sendChain.key`)
          }
        : {
              ratchetKey: { pubKey: ratchetPubKey, privKey: ratchetPrivKey },
              nextMsgIndex: 0,
              chainKey: new Uint8Array(32)
          }

    const aliceBaseKey =
        entry.indexInfo.baseKeyType === BASE_KEY_TYPE_OURS
            ? normalizeKey33(
                  toBytes(entry.indexInfo.baseKey, `${field}.indexInfo.baseKey`),
                  `${field}.indexInfo.baseKey`
              )
            : null

    const initialExchangeInfo = entry.pendingPreKey
        ? {
              remoteOneTimeId: entry.pendingPreKey.preKeyId ?? null,
              remoteSignedId: entry.pendingPreKey.signedKeyId,
              localOneTimePubKey: normalizeKey33(
                  toBytes(entry.pendingPreKey.baseKey, `${field}.pendingPreKey.baseKey`),
                  `${field}.pendingPreKey.baseKey`
              )
          }
        : null

    return {
        local: { regId: local.regId, pubKey: localPubKey },
        remote: { regId: entry.registrationId, pubKey: remotePubKey },
        rootKey: toBytes(entry.currentRatchet.rootKey, `${field}.currentRatchet.rootKey`),
        sendChain,
        recvChains: recvChainsProtoFromEntry(entry, sendChainKey),
        initialExchangeInfo,
        prevSendChainHighestIndex: entry.currentRatchet.previousCounter,
        aliceBaseKey,
        prevSessions
    }
}

/**
 * Input is the plain JS object produced by libsignal-node's `SessionRecord.serialize()`,
 * NOT proto bytes. Open entry (closed === -1) becomes current; closed history
 * goes to `prevSessions`. Falls back to most-recently-used when none are open.
 */
export function convertBaileysSession(
    addrEncoded: string,
    serialized: BaileysSerializedSessionRecord,
    options: {
        readonly local: BaileysLocalIdentity
        readonly server?: string
    }
): { readonly address: SignalAddress; readonly record: SignalSessionRecord } {
    const address = signalAddressFromLibsignalString(addrEncoded, { server: options.server })
    const current = pickCurrentEntry(serialized._sessions)
    if (!current) {
        throw new Error(`baileys session ${addrEncoded}: empty _sessions`)
    }

    const prevSessions: Proto.ISessionStructure[] = []
    for (const key of Object.keys(serialized._sessions)) {
        if (key === current.key) continue
        prevSessions.push(
            snapshotProtoFromEntry(serialized._sessions[key], options.local, `prevSessions[${key}]`)
        )
    }

    return {
        address,
        record: recordFromEntry(current.entry, options.local, 'currentSession', prevSessions)
    }
}
