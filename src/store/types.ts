import type { Logger } from '@infra/log/types'
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

export type WithDestroyLifecycle<T> = T & { readonly destroy?: () => Promise<void> }

export interface WaStoreSession {
    readonly auth: WaAuthStore
    readonly signal: WaSignalStore
    readonly preKey: WaPreKeyStore
    readonly session: WaSessionStore
    readonly identity: WaIdentityStore
    readonly senderKey: WaSenderKeyStore
    readonly appState: WaAppStateStore
    readonly retry: WaRetryStore
    readonly groupMetadata: WaGroupMetadataStore
    readonly chatMetadata: WaChatMetadataStore
    readonly deviceList: WaDeviceListStore
    readonly messages: WaMessageStore
    readonly messageSecret: WaMessageSecretStore
    readonly threads: WaThreadStore
    readonly contacts: WaContactStore
    readonly privacyToken: WaPrivacyTokenStore
    /**
     * Tears down the cache domains (retry/groupMetadata/deviceList/
     * messageSecret) and swaps fresh, empty ones into this bundle. The
     * session stays usable; the caches rebuild on demand. The swap happens
     * after the old stores finish tearing down (so a persistent cache
     * backend is never cleared under the fresh stores), which means cache
     * operations issued while the reset is in flight may reject. References
     * to the old cache stores captured before the call (e.g. by a live
     * client) reject afterwards - recreate the client to pick up the fresh
     * stores. Rejects when the old generation's teardown had failures - the
     * fresh caches are still in place, but stale entries may remain in a
     * persistent cache backend.
     */
    destroyCaches(): Promise<void>
    /**
     * Final teardown of every domain store in this bundle. The bundle is
     * single-shot: every operation on it rejects afterwards. The sessionId
     * is released as soon as destruction starts, so a concurrent
     * `store.session(id)` builds a fresh bundle instead of returning this
     * one. Repeat calls return the same in-flight promise. Teardown
     * failures are logged (warn), never thrown.
     */
    destroy(): Promise<void>
}

export interface WaStore {
    /**
     * Returns the lock-wrapped per-domain store bundle for `sessionId`,
     * building it on first use and caching it until its `destroy()` (or the
     * store-wide `destroy()`) releases it.
     */
    session(sessionId: string): WaStoreSession
    /** Runs {@link WaStoreSession.destroyCaches} on every live session. */
    destroyCaches(): Promise<void>
    /**
     * Destroys every live session bundle and the registered backends. The
     * store is single-shot: `session()` throws afterwards.
     */
    destroy(): Promise<void>
}

/**
 * Domain → contract map for the persistent store domains. Single source of
 * truth: {@link WaStoreDomain}, {@link WaStoreBackend} and the per-domain
 * provider selection are all derived from it.
 */
export interface WaStoreDomainContracts {
    readonly auth: WaAuthStore
    readonly signal: WaSignalStore
    readonly preKey: WaPreKeyStore
    readonly session: WaSessionStore
    readonly identity: WaIdentityStore
    readonly senderKey: WaSenderKeyStore
    readonly appState: WaAppStateStore
    readonly messages: WaMessageStore
    readonly threads: WaThreadStore
    readonly contacts: WaContactStore
    readonly privacyToken: WaPrivacyTokenStore
}

/** Domain → contract map for the bounded cache domains. */
export interface WaCacheDomainContracts {
    readonly retry: WaRetryStore
    readonly groupMetadata: WaGroupMetadataStore
    readonly chatMetadata: WaChatMetadataStore
    readonly deviceList: WaDeviceListStore
    readonly messageSecret: WaMessageSecretStore
}

export type WaStoreDomain = keyof WaStoreDomainContracts
export type WaCacheDomain = keyof WaCacheDomainContracts

