import { webcrypto } from 'node:crypto'

import { Ed25519 } from '../../crypto'
import {
    hkdfWithBytesInfo,
    toSerializedPubKey,
    toRawPubKey,
    prependVersion,
    readVersionedContent,
    randomBytesAsync,
    randomIntAsync
} from '../../crypto'
import { proto } from '../../proto'
import {
    CHAIN_KEY_LABEL,
    MAX_UNUSED_KEYS,
    MESSAGE_KEY_LABEL,
    SENDER_KEY_FUTURE_MESSAGES_MAX,
    SIGNAL_GROUP_VERSION,
    SIGNATURE_SIZE,
    WHISPER_GROUP_INFO
} from '../../signal/constants'
import type {
    SenderKeyRecord,
    SenderMessageKey,
    SignalAddress
} from '../../signal/types'
import { concatBytes, removeAt, toBytesView } from '../../util/bytes'

import type { SenderKeyStore } from './SenderKeyStore'

interface ParsedDistributionPayload {
    readonly keyId: number
    readonly iteration: number
    readonly chainKey: Uint8Array
    readonly signingPublicKey: Uint8Array
}

interface ParsedSenderKeyMessage {
    readonly keyId: number
    readonly iteration: number
    readonly ciphertext: Uint8Array
    readonly versionContentMac: Uint8Array
}

interface GroupSenderKeyCiphertext {
    readonly groupId: string
    readonly sender: SignalAddress
    readonly keyId: number
    readonly iteration: number
    readonly ciphertext: Uint8Array
}

export class SenderKeyManager {
    private readonly store: SenderKeyStore

    public constructor(store: SenderKeyStore) {
        this.store = store
    }

    public async createSenderKeyDistributionMessage(
        groupId: string,
        sender: SignalAddress
    ): Promise<Uint8Array> {
        const senderKey = await this.ensureSenderKey(groupId, sender)
        const distributionProto = proto.SenderKeyDistributionMessage.encode({
            id: senderKey.keyId,
            iteration: senderKey.iteration,
            chainKey: senderKey.chainKey,
            signingKey: senderKey.signingPublicKey
        }).finish()
        const payload = prependVersion(distributionProto, SIGNAL_GROUP_VERSION)

        await this.store.upsertSenderKeyDistribution({
            groupId,
            sender,
            keyId: senderKey.keyId,
            timestampMs: Date.now()
        })

        const distribution = proto.Message.SenderKeyDistributionMessage.encode({
            groupId,
            axolotlSenderKeyDistributionMessage: payload
        }).finish()
        return distribution
    }

    public async processSenderKeyDistributionMessage(
        sender: SignalAddress,
        data: Uint8Array
    ): Promise<SenderKeyRecord> {
        const decoded = proto.Message.SenderKeyDistributionMessage.decode(data)
        const groupId = decoded.groupId ?? ''
        if (groupId.length === 0) {
            throw new Error('sender key distribution missing groupId')
        }
        if (!decoded.axolotlSenderKeyDistributionMessage) {
            throw new Error('sender key distribution missing payload')
        }

        const parsed = this.parseDistributionPayload(decoded.axolotlSenderKeyDistributionMessage)
        const record: SenderKeyRecord = {
            groupId,
            sender,
            keyId: parsed.keyId,
            iteration: parsed.iteration,
            chainKey: parsed.chainKey,
            signingPublicKey: parsed.signingPublicKey,
            unusedMessageKeys: []
        }
        await this.store.upsertSenderKey(record)
        await this.store.upsertSenderKeyDistribution({
            groupId,
            sender,
            keyId: parsed.keyId,
            timestampMs: Date.now()
        })
        return record
    }

    public async encryptGroupMessage(
        groupId: string,
        sender: SignalAddress,
        plaintext: Uint8Array
    ): Promise<GroupSenderKeyCiphertext> {
        const senderKey = await this.ensureSenderKey(groupId, sender)
        if (!senderKey.signingPrivateKey) {
            throw new Error('sender private signing key is missing')
        }

        const derived = await this.deriveSenderKeyMsgKey(senderKey.iteration, senderKey.chainKey)
        const messagePayload = await this.aesCbcEncryptFromSeed(derived.messageKey.seed, plaintext)
        const senderKeyMessage = proto.SenderKeyMessage.encode({
            id: senderKey.keyId,
            iteration: derived.messageKey.iteration,
            ciphertext: messagePayload
        }).finish()
        const versionedContent = prependVersion(senderKeyMessage, SIGNAL_GROUP_VERSION)
        const signature = await Ed25519.sign(versionedContent, senderKey.signingPrivateKey)
        if (signature.length !== SIGNATURE_SIZE) {
            throw new Error(`invalid sender key signature length ${signature.length}`)
        }
        const ciphertext = concatBytes([versionedContent, signature])

        await this.store.upsertSenderKey({
            ...senderKey,
            chainKey: derived.nextChainKey,
            iteration: derived.messageKey.iteration + 1
        })

        return {
            groupId,
            sender,
            keyId: senderKey.keyId,
            iteration: derived.messageKey.iteration,
            ciphertext
        }
    }

