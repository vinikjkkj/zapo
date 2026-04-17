import type { SignalKeyPair } from '@crypto/curves/types'
import type { Proto } from '@proto'

export interface RegistrationInfo {
    readonly registrationId: number
    readonly identityKeyPair: SignalKeyPair
}

export interface PreKeyRecord {
    readonly keyId: number
    readonly keyPair: SignalKeyPair
    readonly uploaded?: boolean
}

export interface SignedPreKeyRecord {
    readonly keyId: number
    readonly keyPair: SignalKeyPair
    readonly signature: Uint8Array
    readonly uploaded?: boolean
}

export interface SignalAddress {
    readonly user: string
    readonly server?: string
    readonly device: number
}

export interface SignalPeer {
    readonly regId: number
    readonly pubKey: Uint8Array
}

export interface SignalSerializedKeyPair {
    readonly pubKey: Uint8Array
    readonly privKey: Uint8Array
}

export interface SignalMessageKey {
    readonly index: number
    readonly cipherKey: Uint8Array
    readonly macKey: Uint8Array
    readonly iv: Uint8Array
}

export interface SignalRecvChain {
    readonly ratchetPubKey: Uint8Array
    readonly nextMsgIndex: number
    readonly chainKey: Uint8Array
    readonly unusedMsgKeys: readonly Proto.SessionStructure.Chain.IMessageKey[]
}

/**
 * Raw protobuf recv chain kept as-is to avoid eager decode.
 * Use {@link decodeSignalRecvChain} only for the chain that
 * actually needs to be read/modified.
 */
export type RawSignalRecvChain = Proto.SessionStructure.IChain

export interface SignalSendChain {
    readonly ratchetKey: SignalSerializedKeyPair
    readonly nextMsgIndex: number
    readonly chainKey: Uint8Array
}

export interface SignalInitialExchangeInfo {
    readonly remoteOneTimeId: number | null
    readonly remoteSignedId: number
    readonly localOneTimePubKey: Uint8Array
}

export interface SignalSessionSnapshot {
    readonly local: SignalPeer
    readonly remote: SignalPeer
    readonly rootKey: Uint8Array
    readonly sendChain: SignalSendChain
    readonly recvChains: readonly RawSignalRecvChain[]
    readonly initialExchangeInfo: SignalInitialExchangeInfo | null
    readonly prevSendChainHighestIndex: number
    readonly aliceBaseKey: Uint8Array | null
}

export interface SignalSessionRecord extends SignalSessionSnapshot {
    readonly prevSessions: readonly RawSignalSessionSnapshot[]
}

/**
 * Raw protobuf session snapshot kept as-is to avoid eager decode.
 * Only decoded on demand in rare fallback paths (session mismatch).
 */
export type RawSignalSessionSnapshot = Proto.ISessionStructure

export interface SignalPreKeyBundle {
    readonly regId: number
    readonly identity: Uint8Array
    readonly signedKey: {
        readonly id: number
        readonly publicKey: Uint8Array
        readonly signature: Uint8Array
    }
    readonly oneTimeKey?: {
        readonly id: number
        readonly publicKey: Uint8Array
    }
    readonly ratchetKey?: Uint8Array
}

export interface ParsedSignalMessage {
    readonly ratchetPubKey: Uint8Array
    readonly counter: number
    readonly ciphertext: Uint8Array
    readonly versionContentMac: Uint8Array
}

export interface ParsedPreKeySignalMessage extends ParsedSignalMessage {
    readonly remote: SignalPeer
    readonly sessionBaseKey: Uint8Array
    readonly localSignedPreKeyId: number
    readonly localOneTimeKeyId: number | null
}

export interface SenderKeyRecord {
    readonly groupId: string
    readonly sender: SignalAddress
    readonly keyId: number
    readonly iteration: number
    readonly chainKey: Uint8Array
    readonly signingPublicKey: Uint8Array
    readonly signingPrivateKey?: Uint8Array
    readonly unusedMessageKeys?: readonly SenderMessageKey[]
}

export interface SenderMessageKey {
    readonly iteration: number
    readonly seed: Uint8Array
}

export interface SenderKeyDistributionRecord {
    readonly groupId: string
    readonly sender: SignalAddress
    readonly keyId: number
    readonly timestampMs: number
}