/**
 * A backend bundle: one factory per domain it implements.
 *
 * Both parameters default to *every* domain, so a bare `WaStoreBackend`
 * keeps meaning a full backend – all 11 persistent domains plus all 4
 * cache domains – which is what every in-tree `@zapo-js/store-*` package
 * ships.
 *
 * A backend covering only part of the matrix names its domains explicitly.
 * `createStore()` then refuses, at compile time, to route a domain it
 * doesn't implement to it:
 *
 * ```ts
 * const vault = {
 *     stores: { auth: (sessionId: string) => new MyAuthStore(sessionId) },
 *     caches: {}
 * } satisfies WaStoreBackend<'auth', never>
 *
 * createStore({
 *     backends: { vault },
 *     providers: { auth: 'vault', signal: 'vault', ... }
 * })
 * ```
 *
 * where `signal: 'vault'` is rejected because `vault.stores` has no
 * `signal` factory – the union for that domain is `'memory'` alone.
 */
export type WaStoreBackend<
    S extends WaStoreDomain = WaStoreDomain,
    C extends WaCacheDomain = WaCacheDomain
> = {
    readonly stores: {
        readonly [K in S]: (sessionId: string) => WaStoreDomainContracts[K]
    }
    readonly caches: {
        readonly [K in C]: (sessionId: string) => WaCacheDomainContracts[K]
    }
}

/**
 * Structural upper bound for any backend, full or partial – the constraint
 * to use when accepting an unknown backend, since `WaStoreBackend` on its
 * own means *all* domains.
 *
 * Every factory is optional here, which is also what makes it useless as
 * an annotation on a concrete backend: a value declared as this type
 * vouches for no domain, so no domain can name it in `providers`. Annotate
 * concrete backends with `WaStoreBackend<S, C>` (or let inference do it)
 * to keep the per-domain guarantees.
 */
export type WaAnyStoreBackend = {
    readonly stores: {
        readonly [K in WaStoreDomain]?: (sessionId: string) => WaStoreDomainContracts[K]
    }
    readonly caches: {
        readonly [K in WaCacheDomain]?: (sessionId: string) => WaCacheDomainContracts[K]
    }
}

/** Named backend map, as passed to `createStore({ backends })`. */
export type WaStoreBackendMap = Readonly<Record<string, WaAnyStoreBackend>>

/**
 * The backend names in `TBackends` whose `stores`/`caches` bundle actually
 * declares `D`. Domains a backend doesn't implement never enter the union,
 * so routing one to it is a compile error instead of the
 * `backend '<name>' does not provide <kind>.<domain>` throw that would
 * otherwise surface on the first `store.session(...)`.
 */
export type WaBackendsProviding<
    TBackends extends WaStoreBackendMap,
    Kind extends 'stores' | 'caches',
    D extends WaStoreDomain | WaCacheDomain
> = {
    [K in keyof TBackends]: D extends keyof TBackends[K][Kind]
        ? undefined extends TBackends[K][Kind][D]
            ? never
            : K & string
        : never
}[keyof TBackends]

/**
 * Backend map implied by a bare name union: every name is assumed to cover
 * the full matrix, which is the pre-inference behaviour kept for
 * {@link WaCreateStoreOptions} and {@link WaCreateStoreOptionsStrict}.
 */
type WaNamedBackends<B extends string> = Readonly<Record<B, WaStoreBackend>>

/** Provider union for a persistent domain: any backend declaring it, or memory. */
type WaProviderFor<TBackends extends WaStoreBackendMap, D extends WaStoreDomain> =
    | WaBackendsProviding<TBackends, 'stores', D>
    | 'memory'

/** Provider union for a mailbox domain – same, plus the `'none'` opt-out. */
type WaMailboxProviderFor<TBackends extends WaStoreBackendMap, D extends WaStoreDomain> =
    | WaProviderFor<TBackends, D>
    | 'none'

/** Provider union for a cache domain. */
type WaCacheProviderFor<TBackends extends WaStoreBackendMap, D extends WaCacheDomain> =
    | WaBackendsProviding<TBackends, 'caches', D>
    | 'memory'
    | 'none'