    public async decryptGroupMessage(payload: GroupSenderKeyCiphertext): Promise<Uint8Array> {
        const senderKey = await this.store.getDeviceSenderKey(payload.groupId, payload.sender)
        if (!senderKey) {
            throw new Error('missing sender key')
        }
        if (senderKey.keyId !== payload.keyId) {
            throw new Error('sender key id mismatch')
        }

        const parsed = this.parseSenderKeyMessage(payload.ciphertext)
        if (parsed.keyId !== payload.keyId || parsed.keyId !== senderKey.keyId) {
            throw new Error('sender key id mismatch')
        }
        if (parsed.iteration !== payload.iteration) {
            throw new Error('sender key iteration mismatch')
        }

        const signedContent = parsed.versionContentMac.subarray(
            0,
            parsed.versionContentMac.length - SIGNATURE_SIZE
        )
        const signature = parsed.versionContentMac.subarray(
            parsed.versionContentMac.length - SIGNATURE_SIZE
        )
        const validSignature = await Ed25519.verify(
            signedContent,
            signature,
            toRawPubKey(senderKey.signingPublicKey)
        )
        if (!validSignature) {
            throw new Error('invalid sender key signature')
        }

        const selected = await this.selectMessageKey(senderKey, parsed.iteration)
        const plaintext = await this.aesCbcDecryptFromSeed(
            selected.messageKey.seed,
            parsed.ciphertext
        )
        await this.store.upsertSenderKey(selected.updatedRecord)
        return plaintext
    }

    private async ensureSenderKey(
        groupId: string,
        sender: SignalAddress
    ): Promise<SenderKeyRecord> {
        const existing = await this.store.getDeviceSenderKey(groupId, sender)
        if (existing) {
            return existing
        }

        const signingKeyPair = await Ed25519.generateKeyPair()
        const created: SenderKeyRecord = {
            groupId,
            sender,
            keyId: await randomIntAsync(1, 2_147_483_647),
            iteration: 0,
            chainKey: await randomBytesAsync(32),
            signingPublicKey: toSerializedPubKey(signingKeyPair.pubKey),
            signingPrivateKey: signingKeyPair.privKey,
            unusedMessageKeys: []
        }
        await this.store.upsertSenderKey(created)
        return created
    }

    private parseDistributionPayload(payload: Uint8Array): ParsedDistributionPayload {
        const body = readVersionedContent(payload, SIGNAL_GROUP_VERSION, 0)
        const decoded = proto.SenderKeyDistributionMessage.decode(body)
        if (
            decoded.id === null ||
            decoded.id === undefined ||
            decoded.iteration === null ||
            decoded.iteration === undefined ||
            decoded.chainKey === null ||
            decoded.chainKey === undefined ||
            decoded.signingKey === null ||
            decoded.signingKey === undefined
        ) {
            throw new Error('invalid sender key distribution message')
        }

        const chainKey = toBytesView(decoded.chainKey)
        if (chainKey.length !== 32) {
            throw new Error('sender key distribution chainKey must be 32 bytes')
        }

        return {
            keyId: decoded.id,
            iteration: decoded.iteration,
            chainKey,
            signingPublicKey: toSerializedPubKey(toBytesView(decoded.signingKey))
        }
    }

    private parseSenderKeyMessage(versionContentMac: Uint8Array): ParsedSenderKeyMessage {
        const body = readVersionedContent(versionContentMac, SIGNAL_GROUP_VERSION, SIGNATURE_SIZE)
        const decoded = proto.SenderKeyMessage.decode(body)
        if (
            decoded.id === null ||
            decoded.id === undefined ||
            decoded.iteration === null ||
            decoded.iteration === undefined ||
            decoded.ciphertext === null ||
            decoded.ciphertext === undefined
        ) {
            throw new Error('invalid sender key message')
        }

        return {
            keyId: decoded.id,
            iteration: decoded.iteration,
            ciphertext: toBytesView(decoded.ciphertext),
            versionContentMac
        }
    }

