import type { IncomingMessage, ServerResponse } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'

import type { WaFakeConnection } from '../infra/WaFakeConnection'
import {
    type WaFakeAuthenticatedInfo,
    WaFakeConnectionPipeline
} from '../infra/WaFakeConnectionPipeline'
import { WaFakeMediaHttpsServer } from '../infra/WaFakeMediaHttpsServer'
import { WaFakeTcpServer, type WaFakeTcpServerListenInfo } from '../infra/WaFakeTcpServer'
import { WaFakeWsServer, type WaFakeWsServerListenInfo } from '../infra/WaFakeWsServer'
import { type FakeNoiseRootCa, generateFakeNoiseRootCa } from '../protocol/auth/cert-chain'
import type { ParsedClientPayload } from '../protocol/auth/client-payload-validate'
import { buildPairDeviceIq, buildPairSuccessIq } from '../protocol/auth/pair-device'
import type { BuildSuccessNodeInput } from '../protocol/auth/success-node'
import type { BuildAbPropsResultInput } from '../protocol/iq/abprops'
import {
    type BuildServerSyncNotificationInput,
    type FakeAppStateCollectionPayload
} from '../protocol/iq/appstate-sync'
import type { FakeBusinessProfile } from '../protocol/iq/business'
import {
    buildCompanionHelloResultContent,
    buildLinkCodeNotification,
    parseLinkCodeStanza
} from '../protocol/iq/link-code'
import type { FakePrivacyCategoryName, FakePrivacySettingsState } from '../protocol/iq/privacy'
import type { FakePrivacyTokenIssue } from '../protocol/iq/privacy-token'
import type { FakeProfilePictureResult } from '../protocol/iq/profile'
import {
    buildIqError,
    buildIqResult,
    type WaFakeIqContext,
    type WaFakeIqMatcher,
    type WaFakeIqResponder
} from '../protocol/iq/router'
import {
    buildAccountSyncDevicesNotification,
    type FakeAccountDevice
} from '../protocol/push/mobile-notification'
import type { ClientPreKeyBundle } from '../protocol/signal/prekey-upload'
import type { FakeCompanionHostState } from '../state/fake-companion-host'
import {
    FakeMediaStore,
    type FakeMediaType,
    type PublishedMediaBlob,
    type PublishMediaInput
} from '../state/fake-media-store'
import { type BinaryNode } from '../transport/codec'
import { randomBytesAsync, type SignalKeyPair, X25519 } from '../transport/crypto'
import { bytesToBase64UrlSafe } from '../transport/util'

import { type AppStateSyncManager, type CapturedAppStateMutation } from './AppStateSyncManager'
import { FakePairingDriver, type FakePairingDriverOptions } from './FakePairingDriver'
import { type CreateFakePeerOptions, FakePeer } from './FakePeer'
import {
    type CompleteCompanionPairingInput,
    type CompletedCompanionPairing,
    type ExpectIqOptions,
    type ExpectStanzaOptions,
    FakeServerSession,
    type StanzaMatcher
} from './FakeServerSession'
import type { PreKeyDispenser } from './PreKeyDispenser'
import { type AuthenticatedPipelineListener, Scenario } from './Scenario'
import type {
    CapturedBlocklistChange,
    CapturedDirtyBitsClear,
    CapturedGroupOp,
    CapturedPrivacySet,
    CapturedProfilePictureSet,
    CapturedStatusSet,
    FakeGroupMetadata,
    ServerRegistries
} from './ServerRegistries'

export type {
    FakeGroupMetadata,
    CapturedGroupOp,
    CapturedPrivacySet,
    CapturedBlocklistChange,
    CapturedProfilePictureSet,
    CapturedStatusSet,
    CapturedDirtyBitsClear
} from './ServerRegistries'

export type { CapturedAppStateMutation } from './AppStateSyncManager'

export interface FakeWaServerOptions {
    readonly host?: string
    readonly port?: number
    readonly path?: string
    /**
     * Attributes stamped on the post-handshake `<success/>` node of every
     * authenticated connection (lid, display name, props versions, ...).
     */
    readonly successNodeAttributes?: BuildSuccessNodeInput
    /**
     * Register the built-in IQ auto-handlers that answer everything the lib
     * emits during normal operation. Default `true`; pass `false` to start
     * with an empty router and wire every response via `registerIqHandler`.
     */
    readonly defaultIqHandlers?: boolean
    /**
     * Assigns each authenticated connection to an isolated session, keyed by
     * the returned id. Two connections that resolve to different ids share no
     * peers, groups, prekeys, app-state, or captured stanzas. When omitted,
     * every connection uses one shared default session (single-client mode).
     *
     * The resolver runs once per connection, right after authentication, so
     * `info.clientPayload` is available for keying by login identity, e.g.
     * `sessionKey: ({ clientPayload }) => clientPayload.kind === 'login' ?
     * clientPayload.username : 'pending'`.
     */
    readonly sessionKey?: (info: FakeSessionKeyInfo) => string
    /**
     * Also serve the WhatsApp Mobile transport on a raw TCP listener. Mobile
     * clients dial `tcp://host:port` instead of upgrading to a WebSocket, but
     * speak the same framing above the carrier, so both listeners share one
     * server identity, session model, and IQ router. Pass `true` for an
     * ephemeral port on the WebSocket host, or an object to pin host/port.
     * Read the address back from {@link FakeWaServer.tcpUrl} and feed it to the
     * client's `mobileTransport.tcpUrl`.
     */
    readonly tcp?: boolean | { readonly host?: string; readonly port?: number }
}

