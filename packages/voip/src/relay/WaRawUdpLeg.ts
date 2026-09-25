import dgram from 'node:dgram'
import { isIPv6 } from 'node:net'
import { performance } from 'node:perf_hooks'

import type { Logger } from 'zapo-js'
import { toBytesView, toError } from 'zapo-js/util'

import { isStunPacket } from './stun.js'

/**
 * How long a leg may send media before the peer's stream has to be arriving,
 * in milliseconds.
 *
 * The window is not a connection timeout: the leg is already up and the relay
 * is already answering when it opens. It bounds the damage of a relay that
 * takes the uplink and forwards nothing back, which is a real deployment and
 * not a hypothetical. A relay forwards the peer's stream to the address it
 * last saw the client send from, so the first media datagram out of this
 * socket can move the peer's stream onto it - and if this relay is one that
 * does not forward, the stream that was arriving elsewhere stops arriving at
 * all. Giving up quickly is what lets the previous path take the stream back.
 *
 * Five seconds is slack, not a race against a quiet peer: on a measured call
 * the first inbound RTCP came back 3 ms in, and it keeps coming whether or not
 * anyone is speaking. Once media has come back the window slides on instead of
 * closing for good, at {@link RAW_UDP_RETURN_PATH_STALL_MS}.
 */
export const RAW_UDP_RETURN_PATH_TIMEOUT_MS = 5_000

/**
 * How long a confirmed leg may go without inbound media before it is rolled
 * back, in milliseconds.
 *
 * Every non-STUN datagram slides this window and STUN never does, which is the
 * whole point: the relay answers every ping whether or not it forwards
 * anything, so pongs are exactly what a dead relay and a live one have in
 * common.
 *
 * The number is loose on purpose. What holds it up is the peer's RTCP, which a
 * 134-second capture showed arriving every 1.0 to 1.1 s with no gap and without
 * stopping when the source went silent - tighter than the 1500 ms
 * `voip_settings` carries, which is a ceiling rather than the cadence. That
 * capture never saw the encoder stop sending RTP, so the guarantee rests on
 * RTCP and not on media. Ten seconds is several times the ceiling because
 * catching a relay that stopped forwarding before the call is mute for good is
 * all this has to do; a tighter window only buys a faster reaction at the price
 * of hanging up on a peer that is merely slow.
 */
export const RAW_UDP_RETURN_PATH_STALL_MS = 10_000

/** Reason `onFailure` reports when the return-path window closes unanswered. */
export const RAW_UDP_NO_RETURN_PATH = 'raw_udp_no_return_path'

export interface WaRawUdpLegOptions {
    /** Relay address, as advertised in its own endpoint descriptor. */
    readonly ip: string
    /** Relay port, as advertised in its own endpoint descriptor. */
    readonly port: number
    readonly logger: Logger
    /** Fired once the socket is bound to the relay and can carry traffic. */
    readonly onOpen: () => void
    /** Fired per inbound datagram, with a view over the received bytes. */
    readonly onMessage: (data: Uint8Array) => void
    /** Fired once when the leg dies; the leg is already closed by then. */
    readonly onFailure: (reason: string) => void
    /** Overrides {@link RAW_UDP_RETURN_PATH_TIMEOUT_MS} for this leg. */
    readonly returnPathTimeoutMs?: number
    /** Overrides {@link RAW_UDP_RETURN_PATH_STALL_MS} for this leg. */
    readonly stallTimeoutMs?: number
}

/**
 * A media leg that talks to the relay over raw UDP: no ICE, no DTLS, no SCTP,
 * no data channel. STUN, RTP and RTCP ride the datagram socket as they are.
 *
 * The socket is connected to the relay rather than left unbound, so the kernel
 * fixes the 5-tuple the relay pairs against and drops anything arriving from
 * elsewhere. That matters because the relay forwards the peer's stream to the
 * address it last saw this client send from: the 5-tuple is the identity of
 * the leg, and it has to stay the same for the life of the call.
 *
 * Sending is therefore not a neutral act - it is what elects this leg - so the
 * leg polices its own return path (see {@link RAW_UDP_RETURN_PATH_TIMEOUT_MS})
 * and kills itself when media goes out and nothing comes back, at the start of
 * the call or at any point after it. STUN does not count as coming back: a
 * relay that forwards no media at all still answers every ping, so pongs prove
 * the socket works and prove nothing about the media path.
 *
 * The leg carries no protocol of its own. Building the allocate, pacing the
 * keepalive and interpreting what comes back all stay with the owner, which is
 * the same code that does it for the WebRTC legs. Media crosses it exactly as
 * the WebRTC legs produce it, with no hop-by-hop layer added, and none is
 * owed: a call carried entirely by raw legs authenticated and decoded every
 * inbound RTP packet with the end-to-end keys, as `RelayData.hbhKey` records.
 */
export class WaRawUdpLeg {
    private readonly options: WaRawUdpLegOptions
    private readonly logger: Logger
    private readonly returnPathTimeoutMs: number
    private readonly stallTimeoutMs: number
    private socket: dgram.Socket | null = null
    private opened = false
    private closed = false
    private returnPathTimer: NodeJS.Timeout | null = null
    private returnPathSeen = false
    /**
     * Monotonic, not wall clock: this is only ever read as an elapsed time, and
     * a clock the system can step would either roll a healthy leg back or hold
     * a stalled one open by however far it moved.
     */
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

    /**
     * Binds the socket to the relay. `onOpen` fires on the next turn of the
     * loop at the earliest, never synchronously, so the caller can finish
     * registering the leg before anything is sent through it.
     */
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

            /**
             * `connect` reports failure to this callback and emits no `error`
             * event of its own, so an ignored argument would open the leg on a
             * socket that never connected.
             */
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
     * Writes one datagram to the relay. Returns whether it was handed to the
     * socket.
     *
     * The first media datagram arms the return-path window; STUN does not,
     * because an allocate and a ping ask the relay for nothing it has to
     * forward. From then on the window is the inbound side's business: media
     * slides it, silence closes it, and sending never arms it again.
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

    /**
     * Arms the window once and lets the deadline do the sliding: a confirmed
     * leg whose deadline arrives early re-arms for the time it has left. Media
     * therefore costs one timestamp per datagram instead of a timer swap.
     */
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
                idleMs
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
