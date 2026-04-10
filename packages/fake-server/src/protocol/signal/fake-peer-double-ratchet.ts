/**
 * Full bidirectional Signal Double Ratchet for the fake peer.
 *
 * Sources:
 *   /deobfuscated/WASignal/WASignalWhitepaper.js
 *   /deobfuscated/WASignal/WASignalCipher.js
 *   /deobfuscated/WASignal/WASignalSessions.js
 *   /deobfuscated/pb/WASignalWhisperTextProtocol_pb.js
 *
 * Cross-checked against the lib's `initiateSessionOutgoing`,
 * `initiateSessionIncoming`, `calculateRatchet`, `encryptMsg` and
 * `decryptMsgFromSession` (`src/signal/session/SignalSession.ts` and
 * `src/signal/session/SignalRatchet.ts`).
 *
 * This class consolidates the previously-split `FakePeerSession`
 * (sender) and `FakePeerRecvSession` (receiver) into one piece of
 * state that supports the full DR protocol:
 *
 *   - Either side can initiate (Alice via X3DH initiator, or wait for
 *     a pkmsg as Bob via X3DH responder).
 *   - On the FIRST encrypt the local side runs an outbound DH ratchet
 *     step against the remote signedPreKey to derive the initial send
 *     chain key.
 *   - On every inbound message with a NEW remote ratchet pub, the
 *     local side runs a recv DH ratchet step (and bumps the next
 *     outbound chain via a fresh local ratchet, exactly like the
 *     lib's `decryptMsgFromSession`).
 *   - Inbound messages with the current remote ratchet pub walk the
 *     recv chain forward.
 *   - Outbound messages walk the send chain forward.
 *
 * This is enough to support send→recv, recv→send, and arbitrarily
 * deep ping-pong sequences with one peer, all driven by the lib's
 * real Signal layer on the other side.
 */

