import { ConsoleLogger } from '@infra/log/ConsoleLogger'
import type { Logger } from '@infra/log/types'
import { WA_DEFAULTS, WA_READY_STATES } from '@protocol/constants'
import type {
    RawWebSocket,
    RawWebSocketConstructor,
    SocketCloseInfo,
    SocketOpenInfo,
    WaRawWebSocketInit,
    WaSocketConfig,
    WaSocketHandlers,
    WebSocketEventLike
} from '@transport/types'
import { TEXT_ENCODER, toBytesView } from '@util/bytes'
import { toError } from '@util/primitives'

interface PendingSocket {
    readonly url: string
    readonly socket: RawWebSocket
    timer: NodeJS.Timeout | null
    settled: boolean
}

type SocketRuntime = 'browser' | 'node'
const WS_OPTIONAL_MODULE = 'ws'

function asOptionalNodeWsConstructor(loaded: unknown): RawWebSocketConstructor | null {
    if (loaded && typeof loaded === 'object') {
        const direct = (loaded as { readonly WebSocket?: unknown }).WebSocket
        if (typeof direct === 'function') {
            return direct as RawWebSocketConstructor
        }
        const fallback = (loaded as { readonly default?: unknown }).default
        if (typeof fallback === 'function') {
            return fallback as RawWebSocketConstructor
        }
    }
    if (typeof loaded === 'function') {
        return loaded as RawWebSocketConstructor
    }
    return null
}

