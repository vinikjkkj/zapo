import { hkdf } from '../crypto/core/hkdf'
import {
    aesCbcDecrypt,
    aesCbcEncrypt,
    hmacSign,
    importAesCbcKey,
    importHmacKey,
    importHmacSha512Key
} from '../crypto/core/primitives'
import { randomBytesAsync } from '../crypto/core/random'
import { proto } from '../proto'
import type { Proto } from '../proto'
import { WA_APP_STATE_KDF_INFO } from '../protocol/constants'
import { bytesToBase64 } from '../util/base64'
import { concatBytes, uint8Equal } from '../util/bytes'

import {
    APP_STATE_DERIVED_INDEX_KEY_END,
    APP_STATE_DERIVED_KEY_LENGTH,
    APP_STATE_DERIVED_PATCH_MAC_KEY_END,
    APP_STATE_DERIVED_SNAPSHOT_MAC_KEY_END,
    APP_STATE_DERIVED_VALUE_ENCRYPTION_KEY_END,
    APP_STATE_DERIVED_VALUE_MAC_KEY_END,
    APP_STATE_EMPTY_LT_HASH,
    APP_STATE_IV_LENGTH,
    APP_STATE_MAC_OCTET_LENGTH,
    APP_STATE_POINT_SIZE,
    APP_STATE_TEXT_DECODER,
    APP_STATE_TEXT_ENCODER,
    APP_STATE_VALUE_MAC_LENGTH
} from './constants'
import { toNetworkOrder64 } from './utils'

const EMPTY_BYTES = new Uint8Array(0)

interface WaAppStateDerivedKeys {
    readonly indexKey: Uint8Array
    readonly valueEncryptionKey: Uint8Array
    readonly valueMacKey: Uint8Array
    readonly snapshotMacKey: Uint8Array
    readonly patchMacKey: Uint8Array
}

interface WaAppStateEncryptedMutation {
    readonly indexMac: Uint8Array
    readonly valueBlob: Uint8Array
    readonly valueMac: Uint8Array
}

interface WaAppStateDecryptedMutation {
    readonly index: string
    readonly value: Proto.ISyncActionValue | null
    readonly version: number
    readonly indexMac: Uint8Array
    readonly valueMac: Uint8Array
}

export class WaAppStateCrypto {
    private readonly derivedKeysCache: Map<string, WaAppStateDerivedKeys>

    public constructor() {
        this.derivedKeysCache = new Map()
    }

    public clearCache(): void {
        this.derivedKeysCache.clear()
    }

    public async deriveKeys(keyData: Uint8Array): Promise<WaAppStateDerivedKeys> {
        const cacheKey = bytesToBase64(keyData)
        const cached = this.derivedKeysCache.get(cacheKey)
        if (cached) {
            return cached
        }

        const derived = await hkdf(
            keyData,
            null,
            WA_APP_STATE_KDF_INFO.MUTATION_KEYS,
            APP_STATE_DERIVED_KEY_LENGTH
        )
        const keys: WaAppStateDerivedKeys = {
            indexKey: derived.subarray(0, APP_STATE_DERIVED_INDEX_KEY_END),
            valueEncryptionKey: derived.subarray(
                APP_STATE_DERIVED_INDEX_KEY_END,
                APP_STATE_DERIVED_VALUE_ENCRYPTION_KEY_END
            ),
            valueMacKey: derived.subarray(
                APP_STATE_DERIVED_VALUE_ENCRYPTION_KEY_END,
                APP_STATE_DERIVED_VALUE_MAC_KEY_END
            ),
            snapshotMacKey: derived.subarray(
                APP_STATE_DERIVED_VALUE_MAC_KEY_END,
                APP_STATE_DERIVED_SNAPSHOT_MAC_KEY_END
            ),
            patchMacKey: derived.subarray(
                APP_STATE_DERIVED_SNAPSHOT_MAC_KEY_END,
                APP_STATE_DERIVED_PATCH_MAC_KEY_END
            )
        }
        this.derivedKeysCache.set(cacheKey, keys)
        return keys
    }

    public valueMacFromIndexAndValueCipherText(valueBlob: Uint8Array): Uint8Array {
        if (valueBlob.byteLength < APP_STATE_VALUE_MAC_LENGTH) {
            throw new Error('invalid mutation value blob length')
        }
        return valueBlob.subarray(valueBlob.byteLength - APP_STATE_VALUE_MAC_LENGTH)
    }

