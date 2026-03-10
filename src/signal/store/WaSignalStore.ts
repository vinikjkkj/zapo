import { WA_DEFAULTS } from '../../protocol/constants'
import type {
    PreKeyRecord,
    RegistrationInfo,
    SignalAddress,
    SignalSessionRecord,
    SignedPreKeyRecord
} from '../../signal/types'

export class WaSignalStore {
    private registrationInfo: RegistrationInfo | null
    private signedPreKey: SignedPreKeyRecord | null
    private readonly preKeys: Map<number, PreKeyRecord>
    private readonly uploadedPreKeys: Set<number>
    private serverHasPreKeys: boolean
    private readonly signalSessions: Map<string, SignalSessionRecord>
    private readonly remoteIdentities: Map<string, Uint8Array>
    private nextPreKeyId: number

    public constructor() {
        this.registrationInfo = null
        this.signedPreKey = null
        this.preKeys = new Map()
        this.uploadedPreKeys = new Set()
        this.serverHasPreKeys = false
        this.signalSessions = new Map()
        this.remoteIdentities = new Map()
        this.nextPreKeyId = 1
    }

    public async getRegistrationInfo(): Promise<RegistrationInfo | null> {
        return this.registrationInfo
    }

    public async setRegistrationInfo(info: RegistrationInfo): Promise<void> {
        this.registrationInfo = info
    }

    public async getSignedPreKey(): Promise<SignedPreKeyRecord | null> {
        return this.signedPreKey
    }

    public async setSignedPreKey(record: SignedPreKeyRecord): Promise<void> {
        this.signedPreKey = record
    }

    public async getSignedPreKeyById(keyId: number): Promise<SignedPreKeyRecord | null> {
        if (!this.signedPreKey) {
            return null
        }
        return this.signedPreKey.keyId === keyId ? this.signedPreKey : null
    }

    public async putPreKey(record: PreKeyRecord): Promise<void> {
        this.preKeys.set(record.keyId, record)
        if (record.keyId >= this.nextPreKeyId) {
            this.nextPreKeyId = record.keyId + 1
        }
    }

    public async getOrGenPreKeys(
        count: number,
        generator: (keyId: number) => PreKeyRecord | Promise<PreKeyRecord>
    ): Promise<readonly PreKeyRecord[]> {
        if (!Number.isSafeInteger(count) || count <= 0) {
            throw new Error(`invalid prekey count: ${count}`)
        }

        const available: PreKeyRecord[] = []
        const sortedIds = [...this.preKeys.keys()].sort((left, right) => left - right)
        for (let index = 0; index < sortedIds.length; index += 1) {
            const keyId = sortedIds[index]
            if (this.uploadedPreKeys.has(keyId)) {
                continue
            }
            const record = this.preKeys.get(keyId)
            if (!record) {
                continue
            }
            available.push(record)
            if (available.length >= count) {
                return available
            }
        }

        while (available.length < count) {
            const record = await generator(this.nextPreKeyId++)
            this.preKeys.set(record.keyId, record)
            available.push(record)
        }
        return available
    }

    public async getPreKeyById(keyId: number): Promise<PreKeyRecord | null> {
        return this.preKeys.get(keyId) ?? null
    }

    public async consumePreKeyById(keyId: number): Promise<PreKeyRecord | null> {
        const record = this.preKeys.get(keyId) ?? null
        if (!record) {
            return null
        }
        this.preKeys.delete(keyId)
        this.uploadedPreKeys.delete(keyId)
        return record
    }

    public async getOrGenSinglePreKey(
        generator: (keyId: number) => PreKeyRecord | Promise<PreKeyRecord>
    ): Promise<PreKeyRecord> {
        const preKeys = await this.getOrGenPreKeys(1, generator)
        return preKeys[0]
    }

    public async markKeyAsUploaded(keyId: number): Promise<void> {
        if (keyId < 0 || keyId >= this.nextPreKeyId) {
            throw new Error(`prekey ${keyId} is out of boundary`)
        }
        for (const candidate of this.preKeys.keys()) {
            if (candidate <= keyId) {
                this.uploadedPreKeys.add(candidate)
            }
        }
    }

    public async setServerHasPreKeys(value: boolean): Promise<void> {
        this.serverHasPreKeys = value
    }

    public async getServerHasPreKeys(): Promise<boolean> {
        return this.serverHasPreKeys
    }

    public async getSession(address: SignalAddress): Promise<SignalSessionRecord | null> {
        return this.signalSessions.get(this.addressKey(address)) ?? null
    }

    public async setSession(address: SignalAddress, session: SignalSessionRecord): Promise<void> {
        this.signalSessions.set(this.addressKey(address), session)
    }

    public async deleteSession(address: SignalAddress): Promise<void> {
        this.signalSessions.delete(this.addressKey(address))
    }

    public async getRemoteIdentity(address: SignalAddress): Promise<Uint8Array | null> {
        return this.remoteIdentities.get(this.addressKey(address)) ?? null
    }

    public async setRemoteIdentity(address: SignalAddress, identityKey: Uint8Array): Promise<void> {
        this.remoteIdentities.set(this.addressKey(address), identityKey)
    }

    private addressKey(address: SignalAddress): string {
        const server = address.server ?? WA_DEFAULTS.HOST_DOMAIN
        return `${address.user}|${server}|${address.device}`
    }
}
