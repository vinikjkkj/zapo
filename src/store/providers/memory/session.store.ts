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
    private readonly signalSessions: Map<string, SignalSessionRecord>
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
        return this.signalSessions.has(signalAddressKey(address))
    }

    public async hasSessions(addresses: readonly SignalAddress[]): Promise<readonly boolean[]> {
        const result = new Array<boolean>(addresses.length)
        for (let i = 0; i < addresses.length; i += 1) {
            result[i] = this.signalSessions.has(signalAddressKey(addresses[i]))
        }
        return result
    }

    public async getSession(address: SignalAddress): Promise<SignalSessionRecord | null> {
        return this.signalSessions.get(signalAddressKey(address)) ?? null
    }

    public async getSessionsBatch(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (SignalSessionRecord | null)[]> {
        const result = new Array<SignalSessionRecord | null>(addresses.length)
        for (let i = 0; i < addresses.length; i += 1) {
            result[i] = this.signalSessions.get(signalAddressKey(addresses[i])) ?? null
        }
        return result
    }

    public async setSession(address: SignalAddress, session: SignalSessionRecord): Promise<void> {
        setBoundedMapEntry(
            this.signalSessions,
            signalAddressKey(address),
            session,
            this.maxSessions
        )
    }

    public async setSessionsBatch(
        entries: readonly {
            readonly address: SignalAddress
            readonly session: SignalSessionRecord
        }[]
    ): Promise<void> {
        for (let index = 0; index < entries.length; index += 1) {
            const entry = entries[index]
            setBoundedMapEntry(
                this.signalSessions,
                signalAddressKey(entry.address),
                entry.session,
                this.maxSessions
            )
        }
    }

    public async deleteSession(address: SignalAddress): Promise<void> {
        this.signalSessions.delete(signalAddressKey(address))
    }

    public async clear(): Promise<void> {
        this.signalSessions.clear()
    }
}
