import type { WaLidPnMappingStore } from '@store/contracts/lid-pn-mapping.store'
import { resolvePositive } from '@util/coercion'
import { setBoundedMapEntry } from '@util/collections'

const DEFAULT_MAX_MAPPINGS = 8_192

export interface WaLidPnMappingMemoryStoreOptions {
    /** Maximum mappings retained by the bounded in-process store. Default: `8_192`. */
    readonly maxMappings?: number
}

/** Bounded in-process implementation of {@link WaLidPnMappingStore}. */
export class WaLidPnMappingMemoryStore implements WaLidPnMappingStore {
    private readonly mappings = new Map<string, string>()
    private readonly reverseMappings = new Map<string, string>()
    private readonly maxMappings: number

    public constructor(options: WaLidPnMappingMemoryStoreOptions = {}) {
        this.maxMappings = resolvePositive(
            options.maxMappings,
            DEFAULT_MAX_MAPPINGS,
            'WaLidPnMappingMemoryStore.maxMappings'
        )
    }

    public async getLidUser(pnUser: string): Promise<string | null> {
        return this.mappings.get(pnUser) ?? null
    }

    public async getPnUser(lidUser: string): Promise<string | null> {
        return this.reverseMappings.get(lidUser) ?? null
    }

    public async setLidUser(pnUser: string, lidUser: string): Promise<void> {
        const previousLid = this.mappings.get(pnUser)
        if (previousLid !== undefined) this.reverseMappings.delete(previousLid)
        const previousPn = this.reverseMappings.get(lidUser)
        if (previousPn !== undefined) this.mappings.delete(previousPn)
        setBoundedMapEntry(
            this.mappings,
            pnUser,
            lidUser,
            this.maxMappings,
            (evictedPn, evictedLid) => {
                if (this.reverseMappings.get(evictedLid) === evictedPn) {
                    this.reverseMappings.delete(evictedLid)
                }
            }
        )
        this.reverseMappings.set(lidUser, pnUser)
    }

    public async clear(): Promise<void> {
        this.mappings.clear()
        this.reverseMappings.clear()
    }
}
