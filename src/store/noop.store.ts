import type { WaContactStore, WaStoredContactRecord } from '@store/contracts/contact.store'
import type { WaDeviceListSnapshot, WaDeviceListStore } from '@store/contracts/device-list.store'
import type { WaMessageSecretStore } from '@store/contracts/message-secret.store'
import type { WaMessageStore, WaStoredMessageRecord } from '@store/contracts/message.store'
import type {
    WaParticipantsSnapshot,
    WaParticipantsStore
} from '@store/contracts/participants.store'
import type { WaStoredThreadRecord, WaThreadStore } from '@store/contracts/thread.store'

const EMPTY_STORE_LIST = Object.freeze([]) as readonly unknown[]

export const NOOP_MESSAGE_SECRET_STORE: WaMessageSecretStore = Object.freeze({
    get: async (_messageId: string): Promise<Uint8Array | null> => null,
    getBatch: async (messageIds: readonly string[]): Promise<readonly (Uint8Array | null)[]> =>
        new Array<Uint8Array | null>(messageIds.length).fill(null),
    set: async (_messageId: string, _secret: Uint8Array): Promise<void> => {},
    setBatch: async (
        _entries: readonly { readonly messageId: string; readonly secret: Uint8Array }[]
    ): Promise<void> => {},
    cleanupExpired: async (_nowMs: number): Promise<number> => 0,
    clear: async (): Promise<void> => {}
})

export const NOOP_MESSAGE_STORE: WaMessageStore = Object.freeze({
    upsert: async (_record: WaStoredMessageRecord): Promise<void> => {},
    upsertBatch: async (_records: readonly WaStoredMessageRecord[]): Promise<void> => {},
    getById: async (_id: string): Promise<WaStoredMessageRecord | null> => null,
    listByThread: async (
        _threadJid: string,
        _limit?: number,
        _beforeTimestampMs?: number
    ): Promise<readonly WaStoredMessageRecord[]> =>
        EMPTY_STORE_LIST as readonly WaStoredMessageRecord[],
    deleteById: async (_id: string): Promise<number> => 0,
    clear: async (): Promise<void> => {}
})

export const NOOP_THREAD_STORE: WaThreadStore = Object.freeze({
    upsert: async (_record: WaStoredThreadRecord): Promise<void> => {},
    upsertBatch: async (_records: readonly WaStoredThreadRecord[]): Promise<void> => {},
    getByJid: async (_jid: string): Promise<WaStoredThreadRecord | null> => null,
    list: async (_limit?: number): Promise<readonly WaStoredThreadRecord[]> =>
        EMPTY_STORE_LIST as readonly WaStoredThreadRecord[],
    deleteByJid: async (_jid: string): Promise<number> => 0,
    clear: async (): Promise<void> => {}
})

export const NOOP_CONTACT_STORE: WaContactStore = Object.freeze({
    upsert: async (_record: WaStoredContactRecord): Promise<void> => {},
    upsertBatch: async (_records: readonly WaStoredContactRecord[]): Promise<void> => {},
    getByJid: async (_jid: string): Promise<WaStoredContactRecord | null> => null,
    deleteByJid: async (_jid: string): Promise<number> => 0,
    clear: async (): Promise<void> => {}
})

export const NOOP_PARTICIPANTS_STORE: WaParticipantsStore = Object.freeze({
    upsertGroupParticipants: async (_snapshot: WaParticipantsSnapshot): Promise<void> => {},
    getGroupParticipants: async (
        _groupJid: string,
        _nowMs?: number
    ): Promise<WaParticipantsSnapshot | null> => null,
    deleteGroupParticipants: async (_groupJid: string): Promise<number> => 0,
    cleanupExpired: async (_nowMs: number): Promise<number> => 0,
    clear: async (): Promise<void> => {},
    destroy: async (): Promise<void> => {}
})

export const NOOP_DEVICE_LIST_STORE: WaDeviceListStore = Object.freeze({
    upsertUserDevicesBatch: async (
        _snapshots: readonly WaDeviceListSnapshot[]
    ): Promise<void> => {},
    getUserDevicesBatch: async (
        userJids: readonly string[],
        _nowMs?: number
    ): Promise<readonly (WaDeviceListSnapshot | null)[]> =>
        new Array<WaDeviceListSnapshot | null>(userJids.length).fill(null),
    deleteUserDevices: async (_userJid: string): Promise<number> => 0,
    cleanupExpired: async (_nowMs: number): Promise<number> => 0,
    clear: async (): Promise<void> => {},
    destroy: async (): Promise<void> => {}
})
