/**
 * Fake-peer-side Signal Protocol RECEIVE session.
 *
 * Decrypts inbound `PreKeySignalMessage` (`pkmsg`) and `SignalMessage`
 * (`msg`) ciphertexts the real `WaClient` sends to the peer. Pairs with
 * `FakePeerSession` (the encrypter half) so a fake peer can carry both
 * sides of a 1:1 signal conversation.
 *
 * Sources:
 *   /deobfuscated/WASignal/WASignalWhitepaper.js
 *     (initiateSessionIncoming, deriveMsgKey)
 *   /deobfuscated/WASignal/WASignalCipher.js
 *   /deobfuscated/pb/WASignalWhisperTextProtocol_pb.js
 *
 * Cross-checked against the lib's `initiateSessionIncoming` /
 * `decryptMsg` (`src/signal/session/SignalSession.ts`,
 * `src/signal/session/SignalRatchet.ts`).
 *
 * Scope: a single chain of pkmsg + subsequent msgs from the client. We
 * do NOT implement the full Double Ratchet rotation across multiple
 * client→server message bursts (no recv-chain-replace on new ratchet
 * keys). The first message uses the "Bob role" X3DH and after that we
 * keep deriving from the same chain key. This is enough for tests that
 * send 1-N messages in the same chain, which covers the common
 * outbound-test scenario.
 */

import {
    aesCbcDecrypt,
    type CryptoKey,
    hkdf,
    hkdfSplit,
    hmacSign,
    importAesCbcKey,
    importHmacKey,
    toRawPubKey,
    toSerializedPubKey,
    X25519
} from '../../transport/crypto'
import { proto } from '../../transport/protos'

import type { FakePeerKeyBundle } from './fake-peer-key-bundle'

const SIGNAL_VERSION = 3
const SIGNAL_MAC_SIZE = 8
const SIGNAL_PREFIX_FF = new Uint8Array(32).fill(0xff)
const MESSAGE_KEY_LABEL = new Uint8Array([1])
const CHAIN_KEY_LABEL = new Uint8Array([2])

export class FakePeerRecvSessionError extends Error {
    public constructor(message: string) {
        super(message)
        this.name = 'FakePeerRecvSessionError'
    }
}

interface RecvChain {
    /** 33-byte serialized ratchet pubkey from the SignalMessage. */
    readonly ratchetPubKey: Uint8Array
    chainKey: Uint8Array
    nextIndex: number
}

/**
 * Per-(remote-identity) recv state on the fake peer side.
 *
 * The session is bootstrapped lazily on the first inbound `pkmsg` for
 * a given remote identity, and reused for subsequent `msg` ciphertexts
 * in the same Double Ratchet chain.
 */
export class FakePeerRecvSession {
    private readonly keyBundle: FakePeerKeyBundle
    /** 33-byte serialized remote identity pubkey (set on first pkmsg). */
    private remoteIdentityPub: Uint8Array | null = null
    private recvChain: RecvChain | null = null
    /** Root key from the X3DH derivation, used for the first DR step. */
    private bootstrapRootKey: Uint8Array | null = null

    public constructor(keyBundle: FakePeerKeyBundle) {
        this.keyBundle = keyBundle
    }

