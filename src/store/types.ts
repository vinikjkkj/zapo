import type { WaAppStateStore } from '@store/contracts/appstate.store'
import type { WaAuthStore } from '@store/contracts/auth.store'
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
    readonly deviceList: WaDeviceListStore
    readonly messages: WaMessageStore
    readonly messageSecret: WaMessageSecretStore
    readonly threads: WaThreadStore
    readonly contacts: WaContactStore
    readonly privacyToken: WaPrivacyTokenStore
    destroyCaches(): Promise<void>
    destroy(): Promise<void>
}

export interface WaStore {
    session(sessionId: string): WaStoreSession
    destroyCaches(): Promise<void>
    destroy(): Promise<void>
}

export interface WaStoreBackend {
    readonly stores: {
        readonly auth: (sessionId: string) => WaAuthStore
        readonly signal: (sessionId: string) => WaSignalStore
        readonly preKey: (sessionId: string) => WaPreKeyStore
        readonly session: (sessionId: string) => WaSessionStore
        readonly identity: (sessionId: string) => WaIdentityStore
        readonly senderKey: (sessionId: string) => WaSenderKeyStore
        readonly appState: (sessionId: string) => WaAppStateStore
        readonly messages: (sessionId: string) => WaMessageStore
        readonly threads: (sessionId: string) => WaThreadStore
        readonly contacts: (sessionId: string) => WaContactStore
        readonly privacyToken: (sessionId: string) => WaPrivacyTokenStore
    }
    readonly caches: {
        readonly retry: (sessionId: string) => WaRetryStore
        readonly groupMetadata: (sessionId: string) => WaGroupMetadataStore
        readonly deviceList: (sessionId: string) => WaDeviceListStore
        readonly messageSecret: (sessionId: string) => WaMessageSecretStore
    }
}

export type WaStoreDomain = keyof WaStoreBackend['stores']
export type WaCacheDomain = keyof WaStoreBackend['caches']

