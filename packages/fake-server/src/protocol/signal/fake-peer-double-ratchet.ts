/** Bidirectional Signal Double Ratchet used by fake peers. */

import {
    aesCbcDecrypt,
    aesCbcEncrypt,
    hkdf,
    hkdfSplit,
    hmacSha256Sign,
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
    ratchetPubKey: Uint8Array
    chainKey: Uint8Array
    nextIndex: number
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
    private readonly localIdentityPubSerialized: Uint8Array
    private remoteIdentityPubSerialized: Uint8Array | null = null
    private rootKey: Uint8Array | null = null
    private sendChain: SendChain | null = null
    private recvChain: RecvChain | null = null
    private pendingPreKeyHeader: PendingPreKeyHeader | null = null
    private bootstrapChainKey: Uint8Array | null = null
    private hasOutboundSendChain = false

    public constructor(keyBundle: FakePeerKeyBundle) {
        this.keyBundle = keyBundle
        this.localIdentityPubSerialized = toSerializedPubKey(keyBundle.identityKeyPair.pubKey)
    }

    public get registrationId(): number {
        return this.keyBundle.registrationId
    }

    public hasSendChain(): boolean {
        return this.sendChain !== null && this.hasOutboundSendChain
    }

    public async initiateOutbound(
        bundle: ClientPreKeyBundle,
        options: {
            readonly oneTimePreKey?: { readonly keyId: number; readonly publicKey: Uint8Array }
            /** Skip DH4 (one-time prekey) when no per-peer prekey can be reserved. */
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

        // Do not fallback to bundle.preKeys[0], otherwise concurrent peers reuse one key id.
        const consumedOneTime = options.skipOneTimePreKey ? undefined : options.oneTimePreKey
        const remoteOneTime = consumedOneTime ? toSerializedPubKey(consumedOneTime.publicKey) : null

        const [dh1, dh2, dh3, dh4] = await Promise.all([
            X25519.scalarMult(this.keyBundle.identityKeyPair.privKey, toRawPubKey(remoteSigned)),
            X25519.scalarMult(localBase.privKey, toRawPubKey(remoteIdentity)),
            X25519.scalarMult(localBase.privKey, toRawPubKey(remoteSigned)),
            remoteOneTime
                ? X25519.scalarMult(localBase.privKey, toRawPubKey(remoteOneTime))
                : Promise.resolve<Uint8Array | null>(null)
        ])
        const sharedParts: Uint8Array[] = [SIGNAL_PREFIX_FF, dh1, dh2, dh3]
        if (dh4) sharedParts.push(dh4)
        const shared = concatBytes(sharedParts)
        const [rootKey, _chainKey] = hkdfSplit(shared, null, 'WhisperText')
        void _chainKey

        const sendRatchet = await X25519.generateKeyPair()
        const ratchetSecret = await X25519.scalarMult(
            sendRatchet.privKey,
            toRawPubKey(remoteSigned)
        )
        const [nextRootKey, sendChainKey] = hkdfSplit(ratchetSecret, rootKey, 'WhisperRatchet')

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

        const { nextChainKey, messageKey } = deriveMessageKey(
            this.sendChain.nextIndex,
            this.sendChain.chainKey
        )
        const ciphertext = aesCbcEncrypt(messageKey.cipherKey, messageKey.iv, plaintext)
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
        const fullMac = hmacSha256Sign(messageKey.macKey, macInput)
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
                throw new FakePeerDoubleRatchetError(`unknown one-time preKeyId ${oneTimePreKeyId}`)
            }
            oneTimePrivKey = entry.keyPair.privKey
        }

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

        const [rootKey, chainKey] = hkdfSplit(shared, null, 'WhisperText')
        this.remoteIdentityPubSerialized = toSerializedPubKey(remoteIdentity)
        this.rootKey = rootKey
        this.bootstrapChainKey = chainKey
        return this.decryptInnerSignalMessage(innerMessage, /* isBootstrap */ true)
    }

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
            throw new FakePeerDoubleRatchetError(`unsupported signal version ${versionByte >>> 4}`)
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

        if (isBootstrap) {
            if (!this.rootKey || !this.bootstrapChainKey) {
                throw new FakePeerDoubleRatchetError('bootstrap state missing')
            }
            const ratchetShared = await X25519.scalarMult(
                this.keyBundle.signedPreKey.keyPair.privKey,
                toRawPubKey(ratchetKey)
            )
            const [nextRootKey, recvChainKey] = hkdfSplit(
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
            await this.rotateSendRatchet(ratchetKey)
        } else if (
            !this.recvChain ||
            !uint8Equal(this.recvChain.ratchetPubKey, ratchetSerialized)
        ) {
            await this.runRecvRatchetStep(ratchetKey)
        }

        if (!this.recvChain) {
            throw new FakePeerDoubleRatchetError('recv chain not initialized')
        }
        let messageKey: { cipherKey: Uint8Array; macKey: Uint8Array; iv: Uint8Array } | null = null
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
                const derived = deriveMessageKeyFromChain(chainKey)
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

        if (!this.remoteIdentityPubSerialized) {
            throw new FakePeerDoubleRatchetError('remoteIdentityPub not set')
        }
        const macInput = concatBytes([
            this.remoteIdentityPubSerialized,
            this.localIdentityPubSerialized,
            versionedBody
        ])
        const expectedFullMac = hmacSha256Sign(messageKey.macKey, macInput)
        const expectedMac = expectedFullMac.subarray(0, SIGNAL_MAC_SIZE)
        if (!uint8Equal(expectedMac, macBytes)) {
            throw new FakePeerDoubleRatchetError('signal message MAC mismatch')
        }

        const padded = aesCbcDecrypt(messageKey.cipherKey, messageKey.iv, ciphertext)
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
        const [nextRootKey, recvChainKey] = hkdfSplit(ratchetShared, this.rootKey, 'WhisperRatchet')
        this.rootKey = nextRootKey
        this.recvChain = {
            ratchetPubKey: toSerializedPubKey(remoteRatchetPub),
            chainKey: recvChainKey,
            nextIndex: 0,
            unusedKeys: []
        }
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
        const [nextRootKey, sendChainKey] = hkdfSplit(ratchetShared, this.rootKey, 'WhisperRatchet')
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

function deriveMessageKey(
    index: number,
    chainKey: Uint8Array
): { readonly nextChainKey: Uint8Array; readonly messageKey: DerivedMessageKey } {
    const messageInputKey = hmacSha256Sign(chainKey, MESSAGE_KEY_LABEL)
    const nextChainRaw = hmacSha256Sign(chainKey, CHAIN_KEY_LABEL)
    const expanded = hkdf(messageInputKey, null, 'WhisperMessageKeys', 80)
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

function deriveMessageKeyFromChain(chainKey: Uint8Array): {
    readonly nextChainKey: Uint8Array
    readonly messageKey: { cipherKey: Uint8Array; macKey: Uint8Array; iv: Uint8Array }
} {
    const result = deriveMessageKey(0, chainKey)
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