async function loadOptionalNodeWsConstructor(): Promise<RawWebSocketConstructor> {
    try {
        const loaded = await import(WS_OPTIONAL_MODULE)
        const constructor = asOptionalNodeWsConstructor(loaded)
        if (constructor) {
            return constructor
        }
        throw new Error('invalid ws module export')
    } catch (error) {
        const normalized = toError(error)
        const code = (normalized as NodeJS.ErrnoException).code
        const message = normalized.message ?? ''
        const isModuleNotFound =
            (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') &&
            (message.includes(`'${WS_OPTIONAL_MODULE}'`) ||
                message.includes(`"${WS_OPTIONAL_MODULE}"`))
        if (isModuleNotFound) {
            throw new Error('optional dependency "ws" is not installed. Install with: npm i ws')
        }
        throw normalized
    }
}

function resolveWebSocketConstructor(): RawWebSocketConstructor {
    const ctor = (globalThis as typeof globalThis & { WebSocket?: RawWebSocketConstructor })
        .WebSocket
    if (!ctor) {
        throw new Error('global WebSocket is not available in this runtime')
    }
    return ctor
}

function resolveSocketUrls(config: WaSocketConfig): readonly string[] {
    const preferredUrls = config.urls
    if (preferredUrls && preferredUrls.length > 0) {
        const unique: string[] = []
        for (const url of preferredUrls) if (unique.indexOf(url) === -1) unique.push(url)
        return Object.freeze(unique)
    }
    return config.url ? Object.freeze([config.url]) : WA_DEFAULTS.CHAT_SOCKET_URLS
}

function resolveSocketRuntime(): SocketRuntime {
    const maybeNodeProcess = (
        globalThis as typeof globalThis & {
            process?: {
                versions?: {
                    node?: string
                }
            }
        }
    ).process
    if (typeof maybeNodeProcess?.versions?.node === 'string') {
        return 'node'
    }
    return 'browser'
}

export class WaWebSocket {
    private readonly config: Readonly<
        Required<Pick<WaSocketConfig, 'timeoutIntervalMs'>> &
            Omit<WaSocketConfig, 'timeoutIntervalMs'>
    >
    private readonly socketUrls: readonly string[]
    private readonly logger: Logger
    private readonly webSocketCtor: RawWebSocketConstructor
    private readonly customWebSocketCtor: boolean
    private readonly socketRuntime: SocketRuntime
    private readonly connectingSockets: Set<RawWebSocket>
    private handlers: WaSocketHandlers
    private socket: RawWebSocket | null
    private closeWaiter: ((info: SocketCloseInfo) => void) | null
    private nodeWsCtorPromise: Promise<RawWebSocketConstructor> | null

    public constructor(config: WaSocketConfig, logger: Logger = new ConsoleLogger('info')) {
        this.config = Object.freeze({
            ...config,
            timeoutIntervalMs: config.timeoutIntervalMs ?? 10_000
        })
        this.socketUrls = resolveSocketUrls(config)
        this.logger = logger
        this.webSocketCtor = config.rawWebSocketConstructor ?? resolveWebSocketConstructor()
        this.customWebSocketCtor = Boolean(config.rawWebSocketConstructor)
        this.socketRuntime = resolveSocketRuntime()
        this.connectingSockets = new Set<RawWebSocket>()
        this.handlers = {}
        this.socket = null
        this.closeWaiter = null
        this.nodeWsCtorPromise = null
    }

    public setHandlers(handlers: WaSocketHandlers): void {
        this.handlers = handlers
    }

    public isOpen(): boolean {
        return this.socket?.readyState === WA_READY_STATES.OPEN
    }

    public isConnecting(): boolean {
        return (
            this.socket?.readyState === WA_READY_STATES.CONNECTING ||
            this.connectingSockets.size > 0
        )
    }

    public async open(): Promise<SocketOpenInfo> {
        if (this.isOpen()) {
            this.logger.trace('socket open skipped: already open')
            return { openedAt: Date.now() }
        }
        if (this.isConnecting()) {
            throw new Error('websocket is already connecting')
        }
        this.logger.info('socket open start', { urls: this.socketUrls.length })

        if (this.socketUrls.length === 1) {
            return this.openSingle(this.socketUrls[0])
        }
        return this.openConcurrently(this.socketUrls)
    }

    public async close(code = 1000, reason = ''): Promise<SocketCloseInfo | null> {
        this.logger.debug('socket close requested', { code, reason })
        const socket = this.socket
        if (!socket) {
            if (this.connectingSockets.size > 0) {
                for (const connectingSocket of this.connectingSockets) {
                    this.closeSocketSafe(connectingSocket, code, reason)
                }
                this.connectingSockets.clear()
                return {
                    code,
                    reason,
                    wasClean: true
                }
            }
            return null
        }
        if (socket.readyState === WA_READY_STATES.CLOSED) {
            this.socket = null
            return {
                code,
                reason,
                wasClean: true
            }
        }

        return new Promise<SocketCloseInfo>((resolve) => {
            const timer = setTimeout(() => {
                if (this.closeWaiter) {
                    this.closeWaiter = null
                    if (this.socket === socket) {
                        this.socket = null
                    }
                    resolve({
                        code,
                        reason,
                        wasClean: false
                    })
                }
            }, this.config.timeoutIntervalMs)

            this.closeWaiter = (info) => {
                clearTimeout(timer)
                if (this.socket === socket) {
                    this.socket = null
                }
                resolve(info)
            }

            try {
                socket.close(code, reason)
            } catch (error) {
                clearTimeout(timer)
                this.closeWaiter = null
                if (this.socket === socket) {
                    this.socket = null
                }
                resolve({
                    code,
                    reason,
                    wasClean: false
                })
                void this.handlers.onError?.(toError(error))
            }
        })
    }

    public async send(data: string | ArrayBuffer | Uint8Array): Promise<void> {
        const socket = this.socket
        if (!socket || socket.readyState !== WA_READY_STATES.OPEN) {
            throw new Error('websocket is not connected')
        }
        socket.send(data)
    }

    private async openSingle(url: string): Promise<SocketOpenInfo> {
        const pending = await this.createPendingSocket(url)

        return new Promise<SocketOpenInfo>((resolve, reject) => {
            this.bindPendingSocket(pending, {
                onOpen: () => {
                    if (!this.settlePendingSocket(pending)) {
                        return
                    }
                    resolve(this.activatePendingSocket(pending, 'socket open success'))
                },
                onFail: (error) => {
                    if (!this.settlePendingSocket(pending)) {
                        return
                    }
                    if (this.socket === pending.socket) {
                        this.socket = null
                    }
                    reject(error)
                }
            })
        })
    }

    private async openConcurrently(urls: readonly string[]): Promise<SocketOpenInfo> {
        const setupResults = await Promise.allSettled(
            urls.map((url) => this.createPendingSocket(url))
        )
        const pendingSockets: PendingSocket[] = []
        let setupError: Error | null = null
        for (const result of setupResults) {
            if (result.status === 'fulfilled') {
                pendingSockets.push(result.value)
                continue
            }
            setupError = setupError ?? toError(result.reason)
        }
        if (setupError) {
            this.releasePendingSocketsAfterSetupFailure(pendingSockets)
            throw setupError
        }

        return new Promise<SocketOpenInfo>((resolve, reject) => {
            let done = false
            let failedCount = 0
            let lastError: Error | null = null

            const fail = (entry: PendingSocket, error: Error): void => {
                if (done || !this.settlePendingSocket(entry)) {
                    return
                }
                failedCount += 1
                lastError = error
                if (failedCount === pendingSockets.length) {
                    done = true
                    reject(lastError ?? new Error('websocket connect error'))
                }
            }

            const win = (entry: PendingSocket): void => {
                if (!this.settlePendingSocket(entry)) {
                    return
                }
                if (done) {
                    this.closeSocketSafe(entry.socket, 1000, 'loser_socket')
                    return
                }

                done = true
                for (const other of pendingSockets) {
                    if (other.socket === entry.socket) {
                        continue
                    }
                    if (!this.settlePendingSocket(other)) {
                        continue
                    }
                    this.closeSocketSafe(other.socket, 1000, 'loser_socket')
                }

                resolve(this.activatePendingSocket(entry, 'socket open success (race winner)'))
            }

            for (const entry of pendingSockets) {
                this.bindPendingSocket(entry, {
                    onOpen: () => win(entry),
                    onFail: (error) => fail(entry, error)
                })
            }
        })
    }

    private releasePendingSocketsAfterSetupFailure(entries: readonly PendingSocket[]): void {
        for (const entry of entries) {
            if (!this.settlePendingSocket(entry)) {
                continue
            }
            this.closeSocketSafe(entry.socket, 1000, 'connect_setup_failed')
        }
    }

    private bindRuntimeHandlers(socket: RawWebSocket): void {
        socket.onmessage = (event) => {
            void this.handleMessage(event.data)
        }
        socket.onerror = (event) => {
            this.handleRuntimeError(event)
        }
        socket.onclose = (event) => {
            this.handleRuntimeClose(socket, event)
        }
    }

    private async handleMessage(data: unknown): Promise<void> {
        try {
            const payload = await this.normalizePayload(data)
            if (!payload) {
                this.logger.trace('socket message ignored: unsupported payload shape')
                return
            }
            await this.handlers.onMessage?.(payload)
        } catch (error) {
            this.logger.error('socket message handling failed', {
                message: toError(error).message
            })
            void this.handlers.onError?.(toError(error))
        }
    }

    private async normalizePayload(data: unknown): Promise<Uint8Array | null> {
        if (data instanceof Uint8Array) {
            return data
        }
        if (data instanceof ArrayBuffer) {
            return toBytesView(data)
        }
        if (ArrayBuffer.isView(data)) {
            return toBytesView(data)
        }
        if (typeof data === 'string') {
            return TEXT_ENCODER.encode(data)
        }
        if (data && typeof data === 'object' && 'arrayBuffer' in data) {
            const maybeBlob = data as { arrayBuffer: () => Promise<ArrayBuffer> }
            const buffer = await maybeBlob.arrayBuffer()
            return toBytesView(buffer)
        }
        return null
    }

    private async createPendingSocket(url: string): Promise<PendingSocket> {
        const socket = await this.createRawSocket(url)
        socket.binaryType = 'arraybuffer'
        this.connectingSockets.add(socket)
        return {
            url,
            socket,
            timer: null,
            settled: false
        }
    }

    private bindPendingSocket(
        entry: PendingSocket,
        handlers: {
            readonly onOpen: () => void
            readonly onFail: (error: Error) => void
        }
    ): void {
        entry.timer = setTimeout(() => {
            this.logger.warn('socket connect timeout', { url: entry.url })
            this.closeSocketSafe(entry.socket, 4000, 'connect_timeout')
            handlers.onFail(new Error(`websocket connect timeout for ${entry.url}`))
        }, this.config.timeoutIntervalMs)

        entry.socket.onopen = () => {
            handlers.onOpen()
        }
        entry.socket.onerror = () => {
            this.logger.warn('socket open error', { url: entry.url })
            handlers.onFail(new Error(`websocket connect error for ${entry.url}`))
        }
        entry.socket.onclose = (event) => {
            const info = this.toCloseInfo(event)
            this.logger.warn('socket closed before open', {
                url: entry.url,
                code: info.code,
                reason: info.reason
            })
            handlers.onFail(
                new Error(
                    `websocket closed before open (${info.code}:${info.reason}) for ${entry.url}`
                )
            )
        }
    }

    private settlePendingSocket(entry: PendingSocket): boolean {
        if (entry.settled) {
            return false
        }
        entry.settled = true
        this.releasePendingSocket(entry)
        return true
    }

    private releasePendingSocket(entry: PendingSocket): void {
        if (entry.timer) {
            clearTimeout(entry.timer)
            entry.timer = null
        }
        this.connectingSockets.delete(entry.socket)
    }

    private activatePendingSocket(entry: PendingSocket, message: string): SocketOpenInfo {
        const info = { openedAt: Date.now() }
        this.socket = entry.socket
        this.bindRuntimeHandlers(entry.socket)
        this.logger.info(message, { url: entry.url })
        void this.handlers.onOpen?.(info)
        return info
    }

    private toCloseInfo(event: WebSocketEventLike): SocketCloseInfo {
        return {
            code: typeof event.code === 'number' ? event.code : 1000,
            reason: typeof event.reason === 'string' ? event.reason : '',
            wasClean: event.wasClean === true
        }
    }

    private handleRuntimeError(event: WebSocketEventLike): void {
        void event
        this.logger.warn('socket runtime error event')
        void this.handlers.onError?.(new Error('websocket runtime error'))
    }

    private handleRuntimeClose(socket: RawWebSocket, event: WebSocketEventLike): void {
        const info = this.toCloseInfo(event)
        this.logger.info('socket runtime closed', {
            code: info.code,
            reason: info.reason,
            wasClean: info.wasClean
        })
        if (this.socket === socket) {
            this.socket = null
        }
        const waiter = this.closeWaiter
        this.closeWaiter = null
        if (waiter) {
            waiter(info)
        }
        void this.handlers.onClose?.(info)
    }

    private closeSocketSafe(socket: RawWebSocket, code: number, reason: string): void {
        try {
            socket.close(code, reason)
        } catch {
            // no-op
        }
    }

    private async createRawSocket(url: string): Promise<RawWebSocket> {
        const headers = this.config.headers
        const dispatcher = this.config.dispatcher
        const agent = this.config.agent
        if (this.customWebSocketCtor) {
            return new this.webSocketCtor(url, this.config.protocols, {
                headers,
                dispatcher,
                agent
            })
        }
        let hasHeaders = false
        if (headers) {
            for (const key in headers) {
                if (Object.prototype.hasOwnProperty.call(headers, key)) {
                    hasHeaders = true
                    break
                }
            }
        }

        if (this.socketRuntime === 'node' && agent) {
            const nodeWsCtor = await this.resolveNodeWsConstructor()
            return new nodeWsCtor(url, this.config.protocols, {
                headers,
                agent
            })
        }

        if (this.socketRuntime === 'node' && (hasHeaders || dispatcher || agent)) {
            const globalWebSocketCtor = (
                globalThis as typeof globalThis & { WebSocket?: RawWebSocketConstructor }
            ).WebSocket
            if (globalWebSocketCtor && this.webSocketCtor === globalWebSocketCtor) {
                const init: WaRawWebSocketInit = {
                    protocols: this.config.protocols,
                    headers,
                    dispatcher,
                    agent
                }
                return new this.webSocketCtor(url, init)
            }

            return new this.webSocketCtor(url, this.config.protocols, {
                headers,
                dispatcher,
                agent
            })
        }
        return new this.webSocketCtor(url, this.config.protocols)
    }

    private async resolveNodeWsConstructor(): Promise<RawWebSocketConstructor> {
        if (!this.nodeWsCtorPromise) {
            this.nodeWsCtorPromise = loadOptionalNodeWsConstructor().catch((error) => {
                this.nodeWsCtorPromise = null
                throw error
            })
        }
        return this.nodeWsCtorPromise
    }
}
