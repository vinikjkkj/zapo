/**
 * Fake-peer-side Signal Protocol session.
 *
 * This is the encrypter half: a fake peer (acting as "Alice") sends messages
 * to the real `WaClient` (acting as "Bob"). It implements just enough of
 * the WhatsApp Web Signal Protocol to:
 *
 *   1. Run X3DH against the client's prekey bundle (captured from the
 *      client's PreKey upload IQ).
 *   2. Maintain a sending chain key.
 *   3. Encrypt a plaintext into a `PreKeySignalMessage` (first message)
 *      or `SignalMessage` (subsequent messages).
 *
 * Sources:
 *   /deobfuscated/WASignal/WASignalWhitepaper.js          (X3DH inputs)
 *   /deobfuscated/WASignal/WASignalSessions.js            (session structure)
 *   /deobfuscated/WASignal/WASignalCipher.js              (encrypt path)
 *   /deobfuscated/pb/WASignalWhisperTextProtocol_pb.js    (protobuf shapes)
 *
 * Cross-checked against the lib's `initiateSessionOutgoing` /
 * `encryptMsg` (`src/signal/session/SignalSession.ts`,
 * `src/signal/session/SignalRatchet.ts`) — the byte-level recipe is the
 * same; the only difference is that this fake-peer implementation does
 * **not** persist sessions or implement the receive ratchet (the fake
 * server doesn't need to handle inbound messages from the real client to
 * make Phase 8 work).
 */

import {
    aesCbcEncrypt,
    type CryptoKey,
    hkdf,
    hkdfSplit,
    hmacSign,
    importAesCbcKey,
    importHmacKey,
    prependVersion,
    type SignalKeyPair,
    toRawPubKey,
    toSerializedPubKey,
    X25519
} from '../../transport/crypto'
import { proto } from '../../transport/protos'

import type { ClientPreKeyBundle } from './prekey-upload'

const SIGNAL_VERSION = 3
const SIGNAL_MAC_SIZE = 8
const SIGNAL_PREFIX_FF = new Uint8Array(32).fill(0xff)
const MESSAGE_KEY_LABEL = new Uint8Array([1])
const CHAIN_KEY_LABEL = new Uint8Array([2])

export interface FakePeerIdentity {
    /** Long-term identity keypair. */
    readonly identityKeyPair: SignalKeyPair
    /** Registration id used in PreKeySignalMessage. */
    readonly registrationId: number
}

export async function generateFakePeerIdentity(): Promise<FakePeerIdentity> {
    const identityKeyPair = await X25519.generateKeyPair()
    return {
        identityKeyPair,
        registrationId: Math.floor(Math.random() * 0x3fff) + 1
    }
}

interface SendChainState {
    /** Serialized 33-byte ratchet public key (current send chain). */
    readonly ratchetPubKey: Uint8Array
    /** Raw 32-byte ratchet private key. */
    readonly ratchetPrivKey: Uint8Array
    /** Current chain key (32 bytes). */
    readonly chainKey: Uint8Array
    /** Index of the next message in this chain. */
    readonly nextIndex: number
}

interface PendingPreKeyHeader {
    readonly preKeyId?: number
    readonly signedPreKeyId: number
    readonly baseKey: Uint8Array
}

export class FakePeerSession {
    private readonly identity: FakePeerIdentity
    /** 33-byte serialized peer (local) static identity public key. */
    private readonly localPub: Uint8Array
    /** 33-byte serialized client (remote) static identity public key. */
    private readonly remotePub: Uint8Array
    private sendChain: SendChainState
    private rootKey: Uint8Array
    private firstMessageHeader: PendingPreKeyHeader | null

    private constructor(
        identity: FakePeerIdentity,
        localPub: Uint8Array,
        remotePub: Uint8Array,
        rootKey: Uint8Array,
        sendChain: SendChainState,
        firstMessageHeader: PendingPreKeyHeader
    ) {
        this.identity = identity
        this.localPub = localPub
        this.remotePub = remotePub
        this.rootKey = rootKey
        this.sendChain = sendChain
        this.firstMessageHeader = firstMessageHeader
    }