    public async generateIndexMac(
        indexKey: Uint8Array,
        indexBytes: Uint8Array
    ): Promise<Uint8Array> {
        const key = await importHmacKey(indexKey)
        return hmacSign(key, indexBytes)
    }

    public async encryptMutation(args: {
        readonly operation: number
        readonly keyId: Uint8Array
        readonly keyData: Uint8Array
        readonly index: string
        readonly value: Proto.ISyncActionValue | null
        readonly version: number
        readonly iv?: Uint8Array
    }): Promise<WaAppStateEncryptedMutation> {
        const derivedKeys = await this.deriveKeys(args.keyData)
        const indexBytes = APP_STATE_TEXT_ENCODER.encode(args.index)
        const encoded = proto.SyncActionData.encode({
            index: indexBytes,
            value: args.value ?? undefined,
            padding: EMPTY_BYTES,
            version: args.version
        }).finish()

        const iv = args.iv ?? (await randomBytesAsync(APP_STATE_IV_LENGTH))
        if (iv.byteLength !== APP_STATE_IV_LENGTH) {
            throw new Error(`invalid IV length ${iv.byteLength}`)
        }

        const encryptionKey = await importAesCbcKey(derivedKeys.valueEncryptionKey)
        const cipherText = await aesCbcEncrypt(encryptionKey, iv, encoded)
        const cipherWithIv = concatBytes([iv, cipherText])

        const associatedData = this.generateAssociatedData(args.operation, args.keyId)
        const valueMac = await this.generateValueMac(
            derivedKeys.valueMacKey,
            associatedData,
            cipherWithIv
        )
        const indexMac = await this.generateIndexMac(derivedKeys.indexKey, indexBytes)

        return {
            indexMac,
            valueBlob: concatBytes([cipherWithIv, valueMac]),
            valueMac
        }
    }