const HOST_DOMAIN = 's.whatsapp.net'
const PAIR_DEVICE_REF_COUNT = 6
const PAIR_DEVICE_REF_BYTES = 16
const MOBILE_PRIMARY_PLATFORM = 'android'

/**
 * Builds the mobile TCP listener when the option asks for one. Defaults its
 * host to the WebSocket host so both listeners answer on the same interface.
 */
function createTcpServer(options: FakeWaServerOptions): WaFakeTcpServer | null {
    if (!options.tcp) {
        return null
    }
    const config = options.tcp === true ? {} : options.tcp
    return new WaFakeTcpServer({
        host: config.host ?? options.host,
        port: config.port
    })
}

export interface FakeSessionKeyInfo {
    readonly clientPayload: ParsedClientPayload
    readonly pipeline: WaFakeConnectionPipeline
}

export interface FakeWaServerNoiseRootCa {
    readonly publicKey: Uint8Array
    readonly serial: number
}

export type FakeWaServerPipelineListener = (pipeline: WaFakeConnectionPipeline) => void

export { FakeServerSession } from './FakeServerSession'
export type { ExpectIqOptions, ExpectStanzaOptions, StanzaMatcher } from './FakeServerSession'

export interface CapturedMediaUpload {
    readonly path: string
    readonly mediaType: string
    readonly encryptedBytes: Uint8Array
    readonly contentType: string | undefined
    readonly auth: string | undefined
    readonly receivedAtMs: number
}

export class FakeWaServer {
    private readonly wsServer: WaFakeWsServer
    private readonly pipelines = new Set<WaFakeConnectionPipeline>()
    private readonly defaultSession: FakeServerSession
    private readonly pipelineSessions = new WeakMap<WaFakeConnectionPipeline, FakeServerSession>()
    private readonly authenticatedListeners = new Set<AuthenticatedPipelineListener>()
    private readonly sessions = new Map<string, FakeServerSession>()
    private readonly globalIqHandlers = new Set<{
        readonly matcher: WaFakeIqMatcher
        readonly respond: WaFakeIqResponder
        readonly label?: string
        readonly unregisterBySession: Map<FakeServerSession, () => void>
    }>()
    private readonly options: FakeWaServerOptions
    private rootCa: FakeNoiseRootCa | null = null
    private serverStaticKeyPair: SignalKeyPair | null = null
    private listenInfo: WaFakeWsServerListenInfo | null = null
    private readonly tcpServer: WaFakeTcpServer | null
    private tcpListenInfo: WaFakeTcpServerListenInfo | null = null
    private readonly pendingCompanionOffers = new Map<string, WaFakeConnectionPipeline>()
    private readonly mobilePrimaryPipelines = new Map<string, WaFakeConnectionPipeline>()
    private readonly linkCodeSessions = new Map<
        string,
        {
            readonly companion: WaFakeConnectionPipeline
            readonly primary: WaFakeConnectionPipeline
        }
    >()
    private readonly pipelineListeners = new Set<FakeWaServerPipelineListener>()
    private rejectMode: { readonly code: number; readonly reason: string } | null = null
    private readonly mediaStore = new FakeMediaStore()
    private readonly mediaHttpsServer = new WaFakeMediaHttpsServer()
    private readonly capturedMediaUploads: CapturedMediaUpload[] = []
    private nextUploadCounter = 0
    private cachedMediaProxyAgent: HttpsAgent | null = null

    public constructor(options: FakeWaServerOptions = {}) {
        this.options = options
        this.wsServer = new WaFakeWsServer(options)
        this.wsServer.onConnection((connection) => this.handleConnection(connection))
        this.tcpServer = createTcpServer(options)
        this.tcpServer?.onConnection((connection) => this.handleConnection(connection))
        this.defaultSession = this.createSession('__default__')
    }

    /** State of the single default session (the only session for one client). */
    public get registries(): ServerRegistries {
        return this.defaultSession.registries
    }

