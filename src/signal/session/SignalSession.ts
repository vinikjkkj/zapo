import { hkdfSplit, toRawPubKey, toSerializedPubKey, X25519 } from '@crypto'
import { SIGNAL_PREFIX } from '@signal/constants'
import { decodeSignalSessionSnapshot, encodeSignalSessionSnapshot } from '@signal/encoding'
import type {
    RawSignalRecvChain,
    RawSignalSessionSnapshot,
    SignalSerializedKeyPair,
    SignalSessionRecord,
    SignalSessionSnapshot
} from '@signal/types'
import type { WaSignalStore } from '@store/contracts/signal.store'
import { concatBytes, uint8Equal } from '@util/bytes'

interface LocalIdentityContext {
    readonly regId: number
    readonly staticKeyPair: SignalSerializedKeyPair
}

interface IncomingRatchetKeys {
    readonly signed: SignalSerializedKeyPair
    readonly oneTime?: SignalSerializedKeyPair
    readonly ratchet: SignalSerializedKeyPair
}

export function snapshotToRecord(snapshot: SignalSessionSnapshot): SignalSessionRecord {
    return {
        ...snapshot,
        prevSessions: []
    }
}

export function detachSession(session: SignalSessionRecord): SignalSessionSnapshot {
    const { prevSessions, ...snapshot } = session
    void prevSessions
    return snapshot
}

export function findMatchingSession(
    session: SignalSessionRecord | null,
    sessionBaseKey: Uint8Array
): SignalSessionRecord | null {
    if (!session) {
        return null
    }
    const serializedBaseKey = toSerializedPubKey(sessionBaseKey)
    if (session.aliceBaseKey && uint8Equal(session.aliceBaseKey, serializedBaseKey)) {
        return session
    }
    for (let index = 0; index < session.prevSessions.length; index += 1) {
        const rawPrev = session.prevSessions[index]
        if (!rawPrev.aliceBaseKey || !uint8Equal(rawPrev.aliceBaseKey, serializedBaseKey)) {
            continue
        }

        const decoded = decodeSignalSessionSnapshot(rawPrev, `prevSessions[${index}]`)
        const prevSessions: RawSignalSessionSnapshot[] = [
            encodeSignalSessionSnapshot(detachSession(session))
        ]
        for (let i = 0; i < session.prevSessions.length; i += 1) {
            if (i !== index) {
                prevSessions.push(session.prevSessions[i])
            }
        }

        return {
            ...decoded,
            prevSessions
        }
    }
    return null
}

export async function requireLocalIdentity(store: WaSignalStore): Promise<LocalIdentityContext> {
    const registration = await store.getRegistrationInfo()
    if (!registration) {
        throw new Error('registration info not found')
    }
    return {
        regId: registration.registrationId,
        staticKeyPair: toSerializedKeyPair(registration.identityKeyPair)
    }
}

