/**
 * Public entry point for the fake server.
 *
 * Phase 1 surface:
 *   - `FakeWaServer.start()` boots the WS listener and instantiates a fresh
 *     ephemeral root CA + server static keypair.
 *   - Each accepted connection is wrapped in a `WaFakeConnectionPipeline`
 *     that drives the noise XX handshake to completion and pushes a
 *     `<success/>` stanza.
 *   - Tests are exposed:
 *       * `noiseRootCa` — feed it into `WaClient.testHooks.noiseRootCa`
 *         so the lib trusts our ephemeral CA.
 *       * `onPipeline` — observe each pipeline (authenticated info, stanzas
 *         the client sends after success).
 */

import type { WaFakeConnection } from '../infra/WaFakeConnection'
import {
    type WaFakeAuthenticatedInfo,
    WaFakeConnectionPipeline
} from '../infra/WaFakeConnectionPipeline'
import { WaFakeWsServer, type WaFakeWsServerListenInfo } from '../infra/WaFakeWsServer'
import { type FakeNoiseRootCa, generateFakeNoiseRootCa } from '../protocol/auth/cert-chain'
import {
    buildAppStateSyncFullResult,
    buildAppStateSyncResult,
    buildServerSyncNotification,
    type BuildServerSyncNotificationInput,
    type FakeAppStateCollectionPayload,
    parseAppStateSyncRequest
} from '../protocol/iq/appstate-sync'
import { buildPreKeyFetchResult } from '../protocol/iq/prekey-fetch'
import {
    buildIqError,
    buildIqResult,
    type WaFakeIqHandler,
    type WaFakeIqMatcher,
    type WaFakeIqResponder,
    WaFakeIqRouter
} from '../protocol/iq/router'
import { buildUsyncDevicesResult } from '../protocol/iq/usync'
import { buildNotification } from '../protocol/push/notification'
import { type ClientPreKeyBundle, parsePreKeyUploadIq } from '../protocol/signal/prekey-upload'
import {
    FakeMediaStore,
    type PublishedMediaBlob,
    type PublishMediaInput
} from '../state/fake-media-store'
import { type BinaryNode } from '../transport/codec'
import { type SignalKeyPair, X25519 } from '../transport/crypto'

import { FakePairingDriver, type FakePairingDriverOptions } from './FakePairingDriver'
import { type CreateFakePeerOptions, FakePeer } from './FakePeer'
import { type AuthenticatedPipelineListener, Scenario } from './Scenario'

export interface FakeWaServerOptions {
    readonly host?: string
    readonly port?: number
    readonly path?: string
}

export interface FakeWaServerNoiseRootCa {
    readonly publicKey: Uint8Array
    readonly serial: number
}

export type FakeWaServerPipelineListener = (pipeline: WaFakeConnectionPipeline) => void

export interface ExpectIqOptions {
    /** How long to wait before rejecting (default: 2000ms). */
    readonly timeoutMs?: number
}

export interface ExpectStanzaOptions {
    /** How long to wait before rejecting (default: 2000ms). */
    readonly timeoutMs?: number
}

export interface StanzaMatcher {
    /** Stanza tag (e.g. 'iq', 'message', 'receipt', 'notification'). */
    readonly tag?: string
    /** Match against `attrs.type`. */
    readonly type?: string
    /** Match against `attrs.xmlns`. */
    readonly xmlns?: string
    /** Match against `attrs.from`. */
    readonly from?: string
    /** Match against `attrs.to`. */
    readonly to?: string
    /** First child tag inside the stanza. */
    readonly childTag?: string
}

interface PendingIqExpectation {
    readonly matcher: WaFakeIqMatcher
    readonly resolve: (iq: BinaryNode) => void
    readonly reject: (error: Error) => void
    readonly timer: NodeJS.Timeout
}

interface PendingStanzaExpectation {
    readonly matcher: StanzaMatcher
    readonly resolve: (node: BinaryNode) => void
    readonly reject: (error: Error) => void
    readonly timer: NodeJS.Timeout
}

