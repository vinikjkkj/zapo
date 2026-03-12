import { ConsoleLogger } from '@infra/log/ConsoleLogger'
import type { Logger } from '@infra/log/types'
import { BoundedTaskQueue, isBoundedTaskQueueFullError } from '@infra/perf/BoundedTaskQueue'
import { WA_DEFAULTS } from '@protocol/constants'
import { WaNoiseSession } from '@transport/noise/WaNoiseSession'
import type { SocketCloseInfo, WaCommsConfig, WaCommsState } from '@transport/types'
import { WaWebSocket } from '@transport/WaWebSocket'
import { bytesToBase64UrlSafe } from '@util/base64'
import { EMPTY_BYTES } from '@util/bytes'
import { toError } from '@util/primitives'

const WA_FRAME_HANDLER_QUEUE_MAX_SIZE = 4096
const WA_FRAME_HANDLER_MAX_CONCURRENCY = 8
const WA_PENDING_FRAMES_MAX_COUNT = 2048
const WA_PENDING_FRAMES_MAX_BYTES = 16 * 1024 * 1024

interface ConnectionWaiter {
    readonly resolve: () => void
    readonly reject: (error: Error) => void
    readonly timer: NodeJS.Timeout
}

type StanzaHandler = (payload: Uint8Array) => void | Promise<void>
type InflateFrame = (compressed: Uint8Array) => Uint8Array | Promise<Uint8Array>

export class WaComms {
    private readonly config: Readonly<
        Required<
            Pick<WaCommsConfig, 'connectTimeoutMs' | 'reconnectIntervalMs' | 'timeoutIntervalMs'>
        > &
            Omit<WaCommsConfig, 'connectTimeoutMs' | 'reconnectIntervalMs' | 'timeoutIntervalMs'>
    >
    private readonly logger: Logger
    private readonly socket: WaWebSocket
    private started: boolean
    private connected: boolean
    private handlingRequests: boolean
    private preventRetry: boolean
    private reconnectAttempts: number
    private reconnectTimer: NodeJS.Timeout | null
    private waiters: ConnectionWaiter[]
    private stanzaHandler: StanzaHandler | null
    private inflateFrame: InflateFrame | null
    private pendingFrames: Uint8Array[]
    private pendingFramesByteLength: number
    private readonly pendingFramesMaxCount: number
    private readonly pendingFramesMaxBytes: number
    private pendingFramesOverflowClosing: boolean
    private resumeInFlight: boolean
    private resumeHandshakeFailures: number
    private noiseSession: WaNoiseSession | null
    private lastServerStaticKey: Uint8Array | null
    private frameProcessingQueue: Promise<void>
    private readonly frameHandlerQueue: BoundedTaskQueue

    public constructor(config: WaCommsConfig, logger: Logger = new ConsoleLogger('info')) {
        if (!config.noise) {
            throw new Error('WaComms requires noise config')
        }
        const routedSocketConfig = this.applyRoutingInfoToSocketConfig(config)
        this.config = Object.freeze({
            ...routedSocketConfig,
            connectTimeoutMs: routedSocketConfig.connectTimeoutMs ?? 10_000,
            reconnectIntervalMs: routedSocketConfig.reconnectIntervalMs ?? 2_000,
            timeoutIntervalMs: routedSocketConfig.timeoutIntervalMs ?? 10_000
        })
        this.logger = logger
        this.socket = new WaWebSocket(
            {
                url: this.config.url,
                urls: this.config.urls,
                protocols: this.config.protocols,
                timeoutIntervalMs: this.config.timeoutIntervalMs
            },
            logger
        )
        this.socket.setHandlers({
            onOpen: async () => {
                try {
                    await this.onSocketOpened()
                } catch (error) {
                    this.connected = false
                    this.logger.error('noise handshake failed', { message: toError(error).message })
                    await this.socket.close(4003, 'noise_handshake_failed')
                }
            },
            onClose: async (info) => {
                await this.onSocketClosed(info)
            },
            onError: async (error) => {
                this.logger.warn('socket runtime error', { message: error.message })
            },
            onMessage: (payload) => {
                this.onSocketMessage(payload)
            }
        })
        this.started = false
        this.connected = false
        this.handlingRequests = false
        this.preventRetry = false
        this.reconnectAttempts = 0
        this.reconnectTimer = null
        this.waiters = []
        this.stanzaHandler = null
        this.inflateFrame = null
        this.pendingFrames = []
        this.pendingFramesByteLength = 0
        this.pendingFramesMaxCount = WA_PENDING_FRAMES_MAX_COUNT
        this.pendingFramesMaxBytes = WA_PENDING_FRAMES_MAX_BYTES
        this.pendingFramesOverflowClosing = false
        this.resumeInFlight = false
        this.resumeHandshakeFailures = 0
        this.noiseSession = null
        this.lastServerStaticKey = null
        this.frameProcessingQueue = Promise.resolve()
        this.frameHandlerQueue = new BoundedTaskQueue(
            WA_FRAME_HANDLER_QUEUE_MAX_SIZE,
            WA_FRAME_HANDLER_MAX_CONCURRENCY
        )
    }

