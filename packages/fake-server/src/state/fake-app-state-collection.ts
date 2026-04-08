/**
 * Per-collection app-state tracker for the fake server.
 *
 * Maintains the same view as the real WhatsApp Web server side: every
 * mutation observed for a collection bumps the version, advances the
 * collection's LTHash, and updates the running indexMac → valueMac map
 * used to compute the snapshot/patch MAC pair the lib verifies.
 *
 * Source:
 *   /deobfuscated/WAWebSyncd/WAWebSyncdLtHashUtils.js
 *   /deobfuscated/WAWebSyncd/WAWebSyncdMutationsCryptoUtils.js
 *
 * Cross-checked against `computeNextCollectionState` and
 * `assertPatchMacsMatch` in `src/appstate/WaAppStateSyncClient.ts`.
 */

import {
    APP_STATE_EMPTY_LT_HASH,
    FakeAppStateCrypto,
    type FakeAppStateMutationInput
} from '../protocol/signal/fake-app-state-crypto'
import { proto, type Proto } from '../transport/protos'

export interface FakeAppStateCollectionOptions {
    /** Collection name (`regular_low`, `regular_high`, ...). */
    readonly name: string
    /** 32-byte sync key id. */
    readonly keyId: Uint8Array
    /** 32-byte sync key data. */
    readonly keyData: Uint8Array
    readonly crypto?: FakeAppStateCrypto
}

export interface FakeAppStateMutationDescriptor {
    readonly operation: 'set' | 'remove'
    readonly index: string
    readonly value: Proto.ISyncActionValue | null
    /** Per-mutation `version` field embedded inside `SyncActionData`. */
    readonly version: number
}

interface InternalRecord {
    readonly indexMacHex: string
    readonly indexMac: Uint8Array
    readonly valueMac: Uint8Array
    readonly valueBlob: Uint8Array
}

/**
 * State machine + builder for app-state snapshots and patches a fake
 * server hands to a real `WaClient`.
 *
 * Usage:
 *
 *     const collection = new FakeAppStateCollection({ name, keyId, keyData })
 *     await collection.applyMutation({ operation: 'set', index: '...', value, version: 2 })
 *     const snapshot = await collection.encodeSnapshot()  // first sync round
 *     // -> hand the bytes to <iq><sync><collection><snapshot>...</snapshot>
 *     await collection.applyMutation(...)                 // queue another mutation
 *     const patch = await collection.encodePendingPatch() // next sync round
 *     // -> hand the bytes to <iq><sync><collection><patches><patch>...
 */
export class FakeAppStateCollection {
    public readonly name: string
    public readonly keyId: Uint8Array
    public readonly keyData: Uint8Array
    private readonly crypto: FakeAppStateCrypto
    /** Collection version the lib will see after the next snapshot/patch. */
    private currentVersion = 0
    private currentLtHash: Uint8Array = APP_STATE_EMPTY_LT_HASH
    private readonly recordsByIndexMacHex = new Map<string, InternalRecord>()
    private readonly pendingPatchMutations: {
        operation: 'set' | 'remove'
        record: InternalRecord
    }[] = []
    private hasUnflushedSnapshotChanges = false

    public constructor(options: FakeAppStateCollectionOptions) {
        this.name = options.name
        this.keyId = options.keyId
        this.keyData = options.keyData
        this.crypto = options.crypto ?? new FakeAppStateCrypto()
    }

    public get version(): number {
        return this.currentVersion
    }

    public get ltHash(): Uint8Array {
        return this.currentLtHash
    }

