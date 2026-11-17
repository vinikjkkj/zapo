import type { SignalKeyPair } from '@crypto/curves/types'
import type { KemKeyPair } from '@crypto/kem/types'
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

/**
 * A post-quantum (ML-KEM-1024) pre-key: a KEM key pair plus an XEdDSA signature
 * over its raw public key, made with the device identity key. `lastResort`
 * marks the single long-lived key served when the one-time pool is exhausted.
 */
export interface KyberPreKeyRecord {
    readonly keyId: number
    readonly keyPair: KemKeyPair
    readonly signature: Uint8Array
    readonly lastResort?: boolean
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
    /**
     * PQXDH: the id of the remote Kyber pre-key consumed, and the KEM
     * ciphertext the initiator must carry in the first pre-key message so the
     * responder can decapsulate. Both null on a classic (non-PQ) session.
     */
    readonly kyberPreKeyId?: number | null
    readonly kemCiphertext?: Uint8Array | null
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
    /**
     * Signal session format version, written into the message version byte
     * while post-quantum 1:1 is on. 3 (classic) when absent; 4 for a PQXDH session.
     */
    readonly version?: number
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
    /** PQXDH: the peer's signed ML-KEM-1024 pre-key, when the bundle carries one. */
    readonly kyberKey?: {
        readonly id: number
        readonly publicKey: Uint8Array
        readonly signature: Uint8Array
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
    /**
     * PQXDH: the id of the local Kyber pre-key the initiator encapsulated
     * against, and the KEM ciphertext to decapsulate. Both null on a classic
     * pre-key message (v3).
     */
    readonly localKyberPreKeyId: number | null
    readonly kemCiphertext: Uint8Array | null
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