    private applyRoutingInfoToSocketConfig(config: WaCommsConfig): WaCommsConfig {
        const routingInfo = config.noise.routingInfo
        if (!routingInfo || routingInfo.byteLength === 0) {
            return config
        }
        const edValue = bytesToBase64UrlSafe(routingInfo)
        const appendEd = (url: string): string => {
            try {
                const parsed = new URL(url)
                if (!parsed.searchParams.has('ED')) {
                    parsed.searchParams.set('ED', edValue)
                }
                return parsed.toString()
            } catch {
                if (url.includes('ED=')) {
                    return url
                }
                const separator = url.includes('?') ? '&' : '?'
                return `${url}${separator}ED=${encodeURIComponent(edValue)}`
            }
        }
        const cookieHeader = this.withStickyRoutingCookie(config.headers)
        return {
            ...config,
            headers: cookieHeader,
            url: config.url ? appendEd(config.url) : config.url,
            urls: config.urls
                ? config.urls.map((entry) => appendEd(entry))
                : config.url
                  ? undefined
                  : WA_DEFAULTS.CHAT_SOCKET_URLS.map((entry) => appendEd(entry))
        }
    }

    public startComms(handleStanza: StanzaHandler, inflateFrame?: InflateFrame): void {
        this.logger.info('comms start requested')
        this.stanzaHandler = handleStanza
        this.inflateFrame = inflateFrame ?? null
        this.clearPendingFrames()
        this.pendingFramesOverflowClosing = false
        this.started = true
        this.preventRetry = false
        this.connected = this.socket.isOpen()
        this.handlingRequests = false
        this.frameProcessingQueue = Promise.resolve()
        this.clearReconnectTimer()
        void this.openSocket(false)
    }

