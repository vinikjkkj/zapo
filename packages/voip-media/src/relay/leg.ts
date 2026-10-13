import { toError } from '../errors.js'
import type { Logger } from '../logger.js'

import type { RelayInfo } from './relay-info.js'
import { createStunTransactionId } from './stun.js'

export function closeQuietly(
    closeable: { close(): void } | null | undefined,
    logger: Logger
): void {
    try {
        closeable?.close()
    } catch (err) {
        logger.trace('close failed', { message: toError(err).message })
    }
}

export type PeerConnectionClass = RTCPeerConnection

export type DataChannelClass = RTCDataChannel

export enum ConnectionState {
    None = 'None',
    Connecting = 'Connecting',
    Open = 'Open',
    Closed = 'Closed',
    Failed = 'Failed'
}

/** What a raw UDP leg is built with; only the host can build one, so the relay never does. */
export interface RawUdpLegOptions {
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
}

/** A media leg to the relay over raw UDP, with no ICE, DTLS or SCTP under it. */
export interface RawUdpLeg {
    readonly isOpen: boolean
    open(): void
    /** Whether the datagram was handed to the socket. */
    send(data: Uint8Array): boolean
    close(): void
}

export interface Connection {
    state: ConnectionState
    peerConnection: PeerConnectionClass | null
    channel: DataChannelClass | null
    /** Set instead of `peerConnection`/`channel` when this leg rides raw UDP. */
    rawLeg: RawUdpLeg | null
    incomingChannels: DataChannelClass[]
    /** Identifies the connection's slot in `connections` and its keepalive timer; never reassigned after registration. */
    readonly id: string
    /**
     * The credentials every registration of this leg reads when it goes out. Replaced in place
     * when a newer generation re-issues the same address with new credentials.
     */
    relayInfo: RelayInfo
    connectionTimeout: ReturnType<typeof setTimeout> | null
    /** The pending graces of ICE `disconnected` events, cleared when the leg ends. */
    readonly iceDisconnectTimers: Set<ReturnType<typeof setTimeout>>
    /**
     * Set while the leg's peer connection negotiates; ending the leg calls it, since a closed
     * `RTCPeerConnection` never settles its pending operations.
     */
    abortDial: (() => void) | null
    hasReceivedFirstPacket: boolean
    /** When the leg's first allocate went out, or `null` before one has. */
    allocateSentAt: number | null
    /** When the peer's media last authenticated on this leg, or `null` if it never has. */
    peerMediaAt: number | null
    /** When the oldest ping no pong has answered went out, or `null` with none pending. */
    pingUnansweredSince: number | null
    /** Out of the media election until a pong arrives; the leg itself stays up. */
    unresponsive: boolean
    localUfrag: string
    /** Born with the connection, and used by every STUN message it emits. */
    readonly stunTransactionId: Uint8Array
    /** The keepalive ping, constant per connection since its transaction id is. */
    ping?: ArrayBuffer
    /** The last allocate built, reused while its inputs are unchanged. */
    allocateCache?: AllocateCache | null
    /** The relay generation this leg belongs to; see `configureRelays`. */
    generation: number
    readonly stats: {
        sentPackets: number
        receivedPackets: number
        sentBytes: number
        receivedBytes: number
    }
}

/** An allocate's bytes and what they were built from: the leg's credentials and the SSRC state. */
export interface AllocateCache {
    readonly relayInfo: RelayInfo
    readonly epoch: number
    readonly bytes: ArrayBuffer
}

/** A leg `Connecting` to `relayInfo` that holds nothing yet. */
export function createLeg(relayInfo: RelayInfo, generation: number, id: string): Connection {
    return {
        state: ConnectionState.Connecting,
        peerConnection: null,
        channel: null,
        rawLeg: null,
        incomingChannels: [],
        id,
        relayInfo,
        connectionTimeout: null,
        iceDisconnectTimers: new Set(),
        abortDial: null,
        hasReceivedFirstPacket: false,
        allocateSentAt: null,
        peerMediaAt: null,
        pingUnansweredSince: null,
        unresponsive: false,
        localUfrag: '',
        stunTransactionId: createStunTransactionId(),
        generation,
        stats: { sentPackets: 0, receivedPackets: 0, sentBytes: 0, receivedBytes: 0 }
    }
}

/** Whether a leg is `Open` and its socket or data channel can carry a datagram. */
export function isLegOpen(conn: Connection): boolean {
    if (conn.state !== ConnectionState.Open) return false
    if (conn.rawLeg) return conn.rawLeg.isOpen
    return conn.channel?.readyState === 'open'
}

/**
 * Ends a leg's dial and timers and closes what it holds; `closeChannel` is false when its
 * data channel is what closed.
 */
export function releaseLeg(conn: Connection, closeChannel: boolean, logger: Logger): void {
    conn.abortDial?.()
    if (conn.connectionTimeout) clearTimeout(conn.connectionTimeout)
    for (const timer of conn.iceDisconnectTimers) clearTimeout(timer)
    conn.iceDisconnectTimers.clear()
    if (closeChannel) closeQuietly(conn.channel, logger)
    const incoming = conn.incomingChannels
    conn.incomingChannels = []
    for (const ch of incoming) closeQuietly(ch, logger)
    closeQuietly(conn.peerConnection, logger)
    closeQuietly(conn.rawLeg, logger)
}