    private async selectMessageKey(
        senderKey: SenderKeyRecord,
        targetIteration: number
    ): Promise<{ messageKey: SenderMessageKey; updatedRecord: SenderKeyRecord }> {
        const delta = targetIteration - senderKey.iteration
        if (delta > SENDER_KEY_FUTURE_MESSAGES_MAX) {
            throw new Error('sender key message is too far in future')
        }

        const currentUnused = senderKey.unusedMessageKeys ? senderKey.unusedMessageKeys.slice() : []
        if (delta < 0) {
            const foundIndex = currentUnused.findIndex(
                (entry) => entry.iteration === targetIteration
            )
            if (foundIndex === -1) {
                throw new Error('sender key message iteration is stale')
            }

            const messageKey = currentUnused[foundIndex]
            const nextUnused = removeAt(currentUnused, foundIndex)
            return {
                messageKey,
                updatedRecord: {
                    ...senderKey,
                    unusedMessageKeys: nextUnused
                }
            }
        }

        const firstDerived = await this.deriveSenderKeyMsgKey(
            senderKey.iteration,
            senderKey.chainKey
        )
        let nextChainKey = firstDerived.nextChainKey
        let messageKey = firstDerived.messageKey
        let nextUnused = currentUnused.slice()

        if (delta > 0) {
            let overflow = delta + currentUnused.length - MAX_UNUSED_KEYS
            if (overflow > 0) {
                nextUnused = currentUnused.slice(overflow)
                overflow -= currentUnused.length
            }

            for (
                let iteration = senderKey.iteration + 1;
                iteration <= targetIteration;
                iteration += 1
            ) {
                if (overflow > 0) {
                    overflow -= 1
                } else {
                    nextUnused.push(messageKey)
                }

                const derived = await this.deriveSenderKeyMsgKey(iteration, nextChainKey)
                nextChainKey = derived.nextChainKey
                messageKey = derived.messageKey
            }
        }

        return {
            messageKey,
            updatedRecord: {
                ...senderKey,
                iteration: targetIteration + 1,
                chainKey: nextChainKey,
                unusedMessageKeys: nextUnused
            }
        }
    }

    private async deriveSenderKeyMsgKey(
        iteration: number,
        chainKey: Uint8Array
    ): Promise<{ nextChainKey: Uint8Array; messageKey: SenderMessageKey }> {
        if (chainKey.length !== 32) {
            throw new Error('sender key chainKey must be 32 bytes')
        }

        const hmacKey = await webcrypto.subtle.importKey(
            'raw',
            chainKey,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        )
        const messageInputKey = toBytesView(await webcrypto.subtle.sign('HMAC', hmacKey, MESSAGE_KEY_LABEL))
        const nextChainKey = toBytesView(await webcrypto.subtle.sign('HMAC', hmacKey, CHAIN_KEY_LABEL))
        const messageSeed = await hkdfWithBytesInfo(messageInputKey, WHISPER_GROUP_INFO, 50)
        return {
            nextChainKey: nextChainKey.subarray(0, 32),
            messageKey: {
                iteration,
                seed: messageSeed
            }
        }
    }

    private async aesCbcEncryptFromSeed(
        seed: Uint8Array,
        plaintext: Uint8Array
    ): Promise<Uint8Array> {
        const { keyBytes, iv } = this.extractAesCbcParams(seed)
        const key = await webcrypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-CBC', length: 256 },
            false,
            ['encrypt']
        )
        const encrypted = await webcrypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, plaintext)
        return toBytesView(encrypted)
    }

    private async aesCbcDecryptFromSeed(
        seed: Uint8Array,
        ciphertext: Uint8Array
    ): Promise<Uint8Array> {
        const { keyBytes, iv } = this.extractAesCbcParams(seed)
        const key = await webcrypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-CBC', length: 256 },
            false,
            ['decrypt']
        )
        const decrypted = await webcrypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ciphertext)
        return toBytesView(decrypted)
    }

    private extractAesCbcParams(seed: Uint8Array): { keyBytes: Uint8Array; iv: Uint8Array } {
        if (seed.length < 48) {
            throw new Error('sender key message seed must be at least 48 bytes')
        }

        const iv = seed.subarray(0, 16)
        const keyBytes = seed.subarray(16, 48)
        return {
            keyBytes,
            iv
        }
    }
}