    public async waitForConnection(timeoutMs = this.config.connectTimeoutMs): Promise<void> {
        if (!this.started) {
            throw new Error('comms not started')
        }
        if (this.connected) {
            this.logger.trace('comms waitForConnection immediate success')
            return
        }
        this.logger.debug('comms waiting for connection', { timeoutMs })

        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.removeWaiter(reject)
                reject(new Error(`comms connection timeout after ${timeoutMs}ms`))
            }, timeoutMs)

            this.waiters.push({
                resolve,
                reject,
                timer
            })
        })
    }

    public startHandlingRequests(): void {
        this.handlingRequests = true
        this.logger.debug('comms request handling enabled')
        this.frameProcessingQueue = this.frameProcessingQueue
            .catch(() => undefined)
            .then(async () => this.flushPendingFrames())
    }

    public async stopComms(): Promise<void> {
        this.logger.info('comms stop requested')
        this.resetConnectionState({
            started: false,
            connected: false,
            handlingRequests: false,
            preventRetry: true,
            resumeInFlight: false,
            clearHandlers: true,
            rejectWaitersError: new Error('comms stopped')
        })
        await this.socket.close(1000, 'stop_comms')
    }

    public async closeSocketAndResume(): Promise<void> {
        this.logger.info('comms close socket and resume requested')
        this.resetConnectionState({
            started: true,
            connected: false,
            handlingRequests: this.handlingRequests,
            preventRetry: false,
            resumeInFlight: true,
            resetResumeHandshakeFailures: false
        })
        await this.socket.close(1000, 'resume_socket')
        this.resumeInFlight = false
        void this.openSocket(true)
    }

    public async closeSocketAndPreventRetry(): Promise<void> {
        this.logger.warn('comms close socket and prevent retry requested')
        this.resetConnectionState({
            started: false,
            connected: false,
            handlingRequests: false,
            preventRetry: true,
            resumeInFlight: false,
            rejectWaitersError: new Error('socket closed and retry disabled')
        })
        await this.socket.close(1000, 'prevent_retry')
    }

    public async sendFrame(payload: Uint8Array): Promise<void> {
        if (!this.noiseSession) {
            throw new Error('noise session not ready')
        }
        this.logger.trace('comms sendFrame', { byteLength: payload.byteLength })
        const wire = await this.noiseSession.encryptFrame(payload)
        await this.socket.send(wire)
    }

    public getCommsState(): Readonly<WaCommsState> {
        return {
            started: this.started,
            connected: this.connected,
            handlingRequests: this.handlingRequests,
            reconnectAttempts: this.reconnectAttempts
        }
    }

    public getServerStaticKey(): Uint8Array | null {
        if (this.noiseSession) {
            const current = this.noiseSession.getServerStaticKey()
            if (current) {
                this.lastServerStaticKey = current
                return current
            }
        }
        return this.lastServerStaticKey
    }

    private async openSocket(isReconnect: boolean): Promise<void> {
        if (!this.started || this.preventRetry) {
            this.logger.trace('comms openSocket skipped', {
                started: this.started,
                preventRetry: this.preventRetry
            })
            return
        }
        if (this.socket.isOpen() || this.socket.isConnecting()) {
            this.logger.trace('comms openSocket skipped: socket already open/connecting')
            return
        }
        if (isReconnect) {
            this.reconnectAttempts += 1
            if (
                this.config.maxReconnectAttempts !== null &&
                this.config.maxReconnectAttempts !== undefined &&
                this.reconnectAttempts > this.config.maxReconnectAttempts
            ) {
                this.preventRetry = true
                this.started = false
                this.rejectAllWaiters(new Error('max reconnect attempts reached'))
                return
            }
        }

        try {
            this.logger.debug('comms opening websocket', { isReconnect })
            await this.socket.open()
        } catch (error) {
            this.connected = false
            if (!this.preventRetry && this.started) {
                this.scheduleReconnect()
            }
            this.logger.warn('socket open failed', { message: toError(error).message })
        }
    }

    private async onSocketClosed(info: SocketCloseInfo): Promise<void> {
        this.connected = false
        this.noiseSession?.onSocketClosed(new Error(`socket closed (${info.code}:${info.reason})`))
        this.noiseSession = null
        this.clearPendingFrames()
        this.pendingFramesOverflowClosing = false
        if (!this.started || this.preventRetry) {
            this.logger.trace('comms socket close ignored for reconnect', {
                started: this.started,
                preventRetry: this.preventRetry
            })
            return
        }
        if (this.resumeInFlight) {
            this.logger.trace('comms socket close while resume in-flight')
            return
        }
        this.scheduleReconnect()
        this.logger.info('socket closed, scheduling reconnect', {
            code: info.code,
            reason: info.reason,
            reconnectAfterMs: this.config.reconnectIntervalMs
        })
    }

    private onSocketMessage(payload: Uint8Array): void {
        this.logger.trace('comms socket payload received', { byteLength: payload.byteLength })
        this.frameProcessingQueue = this.frameProcessingQueue
            .catch(() => undefined)
            .then(async () => this.processSocketPayload(payload))
    }

    private async processSocketPayload(payload: Uint8Array): Promise<void> {
        if (!this.noiseSession) {
            this.logger.warn('received socket payload before noise session init')
            return
        }
        try {
            const frames = await this.noiseSession.pushWireChunk(payload)
            this.routeDecodedFrames(frames)
        } catch (error) {
            const normalized = toError(error)
            this.logger.error('failed to decode noise frame', { message: normalized.message })
            if (!this.started || this.preventRetry || this.resumeInFlight) {
                return
            }
            this.logger.warn('resuming socket after noise decode failure')
            void this.closeSocketAndResume().catch((resumeError) => {
                this.logger.warn('failed to resume socket after noise decode failure', {
                    message: toError(resumeError).message
                })
            })
        }
    }

    private async onDecodedFrame(payload: Uint8Array): Promise<void> {
        if (!this.stanzaHandler) {
            return
        }
        if (!this.handlingRequests) {
            this.logger.trace('comms frame queued until request handling starts', {
                byteLength: payload.byteLength
            })
            this.tryQueuePendingFrames([payload], 'decoded_frame')
            return
        }
        try {
            const frame = this.inflateFrame ? await this.inflateFrame(payload) : payload
            await this.stanzaHandler(frame)
        } catch (error) {
            this.logger.error('failed to handle incoming frame', {
                message: toError(error).message
            })
        }
    }

    private async onSocketOpened(): Promise<void> {
        this.logger.debug('comms socket opened, starting noise session')
        const { noiseConfig, usedResumeHandshake } = this.buildNoiseConfigForAttempt()
        const session = new WaNoiseSession(async (wire) => this.socket.send(wire), this.logger)
        this.noiseSession = session
        try {
            await session.start(noiseConfig)
        } catch (error) {
            if (usedResumeHandshake) {
                this.resumeHandshakeFailures += 1
                this.logger.warn(
                    'noise resume handshake failed, next attempt may fallback to full',
                    {
                        failures: this.resumeHandshakeFailures,
                        threshold: WA_DEFAULTS.NOISE_RESUME_FAILURES_BEFORE_FULL_HANDSHAKE
                    }
                )
            }
            this.noiseSession = null
            throw error
        }
        const buffered = await session.pushWireChunk(EMPTY_BYTES)
        this.routeDecodedFrames(buffered)
        this.resumeHandshakeFailures = 0
        this.lastServerStaticKey = session.getServerStaticKey()
        this.connected = true
        this.reconnectAttempts = 0
        this.logger.info('comms connected and noise session established')
        this.resolveAllWaiters()
    }

    private async flushPendingFrames(): Promise<void> {
        if (!this.handlingRequests || !this.stanzaHandler || this.pendingFrames.length === 0) {
            return
        }
        this.logger.debug('flushing pending comms frames', { count: this.pendingFrames.length })
        const buffered = this.pendingFrames
        this.pendingFrames = []
        this.pendingFramesByteLength = 0
        this.routeDecodedFrames(buffered)
    }

    private routeDecodedFrames(frames: readonly Uint8Array[]): void {
        if (frames.length === 0) {
            return
        }
        if (!this.handlingRequests || !this.stanzaHandler) {
            this.logger.trace('comms frame queued until request handling starts', {
                count: frames.length
            })
            this.tryQueuePendingFrames(frames, 'decoded_batch')
            return
        }
        for (const frame of frames) {
            this.scheduleDecodedFrame(frame)
        }
    }

    private clearPendingFrames(): void {
        this.pendingFrames = []
        this.pendingFramesByteLength = 0
    }

    private tryQueuePendingFrames(frames: readonly Uint8Array[], source: string): boolean {
        if (frames.length === 0) {
            return true
        }
        let incomingBytes = 0
        for (let index = 0; index < frames.length; index += 1) {
            incomingBytes += frames[index].byteLength
        }
        const nextCount = this.pendingFrames.length + frames.length
        const nextBytes = this.pendingFramesByteLength + incomingBytes
        if (nextCount > this.pendingFramesMaxCount || nextBytes > this.pendingFramesMaxBytes) {
            this.logger.error('pending comms frame buffer overflow', {
                source,
                currentCount: this.pendingFrames.length,
                currentBytes: this.pendingFramesByteLength,
                incomingCount: frames.length,
                incomingBytes,
                maxCount: this.pendingFramesMaxCount,
                maxBytes: this.pendingFramesMaxBytes
            })
            this.clearPendingFrames()
            this.schedulePendingFramesOverflowClose()
            return false
        }
        this.pendingFrames.push(...frames)
        this.pendingFramesByteLength = nextBytes
        return true
    }

    private schedulePendingFramesOverflowClose(): void {
        if (this.pendingFramesOverflowClosing || this.preventRetry) {
            return
        }
        this.pendingFramesOverflowClosing = true
        // Pending frames are intentionally bounded to prevent unbounded memory growth.
        void this.closeSocketAndPreventRetry()
            .catch((error) => {
                this.logger.warn('failed to close socket after pending frame overflow', {
                    message: toError(error).message
                })
            })
            .finally(() => {
                this.pendingFramesOverflowClosing = false
            })
    }

    private scheduleDecodedFrame(frame: Uint8Array): void {
        void this.frameHandlerQueue
            .enqueue(async () => this.onDecodedFrame(frame))
            .catch((error) => {
                const normalized = toError(error)
                this.logger.error('failed to enqueue decoded frame handler', {
                    message: normalized.message
                })
                if (!isBoundedTaskQueueFullError(error)) {
                    return
                }
                this.logger.warn('frame handler queue is full, processing frame inline', {
                    pending: this.frameHandlerQueue.pending(),
                    inFlight: this.frameHandlerQueue.inFlight()
                })
                void this.onDecodedFrame(frame)
            })
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) {
            this.logger.trace('reconnect already scheduled')
            return
        }
        this.logger.debug('scheduling reconnect timer', {
            intervalMs: this.config.reconnectIntervalMs
        })
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            void this.openSocket(true)
        }, this.config.reconnectIntervalMs)
    }

    private clearReconnectTimer(): void {
        if (!this.reconnectTimer) {
            return
        }
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
    }

    private resolveAllWaiters(): void {
        const waiters = this.waiters.splice(0, this.waiters.length)
        for (const waiter of waiters) {
            clearTimeout(waiter.timer)
            waiter.resolve()
        }
    }

    private rejectAllWaiters(error: Error): void {
        const waiters = this.waiters.splice(0, this.waiters.length)
        for (const waiter of waiters) {
            clearTimeout(waiter.timer)
            waiter.reject(error)
        }
    }

    private removeWaiter(reject: ConnectionWaiter['reject']): void {
        const index = this.waiters.findIndex((entry) => entry.reject === reject)
        if (index === -1) {
            return
        }
        const [waiter] = this.waiters.splice(index, 1)
        clearTimeout(waiter.timer)
    }

    private withStickyRoutingCookie(
        headers: WaCommsConfig['headers']
    ): Readonly<Record<string, string>> {
        const out: Record<string, string> = headers ? { ...headers } : {}
        const currentCookie = out.Cookie ?? out.cookie
        if (currentCookie) {
            if (currentCookie.includes('sticky_routing=')) {
                return out
            }
            out.Cookie = `${currentCookie}; sticky_routing=`
            delete out.cookie
            return out
        }
        out.Cookie = 'sticky_routing='
        return out
    }

    private buildNoiseConfigForAttempt(): {
        readonly noiseConfig: WaCommsConfig['noise']
        readonly usedResumeHandshake: boolean
    } {
        const hasServerStaticKey =
            this.config.noise.serverStaticKey !== null &&
            this.config.noise.serverStaticKey !== undefined &&
            this.config.noise.serverStaticKey.byteLength === 32
        if (
            hasServerStaticKey &&
            this.resumeHandshakeFailures < WA_DEFAULTS.NOISE_RESUME_FAILURES_BEFORE_FULL_HANDSHAKE
        ) {
            return {
                noiseConfig: this.config.noise,
                usedResumeHandshake: true
            }
        }
        if (hasServerStaticKey) {
            this.logger.info('noise resume temporarily disabled after previous failure(s)', {
                failures: this.resumeHandshakeFailures
            })
        }
        return {
            noiseConfig: {
                ...this.config.noise,
                serverStaticKey: undefined
            },
            usedResumeHandshake: false
        }
    }

    private resetConnectionState(options: {
        readonly started: boolean
        readonly connected: boolean
        readonly handlingRequests: boolean
        readonly preventRetry: boolean
        readonly resumeInFlight: boolean
        readonly clearHandlers?: boolean
        readonly rejectWaitersError?: Error
        readonly resetResumeHandshakeFailures?: boolean
    }): void {
        this.started = options.started
        this.connected = options.connected
        this.handlingRequests = options.handlingRequests
        this.preventRetry = options.preventRetry
        this.resumeInFlight = options.resumeInFlight
        if (options.resetResumeHandshakeFailures !== false) {
            this.resumeHandshakeFailures = 0
        }
        this.noiseSession = null
        this.clearPendingFrames()
        this.pendingFramesOverflowClosing = false
        if (options.clearHandlers) {
            this.stanzaHandler = null
            this.inflateFrame = null
        }
        this.clearReconnectTimer()
        if (options.rejectWaitersError) {
            this.rejectAllWaiters(options.rejectWaitersError)
        }
    }
}