    public get registrationId(): number {
        return this.identity.registrationId
    }

    /**
     * Initiates a new outgoing session against the client's prekey bundle.
     *
     * Mirrors the X3DH initiator path of `initiateSessionOutgoing` (lib)
     * and the deobfuscated `WASignalSessions.initiateSessionOutgoing`:
     *
     *   localOneTimeBase = generate ephemeral keypair (Alice's "base key")
     *
     *   DH1 = ECDH(local.identity.priv, remote.signedPreKey.pub)
     *   DH2 = ECDH(localOneTimeBase.priv, remote.identity.pub)
     *   DH3 = ECDH(localOneTimeBase.priv, remote.signedPreKey.pub)
     *   DH4 = ECDH(localOneTimeBase.priv, remote.oneTimePreKey.pub)  [optional]
     *
     *   secret = 0xFF*32 || DH1 || DH2 || DH3 || [DH4]
     *   [rootKey, chainKey] = HKDF_split(secret, salt=null, info="WhisperText")
     *
     *   Then a single send-ratchet kick:
     *     sendRatchetKeyPair = generateKeyPair()
     *     sharedSecret = ECDH(sendRatchetKeyPair.priv, remoteRatchetKey)
     *     [rootKey, chainKey] = HKDF_split(sharedSecret, salt=rootKey, info="WhisperRatchet")
     *
     *   Where remoteRatchetKey = remote.signedPreKey.pub (no separate
     *   ratchet key in the upload IQ — this matches the lib's behavior).
     */
    public static async initiate(
        identity: FakePeerIdentity,
        bundle: ClientPreKeyBundle,
        oneTimePreKey?: { readonly keyId: number; readonly publicKey: Uint8Array }
    ): Promise<FakePeerSession> {
        const localPub = toSerializedPubKey(identity.identityKeyPair.pubKey)
        const remoteIdentity = toSerializedPubKey(bundle.identityKey)
        const remoteSigned = toSerializedPubKey(bundle.signedPreKey.publicKey)

        const localBase = await X25519.generateKeyPair()
        const localBaseSerialized = toSerializedPubKey(localBase.pubKey)

        // Resolve which one-time prekey we're consuming. Callers normally pass
        // the one we want to consume; if omitted, take the first.
        const consumedOneTime = oneTimePreKey ?? bundle.preKeys[0]
        const remoteOneTime = consumedOneTime ? toSerializedPubKey(consumedOneTime.publicKey) : null

        // X3DH DHs.
        const [dh1, dh2, dh3, dh4] = await Promise.all([
            X25519.scalarMult(identity.identityKeyPair.privKey, toRawPubKey(remoteSigned)),
            X25519.scalarMult(localBase.privKey, toRawPubKey(remoteIdentity)),
            X25519.scalarMult(localBase.privKey, toRawPubKey(remoteSigned)),
            remoteOneTime
                ? X25519.scalarMult(localBase.privKey, toRawPubKey(remoteOneTime))
                : Promise.resolve<Uint8Array | null>(null)
        ])
        const sharedParts: Uint8Array[] = [SIGNAL_PREFIX_FF, dh1, dh2, dh3]
        if (dh4) sharedParts.push(dh4)
        const shared = concatBytes(sharedParts)

        const [rootKey, chainKey] = await hkdfSplit(shared, null, 'WhisperText')

        // Single send-ratchet kick: generate sendRatchet, mix DH(send.priv, remoteSigned).
        const sendRatchet = await X25519.generateKeyPair()
        const ratchetSecret = await X25519.scalarMult(
            sendRatchet.privKey,
            toRawPubKey(remoteSigned)
        )
        const [nextRootKey, sendChainKey] = await hkdfSplit(
            ratchetSecret,
            rootKey,
            'WhisperRatchet'
        )

        const sendChain: SendChainState = {
            ratchetPubKey: toSerializedPubKey(sendRatchet.pubKey),
            ratchetPrivKey: sendRatchet.privKey,
            chainKey: sendChainKey,
            nextIndex: 0
        }

        // Pin the chain key reference to silence "ts(6133): never read" — it
        // is read on every encrypt() invocation. (Defensive no-op.)
        void chainKey

        return new FakePeerSession(identity, localPub, remoteIdentity, nextRootKey, sendChain, {
            preKeyId: consumedOneTime?.keyId,
            signedPreKeyId: bundle.signedPreKey.keyId,
            baseKey: localBaseSerialized
        })
    }

