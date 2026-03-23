import {
    aesCbcDecrypt,
    aesCbcEncrypt,
    importAesCbcKey,
    toSerializedPubKey,
    prependVersion,
    randomBytesAsync,
    randomIntAsync,
    X25519
} from '@crypto'
import { StoreLock } from '@infra/perf/StoreLock'
import type { Proto } from '@proto'
import { proto } from '@proto'
import { signalAddressKey } from '@protocol/jid'
import { SIGNAL_GROUP_VERSION, SIGNATURE_SIZE } from '@signal/constants'
import { signSignalMessage, verifySignalSignature } from '@signal/crypto/WaAdvSignature'
import { deriveSenderKeyMsgKey, selectMessageKey } from '@signal/group/SenderKeyChain'
import { parseDistributionPayload, parseSenderKeyMessage } from '@signal/group/SenderKeyCodec'
import type { SenderKeyRecord, SignalAddress } from '@signal/types'
import type { WaSenderKeyStore } from '@store/contracts/sender-key.store'
import { concatBytes } from '@util/bytes'

interface GroupSenderKeyCiphertext {
    readonly groupId: string
    readonly sender: SignalAddress
    readonly keyId?: number
    readonly iteration?: number
    readonly ciphertext: Uint8Array
}

function extractAesCbcParams(seed: Uint8Array): {
    readonly keyBytes: Uint8Array
    readonly iv: Uint8Array
} {
    if (seed.length < 48) {
        throw new Error('sender key message seed must be at least 48 bytes')
    }

    return {
        iv: seed.subarray(0, 16),
        keyBytes: seed.subarray(16, 48)
    }
}

async function aesCbcEncryptFromSeed(seed: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
    const { keyBytes, iv } = extractAesCbcParams(seed)
    return aesCbcEncrypt(await importAesCbcKey(keyBytes), iv, plaintext)
}

async function aesCbcDecryptFromSeed(
    seed: Uint8Array,
    ciphertext: Uint8Array
): Promise<Uint8Array> {
    const { keyBytes, iv } = extractAesCbcParams(seed)
    return aesCbcDecrypt(await importAesCbcKey(keyBytes), iv, ciphertext)
}

export class SenderKeyManager {
    private readonly store: WaSenderKeyStore
    private readonly senderLock = new StoreLock()

    public constructor(store: WaSenderKeyStore) {
        this.store = store
    }

    public async prepareGroupEncryption(
        groupId: string,
        sender: SignalAddress,
        plaintext: Uint8Array
    ): Promise<{
        readonly distributionMessage: Proto.Message.ISenderKeyDistributionMessage
        readonly ciphertext: GroupSenderKeyCiphertext
        readonly keyId: number
    }> {
        return this.runWithSenderLock(groupId, sender, async () => {
            const senderKey = await this.ensureSenderKeyInternal(groupId, sender)
            const distributionProto = proto.SenderKeyDistributionMessage.encode({
                id: senderKey.keyId,
                iteration: senderKey.iteration,
                chainKey: senderKey.chainKey,
                signingKey: senderKey.signingPublicKey
            }).finish()
            const distributionMessage = {
                groupId,
                axolotlSenderKeyDistributionMessage: prependVersion(
                    distributionProto,
                    SIGNAL_GROUP_VERSION
                )
            }
            if (!senderKey.signingPrivateKey) {
                throw new Error('sender private signing key is missing')
            }

            const derived = await deriveSenderKeyMsgKey(senderKey.iteration, senderKey.chainKey)
            const messagePayload = await aesCbcEncryptFromSeed(derived.messageKey.seed, plaintext)
            const senderKeyMessage = proto.SenderKeyMessage.encode({
                id: senderKey.keyId,
                iteration: derived.messageKey.iteration,
                ciphertext: messagePayload
            }).finish()
            const versionedContent = prependVersion(senderKeyMessage, SIGNAL_GROUP_VERSION)
            const signature = await signSignalMessage(senderKey.signingPrivateKey, versionedContent)
            if (signature.length !== SIGNATURE_SIZE) {
                throw new Error(`invalid sender key signature length ${signature.length}`)
            }
            const ciphertext: GroupSenderKeyCiphertext = {
                groupId,
                sender,
                keyId: senderKey.keyId,
                iteration: derived.messageKey.iteration,
                ciphertext: concatBytes([versionedContent, signature])
            }

            await Promise.all([
                this.store.upsertSenderKeyDistribution({
                    groupId,
                    sender,
                    keyId: senderKey.keyId,
                    timestampMs: Date.now()
                }),
                this.store.upsertSenderKey({
                    ...senderKey,
                    chainKey: derived.nextChainKey,
                    iteration: derived.messageKey.iteration + 1
                })
            ])

            return {
                distributionMessage,
                ciphertext,
                keyId: senderKey.keyId
            }
        })
    }