interface PendingPreKeyBundleWaiter {
    readonly resolve: (bundle: ClientPreKeyBundle) => void
    readonly reject: (error: Error) => void
    readonly timer: NodeJS.Timeout
}

export class FakeWaServer {
    private readonly wsServer: WaFakeWsServer
    private readonly pipelines = new Set<WaFakeConnectionPipeline>()
    private readonly iqRouter = new WaFakeIqRouter()
    private readonly capturedStanzas: BinaryNode[] = []
    private readonly pendingIqExpectations = new Set<PendingIqExpectation>()
    private readonly pendingStanzaExpectations = new Set<PendingStanzaExpectation>()
    private readonly authenticatedListeners = new Set<AuthenticatedPipelineListener>()
    private readonly preKeyBundleWaiters = new Set<PendingPreKeyBundleWaiter>()
    private readonly inboundStanzaListeners = new Set<(node: BinaryNode) => void>()
    private rootCa: FakeNoiseRootCa | null = null
    private serverStaticKeyPair: SignalKeyPair | null = null
    private listenInfo: WaFakeWsServerListenInfo | null = null
    private pipelineListener: FakeWaServerPipelineListener | null = null
    private rejectMode: { readonly code: number; readonly reason: string } | null = null
    private capturedPreKeyBundle: ClientPreKeyBundle | null = null
    private nextPreKeyNotificationId = 1
    private readonly mediaStore = new FakeMediaStore()
    /**
     * Per-collection app-state payload providers. The auto IQ handler
     * consults this map for each requested collection: if a provider is
     * registered, it produces a `<patches>`/`<snapshot>` payload that
     * advances the lib's collection state. Missing collections fall back
     * to the empty-success response.
     */
    private readonly appStateCollectionProviders = new Map<
        string,
        () => Promise<FakeAppStateCollectionPayload | null> | FakeAppStateCollectionPayload | null
    >()

    public constructor(options: FakeWaServerOptions = {}) {
        this.wsServer = new WaFakeWsServer(options)
        this.wsServer.onConnection((connection) => this.handleConnection(connection))
        // Auto-handle the client's PreKey upload IQ: capture the bundle, ack
        // with a plain `<iq type="result"/>` so the lib's upload promise
        // resolves successfully, and unblock any pending bundle waiters.
        this.iqRouter.register({
            label: 'prekey-upload',
            matcher: { xmlns: 'encrypt', type: 'set' },
            respond: (iq) => {
                try {
                    const bundle = parsePreKeyUploadIq(iq)
                    this.capturedPreKeyBundle = bundle
                    for (const waiter of this.preKeyBundleWaiters) {
                        waiter.resolve(bundle)
                    }
                    this.preKeyBundleWaiters.clear()
                } catch {
                    // Fall through and let the lib see a `result` regardless;
                    // tests can still inspect captured stanzas.
                }
                return buildIqResult(iq)
            }
        })

        // Reply to `<iq xmlns="encrypt" type="get"><digest/></iq>` with a 404
        // error so the lib triggers a fresh prekey upload (which we then
        // capture via the `prekey-upload` handler above).
        this.iqRouter.register({
            label: 'signal-digest',
            matcher: { xmlns: 'encrypt', type: 'get', childTag: 'digest' },
            respond: (iq) => buildIqError(iq, { code: 404, text: 'item-not-found' })
        })

        // Auto-respond to the media_conn IQ (`<iq xmlns="w:m" type="set"><media_conn/></iq>`)
        // by pointing the lib at our HTTP listener. The lib's
        // `parseMediaConnResponse` only validates `auth`, `ttl > 0`,
        // and at least one `<host hostname=...>` child — it doesn't
        // care about the host being a real domain, so we hand it the
        // ws server's host:port verbatim. Tests that use absolute
        // `directPath` URLs (`http://127.0.0.1:port/...`) bypass this
        // entirely; the handler is here for the lib's media uploads
        // and for download paths that pass relative directPaths.
        this.iqRouter.register({
            label: 'media-conn',
            matcher: { xmlns: 'w:m', type: 'set', childTag: 'media_conn' },
            respond: (iq) => {
                const info = this.requireListening()
                const result = buildIqResult(iq)
                return {
                    ...result,
                    attrs: { ...result.attrs, from: 's.whatsapp.net' },
                    content: [
                        {
                            tag: 'media_conn',
                            attrs: { auth: 'fake-media-auth', ttl: '3600' },
                            content: [
                                {
                                    tag: 'host',
                                    attrs: {
                                        hostname: `${info.host}:${info.port}`
                                    }
                                }
                            ]
                        }
                    ]
                }
            }
        })

        // Auto-respond to `<iq xmlns="w:sync:app:state" type="set"><sync>...</sync></iq>`.
        // For each requested collection: if a provider has been
        // registered via `provideAppStateCollection`, it produces a
        // `<patches>`/`<snapshot>` payload (real encrypted mutations);
        // otherwise the collection echoes back as empty success at the
        // inbound version. This unblocks both the fully-mocked and the
        // fully-instrumented sync flows from a single handler.
        this.iqRouter.register({
            label: 'app-state-sync',
            matcher: { xmlns: 'w:sync:app:state', type: 'set' },
            respond: async (iq) => {
                if (this.appStateCollectionProviders.size === 0) {
                    return buildAppStateSyncResult(iq)
                }
                const requests = parseAppStateSyncRequest(iq)
                const payloads: FakeAppStateCollectionPayload[] = []
                for (const request of requests) {
                    const provider = this.appStateCollectionProviders.get(request.name)
                    if (!provider) continue
                    const payload = await provider()
                    if (payload) {
                        payloads.push(payload)
                    }
                }
                return buildAppStateSyncFullResult(iq, { payloads })
            }
        })
    }

