import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
import { WA_DEFAULTS } from '@protocol/constants'
import { canonicalizeSignalServer, parseSignalAddressFromJid } from '@protocol/jid'
import type { SignalAddress } from '@signal/types'
import type { WaLidPnMappingStore } from '@store/contracts/lid-pn-mapping.store'
import { resolvePositive } from '@util/coercion'
import { setBoundedMapEntry } from '@util/collections'

const DEFAULT_MAX_CACHE_ENTRIES = 8_192

interface LidPnUsers {
    readonly pnUser: string
    readonly lidUser: string
}

function addressKind(address: SignalAddress): 'pn' | 'lid' | null {
    const server = canonicalizeSignalServer(address.server ?? WA_DEFAULTS.HOST_DOMAIN)
    if (server === WA_DEFAULTS.HOST_DOMAIN) return 'pn'
    if (server === WA_DEFAULTS.LID_SERVER) return 'lid'
    return null
}

function parseLidPnUsers(firstJid: string, secondJid: string): LidPnUsers | null {
    const first = parseSignalAddressFromJid(firstJid)
    const second = parseSignalAddressFromJid(secondJid)
    const firstKind = addressKind(first)
    const secondKind = addressKind(second)
    if (firstKind === 'pn' && secondKind === 'lid') {
        return { pnUser: first.user, lidUser: second.user }
    }
    if (firstKind === 'lid' && secondKind === 'pn') {
        return { pnUser: second.user, lidUser: first.user }
    }
    return null
}

/**
 * Resolves PN Signal addresses through the persistent PN/LID mapping learned
 * from authenticated stanza metadata. Positive and negative lookups are kept
 * in-process, so the steady-state path is one Map lookup with no store I/O.
 */
export class SignalAddressResolver {
    private readonly store: WaLidPnMappingStore
    private readonly cache = new Map<string, string | null>()
    private readonly lookupLock = new StoreLock()
    private readonly mappingGate = new SharedExclusiveGate()
    private readonly maxCacheEntries: number

    public constructor(
        store: WaLidPnMappingStore,
        options: { readonly maxCacheEntries?: number } = {}
    ) {
        this.store = store
        this.maxCacheEntries = resolvePositive(
            options.maxCacheEntries,
            DEFAULT_MAX_CACHE_ENTRIES,
            'SignalAddressResolver.maxCacheEntries'
        )
    }

    /**
     * Learns a conservative mapping from ordinary message metadata. The target
     * LID is not replaced when another PN already owns it.
     */
    public learnMessageJidPair(firstJid: string, secondJid: string): Promise<boolean> {
        return this.learnJidPairInternal(firstJid, secondJid, false)
    }

    /** Learns an authoritative cross-reference carried for a peer recipient. */
    public learnPeerRecipientJidPair(firstJid: string, secondJid: string): Promise<boolean> {
        return this.learnJidPairInternal(firstJid, secondJid, true)
    }

    private async learnJidPairInternal(
        firstJid: string,
        secondJid: string,
        replaceExisting: boolean
    ): Promise<boolean> {
        const mapping = parseLidPnUsers(firstJid, secondJid)
        if (!mapping) return false
        // A replacement can evict both the previous LID for this PN and the
        // previous PN for this LID. Serialize the rare mutations globally so
        // every cache invalidation reflects the same one-to-one store state.
        return this.mappingGate.runExclusive(async () => {
            let current: string | null
            if (this.cache.has(mapping.pnUser)) {
                current = this.cache.get(mapping.pnUser) ?? null
            } else {
                current = await this.store.getLidUser(mapping.pnUser)
            }
            if (current === mapping.lidUser) {
                this.cacheMapping(mapping.pnUser, current)
                return false
            }
            const currentPn = await this.store.getPnUser(mapping.lidUser)
            if (currentPn === mapping.pnUser) {
                this.cacheMapping(mapping.pnUser, mapping.lidUser)
                return false
            }
            if (!replaceExisting && currentPn !== null) {
                this.cacheMapping(mapping.pnUser, current)
                return false
            }
            await this.store.setLidUser(mapping.pnUser, mapping.lidUser)
            if (currentPn && currentPn !== mapping.pnUser) {
                this.cacheMapping(currentPn, null)
            }
            this.cacheMapping(mapping.pnUser, mapping.lidUser)
            return true
        })
    }

