import type { PreKeyRecord } from '@signal/types'
import type { WaPreKeyStore as WaPreKeyStoreContract } from '@store/contracts/pre-key.store'
import { resolvePositive } from '@util/coercion'
import { setBoundedMapEntry } from '@util/collections'

const DEFAULT_MAX_PRE_KEYS = 4_096

export interface WaPreKeyMemoryStoreOptions {
    readonly maxPreKeys?: number
}

export class WaPreKeyMemoryStore implements WaPreKeyStoreContract {
    private readonly preKeys: Map<number, PreKeyRecord>
    private readonly uploadedPreKeys: Set<number>
    private serverHasPreKeys: boolean
    private nextPreKeyId: number
    private readonly maxPreKeys: number

    public constructor(options: WaPreKeyMemoryStoreOptions = {}) {
        this.preKeys = new Map()
        this.uploadedPreKeys = new Set()
        this.serverHasPreKeys = false
        this.nextPreKeyId = 1
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

    public async clear(): Promise<void> {
        this.preKeys.clear()
        this.uploadedPreKeys.clear()
        this.serverHasPreKeys = false
        this.nextPreKeyId = 1
    }
}
