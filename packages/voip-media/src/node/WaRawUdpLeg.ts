import dgram from 'node:dgram'
import { isIPv6 } from 'node:net'
import { performance } from 'node:perf_hooks'

import { toBytesView } from '../bytes.js'
import { toError } from '../errors.js'
import type { Logger } from '../logger.js'
import { isStunPacket } from '../relay/stun.js'
import type { RawUdpLeg, RawUdpLegOptions } from '../relay/WaSctpRelay.js'

/**
 * How long a leg may send media before the peer's stream has to arrive, in ms. Sending can pull
 * the peer's stream onto a relay that forwards nothing, so giving up fast lets the old path back.
 */
export const RAW_UDP_RETURN_PATH_TIMEOUT_MS = 5_000

/**
 * How long a confirmed leg may go without inbound media before it is rolled back, in ms. Only
 * non-STUN datagrams slide it: a relay that forwards nothing still answers every ping.
 */
export const RAW_UDP_RETURN_PATH_STALL_MS = 10_000

/** Reason `onFailure` reports when the return-path window closes unanswered. */
export const RAW_UDP_NO_RETURN_PATH = 'raw_udp_no_return_path'

export interface WaRawUdpLegOptions extends RawUdpLegOptions {
    /** Overrides {@link RAW_UDP_RETURN_PATH_TIMEOUT_MS} for this leg. */
    readonly returnPathTimeoutMs?: number
    /** Overrides {@link RAW_UDP_RETURN_PATH_STALL_MS} for this leg. */
    readonly stallTimeoutMs?: number
}

/**
 * A media leg to the relay over a connected UDP socket, with no ICE, DTLS or SCTP: the socket's
 * 5-tuple is the leg's identity to the relay. Sending is what elects it, so it polices its own
 * return path and fails when media goes out and none comes back. The owner builds every message.
 */
export class WaRawUdpLeg implements RawUdpLeg {
    private readonly options: WaRawUdpLegOptions
    private readonly logger: Logger
    private readonly returnPathTimeoutMs: number
    private readonly stallTimeoutMs: number
    private socket: dgram.Socket | null = null
    private opened = false
    private closed = false
    private returnPathTimer: NodeJS.Timeout | null = null
    private returnPathSeen = false
    /** Monotonic, since it is only read as an elapsed time. */
    private lastInboundAt = 0

    constructor(options: WaRawUdpLegOptions) {
        this.options = options
        this.logger = options.logger
        this.returnPathTimeoutMs = options.returnPathTimeoutMs ?? RAW_UDP_RETURN_PATH_TIMEOUT_MS
        this.stallTimeoutMs = options.stallTimeoutMs ?? RAW_UDP_RETURN_PATH_STALL_MS
    }

    /** Whether the socket is bound and has not been closed since. */
    get isOpen(): boolean {
        return this.opened && !this.closed
    }

    /** Whether media has arrived from the relay at least once, which confirms the leg. */
    get hasReturnPath(): boolean {
        return this.returnPathSeen
    }

    /** Binds the socket to the relay; `onOpen` never fires synchronously. */
    open(): void {
        if (this.socket || this.closed) return

        try {
            const socket = dgram.createSocket(isIPv6(this.options.ip) ? 'udp6' : 'udp4')
            this.socket = socket

            socket.on('message', (msg: Buffer) => {
                if (this.closed) return
                const data = toBytesView(msg)
                if (!isStunPacket(data)) {
                    this.lastInboundAt = performance.now()
                    if (!this.returnPathSeen) {
                        this.returnPathSeen = true
                        this.logger.debug('raw udp leg return path confirmed', {
                            bytes: data.length
                        })
                        if (!this.returnPathTimer) this.armReturnPathTimer(this.stallTimeoutMs)
                    }
                }
                this.options.onMessage(data)
            })

            socket.on('error', (err: Error) => {
                if (this.closed) return
                this.logger.warn('raw udp leg socket error', { message: err.message })
                this.fail('raw_udp_socket_error')
            })

            // `connect` reports failure only to this callback, never as an `error` event.
            socket.connect(this.options.port, this.options.ip, (err?: Error) => {
                if (this.closed) return
                if (err) {
                    this.logger.warn('raw udp leg connect failed', { message: err.message })
                    this.fail('raw_udp_connect_failed')
                    return
                }
                this.opened = true
                this.options.onOpen()
            })
        } catch (err) {
            this.logger.warn('raw udp leg open failed', { message: toError(err).message })
            this.fail('raw_udp_open_failed')
        }
    }

    /**
     * Writes one datagram to the relay; returns whether the socket took it. The first media
     * datagram, never STUN, arms the return-path window.
     */
    send(data: Uint8Array): boolean {
        const socket = this.socket
        if (!socket || !this.isOpen) return false

        try {
            socket.send(data)
        } catch (err) {
            this.logger.trace('raw udp leg send failed', { message: toError(err).message })
            return false
        }

        if (!this.returnPathSeen && !this.returnPathTimer && !isStunPacket(data)) {
            this.armReturnPathTimer(this.returnPathTimeoutMs)
        }

        return true
    }

    /** Closes the socket. Idempotent, and never throws. */
    close(): void {
        if (this.closed) return
        this.closed = true
        this.opened = false
        this.clearReturnPathTimer()

        const socket = this.socket
        this.socket = null
        if (!socket) return

        try {
            socket.close()
        } catch (err) {
            this.logger.trace('raw udp leg close failed', { message: toError(err).message })
        }
    }

    /** Arms the window; a confirmed leg whose deadline comes early re-arms for the time left. */
    private armReturnPathTimer(timeoutMs: number): void {
        this.clearReturnPathTimer()
        this.returnPathTimer = setTimeout(() => {
            this.returnPathTimer = null
            if (this.closed) return

            const idleMs = performance.now() - this.lastInboundAt
            if (this.returnPathSeen && idleMs < this.stallTimeoutMs) {
                this.armReturnPathTimer(this.stallTimeoutMs - idleMs)
                return
            }

            this.logger.warn('raw udp leg rolled back, no media on the return path', {
                ip: this.options.ip,
                port: this.options.port,
                confirmed: this.returnPathSeen,
                idleMs: this.returnPathSeen ? Math.round(idleMs) : undefined
            })
            this.fail(RAW_UDP_NO_RETURN_PATH)
        }, timeoutMs)
    }

    private clearReturnPathTimer(): void {
        if (!this.returnPathTimer) return
        clearTimeout(this.returnPathTimer)
        this.returnPathTimer = null
    }

    private fail(reason: string): void {
        if (this.closed) return
        this.close()
        this.options.onFailure(reason)
    }
}