    /** Companion-host account state of the default session (linked devices, key-index list). */
    public get companionHost(): FakeCompanionHostState {
        return this.defaultSession.companionHost
    }

    public get preKeyDispenser(): PreKeyDispenser {
        return this.defaultSession.preKeyDispenser
    }

    public get appStateSync(): AppStateSyncManager {
        return this.defaultSession.appStateSync
    }

    /**
     * Returns the isolated session for `id`, creating it on first use. Every
     * session gets its own registries, prekey dispenser, app-state, IQ router,
     * and stanza capture. Use with the `sessionKey` option to run several
     * `WaClient`s against one server without them sharing any state.
     */
    public session(id: string): FakeServerSession {
        const existing = this.sessions.get(id)
        if (existing) {
            return existing
        }
        return this.createSession(id)
    }

    /** The session a connection is bound to (default before authentication). */
    public sessionFor(pipeline: WaFakeConnectionPipeline): FakeServerSession {
        return this.pipelineSessions.get(pipeline) ?? this.defaultSession
    }

    private createSession(id: string): FakeServerSession {
        const session = new FakeServerSession(
            id,
            {
                requireMediaHttpsInfo: () => this.requireMediaHttpsInfo(),
                completeCompanionPairing: (input) => this.completeCompanionPairing(input),
                relayLinkCodeStage: (iq, context) => this.handleLinkCodeStage(iq, context)
            },
            { defaultIqHandlers: this.options.defaultIqHandlers !== false }
        )
        this.sessions.set(id, session)
        // Server-level custom handlers apply to every session, present and future.
        for (const handler of this.globalIqHandlers) {
            handler.unregisterBySession.set(
                session,
                session.registerIqHandler(handler.matcher, handler.respond, handler.label)
            )
        }
        return session
    }

    public registerIqHandler(
        matcher: WaFakeIqMatcher,
        respond: WaFakeIqResponder,
        label?: string
    ): () => void {
        const entry = {
            matcher,
            respond,
            label,
            unregisterBySession: new Map<FakeServerSession, () => void>()
        }
        for (const session of this.sessions.values()) {
            entry.unregisterBySession.set(
                session,
                session.registerIqHandler(matcher, respond, label)
            )
        }
        this.globalIqHandlers.add(entry)
        return () => {
            for (const unregister of entry.unregisterBySession.values()) {
                unregister()
            }
            entry.unregisterBySession.clear()
            this.globalIqHandlers.delete(entry)
        }
    }

    public async routeIqForTest(iq: BinaryNode): Promise<BinaryNode | null> {
        return this.defaultSession.routeIq(iq)
    }

    public onOutboundGroupOp(listener: (op: CapturedGroupOp) => void): () => void {
        return this.registries.onOutboundGroupOp(listener)
    }

    public onOutboundPrivacySet(listener: (op: CapturedPrivacySet) => void): () => void {
        return this.registries.onOutboundPrivacySet(listener)
    }

    public onOutboundBlocklistChange(listener: (op: CapturedBlocklistChange) => void): () => void {
        return this.registries.onOutboundBlocklistChange(listener)
    }

    public onOutboundProfilePictureSet(
        listener: (op: CapturedProfilePictureSet) => void
    ): () => void {
        return this.registries.onOutboundProfilePictureSet(listener)
    }

    public onOutboundStatusSet(listener: (op: CapturedStatusSet) => void): () => void {
        return this.registries.onOutboundStatusSet(listener)
    }

    public onLogout(listener: () => void): () => void {
        return this.registries.onLogout(listener)
    }

    public onOutboundPrivacyTokenIssue(listener: (op: FakePrivacyTokenIssue) => void): () => void {
        return this.registries.onOutboundPrivacyTokenIssue(listener)
    }

    public onOutboundDirtyBitsClear(listener: (op: CapturedDirtyBitsClear) => void): () => void {
        return this.registries.onOutboundDirtyBitsClear(listener)
    }

    public privacyTokensIssuedSnapshot(): ReadonlyMap<string, FakePrivacyTokenIssue> {
        return this.registries.privacyTokensIssuedSnapshot()
    }

    public privacySettingsSnapshot(): FakePrivacySettingsState {
        return this.registries.privacySettingsSnapshot()
    }

    public blocklistSnapshot(): readonly string[] {
        return this.registries.blocklistSnapshot()
    }

    public latestStatusSnapshot(): string | null {
        return this.registries.latestStatusSnapshot()
    }

    public groupRegistrySnapshot(): ReadonlyMap<string, FakeGroupMetadata> {
        return this.registries.groupRegistrySnapshot()
    }

    public setAbProps(input: BuildAbPropsResultInput): void {
        this.registries.setAbProps(input)
    }

    public setPrivacyDisallowedList(
        category: FakePrivacyCategoryName,
        jids: readonly string[]
    ): void {
        this.registries.setPrivacyDisallowedList(category, jids)
    }