export async function initiateSessionOutgoing(
    local: LocalIdentityContext,
    remoteBundle: {
        identity: Uint8Array
        signedKey: { id: number; publicKey: Uint8Array }
        oneTimeKey?: { id: number; publicKey: Uint8Array }
        ratchetKey?: Uint8Array
        regId: number
    },
    localOneTimeBase: SignalSerializedKeyPair
): Promise<SignalSessionRecord> {
    const remoteIdentity = toSerializedPubKey(remoteBundle.identity)
    const remoteSignedKey = toSerializedPubKey(remoteBundle.signedKey.publicKey)
    const remoteOneTimeKey = remoteBundle.oneTimeKey
        ? toSerializedPubKey(remoteBundle.oneTimeKey.publicKey)
        : null
    const remoteRatchetKey = toSerializedPubKey(
        remoteBundle.ratchetKey ?? remoteBundle.signedKey.publicKey
    )

    const [signedDh, identityDh, baseDh, oneTimeDh] = await Promise.all([
        ecdh(local.staticKeyPair.privKey, remoteSignedKey),
        ecdh(localOneTimeBase.privKey, remoteIdentity),
        ecdh(localOneTimeBase.privKey, remoteSignedKey),
        remoteOneTimeKey
            ? ecdh(localOneTimeBase.privKey, remoteOneTimeKey)
            : Promise.resolve<Uint8Array | null>(null)
    ])
    const secret = concatBytes([
        SIGNAL_PREFIX,
        signedDh,
        identityDh,
        baseDh,
        ...(oneTimeDh ? [oneTimeDh] : [])
    ])
    const [rootKey, chainKey] = await hkdfSplit(secret, null, 'WhisperText')

    const recvChain: RawSignalRecvChain = {
        senderRatchetKey: remoteRatchetKey,
        chainKey: { index: 0, key: chainKey },
        messageKeys: []
    }
    const sendRatchet = await generateSerializedKeyPair()
    const sendRatchetResult = await calculateRatchet(rootKey, sendRatchet, remoteRatchetKey)

    return {
        local: { regId: local.regId, pubKey: local.staticKeyPair.pubKey },
        remote: { regId: remoteBundle.regId, pubKey: remoteIdentity },
        rootKey: sendRatchetResult.rootKey,
        recvChains: [recvChain],
        sendChain: {
            ratchetKey: sendRatchet,
            nextMsgIndex: 0,
            chainKey: sendRatchetResult.chainKey
        },
        initialExchangeInfo: {
            remoteOneTimeId: remoteBundle.oneTimeKey?.id ?? null,
            remoteSignedId: remoteBundle.signedKey.id,
            localOneTimePubKey: localOneTimeBase.pubKey
        },
        prevSendChainHighestIndex: 0,
        prevSessions: [],
        aliceBaseKey: localOneTimeBase.pubKey
    }
}

export async function initiateSessionIncoming(
    local: LocalIdentityContext,
    remote: { regId: number; pubKey: Uint8Array },
    sessionBaseKey: Uint8Array,
    localKeys: IncomingRatchetKeys
): Promise<SignalSessionRecord> {
    const baseKey = toSerializedPubKey(sessionBaseKey)
    const remotePub = toSerializedPubKey(remote.pubKey)

    const [identityDh, staticDh, signedDh, oneTimeDh] = await Promise.all([
        ecdh(localKeys.signed.privKey, remotePub),
        ecdh(local.staticKeyPair.privKey, baseKey),
        ecdh(localKeys.signed.privKey, baseKey),
        localKeys.oneTime
            ? ecdh(localKeys.oneTime.privKey, baseKey)
            : Promise.resolve<Uint8Array | null>(null)
    ])
    const secret = concatBytes([
        SIGNAL_PREFIX,
        identityDh,
        staticDh,
        signedDh,
        ...(oneTimeDh ? [oneTimeDh] : [])
    ])
    const [rootKey, chainKey] = await hkdfSplit(secret, null, 'WhisperText')

    return {
        local: { regId: local.regId, pubKey: local.staticKeyPair.pubKey },
        remote: { regId: remote.regId, pubKey: remotePub },
        rootKey,
        recvChains: [],
        sendChain: {
            ratchetKey: localKeys.ratchet,
            nextMsgIndex: 0,
            chainKey
        },
        initialExchangeInfo: null,
        prevSendChainHighestIndex: 0,
        prevSessions: [],
        aliceBaseKey: baseKey
    }
}

export async function calculateRatchet(
    rootKey: Uint8Array,
    localRatchet: SignalSerializedKeyPair,
    remoteRatchetPubKey: Uint8Array
): Promise<{ readonly rootKey: Uint8Array; readonly chainKey: Uint8Array }> {
    const sharedSecret = await ecdh(localRatchet.privKey, remoteRatchetPubKey)
    const [nextRootKey, chainKey] = await hkdfSplit(sharedSecret, rootKey, 'WhisperRatchet')
    return {
        rootKey: nextRootKey,
        chainKey
    }
}

export async function generateSerializedKeyPair(): Promise<SignalSerializedKeyPair> {
    const pair = await X25519.generateKeyPair()
    return toSerializedKeyPair(pair)
}

export function toSerializedKeyPair(pair: {
    readonly pubKey: Uint8Array
    readonly privKey: Uint8Array
}): SignalSerializedKeyPair {
    return {
        pubKey: toSerializedPubKey(pair.pubKey),
        privKey: pair.privKey
    }
}

export async function ecdh(privateKey: Uint8Array, publicKey: Uint8Array): Promise<Uint8Array> {
    return X25519.scalarMult(privateKey, toRawPubKey(publicKey))
}
