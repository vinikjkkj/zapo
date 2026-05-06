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
    APP_STATE_VALUE_MAC_LENGTH
} from '@appstate/constants'
import { hkdf } from '@crypto/core/hkdf'
import {
    aesCbcDecrypt,
    aesCbcEncrypt,
    hmacSha256Sign,
    hmacSha512Sign
} from '@crypto/core/primitives'
import { randomBytesAsync } from '@crypto/core/random'
import { proto, type Proto } from '@proto'
import { WA_APP_STATE_KDF_INFO } from '@protocol/constants'
import {
    bytesToBase64,
    concatBytes,
    EMPTY_BYTES,
    intToBytes,
    TEXT_DECODER,
    TEXT_ENCODER,
    uint8TimingSafeEqual
} from '@util/bytes'
import { setBoundedMapEntry } from '@util/collections'
import { normalizeNonNegativeInteger } from '@util/primitives'

interface WaAppStateDerivedKeys {
    readonly indexHmacKey: Uint8Array
    readonly valueEncryptionAesKey: Uint8Array
    readonly valueMacHmacKey: Uint8Array
    readonly snapshotMacHmacKey: Uint8Array
    readonly patchMacHmacKey: Uint8Array
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

const DEFAULT_DERIVED_KEYS_CACHE_MAX_SIZE = 256

export class WaAppStateCrypto {
    private readonly derivedKeysCache: Map<string, WaAppStateDerivedKeys>
    private readonly derivedKeysCacheMaxSize: number
    private readonly skipMacVerification: boolean

    public constructor(
        derivedKeysCacheMaxSize = DEFAULT_DERIVED_KEYS_CACHE_MAX_SIZE,
        skipMacVerification = false
    ) {
        this.derivedKeysCache = new Map()
        this.derivedKeysCacheMaxSize = normalizeNonNegativeInteger(
            derivedKeysCacheMaxSize,
            DEFAULT_DERIVED_KEYS_CACHE_MAX_SIZE
        )
        this.skipMacVerification = skipMacVerification
    }

    public get isMacVerificationSkipped(): boolean {
        return this.skipMacVerification
    }

    public clearCache(): void {
        this.derivedKeysCache.clear()
    }