    public async filterParticipantsNeedingDistribution(
        groupId: string,
        senderKeyId: number,
        participants: readonly SignalAddress[]
    ): Promise<readonly SignalAddress[]> {
        if (participants.length === 0) {
            return []
        }
        const distributed = await this.store.getDeviceSenderKeyDistributions(groupId, participants)
        const pendingParticipants = new Array<SignalAddress>(participants.length)
        let pendingCount = 0
        for (let index = 0; index < participants.length; index += 1) {
            const record = distributed[index]
            if (!record || record.keyId !== senderKeyId) {
                pendingParticipants[pendingCount] = participants[index]
                pendingCount += 1
            }
        }
        pendingParticipants.length = pendingCount
        return pendingParticipants
    }

    public async markSenderKeyDistributed(
        groupId: string,
        senderKeyId: number,
        participants: readonly SignalAddress[]
    ): Promise<void> {
        if (participants.length === 0) {
            return
        }
        const timestampMs = Date.now()
        const distributions = new Array(participants.length)
        for (let index = 0; index < participants.length; index += 1) {
            distributions[index] = {
                groupId,
                sender: participants[index],
                keyId: senderKeyId,
                timestampMs
            }
        }
        await this.store.upsertSenderKeyDistributions(distributions)
    }

    public async processSenderKeyDistributionPayload(
        groupId: string,
        sender: SignalAddress,
        payload: Uint8Array
    ): Promise<SenderKeyRecord> {
        return this.runWithSenderLock(groupId, sender, async () => {
            if (groupId.length === 0) {
                throw new Error('sender key distribution missing groupId')
            }

            const parsed = parseDistributionPayload(payload)
            const record: SenderKeyRecord = {
                groupId,
                sender,
                keyId: parsed.keyId,
                iteration: parsed.iteration,
                chainKey: parsed.chainKey,
                signingPublicKey: parsed.signingPublicKey,
                unusedMessageKeys: []
            }
            await Promise.all([
                this.store.upsertSenderKey(record),
                this.store.upsertSenderKeyDistribution({
                    groupId,
                    sender,
                    keyId: parsed.keyId,
                    timestampMs: Date.now()
                })
            ])
            return record
        })
    }

    public async decryptGroupMessage(payload: GroupSenderKeyCiphertext): Promise<Uint8Array> {
        return this.runWithSenderLock(payload.groupId, payload.sender, async () => {
            const parsed = parseSenderKeyMessage(payload.ciphertext)

            const senderKey = await this.store.getDeviceSenderKey(payload.groupId, payload.sender)
            if (!senderKey) {
                throw new Error('missing sender key')
            }
            if (senderKey.keyId !== parsed.keyId) {
                throw new Error('sender key id mismatch')
            }

            if (
                payload.keyId !== undefined &&
                payload.keyId !== null &&
                parsed.keyId !== payload.keyId
            ) {
                throw new Error('sender key id mismatch')
            }
            if (
                payload.iteration !== undefined &&
                payload.iteration !== null &&
                parsed.iteration !== payload.iteration
            ) {
                throw new Error('sender key iteration mismatch')
            }

            const signedContent = parsed.versionContentMac.subarray(
                0,
                parsed.versionContentMac.length - SIGNATURE_SIZE
            )
            const signature = parsed.versionContentMac.subarray(
                parsed.versionContentMac.length - SIGNATURE_SIZE
            )
            const validSignature = await verifySignalSignature(
                senderKey.signingPublicKey,
                signedContent,
                signature
            )
            if (!validSignature) {
                throw new Error('invalid sender key signature')
            }

            const selected = await selectMessageKey(senderKey, parsed.iteration)
            // Keep decrypt + persist ordered: failed decrypt must not advance sender-key state.
            const plaintext = await aesCbcDecryptFromSeed(
                selected.messageKey.seed,
                parsed.ciphertext
            )
            await this.store.upsertSenderKey(selected.updatedRecord)
            return plaintext
        })
    }

    private async ensureSenderKeyInternal(
        groupId: string,
        sender: SignalAddress
    ): Promise<SenderKeyRecord> {
        const existing = await this.store.getDeviceSenderKey(groupId, sender)
        if (existing) {
            return existing
        }

        const [signingKeyPair, keyId, chainKey] = await Promise.all([
            X25519.generateKeyPair(),
            randomIntAsync(1, 2_147_483_647),
            randomBytesAsync(32)
        ])
        const created: SenderKeyRecord = {
            groupId,
            sender,
            keyId,
            iteration: 0,
            chainKey,
            signingPublicKey: toSerializedPubKey(signingKeyPair.pubKey),
            signingPrivateKey: signingKeyPair.privKey,
            unusedMessageKeys: []
        }
        await this.store.upsertSenderKey(created)
        return created
    }

    private runWithSenderLock<T>(
        groupId: string,
        sender: SignalAddress,
        task: () => Promise<T>
    ): Promise<T> {
        return this.senderLock.run(`senderKey:${groupId}:${signalAddressKey(sender)}`, task)
    }
}
