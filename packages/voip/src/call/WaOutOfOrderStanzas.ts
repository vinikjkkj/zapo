import { setBoundedMapEntry } from 'zapo-js/util'

/** How long a terminate that found no call waits for its offer, and how many are kept. */
const TERMINATED_BEFORE_OFFER_TTL_MS = 30_000
const MAX_TERMINATED_BEFORE_OFFER = 64

/** How many ended calls are remembered, so their late terminates are dropped quietly. */
const MAX_RECENTLY_ENDED_CALLS = 64

/** How many call keys that arrived before their call are held at once. */
const MAX_PENDING_CALL_KEYS = 8

/** A call key an `<enc_rekey>` delivered before its call existed. */
export interface PendingCallKey {
    readonly callKey: Uint8Array
    readonly transactionId: number | null
}

/** Call stanzas that arrived out of order with their call: held, or remembered to be dropped. */
export class WaOutOfOrderStanzas {
    /**
     * Call ids a `<terminate>` ended before their offer made a call, with when that
     * expires: the offer can still be decrypting when the terminate lands.
     */
    private readonly terminatedBeforeOffer = new Map<string, number>()
    /** Group call keys that arrived ahead of their call, by call id. */
    private readonly pendingCallKeys = new Map<string, PendingCallKey>()
    /**
     * Calls that ended here: a group call left goes on, and the server's terminates for it
     * must neither be held against a later offer nor reported.
     */
    private readonly recentlyEndedCalls = new Map<string, true>()

    holdTerminate(callId: string): void {
        setBoundedMapEntry(
            this.terminatedBeforeOffer,
            callId,
            Date.now() + TERMINATED_BEFORE_OFFER_TTL_MS,
            MAX_TERMINATED_BEFORE_OFFER
        )
    }

    /** Whether a terminate already ended this call before its offer was handled; consumes it. */
    takeHeldTerminate(callId: string): boolean {
        const expiresAt = this.terminatedBeforeOffer.get(callId)
        if (expiresAt === undefined) return false
        this.terminatedBeforeOffer.delete(callId)
        return expiresAt > Date.now()
    }

    holdCallKey(callId: string, key: PendingCallKey): void {
        setBoundedMapEntry(this.pendingCallKeys, callId, key, MAX_PENDING_CALL_KEYS)
    }

    takeCallKey(callId: string): PendingCallKey | undefined {
        const pending = this.pendingCallKeys.get(callId)
        if (!pending) return undefined
        this.pendingCallKeys.delete(callId)
        return pending
    }

    rememberEnded(callId: string): void {
        setBoundedMapEntry(this.recentlyEndedCalls, callId, true, MAX_RECENTLY_ENDED_CALLS)
    }

    endedHere(callId: string): boolean {
        return this.recentlyEndedCalls.has(callId)
    }

    clear(): void {
        this.terminatedBeforeOffer.clear()
        this.pendingCallKeys.clear()
        this.recentlyEndedCalls.clear()
    }
}