    public deriveKeys(keyData: Uint8Array): WaAppStateDerivedKeys {
        const cacheKey = bytesToBase64(keyData)
        const cached = this.derivedKeysCache.get(cacheKey)
        if (cached) {
            this.touchDerivedKeysCacheEntry(cacheKey, cached)
            return cached
        }

        const derived = hkdf(
            keyData,
            null,
            WA_APP_STATE_KDF_INFO.MUTATION_KEYS,
            APP_STATE_DERIVED_KEY_LENGTH
        )
        const keys: WaAppStateDerivedKeys = {
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
        this.touchDerivedKeysCacheEntry(cacheKey, keys)
        return keys
    }

    public generateIndexMac(indexHmacKey: Uint8Array, indexBytes: Uint8Array): Uint8Array {
        return hmacSha256Sign(indexHmacKey, indexBytes)
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
        const derivedKeys = this.deriveKeys(args.keyData)
        const indexBytes = TEXT_ENCODER.encode(args.index)
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

        const indexMac = this.generateIndexMac(derivedKeys.indexHmacKey, indexBytes)
        const cipherText = aesCbcEncrypt(derivedKeys.valueEncryptionAesKey, iv, encoded)
        const cipherWithIv = concatBytes([iv, cipherText])

        const associatedData = this.generateAssociatedData(args.operation, args.keyId)
        const valueMac = this.generateValueMac(
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

    // eslint-disable-next-line @typescript-eslint/require-await
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

        const derivedKeys = this.deriveKeys(args.keyData)
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

        if (!this.skipMacVerification) {
            const associatedData = this.generateAssociatedData(args.operation, args.keyId)
            const expectedMac = this.generateValueMac(
                derivedKeys.valueMacHmacKey,
                associatedData,
                cipherWithIv
            )
            if (!uint8TimingSafeEqual(mac, expectedMac)) {
                throw new Error('mutation value MAC mismatch')
            }
        }

        const plaintext = aesCbcDecrypt(derivedKeys.valueEncryptionAesKey, iv, cipherText)
        const syncActionData = proto.SyncActionData.decode(plaintext)
        if (!syncActionData.index) {
            throw new Error('missing sync action index')
        }
        if (syncActionData.version === null || syncActionData.version === undefined) {
            throw new Error('missing sync action version')
        }

        if (!this.skipMacVerification) {
            const generatedIndexMac = this.generateIndexMac(
                derivedKeys.indexHmacKey,
                syncActionData.index
            )
            if (!uint8TimingSafeEqual(generatedIndexMac, args.indexMac)) {
                throw new Error('mutation index MAC mismatch')
            }
        }

        return {
            index: TEXT_DECODER.decode(syncActionData.index),
            value: syncActionData.value ?? null,
            version: syncActionData.version,
            indexMac: args.indexMac,
            valueMac: mac
        }
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async generateSnapshotMac(
        keyData: Uint8Array,
        ltHash: Uint8Array,
        version: number,
        collectionName: string
    ): Promise<Uint8Array> {
        const derivedKeys = this.deriveKeys(keyData)
        return hmacSha256Sign(derivedKeys.snapshotMacHmacKey, [
            ltHash,
            intToBytes(8, version),
            TEXT_ENCODER.encode(collectionName)
        ])
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async generatePatchMac(
        keyData: Uint8Array,
        snapshotMac: Uint8Array,
        valueMacs: readonly Uint8Array[],
        version: number,
        collectionName: string
    ): Promise<Uint8Array> {
        const derivedKeys = this.deriveKeys(keyData)
        return hmacSha256Sign(derivedKeys.patchMacHmacKey, [
            snapshotMac,
            ...valueMacs,
            intToBytes(8, version),
            TEXT_ENCODER.encode(collectionName)
        ])
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async ltHashAdd(
        base: Uint8Array,
        addValues: readonly Uint8Array[]
    ): Promise<Uint8Array> {
        return this.ltHashApply(base, addValues, (left, right) => left + right)
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async ltHashSubtract(
        base: Uint8Array,
        removeValues: readonly Uint8Array[]
    ): Promise<Uint8Array> {
        return this.ltHashApply(base, removeValues, (left, right) => left - right)
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

    private ltHashApply(
        base: Uint8Array,
        values: readonly Uint8Array[],
        combine: (left: number, right: number) => number
    ): Uint8Array {
        if (values.length === 0) {
            return base
        }
        const expandedValues = values.map((value) =>
            hkdf(
                value,
                null,
                WA_APP_STATE_KDF_INFO.PATCH_INTEGRITY,
                APP_STATE_EMPTY_LT_HASH.byteLength
            )
        )
        const out = new Uint8Array(base.byteLength)
        this.pointwiseWithOverflow(base, expandedValues[0], combine, out)
        for (let index = 1; index < expandedValues.length; index += 1) {
            this.pointwiseWithOverflow(out, expandedValues[index], combine, out)
        }
        return out
    }

    private pointwiseWithOverflow(
        left: Uint8Array,
        right: Uint8Array,
        combine: (leftValue: number, rightValue: number) => number,
        out: Uint8Array = new Uint8Array(left.byteLength)
    ): Uint8Array {
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
            const value = combine(
                leftView.getUint16(offset, true),
                rightView.getUint16(offset, true)
            )
            outView.setUint16(offset, value & 0xffff, true)
        }
        return out
    }

    private generateAssociatedData(operation: number, keyId: Uint8Array): Uint8Array {
        if (
            operation !== proto.SyncdMutation.SyncdOperation.SET &&
            operation !== proto.SyncdMutation.SyncdOperation.REMOVE
        ) {
            throw new Error(`unsupported syncd operation ${operation}`)
        }
        const out = new Uint8Array(1 + keyId.byteLength)
        out[0] = operation + 1
        out.set(keyId, 1)
        return out
    }

    private generateValueMac(
        valueMacHmacKey: Uint8Array,
        associatedData: Uint8Array,
        cipherWithIv: Uint8Array
    ): Uint8Array {
        const octetLength = new Uint8Array(APP_STATE_MAC_OCTET_LENGTH)
        octetLength[octetLength.length - 1] = associatedData.byteLength & 0xff
        const full = hmacSha512Sign(
            valueMacHmacKey,
            concatBytes([associatedData, cipherWithIv, octetLength])
        )
        return full.subarray(0, APP_STATE_VALUE_MAC_LENGTH)
    }

    private touchDerivedKeysCacheEntry(cacheKey: string, keys: WaAppStateDerivedKeys): void {
        if (this.derivedKeysCacheMaxSize <= 0) {
            return
        }
        setBoundedMapEntry(this.derivedKeysCache, cacheKey, keys, this.derivedKeysCacheMaxSize)
    }
}
