import dgram from 'node:dgram'
import { isIPv6 } from 'node:net'

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
 */
export const RAW_UDP_RETURN_PATH_TIMEOUT_MS = 5_000

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
 * and kills itself when media goes out and nothing comes back. STUN does not
 * count as coming back: a relay that forwards no media at all still answers
 * every ping, so pongs prove the socket works and prove nothing about the
 * media path.
 *
 * The leg carries no protocol of its own. Building the allocate, pacing the
 * keepalive and interpreting what comes back all stay with the owner, which is
 * the same code that does it for the WebRTC legs. Media crosses it exactly as
 * the WebRTC legs produce it, with no hop-by-hop layer added; whether one is
 * owed here is still open, and `RelayData.hbhKey` states what would settle it.
 */
export class WaRawUdpLeg {
    private readonly options: WaRawUdpLegOptions
    private readonly logger: Logger
    private readonly returnPathTimeoutMs: number
    private socket: dgram.Socket | null = null
    private opened = false
    private closed = false
    private returnPathTimer: NodeJS.Timeout | null = null
    private returnPathSeen = false

    constructor(options: WaRawUdpLegOptions) {
        this.options = options
        this.logger = options.logger
        this.returnPathTimeoutMs = options.returnPathTimeoutMs ?? RAW_UDP_RETURN_PATH_TIMEOUT_MS
    }

    /** Whether the socket is bound and has not been closed since. */
    get isOpen(): boolean {
        return this.opened && !this.closed
    }

    /** Whether media has arrived from the relay, which is what confirms the leg. */
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
                if (!this.returnPathSeen && !isStunPacket(data)) {
                    this.returnPathSeen = true
                    this.clearReturnPathTimer()
                    this.logger.debug('raw udp leg return path confirmed', { bytes: data.length })
                }
                this.options.onMessage(data)
            })

            socket.on('error', (err: Error) => {
                if (this.closed) return
                this.logger.warn('raw udp leg socket error', { message: err.message })
                this.fail('raw_udp_socket_error')
            })

            socket.connect(this.options.port, this.options.ip, () => {
                if (this.closed) return
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
     * forward.
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
            this.armReturnPathTimer()
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

    private armReturnPathTimer(): void {
        this.returnPathTimer = setTimeout(() => {
            this.returnPathTimer = null
            if (this.closed || this.returnPathSeen) return
            this.logger.warn('raw udp leg rolled back, no media came back', {
                ip: this.options.ip,
                port: this.options.port,
                timeoutMs: this.returnPathTimeoutMs
            })
            this.fail(RAW_UDP_NO_RETURN_PATH)
        }, this.returnPathTimeoutMs)
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
