// Shapes mirror Baileys' multi-file auth state after JSON parse + bufferJsonReviver.
// No runtime dep on Baileys.

export interface BaileysKeyPair {
    readonly public: Uint8Array
    readonly private: Uint8Array
}

export interface BaileysSignedKeyPair {
    readonly keyPair: BaileysKeyPair
    readonly signature: Uint8Array
    readonly keyId: number
    readonly timestampS?: number
}

export interface BaileysProtocolAddress {
    readonly name: string
    readonly deviceId: number
}

export interface BaileysSignalIdentity {
    readonly identifier: BaileysProtocolAddress
    readonly identifierKey: Uint8Array
}

export interface BaileysADVSignedDeviceIdentity {
    readonly details?: Uint8Array
    readonly accountSignatureKey?: Uint8Array
    readonly accountSignature?: Uint8Array
    readonly deviceSignature?: Uint8Array
}

export interface BaileysContact {
    readonly id: string
    readonly lid?: string
    readonly name?: string
    readonly notify?: string
    readonly verifiedName?: string
    readonly imgUrl?: string | null
    readonly status?: string
}

export interface BaileysAuthenticationCreds {
    readonly noiseKey: BaileysKeyPair
    readonly pairingEphemeralKeyPair: BaileysKeyPair
    readonly signedIdentityKey: BaileysKeyPair
    readonly signedPreKey: BaileysSignedKeyPair
    readonly registrationId: number
    /** base64 of the 32-byte secret (Baileys persists it as a string). */
    readonly advSecretKey: string
    readonly me?: BaileysContact
    readonly account?: BaileysADVSignedDeviceIdentity
    readonly signalIdentities?: readonly BaileysSignalIdentity[]
    readonly myAppStateKeyId?: string
    readonly firstUnuploadedPreKeyId: number
    readonly nextPreKeyId: number
    readonly lastAccountSyncTimestamp?: number
    readonly platform?: string
    readonly accountSyncCounter: number
    readonly registered: boolean
    readonly pairingCode?: string
    readonly lastPropHash?: string
    readonly routingInfo?: Uint8Array
}

export interface BaileysAppStateSyncKeyData {
    readonly keyData?: Uint8Array
    readonly fingerprint?: {
        readonly rawId?: number
        readonly currentIndex?: number
        readonly deviceIndexes?: readonly number[]
    }
    readonly timestamp?: number | string
}

export interface BaileysLTHashState {
    readonly version: number
    readonly hash: Uint8Array
    readonly indexValueMap: Readonly<Record<string, { readonly valueMac: Uint8Array }>>
}

export interface BaileysTcTokenEntry {
    readonly token: Uint8Array
    readonly timestamp?: string
}

// `SessionRecord.serialize()` does NOT produce proto bytes — it returns a plain
// object with base64 strings inline. Custom stores that round-trip through
// BufferJSON end up with Uint8Array instead. Both forms accepted via MaybeBytes.

export type MaybeBytes = Uint8Array | string

export interface BaileysChainKey {
    readonly counter: number
    readonly key: MaybeBytes
}

export type BaileysMessageKeys = Readonly<Record<string, MaybeBytes>>

export interface BaileysChain {
    readonly chainKey: BaileysChainKey
    /** `1` = sending, `2` = receiving. */
    readonly chainType: number
    readonly messageKeys: BaileysMessageKeys
}

export interface BaileysCurrentRatchet {
    readonly ephemeralKeyPair: {
        readonly pubKey: MaybeBytes
        readonly privKey: MaybeBytes
    }
    readonly lastRemoteEphemeralKey: MaybeBytes
    readonly previousCounter: number
    readonly rootKey: MaybeBytes
}

export interface BaileysIndexInfo {
    readonly baseKey: MaybeBytes
    /** `1` = OURS (alice), `2` = THEIRS (bob). */
    readonly baseKeyType: number
    /** `-1` when open. */
    readonly closed: number
    readonly used: number
    readonly created: number
    readonly remoteIdentityKey: MaybeBytes
}

export interface BaileysPendingPreKey {
    readonly preKeyId?: number
    /** Baileys' field name — maps to zapo's `signedPreKeyId`. */
    readonly signedKeyId: number
    readonly baseKey: MaybeBytes
}

export interface BaileysSerializedSessionEntry {
    /** Remote regId; local one comes from creds. */
    readonly registrationId: number
    readonly currentRatchet: BaileysCurrentRatchet
    readonly indexInfo: BaileysIndexInfo
    readonly _chains: Readonly<Record<string, BaileysChain>>
    readonly pendingPreKey?: BaileysPendingPreKey
}

export interface BaileysSerializedSessionRecord {
    readonly _sessions: Readonly<Record<string, BaileysSerializedSessionEntry>>
    readonly version: string
}

export interface BaileysSenderChainKey {
    readonly iteration: number
    readonly seed: MaybeBytes
}

export interface BaileysSenderSigningKey {
    readonly public: MaybeBytes
    readonly private?: MaybeBytes
}

export interface BaileysSenderMessageKey {
    readonly iteration: number
    readonly seed: MaybeBytes
}

export interface BaileysSenderKeyStateStructure {
    readonly senderKeyId: number
    readonly senderChainKey: BaileysSenderChainKey
    readonly senderSigningKey: BaileysSenderSigningKey
    readonly senderMessageKeys: readonly BaileysSenderMessageKey[]
}
