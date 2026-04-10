import type { IncomingMessage, ServerResponse } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'

import type { WaFakeConnection } from '../infra/WaFakeConnection'
import {
    type WaFakeAuthenticatedInfo,
    WaFakeConnectionPipeline
} from '../infra/WaFakeConnectionPipeline'
import { WaFakeMediaHttpsServer } from '../infra/WaFakeMediaHttpsServer'
import { WaFakeWsServer, type WaFakeWsServerListenInfo } from '../infra/WaFakeWsServer'
import { type FakeNoiseRootCa, generateFakeNoiseRootCa } from '../protocol/auth/cert-chain'
import type { BuildAbPropsResultInput } from '../protocol/iq/abprops'
import {
    type BuildServerSyncNotificationInput,
    type FakeAppStateCollectionPayload
} from '../protocol/iq/appstate-sync'
import type { FakeBusinessProfile } from '../protocol/iq/business'
import type { FakePrivacyCategoryName, FakePrivacySettingsState } from '../protocol/iq/privacy'
import type { FakePrivacyTokenIssue } from '../protocol/iq/privacy-token'
import type { FakeProfilePictureResult } from '../protocol/iq/profile'
import {
    type WaFakeIqHandler,
    type WaFakeIqMatcher,
    type WaFakeIqResponder,
    WaFakeIqRouter
} from '../protocol/iq/router'
import type { ClientPreKeyBundle } from '../protocol/signal/prekey-upload'
import {
    FakeMediaStore,
    type FakeMediaType,
    type PublishedMediaBlob,
    type PublishMediaInput
} from '../state/fake-media-store'
import { type BinaryNode } from '../transport/codec'
import { type SignalKeyPair, X25519 } from '../transport/crypto'

import { AppStateSyncManager, type CapturedAppStateMutation } from './AppStateSyncManager'
import { FakePairingDriver, type FakePairingDriverOptions } from './FakePairingDriver'
import { type CreateFakePeerOptions, FakePeer } from './FakePeer'
import { type IqHandlerDeps, registerDefaultIqHandlers } from './iq-handlers'
import { PreKeyDispenser } from './PreKeyDispenser'
import { type AuthenticatedPipelineListener, Scenario } from './Scenario'
import {
    type CapturedBlocklistChange,
    type CapturedDirtyBitsClear,
    type CapturedGroupOp,
    type CapturedPrivacySet,
    type CapturedProfilePictureSet,
    type CapturedStatusSet,
    type FakeGroupMetadata,
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
}

export interface FakeWaServerNoiseRootCa {
    readonly publicKey: Uint8Array
    readonly serial: number
}

export type FakeWaServerPipelineListener = (pipeline: WaFakeConnectionPipeline) => void

export interface ExpectIqOptions {
    readonly timeoutMs?: number
}

export interface ExpectStanzaOptions {
    readonly timeoutMs?: number
}

export interface StanzaMatcher {
    readonly tag?: string
    readonly type?: string
    readonly xmlns?: string
    readonly from?: string
    readonly to?: string
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

export interface CapturedMediaUpload {
    readonly path: string
    readonly mediaType: string
    readonly encryptedBytes: Uint8Array
    readonly contentType: string | undefined
    readonly auth: string | undefined
    readonly receivedAtMs: number
}

export class FakeWaServer {
    public readonly registries = new ServerRegistries()
    public readonly preKeyDispenser = new PreKeyDispenser()
    public readonly appStateSync = new AppStateSyncManager()

    private readonly wsServer: WaFakeWsServer
    private readonly pipelines = new Set<WaFakeConnectionPipeline>()
    private readonly iqRouter = new WaFakeIqRouter()
    private readonly capturedStanzas: BinaryNode[] = []
    private readonly pendingIqExpectations = new Set<PendingIqExpectation>()
    private readonly pendingStanzaExpectations = new Set<PendingStanzaExpectation>()
    private readonly authenticatedListeners = new Set<AuthenticatedPipelineListener>()
    private readonly inboundStanzaListeners = new Set<(node: BinaryNode) => void>()
    private rootCa: FakeNoiseRootCa | null = null
    private serverStaticKeyPair: SignalKeyPair | null = null
    private listenInfo: WaFakeWsServerListenInfo | null = null
    private pipelineListener: FakeWaServerPipelineListener | null = null
    private rejectMode: { readonly code: number; readonly reason: string } | null = null
    private readonly mediaStore = new FakeMediaStore()
    private readonly mediaHttpsServer = new WaFakeMediaHttpsServer()
    private readonly capturedMediaUploads: CapturedMediaUpload[] = []
    private nextUploadCounter = 0
    private cachedMediaProxyAgent: HttpsAgent | null = null

    public constructor(options: FakeWaServerOptions = {}) {
        this.wsServer = new WaFakeWsServer(options)
        this.wsServer.onConnection((connection) => this.handleConnection(connection))
        registerDefaultIqHandlers(this.iqRouter, this.buildIqHandlerDeps())
    }