    /**
     * Register an IQ handler. The fake server matches incoming IQ stanzas
     * against the registered handlers in registration order; the first
     * match wins.
     */
    public registerIqHandler(
        matcher: WaFakeIqMatcher,
        respond: WaFakeIqResponder,
        label?: string
    ): () => void {
        const handler: WaFakeIqHandler = { matcher, respond, label }
        return this.iqRouter.register(handler)
    }

    /**
     * Register a callback that runs each time a pipeline reaches the
     * authenticated state (after the noise handshake completes and the
     * success node has been pushed). The callback may push stanzas via
     * `pipeline.sendStanza`.
     */
    public onAuthenticatedPipeline(listener: AuthenticatedPipelineListener): () => void {
        this.authenticatedListeners.add(listener)
        return () => this.authenticatedListeners.delete(listener)
    }

    /**
     * Builds the scenario for this server and runs the synchronous
     * configuration block. The builder is the recommended way to script
     * fake server behavior in tests.
     *
     * Example:
     *     server.scenario((s) => {
     *         s.onIq({ xmlns: 'usync' }).respondWith(buildUsyncResult([...]))
     *         s.afterAuth(async (pipeline) => {
     *             await pipeline.sendStanza(buildIncomingMessage(...))
     *         })
     *     })
     */
    public scenario(configure: (s: Scenario) => void): void {
        configure(new Scenario(this))
    }

    /**
     * Returns a promise that resolves with the next inbound stanza matching
     * the given pattern. If a matching stanza was already captured before
     * the call, it resolves immediately. Rejects after `timeoutMs` if no
     * match arrives.
     */
    public expectIq(matcher: WaFakeIqMatcher, options: ExpectIqOptions = {}): Promise<BinaryNode> {
        const timeoutMs = options.timeoutMs ?? 2_000

        // Check stanzas already captured.
        for (const captured of this.capturedStanzas) {
            if (matchesIq(captured, matcher)) {
                return Promise.resolve(captured)
            }
        }

        return new Promise((resolve, reject) => {
            const expectation: PendingIqExpectation = {
                matcher,
                resolve: (iq) => {
                    this.pendingIqExpectations.delete(expectation)
                    clearTimeout(expectation.timer)
                    resolve(iq)
                },
                reject: (error) => {
                    this.pendingIqExpectations.delete(expectation)
                    clearTimeout(expectation.timer)
                    reject(error)
                },
                timer: setTimeout(() => {
                    this.pendingIqExpectations.delete(expectation)
                    reject(
                        new Error(
                            `expectIq timed out after ${timeoutMs}ms (${describeMatcher(matcher)})`
                        )
                    )
                }, timeoutMs)
            }
            this.pendingIqExpectations.add(expectation)
        })
    }

