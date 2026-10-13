import { toArrayBuffer } from '../bytes.js'
import { toError } from '../errors.js'
import type { Logger } from '../logger.js'

import { type Connection, isLegOpen } from './leg.js'
import { buildWhatsAppPing } from './stun.js'
import type { RelayTraffic } from './trace.js'

/** `relay_ping_interval` while the call sets up, then once it is accepted. */
const PING_SETUP_INTERVAL_MS = 5000
const PING_INTERVAL_MS = 1000
/** `relay_unresponsive_timeout`: a leg with a ping unanswered this long leaves the election. */
const UNRESPONSIVE_TIMEOUT_MS = 4000

export interface WaRelayKeepaliveOptions {
    readonly logger: Logger
    readonly now: () => number
    /** Hands a datagram to a leg; whether it went out. */
    readonly send: (conn: Connection, data: ArrayBuffer) => boolean
    /** Whether media goes out on `conn`, for the log of a leg going unresponsive. */
    readonly isElected: (conn: Connection) => boolean
    /** The call's datagram counts, which the periodic diagnostics carry. */
    readonly traffic: Readonly<RelayTraffic>
}

/**
 * Pings each open leg on the call's cadence and takes a leg whose pings go unanswered out of the
 * media election until it answers again.
 */
export class WaRelayKeepalive {
    private readonly logger: Logger
    private readonly now: () => number
    private readonly send: (conn: Connection, data: ArrayBuffer) => boolean
    private readonly isElected: (conn: Connection) => boolean
    private readonly traffic: Readonly<RelayTraffic>
    private readonly timers = new Map<string, ReturnType<typeof setInterval>>()
    private pingIntervalMs = PING_SETUP_INTERVAL_MS

    constructor(options: WaRelayKeepaliveOptions) {
        this.logger = options.logger
        this.now = options.now
        this.send = options.send
        this.isElected = options.isElected
        this.traffic = options.traffic
    }

    start(conn: Connection): void {
        const connectionId = conn.id
        this.stop(connectionId)

        this.sendPing(conn)
        this.logger.debug('keepalive first ping sent', { connectionId })

        let keepaliveCount = 0
        const timer = setInterval(() => {
            if (!isLegOpen(conn)) {
                this.stop(connectionId)
                return
            }
            this.checkResponsive(conn)
            this.sendPing(conn)
            keepaliveCount++

            if (keepaliveCount % 3 === 0) {
                const pc = conn.peerConnection
                const dcState = conn.channel?.readyState || 'unknown'
                const iceState = pc?.iceConnectionState || 'unknown'
                const connState = (pc as any)?.connectionState || 'unknown'
                let bufferedAmount: number | undefined
                try {
                    const buffered = (conn.channel as any)?.bufferedAmount
                    if (buffered !== undefined) {
                        bufferedAmount = buffered
                    }
                } catch (err) {
                    this.logger.trace('bufferedAmount unavailable', {
                        message: toError(err).message
                    })
                }
                this.logger.debug('sctp relay diagnostics', {
                    connectionId,
                    dcState,
                    iceState,
                    connState,
                    sentPackets: conn.stats.sentPackets,
                    sentBytes: conn.stats.sentBytes,
                    receivedPackets: conn.stats.receivedPackets,
                    receivedBytes: conn.stats.receivedBytes,
                    pongs: this.traffic.pongs,
                    rtpRecv: this.traffic.rtpReceived,
                    warpRecv: this.traffic.warpReceived,
                    keepalives: keepaliveCount,
                    globalSend: this.traffic.sent,
                    bufferedAmount
                })
            }
        }, this.pingIntervalMs)

        this.timers.set(connectionId, timer)
        this.logger.debug('keepalive started', {
            connectionId,
            intervalMs: this.pingIntervalMs
        })
    }

    private sendPing(conn: Connection): void {
        conn.ping ??= toArrayBuffer(buildWhatsAppPing(conn.stunTransactionId))
        if (this.send(conn, conn.ping)) {
            conn.pingUnansweredSince ??= this.now()
        }
    }

    /** Takes a leg whose oldest unanswered ping is `UNRESPONSIVE_TIMEOUT_MS` old out of the election. */
    private checkResponsive(conn: Connection): void {
        const since = conn.pingUnansweredSince
        if (conn.unresponsive || since === null) return
        if (this.now() - since < UNRESPONSIVE_TIMEOUT_MS) return
        conn.unresponsive = true
        this.logger.warn('relay leg unresponsive, out of the media election', {
            connectionId: conn.id,
            elected: this.isElected(conn)
        })
    }

    onPong(conn: Connection): void {
        conn.pingUnansweredSince = null
        if (!conn.unresponsive) return
        conn.unresponsive = false
        this.logger.debug('relay leg answering again, back in the media election', {
            connectionId: conn.id
        })
    }

    /** Moves the keepalive of `legs` to the cadence of an accepted call; later legs start on it. */
    setMediaFlowing(legs: Iterable<Connection>): void {
        if (this.pingIntervalMs === PING_INTERVAL_MS) return
        this.pingIntervalMs = PING_INTERVAL_MS
        for (const conn of legs) {
            if (this.timers.has(conn.id)) this.start(conn)
        }
    }

    stop(connectionId: string): void {
        const timer = this.timers.get(connectionId)
        if (timer) {
            clearInterval(timer)
            this.timers.delete(connectionId)
        }
    }

    stopAll(): void {
        for (const [id] of this.timers) {
            this.stop(id)
        }
    }

    /** Back to the cadence of a call that sets up. */
    reset(): void {
        this.pingIntervalMs = PING_SETUP_INTERVAL_MS
    }
}