/**
 * @typeParam B         Registered backend names.
 * @typeParam TBackends The backend map itself. Defaults to "every name in
 *                      `B` covers the full domain matrix", which is what a
 *                      bare `WaCreateStoreOptions<'sqlite'>` still means.
 *                      `createStore()` infers the real map instead, so each
 *                      domain only accepts backends that declare it.
 */
export interface WaCreateStoreOptions<
    B extends string = string,
    TBackends extends WaStoreBackendMap = WaNamedBackends<B>
> {
    /**
     * Named persistent backends (e.g. `{ sqlite: createSqliteStore(...) }`).
     * Each key here is a backend id you can reference under {@link providers}
     * and {@link cacheProviders}. The literal strings `'memory'` and `'none'`
     * are reserved and don't need a backend entry.
     */
    readonly backends?: Readonly<Record<B, WaAnyStoreBackend>>
    /**
     * Per-domain provider selection for the persistent (non-cache) stores.
     * Every domain falls back to `'memory'` (or `'none'` for the mailbox
     * domains) when omitted.
     */
    readonly providers?: {
        /**
         * Holds the device's pairing credentials: noise key pair, signed
         * identity, registration info, signed prekey, ADV secret, server
         * static key, routing info, account metadata. **This is what proves
         * "I am this paired device" to WhatsApp.** Lose it and the next
         * connect has to re-pair from scratch (QR/link-code). Default:
         * `'memory'` – fine for tests / one-shot scripts, but persist it
         * (e.g. `@zapo-js/store-sqlite`) in production so the device
         * survives a process restart.
         */
        readonly auth?: WaProviderFor<TBackends, 'auth'>
        /**
         * Signal protocol identities and the meta row (`server_has_prekeys`,
         * `next_prekey_id`, signed-prekey rotation timestamp). Splits with
         * {@link session}/{@link identity}/{@link preKey} in backends that
         * partition the Signal state; some backends collapse them. Default:
         * `'memory'` – fine for short-lived sessions; persist it in
         * production so re-keying / digest checks survive restarts.
         */
        readonly signal?: WaProviderFor<TBackends, 'signal'>
        /**
         * Signal one-time prekey pool. The server hands these out to peers
         * starting fresh sessions with you. Losing them forces fallback to
         * the signed-prekey-only flow (slower / less forward-secret per
         * session). Default: `'memory'`.
         */
        readonly preKey?: WaProviderFor<TBackends, 'preKey'>
        /**
         * Signal sessions (the per-peer Double Ratchet state). Losing this
         * forces a transparent re-handshake on the next message to/from that
         * peer – your identity key doesn't change, so no "security code
         * changed" notice fires on the peer. Default: `'memory'`.
         */
        readonly session?: WaProviderFor<TBackends, 'session'>
        /**
         * Remote identity keys per peer device. The library compares the
         * stored key against the server-reported one on every send to detect
         * device-takeover (`identity mismatch`). Default: `'memory'`.
         */
        readonly identity?: WaProviderFor<TBackends, 'identity'>
        /**
         * Sender-key state for group encryption: your own outgoing sender
         * key per group + incoming sender keys from other participants + the
         * delivery bookkeeping. Losing it makes you re-distribute your
         * sender key to every member on the next group send. Default:
         * `'memory'`.
         */
        readonly senderKey?: WaProviderFor<TBackends, 'senderKey'>
        /**
         * App-state sync keys + per-collection version/hash/index map
         * (mute, archive, pin, contacts, labels, ...). This is what lets
         * the lib emit `mutation` events and keep parity with the phone.
         * Wiping it triggers a full re-sync on next connect (slow, lots of
         * traffic). Default: `'memory'`.
         */
        readonly appState?: WaProviderFor<TBackends, 'appState'>
        /**
         * Optional archive of every message you received/sent. Required if
         * you want to call `client.message.send(..., { quote })` later for
         * messages this device never had in RAM, or to look up message
         * secrets for addon decryption after a restart. Default: `'none'`
         * (no archive – events fire but aren't stored).
         */
        readonly messages?: WaMailboxProviderFor<TBackends, 'messages'>
        /**
         * Per-chat thread metadata (last message id/time, unread count,
         * disappearing-mode setting). Used by some UIs to render a chat
         * list; not required for messaging. Default: `'none'`.
         */
        readonly threads?: WaMailboxProviderFor<TBackends, 'threads'>
        /**
         * Contact book mirror (push names, phone numbers, business labels).
         * Populated by app-state mutations and history sync. Not required
         * for messaging but useful for display names without an extra
         * profile fetch. Default: `'none'`.
         */
        readonly contacts?: WaMailboxProviderFor<TBackends, 'contacts'>
        /**
         * Trusted-contact-token cache – short-lived tokens the lib issues
         * to peers so they can verify that messages from you are authentic.
         * Persisting avoids re-issuing on every reconnect (saves IQs).
         * Default: `'memory'`.
         */
        readonly privacyToken?: WaProviderFor<TBackends, 'privacyToken'>
    }
    /**
     * Provider selection for the bounded cache domains – TTL-evicted state
     * the library re-derives on demand if missing. All default to
     * `'memory'`. Set a domain to `'none'` to disable that cache entirely
     * (the lib will keep working but re-fetch / re-compute every time);
     * point at a `B` backend when you want the cache to survive a process
     * restart (typically only useful for `retry`).
     */
    readonly cacheProviders?: {
        /**
         * Outbound-message replay cache plus inbound retry-counters. When
         * the peer sends a `<receipt type="retry">` asking for a re-send,
         * the lib looks up the stored payload here and replays it without
         * re-encrypting from scratch. Losing this means retry receipts that
         * arrive after restart get dropped (peer falls back to a placeholder
         * message). Default: `'memory'`.
         */
        readonly retry?: WaCacheProviderFor<TBackends, 'retry'>
        /**
         * Group metadata (subject, participants, settings) keyed by group
         * JID. Populated by `client.group.queryGroupMetadata`/server pushes
         * and consumed during fan-out so the library knows who to encrypt
         * to. Disabling forces a metadata IQ on every group send – the
         * server **rate-limits** this aggressively and active group accounts
         * will get throttled (or temporarily blocked) without a cache.
         * Default: `'memory'`.
         */
        readonly groupMetadata?: WaCacheProviderFor<TBackends, 'groupMetadata'>
        /**
         * Protocol-derived per-chat state (disappearing-message settings).
         * Read on every 1:1 send to stamp `contextInfo`; rebuilt from history
         * sync, `EPHEMERAL_SETTING` messages and incoming `ContextInfo`, so
         * losing it costs freshness rather than data. Default: `'memory'`.
         */
        readonly chatMetadata?: WaCacheProviderFor<TBackends, 'chatMetadata'>
        /**
         * Per-user device list (which `:device` JIDs each contact has online).
         * Populated by usync queries; consumed on every send to pick the
         * fan-out set. Disabling forces a usync round-trip per recipient on
         * every send. Default: `'memory'`.
         */
        readonly deviceList?: WaCacheProviderFor<TBackends, 'deviceList'>
        /**
         * Message-secret cache: maps `stanzaId → { senderJid, secret }` so
         * addon decryption (poll votes, reactions, encrypted edits, ...) can
         * find the parent message's 32-byte secret. Falls back to the
         * `messages` store when set. Disable only if `messages` is persistent
         * – otherwise addon auto-decrypt loses parents after restart.
         * Default: `'memory'`.
         */
        readonly messageSecret?: WaCacheProviderFor<TBackends, 'messageSecret'>
    }
    /**
     * Opt-in in-process read-through cache in front of a *persistent* backend
     * for the hot signal domains. Each enabled domain wraps its backend store
     * with a bounded-LRU L1 (the in-tree memory provider) so repeated reads of
     * the same peer on the send/recv path skip the backend round-trip; writes
     * stay write-through (or invalidate-on-write for `privacyToken`) so the
     * backend remains authoritative.
     *
     * A domain flag is a no-op unless that domain resolves to a real backend
     * in {@link providers} - caching a `'memory'`/`'none'` provider in front of
     * itself buys nothing and is skipped.
     *
     * **Single-writer assumption:** the L1 is per-process and has no
     * cross-process invalidation channel. Enable this only when a single
     * process owns a given `sessionId`'s backend rows (the library's
     * connection model). Do **not** enable it when multiple processes share
     * one backend for the *same* session - another process's writes would
     * leave this cache stale. Different sessions sharing one backend are fine.
     * All flags default to `false`.
     *
     * Distinct from {@link cacheProviders}: that selects *where* the bounded
     * cache domains live; this layers an in-memory read cache *in front of*
     * the persistent domains.
     *
     * Only the four domains below are exposed. The other persistent domains
     * are deliberately excluded, each for a verified reason:
     * - `signal`: the per-send `getRegistrationInfo` read is already memoized
     *   write-through inside the signal lock (`signal.lock.ts`), and the
     *   remaining reads (`getSignedPreKey`/`getSignedPreKeyById`/rotation ts)
     *   change only on the rare signed-prekey rotation and fire on inbound
     *   session-init, not per message - a second cache would add nothing.
     * - `appState`: the sync client already caches collection state for the
     *   sync-context lifetime, the only scope where reads both repeat and stay
     *   coherent. Across sync cycles the version is incremented and persisted,
     *   so a persistent cache yields ~0 hits, and the version is sent on the
     *   wire (server-authoritative) - a stale one forces a refetch loop.
     * - `preKey`: one-time prekeys are read exactly once then consumed
     *   (deleted) on the inbound path, so there is nothing to re-read; serving
     *   a consumed prekey from a stale cache would reuse a one-time key and
     *   break forward secrecy. There is no safe, useful read here.
     * - `auth` is loaded once per connect and kept in memory; the mailbox
     *   domains (`messages`/`threads`/`contacts`) are cold, large reads off
     *   the crypto path with write-behind already; and the cache domains
     *   (retry/groupMetadata/deviceList/messageSecret) default to in-process
     *   memory already, so an L1 in front would be a cache over a cache.
     */
    readonly cacheLayer?: {
        /** Cache Signal Double-Ratchet sessions (key→record). Write-through. */
        readonly session?: boolean
        /** Cache remote identity keys (key→bytes). Write-through. */
        readonly identity?: boolean
        /** Cache per-(group, sender) sender keys + distributions. Write-through. */
        readonly senderKey?: boolean
        /** Cache trusted-contact tokens (jid→record). Invalidate-on-write. */
        readonly privacyToken?: boolean
        /**
         * Per-domain L1 entry caps (LRU eviction once exceeded). Defaults to
         * the matching memory-provider default when unset.
         */
        readonly limits?: {
            readonly session?: number
            readonly identity?: number
            readonly senderKey?: number
            readonly privacyToken?: number
        }
    }
    /**
     * Memory-store tuning for the built-in `'memory'` providers. `limits`
     * caps per-domain entry counts (LRU eviction once exceeded); `cacheTtlMs`
     * controls how long cache entries live before being evicted. Tune these
     * up for high-traffic accounts (lots of groups / contacts) and down on
     * memory-constrained runtimes.
     */
    /**
     * Logger for store-wide events: provider topology at boot, in-memory
     * capacity saturation warnings, and downstream slow-operation warnings
     * cascaded through backend factories. When unset, the store layer is
     * silent. Backend packages (e.g. `@zapo-js/store-sqlite`,
     * `@zapo-js/store-redis`) receive a `child({ scope: 'store', provider:
     * '<name>' })` if they accept the same convention in their own factory.
     */
    readonly logger?: Logger
    readonly memory?: {
        readonly limits?: WaStoreMemoryLimitSelection
        readonly cacheTtlMs?: {
            /**
             * Retry tracker TTL – how long an outbound replay payload stays
             * resendable after the original send. Default: 60 000 (1 min).
             * Match this to your worst-case clock skew + network delay
             * between you and slow peers; longer = more replay coverage at
             * the cost of more memory.
             */
            readonly retryMs?: number
            /**
             * Group metadata cache TTL – how long a cached subject/
             * participant list is trusted before a fresh IQ is issued.
             * Default: 300 000 (5 min). Shorter = fresher participant lists,
             * more IQ traffic; longer = better throughput, slightly stale
             * data between server-pushed group events.
             */
            readonly groupMetadataMs?: number
            /**
             * Chat metadata cache TTL – how long cached per-chat disappearing
             * settings are reused. Default: 1 800 000 (30 min). Changes arrive
             * as protocol messages regardless, so this only bounds staleness
             * for chats nothing has touched.
             */
            readonly chatMetadataMs?: number
            /**
             * Device list cache TTL – how long a cached per-user device set
             * is reused before re-running usync. Default: 300 000 (5 min).
             * Devices changing during this window are still picked up via
             * the push-notification path; the TTL only affects the
             * proactive refresh window.
             */
            readonly deviceListMs?: number
            /**
             * Message-secret TTL – how long the addon-decryption cache
             * keeps a parent message's secret around. Default: 1 800 000
             * (30 min). Cover the typical reaction/edit window for active
             * chats; addons arriving after expiry fall back to the
             * `messages` store lookup (or quietly fail when it's `'none'`).
             */
            readonly messageSecretMs?: number
        }
    }
}

