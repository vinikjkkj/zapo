import { isUserJid } from '@protocol/jid'
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

function mergeContactRecords(
    previous: WaStoredContactRecord | undefined,
    incoming: WaStoredContactRecord
): WaStoredContactRecord {
    if (!previous) return incoming
    return {
        jid: incoming.jid,
        displayName: incoming.displayName ?? previous.displayName,
        pushName: incoming.pushName ?? previous.pushName,
        lid: incoming.lid ?? previous.lid,
        phoneNumber: incoming.phoneNumber ?? previous.phoneNumber,
        lastUpdatedMs: Math.max(previous.lastUpdatedMs, incoming.lastUpdatedMs)
    }
}

export class WaContactMemoryStore implements Contract {
    private readonly contacts = new Map<string, WaStoredContactRecord>()
    /** Secondary index: phone_number -> primary jid (typically the LID form). */
    private readonly phoneIndex = new Map<string, string>()
    private readonly maxContacts: number

    public constructor(options: WaContactMemoryStoreOptions = {}) {
        this.maxContacts = resolvePositive(
            options.maxContacts,
            DEFAULT_CONTACT_MEMORY_STORE_LIMITS.contacts,
            'WaContactMemoryStoreOptions.maxContacts'
        )
    }

    private writeRecord(record: WaStoredContactRecord): void {
        const previous = this.contacts.get(record.jid)
        const merged = mergeContactRecords(previous, record)
        setBoundedMapEntry(this.contacts, merged.jid, merged, this.maxContacts)
        if (
            previous?.phoneNumber &&
            previous.phoneNumber !== merged.phoneNumber &&
            this.phoneIndex.get(previous.phoneNumber) === merged.jid
        ) {
            this.phoneIndex.delete(previous.phoneNumber)
        }
        if (merged.phoneNumber) {
            this.phoneIndex.set(merged.phoneNumber, merged.jid)
        }
    }

    public async upsert(record: WaStoredContactRecord): Promise<void> {
        this.writeRecord(record)
    }

    public async upsertBatch(records: readonly WaStoredContactRecord[]): Promise<void> {
        for (const record of records) {
            this.writeRecord(record)
        }
    }

    public async getByJid(jid: string): Promise<WaStoredContactRecord | null> {
        const direct = this.contacts.get(jid)
        if (direct) return direct
        if (isUserJid(jid)) {
            return this.getByPhoneNumberSync(jid)
        }
        return null
    }

    public async getByPhoneNumber(pn: string): Promise<WaStoredContactRecord | null> {
        return this.getByPhoneNumberSync(pn)
    }

    private getByPhoneNumberSync(pn: string): WaStoredContactRecord | null {
        const jid = this.phoneIndex.get(pn)
        if (!jid) return null
        return this.contacts.get(jid) ?? null
    }

    public async deleteByJid(jid: string): Promise<number> {
        const existing = this.contacts.get(jid)
        if (!existing) return 0
        this.contacts.delete(jid)
        if (existing.phoneNumber && this.phoneIndex.get(existing.phoneNumber) === jid) {
            this.phoneIndex.delete(existing.phoneNumber)
        }
        return 1
    }

    public async clear(): Promise<void> {
        this.contacts.clear()
        this.phoneIndex.clear()
    }
}