    /** Returns a snapshot of every stanza the client has sent so far. */
    public capturedStanzaSnapshot(): readonly BinaryNode[] {
        return this.capturedStanzas.slice()
    }

    /**
     * Returns a promise that resolves with the next inbound stanza of any
     * tag matching the given pattern. If a matching stanza was already
     * captured before the call, it resolves immediately. Rejects after
     * `timeoutMs` if no match arrives.
     *
     * `expectIq` is a convenience over this method specialized for IQs.
     */
    public expectStanza(
        matcher: StanzaMatcher,
        options: ExpectStanzaOptions = {}
    ): Promise<BinaryNode> {
        const timeoutMs = options.timeoutMs ?? 2_000

        for (const captured of this.capturedStanzas) {
            if (matchesStanza(captured, matcher)) {
                return Promise.resolve(captured)
            }
        }

        return new Promise((resolve, reject) => {
            const expectation: PendingStanzaExpectation = {
                matcher,
                resolve: (node) => {
                    this.pendingStanzaExpectations.delete(expectation)
                    clearTimeout(expectation.timer)
                    resolve(node)
                },
                reject: (error) => {
                    this.pendingStanzaExpectations.delete(expectation)
                    clearTimeout(expectation.timer)
                    reject(error)
                },
                timer: setTimeout(() => {
                    this.pendingStanzaExpectations.delete(expectation)
                    reject(
                        new Error(
                            `expectStanza timed out after ${timeoutMs}ms (${describeStanzaMatcher(matcher)})`
                        )
                    )
                }, timeoutMs)
            }
            this.pendingStanzaExpectations.add(expectation)
        })
    }

    /**
     * Pushes the same stanza to every authenticated pipeline. Useful for
     * tests that have multiple connected clients (a rare scenario today,
     * but cheap to expose).
     *
     * Returns the number of pipelines the stanza was sent to.
     */
    public async broadcastStanza(node: BinaryNode): Promise<number> {
        const tasks: Array<Promise<void>> = []
        for (const pipeline of this.pipelines) {
            tasks.push(pipeline.sendStanza(node).catch(() => undefined))
        }
        await Promise.all(tasks)
        return tasks.length
    }

    /**
     * Waits until at least one pipeline has reached the authenticated
     * state. Resolves immediately if a pipeline is already authenticated.
     * Rejects after `timeoutMs` if none becomes authenticated in time.
     */
    public waitForAuthenticatedPipeline(timeoutMs = 5_000): Promise<WaFakeConnectionPipeline> {
        for (const pipeline of this.pipelines) {
            if (pipeline.isAuthenticated()) {
                return Promise.resolve(pipeline)
            }
        }
        return this.waitForNextAuthenticatedPipeline(timeoutMs)
    }

