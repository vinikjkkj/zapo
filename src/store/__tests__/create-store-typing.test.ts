import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaAppStateStore } from '@store/contracts/appstate.store'
import type { WaAuthStore } from '@store/contracts/auth.store'
import type { WaChatMetadataStore } from '@store/contracts/chat-metadata.store'
import type { WaContactStore } from '@store/contracts/contact.store'
import type { WaDeviceListStore } from '@store/contracts/device-list.store'
import type { WaGroupMetadataStore } from '@store/contracts/group-metadata.store'
import type { WaIdentityStore } from '@store/contracts/identity.store'
import type { WaMessageSecretStore } from '@store/contracts/message-secret.store'
import type { WaMessageStore } from '@store/contracts/message.store'
import type { WaPreKeyStore } from '@store/contracts/pre-key.store'
import type { WaPrivacyTokenStore } from '@store/contracts/privacy-token.store'
import type { WaRetryStore } from '@store/contracts/retry.store'
import type { WaSenderKeyStore } from '@store/contracts/sender-key.store'
import type { WaSessionStore } from '@store/contracts/session.store'
import type { WaSignalStore } from '@store/contracts/signal.store'
import type { WaThreadStore } from '@store/contracts/thread.store'
import { createStore } from '@store/createStore'
import type {
    WaCreateStoreOptions,
    WaCreateStoreOptionsStrict,
    WaCreateStoreOptionsStrictFor,
    WaStoreBackend,
    WaStoreBackendMap
} from '@store/types'

const authFactory = (): WaAuthStore => ({
    async load() {
        return null
    },
    async save() {},
    async clear() {}
})

const unusedFactory =
    <T>() =>
    (): T => {
        throw new Error('not expected')
    }

const fullBackend = {
    stores: {
        auth: authFactory,
        signal: unusedFactory<WaSignalStore>(),
        preKey: unusedFactory<WaPreKeyStore>(),
        session: unusedFactory<WaSessionStore>(),
        identity: unusedFactory<WaIdentityStore>(),
        senderKey: unusedFactory<WaSenderKeyStore>(),
        appState: unusedFactory<WaAppStateStore>(),
        messages: unusedFactory<WaMessageStore>(),
        threads: unusedFactory<WaThreadStore>(),
        contacts: unusedFactory<WaContactStore>(),
        privacyToken: unusedFactory<WaPrivacyTokenStore>()
    },
    caches: {
        retry: unusedFactory<WaRetryStore>(),
        groupMetadata: unusedFactory<WaGroupMetadataStore>(),
        chatMetadata: unusedFactory<WaChatMetadataStore>(),
        deviceList: unusedFactory<WaDeviceListStore>(),
        messageSecret: unusedFactory<WaMessageSecretStore>()
    }
} satisfies WaStoreBackend

/** Credentials-only backend: one persistent domain, no caches. */
const authOnlyBackend = {
    stores: { auth: authFactory },
    caches: {}
} satisfies WaStoreBackend<'auth', never>

const MEMORY_REST = {
    signal: 'memory',
    preKey: 'memory',
    session: 'memory',
    identity: 'memory',
    senderKey: 'memory',
    appState: 'memory',
    privacyToken: 'memory',
    messages: 'none',
    threads: 'none',
    contacts: 'none'
} as const

test('full backend is nameable on every domain', () => {
    const store = createStore({
        backends: { sql: fullBackend },
        providers: {
            auth: 'sql',
            signal: 'sql',
            preKey: 'sql',
            session: 'sql',
            identity: 'sql',
            senderKey: 'sql',
            appState: 'sql',
            privacyToken: 'sql',
            messages: 'sql',
            threads: 'sql',
            contacts: 'sql'
        },
        cacheProviders: { retry: 'sql' }
    })

    assert.ok(store)
})

test('partial backend serves what it declares and leaves the session total', async () => {
    const store = createStore({
        backends: { vault: authOnlyBackend },
        providers: { auth: 'vault', ...MEMORY_REST }
    })

    const session = store.session('typing-partial')

    assert.equal(await session.auth.load(), null)
    // 'none' keeps the domain on the session - it resolves to the noop store,
    // it does not disappear from the bundle.
    assert.equal(await session.messages.getById('missing'), null)
    assert.equal(await session.contacts.getByJid('missing@lid'), null)

    await store.destroy()
})

test('domains a backend does not declare are rejected at compile time', () => {
    createStore({
        backends: { vault: authOnlyBackend },
        providers: {
            auth: 'vault',
            // @ts-expect-error - vault declares no stores.signal factory
            signal: 'vault',
            preKey: 'memory',
            session: 'memory',
            identity: 'memory',
            senderKey: 'memory',
            appState: 'memory',
            privacyToken: 'memory',
            messages: 'none',
            threads: 'none',
            contacts: 'none'
        }
    })

    createStore({
        backends: { vault: authOnlyBackend },
        providers: { auth: 'vault', ...MEMORY_REST },
        // @ts-expect-error - vault declares no caches.retry factory
        cacheProviders: { retry: 'vault' }
    })

    createStore({
        backends: { sql: fullBackend },
        providers: {
            // @ts-expect-error - 'sqlite' is not a registered backend name
            auth: 'sqlite',
            ...MEMORY_REST
        }
    })

    assert.ok(true)
})

test('every persistence domain stays mandatory once a backend is registered', () => {
    // Both layers guard this: the compiler rejects the partial `providers`,
    // and the runtime check still fires for JS callers with no types.
    assert.throws(
        () =>
            createStore({
                backends: { sql: fullBackend },
                // @ts-expect-error - providers.auth is missing
                providers: MEMORY_REST
            }),
        /Missing: providers\.auth/
    )
})

test('name-keyed options still compile without the backend values in scope', () => {
    const options: WaCreateStoreOptions<'sqlite'> = {
        providers: { auth: 'sqlite', ...MEMORY_REST },
        cacheProviders: { retry: 'sqlite' }
    }

    assert.equal(options.providers?.auth, 'sqlite')
})

test('name-keyed options demand full backends, having no way to verify coverage', () => {
    // Partial backends belong to the inferred shape, which sees the values.
    // This one only sees names, so its `providers` let any name serve any
    // domain - taking a partial backend here would compile `signal: 'vault'`
    // and move the failure back to the first session(). Reach for
    // `WaCreateStoreOptionsStrictFor<typeof backends>` instead.
    const options: WaCreateStoreOptionsStrict<'vault'> = {
        // @ts-expect-error - vault implements only stores.auth
        backends: { vault: authOnlyBackend },
        providers: { auth: 'vault', ...MEMORY_REST }
    }

    assert.equal(options.providers.auth, 'vault')
})

test('the inferred shape annotates a partial backend just fine', () => {
    const backends = { vault: authOnlyBackend }
    const options: WaCreateStoreOptionsStrictFor<typeof backends> = {
        backends,
        providers: { auth: 'vault', ...MEMORY_REST }
    }

    assert.equal(options.providers.auth, 'vault')
})

test('annotating the backend map erases coverage', () => {
    // WaStoreBackendMap is a constraint, not an annotation - it optionalises
    // every factory, so no backend vouches for any domain any more.
    const backends: WaStoreBackendMap = { vault: authOnlyBackend }

    createStore({
        backends,
        providers: {
            // @ts-expect-error - the annotation collapsed auth to 'memory'
            auth: 'vault',
            ...MEMORY_REST
        }
    })

    assert.ok(backends)
})
