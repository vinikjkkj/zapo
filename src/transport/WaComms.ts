import { ConsoleLogger } from '../infra/log/ConsoleLogger'
import type { Logger } from '../infra/log/types'
import { WA_DEFAULTS } from '../protocol/constants'
import { bytesToBase64UrlSafe } from '../util/base64'
import { toError } from '../util/primitives'

import { EMPTY_BYTES } from './noise/constants'
import { WaNoiseSession } from './noise/WaNoiseSession'
import type {
    SocketCloseInfo,
    WaCommsConfig,
    WaCommsState
} from './types'
import { WaWebSocket } from './WaWebSocket'

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
    private resumeInFlight: boolean
    private resumeHandshakeFailures: number
    private noiseSession: WaNoiseSession | null
    private lastServerStaticKey: Uint8Array | null

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
            onMessage: async (payload) => {
                await this.onSocketMessage(payload)
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
        this.resumeInFlight = false
        this.resumeHandshakeFailures = 0
        this.noiseSession = null
        this.lastServerStaticKey = null
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
        this.pendingFrames = []
        this.started = true
        this.preventRetry = false
        this.connected = this.socket.isOpen()
        this.handlingRequests = false
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
        void this.flushPendingFrames()
    }

    public async stopComms(): Promise<void> {
        this.logger.info('comms stop requested')
        this.started = false
        this.connected = false
        this.handlingRequests = false
        this.preventRetry = true
        this.resumeInFlight = false
        this.resumeHandshakeFailures = 0
        this.noiseSession = null
        this.pendingFrames = []
        this.stanzaHandler = null
        this.inflateFrame = null
        this.clearReconnectTimer()
        this.rejectAllWaiters(new Error('comms stopped'))
        await this.socket.close(1000, 'stop_comms')
    }

    public async closeSocketAndResume(): Promise<void> {
        this.logger.info('comms close socket and resume requested')
        this.started = true
        this.connected = false
        this.preventRetry = false
        this.resumeInFlight = true
        this.noiseSession = null
        this.clearReconnectTimer()
        await this.socket.close(1000, 'resume_socket')
        this.resumeInFlight = false
        void this.openSocket(true)
    }

    public async closeSocketAndPreventRetry(): Promise<void> {
        this.logger.warn('comms close socket and prevent retry requested')
        this.preventRetry = true
        this.started = false
        this.connected = false
        this.handlingRequests = false
        this.resumeInFlight = false
        this.resumeHandshakeFailures = 0
        this.noiseSession = null
        this.pendingFrames = []
        this.clearReconnectTimer()
        this.rejectAllWaiters(new Error('socket closed and retry disabled'))
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
        this.pendingFrames = []
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

    private async onSocketMessage(payload: Uint8Array): Promise<void> {
        this.logger.trace('comms socket payload received', { byteLength: payload.byteLength })
        if (!this.noiseSession) {
            this.logger.warn('received socket payload before noise session init')
            return
        }
        try {
            const frames = await this.noiseSession.pushWireChunk(payload)
            for (const frame of frames) {
                await this.onDecodedFrame(frame)
            }
        } catch (error) {
            this.logger.error('failed to decode noise frame', { message: toError(error).message })
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
            this.pendingFrames.push(payload)
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
        for (const frame of buffered) {
            await this.onDecodedFrame(frame)
        }
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
        const buffered = this.pendingFrames.splice(0, this.pendingFrames.length)
        for (const frame of buffered) {
            await this.onDecodedFrame(frame)
        }
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
            this.resumeHandshakeFailures <
                WA_DEFAULTS.NOISE_RESUME_FAILURES_BEFORE_FULL_HANDSHAKE
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
}