    /**
     * Waits for the **next** pipeline to reach the authenticated state,
     * even if there is already a pipeline authenticated. Useful after a
     * lib-side reconnect (e.g. after pairing) where the existing pipeline
     * is about to close and a fresh one will replace it.
     */
    public waitForNextAuthenticatedPipeline(timeoutMs = 5_000): Promise<WaFakeConnectionPipeline> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () =>
                    reject(
                        new Error(`waitForNextAuthenticatedPipeline timed out after ${timeoutMs}ms`)
                    ),
                timeoutMs
            )
            const unregister = this.onAuthenticatedPipeline((pipeline) => {
                clearTimeout(timer)
                unregister()
                resolve(pipeline)
            })
        })
    }

    /**
     * Pushes a `<notification type="server_sync"/>` listing the given
     * collection names. The lib's incoming notification handler reacts
     * by triggering an `appStateSync.sync()` round, which the
     * auto-registered `app-state-sync` IQ handler answers via the
     * registered providers (or empty success if none are registered).
     *
     * Resolves once the notification has been written to the wire.
     */
    public async pushServerSyncNotification(
        pipeline: WaFakeConnectionPipeline,
        input: BuildServerSyncNotificationInput
    ): Promise<void> {
        await pipeline.sendStanza(buildServerSyncNotification(input))
    }

    /**
     * Encrypts the supplied plaintext via the lib's real
     * `WaMediaCrypto.encryptBytes`, stores the resulting ciphertext
     * keyed by a fresh random URL path, and returns the metadata
     * (mediaKey + sha-256s + path) the test must embed in any message
     * proto / `historySyncNotification` / `ExternalBlobReference` it
     * hands to the client.
     *
     * The lib downloads the bytes from the fake server's HTTP listener
     * (via the absolute URL exposed by `mediaUrl(path)`), then runs
     * its own `WaMediaCrypto.decryptBytes` against the ciphertext.
     */
    public async publishMediaBlob(input: PublishMediaInput): Promise<PublishedMediaBlob> {
        return this.mediaStore.publish(input)
    }

    /**
     * Builds the absolute `http://host:port/<path>` URL the lib should
     * use to download a previously-published media blob. Tests stamp
     * the result into a message proto's `directPath` so that the lib's
     * media transfer client picks it up verbatim (the lib accepts both
     * `http://` and `https://` absolute directPaths and bypasses its
     * default media-host fallback).
     */
    public mediaUrl(path: string): string {
        const info = this.requireListening()
        const normalized = path.startsWith('/') ? path : `/${path}`
        return `http://${info.host}:${info.port}${normalized}`
    }

    /**
     * Registers a payload provider for a given app-state collection.
     * The provider is invoked once per inbound app-state sync IQ that
     * names the collection, and the returned payload is shipped inside
     * the `<sync><collection>` response. Returning `null` falls back to
     * the empty-success default.
     *
     * Used by tests that ship real encrypted snapshots/patches: the
     * provider typically wraps a `FakeAppStateCollection` and returns
     * its `encodeSnapshot()` (first round) then `encodePendingPatch()`
     * (subsequent rounds with queued mutations).
     *
     * Returns an unsubscribe function that clears the provider.
     */
    public provideAppStateCollection(
        name: string,
        provider: () => Promise<FakeAppStateCollectionPayload | null> | FakeAppStateCollectionPayload | null
    ): () => void {
        this.appStateCollectionProviders.set(name, provider)
        return () => {
            this.appStateCollectionProviders.delete(name)
        }
    }

    /**
     * Pushes a `<notification type="encrypt"><count value="0"/></notification>`
     * to the given pipeline. The lib's `WAWebHandlePreKeyLow` handler reacts
     * to this by sending a fresh PreKey upload IQ, which the fake server
     * automatically captures via its built-in `prekey-upload` IQ handler.
     *
     * Returns a promise that resolves once the upload bundle has been
     * captured (or immediately if it was captured earlier).
     */
    public async triggerPreKeyUpload(
        pipeline: WaFakeConnectionPipeline,
        timeoutMs = 5_000
    ): Promise<ClientPreKeyBundle> {
        if (this.capturedPreKeyBundle) {
            return this.capturedPreKeyBundle
        }
        const bundlePromise = this.awaitPreKeyBundle(timeoutMs)
        const id = `prekey-low-${this.nextPreKeyNotificationId++}`
        await pipeline.sendStanza(
            buildNotification({
                id,
                type: 'encrypt',
                content: [
                    {
                        tag: 'count',
                        attrs: { value: '0' }
                    }
                ]
            })
        )
        return bundlePromise
    }

    /**
     * Returns a promise that resolves with the client's PreKey upload
     * bundle as soon as it has been captured. Resolves immediately if a
     * bundle was already captured. Rejects after `timeoutMs` if none has
     * arrived.
     */
    public awaitPreKeyBundle(timeoutMs = 5_000): Promise<ClientPreKeyBundle> {
        if (this.capturedPreKeyBundle) {
            return Promise.resolve(this.capturedPreKeyBundle)
        }
        return new Promise((resolve, reject) => {
            const waiter: PendingPreKeyBundleWaiter = {
                resolve: (bundle) => {
                    clearTimeout(waiter.timer)
                    this.preKeyBundleWaiters.delete(waiter)
                    resolve(bundle)
                },
                reject: (error) => {
                    clearTimeout(waiter.timer)
                    this.preKeyBundleWaiters.delete(waiter)
                    reject(error)
                },
                timer: setTimeout(() => {
                    this.preKeyBundleWaiters.delete(waiter)
                    reject(new Error(`awaitPreKeyBundle timed out after ${timeoutMs}ms`))
                }, timeoutMs)
            }
            this.preKeyBundleWaiters.add(waiter)
        })
    }

    /** Snapshot of the captured PreKey bundle, or `null` if none seen yet. */
    public capturedPreKeyBundleSnapshot(): ClientPreKeyBundle | null {
        return this.capturedPreKeyBundle
    }

    /**
     * Creates a fake peer that can encrypt messages for the connected
     * client. The peer lazily resolves the client's PreKey bundle on its
     * first send (using whatever bundle was captured by then).
     *
     * Also auto-registers IQ handlers so the lib can resolve this peer
     * via `usync` (devices fetch) and `<key_fetch>` (prekey bundle fetch)
     * — required for the lib's `client.sendMessage` to establish a
     * Signal session with the peer.
     */
    public async createFakePeer(
        options: CreateFakePeerOptions,
        pipeline: WaFakeConnectionPipeline
    ): Promise<FakePeer> {
        const peer = await FakePeer.create(options, {
            bundleResolver: () => this.awaitPreKeyBundle(),
            pushStanza: (stanza) => pipeline.sendStanza(stanza),
            subscribeInboundMessages: (listener) => {
                const wrapped = (node: BinaryNode): void => {
                    if (node.tag !== 'message') return
                    listener(node)
                }
                this.inboundStanzaListeners.add(wrapped)
                return () => {
                    this.inboundStanzaListeners.delete(wrapped)
                }
            }
        })

        // Auto-register usync handler for THIS peer's jid.
        this.registerIqHandler(
            { xmlns: 'usync', type: 'get', childTag: 'usync' },
            (iq) => buildUsyncDevicesResult(iq, [{ userJid: peer.jid, deviceIds: [0] }]),
            `usync:${peer.jid}`
        )

        // Auto-register prekey-fetch handler that returns this peer's bundle.
        // The lib's `fetchKeyBundles` sends `<iq xmlns="encrypt" type="get"><key><user jid=.../></key></iq>`
        this.registerIqHandler(
            { xmlns: 'encrypt', type: 'get', childTag: 'key' },
            (iq) => {
                const oneTime = peer.keyBundle.oneTimePreKeys[0]
                return buildPreKeyFetchResult(iq, [
                    {
                        userJid: peer.jid,
                        registrationId: peer.keyBundle.registrationId,
                        identityPublicKey: peer.keyBundle.identityKeyPair.pubKey,
                        signedPreKey: {
                            id: peer.keyBundle.signedPreKey.id,
                            publicKey: peer.keyBundle.signedPreKey.keyPair.pubKey,
                            signature: peer.keyBundle.signedPreKey.signature
                        },
                        ...(oneTime
                            ? {
                                  oneTimePreKey: {
                                      id: oneTime.id,
                                      publicKey: oneTime.keyPair.pubKey
                                  }
                              }
                            : {})
                    }
                ])
            },
            `prekey-fetch:${peer.jid}`
        )

        return peer
    }

    /**
     * Drives the QR-pairing flow with a real, freshly-created `WaClient`
     * end-to-end via the wire (no auth-store stubbing).
     *
     * The driver:
     *   1. Sends a `pair-device` IQ with 6 random refs.
     *   2. Awaits the `advSecretKey` callback (the test extracts it from
     *      the `auth_qr` event the lib emits as soon as it sees the refs).
     *   3. Builds an `ADVSignedDeviceIdentityHMAC` using a fresh fake
     *      primary keypair and the supplied `advSecretKey`, and pushes
     *      a `pair-success` IQ.
     *
     * The lib's pairing flow then verifies the HMAC, the account
     * signature, replies with `<pair-device-sign>`, persists the new
     * credentials and emits `auth_paired`.
     */
    public async runPairing(
        pipeline: WaFakeConnectionPipeline,
        options: FakePairingDriverOptions,
        companionMaterialResolver: () => Promise<{
            readonly advSecretKey: Uint8Array
            readonly identityPublicKey: Uint8Array
        }>
    ): Promise<void> {
        const driver = new FakePairingDriver(options, {
            pipeline,
            companionMaterialResolver
        })
        await driver.run()
    }

    /**
     * Make the fake server reject every new connection by closing the
     * websocket immediately after `accept`. Useful for testing the lib's
     * reaction to a server-side handshake / auth failure.
     *
     * Pass `null` to clear the reject mode.
     */
    public setRejectMode(info: { readonly code?: number; readonly reason?: string } | null): void {
        if (info === null) {
            this.rejectMode = null
            return
        }
        this.rejectMode = {
            code: info.code ?? 1011,
            reason: info.reason ?? 'fake-server reject mode'
        }
    }

    public static async start(options: FakeWaServerOptions = {}): Promise<FakeWaServer> {
        const server = new FakeWaServer(options)
        await server.listen()
        return server
    }

    public get url(): string {
        return this.requireListening().url
    }

    public get host(): string {
        return this.requireListening().host
    }

    public get port(): number {
        return this.requireListening().port
    }

    /**
     * The ephemeral root CA the fake server signs cert chains with. Tests
     * pass this into `WaClient` via `testHooks.noiseRootCa` so that the lib
     * runs the full certificate verification path against our trust root.
     */
    public get noiseRootCa(): FakeWaServerNoiseRootCa {
        const root = this.requireRootCa()
        return { publicKey: root.publicKey, serial: root.serial }
    }

    public onPipeline(listener: FakeWaServerPipelineListener): void {
        this.pipelineListener = listener
    }

    public async listen(): Promise<void> {
        if (this.listenInfo) {
            return
        }
        ;[this.rootCa, this.serverStaticKeyPair] = await Promise.all([
            generateFakeNoiseRootCa(),
            X25519.generateKeyPair()
        ])
        // Wire the HTTP request handler BEFORE the listen call so we
        // never race against an inbound media GET that lands while the
        // listener is still bare. The handler serves blobs registered
        // via `publishMediaBlob`; everything else 404s.
        this.wsServer.setHttpRequestHandler((req, res) => {
            const url = req.url ?? ''
            const path = url.split('?')[0]
            const blob = this.mediaStore.get(path)
            if (!blob) {
                res.statusCode = 404
                res.end()
                return
            }
            res.statusCode = 200
            res.setHeader('content-type', 'application/octet-stream')
            res.setHeader('content-length', String(blob.encryptedBytes.byteLength))
            res.end(Buffer.from(blob.encryptedBytes))
        })
        this.listenInfo = await this.wsServer.listen()
    }

    public async stop(): Promise<void> {
        // Pipelines own the connections; closing them severs the websocket.
        // We additionally race the close to make `stop` deterministic.
        this.pipelines.clear()
        await this.wsServer.close()
        this.listenInfo = null
        this.rootCa = null
        this.serverStaticKeyPair = null
    }

    private handleConnection(connection: WaFakeConnection): void {
        if (this.rejectMode) {
            connection.close(this.rejectMode.code, this.rejectMode.reason)
            return
        }
        if (!this.rootCa || !this.serverStaticKeyPair) {
            connection.close(1011, 'fake server not initialized')
            return
        }
        const pipeline = new WaFakeConnectionPipeline({
            connection,
            rootCa: this.rootCa,
            serverStaticKeyPair: this.serverStaticKeyPair,
            iqRouter: this.iqRouter
        })
        this.pipelines.add(pipeline)
        pipeline.setEvents({
            onAuthenticated: () => {
                for (const listener of this.authenticatedListeners) {
                    void listener(pipeline)
                }
            },
            onStanza: (node) => this.handleCapturedStanza(node),
            onClose: () => this.pipelines.delete(pipeline)
        })
        this.pipelineListener?.(pipeline)
    }

    private handleCapturedStanza(node: BinaryNode): void {
        this.capturedStanzas.push(node)

        for (const listener of this.inboundStanzaListeners) {
            try {
                listener(node)
            } catch {
                // Listeners are best-effort.
            }
        }

        for (const expectation of this.pendingStanzaExpectations) {
            if (matchesStanza(node, expectation.matcher)) {
                expectation.resolve(node)
                break
            }
        }

        if (node.tag !== 'iq') {
            return
        }
        for (const expectation of this.pendingIqExpectations) {
            if (matchesIq(node, expectation.matcher)) {
                expectation.resolve(node)
                return
            }
        }
    }

    private requireListening(): WaFakeWsServerListenInfo {
        if (!this.listenInfo) {
            throw new Error('fake server is not listening')
        }
        return this.listenInfo
    }

    private requireRootCa(): FakeNoiseRootCa {
        if (!this.rootCa) {
            throw new Error('fake server is not listening')
        }
        return this.rootCa
    }
}