    /**
     * Decrypts a `<enc type="pkmsg"/>` payload. Bootstraps the recv
     * session via the X3DH responder ("Bob") flow on the first call,
     * then derives the message key and returns the (still padded)
     * plaintext bytes.
     */
    public async decryptPreKeyMessage(envelope: Uint8Array): Promise<Uint8Array> {
        const body = readVersionedBody(envelope, 0)
        const preKeyMessage = proto.PreKeySignalMessage.decode(body)
        const baseKey = requireBytes(preKeyMessage.baseKey, 'baseKey')
        const remoteIdentity = requireBytes(preKeyMessage.identityKey, 'identityKey')
        const innerMessage = requireBytes(preKeyMessage.message, 'message')
        const signedPreKeyId = preKeyMessage.signedPreKeyId
        if (signedPreKeyId === null || signedPreKeyId === undefined) {
            throw new FakePeerRecvSessionError('PreKeySignalMessage missing signedPreKeyId')
        }
        if (signedPreKeyId !== this.keyBundle.signedPreKey.id) {
            throw new FakePeerRecvSessionError(
                `signedPreKeyId mismatch: got ${signedPreKeyId}, expected ${this.keyBundle.signedPreKey.id}`
            )
        }

        const oneTimePreKeyId = preKeyMessage.preKeyId
        let oneTimePrivKey: Uint8Array | null = null
        if (oneTimePreKeyId !== null && oneTimePreKeyId !== undefined) {
            const oneTimeKeyEntry = this.keyBundle.oneTimePreKeys.find(
                (entry) => entry.id === oneTimePreKeyId
            )
            if (!oneTimeKeyEntry) {
                throw new FakePeerRecvSessionError(
                    `unknown one-time preKeyId ${oneTimePreKeyId}`
                )
            }
            oneTimePrivKey = oneTimeKeyEntry.keyPair.privKey
        }

        // Bob-role X3DH:
        //   DH1 = ECDH(signedPreKey.priv, remote.identityPub)
        //   DH2 = ECDH(identity.priv, baseKey)
        //   DH3 = ECDH(signedPreKey.priv, baseKey)
        //   DH4 = ECDH(oneTimePreKey.priv, baseKey)  [optional]
        const remoteIdentityRaw = toRawPubKey(remoteIdentity)
        const baseKeyRaw = toRawPubKey(baseKey)
        const signedPriv = this.keyBundle.signedPreKey.keyPair.privKey
        const identityPriv = this.keyBundle.identityKeyPair.privKey

        const [dh1, dh2, dh3, dh4] = await Promise.all([
            X25519.scalarMult(signedPriv, remoteIdentityRaw),
            X25519.scalarMult(identityPriv, baseKeyRaw),
            X25519.scalarMult(signedPriv, baseKeyRaw),
            oneTimePrivKey
                ? X25519.scalarMult(oneTimePrivKey, baseKeyRaw)
                : Promise.resolve<Uint8Array | null>(null)
        ])
        const sharedParts: Uint8Array[] = [SIGNAL_PREFIX_FF, dh1, dh2, dh3]
        if (dh4) sharedParts.push(dh4)
        const shared = concatBytes(sharedParts)

        const [rootKey] = await hkdfSplit(shared, null, 'WhisperText')
        // The first inbound message kicks the Double Ratchet once: the
        // inner SignalMessage carries Alice's fresh sendRatchet pubkey,
        // which we mix with our signedPreKey privkey via calculateRatchet
        // to derive the recv chain key. (See SignalSession.calculateRatchet
        // and decryptMsgFromSession in the lib.)
        this.remoteIdentityPub = toSerializedPubKey(remoteIdentity)
        this.bootstrapRootKey = rootKey

        return this.decryptInnerSignalMessage(innerMessage, true)
    }

    /**
     * Decrypts a `<enc type="msg"/>` payload. Requires the recv chain
     * to have been established by a prior `decryptPreKeyMessage` call.
     */
    public async decryptMessage(envelope: Uint8Array): Promise<Uint8Array> {
        if (!this.recvChain) {
            throw new FakePeerRecvSessionError(
                'recv session is not initialized — call decryptPreKeyMessage first'
            )
        }
        return this.decryptInnerSignalMessage(envelope, false)
    }

    private async decryptInnerSignalMessage(
        signalMessageBytes: Uint8Array,
        isBootstrap: boolean
    ): Promise<Uint8Array> {
        if (signalMessageBytes.byteLength < 1 + SIGNAL_MAC_SIZE) {
            throw new FakePeerRecvSessionError('signal message too short')
        }
        const versionByte = signalMessageBytes[0]
        if (versionByte >>> 4 !== SIGNAL_VERSION) {
            throw new FakePeerRecvSessionError(
                `unsupported signal version ${versionByte >>> 4}`
            )
        }
        const macStart = signalMessageBytes.byteLength - SIGNAL_MAC_SIZE
        const versionedBody = signalMessageBytes.subarray(0, macStart)
        const macBytes = signalMessageBytes.subarray(macStart)
        const protoBody = versionedBody.subarray(1)

        const signalMessage = proto.SignalMessage.decode(protoBody)
        const ratchetKey = requireBytes(signalMessage.ratchetKey, 'ratchetKey')
        const counter = signalMessage.counter
        if (counter === null || counter === undefined) {
            throw new FakePeerRecvSessionError('SignalMessage missing counter')
        }
        const ciphertext = requireBytes(signalMessage.ciphertext, 'ciphertext')

        // Bootstrap or reuse the recv chain.
        if (isBootstrap) {
            if (!this.bootstrapRootKey) {
                throw new FakePeerRecvSessionError('bootstrap rootKey missing')
            }
            // Mirror the lib's `calculateRatchet`:
            //   sharedSecret = ECDH(signedPreKey.priv, alice.ratchetPub)
            //   [_, chainKey] = HKDF(sharedSecret, rootKey, "WhisperRatchet")
            const ratchetRaw = toRawPubKey(ratchetKey)
            const ratchetShared = await X25519.scalarMult(
                this.keyBundle.signedPreKey.keyPair.privKey,
                ratchetRaw
            )
            const [, chainKey] = await hkdfSplit(
                ratchetShared,
                this.bootstrapRootKey,
                'WhisperRatchet'
            )
            this.recvChain = {
                ratchetPubKey: toSerializedPubKey(ratchetKey),
                chainKey,
                nextIndex: 0
            }
            this.bootstrapRootKey = null
        } else if (!this.recvChain) {
            throw new FakePeerRecvSessionError('recv chain not bootstrapped')
        } else if (
            !uint8Equal(this.recvChain.ratchetPubKey, toSerializedPubKey(ratchetKey))
        ) {
            throw new FakePeerRecvSessionError(
                'recv chain ratchet rotation is not implemented in the fake peer'
            )
        }

        // Walk the chain forward to the requested counter (no out-of-order).
        if (counter < this.recvChain.nextIndex) {
            throw new FakePeerRecvSessionError(
                `out-of-order recv counter ${counter} < ${this.recvChain.nextIndex}`
            )
        }
        let chainKey = this.recvChain.chainKey
        let messageKey: { cipherKey: Uint8Array; macKey: Uint8Array; iv: Uint8Array } | null =
            null
        let nextIndex = this.recvChain.nextIndex
        while (nextIndex <= counter) {
            const derived = await deriveMessageKey(chainKey)
            chainKey = derived.nextChainKey
            if (nextIndex === counter) {
                messageKey = derived.messageKey
            }
            nextIndex += 1
        }
        if (!messageKey) {
            throw new FakePeerRecvSessionError('failed to derive message key')
        }
        this.recvChain = {
            ratchetPubKey: this.recvChain.ratchetPubKey,
            chainKey,
            nextIndex
        }

        // Verify MAC.
        if (!this.remoteIdentityPub) {
            throw new FakePeerRecvSessionError('remoteIdentityPub not set')
        }
        const localPub = toSerializedPubKey(this.keyBundle.identityKeyPair.pubKey)
        const macInput = concatBytes([this.remoteIdentityPub, localPub, versionedBody])
        const macKeyHandle = await importHmacKey(messageKey.macKey)
        const expectedFullMac = await hmacSign(macKeyHandle, macInput)
        const expectedMac = expectedFullMac.subarray(0, SIGNAL_MAC_SIZE)
        if (!uint8Equal(expectedMac, macBytes)) {
            throw new FakePeerRecvSessionError('signal message MAC mismatch')
        }

        // Decrypt the AES-CBC ciphertext.
        const cipherKeyHandle = await importAesCbcKey(messageKey.cipherKey)
        const padded = await aesCbcDecrypt(cipherKeyHandle, messageKey.iv, ciphertext)
        return unpadPkcs7(padded)
    }
}

