/** App-state crypto helpers mirrored from WhatsApp Web behavior. */

import {
    aesCbcDecrypt,
    aesCbcEncrypt,
    hkdf,
    hmacSha256Sign,
    hmacSha512Sign,
    randomBytesAsync
} from '../../transport/crypto'
import { proto, type Proto } from '../../transport/protos'

const APP_STATE_DERIVED_KEY_LENGTH = 160
const APP_STATE_DERIVED_INDEX_KEY_END = 32
const APP_STATE_DERIVED_VALUE_ENCRYPTION_KEY_END = 64
const APP_STATE_DERIVED_VALUE_MAC_KEY_END = 96
const APP_STATE_DERIVED_SNAPSHOT_MAC_KEY_END = 128
const APP_STATE_DERIVED_PATCH_MAC_KEY_END = 160
const APP_STATE_VALUE_MAC_LENGTH = 32
const APP_STATE_MAC_OCTET_LENGTH = 8
const APP_STATE_IV_LENGTH = 16
const APP_STATE_LT_HASH_SIZE = 128
const APP_STATE_POINT_SIZE = 2
const KDF_INFO_MUTATION_KEYS = 'WhatsApp Mutation Keys'
const KDF_INFO_PATCH_INTEGRITY = 'WhatsApp Patch Integrity'

export const APP_STATE_EMPTY_LT_HASH = new Uint8Array(APP_STATE_LT_HASH_SIZE)

export interface FakeAppStateDerivedKeys {
    readonly indexHmacKey: Uint8Array
    readonly valueEncryptionAesKey: Uint8Array
    readonly valueMacHmacKey: Uint8Array
    readonly snapshotMacHmacKey: Uint8Array
    readonly patchMacHmacKey: Uint8Array
}

export interface FakeAppStateEncryptedMutation {
    readonly indexMac: Uint8Array
    readonly valueBlob: Uint8Array
    readonly valueMac: Uint8Array
}

export interface FakeAppStateMutationInput {
    readonly operation: 'set' | 'remove'
    readonly keyId: Uint8Array
    readonly keyData: Uint8Array
    readonly index: string
    readonly value: Proto.ISyncActionValue | null
    readonly version: number
    readonly iv?: Uint8Array
}

export class FakeAppStateCrypto {
    public async deriveKeys(keyData: Uint8Array): Promise<FakeAppStateDerivedKeys> {
        const derived = await hkdf(
            keyData,
            null,
            KDF_INFO_MUTATION_KEYS,
            APP_STATE_DERIVED_KEY_LENGTH
        )
        return {
            indexHmacKey: derived.subarray(0, APP_STATE_DERIVED_INDEX_KEY_END),
            valueEncryptionAesKey: derived.subarray(
                APP_STATE_DERIVED_INDEX_KEY_END,
                APP_STATE_DERIVED_VALUE_ENCRYPTION_KEY_END
            ),
            valueMacHmacKey: derived.subarray(
                APP_STATE_DERIVED_VALUE_ENCRYPTION_KEY_END,
                APP_STATE_DERIVED_VALUE_MAC_KEY_END
            ),
            snapshotMacHmacKey: derived.subarray(
                APP_STATE_DERIVED_VALUE_MAC_KEY_END,
                APP_STATE_DERIVED_SNAPSHOT_MAC_KEY_END
            ),
            patchMacHmacKey: derived.subarray(
                APP_STATE_DERIVED_SNAPSHOT_MAC_KEY_END,
                APP_STATE_DERIVED_PATCH_MAC_KEY_END
            )
        }
    }