    public async decryptMutation(args: {
        readonly operation: number
        readonly keyId: Uint8Array
        readonly keyData: Uint8Array
        readonly indexMac: Uint8Array
        readonly valueBlob: Uint8Array
    }): Promise<WaAppStateDecryptedMutation> {
        if (args.valueBlob.byteLength < APP_STATE_IV_LENGTH + APP_STATE_VALUE_MAC_LENGTH) {
            throw new Error('invalid mutation value blob')
        }

        const derivedKeys = await this.deriveKeys(args.keyData)
        const iv = args.valueBlob.subarray(0, APP_STATE_IV_LENGTH)
        const mac = args.valueBlob.subarray(args.valueBlob.byteLength - APP_STATE_VALUE_MAC_LENGTH)
        const cipherText = args.valueBlob.subarray(
            APP_STATE_IV_LENGTH,
            args.valueBlob.byteLength - APP_STATE_VALUE_MAC_LENGTH
        )
        const cipherWithIv = args.valueBlob.subarray(
            0,
            args.valueBlob.byteLength - APP_STATE_VALUE_MAC_LENGTH
        )

        const associatedData = this.generateAssociatedData(args.operation, args.keyId)
        const expectedMac = await this.generateValueMac(
            derivedKeys.valueMacKey,
            associatedData,
            cipherWithIv
        )
        if (!uint8Equal(mac, expectedMac)) {
            throw new Error('mutation value MAC mismatch')
        }

        const decryptionKey = await importAesCbcKey(derivedKeys.valueEncryptionKey)
        const plaintext = await aesCbcDecrypt(decryptionKey, iv, cipherText)
        const syncActionData = proto.SyncActionData.decode(plaintext)
        if (!syncActionData.index) {
            throw new Error('missing sync action index')
        }
        if (syncActionData.version === null || syncActionData.version === undefined) {
            throw new Error('missing sync action version')
        }

        const generatedIndexMac = await this.generateIndexMac(
            derivedKeys.indexKey,
            syncActionData.index
        )
        if (!uint8Equal(generatedIndexMac, args.indexMac)) {
            throw new Error('mutation index MAC mismatch')
        }

        return {
            index: APP_STATE_TEXT_DECODER.decode(syncActionData.index),
            value: syncActionData.value ?? null,
            version: syncActionData.version,
            indexMac: args.indexMac,
            valueMac: mac
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
            toNetworkOrder64(version),
            APP_STATE_TEXT_ENCODER.encode(collectionName)
        ])
        const key = await importHmacKey(derivedKeys.snapshotMacKey)
        return hmacSign(key, payload)
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
            toNetworkOrder64(version),
            APP_STATE_TEXT_ENCODER.encode(collectionName)
        ])
        const key = await importHmacKey(derivedKeys.patchMacKey)
        return hmacSign(key, payload)
    }

    public async ltHashAdd(
        base: Uint8Array,
        addValues: readonly Uint8Array[]
    ): Promise<Uint8Array> {
        let out = base
        for (const value of addValues) {
            const expanded = await hkdf(
                value,
                null,
                WA_APP_STATE_KDF_INFO.PATCH_INTEGRITY,
                APP_STATE_EMPTY_LT_HASH.byteLength
            )
            out = this.pointwiseWithOverflow(out, expanded, (left, right) => left + right)
        }
        return out
    }

    public async ltHashSubtract(
        base: Uint8Array,
        removeValues: readonly Uint8Array[]
    ): Promise<Uint8Array> {
        let out = base
        for (const value of removeValues) {
            const expanded = await hkdf(
                value,
                null,
                WA_APP_STATE_KDF_INFO.PATCH_INTEGRITY,
                APP_STATE_EMPTY_LT_HASH.byteLength
            )
            out = this.pointwiseWithOverflow(out, expanded, (left, right) => left - right)
        }
        return out
    }

    public async ltHashSubtractThenAdd(
        base: Uint8Array,
        addValues: readonly Uint8Array[],
        removeValues: readonly Uint8Array[]
    ): Promise<{ readonly hash: Uint8Array; readonly subtractResult: Uint8Array }> {
        const subtractResult = await this.ltHashSubtract(base, removeValues)
        const hash = await this.ltHashAdd(subtractResult, addValues)
        return { hash, subtractResult }
    }

    private pointwiseWithOverflow(
        left: Uint8Array,
        right: Uint8Array,
        combine: (leftValue: number, rightValue: number) => number
    ): Uint8Array {
        if (left.byteLength !== right.byteLength) {
            throw new Error('lt hash input length mismatch')
        }
        if (left.byteLength % APP_STATE_POINT_SIZE !== 0) {
            throw new Error('lt hash input alignment mismatch')
        }
        const out = new Uint8Array(left.byteLength)
        const leftView = new DataView(left.buffer, left.byteOffset, left.byteLength)
        const rightView = new DataView(right.buffer, right.byteOffset, right.byteLength)
        const outView = new DataView(out.buffer)
        for (let offset = 0; offset < left.byteLength; offset += APP_STATE_POINT_SIZE) {
            const value = combine(
                leftView.getUint16(offset, true),
                rightView.getUint16(offset, true)
            )
            outView.setUint16(offset, value & 0xffff, true)
        }
        return out
    }

    private generateAssociatedData(operation: number, keyId: Uint8Array): Uint8Array {
        const opByte =
            operation === proto.SyncdMutation.SyncdOperation.SET
                ? proto.SyncdMutation.SyncdOperation.SET
                : operation === proto.SyncdMutation.SyncdOperation.REMOVE
                  ? proto.SyncdMutation.SyncdOperation.REMOVE
                  : -1
        if (opByte < 0) {
            throw new Error(`unsupported syncd operation ${operation}`)
        }
        const out = new Uint8Array(1 + keyId.byteLength)
        out[0] = opByte + 1
        out.set(keyId, 1)
        return out
    }

    private async generateValueMac(
        valueMacKey: Uint8Array,
        associatedData: Uint8Array,
        cipherWithIv: Uint8Array
    ): Promise<Uint8Array> {
        const octetLength = new Uint8Array(APP_STATE_MAC_OCTET_LENGTH)
        octetLength[octetLength.length - 1] = associatedData.byteLength & 0xff
        const key = await importHmacSha512Key(valueMacKey)
        const full = await hmacSign(key, concatBytes([associatedData, cipherWithIv, octetLength]))
        return APP_STATE_VALUE_MAC_LENGTH >= full.byteLength
            ? full
            : full.slice(0, APP_STATE_VALUE_MAC_LENGTH)
    }
}
