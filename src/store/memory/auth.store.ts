import type { WaAuthCredentials } from '@auth/types'
import type { WaAuthStore } from '@store/contracts/auth.store'

/**
 * In-memory {@link WaAuthStore} implementation. Holds a single
 * {@link WaAuthCredentials} per instance in a field – nothing is persisted.
 *
 * @sensitive Holds private key material from {@link WaAuthCredentials} in
 * RAM. Never log instances, never `JSON.stringify`. Pairing credentials are
 * lost when the process exits, so the next connect will re-pair from scratch
 * (QR/link-code). Prefer a persistent backend (e.g. `@zapo-js/store-sqlite`)
 * for production.
 */
export class WaAuthMemoryStore implements WaAuthStore {
    private credentials: WaAuthCredentials | null = null

    public async load(): Promise<WaAuthCredentials | null> {
        return this.credentials
    }

    public async save(credentials: WaAuthCredentials): Promise<void> {
        this.credentials = credentials
    }

    public async clear(): Promise<void> {
        this.credentials = null
    }
}
