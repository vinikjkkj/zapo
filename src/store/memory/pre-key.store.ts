import { SIGNAL_KYBER_PREKEY_ID_BORDER } from '@signal/constants'
import type { KyberPreKeyRecord, PreKeyRecord } from '@signal/types'
import type {
    WaPqPreKeyStore,
    WaPreKeyStore as WaPreKeyStoreContract
} from '@store/contracts/pre-key.store'
import { resolvePositive } from '@util/coercion'
import { setBoundedMapEntry } from '@util/collections'

const DEFAULT_MAX_PRE_KEYS = 4_096

export interface WaPreKeyMemoryStoreOptions {
    readonly maxPreKeys?: number
}

export class WaPreKeyMemoryStore implements WaPreKeyStoreContract, WaPqPreKeyStore {
    private readonly preKeys: Map<number, PreKeyRecord>
    private readonly uploadedPreKeys: Set<number>
    private readonly kyberPreKeys: Map<number, KyberPreKeyRecord>
    private serverHasPreKeys: boolean
    private nextPreKeyId: number
    private nextKyberPreKeyId: number
    private pqMigrated: boolean
    private readonly maxPreKeys: number

    public constructor(options: WaPreKeyMemoryStoreOptions = {}) {
        this.preKeys = new Map()
        this.uploadedPreKeys = new Set()
        this.kyberPreKeys = new Map()
        this.serverHasPreKeys = false
        this.nextPreKeyId = 1
        this.nextKyberPreKeyId = 1
        this.pqMigrated = false
        this.maxPreKeys = resolvePositive(
            options.maxPreKeys,
            DEFAULT_MAX_PRE_KEYS,
            'WaPreKeyMemoryStoreOptions.maxPreKeys'
        )
    }

    public async putPreKey(record: PreKeyRecord): Promise<void> {
        setBoundedMapEntry(this.preKeys, record.keyId, record, this.maxPreKeys, (keyId) => {
            this.uploadedPreKeys.delete(keyId)
        })
        if (record.keyId >= this.nextPreKeyId) {
            this.nextPreKeyId = record.keyId + 1
        }
    }

    public async getOrGenPreKeys(
        count: number,
        generator: (keyId: number) => PreKeyRecord | Promise<PreKeyRecord>
    ): Promise<readonly PreKeyRecord[]> {
        if (!Number.isSafeInteger(count) || count <= 0) {
            throw new Error(`invalid prekey count: ${count}`)
        }

        const available: PreKeyRecord[] = []
        const availableKeyIds: number[] = []
        for (const keyId of this.preKeys.keys()) {
            if (!this.uploadedPreKeys.has(keyId)) {
                availableKeyIds.push(keyId)
            }
        }
        availableKeyIds.sort((left, right) => left - right)
        for (let index = 0; index < availableKeyIds.length; index += 1) {
            const keyId = availableKeyIds[index]
            const record = this.preKeys.get(keyId)
            if (!record) {
                continue
            }
            available.push(record)
            if (available.length >= count) {
                return available
            }
        }

        while (available.length < count) {
            const record = await generator(this.nextPreKeyId++)
            setBoundedMapEntry(this.preKeys, record.keyId, record, this.maxPreKeys, (keyId) => {
                this.uploadedPreKeys.delete(keyId)
            })
            available.push(record)
        }
        return available
    }

    public async getPreKeyById(keyId: number): Promise<PreKeyRecord | null> {
        return this.preKeys.get(keyId) ?? null
    }

    public async getPreKeysById(
        keyIds: readonly number[]
    ): Promise<readonly (PreKeyRecord | null)[]> {
        const result = new Array<PreKeyRecord | null>(keyIds.length)
        for (let i = 0; i < keyIds.length; i += 1) {
            result[i] = this.preKeys.get(keyIds[i]) ?? null
        }
        return result
    }

    public async consumePreKeyById(keyId: number): Promise<PreKeyRecord | null> {
        const record = this.preKeys.get(keyId) ?? null
        if (!record) {
            return null
        }
        this.preKeys.delete(keyId)
        this.uploadedPreKeys.delete(keyId)
        return record
    }

    public async getOrGenSinglePreKey(
        generator: (keyId: number) => PreKeyRecord | Promise<PreKeyRecord>
    ): Promise<PreKeyRecord> {
        const preKeys = await this.getOrGenPreKeys(1, generator)
        return preKeys[0]
    }

    public async markKeyAsUploaded(keyId: number): Promise<void> {
        if (keyId < 0 || keyId >= this.nextPreKeyId) {
            throw new Error(`prekey ${keyId} is out of boundary`)
        }
        for (const candidate of this.preKeys.keys()) {
            if (candidate <= keyId) {
                this.uploadedPreKeys.add(candidate)
            }
        }
    }

    public async setServerHasPreKeys(value: boolean): Promise<void> {
        this.serverHasPreKeys = value
    }

    public async getServerHasPreKeys(): Promise<boolean> {
        return this.serverHasPreKeys
    }

    public async putKyberPreKeys(records: readonly KyberPreKeyRecord[]): Promise<void> {
        for (const record of records) {
            setBoundedMapEntry(this.kyberPreKeys, record.keyId, record, this.maxPreKeys)
        }
    }

    public async getKyberPreKeyById(keyId: number): Promise<KyberPreKeyRecord | null> {
        return this.kyberPreKeys.get(keyId) ?? null
    }

    public async consumeKyberPreKeyById(keyId: number): Promise<KyberPreKeyRecord | null> {
        const record = this.kyberPreKeys.get(keyId) ?? null
        if (!record) {
            return null
        }
        if (record.lastResort !== true) {
            this.kyberPreKeys.delete(keyId)
        }
        return record
    }

    public async removeKyberPreKeys(keyIds: readonly number[]): Promise<void> {
        for (let index = 0; index < keyIds.length; index += 1) {
            this.kyberPreKeys.delete(keyIds[index])
        }
    }

    public async getLatestKyberLastResortKey(): Promise<KyberPreKeyRecord | null> {
        let latest: KyberPreKeyRecord | null = null
        for (const record of this.kyberPreKeys.values()) {
            if (record.lastResort === true && (latest === null || record.keyId > latest.keyId)) {
                latest = record
            }
        }
        return latest
    }

    public async reserveKyberPreKeyIds(count: number): Promise<number> {
        if (!Number.isSafeInteger(count) || count <= 0) {
            throw new Error(`invalid kyber prekey count: ${count}`)
        }
        const first = this.nextKyberPreKeyId
        this.nextKyberPreKeyId = (first + count) % SIGNAL_KYBER_PREKEY_ID_BORDER
        return first
    }

    public async getPqMigrated(): Promise<boolean> {
        return this.pqMigrated
    }

    public async setPqMigrated(value: boolean): Promise<void> {
        this.pqMigrated = value
    }

    public async clear(): Promise<void> {
        this.preKeys.clear()
        this.uploadedPreKeys.clear()
        this.kyberPreKeys.clear()
        this.serverHasPreKeys = false
        this.nextPreKeyId = 1
        this.nextKyberPreKeyId = 1
        this.pqMigrated = false
    }
}
