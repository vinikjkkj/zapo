import type { KyberPreKeyRecord, PreKeyRecord } from '@signal/types'

/**
 * Post-quantum (ML-KEM-1024) pre-keys, kept in the same domain as the classic
 * ones. A key carries a signature and a `lastResort` flag; the last-resort key
 * is never consumed. `getKyberPreKeyById` serves both kinds.
 */
export interface WaPqPreKeyStore {
    putKyberPreKeys(records: readonly KyberPreKeyRecord[]): Promise<void>
    getKyberPreKeyById(keyId: number): Promise<KyberPreKeyRecord | null>
    /** Removes and returns a one-time key; a last-resort key is returned and kept. */
    consumeKyberPreKeyById(keyId: number): Promise<KyberPreKeyRecord | null>
    /** Deletes keys by id, last-resort ones included (rollback of a failed upload). */
    removeKyberPreKeys(keyIds: readonly number[]): Promise<void>
    /** The last-resort key with the highest id, or `null` when none is stored. */
    getLatestKyberLastResortKey(): Promise<KyberPreKeyRecord | null>
    /**
     * Reserves `count` consecutive ids from the persisted counter (wrapping at
     * 16777215) and returns the first one.
     */
    reserveKyberPreKeyIds(count: number): Promise<number>
    /** Whether the post-quantum key set was fully accepted by the server. */
    getPqMigrated(): Promise<boolean>
    setPqMigrated(value: boolean): Promise<void>
}

/**
 * The post-quantum methods are optional so a store written before they existed
 * still satisfies the contract; without them the client stays on classic Signal.
 */
export interface WaPreKeyStore extends Partial<WaPqPreKeyStore> {
    putPreKey(record: PreKeyRecord): Promise<void>
    getOrGenPreKeys(
        count: number,
        generator: (keyId: number) => PreKeyRecord | Promise<PreKeyRecord>
    ): Promise<readonly PreKeyRecord[]>
    getPreKeyById(keyId: number): Promise<PreKeyRecord | null>
    getPreKeysById(keyIds: readonly number[]): Promise<readonly (PreKeyRecord | null)[]>
    consumePreKeyById(keyId: number): Promise<PreKeyRecord | null>
    getOrGenSinglePreKey(
        generator: (keyId: number) => PreKeyRecord | Promise<PreKeyRecord>
    ): Promise<PreKeyRecord>
    markKeyAsUploaded(keyId: number): Promise<void>
    setServerHasPreKeys(value: boolean): Promise<void>
    getServerHasPreKeys(): Promise<boolean>
    clear(): Promise<void>
}

/** Whether `store` implements every post-quantum method. */
export function hasPqPreKeyStore(store: WaPreKeyStore): store is WaPreKeyStore & WaPqPreKeyStore {
    return (
        typeof store.putKyberPreKeys === 'function' &&
        typeof store.getKyberPreKeyById === 'function' &&
        typeof store.consumeKyberPreKeyById === 'function' &&
        typeof store.removeKyberPreKeys === 'function' &&
        typeof store.getLatestKyberLastResortKey === 'function' &&
        typeof store.reserveKyberPreKeyIds === 'function' &&
        typeof store.getPqMigrated === 'function' &&
        typeof store.setPqMigrated === 'function'
    )
}
