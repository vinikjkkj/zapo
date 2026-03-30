import type { SignalAddress, SignalSessionRecord } from '@signal/types'

export interface WaSessionStore {
    hasSession(address: SignalAddress): Promise<boolean>
    hasSessions(addresses: readonly SignalAddress[]): Promise<readonly boolean[]>
    getSession(address: SignalAddress): Promise<SignalSessionRecord | null>
    getSessionsBatch(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (SignalSessionRecord | null)[]>
    setSession(address: SignalAddress, session: SignalSessionRecord): Promise<void>
    setSessionsBatch(
        entries: readonly {
            readonly address: SignalAddress
            readonly session: SignalSessionRecord
        }[]
    ): Promise<void>
    deleteSession(address: SignalAddress): Promise<void>
    clear(): Promise<void>
}
