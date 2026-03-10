import { hkdfSplit, toRawPubKey, toSerializedPubKey, X25519 } from '../../crypto'
import { SIGNAL_PREFIX } from '../../signal/constants'
import type {
    SignalInitialExchangeInfo,
    SignalMessageKey,
    SignalPeer,
    SignalRecvChain,
    SignalSendChain,
    SignalSerializedKeyPair,
    SignalSessionRecord,
    SignalSessionSnapshot
} from '../../signal/types'
import { cloneBytes, concatBytes, uint8Equal } from '../../util/bytes'
import type { WaSignalStore } from '../store/WaSignalStore'

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
    return {
        local: session.local,
        remote: session.remote,
        rootKey: session.rootKey,
        recvChains: session.recvChains,
        sendChain: session.sendChain,
        initialExchangeInfo: session.initialExchangeInfo,
        prevSendChainHighestIndex: session.prevSendChainHighestIndex,
        aliceBaseKey: session.aliceBaseKey
    }
}

export function makeSession(
    local: SignalPeer,
    remote: SignalPeer,
    rootKey: Uint8Array,
    recvChains: readonly SignalRecvChain[],
    sendChain: SignalSendChain,
    initialExchangeInfo: SignalInitialExchangeInfo | null,
    prevSendChainHighestIndex: number,
    prevSessions: readonly SignalSessionSnapshot[],
    aliceBaseKey: Uint8Array | null
): SignalSessionRecord {
    return {
        local,
        remote,
        rootKey,
        recvChains,
        sendChain,
        initialExchangeInfo,
        prevSendChainHighestIndex,
        prevSessions,
        aliceBaseKey
    }
}

export function setPrevSessions(
    session: SignalSessionRecord,
    prevSessions: readonly SignalSessionSnapshot[]
): SignalSessionRecord {
    return makeSession(
        session.local,
        session.remote,
        session.rootKey,
        session.recvChains,
        session.sendChain,
        session.initialExchangeInfo,
        session.prevSendChainHighestIndex,
        prevSessions,
        session.aliceBaseKey
    )
}

export function updateChains(
    session: SignalSessionRecord,
    recvChains: readonly SignalRecvChain[],
    sendChain: SignalSendChain
): SignalSessionRecord {
    return makeSession(
        session.local,
        session.remote,
        session.rootKey,
        recvChains,
        sendChain,
        session.initialExchangeInfo,
        session.prevSendChainHighestIndex,
        session.prevSessions,
        session.aliceBaseKey
    )
}

export function ratchetSession(
    session: SignalSessionRecord,
    recvChains: readonly SignalRecvChain[],
    sendChain: SignalSendChain,
    rootKey: Uint8Array
): SignalSessionRecord {
    return makeSession(
        session.local,
        session.remote,
        rootKey,
        recvChains,
        sendChain,
        null,
        Math.max(session.sendChain.nextMsgIndex - 1, 0),
        session.prevSessions,
        session.aliceBaseKey
    )
}

export function makeFreshRecvChain(
    ratchetPubKey: Uint8Array,
    chainKey: Uint8Array
): SignalRecvChain {
    return makeRecvChain(ratchetPubKey, 0, chainKey, [])
}

export function makeRecvChain(
    ratchetPubKey: Uint8Array,
    nextMsgIndex: number,
    chainKey: Uint8Array,
    unusedMsgKeys: readonly SignalMessageKey[]
): SignalRecvChain {
    return {
        ratchetPubKey,
        nextMsgIndex,
        chainKey,
        unusedMsgKeys
    }
}

export function makeFreshSendChain(
    ratchetKey: SignalSerializedKeyPair,
    chainKey: Uint8Array
): SignalSendChain {
    return makeSendChain(ratchetKey, 0, chainKey)
}

export function makeSendChain(
    ratchetKey: SignalSerializedKeyPair,
    nextMsgIndex: number,
    chainKey: Uint8Array
): SignalSendChain {
    return {
        ratchetKey,
        nextMsgIndex,
        chainKey
    }
}

export function makeInitialExchangeInfo(
    remoteOneTimeId: number | null,
    remoteSignedId: number,
    localOneTimePubKey: Uint8Array
): SignalInitialExchangeInfo {
    return {
        remoteOneTimeId,
        remoteSignedId,
        localOneTimePubKey
    }
}