    /**
     * Encrypts a plaintext message and returns either a `pkmsg` (first
     * message in the session — wraps the SignalMessage in a
     * PreKeySignalMessage envelope) or `msg` (subsequent messages).
     */
    public async encrypt(
        plaintext: Uint8Array
    ): Promise<{ readonly type: 'pkmsg' | 'msg'; readonly ciphertext: Uint8Array }> {
        const { nextChainKey, messageKey } = await deriveMessageKey(
            this.sendChain.nextIndex,
            this.sendChain.chainKey
        )
        const [cipherKey, macKey] = await Promise.all([
            importAesCbcKey(messageKey.cipherKey),
            importHmacKey(messageKey.macKey)
        ])
        const ciphertext = await aesCbcEncrypt(cipherKey, messageKey.iv, plaintext)

        const signalMessage = proto.SignalMessage.encode({
            ratchetKey: this.sendChain.ratchetPubKey,
            counter: messageKey.index,
            previousCounter: 0,
            ciphertext
        }).finish()
        const versioned = prependVersion(signalMessage, SIGNAL_VERSION)

        const macInput = concatBytes([this.localPub, this.remotePub, versioned])
        const fullMac = await hmacSign(macKey, macInput)
        const truncatedMac = fullMac.subarray(0, SIGNAL_MAC_SIZE)
        const inner = concatBytes([versioned, truncatedMac])

        // Advance chain (single-direction; no ratchet rotation in fake peer).
        this.sendChain = {
            ...this.sendChain,
            chainKey: nextChainKey,
            nextIndex: messageKey.index + 1
        }
        // rootKey is unused after the initial kick because we never rotate
        // ratchets on the peer side. Keep the field for completeness.
        void this.rootKey

        if (this.firstMessageHeader) {
            const header = this.firstMessageHeader
            this.firstMessageHeader = null
            const preKeyMessage = proto.PreKeySignalMessage.encode({
                registrationId: this.identity.registrationId,
                preKeyId: header.preKeyId,
                signedPreKeyId: header.signedPreKeyId,
                baseKey: header.baseKey,
                identityKey: this.localPub,
                message: inner
            }).finish()
            return {
                type: 'pkmsg',
                ciphertext: prependVersion(preKeyMessage, SIGNAL_VERSION)
            }
        }
        return { type: 'msg', ciphertext: inner }
    }
}

interface DerivedMessageKey {
    readonly index: number
    readonly cipherKey: Uint8Array
    readonly macKey: Uint8Array
    readonly iv: Uint8Array
}

async function deriveMessageKey(
    index: number,
    chainKey: Uint8Array
): Promise<{ readonly nextChainKey: Uint8Array; readonly messageKey: DerivedMessageKey }> {
    const hmacKey = await importHmacKey(chainKey)
    const [messageInputKey, nextChainRaw] = await Promise.all([
        hmacSign(hmacKey, MESSAGE_KEY_LABEL),
        hmacSign(hmacKey, CHAIN_KEY_LABEL)
    ])
    const expanded = await hkdf(messageInputKey, null, 'WhisperMessageKeys', 80)
    const messageKey: DerivedMessageKey = {
        index,
        cipherKey: expanded.subarray(0, 32),
        macKey: expanded.subarray(32, 64),
        iv: expanded.subarray(64, 80)
    }
    return {
        nextChainKey: nextChainRaw.subarray(0, 32),
        messageKey
    }
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
    let total = 0
    for (const part of parts) total += part.byteLength
    const out = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
        out.set(part, offset)
        offset += part.byteLength
    }
    return out
}

// Re-export types that are part of the public API of this module.
export type { CryptoKey }
