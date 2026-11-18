import type { WaPreKeyStore } from '@store/contracts/pre-key.store'
import { WaPreKeyMemoryStore } from '@store/memory/pre-key.store'

/** A pre-key store written before the post-quantum methods existed: classic methods only. */
export function createLegacyPreKeyStore(): WaPreKeyStore {
    const inner = new WaPreKeyMemoryStore()
    return {
        putPreKey: (record) => inner.putPreKey(record),
        getOrGenPreKeys: (count, generator) => inner.getOrGenPreKeys(count, generator),
        getPreKeyById: (keyId) => inner.getPreKeyById(keyId),
        getPreKeysById: (keyIds) => inner.getPreKeysById(keyIds),
        consumePreKeyById: (keyId) => inner.consumePreKeyById(keyId),
        getOrGenSinglePreKey: (generator) => inner.getOrGenSinglePreKey(generator),
        markKeyAsUploaded: (keyId) => inner.markKeyAsUploaded(keyId),
        setServerHasPreKeys: (value) => inner.setServerHasPreKeys(value),
        getServerHasPreKeys: () => inner.getServerHasPreKeys(),
        clear: () => inner.clear()
    }
}