import {
    aesCbcDecrypt,
    aesCbcEncrypt,
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

import type { FakePeerKeyBundle } from './fake-peer-key-bundle'
import type { ClientPreKeyBundle } from './prekey-upload'

const SIGNAL_VERSION = 3
const SIGNAL_MAC_SIZE = 8
const SIGNAL_PREFIX_FF = new Uint8Array(32).fill(0xff)
const MESSAGE_KEY_LABEL = new Uint8Array([1])
const CHAIN_KEY_LABEL = new Uint8Array([2])

export class FakePeerDoubleRatchetError extends Error {
    public constructor(message: string) {
        super(message)
        this.name = 'FakePeerDoubleRatchetError'
    }
}

interface SendChain {
    ratchetKeyPair: SignalKeyPair
    /** 33-byte serialized version of `ratchetKeyPair.pubKey`. */
    ratchetPubSerialized: Uint8Array
    chainKey: Uint8Array
    nextIndex: number
}

interface UnusedMessageKey {
    readonly index: number
    readonly cipherKey: Uint8Array
    readonly macKey: Uint8Array
    readonly iv: Uint8Array
}

interface RecvChain {
    /** 33-byte serialized remote ratchet pub. */
    ratchetPubKey: Uint8Array
    chainKey: Uint8Array
    nextIndex: number
    /**
     * Cache of message keys we derived past the current chain head but
     * haven't consumed yet — happens when an inbound message arrives
     * out of order (e.g. counter=3 lands before counter=2). Mirrors
     * the lib's `SignalRecvChain.unusedMsgKeys` slot.
     */
    unusedKeys: UnusedMessageKey[]
}

const MAX_FUTURE_RECV_KEYS = 2_000

interface PendingPreKeyHeader {
    readonly preKeyId?: number
    readonly signedPreKeyId: number
    readonly baseKey: Uint8Array
}

export class FakePeerDoubleRatchet {
    private readonly keyBundle: FakePeerKeyBundle
    /** 33-byte serialized peer (local) static identity public key. */
    private readonly localIdentityPubSerialized: Uint8Array
    /** 33-byte serialized client (remote) static identity public key. */
    private remoteIdentityPubSerialized: Uint8Array | null = null
    private rootKey: Uint8Array | null = null
    private sendChain: SendChain | null = null
    private recvChain: RecvChain | null = null
    /** Header to prepend to the FIRST outgoing message (Alice mode only). */
    private pendingPreKeyHeader: PendingPreKeyHeader | null = null
    /**
     * Cached chain key from the X3DH-only step. We keep it around so the
     * first inbound recv ratchet step can use it as the salt for the
     * "WhisperRatchet" HKDF (mirroring the lib's behaviour where the
     * `chainKey` returned by `initiateSessionIncoming` is the precursor
     * for the first DR step).
     */
    private bootstrapChainKey: Uint8Array | null = null
    /** True after the FIRST outbound DR step has installed sendChain. */
    private hasOutboundSendChain = false

    public constructor(keyBundle: FakePeerKeyBundle) {
        this.keyBundle = keyBundle
        this.localIdentityPubSerialized = toSerializedPubKey(
            keyBundle.identityKeyPair.pubKey
        )
    }

    public get registrationId(): number {
        return this.keyBundle.registrationId
    }

    /**
     * `true` once the session has a usable send chain — either via
     * `initiateOutbound` (Alice path) or via a recv DR step that
     * rotated a fresh local ratchet (Bob path after the first
     * inbound pkmsg).
     */
    public hasSendChain(): boolean {
        return this.sendChain !== null && this.hasOutboundSendChain
    }

    /**
     * Initiates a new outgoing session against the lib's prekey bundle
     * (Alice role X3DH + first outbound DH ratchet step). Subsequent
     * `encrypt()` calls walk the send chain forward; the FIRST one
     * produces a `pkmsg` envelope, all later ones produce plain `msg`.
     */
    public async initiateOutbound(
        bundle: ClientPreKeyBundle,
        options: {
            readonly oneTimePreKey?: { readonly keyId: number; readonly publicKey: Uint8Array }
            /**
             * When true, the X3DH initiator skips the one-time prekey
             * mix entirely (the lib accepts pkmsg with `preKeyId`
             * absent and builds the responder session without DH4).
             * This unblocks bench scenarios that bring up many
             * concurrent peers — the lib's prekey upload only contains
             * a fixed number of one-time prekeys, so reusing index 0
             * across N peers would cause the lib to reject every
             * pkmsg after the first as "prekey N not found".
             */
            readonly skipOneTimePreKey?: boolean
        } = {}
    ): Promise<void> {
        if (this.rootKey || this.sendChain || this.recvChain) {
            throw new FakePeerDoubleRatchetError('session already initialized')
        }
        const remoteIdentity = toSerializedPubKey(bundle.identityKey)
        const remoteSigned = toSerializedPubKey(bundle.signedPreKey.publicKey)
        const localBase = await X25519.generateKeyPair()
        const localBaseSerialized = toSerializedPubKey(localBase.pubKey)

        // NOTE: deliberately do NOT fall back to `bundle.preKeys[0]`.
        // Every FakePeer would otherwise consume the same prekey index,
        // causing the lib to reject every pkmsg after the first as
        // "prekey N not found". Callers must either pass an explicit
        // `oneTimePreKey` (e.g. dispensed by `FakeWaServer`'s prekey
        // dispenser) or set `skipOneTimePreKey: true` to opt out of
        // DH4 entirely.
        const consumedOneTime = options.skipOneTimePreKey
            ? undefined
            : options.oneTimePreKey
        const remoteOneTime = consumedOneTime
            ? toSerializedPubKey(consumedOneTime.publicKey)
            : null

        const [dh1, dh2, dh3, dh4] = await Promise.all([
            X25519.scalarMult(
                this.keyBundle.identityKeyPair.privKey,
                toRawPubKey(remoteSigned)
            ),
            X25519.scalarMult(localBase.privKey, toRawPubKey(remoteIdentity)),
            X25519.scalarMult(localBase.privKey, toRawPubKey(remoteSigned)),
            remoteOneTime
                ? X25519.scalarMult(localBase.privKey, toRawPubKey(remoteOneTime))
                : Promise.resolve<Uint8Array | null>(null)
        ])
        const sharedParts: Uint8Array[] = [SIGNAL_PREFIX_FF, dh1, dh2, dh3]
        if (dh4) sharedParts.push(dh4)
        const shared = concatBytes(sharedParts)
        const [rootKey, _chainKey] = await hkdfSplit(shared, null, 'WhisperText')
        void _chainKey

        // First outbound DR step: Alice mints a fresh sendRatchet and
        // mixes ECDH(sendRatchet.priv, remote.signedPreKey.pub) with
        // the X3DH root key.
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

        this.rootKey = nextRootKey
        this.remoteIdentityPubSerialized = remoteIdentity
        this.sendChain = {
            ratchetKeyPair: sendRatchet,
            ratchetPubSerialized: toSerializedPubKey(sendRatchet.pubKey),
            chainKey: sendChainKey,
            nextIndex: 0
        }
        this.hasOutboundSendChain = true
        this.pendingPreKeyHeader = {
            preKeyId: consumedOneTime?.keyId,
            signedPreKeyId: bundle.signedPreKey.keyId,
            baseKey: localBaseSerialized
        }
    }

    /**
     * Encrypts a plaintext message and returns either a `pkmsg`
     * envelope (first message in the session) or a plain `msg`
     * envelope (subsequent messages, or after a recv-side DR rotation
     * forced an outbound rotation).
     */
    public async encrypt(
        plaintext: Uint8Array
    ): Promise<{ readonly type: 'pkmsg' | 'msg'; readonly ciphertext: Uint8Array }> {
        if (!this.sendChain) {
            throw new FakePeerDoubleRatchetError(
                'cannot encrypt: session has no send chain (call initiateOutbound first)'
            )
        }
        if (!this.remoteIdentityPubSerialized) {
            throw new FakePeerDoubleRatchetError('remote identity not set')
        }

        const { nextChainKey, messageKey } = await deriveMessageKey(
            this.sendChain.nextIndex,
            this.sendChain.chainKey
        )
        const [cipherKey, macKey] = await Promise.all([
            importAesCbcKey(messageKey.cipherKey),
            importHmacKey(messageKey.macKey)
        ])
        const ciphertext = await aesCbcEncrypt(cipherKey, messageKey.iv, plaintext)
        const signalPayload = proto.SignalMessage.encode({
            ratchetKey: this.sendChain.ratchetPubSerialized,
            counter: messageKey.index,
            previousCounter: 0,
            ciphertext
        }).finish()
        const versioned = prependVersion(signalPayload, SIGNAL_VERSION)
        const macInput = concatBytes([
            this.localIdentityPubSerialized,
            this.remoteIdentityPubSerialized,
            versioned
        ])
        const fullMac = await hmacSign(macKey, macInput)
        const mac = fullMac.subarray(0, SIGNAL_MAC_SIZE)
        const inner = concatBytes([versioned, mac])

        this.sendChain = {
            ...this.sendChain,
            chainKey: nextChainKey,
            nextIndex: messageKey.index + 1
        }

        if (this.pendingPreKeyHeader) {
            const header = this.pendingPreKeyHeader
            this.pendingPreKeyHeader = null
            const preKeyMessage = proto.PreKeySignalMessage.encode({
                registrationId: this.keyBundle.registrationId,
                preKeyId: header.preKeyId,
                signedPreKeyId: header.signedPreKeyId,
                baseKey: header.baseKey,
                identityKey: this.localIdentityPubSerialized,
                message: inner
            }).finish()
            return {
                type: 'pkmsg',
                ciphertext: prependVersion(preKeyMessage, SIGNAL_VERSION)
            }
        }
        return { type: 'msg', ciphertext: inner }
    }

    /**
     * Decrypts a `<enc type="pkmsg"/>` envelope (Bob role X3DH +
     * first recv DH ratchet step). The session must NOT already have
     * been initiated as Alice — pkmsg is the bootstrap shape for the
     * receiver side.
     */
    public async decryptPreKeyMessage(envelope: Uint8Array): Promise<Uint8Array> {
        const body = readVersionedBody(envelope)
        const preKeyMessage = proto.PreKeySignalMessage.decode(body)
        const baseKey = requireBytes(preKeyMessage.baseKey, 'baseKey')
        const remoteIdentity = requireBytes(preKeyMessage.identityKey, 'identityKey')
        const innerMessage = requireBytes(preKeyMessage.message, 'message')
        const signedPreKeyId = preKeyMessage.signedPreKeyId
        if (signedPreKeyId === null || signedPreKeyId === undefined) {
            throw new FakePeerDoubleRatchetError('PreKeySignalMessage missing signedPreKeyId')
        }
        if (signedPreKeyId !== this.keyBundle.signedPreKey.id) {
            throw new FakePeerDoubleRatchetError(
                `signedPreKeyId mismatch: got ${signedPreKeyId}, expected ${this.keyBundle.signedPreKey.id}`
            )
        }
        const oneTimePreKeyId = preKeyMessage.preKeyId
        let oneTimePrivKey: Uint8Array | null = null
        if (oneTimePreKeyId !== null && oneTimePreKeyId !== undefined) {
            const entry = this.keyBundle.oneTimePreKeys.find((k) => k.id === oneTimePreKeyId)
            if (!entry) {
                throw new FakePeerDoubleRatchetError(
                    `unknown one-time preKeyId ${oneTimePreKeyId}`
                )
            }
            oneTimePrivKey = entry.keyPair.privKey
        }

        // Bob-role X3DH.
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

        const [rootKey, chainKey] = await hkdfSplit(shared, null, 'WhisperText')
        this.remoteIdentityPubSerialized = toSerializedPubKey(remoteIdentity)
        this.rootKey = rootKey
        this.bootstrapChainKey = chainKey
        // In Bob mode our "current local ratchet" for the first DR step
        // is the signedPreKey itself. We materialise it as a SignalKeyPair
        // so the recv-DR step below treats it like any send chain.
        // The send chain is left null until we actively encrypt.
        return this.decryptInnerSignalMessage(innerMessage, /* isBootstrap */ true)
    }

    /**
     * Decrypts a `<enc type="msg"/>` envelope. Walks the recv chain
     * forward, or runs a recv DH ratchet step if the inbound ratchet
     * pub is fresh.
     */
    public async decryptMessage(envelope: Uint8Array): Promise<Uint8Array> {
        return this.decryptInnerSignalMessage(envelope, /* isBootstrap */ false)
    }

    private async decryptInnerSignalMessage(
        signalMessageBytes: Uint8Array,
        isBootstrap: boolean
    ): Promise<Uint8Array> {
        if (signalMessageBytes.byteLength < 1 + SIGNAL_MAC_SIZE) {
            throw new FakePeerDoubleRatchetError('signal message too short')
        }
        const versionByte = signalMessageBytes[0]
        if (versionByte >>> 4 !== SIGNAL_VERSION) {
            throw new FakePeerDoubleRatchetError(
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
            throw new FakePeerDoubleRatchetError('SignalMessage missing counter')
        }
        const ciphertext = requireBytes(signalMessage.ciphertext, 'ciphertext')
        const ratchetSerialized = toSerializedPubKey(ratchetKey)

        // Resolve the recv chain: bootstrap path, walk-forward, or DR rotation.
        if (isBootstrap) {
            // Bob-role bootstrap: derive recv chain via DH(signedPreKey.priv, remote.ratchet).
            if (!this.rootKey || !this.bootstrapChainKey) {
                throw new FakePeerDoubleRatchetError('bootstrap state missing')
            }
            const ratchetShared = await X25519.scalarMult(
                this.keyBundle.signedPreKey.keyPair.privKey,
                toRawPubKey(ratchetKey)
            )
            const [nextRootKey, recvChainKey] = await hkdfSplit(
                ratchetShared,
                this.rootKey,
                'WhisperRatchet'
            )
            this.rootKey = nextRootKey
            this.bootstrapChainKey = null
            this.recvChain = {
                ratchetPubKey: ratchetSerialized,
                chainKey: recvChainKey,
                nextIndex: 0,
                unusedKeys: []
            }
            // After the first recv DR step on the Bob side, the lib (Alice)
            // is sitting on its own send chain. When the fake peer wants to
            // REPLY, it needs a fresh local ratchet. We mint one + run an
            // outbound DR step against the inbound ratchet so the next
            // encrypt() can use a brand-new send chain. This mirrors the
            // lib's `decryptMsgFromSession` which also rotates the send
            // ratchet on every fresh recv ratchet kick.
            await this.rotateSendRatchet(ratchetKey)
        } else if (this.recvChain && uint8Equal(this.recvChain.ratchetPubKey, ratchetSerialized)) {
            // Walk forward — same remote ratchet.
        } else {
            // Fresh remote ratchet → recv DR step.
            await this.runRecvRatchetStep(ratchetKey)
        }

        if (!this.recvChain) {
            throw new FakePeerDoubleRatchetError('recv chain not initialized')
        }
        // Three cases for message-key selection (mirrors the lib's
        // `selectMessageKey` in `SignalRatchet.ts`):
        //
        //   1. counter < recvChain.nextIndex → look for a previously
        //      stashed unused key for that counter (out-of-order
        //      arrival of an earlier message). If we don't have it,
        //      it's a stale duplicate and we error.
        //   2. counter === recvChain.nextIndex → derive the next key
        //      and walk the chain head forward.
        //   3. counter > recvChain.nextIndex → walk the chain forward,
        //      stashing every intermediate key into `unusedKeys` so
        //      they can be consumed by case (1) when the missing
        //      messages eventually arrive.
        let messageKey: { cipherKey: Uint8Array; macKey: Uint8Array; iv: Uint8Array } | null =
            null
        if (counter < this.recvChain.nextIndex) {
            const stashedIndex = this.recvChain.unusedKeys.findIndex(
                (entry) => entry.index === counter
            )
            if (stashedIndex === -1) {
                throw new FakePeerDoubleRatchetError(
                    `recv counter ${counter} is stale (next=${this.recvChain.nextIndex})`
                )
            }
            const stashed = this.recvChain.unusedKeys[stashedIndex]
            messageKey = {
                cipherKey: stashed.cipherKey,
                macKey: stashed.macKey,
                iv: stashed.iv
            }
            this.recvChain = {
                ratchetPubKey: this.recvChain.ratchetPubKey,
                chainKey: this.recvChain.chainKey,
                nextIndex: this.recvChain.nextIndex,
                unusedKeys: this.recvChain.unusedKeys.filter((_, i) => i !== stashedIndex)
            }
        } else {
            const skipDistance = counter - this.recvChain.nextIndex
            if (skipDistance > MAX_FUTURE_RECV_KEYS) {
                throw new FakePeerDoubleRatchetError(
                    `recv counter ${counter} is too far in the future (skip=${skipDistance})`
                )
            }
            let chainKey = this.recvChain.chainKey
            const newlyStashed: UnusedMessageKey[] = []
            let walkIndex = this.recvChain.nextIndex
            while (walkIndex <= counter) {
                const derived = await deriveMessageKeyFromChain(chainKey)
                chainKey = derived.nextChainKey
                if (walkIndex === counter) {
                    messageKey = derived.messageKey
                } else {
                    newlyStashed.push({
                        index: walkIndex,
                        cipherKey: derived.messageKey.cipherKey,
                        macKey: derived.messageKey.macKey,
                        iv: derived.messageKey.iv
                    })
                }
                walkIndex += 1
            }
            const allUnused = [...this.recvChain.unusedKeys, ...newlyStashed]
            // Cap the cache size to keep memory bounded under
            // pathological skip patterns.
            const trimmed =
                allUnused.length > MAX_FUTURE_RECV_KEYS
                    ? allUnused.slice(allUnused.length - MAX_FUTURE_RECV_KEYS)
                    : allUnused
            this.recvChain = {
                ratchetPubKey: this.recvChain.ratchetPubKey,
                chainKey,
                nextIndex: walkIndex,
                unusedKeys: trimmed
            }
        }
        if (!messageKey) {
            throw new FakePeerDoubleRatchetError('failed to derive recv message key')
        }

        // MAC verify.
        if (!this.remoteIdentityPubSerialized) {
            throw new FakePeerDoubleRatchetError('remoteIdentityPub not set')
        }
        const macInput = concatBytes([
            this.remoteIdentityPubSerialized,
            this.localIdentityPubSerialized,
            versionedBody
        ])
        const macKeyHandle = await importHmacKey(messageKey.macKey)
        const expectedFullMac = await hmacSign(macKeyHandle, macInput)
        const expectedMac = expectedFullMac.subarray(0, SIGNAL_MAC_SIZE)
        if (!uint8Equal(expectedMac, macBytes)) {
            throw new FakePeerDoubleRatchetError('signal message MAC mismatch')
        }

        const cipherKeyHandle = await importAesCbcKey(messageKey.cipherKey)
        const padded = await aesCbcDecrypt(cipherKeyHandle, messageKey.iv, ciphertext)
        return unpadPkcs7(padded)
    }

    private async runRecvRatchetStep(remoteRatchetPub: Uint8Array): Promise<void> {
        if (!this.rootKey) {
            throw new FakePeerDoubleRatchetError('cannot run recv DR step: no root key')
        }
        if (!this.sendChain) {
            throw new FakePeerDoubleRatchetError(
                'cannot run recv DR step: no current local ratchet (alice has not initiated)'
            )
        }
        const remoteRatchetRaw = toRawPubKey(remoteRatchetPub)
        const ratchetShared = await X25519.scalarMult(
            this.sendChain.ratchetKeyPair.privKey,
            remoteRatchetRaw
        )
        const [nextRootKey, recvChainKey] = await hkdfSplit(
            ratchetShared,
            this.rootKey,
            'WhisperRatchet'
        )
        this.rootKey = nextRootKey
        this.recvChain = {
            ratchetPubKey: toSerializedPubKey(remoteRatchetPub),
            chainKey: recvChainKey,
            nextIndex: 0,
            unusedKeys: []
        }
        // After receiving fresh remote ratchet, mint a new local ratchet
        // and run a SECOND DR step so the next outbound encrypt uses a
        // brand-new send chain (mirrors the lib's behaviour).
        await this.rotateSendRatchet(remoteRatchetPub)
    }

    private async rotateSendRatchet(remoteRatchetPub: Uint8Array): Promise<void> {
        if (!this.rootKey) {
            throw new FakePeerDoubleRatchetError('cannot rotate send ratchet: no root key')
        }
        const newRatchet = await X25519.generateKeyPair()
        const ratchetShared = await X25519.scalarMult(
            newRatchet.privKey,
            toRawPubKey(remoteRatchetPub)
        )
        const [nextRootKey, sendChainKey] = await hkdfSplit(
            ratchetShared,
            this.rootKey,
            'WhisperRatchet'
        )
        this.rootKey = nextRootKey
        this.sendChain = {
            ratchetKeyPair: newRatchet,
            ratchetPubSerialized: toSerializedPubKey(newRatchet.pubKey),
            chainKey: sendChainKey,
            nextIndex: 0
        }
        this.hasOutboundSendChain = true
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
    return {
        nextChainKey: nextChainRaw.subarray(0, 32),
        messageKey: {
            index,
            cipherKey: expanded.subarray(0, 32),
            macKey: expanded.subarray(32, 64),
            iv: expanded.subarray(64, 80)
        }
    }
}

async function deriveMessageKeyFromChain(chainKey: Uint8Array): Promise<{
    readonly nextChainKey: Uint8Array
    readonly messageKey: { cipherKey: Uint8Array; macKey: Uint8Array; iv: Uint8Array }
}> {
    const result = await deriveMessageKey(0, chainKey)
    return {
        nextChainKey: result.nextChainKey,
        messageKey: {
            cipherKey: result.messageKey.cipherKey,
            macKey: result.messageKey.macKey,
            iv: result.messageKey.iv
        }
    }
}

function readVersionedBody(envelope: Uint8Array): Uint8Array {
    if (envelope.byteLength < 1) {
        throw new FakePeerDoubleRatchetError('signal envelope is empty')
    }
    const version = envelope[0] >>> 4
    if (version !== SIGNAL_VERSION) {
        throw new FakePeerDoubleRatchetError(`unsupported signal version ${version}`)
    }
    return envelope.subarray(1)
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

function requireBytes(value: Uint8Array | null | undefined, label: string): Uint8Array {
    if (!value) throw new FakePeerDoubleRatchetError(`${label} missing`)
    return value
}