    /** Resolves a PN address to its current LID while preserving the device id. */
    public resolve(address: SignalAddress): SignalAddress | Promise<SignalAddress> {
        if (addressKind(address) !== 'pn') return address
        const cached = this.cache.get(address.user)
        if (cached !== undefined) return this.applyMapping(address, cached)
        return this.resolveUncached(address)
    }

    /** Batch variant of {@link resolve}; returns the input array when nothing changes. */
    public resolveMany(
        addresses: readonly SignalAddress[]
    ): readonly SignalAddress[] | Promise<readonly SignalAddress[]> {
        if (addresses.length === 0) return addresses
        let resolved: SignalAddress[] | null = null
        let missingUsers: Set<string> | null = null
        for (let index = 0; index < addresses.length; index += 1) {
            const address = addresses[index]
            if (addressKind(address) !== 'pn') continue
            const cached = this.cache.get(address.user)
            if (cached === undefined) {
                if (!missingUsers) missingUsers = new Set()
                missingUsers.add(address.user)
                continue
            }
            if (!cached) continue
            resolved ??= addresses.slice()
            resolved[index] = this.applyMapping(address, cached)
        }
        if (!missingUsers) return resolved ?? addresses
        return this.resolveManyUncached(addresses, resolved, missingUsers)
    }

    /** Clears both the persistent mapping and its in-process lookup cache. */
    public async clear(): Promise<void> {
        await this.mappingGate.runExclusive(async () => {
            try {
                await this.store.clear()
            } finally {
                this.cache.clear()
            }
        })
    }

    private async resolveUncached(address: SignalAddress): Promise<SignalAddress> {
        const lidUser = await this.resolveLidUser(address.user)
        return this.applyMapping(address, lidUser)
    }

    private async resolveManyUncached(
        addresses: readonly SignalAddress[],
        resolved: SignalAddress[] | null,
        missingUsers: ReadonlySet<string>
    ): Promise<readonly SignalAddress[]> {
        await Promise.all(Array.from(missingUsers, (pnUser) => this.resolveLidUser(pnUser)))
        for (let index = 0; index < addresses.length; index += 1) {
            const address = addresses[index]
            if (addressKind(address) !== 'pn') continue
            const lidUser = this.cache.get(address.user)
            if (!lidUser) continue
            resolved ??= addresses.slice()
            resolved[index] = this.applyMapping(address, lidUser)
        }
        return resolved ?? addresses
    }

    private applyMapping(address: SignalAddress, lidUser: string | null): SignalAddress {
        if (!lidUser) return address
        return {
            user: lidUser,
            server:
                address.server === WA_DEFAULTS.HOSTED_SERVER
                    ? WA_DEFAULTS.HOSTED_LID_SERVER
                    : WA_DEFAULTS.LID_SERVER,
            device: address.device
        }
    }

    private async resolveLidUser(pnUser: string): Promise<string | null> {
        if (this.cache.has(pnUser)) return this.cache.get(pnUser) ?? null
        return this.lookupLock.run(pnUser, () =>
            this.mappingGate.runShared(async () => {
                if (this.cache.has(pnUser)) return this.cache.get(pnUser) ?? null
                const lidUser = await this.store.getLidUser(pnUser)
                this.cacheMapping(pnUser, lidUser)
                return lidUser
            })
        )
    }

    private cacheMapping(pnUser: string, lidUser: string | null): void {
        setBoundedMapEntry(this.cache, pnUser, lidUser, this.maxCacheEntries)
    }
}
