import { signalAddressKey } from '@protocol/jid'
import type { SignalAddress, SignalSessionRecord } from '@signal/types'
import type { WaSessionStore as WaSessionStoreContract } from '@store/contracts/session.store'
import { resolveOptionalPositive, resolvePositive } from '@util/coercion'
import {
    createIdleExpiryIndex,
    createPeriodicCleanup,
    type IdleExpiryIndex,
    type PeriodicCleanupHandle,
    setBoundedMapEntry
} from '@util/collections'

const DEFAULT_MAX_SESSIONS = 8_192

export interface WaSessionMemoryStoreOptions {
    readonly maxSessions?: number
    /**
     * Evicts a session once it has been neither read nor written for this
     * many milliseconds; a periodic sweep reclaims it. Unset keeps sessions
     * until `maxSessions` evicts them.
     *
     * Meant for a cache in front of a persistent backend (the `cacheLayer`
     * L1), where an evicted entry is simply re-read. On a store that is the
     * source of truth, expiry deletes live Signal sessions and the next
     * message to that peer has to establish a new one.
     */
    readonly ttlMs?: number
}

export class WaSessionMemoryStore implements WaSessionStoreContract {
    private readonly signalSessions: Map<string, SignalSessionRecord>
    private readonly maxSessions: number
    private readonly idle: IdleExpiryIndex<string> | null
    private readonly cleanup: PeriodicCleanupHandle | null

    public constructor(options: WaSessionMemoryStoreOptions = {}) {
        this.signalSessions = new Map()
        this.maxSessions = resolvePositive(
            options.maxSessions,
            DEFAULT_MAX_SESSIONS,
            'WaSessionMemoryStoreOptions.maxSessions'
        )
        const ttlMs = resolveOptionalPositive(options.ttlMs, 'WaSessionMemoryStoreOptions.ttlMs')
        this.idle = ttlMs === undefined ? null : createIdleExpiryIndex(ttlMs)
        this.cleanup =
            ttlMs === undefined
                ? null
                : createPeriodicCleanup(ttlMs, () => {
                      void this.cleanupExpired(Date.now())
                  })
    }

    public async hasSession(address: SignalAddress): Promise<boolean> {
        const key = signalAddressKey(address)
        const found = this.signalSessions.has(key)
        if (found) this.idle?.touch(key, Date.now())
        return found
    }

    public async hasSessions(addresses: readonly SignalAddress[]): Promise<readonly boolean[]> {
        const idle = this.idle
        const nowMs = idle === null ? 0 : Date.now()
        const result = new Array<boolean>(addresses.length)
        for (let i = 0; i < addresses.length; i += 1) {
            const key = signalAddressKey(addresses[i])
            const found = this.signalSessions.has(key)
            if (found) idle?.touch(key, nowMs)
            result[i] = found
        }
        return result
    }

    public async getSession(address: SignalAddress): Promise<SignalSessionRecord | null> {
        const key = signalAddressKey(address)
        const session = this.signalSessions.get(key)
        if (session === undefined) return null
        this.idle?.touch(key, Date.now())
        return session
    }

    public async getSessionsBatch(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (SignalSessionRecord | null)[]> {
        const idle = this.idle
        const nowMs = idle === null ? 0 : Date.now()
        const result = new Array<SignalSessionRecord | null>(addresses.length)
        for (let i = 0; i < addresses.length; i += 1) {
            const key = signalAddressKey(addresses[i])
            const session = this.signalSessions.get(key)
            if (session !== undefined) idle?.touch(key, nowMs)
            result[i] = session ?? null
        }
        return result
    }

    public async setSession(address: SignalAddress, session: SignalSessionRecord): Promise<void> {
        const key = signalAddressKey(address)
        setBoundedMapEntry(this.signalSessions, key, session, this.maxSessions, this.idle?.delete)
        this.idle?.touch(key, Date.now())
    }

    public async setSessionsBatch(
        entries: readonly {
            readonly address: SignalAddress
            readonly session: SignalSessionRecord
        }[]
    ): Promise<void> {
        const idle = this.idle
        const nowMs = idle === null ? 0 : Date.now()
        for (let index = 0; index < entries.length; index += 1) {
            const entry = entries[index]
            const key = signalAddressKey(entry.address)
            setBoundedMapEntry(
                this.signalSessions,
                key,
                entry.session,
                this.maxSessions,
                idle?.delete
            )
            idle?.touch(key, nowMs)
        }
    }

    public async deleteSession(address: SignalAddress): Promise<void> {
        const key = signalAddressKey(address)
        this.signalSessions.delete(key)
        this.idle?.delete(key)
    }

    public async clear(): Promise<void> {
        this.signalSessions.clear()
        this.idle?.clear()
    }

    /**
     * Evicts the sessions idle for at least `ttlMs` as of `nowMs` and returns
     * how many were evicted. Runs on a timer when `ttlMs` is set; a no-op
     * otherwise.
     */
    public async cleanupExpired(nowMs: number): Promise<number> {
        if (this.idle === null) return 0
        return this.idle.sweep(nowMs, (key) => {
            this.signalSessions.delete(key)
        })
    }

    public async destroy(): Promise<void> {
        this.cleanup?.destroy()
        await this.clear()
    }
}