    private buildIqHandlerDeps(): IqHandlerDeps {
        const reg = this.registries
        const preKey = this.preKeyDispenser
        const appState = this.appStateSync
        return {
            get peerRegistry() {
                return reg.peerRegistry
            },
            get groupRegistry() {
                return reg.groupRegistry
            },
            get privacySettings() {
                return reg.privacySettings
            },
            get blocklistJids() {
                return reg.blocklistJids
            },
            get profilePicturesByJid() {
                return reg.profilePicturesByJid
            },
            get businessProfilesByJid() {
                return reg.businessProfilesByJid
            },
            get abPropsInput() {
                return reg.abPropsInput
            },
            get issuedPrivacyTokens() {
                return reg.issuedPrivacyTokens
            },
            get latestStatusText() {
                return reg.latestStatusText
            },
            setLatestStatusText: (text: string) => {
                reg.latestStatusText = text
            },
            lookupDeviceIdsForUser: (userJid) => reg.lookupDeviceIdsForUser(userJid),
            notifyGroupOp: (op) => reg.notifyGroupOp(op),
            mutatePrivacySettings: (category, value) => reg.mutatePrivacySettings(category, value),
            mutateBlocklist: (action, jid) => reg.mutateBlocklist(action, jid),
            notifyProfilePictureSet: (op) => reg.notifyProfilePictureSet(op),
            handleProfilePictureSet: (targetJid, newId) =>
                reg.handleProfilePictureSet(targetJid, newId),
            notifyStatusSet: (text) => reg.notifyStatusSet(text),
            notifyLogout: () => reg.notifyLogout(),
            notifyPrivacyTokenIssue: (token) => reg.notifyPrivacyTokenIssue(token),
            notifyDirtyBitsClear: (op) => reg.notifyDirtyBitsClear(op),
            notifyPrivacySet: (change) => {
                for (const listener of reg.privacySetListeners) {
                    try {
                        listener(change)
                    } catch (error) {
                        void error
                    }
                }
            },
            notifyBlocklistChange: (change) => {
                for (const listener of reg.blocklistChangeListeners) {
                    try {
                        listener(change)
                    } catch (error) {
                        void error
                    }
                }
            },
            capturePreKeyBundle: (bundle) => preKey.captureBundle(bundle),
            consumeOutboundAppStatePatches: (iq) => appState.consumeOutboundAppStatePatches(iq),
            get appStateCollectionProviders() {
                return appState.appStateCollectionProviders
            },
            requireMediaHttpsInfo: () => this.requireMediaHttpsInfo()
        }
    }

    public registerIqHandler(
        matcher: WaFakeIqMatcher,
        respond: WaFakeIqResponder,
        label?: string
    ): () => void {
        const handler: WaFakeIqHandler = { matcher, respond, label }
        return this.iqRouter.register(handler, { priority: 'high' })
    }

    public async routeIqForTest(iq: BinaryNode): Promise<BinaryNode | null> {
        return this.iqRouter.route(iq)
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
        return this.preKeyDispenser.triggerPreKeyUpload(pipeline, options)
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
        return this.appStateSync.pushServerSyncNotification(pipeline, input)
    }

    public onAuthenticatedPipeline(listener: AuthenticatedPipelineListener): () => void {
        this.authenticatedListeners.add(listener)
        return () => this.authenticatedListeners.delete(listener)
    }

    public scenario(configure: (s: Scenario) => void): void {
        configure(new Scenario(this))
    }

    public expectIq(matcher: WaFakeIqMatcher, options: ExpectIqOptions = {}): Promise<BinaryNode> {
        const timeoutMs = options.timeoutMs ?? 2_000

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

    public capturedStanzaSnapshot(): readonly BinaryNode[] {
        return this.capturedStanzas.slice()
    }

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
            this.cachedMediaProxyAgent = new HttpsAgent({ rejectUnauthorized: false })
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
        const peer = await FakePeer.create(options, this.buildFakePeerDeps(pipeline))
        this.registries.peerRegistry.set(peer.jid, peer)
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
        const peers: FakePeer[] = []
        for (const deviceId of input.deviceIds) {
            const deviceJid = deviceId === 0 ? input.userJid : `${userPart}:${deviceId}@${server}`
            const peer = await FakePeer.create(
                {
                    jid: deviceJid,
                    displayName: input.displayName,
                    skipOneTimePreKey: input.skipOneTimePreKey
                },
                this.buildFakePeerDeps(pipeline)
            )
            this.registries.peerRegistry.set(peer.jid, peer)
            peers.push(peer)
        }
        return peers
    }

    private buildFakePeerDeps(pipeline: WaFakeConnectionPipeline): {
        readonly bundleResolver: () => Promise<ClientPreKeyBundle>
        readonly reserveOneTimePreKey: () => {
            readonly keyId: number
            readonly publicKey: Uint8Array
        } | null
        readonly pushStanza: (stanza: BinaryNode) => Promise<void>
        readonly subscribeInboundMessages: (listener: (stanza: BinaryNode) => void) => () => void
    } {
        return {
            bundleResolver: () => this.preKeyDispenser.awaitPreKeyBundle(),
            reserveOneTimePreKey: () => this.preKeyDispenser.dispenseOneTimePreKey(),
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
        const driver = new FakePairingDriver(options, {
            pipeline,
            companionMaterialResolver,
            waitForPairDeviceAck: async (pairDeviceIqId) => {
                await this.expectIq(
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
        const mediaHandler = this.buildMediaRequestHandler()
        this.wsServer.setHttpRequestHandler(mediaHandler)
        this.mediaHttpsServer.setRequestHandler(mediaHandler)
        this.listenInfo = await this.wsServer.listen()
        await this.mediaHttpsServer.listen('127.0.0.1')
    }

    public async stop(): Promise<void> {
        this.pipelines.clear()
        await this.wsServer.close()
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
            } catch (error) {
                void error
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

function matchesIq(iq: BinaryNode, matcher: WaFakeIqMatcher): boolean {
    if (iq.tag !== 'iq') return false
    if (matcher.id !== undefined && iq.attrs.id !== matcher.id) return false
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
    if (matcher.id !== undefined) parts.push(`id=${matcher.id}`)
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
