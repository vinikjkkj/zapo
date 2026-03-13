import type {
    WaContactStore as Contract,
    WaStoredContactRecord
} from '@store/contracts/contact.store'
import { setBoundedMapEntry } from '@util/collections'
import { readPositiveLimit } from '@util/env'

const DEFAULT_CONTACT_MEMORY_STORE_LIMITS = Object.freeze({
    contacts: 20_000
} as const)

export class WaContactMemoryStore implements Contract {
    private readonly contacts = new Map<string, WaStoredContactRecord>()
    private readonly maxContacts: number

    public constructor() {
        this.maxContacts = readPositiveLimit(
            'WA_CONTACTS_MEMORY_STORE_MAX_CONTACTS',
            DEFAULT_CONTACT_MEMORY_STORE_LIMITS.contacts
        )
    }

    public async upsert(record: WaStoredContactRecord): Promise<void> {
        setBoundedMapEntry(this.contacts, record.jid, record, this.maxContacts)
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
