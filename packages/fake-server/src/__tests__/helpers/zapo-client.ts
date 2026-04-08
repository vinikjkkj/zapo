/**
 * Shared helpers for cross-check tests that drive a real WaClient against
 * a FakeWaServer. Lives under `__tests__/helpers/` so the file is not
 * picked up by the `*.test.ts` glob.
 *
 * NOTE: this helper imports zapo-js directly because it lives only under
 * cross-check tests. Production fake-server code must NOT import this.
 */

import {
    createStore,
    type Logger,
    type WaAuthCredentials,
    type WaAuthStore,
    WaClient
} from 'zapo-js'

const NOOP_LOGGER: Logger = {
    level: 'error',
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
}

import type { FakeWaServer } from '../../api/FakeWaServer'

class InMemoryAuthStore implements WaAuthStore {
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

function noopStore(): never {
    throw new Error('unexpected store call — this slot should not be reached in cross-check tests')
}

const AUTH_BACKEND = (
    authStore: WaAuthStore
): { readonly stores: object; readonly caches: object } => ({
    stores: {
        auth: () => authStore,
        signal: noopStore,
        preKey: noopStore,
        session: noopStore,
        identity: noopStore,
        senderKey: noopStore,
        appState: noopStore,
        messages: noopStore,
        threads: noopStore,
        contacts: noopStore,
        privacyToken: noopStore
    },
    caches: {
        retry: noopStore,
        participants: noopStore,
        deviceList: noopStore,
        messageSecret: noopStore
    }
})

export interface CreateZapoClientOptions {
    readonly sessionId?: string
    readonly connectTimeoutMs?: number
    readonly historySyncEnabled?: boolean
    readonly logger?: Logger
}

export interface ZapoClientFixture {
    readonly client: WaClient
    readonly authStore: WaAuthStore
}

/**
 * Builds a fresh in-memory `WaClient` wired to the given fake server.
 * Uses memory providers everywhere except `auth`, where a tiny in-process
 * stub is provided. The lib's `testHooks.noiseRootCa` is set automatically.
 */
export function createZapoClient(
    server: FakeWaServer,
    options: CreateZapoClientOptions = {}
): ZapoClientFixture {
    const authStore = new InMemoryAuthStore()
    // The createStore types require a fully populated backend; the noopStore
    // slots throw if reached but never are in our happy-path tests.
    const store = createStore({
        backends: { mem: AUTH_BACKEND(authStore) as never },
        providers: {
            auth: 'mem',
            signal: 'memory',
            senderKey: 'memory',
            appState: 'memory'
        }
    })

    const client = new WaClient(
        {
            store,
            sessionId: options.sessionId ?? 'fake-server-cross-check',
            chatSocketUrls: [server.url],
            connectTimeoutMs: options.connectTimeoutMs ?? 5_000,
            history: options.historySyncEnabled ? { enabled: true } : undefined,
            testHooks: {
                noiseRootCa: server.noiseRootCa
            }
        },
        options.logger ?? NOOP_LOGGER
    )

    return { client, authStore }
}