    public async encryptMutation(
        input: FakeAppStateMutationInput
    ): Promise<FakeAppStateEncryptedMutation> {
        const derivedKeys = await this.deriveKeys(input.keyData)
        const indexBytes = new TextEncoder().encode(input.index)
        const encoded = proto.SyncActionData.encode({
            index: indexBytes,
            value: input.value ?? undefined,
            padding: new Uint8Array(0),
            version: input.version
        }).finish()

        const iv = input.iv ?? (await randomBytesAsync(APP_STATE_IV_LENGTH))
        if (iv.byteLength !== APP_STATE_IV_LENGTH) {
            throw new Error(`invalid IV length ${iv.byteLength}`)
        }

        const indexMac = await hmacSha256Sign(derivedKeys.indexHmacKey, indexBytes)
        const cipherText = await aesCbcEncrypt(derivedKeys.valueEncryptionAesKey, iv, encoded)
        const cipherWithIv = concatBytes([iv, cipherText])
        const associatedData = generateAssociatedData(input.operation, input.keyId)
        const valueMac = await this.generateValueMac(
            derivedKeys.valueMacHmacKey,
            associatedData,
            cipherWithIv
        )

        return {
            indexMac,
            valueBlob: concatBytes([cipherWithIv, valueMac]),
            valueMac
        }
    }

    public async decryptMutation(input: {
        readonly operation: 'set' | 'remove'
        readonly keyId: Uint8Array
        readonly keyData: Uint8Array
        readonly indexMac: Uint8Array
        readonly valueBlob: Uint8Array
    }): Promise<{
        readonly index: string
        readonly value: Proto.ISyncActionValue | null
        readonly version: number
        readonly indexMac: Uint8Array
        readonly valueMac: Uint8Array
    }> {
        if (input.valueBlob.byteLength < APP_STATE_IV_LENGTH + APP_STATE_VALUE_MAC_LENGTH) {
            throw new Error('invalid mutation value blob')
        }
        const derivedKeys = await this.deriveKeys(input.keyData)
        const iv = input.valueBlob.subarray(0, APP_STATE_IV_LENGTH)
        const macStart = input.valueBlob.byteLength - APP_STATE_VALUE_MAC_LENGTH
        const valueMac = input.valueBlob.subarray(macStart)
        const cipherText = input.valueBlob.subarray(APP_STATE_IV_LENGTH, macStart)
        const cipherWithIv = input.valueBlob.subarray(0, macStart)

        const associatedData = generateAssociatedData(input.operation, input.keyId)
        const expectedMac = await this.generateValueMac(
            derivedKeys.valueMacHmacKey,
            associatedData,
            cipherWithIv
        )
        if (!uint8Equal(expectedMac, valueMac)) {
            throw new Error('mutation value MAC mismatch')
        }

        const plaintext = await aesCbcDecrypt(derivedKeys.valueEncryptionAesKey, iv, cipherText)
        const syncActionData = proto.SyncActionData.decode(plaintext)
        if (!syncActionData.index) {
            throw new Error('missing sync action index')
        }
        if (syncActionData.version === null || syncActionData.version === undefined) {
            throw new Error('missing sync action version')
        }
        const generatedIndexMac = await hmacSha256Sign(
            derivedKeys.indexHmacKey,
            syncActionData.index
        )
        if (!uint8Equal(generatedIndexMac, input.indexMac)) {
            throw new Error('mutation index MAC mismatch')
        }
        return {
            index: new TextDecoder().decode(syncActionData.index),
            value: syncActionData.value ?? null,
            version: syncActionData.version,
            indexMac: input.indexMac,
            valueMac
        }
    }

    public async generateSnapshotMac(
        keyData: Uint8Array,
        ltHash: Uint8Array,
        version: number,
        collectionName: string
    ): Promise<Uint8Array> {
        const derivedKeys = await this.deriveKeys(keyData)
        const payload = concatBytes([
            ltHash,
            intToBytesBe(8, version),
            new TextEncoder().encode(collectionName)
        ])
        return hmacSha256Sign(derivedKeys.snapshotMacHmacKey, payload)
    }

