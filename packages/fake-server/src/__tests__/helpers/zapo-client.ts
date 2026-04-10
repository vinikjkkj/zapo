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
    readonly emitSnapshotMutations?: boolean
    readonly logger?: Logger
}

export interface ZapoClientFixture {
    readonly client: WaClient
    readonly authStore: WaAuthStore
}

export function createZapoClient(
    server: FakeWaServer,
    options: CreateZapoClientOptions = {}
): ZapoClientFixture {
    const authStore = new InMemoryAuthStore()
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
            connectTimeoutMs: options.connectTimeoutMs ?? 60_000,
            history: options.historySyncEnabled ? { enabled: true } : undefined,
            chatEvents: options.emitSnapshotMutations
                ? { emitSnapshotMutations: true }
                : undefined,
            proxy: {
                mediaUpload: server.mediaProxyAgent,
                mediaDownload: server.mediaProxyAgent
            },
            testHooks: {
                noiseRootCa: server.noiseRootCa
            }
        },
        options.logger ?? NOOP_LOGGER
    )

    return { client, authStore }
}
