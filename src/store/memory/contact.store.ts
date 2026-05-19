import type {
    WaContactStore as Contract,
    WaStoredContactRecord
} from '@store/contracts/contact.store'
import { resolvePositive } from '@util/coercion'
import { setBoundedMapEntry } from '@util/collections'

const DEFAULT_CONTACT_MEMORY_STORE_LIMITS = Object.freeze({
    contacts: 20_000
} as const)

export interface WaContactMemoryStoreOptions {
    readonly maxContacts?: number
}

export class WaContactMemoryStore implements Contract {
    private readonly contacts = new Map<string, WaStoredContactRecord>()
    private readonly maxContacts: number

    public constructor(options: WaContactMemoryStoreOptions = {}) {
        this.maxContacts = resolvePositive(
            options.maxContacts,
            DEFAULT_CONTACT_MEMORY_STORE_LIMITS.contacts,
            'WaContactMemoryStoreOptions.maxContacts'
        )
    }

    public async upsert(record: WaStoredContactRecord): Promise<void> {
        setBoundedMapEntry(this.contacts, record.jid, record, this.maxContacts)
    }

    public async upsertBatch(records: readonly WaStoredContactRecord[]): Promise<void> {
        for (const record of records) {
            setBoundedMapEntry(this.contacts, record.jid, record, this.maxContacts)
        }
    }

    public async getByJid(jid: string): Promise<WaStoredContactRecord | null> {
        return this.contacts.get(jid) ?? null
    }

    public async deleteByJid(jid: string): Promise<number> {
        return this.contacts.delete(jid) ? 1 : 0
    }

    public async clear(): Promise<void> {
        this.contacts.clear()
    }
}