    public setProfilePictureRecord(jid: string, picture: FakeProfilePictureResult): void {
        this.registries.setProfilePictureRecord(jid, picture)
    }

    public setBusinessProfileRecord(jid: string, profile: FakeBusinessProfile): void {
        this.registries.setBusinessProfileRecord(jid, profile)
    }

    public createFakeGroup(input: {
        readonly groupJid: string
        readonly subject?: string
        readonly description?: string
        readonly participants: readonly FakePeer[]
        readonly creator?: string
        readonly creationSeconds?: number
    }): FakeGroupMetadata {
        return this.registries.createFakeGroup(input)
    }

    public async triggerPreKeyUpload(
        pipeline: WaFakeConnectionPipeline,
        options: { readonly timeoutMs?: number; readonly force?: boolean } | number = {}
    ): Promise<ClientPreKeyBundle> {
        return this.sessionFor(pipeline).preKeyDispenser.triggerPreKeyUpload(pipeline, options)
    }

    public awaitPreKeyBundle(timeoutMs = 15_000): Promise<ClientPreKeyBundle> {
        return this.preKeyDispenser.awaitPreKeyBundle(timeoutMs)
    }

    public capturedPreKeyBundleSnapshot(): ClientPreKeyBundle | null {
        return this.preKeyDispenser.capturedPreKeyBundleSnapshot()
    }

    public dispenseOneTimePreKey(): {
        readonly keyId: number
        readonly publicKey: Uint8Array
    } | null {
        return this.preKeyDispenser.dispenseOneTimePreKey()
    }

    public preKeyDispenserMissesSnapshot(): number {
        return this.preKeyDispenser.preKeyDispenserMissesSnapshot()
    }

    public preKeysAvailable(): number {
        return this.preKeyDispenser.preKeysAvailable()
    }

    public registerAppStateSyncKey(keyId: Uint8Array, keyData: Uint8Array): void {
        this.appStateSync.registerAppStateSyncKey(keyId, keyData)
    }

    public onOutboundAppStateMutation(
        listener: (mutation: CapturedAppStateMutation) => void
    ): () => void {
        return this.appStateSync.onOutboundAppStateMutation(listener)
    }

    public expectAppStateMutation(
        predicate: (mutation: CapturedAppStateMutation) => boolean,
        timeoutMs = 15_000
    ): Promise<CapturedAppStateMutation> {
        return this.appStateSync.expectAppStateMutation(predicate, timeoutMs)
    }

    public provideAppStateCollection(
        name: string,
        provider: () =>
            | Promise<FakeAppStateCollectionPayload | null>
            | FakeAppStateCollectionPayload
            | null
    ): () => void {
        return this.appStateSync.provideAppStateCollection(name, provider)
    }

    public async pushServerSyncNotification(
        pipeline: WaFakeConnectionPipeline,
        input: BuildServerSyncNotificationInput
    ): Promise<void> {
        return this.sessionFor(pipeline).appStateSync.pushServerSyncNotification(pipeline, input)
    }

    /**
     * Pushes the account's device set to a mobile primary as `account_sync`.
     * Defaults to what this session tracks - the primary itself plus every
     * companion it linked - so passing a shorter list is how a test tells the
     * primary that a device disappeared while it was offline.
     */
    public async pushAccountSyncDevices(
        pipeline: WaFakeConnectionPipeline,
        options: { readonly devices?: readonly FakeAccountDevice[] } = {}
    ): Promise<void> {
        const session = this.sessionFor(pipeline)
        const primary = session.companionHost.primary
        if (!primary && !options.devices) {
            throw new Error('cannot push account_sync: this session has no mobile primary')
        }
        const devices = options.devices ?? [
            { deviceJid: primary!.jid, keyIndex: 0 },
            ...session.companionHost.linkedCompanions().map((companion) => ({
                deviceJid: companion.deviceJid,
                keyIndex: companion.keyIndex
            }))
        ]
        await pipeline.sendStanza(buildAccountSyncDevicesNotification({ devices }))
    }

    public onAuthenticatedPipeline(listener: AuthenticatedPipelineListener): () => void {
        this.authenticatedListeners.add(listener)
        return () => this.authenticatedListeners.delete(listener)
    }

    public scenario(configure: (s: Scenario) => void): void {
        configure(new Scenario(this))
    }

    public expectIq(matcher: WaFakeIqMatcher, options: ExpectIqOptions = {}): Promise<BinaryNode> {
        return this.defaultSession.expectIq(matcher, options)
    }

    public capturedStanzaSnapshot(): readonly BinaryNode[] {
        return this.defaultSession.capturedStanzaSnapshot()
    }