export interface WaCreateStoreOptions<B extends string = string> {
    /**
     * Named persistent backends (e.g. `{ sqlite: createSqliteStore(...) }`).
     * Each key here is a backend id you can reference under {@link providers}
     * and {@link cacheProviders}. The literal strings `'memory'` and `'none'`
     * are reserved and don't need a backend entry.
     */
    readonly backends?: Readonly<Record<B, WaStoreBackend>>
    /**
     * Per-domain provider selection for the persistent (non-cache) stores.
     * `auth` is required – every other domain falls back to `'memory'` (or
     * `'none'` for the mailbox domains) when omitted.
     */
    readonly providers?: {
        /**
         * Holds the device's pairing credentials: noise key pair, signed
         * identity, registration info, signed prekey, ADV secret, server
         * static key, routing info, account metadata. **This is what proves
         * "I am this paired device" to WhatsApp.** Lose it and the next
         * connect has to re-pair from scratch (QR/link-code). No default  -
         * pick a persistent backend in production.
         */
        readonly auth?: B | 'memory'
        /**
         * Signal protocol identities and the meta row (`server_has_prekeys`,
         * `next_prekey_id`, signed-prekey rotation timestamp). Splits with
         * {@link session}/{@link identity}/{@link preKey} in backends that
         * partition the Signal state; some backends collapse them. Default:
         * `'memory'` – fine for short-lived sessions; persist it in
         * production so re-keying / digest checks survive restarts.
         */
        readonly signal?: B | 'memory'
        /**
         * Signal one-time prekey pool. The server hands these out to peers
         * starting fresh sessions with you. Losing them forces fallback to
         * the signed-prekey-only flow (slower / less forward-secret per
         * session). Default: `'memory'`.
         */
        readonly preKey?: B | 'memory'
        /**
         * Signal sessions (the per-peer Double Ratchet state). Losing this
         * forces a transparent re-handshake on the next message to/from that
         * peer – your identity key doesn't change, so no "security code
         * changed" notice fires on the peer. Default: `'memory'`.
         */
        readonly session?: B | 'memory'
        /**
         * Remote identity keys per peer device. The library compares the
         * stored key against the server-reported one on every send to detect
         * device-takeover (`identity mismatch`). Default: `'memory'`.
         */
        readonly identity?: B | 'memory'
        /**
         * Sender-key state for group encryption: your own outgoing sender
         * key per group + incoming sender keys from other participants + the
         * delivery bookkeeping. Losing it makes you re-distribute your
         * sender key to every member on the next group send. Default:
         * `'memory'`.
         */
        readonly senderKey?: B | 'memory'
        /**
         * App-state sync keys + per-collection version/hash/index map
         * (mute, archive, pin, contacts, labels, ...). This is what lets
         * the lib emit `mutation` events and keep parity with the phone.
         * Wiping it triggers a full re-sync on next connect (slow, lots of
         * traffic). Default: `'memory'`.
         */
        readonly appState?: B | 'memory'
        /**
         * Optional archive of every message you received/sent. Required if
         * you want to call `client.message.send(..., { quote })` later for
         * messages this device never had in RAM, or to look up message
         * secrets for addon decryption after a restart. Default: `'none'`
         * (no archive – events fire but aren't stored).
         */
        readonly messages?: B | 'memory' | 'none'
        /**
         * Per-chat thread metadata (last message id/time, unread count,
         * disappearing-mode setting). Used by some UIs to render a chat
         * list; not required for messaging. Default: `'none'`.
         */
        readonly threads?: B | 'memory' | 'none'
        /**
         * Contact book mirror (push names, phone numbers, business labels).
         * Populated by app-state mutations and history sync. Not required
         * for messaging but useful for display names without an extra
         * profile fetch. Default: `'none'`.
         */
        readonly contacts?: B | 'memory' | 'none'
        /**
         * Trusted-contact-token cache – short-lived tokens the lib issues
         * to peers so they can verify that messages from you are authentic.
         * Persisting avoids re-issuing on every reconnect (saves IQs).
         * Default: `'memory'`.
         */
        readonly privacyToken?: B | 'memory'
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
        readonly retry?: B | 'memory' | 'none'
        /**
         * Group metadata (subject, participants, settings) keyed by group
         * JID. Populated by `client.group.queryGroupMetadata`/server pushes
         * and consumed during fan-out so the library knows who to encrypt
         * to. Disabling forces a metadata IQ on every group send – the
         * server **rate-limits** this aggressively and active group accounts
         * will get throttled (or temporarily blocked) without a cache.
         * Default: `'memory'`.
         */
        readonly groupMetadata?: B | 'memory' | 'none'
        /**
         * Per-user device list (which `:device` JIDs each contact has online).
         * Populated by usync queries; consumed on every send to pick the
         * fan-out set. Disabling forces a usync round-trip per recipient on
         * every send. Default: `'memory'`.
         */
        readonly deviceList?: B | 'memory' | 'none'
        /**
         * Message-secret cache: maps `stanzaId → { senderJid, secret }` so
         * addon decryption (poll votes, reactions, encrypted edits, ...) can
         * find the parent message's 32-byte secret. Falls back to the
         * `messages` store when set. Disable only if `messages` is persistent
         * – otherwise addon auto-decrypt loses parents after restart.
         * Default: `'memory'`.
         */
        readonly messageSecret?: B | 'memory' | 'none'
    }
    /**
     * Memory-store tuning for the built-in `'memory'` providers. `limits`
     * caps per-domain entry counts (LRU eviction once exceeded); `cacheTtlMs`
     * controls how long cache entries live before being evicted. Tune these
     * up for high-traffic accounts (lots of groups / contacts) and down on
     * memory-constrained runtimes.
     */
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

export interface WaStoreMemoryLimitSelection {
    readonly appStateSyncKeys?: number
    readonly appStateCollectionEntries?: number
    readonly signalPreKeys?: number
    readonly signalSessions?: number
    readonly signalRemoteIdentities?: number
    readonly senderKeys?: number
    readonly senderDistributions?: number
    readonly groupMetadataGroups?: number
    readonly deviceListUsers?: number
    readonly messages?: number
    readonly messageSecrets?: number
    readonly retryOutboundMessages?: number
    readonly retryInboundCounters?: number
    readonly threads?: number
    readonly contacts?: number
    readonly privacyTokens?: number
}
