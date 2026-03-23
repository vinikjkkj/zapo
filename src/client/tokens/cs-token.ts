import { hmacSign, importHmacKey } from '@crypto/core'
import type { CryptoKey } from '@crypto/core'
import { TEXT_ENCODER } from '@util/bytes'
import { setBoundedMapEntry } from '@util/collections'

const CS_TOKEN_CACHE_MAX = 5

export class CsTokenGenerator {
    private cachedKey: CryptoKey | null
    private cachedSalt: Uint8Array | null
    private readonly cache: Map<string, Uint8Array>

    public constructor() {
        this.cachedKey = null
        this.cachedSalt = null
        this.cache = new Map()
    }

    public async generate(nctSalt: Uint8Array, accountLid: string): Promise<Uint8Array> {
        const cached = this.cache.get(accountLid)
        if (cached && this.isSameSalt(nctSalt)) {
            return cached
        }

        const key = await this.resolveKey(nctSalt)
        const result = await hmacSign(key, TEXT_ENCODER.encode(accountLid))

        setBoundedMapEntry(this.cache, accountLid, result, CS_TOKEN_CACHE_MAX)
        return result
    }

    public invalidate(): void {
        this.cachedKey = null
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

    private async resolveKey(salt: Uint8Array): Promise<CryptoKey> {
        if (this.cachedKey && this.isSameSalt(salt)) {
            return this.cachedKey
        }
        this.cachedKey = await importHmacKey(salt)
        this.cachedSalt = salt.slice()
        this.cache.clear()
        return this.cachedKey
    }
}
