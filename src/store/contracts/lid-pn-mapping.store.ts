/**
 * Persistent one-to-one phone-number/LID mapping used to canonicalize Signal
 * addresses. Values are bare user components; one mapping applies to every
 * device of the account.
 */
export interface WaLidPnMappingStore {
    /** Returns the current LID user component for a PN user component. */
    getLidUser(pnUser: string): Promise<string | null>
    /** Returns the PN user component that currently owns a LID user component. */
    getPnUser(lidUser: string): Promise<string | null>
    /** Replaces any mapping that currently owns either user component. */
    setLidUser(pnUser: string, lidUser: string): Promise<void>
    /** Removes every mapping in the current store session. */
    clear(): Promise<void>
}