interface DerivedMessageKey {
    readonly cipherKey: Uint8Array
    readonly macKey: Uint8Array
    readonly iv: Uint8Array
}

async function deriveMessageKey(
    chainKey: Uint8Array
): Promise<{
    readonly nextChainKey: Uint8Array
    readonly messageKey: DerivedMessageKey
}> {
    const hmacKey = await importHmacKey(chainKey)
    const [messageInputKey, nextChainRaw] = await Promise.all([
        hmacSign(hmacKey, MESSAGE_KEY_LABEL),
        hmacSign(hmacKey, CHAIN_KEY_LABEL)
    ])
    const expanded = await hkdf(messageInputKey, null, 'WhisperMessageKeys', 80)
    return {
        nextChainKey: nextChainRaw.subarray(0, 32),
        messageKey: {
            cipherKey: expanded.subarray(0, 32),
            macKey: expanded.subarray(32, 64),
            iv: expanded.subarray(64, 80)
        }
    }
}

function readVersionedBody(envelope: Uint8Array, suffixLength: number): Uint8Array {
    if (envelope.byteLength < 1) {
        throw new FakePeerRecvSessionError('signal envelope is empty')
    }
    const version = envelope[0] >>> 4
    if (version !== SIGNAL_VERSION) {
        throw new FakePeerRecvSessionError(`unsupported signal version ${version}`)
    }
    const bodyEnd = envelope.byteLength - suffixLength
    if (bodyEnd <= 1) {
        throw new FakePeerRecvSessionError('invalid signal envelope length')
    }
    return envelope.subarray(1, bodyEnd)
}

function unpadPkcs7(padded: Uint8Array): Uint8Array {
    if (padded.byteLength === 0) return padded
    const padLen = padded[padded.byteLength - 1]
    if (padLen === 0 || padLen > 16) return padded
    if (padLen > padded.byteLength) return padded
    return padded.subarray(0, padded.byteLength - padLen)
}

function uint8Equal(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) return false
    for (let i = 0; i < a.byteLength; i += 1) {
        if (a[i] !== b[i]) return false
    }
    return true
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
    let total = 0
    for (const p of parts) total += p.byteLength
    const out = new Uint8Array(total)
    let offset = 0
    for (const p of parts) {
        out.set(p, offset)
        offset += p.byteLength
    }
    return out
}

function requireBytes(
    value: Uint8Array | null | undefined,
    label: string
): Uint8Array {
    if (!value) throw new FakePeerRecvSessionError(`${label} missing`)
    return value
}

// CryptoKey is referenced via the `CryptoKey` type-only import above.
// The `void` is just to satisfy ts(6133) in case the file is compiled
// without consumers.
void (null as unknown as CryptoKey | null)