function matchesIq(iq: BinaryNode, matcher: WaFakeIqMatcher): boolean {
    if (iq.tag !== 'iq') return false
    if (matcher.type !== undefined && iq.attrs.type !== matcher.type) return false
    if (matcher.xmlns !== undefined && iq.attrs.xmlns !== matcher.xmlns) return false
    if (matcher.childTag !== undefined) {
        const children = Array.isArray(iq.content) ? iq.content : null
        if (!children || children.length === 0) return false
        if (children[0].tag !== matcher.childTag) return false
    }
    return true
}

function describeMatcher(matcher: WaFakeIqMatcher): string {
    const parts: string[] = []
    if (matcher.type !== undefined) parts.push(`type=${matcher.type}`)
    if (matcher.xmlns !== undefined) parts.push(`xmlns=${matcher.xmlns}`)
    if (matcher.childTag !== undefined) parts.push(`childTag=${matcher.childTag}`)
    return parts.length > 0 ? parts.join(', ') : 'any iq'
}

function matchesStanza(node: BinaryNode, matcher: StanzaMatcher): boolean {
    if (matcher.tag !== undefined && node.tag !== matcher.tag) return false
    if (matcher.type !== undefined && node.attrs.type !== matcher.type) return false
    if (matcher.xmlns !== undefined && node.attrs.xmlns !== matcher.xmlns) return false
    if (matcher.from !== undefined && node.attrs.from !== matcher.from) return false
    if (matcher.to !== undefined && node.attrs.to !== matcher.to) return false
    if (matcher.childTag !== undefined) {
        const children = Array.isArray(node.content) ? node.content : null
        if (!children || children.length === 0) return false
        if (children[0].tag !== matcher.childTag) return false
    }
    return true
}

function describeStanzaMatcher(matcher: StanzaMatcher): string {
    const parts: string[] = []
    if (matcher.tag !== undefined) parts.push(`tag=${matcher.tag}`)
    if (matcher.type !== undefined) parts.push(`type=${matcher.type}`)
    if (matcher.xmlns !== undefined) parts.push(`xmlns=${matcher.xmlns}`)
    if (matcher.from !== undefined) parts.push(`from=${matcher.from}`)
    if (matcher.to !== undefined) parts.push(`to=${matcher.to}`)
    if (matcher.childTag !== undefined) parts.push(`childTag=${matcher.childTag}`)
    return parts.length > 0 ? parts.join(', ') : 'any stanza'
}

export type { WaFakeAuthenticatedInfo, WaFakeConnectionPipeline }
export type { BinaryNode }