/**
 * Strict options keyed by backend *name*. Every persistence domain in
 * `providers` is `Required` - the compiler refuses partial coverage and the
 * IDE highlights the missing keys. Cache domains stay opt-in (default
 * `'memory'`).
 *
 * Each name is assumed to cover the full domain matrix. `createStore()`
 * itself infers the backend map and uses
 * {@link WaCreateStoreOptionsStrictFor}, which additionally rejects routing
 * a domain to a backend that doesn't implement it; annotate with this one
 * only when the backend values aren't in scope.
 */
export interface WaCreateStoreOptionsStrict<B extends string> extends Omit<
    WaCreateStoreOptions<B>,
    'backends' | 'providers'
> {
    readonly backends: Readonly<Record<B, WaAnyStoreBackend>>
    readonly providers: Required<NonNullable<WaCreateStoreOptions<B>['providers']>>
}

/**
 * Strict options resolved against the backend map itself - the shape
 * {@link createStore} infers when `backends` is set.
 *
 * Same `Required` coverage rule as {@link WaCreateStoreOptionsStrict}, with
 * one addition: each domain only accepts the backends whose bundle actually
 * declares it, so a typo or a partial backend fails to compile instead of
 * throwing on the first `store.session(...)`.
 */
export interface WaCreateStoreOptionsStrictFor<TBackends extends WaStoreBackendMap> extends Omit<
    WaCreateStoreOptions<string, TBackends>,
    'backends' | 'providers'
> {
    readonly backends: TBackends
    readonly providers: Required<NonNullable<WaCreateStoreOptions<string, TBackends>['providers']>>
}

export interface WaStoreMemoryLimitSelection {
    readonly appStateSyncKeys?: number
    readonly appStateCollectionEntries?: number
    readonly signalPreKeys?: number
    readonly signalSessions?: number
    readonly signalRemoteIdentities?: number
    readonly senderKeys?: number
    readonly senderDistributions?: number
    readonly groupMetadataGroups?: number
    readonly chatMetadataChats?: number
    readonly deviceListUsers?: number
    readonly messages?: number
    readonly messageSecrets?: number
    readonly retryOutboundMessages?: number
    readonly retryInboundCounters?: number
    readonly threads?: number
    readonly contacts?: number
    readonly privacyTokens?: number
}
