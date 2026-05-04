import { hmacSha256Sign } from '@crypto/core'
import { TEXT_ENCODER } from '@util/bytes'
import { setBoundedMapEntry } from '@util/collections'

const CS_TOKEN_CACHE_MAX = 5

export class CsTokenGenerator {
    private cachedSalt: Uint8Array | null
    private readonly cache: Map<string, Uint8Array>

    public constructor() {
        this.cachedSalt = null
        this.cache = new Map()
    }

    public async generate(nctSalt: Uint8Array, accountLid: string): Promise<Uint8Array> {
        if (this.isSameSalt(nctSalt)) {
            const cached = this.cache.get(accountLid)
            if (cached) {
                return cached
            }
        }

        const result = await hmacSha256Sign(nctSalt, TEXT_ENCODER.encode(accountLid))

        if (!this.isSameSalt(nctSalt)) {
            this.cachedSalt = nctSalt
            this.cache.clear()
        }
        setBoundedMapEntry(this.cache, accountLid, result, CS_TOKEN_CACHE_MAX)
        return result
    }

    public invalidate(): void {
        this.cachedSalt = null
        this.cache.clear()
    }

    private isSameSalt(salt: Uint8Array): boolean {
        if (!this.cachedSalt || this.cachedSalt.length !== salt.length) {
            return false
        }
        for (let i = 0; i < salt.length; i += 1) {
            if (this.cachedSalt[i] !== salt[i]) {
                return false
            }
        }
        return true
    }
}
