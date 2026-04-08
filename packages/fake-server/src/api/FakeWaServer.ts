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
    type WaFakeIqHandler,
    type WaFakeIqMatcher,
    type WaFakeIqResponder,
    WaFakeIqRouter
} from '../protocol/iq/router'
import { type BinaryNode } from '../transport/codec'
import { type SignalKeyPair, X25519 } from '../transport/crypto'

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

export class FakeWaServer {
    private readonly wsServer: WaFakeWsServer
    private readonly pipelines = new Set<WaFakeConnectionPipeline>()
    private readonly iqRouter = new WaFakeIqRouter()
    private readonly capturedStanzas: BinaryNode[] = []
    private readonly pendingIqExpectations = new Set<PendingIqExpectation>()
    private readonly pendingStanzaExpectations = new Set<PendingStanzaExpectation>()
    private readonly authenticatedListeners = new Set<AuthenticatedPipelineListener>()
    private rootCa: FakeNoiseRootCa | null = null
    private serverStaticKeyPair: SignalKeyPair | null = null
    private listenInfo: WaFakeWsServerListenInfo | null = null
    private pipelineListener: FakeWaServerPipelineListener | null = null
    private rejectMode: { readonly code: number; readonly reason: string } | null = null

    public constructor(options: FakeWaServerOptions = {}) {
        this.wsServer = new WaFakeWsServer(options)
        this.wsServer.onConnection((connection) => this.handleConnection(connection))
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

        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () =>
                    reject(
                        new Error(`waitForAuthenticatedPipeline timed out after ${timeoutMs}ms`)
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