export function findMatchingSession(
    session: SignalSessionRecord | null,
    sessionBaseKey: Uint8Array
): SignalSessionRecord | null {
    if (!session) {
        return null
    }
    if (
        session.aliceBaseKey &&
        uint8Equal(session.aliceBaseKey, toSerializedPubKey(sessionBaseKey))
    ) {
        return session
    }
    for (const prev of session.prevSessions) {
        if (
            prev.aliceBaseKey &&
            uint8Equal(prev.aliceBaseKey, toSerializedPubKey(sessionBaseKey))
        ) {
            throw new Error('invalid prekey signal message')
        }
    }
    return null
}

export async function requireLocalIdentity(
    store: WaSignalStore,
    toSerializedKeyPair: (pair: {
        pubKey: Uint8Array
        privKey: Uint8Array
    }) => SignalSerializedKeyPair
): Promise<LocalIdentityContext> {
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
    localOneTimeBase: SignalSerializedKeyPair,
    ecdh: (privateKey: Uint8Array, publicKey: Uint8Array) => Promise<Uint8Array>,
    generateSerializedKeyPair: () => Promise<SignalSerializedKeyPair>,
    calculateRatchet: (
        rootKey: Uint8Array,
        localRatchet: SignalSerializedKeyPair,
        remoteRatchetPubKey: Uint8Array
    ) => Promise<{ rootKey: Uint8Array; chainKey: Uint8Array }>
): Promise<SignalSessionRecord> {
    const remoteIdentity = toSerializedPubKey(remoteBundle.identity)
    const remoteSignedKey = toSerializedPubKey(remoteBundle.signedKey.publicKey)
    const remoteOneTimeKey = remoteBundle.oneTimeKey
        ? toSerializedPubKey(remoteBundle.oneTimeKey.publicKey)
        : null
    const remoteRatchetKey = toSerializedPubKey(
        remoteBundle.ratchetKey ?? remoteBundle.signedKey.publicKey
    )

    const secret = concatBytes([
        SIGNAL_PREFIX,
        await ecdh(local.staticKeyPair.privKey, remoteSignedKey),
        await ecdh(localOneTimeBase.privKey, remoteIdentity),
        await ecdh(localOneTimeBase.privKey, remoteSignedKey),
        ...(remoteOneTimeKey ? [await ecdh(localOneTimeBase.privKey, remoteOneTimeKey)] : [])
    ])
    const [rootKey, chainKey] = await hkdfSplit(secret, 'WhisperText', null)

    const recvChain = makeFreshRecvChain(remoteRatchetKey, chainKey)
    const sendRatchet = await generateSerializedKeyPair()
    const sendRatchetResult = await calculateRatchet(rootKey, sendRatchet, remoteRatchetKey)
    const initialExchangeInfo = makeInitialExchangeInfo(
        remoteBundle.oneTimeKey?.id ?? null,
        remoteBundle.signedKey.id,
        localOneTimeBase.pubKey
    )

    return makeSession(
        { regId: local.regId, pubKey: local.staticKeyPair.pubKey },
        { regId: remoteBundle.regId, pubKey: remoteIdentity },
        sendRatchetResult.rootKey,
        [recvChain],
        makeFreshSendChain(sendRatchet, sendRatchetResult.chainKey),
        initialExchangeInfo,
        0,
        [],
        localOneTimeBase.pubKey
    )
}

export async function initiateSessionIncoming(
    local: LocalIdentityContext,
    remote: { regId: number; pubKey: Uint8Array },
    sessionBaseKey: Uint8Array,
    localKeys: IncomingRatchetKeys,
    ecdh: (privateKey: Uint8Array, publicKey: Uint8Array) => Promise<Uint8Array>
): Promise<SignalSessionRecord> {
    const baseKey = toSerializedPubKey(sessionBaseKey)
    const remotePub = toSerializedPubKey(remote.pubKey)

    const secret = concatBytes([
        SIGNAL_PREFIX,
        await ecdh(localKeys.signed.privKey, remotePub),
        await ecdh(local.staticKeyPair.privKey, baseKey),
        await ecdh(localKeys.signed.privKey, baseKey),
        ...(localKeys.oneTime ? [await ecdh(localKeys.oneTime.privKey, baseKey)] : [])
    ])
    const [rootKey, chainKey] = await hkdfSplit(secret, 'WhisperText', null)

    return makeSession(
        { regId: local.regId, pubKey: local.staticKeyPair.pubKey },
        { regId: remote.regId, pubKey: remotePub },
        rootKey,
        [],
        makeFreshSendChain(localKeys.ratchet, chainKey),
        null,
        0,
        [],
        baseKey
    )
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
        privKey: cloneBytes(pair.privKey)
    }
}

export async function ecdh(privateKey: Uint8Array, publicKey: Uint8Array): Promise<Uint8Array> {
    return X25519.scalarMult(privateKey, toRawPubKey(publicKey))
}