    /**
     * Encrypts the mutation, advances the collection's LTHash, and queues
     * it for the next snapshot/patch encoding. Mutations queued via
     * `applyMutation` are bundled into the next call to either
     * `encodeSnapshot()` (everything currently in the index map) or
     * `encodePendingPatch()` (only the not-yet-flushed pending list).
     */
    public async applyMutation(input: FakeAppStateMutationDescriptor): Promise<void> {
        const baseInput: FakeAppStateMutationInput = {
            operation: input.operation,
            keyId: this.keyId,
            keyData: this.keyData,
            index: input.index,
            value: input.value,
            version: input.version
        }
        const encrypted = await this.crypto.encryptMutation(baseInput)
        const indexMacHex = bytesToHex(encrypted.indexMac)

        const existing = this.recordsByIndexMacHex.get(indexMacHex)
        const removeValues: Uint8Array[] = []
        const addValues: Uint8Array[] = []
        if (existing) {
            removeValues.push(existing.valueMac)
            this.recordsByIndexMacHex.delete(indexMacHex)
        }
        if (input.operation === 'set') {
            const record: InternalRecord = {
                indexMacHex,
                indexMac: encrypted.indexMac,
                valueMac: encrypted.valueMac,
                valueBlob: encrypted.valueBlob
            }
            this.recordsByIndexMacHex.set(indexMacHex, record)
            addValues.push(encrypted.valueMac)
            this.pendingPatchMutations.push({ operation: 'set', record })
        } else {
            // REMOVE: still queue a record so the patch carries the entry
            // (the lib walks pending mutations, even removes — the encrypted
            // blob is the same shape but the lib treats it as a removal).
            this.pendingPatchMutations.push({
                operation: 'remove',
                record: {
                    indexMacHex,
                    indexMac: encrypted.indexMac,
                    valueMac: encrypted.valueMac,
                    valueBlob: encrypted.valueBlob
                }
            })
        }

        const nextHash = await this.applyLtHash(this.currentLtHash, addValues, removeValues)
        this.currentLtHash = nextHash
        this.hasUnflushedSnapshotChanges = true
    }

    /**
     * Encodes the **current full state** as a `SyncdSnapshot`. Bumps the
     * collection version by 1 and clears the pending patch queue (the
     * snapshot supersedes any queued patches).
     */
    public async encodeSnapshot(): Promise<Uint8Array> {
        this.currentVersion += 1
        const records: Proto.ISyncdRecord[] = []
        for (const record of this.recordsByIndexMacHex.values()) {
            records.push({
                index: { blob: record.indexMac },
                value: { blob: record.valueBlob },
                keyId: { id: this.keyId }
            })
        }
        const mac = await this.crypto.generateSnapshotMac(
            this.keyData,
            this.currentLtHash,
            this.currentVersion,
            this.name
        )
        this.pendingPatchMutations.length = 0
        this.hasUnflushedSnapshotChanges = false
        return proto.SyncdSnapshot.encode({
            version: { version: this.currentVersion },
            records,
            mac,
            keyId: { id: this.keyId }
        }).finish()
    }

    /**
     * Encodes the queued pending mutations as a `SyncdPatch`. Bumps the
     * collection version by 1, computes snapshot + patch MACs against
     * the post-patch LTHash, and clears the pending queue.
     */
    public async encodePendingPatch(): Promise<Uint8Array> {
        if (this.pendingPatchMutations.length === 0) {
            throw new Error(`fake app-state collection ${this.name}: no pending mutations to encode`)
        }
        this.currentVersion += 1
        const patchVersion = this.currentVersion
        const mutations: Proto.ISyncdMutation[] = []
        const valueMacs: Uint8Array[] = []
        for (const pending of this.pendingPatchMutations) {
            mutations.push({
                operation:
                    pending.operation === 'set'
                        ? proto.SyncdMutation.SyncdOperation.SET
                        : proto.SyncdMutation.SyncdOperation.REMOVE,
                record: {
                    keyId: { id: this.keyId },
                    index: { blob: pending.record.indexMac },
                    value: { blob: pending.record.valueBlob }
                }
            })
            valueMacs.push(pending.record.valueMac)
        }
        const snapshotMac = await this.crypto.generateSnapshotMac(
            this.keyData,
            this.currentLtHash,
            patchVersion,
            this.name
        )
        const patchMac = await this.crypto.generatePatchMac(
            this.keyData,
            snapshotMac,
            valueMacs,
            patchVersion,
            this.name
        )
        this.pendingPatchMutations.length = 0
        this.hasUnflushedSnapshotChanges = false
        return proto.SyncdPatch.encode({
            version: { version: patchVersion },
            mutations,
            snapshotMac,
            patchMac,
            keyId: { id: this.keyId }
        }).finish()
    }

    public hasPending(): boolean {
        return this.pendingPatchMutations.length > 0 || this.hasUnflushedSnapshotChanges
    }

    private async applyLtHash(
        base: Uint8Array,
        addValues: readonly Uint8Array[],
        removeValues: readonly Uint8Array[]
    ): Promise<Uint8Array> {
        const afterRemove = await this.crypto.ltHashSubtract(base, removeValues)
        return this.crypto.ltHashAdd(afterRemove, addValues)
    }
}

function bytesToHex(bytes: Uint8Array): string {
    let out = ''
    for (let index = 0; index < bytes.byteLength; index += 1) {
        const value = bytes[index]
        out += value < 16 ? `0${value.toString(16)}` : value.toString(16)
    }
    return out
}