    /**
     * Subscribes to every stanza captured from the client side (the lib) of
     * the default session. The listener is called synchronously for each new
     * stanza as it arrives. Returns an unsubscribe function. Useful for
     * benches that need to count or react to a stream of receipts/messages
     * without paying the O(N²) cost of polling `capturedStanzaSnapshot()` or
     * queuing one `expectStanza(...)` per iteration.
     */
    public onCapturedStanza(listener: (node: BinaryNode) => void): () => void {
        return this.defaultSession.onCapturedStanza(listener)
    }

    public expectStanza(
        matcher: StanzaMatcher,
        options: ExpectStanzaOptions = {}
    ): Promise<BinaryNode> {
        return this.defaultSession.expectStanza(matcher, options)
    }

    public async broadcastStanza(node: BinaryNode): Promise<number> {
        const tasks: Array<Promise<void>> = []
        for (const pipeline of this.pipelines) {
            tasks.push(pipeline.sendStanza(node).catch(() => undefined))
        }
        await Promise.all(tasks)
        return tasks.length
    }

    public waitForAuthenticatedPipeline(timeoutMs = 60_000): Promise<WaFakeConnectionPipeline> {
        for (const pipeline of this.pipelines) {
            if (pipeline.isAuthenticated()) {
                return Promise.resolve(pipeline)
            }
        }
        return this.waitForNextAuthenticatedPipeline(timeoutMs)
    }

