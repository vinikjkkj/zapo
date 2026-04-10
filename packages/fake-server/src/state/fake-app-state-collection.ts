/** In-memory app-state collection tracker (version/LTHash + patch queue). */

import {
    APP_STATE_EMPTY_LT_HASH,
    FakeAppStateCrypto,
    type FakeAppStateMutationInput
} from '../protocol/signal/fake-app-state-crypto'
import { proto, type Proto } from '../transport/protos'

export interface FakeAppStateCollectionOptions {
    readonly name: string
    readonly keyId: Uint8Array
    readonly keyData: Uint8Array
    readonly crypto?: FakeAppStateCrypto
}

export interface FakeAppStateMutationDescriptor {
    readonly operation: 'set' | 'remove'
    readonly index: string
    readonly value: Proto.ISyncActionValue | null
    readonly version: number
}

interface InternalRecord {
    readonly indexMacHex: string
    readonly indexMac: Uint8Array
    readonly valueMac: Uint8Array
    readonly valueBlob: Uint8Array
}

export class FakeAppStateCollection {
    public readonly name: string
    public readonly keyId: Uint8Array
    public readonly keyData: Uint8Array
    private readonly crypto: FakeAppStateCrypto
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
