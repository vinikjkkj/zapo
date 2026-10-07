import { signalAddressKey } from '@protocol/jid'
import type { SignalAddress, SignalSessionRecord } from '@signal/types'
import type { WaSessionStore as WaSessionStoreContract } from '@store/contracts/session.store'
import { resolvePositive } from '@util/coercion'
import { setBoundedMapEntry } from '@util/collections'

const DEFAULT_MAX_SESSIONS = 8_192

export interface WaSessionMemoryStoreOptions {
    readonly maxSessions?: number
}

export class WaSessionMemoryStore implements WaSessionStoreContract {
    protected readonly signalSessions: Map<string, SignalSessionRecord>
    private readonly maxSessions: number

    public constructor(options: WaSessionMemoryStoreOptions = {}) {
        this.signalSessions = new Map()
        this.maxSessions = resolvePositive(
            options.maxSessions,
            DEFAULT_MAX_SESSIONS,
            'WaSessionMemoryStoreOptions.maxSessions'
        )
    }

    public async hasSession(address: SignalAddress): Promise<boolean> {
        const key = signalAddressKey(address)
        if (!this.signalSessions.has(key)) return false
        this.onEntryAccess(key)
        return true
    }

    public async hasSessions(addresses: readonly SignalAddress[]): Promise<readonly boolean[]> {
        const result = new Array<boolean>(addresses.length)
        for (let i = 0; i < addresses.length; i += 1) {
            const key = signalAddressKey(addresses[i])
            const found = this.signalSessions.has(key)
            if (found) this.onEntryAccess(key)
            result[i] = found
        }
        return result
    }

    public async getSession(address: SignalAddress): Promise<SignalSessionRecord | null> {
        const key = signalAddressKey(address)
        const session = this.signalSessions.get(key)
        if (session === undefined) return null
        this.onEntryAccess(key)
        return session
    }

    public async getSessionsBatch(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (SignalSessionRecord | null)[]> {
        const result = new Array<SignalSessionRecord | null>(addresses.length)
        for (let i = 0; i < addresses.length; i += 1) {
            const key = signalAddressKey(addresses[i])
            const session = this.signalSessions.get(key)
            if (session === undefined) {
                result[i] = null
            } else {
                this.onEntryAccess(key)
                result[i] = session
            }
        }
        return result
    }

    public async setSession(address: SignalAddress, session: SignalSessionRecord): Promise<void> {
        const key = signalAddressKey(address)
        setBoundedMapEntry(this.signalSessions, key, session, this.maxSessions, this.onEvict)
        this.onEntryAccess(key)
    }

    public async setSessionsBatch(
        entries: readonly {
            readonly address: SignalAddress
            readonly session: SignalSessionRecord
        }[]
    ): Promise<void> {
        for (let index = 0; index < entries.length; index += 1) {
            const entry = entries[index]
            const key = signalAddressKey(entry.address)
            setBoundedMapEntry(
                this.signalSessions,
                key,
                entry.session,
                this.maxSessions,
                this.onEvict
            )
            this.onEntryAccess(key)
        }
    }

    public async deleteSession(address: SignalAddress): Promise<void> {
        const key = signalAddressKey(address)
        if (this.signalSessions.delete(key)) this.onEntryRemove(key)
    }

    public async clear(): Promise<void> {
        this.signalSessions.clear()
        this.onEntriesClear()
    }

    /** Runs with the key of every read hit and write. No-op unless a subclass tracks access. */
    protected onEntryAccess(key: string): void {}

    /** Runs with the key of every deleted or cap-evicted entry. */
    protected onEntryRemove(key: string): void {}

    protected onEntriesClear(): void {}

    private readonly onEvict = (key: string): void => this.onEntryRemove(key)
}