    public waitForNextAuthenticatedPipeline(timeoutMs = 60_000): Promise<WaFakeConnectionPipeline> {
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

    public async publishMediaBlob(input: PublishMediaInput): Promise<PublishedMediaBlob> {
        return this.mediaStore.publish(input)
    }

    public mediaUrl(path: string): string {
        const info = this.requireMediaHttpsInfo()
        const normalized = path.startsWith('/') ? path : `/${path}`
        return `https://${info.host}:${info.port}${normalized}`
    }

    private requireMediaHttpsInfo(): { readonly host: string; readonly port: number } {
        const info = this.mediaHttpsServer.info
        if (!info) {
            throw new Error('fake media https server is not listening')
        }
        return info
    }

    public get mediaProxyAgent(): HttpsAgent {
        if (!this.cachedMediaProxyAgent) {
            // keepAlive is required for representative perf measurements
            // and matches what real-world WhatsApp clients do – every
            // media upload/download would otherwise pay a full TLS
            // handshake. The `src/media/__tests__/media.test.ts` fixtures
            // and a production-quality `proxy.mediaUpload` configuration
            // all set this; mirroring it here keeps benches in line.
            this.cachedMediaProxyAgent = new HttpsAgent({
                rejectUnauthorized: false,
                keepAlive: true
            })
        }
        return this.cachedMediaProxyAgent
    }

    public capturedMediaUploadSnapshot(): readonly CapturedMediaUpload[] {
        return this.capturedMediaUploads.slice()
    }

    public async createFakePeer(
        options: CreateFakePeerOptions,
        pipeline: WaFakeConnectionPipeline
    ): Promise<FakePeer> {
        const session = this.sessionFor(pipeline)
        const peer = await FakePeer.create(options, this.buildFakePeerDeps(pipeline, session))
        session.registries.registerPeer(peer)
        return peer
    }

    public async createFakePeerWithDevices(
        input: {
            readonly userJid: string
            readonly deviceIds: readonly number[]
            readonly displayName?: string
            readonly skipOneTimePreKey?: boolean
        },
        pipeline: WaFakeConnectionPipeline
    ): Promise<readonly FakePeer[]> {
        if (input.deviceIds.length === 0) {
            throw new Error('createFakePeerWithDevices requires at least one deviceId')
        }
        const atIdx = input.userJid.indexOf('@')
        if (atIdx < 0) {
            throw new Error(`invalid userJid ${input.userJid}`)
        }
        const userPart = input.userJid.slice(0, atIdx)
        const server = input.userJid.slice(atIdx + 1)
        const session = this.sessionFor(pipeline)
        const peers: FakePeer[] = []
        for (const deviceId of input.deviceIds) {
            const deviceJid = deviceId === 0 ? input.userJid : `${userPart}:${deviceId}@${server}`
            const peer = await FakePeer.create(
                {
                    jid: deviceJid,
                    displayName: input.displayName,
                    skipOneTimePreKey: input.skipOneTimePreKey
                },
                this.buildFakePeerDeps(pipeline, session)
            )
            session.registries.registerPeer(peer)
            peers.push(peer)
        }
        return peers
    }

    private buildFakePeerDeps(
        pipeline: WaFakeConnectionPipeline,
        session: FakeServerSession
    ): {
        readonly bundleResolver: () => Promise<ClientPreKeyBundle>
        readonly reserveOneTimePreKey: () => {
            readonly keyId: number
            readonly publicKey: Uint8Array
        } | null
        readonly pushStanza: (stanza: BinaryNode) => Promise<void>
        readonly subscribeInboundMessages: (listener: (stanza: BinaryNode) => void) => () => void
    } {
        return {
            bundleResolver: () => session.preKeyDispenser.awaitPreKeyBundle(),
            reserveOneTimePreKey: () => session.preKeyDispenser.dispenseOneTimePreKey(),
            pushStanza: (stanza) => pipeline.sendStanza(stanza),
            subscribeInboundMessages: (listener) => session.subscribeInboundMessages(listener)
        }
    }

    public async runPairing(
        pipeline: WaFakeConnectionPipeline,
        options: FakePairingDriverOptions,
        companionMaterialResolver: () => Promise<{
            readonly advSecretKey: Uint8Array
            readonly identityPublicKey: Uint8Array
        }>
    ): Promise<void> {
        const session = this.sessionFor(pipeline)
        const driver = new FakePairingDriver(options, {
            pipeline,
            companionMaterialResolver,
            waitForPairDeviceAck: async (pairDeviceIqId) => {
                await session.expectIq(
                    {
                        id: pairDeviceIqId
                    },
                    {
                        timeoutMs: 15_000
                    }
                )
            }
        })
        await driver.run()
    }

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
     * `tcp://host:port` of the mobile listener, for the client's
     * `mobileTransport.tcpUrl`.
     *
     * @throws when the server was started without the `tcp` option.
     */
    public get tcpUrl(): string {
        if (!this.tcpListenInfo) {
            throw new Error(
                'fake server has no mobile listener; start it with { tcp: true } to serve the mobile transport'
            )
        }
        return this.tcpListenInfo.url
    }

    public get noiseRootCa(): FakeWaServerNoiseRootCa {
        const root = this.requireRootCa()
        return { publicKey: root.publicKey, serial: root.serial }
    }

    /**
     * Subscribes to every new connection pipeline (pre-auth). Listeners
     * fan out; returns an unsubscribe function.
     */
    public onPipeline(listener: FakeWaServerPipelineListener): () => void {
        this.pipelineListeners.add(listener)
        return () => {
            this.pipelineListeners.delete(listener)
        }
    }

    public async listen(): Promise<void> {
        if (this.listenInfo) {
            return
        }
        ;[this.rootCa, this.serverStaticKeyPair] = await Promise.all([
            generateFakeNoiseRootCa(),
            X25519.generateKeyPair()
        ])
        const mediaHandler = this.buildMediaRequestHandler()
        this.wsServer.setHttpRequestHandler(mediaHandler)
        this.mediaHttpsServer.setRequestHandler(mediaHandler)
        this.listenInfo = await this.wsServer.listen()
        try {
            if (this.tcpServer) {
                this.tcpListenInfo = await this.tcpServer.listen()
            }
            await this.mediaHttpsServer.listen('127.0.0.1')
        } catch (error) {
            // A half-open server is worse than none: the listeners that did
            // come up would stay bound and `listenInfo` would make a retry a
            // no-op. Roll everything back so the caller can start over.
            await this.rollbackFailedListen()
            throw error
        }
    }

    private async rollbackFailedListen(): Promise<void> {
        const ignore = (): undefined => undefined
        await this.wsServer.close().catch(ignore)
        await this.tcpServer?.close().catch(ignore)
        await this.mediaHttpsServer.close().catch(ignore)
        this.listenInfo = null
        this.tcpListenInfo = null
        this.rootCa = null
        this.serverStaticKeyPair = null
    }

    public async stop(): Promise<void> {
        this.pipelines.clear()
        await this.wsServer.close()
        await this.tcpServer?.close()
        this.tcpListenInfo = null
        await this.mediaHttpsServer.close()
        if (this.cachedMediaProxyAgent) {
            this.cachedMediaProxyAgent.destroy()
            this.cachedMediaProxyAgent = null
        }
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
        const pipeline: WaFakeConnectionPipeline = new WaFakeConnectionPipeline({
            connection,
            rootCa: this.rootCa,
            serverStaticKeyPair: this.serverStaticKeyPair,
            routeIq: (node: BinaryNode) =>
                this.sessionFor(pipeline).routeIq(node, { connection: pipeline }),
            ...(this.options.successNodeAttributes !== undefined
                ? { successNodeAttributes: this.options.successNodeAttributes }
                : {})
        })
        this.pipelines.add(pipeline)
        this.pipelineSessions.set(pipeline, this.defaultSession)
        pipeline.setEvents({
            onAuthenticated: () => {
                this.bindPipelineSession(pipeline)
                this.bindMobilePrimary(pipeline)
                for (const listener of this.authenticatedListeners) {
                    try {
                        void Promise.resolve(listener(pipeline)).catch(() => undefined)
                    } catch {
                        /* ignore */
                    }
                }
            },
            onStanza: (node: BinaryNode) => this.sessionFor(pipeline).handleCapturedStanza(node),
            onClose: () => this.forgetPipeline(pipeline)
        })
        for (const listener of this.pipelineListeners) {
            try {
                void Promise.resolve(listener(pipeline)).catch(() => undefined)
            } catch {
                /* ignore */
            }
        }
    }

    /**
     * Rebinds a connection to its keyed session once authenticated. Runs
     * before user `onAuthenticated` listeners and before any client stanza, so
     * captures and IQ routing land in the right session from the first frame.
     * No-op without a `sessionKey` resolver (single default session).
     */
    private bindPipelineSession(pipeline: WaFakeConnectionPipeline): void {
        const resolveKey = this.options.sessionKey
        const clientPayload = pipeline.clientPayload
        if (!resolveKey || !clientPayload) {
            return
        }
        const id = resolveKey({ clientPayload, pipeline })
        this.pipelineSessions.set(pipeline, this.session(id))
    }

    /** Drops every reference to a closed connection so a relay never targets it. */
    private forgetPipeline(pipeline: WaFakeConnectionPipeline): void {
        this.pipelines.delete(pipeline)
        for (const [ref, offered] of this.pendingCompanionOffers) {
            if (offered === pipeline) {
                this.pendingCompanionOffers.delete(ref)
            }
        }
        for (const [jid, primary] of this.mobilePrimaryPipelines) {
            if (primary === pipeline) {
                this.mobilePrimaryPipelines.delete(jid)
            }
        }
        for (const [ref, session] of this.linkCodeSessions) {
            if (session.companion === pipeline || session.primary === pipeline) {
                this.linkCodeSessions.delete(ref)
            }
        }
    }

    /**
     * Records a phone login as the session's account owner. Everything on the
     * companion-host path keys off it: device jids are minted under its number,
     * and `remove-companion-device` is read as a revoke rather than a logout.
     */
    private bindMobilePrimary(pipeline: WaFakeConnectionPipeline): void {
        const clientPayload = pipeline.clientPayload
        if (clientPayload?.kind !== 'login' || clientPayload.flavor !== 'mobile') {
            return
        }
        const session = this.sessionFor(pipeline)
        const jid = `${clientPayload.username}@${HOST_DOMAIN}`
        session.companionHost.bindPrimary({ username: clientPayload.username, jid })
        if (session.companionHost.primary?.jid !== jid) {
            // The session already belongs to another number. Wiring this login
            // in anyway would let a link be relayed to this connection and then
            // minted under the account that owns the session.
            return
        }
        session.registries.registerDeviceId(jid, 0)
        // A reconnect of the same account replaces its stale connection here.
        this.mobilePrimaryPipelines.set(jid, pipeline)
    }

    /**
     * Offers a companion connection the refs for a primary-driven link: pushes
     * the `pair-device` IQ it turns into a QR, and remembers each ref so the
     * primary's upload can be routed back to this connection. Returns the refs.
     *
     * This is the counterpart of {@link runPairing}, where the server itself
     * plays the primary. Here a real mobile-primary client signs the identity
     * and the server only relays.
     */
    public async offerCompanionPairing(
        pipeline: WaFakeConnectionPipeline,
        options: { readonly refCount?: number } = {}
    ): Promise<readonly string[]> {
        const refCount = options.refCount ?? PAIR_DEVICE_REF_COUNT
        const raw = await Promise.all(
            Array.from({ length: refCount }, () => randomBytesAsync(PAIR_DEVICE_REF_BYTES))
        )
        // Refs travel as text inside the companion's QR, so they have to be
        // printable to survive the round trip back in the primary's upload.
        const refs = raw.map((bytes) => bytesToBase64UrlSafe(bytes))
        // Send before registering: the builder rejects a bad ref count and the
        // send can fail, and either would leave refs in the map that no
        // connection will ever consume.
        await pipeline.sendStanza(buildPairDeviceIq({ refs }))
        for (const ref of refs) {
            this.pendingCompanionOffers.set(ref, pipeline)
        }
        return refs
    }

    /**
     * Relays one link-code stage between the two clients running the pairing
     * handshake. `companion_hello` mints the ref that ties the stages together
     * and registers it as a pairing offer, so the primary's later `pair-device`
     * upload lands on the same companion connection as the QR flow.
     */
    private async handleLinkCodeStage(
        iq: BinaryNode,
        context: WaFakeIqContext | undefined
    ): Promise<BinaryNode | null> {
        const parsed = parseLinkCodeStanza(iq)
        if (!parsed || !context) {
            return null
        }
        const sender = context.connection as WaFakeConnectionPipeline
        if (parsed.stage === 'companion_hello') {
            const primary = parsed.phoneJid
                ? this.mobilePrimaryPipelines.get(parsed.phoneJid)
                : undefined
            if (!primary) {
                return buildIqError(iq, { code: 404, text: 'primary-not-connected' })
            }
            const ref = bytesToBase64UrlSafe(await randomBytesAsync(PAIR_DEVICE_REF_BYTES))
            this.linkCodeSessions.set(ref, { companion: sender, primary })
            this.pendingCompanionOffers.set(ref, sender)
            await primary.sendStanza(
                buildLinkCodeNotification({
                    stage: 'companion_hello',
                    ref,
                    children: parsed.children
                })
            )
            return buildIqResult(iq, { content: buildCompanionHelloResultContent(ref) })
        }

        const session = parsed.ref ? this.linkCodeSessions.get(parsed.ref) : undefined
        if (!session || !parsed.ref) {
            return buildIqError(iq, { code: 404, text: 'unknown-pairing-ref' })
        }
        const target = parsed.stage === 'primary_hello' ? session.companion : session.primary
        await target.sendStanza(
            buildLinkCodeNotification({
                stage: parsed.stage,
                ref: parsed.ref,
                children: parsed.children
            })
        )
        return buildIqResult(iq)
    }

    /**
     * Host side of a companion link: hands the primary-signed identity to the
     * connection that owns `ref` and reports what that companion advertised at
     * registration. Resolves `null` for an unknown or already-consumed ref.
     */
    private async completeCompanionPairing(
        input: CompleteCompanionPairingInput
    ): Promise<CompletedCompanionPairing | null> {
        const pipeline = this.pendingCompanionOffers.get(input.ref)
        if (!pipeline) {
            return null
        }
        const registration = pipeline.clientPayload
        const companionPropsBytes =
            registration?.kind === 'registration'
                ? (registration.devicePairingData.deviceProps ?? null)
                : null
        // `<platform>` describes the primary that signed the link, not the
        // companion. A zapo mobile session always logs in as ANDROID, so this
        // is the only value a primary-driven link can carry here.
        const platform = MOBILE_PRIMARY_PLATFORM
        await pipeline.sendStanza(
            buildPairSuccessIq({
                deviceJid: input.deviceJid,
                platform,
                deviceIdentityBytes: input.deviceIdentityBytes
            })
        )
        for (const [ref, offered] of this.pendingCompanionOffers) {
            if (offered === pipeline) {
                this.pendingCompanionOffers.delete(ref)
            }
        }
        return { companionPropsBytes, platform }
    }

    private buildMediaRequestHandler(): (req: IncomingMessage, res: ServerResponse) => void {
        return (req, res): void => {
            const rawUrl = req.url ?? ''
            const [path, query] = rawUrl.split('?')
            const method = (req.method ?? 'GET').toUpperCase()
            if (method === 'POST') {
                this.handleMediaUpload(req, res, path, query)
                return
            }
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
        }
    }

    private handleMediaUpload(
        req: IncomingMessage,
        res: ServerResponse,
        path: string,
        query: string | undefined
    ): void {
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => {
            chunks.push(chunk)
        })
        req.on('end', () => {
            const encryptedBytes = new Uint8Array(Buffer.concat(chunks))
            const segments = path.split('/').filter(Boolean)
            const mediaType = segments[1] ?? 'unknown'
            const auth = parseQueryParam(query, 'auth')
            const upload: CapturedMediaUpload = {
                path,
                mediaType,
                encryptedBytes,
                contentType: req.headers['content-type'],
                auth,
                receivedAtMs: Date.now()
            }
            this.capturedMediaUploads.push(upload)
            this.mediaStore.setRaw(path, encryptedBytes, mediaType as FakeMediaType)
            this.nextUploadCounter += 1
            const downloadUrl = this.mediaUrl(path)
            const responseBody = JSON.stringify({
                url: downloadUrl,
                direct_path: path
            })
            res.statusCode = 200
            res.setHeader('content-type', 'application/json')
            res.setHeader('content-length', String(Buffer.byteLength(responseBody)))
            res.end(responseBody)
        })
        req.on('error', (error) => {
            if (!res.headersSent) {
                res.statusCode = 500
            }
            res.end(error.message)
        })
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

function parseQueryParam(query: string | undefined, name: string): string | undefined {
    if (!query) return undefined
    for (const pair of query.split('&')) {
        const eq = pair.indexOf('=')
        if (eq < 0) continue
        const key = decodeURIComponent(pair.slice(0, eq))
        if (key !== name) continue
        return decodeURIComponent(pair.slice(eq + 1))
    }
    return undefined
}

export type { WaFakeAuthenticatedInfo, WaFakeConnectionPipeline }
export type { BinaryNode }