    public async generatePatchMac(
        keyData: Uint8Array,
        snapshotMac: Uint8Array,
        valueMacs: readonly Uint8Array[],
        version: number,
        collectionName: string
    ): Promise<Uint8Array> {
        const derivedKeys = await this.deriveKeys(keyData)
        const payload = concatBytes([
            snapshotMac,
            ...valueMacs,
            intToBytesBe(8, version),
            new TextEncoder().encode(collectionName)
        ])
        return hmacSha256Sign(derivedKeys.patchMacHmacKey, payload)
    }

    public async ltHashAdd(
        base: Uint8Array,
        addValues: readonly Uint8Array[]
    ): Promise<Uint8Array> {
        return this.ltHashApply(base, addValues, (left, right) => left + right)
    }

    public async ltHashSubtract(
        base: Uint8Array,
        removeValues: readonly Uint8Array[]
    ): Promise<Uint8Array> {
        return this.ltHashApply(base, removeValues, (left, right) => left - right)
    }

    private async ltHashApply(
        base: Uint8Array,
        values: readonly Uint8Array[],
        combine: (left: number, right: number) => number
    ): Promise<Uint8Array> {
        if (values.length === 0) {
            return base.slice()
        }
        const expandedValues = await Promise.all(
            values.map((value) =>
                hkdf(value, null, KDF_INFO_PATCH_INTEGRITY, APP_STATE_LT_HASH_SIZE)
            )
        )
        const out = new Uint8Array(base.byteLength)
        pointwise(base, expandedValues[0], combine, out)
        for (let index = 1; index < expandedValues.length; index += 1) {
            pointwise(out, expandedValues[index], combine, out)
        }
        return out
    }

    private async generateValueMac(
        valueMacHmacKey: Uint8Array,
        associatedData: Uint8Array,
        cipherWithIv: Uint8Array
    ): Promise<Uint8Array> {
        const octetLength = new Uint8Array(APP_STATE_MAC_OCTET_LENGTH)
        octetLength[octetLength.length - 1] = associatedData.byteLength & 0xff
        const full = await hmacSha512Sign(
            valueMacHmacKey,
            concatBytes([associatedData, cipherWithIv, octetLength])
        )
        return full.subarray(0, APP_STATE_VALUE_MAC_LENGTH)
    }
}

function generateAssociatedData(operation: 'set' | 'remove', keyId: Uint8Array): Uint8Array {
    // byte 0 is operation+1 (set=1, remove=2), then keyId bytes.
    const opCode = operation === 'set' ? 1 : 2
    const out = new Uint8Array(1 + keyId.byteLength)
    out[0] = opCode
    out.set(keyId, 1)
    return out
}

function pointwise(
    left: Uint8Array,
    right: Uint8Array,
    combine: (leftValue: number, rightValue: number) => number,
    out: Uint8Array
): void {
    if (left.byteLength !== right.byteLength) {
        throw new Error('lt hash input length mismatch')
    }
    if (left.byteLength % APP_STATE_POINT_SIZE !== 0) {
        throw new Error('lt hash input alignment mismatch')
    }
    if (out.byteLength !== left.byteLength) {
        throw new Error('lt hash output length mismatch')
    }
    const leftView = new DataView(left.buffer, left.byteOffset, left.byteLength)
    const rightView = new DataView(right.buffer, right.byteOffset, right.byteLength)
    const outView = new DataView(out.buffer, out.byteOffset, out.byteLength)
    for (let offset = 0; offset < left.byteLength; offset += APP_STATE_POINT_SIZE) {
        const value = combine(leftView.getUint16(offset, true), rightView.getUint16(offset, true))
        outView.setUint16(offset, value & 0xffff, true)
    }
}

function intToBytesBe(byteLength: number, value: number): Uint8Array {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`invalid integer value: ${value}`)
    }
    const out = new Uint8Array(byteLength)
    let current = value
    for (let i = byteLength - 1; i >= 0; i -= 1) {
        out[i] = current & 0xff
        current = Math.floor(current / 256)
    }
    return out
}

function uint8Equal(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) return false
    let diff = 0
    for (let index = 0; index < a.byteLength; index += 1) {
        diff |= a[index] ^ b[index]
    }
    return diff === 0
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
