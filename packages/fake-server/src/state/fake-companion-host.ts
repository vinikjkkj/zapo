/** Per-session account state for a mobile primary hosting companion devices. */

import { proto } from '../transport/protos'

/** Identity of the mobile primary that owns this session's account. */
export interface FakeMobilePrimaryIdentity {
    /** Phone number, digits only – the user part of every device jid. */
    readonly username: string
    /** `<phone>@s.whatsapp.net` – the primary itself, always device 0. */
    readonly jid: string
}

export interface FakeLinkedCompanion {
    readonly deviceJid: string
    readonly deviceId: number
    /** Pairing ref the companion advertised, echoed by the primary's upload. */
    readonly ref: string
    /** ADV key index the primary allocated, decoded from the signed identity. */
    readonly keyIndex: number
    readonly deviceIdentityBytes: Uint8Array
    readonly linkedAtSeconds: number
}

export interface FakePublishedKeyIndexList {
    readonly bytes: Uint8Array
    readonly timestampSeconds: number
    /** Indexes the primary declared valid, decoded from the signed list. */
    readonly validIndexes: readonly number[]
    readonly currentIndex: number
}

export class FakeCompanionHostState {
    private primaryIdentity: FakeMobilePrimaryIdentity | null = null
    private readonly companions = new Map<string, FakeLinkedCompanion>()
    private readonly reservedDeviceIds = new Set<number>()
    private keyIndexList: FakePublishedKeyIndexList | null = null
    private readonly linkListeners = new Set<(companion: FakeLinkedCompanion) => void>()
    private readonly revokeListeners = new Set<(deviceJids: readonly string[]) => void>()

    /** The mobile primary bound to this session, or `null` for a web session. */
    public get primary(): FakeMobilePrimaryIdentity | null {
        return this.primaryIdentity
    }

    /**
     * Records the primary at login. The first account to bind owns the session
     * for good: a later login under a different number would otherwise mint
     * device jids for one account while the companions of another are still
     * tracked here.
     */
    public bindPrimary(identity: FakeMobilePrimaryIdentity): void {
        if (this.primaryIdentity) {
            return
        }
        this.primaryIdentity = identity
    }

    /** Companions linked from this account, in link order. */
    public linkedCompanions(): readonly FakeLinkedCompanion[] {
        return [...this.companions.values()]
    }

    /** Last key-index list the primary published, or `null` if it never did. */
    public publishedKeyIndexList(): FakePublishedKeyIndexList | null {
        return this.keyIndexList
    }

    /**
     * Reserves the next free device slot. The primary owns device 0, so
     * companions start at 1 and a revoked slot is reused only once no live
     * companion holds it. The slot is held from here until the link is either
     * recorded or released, because a link spans an await and two overlapping
     * pairings would otherwise be handed the same jid.
     */
    public allocateDeviceId(): number {
        const taken = new Set<number>([0, ...this.reservedDeviceIds])
        for (const companion of this.companions.values()) {
            taken.add(companion.deviceId)
        }
        let candidate = 1
        while (taken.has(candidate)) {
            candidate += 1
        }
        this.reservedDeviceIds.add(candidate)
        return candidate
    }

    /** Frees a slot whose link never completed. */
    public releaseDeviceId(deviceId: number): void {
        this.reservedDeviceIds.delete(deviceId)
    }

    public recordCompanion(companion: FakeLinkedCompanion): void {
        this.reservedDeviceIds.delete(companion.deviceId)
        this.companions.set(companion.deviceJid, companion)
        for (const listener of this.linkListeners) {
            try {
                listener(companion)
            } catch (error) {
                void error
            }
        }
    }

    /**
     * Drops companions and notifies listeners. Returns the jids actually
     * removed, so a revoke of an untracked device is observable as a no-op.
     */
    public removeCompanions(deviceJids: readonly string[]): readonly string[] {
        const removed: string[] = []
        for (const deviceJid of deviceJids) {
            if (this.companions.delete(deviceJid)) {
                removed.push(deviceJid)
            }
        }
        if (removed.length > 0) {
            for (const listener of this.revokeListeners) {
                try {
                    listener(removed)
                } catch (error) {
                    void error
                }
            }
        }
        return removed
    }

    public removeAllCompanions(): readonly string[] {
        return this.removeCompanions([...this.companions.keys()])
    }

    public recordKeyIndexList(bytes: Uint8Array, timestampSeconds: number): void {
        const decoded = decodeKeyIndexList(bytes)
        this.keyIndexList = {
            bytes,
            timestampSeconds,
            validIndexes: decoded.validIndexes,
            currentIndex: decoded.currentIndex
        }
    }

    public onCompanionLinked(listener: (companion: FakeLinkedCompanion) => void): () => void {
        this.linkListeners.add(listener)
        return () => {
            this.linkListeners.delete(listener)
        }
    }

    public onCompanionsRevoked(listener: (deviceJids: readonly string[]) => void): () => void {
        this.revokeListeners.add(listener)
        return () => {
            this.revokeListeners.delete(listener)
        }
    }
}

/**
 * Reads the ADV key index out of the `ADVSignedDeviceIdentityHMAC` the primary
 * uploaded. Returns 0 when the payload does not decode, which keeps a
 * malformed upload observable in the recorded companion instead of throwing
 * inside the IQ handler.
 */
export function readCompanionKeyIndex(deviceIdentityBytes: Uint8Array): number {
    try {
        const hmacWrapper = proto.ADVSignedDeviceIdentityHMAC.decode(deviceIdentityBytes)
        if (!hmacWrapper.details) {
            return 0
        }
        const signed = proto.ADVSignedDeviceIdentity.decode(hmacWrapper.details)
        if (!signed.details) {
            return 0
        }
        return proto.ADVDeviceIdentity.decode(signed.details).keyIndex ?? 0
    } catch (error) {
        void error
        return 0
    }
}

function decodeKeyIndexList(bytes: Uint8Array): {
    readonly validIndexes: readonly number[]
    readonly currentIndex: number
} {
    try {
        const signed = proto.ADVSignedKeyIndexList.decode(bytes)
        if (!signed.details) {
            return { validIndexes: [], currentIndex: 0 }
        }
        const details = proto.ADVKeyIndexList.decode(signed.details)
        return {
            validIndexes: details.validIndexes ?? [],
            currentIndex: details.currentIndex ?? 0
        }
    } catch (error) {
        void error
        return { validIndexes: [], currentIndex: 0 }
    }
}
