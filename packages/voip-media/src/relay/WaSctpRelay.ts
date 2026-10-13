import type { WaMediaCrypto } from '../crypto/primitives.js'
import { toError } from '../errors.js'
import { createNoopLogger, isLogLevelEnabled, type Logger } from '../logger.js'
import { unrefTimer } from '../timers.js'

import {
    type Connection,
    ConnectionState,
    createLeg,
    isLegOpen,
    type RawUdpLeg,
    type RawUdpLegOptions,
    releaseLeg
} from './leg.js'
import {
    canReregisterInPlace,
    credentialFingerprint,
    makeConnectionId,
    planRelayInfos,
    relayAddressOf,
    type RelayEndpoint,
    type RelayInfo
} from './relay-info.js'
import type { StreamLayerSsrcs } from './stun-subscriptions.js'
import { classifyPacket, isWaPong } from './stun.js'
import {
    createRelayTraffic,
    logStunResponse,
    resetRelayTraffic,
    traceReceive,
    traceSend
} from './trace.js'
import { DOWNLINK_MAX_REDIALS, WaRelayDownlinkWatchdog } from './WaRelayDownlinkWatchdog.js'
import { WaRelayElection } from './WaRelayElection.js'
import { WaRelayKeepalive } from './WaRelayKeepalive.js'
import { WaRelayLegDialer } from './WaRelayLegDialer.js'
import { REGISTRATION_RETRY_DELAYS_MS, WaRelayRegistration } from './WaRelayRegistration.js'
import { isWarpFramedPacket } from './warp-frame.js'

/** How long an open leg may go unanswered before it is redialled on the other port: the burst's last replay gets a second to be answered. */
const PORT_FALLBACK_AFTER_OPEN_MS =
    REGISTRATION_RETRY_DELAYS_MS[REGISTRATION_RETRY_DELAYS_MS.length - 1] + 1_000

/**
 * How long a leg may take to open before it is redialled on the other port. ICE, DTLS and SCTP
 * take a few round trips, about a second at relay latencies; ICE itself gives up only at 20 s.
 */
const PORT_FALLBACK_UNOPENED_MS = 5_000

export interface WaSctpRelayOptions {
    readonly logger?: Logger
    /** The host's primitives, for the MESSAGE-INTEGRITY of every STUN message a leg sends. */
    readonly crypto: WaMediaCrypto
    /** Builds the peer connection of each WebRTC leg, so the host picks the implementation. */
    readonly createPeerConnection: (configuration: RTCConfiguration) => Promise<RTCPeerConnection>
    /** Builds a raw UDP leg; which legs ride one is {@link rawUdpLegs}. */
    readonly createRawUdpLeg?: (options: RawUdpLegOptions) => RawUdpLeg
    /**
     * With `createRawUdpLeg`, `'all'` (the default) dials every leg over raw UDP and `'required'`
     * only the relays configured with `transport: 'raw-udp'`, leaving the rest on WebRTC.
     */
    readonly rawUdpLegs?: 'all' | 'required'
    /** A leg opened and is carrying traffic. */
    readonly onConnected?: () => void
    /** The call has no leg left, open or dialling; see `announceLastLegLost`. */
    readonly onLost?: (reason: string) => void
    /**
     * A relay answered for the first time, once per relay name. `rttMs` runs from the first
     * allocate of the leg it answered on, when one went out.
     */
    readonly onRelayAnswered?: (name: string, rttMs?: number) => void
    /**
     * A packet arrived from a relay, STUN and media alike, before any parsing. `connectionId`
     * names the leg, for {@link WaSctpRelay.notePeerMedia}.
     */
    readonly onReceive?: (data: Uint8Array, connectionId: string) => void
    /** Monotonic time source, in ms; `performance.now()` by default. */
    readonly now?: () => number
}

export class WaSctpRelay {
    private readonly logger: Logger
    private readonly crypto: WaMediaCrypto
    private readonly createRawUdpLeg: WaSctpRelayOptions['createRawUdpLeg']
    private readonly rawUdpLegs: NonNullable<WaSctpRelayOptions['rawUdpLegs']>
    private readonly onConnected: WaSctpRelayOptions['onConnected']
    private readonly onLost: WaSctpRelayOptions['onLost']
    private readonly onRelayAnswered: WaSctpRelayOptions['onRelayAnswered']
    private readonly onReceive: WaSctpRelayOptions['onReceive']
    private readonly now: () => number
    private readonly traceEnabled: boolean
    private readonly registration: WaRelayRegistration
    private readonly keepalive: WaRelayKeepalive
    private readonly dialer: WaRelayLegDialer
    private readonly watchdog: WaRelayDownlinkWatchdog
    private readonly election: WaRelayElection
    private readonly connections = new Map<string, Connection>()
    private readonly answeredRelayNames = new Set<string>()
    /** The relays of the newest generation, by relay key; older ones leave it when it advances. */
    private relayMap = new Map<string, RelayInfo>()
    /** Whether the call was accepted; see {@link setMediaFlowing}. */
    private mediaFlowing = false
    private stats = { connected: 0 }
    private readonly traffic = createRelayTraffic()

    constructor(options: WaSctpRelayOptions) {
        this.logger = options.logger ?? createNoopLogger()
        this.crypto = options.crypto
        this.createRawUdpLeg = options.createRawUdpLeg
        this.rawUdpLegs = options.rawUdpLegs ?? 'all'
        this.onConnected = options.onConnected
        this.onLost = options.onLost
        this.onRelayAnswered = options.onRelayAnswered
        this.onReceive = options.onReceive
        this.now = options.now ?? (() => performance.now())
        this.traceEnabled = isLogLevelEnabled(this.logger, 'trace')
        this.election = new WaRelayElection({
            legs: this.connections,
            logger: this.logger,
            now: this.now,
            retire: (conn) => this.endLegQuietly(conn)
        })
        const send = (conn: Connection, data: ArrayBuffer) => this.sendToChannel(conn, data)
        this.registration = new WaRelayRegistration({
            crypto: this.crypto,
            logger: this.logger,
            now: this.now,
            send
        })
        this.keepalive = new WaRelayKeepalive({
            logger: this.logger,
            now: this.now,
            send,
            isElected: (conn) => this.election.isElected(conn),
            traffic: this.traffic
        })
        this.dialer = new WaRelayLegDialer({
            legs: this.connections,
            logger: this.logger,
            traceEnabled: this.traceEnabled,
            createPeerConnection: options.createPeerConnection,
            createRawUdpLeg: options.createRawUdpLeg,
            onOpen: (conn, rawUdp) => this.onLegOpen(conn, rawUdp),
            onMessage: (data, conn) => this.handleRelayMessage(data, conn),
            onFailure: (conn, reason) => this.failConnection(conn, reason),
            onClosed: (conn) => this.closeConnection(conn)
        })
        this.watchdog = new WaRelayDownlinkWatchdog({
            now: this.now,
            reallocate: (stalledMs) => this.reallocateStalledLegs(stalledMs),
            redial: (stalledMs, attempt) => this.redialStalledLegs(stalledMs, attempt)
        })
    }

    setSsrc(ssrc: number): void {
        this.registration.setSsrc(ssrc)
    }

    setSubscriptionSsrc(ssrc: number): void {
        this.registration.setSubscriptionSsrc(ssrc)
    }

    setStreamSsrcs(selfSsrcs: number[], peerSsrcs: number[]): void {
        this.registration.setStreamSsrcs(selfSsrcs, peerSsrcs)
    }

    setParticipantIds(selfPid?: number, peerPid?: number): void {
        if (this.registration.setParticipantIds(selfPid, peerPid) && this.hasConnection()) {
            this.resendSubscriptions()
        }
    }

    /**
     * Sets the streams this side sends, in which case every allocate carries the self-only
     * layered descriptor instead of the 1:1 SSRC list; `null` goes back to the 1:1 list. A change
     * is re-announced on the open legs.
     */
    setSelfLayers(layers: readonly StreamLayerSsrcs[] | null): void {
        if (this.registration.setSelfLayers(layers) && this.hasConnection()) {
            this.resendSubscriptions()
        }
    }

    /**
     * Sets the `0x4021` video subscription every allocate carries (see `buildRxSubscriptions`);
     * `null` or empty leaves it out. A change is re-announced on the open legs.
     */
    setRxSubscriptions(bytes: Uint8Array | null): void {
        if (this.registration.setRxSubscriptions(bytes) && this.hasConnection()) {
            this.resendSubscriptions()
        }
    }

    resendSubscriptions(): void {
        for (const conn of this.connections.values()) {
            if (conn.state !== ConnectionState.Open) continue

            if (conn.rawLeg) {
                if (conn.rawLeg.isOpen && this.registration.sendRawAllocate(conn, 'resend')) {
                    this.logger.debug('raw udp allocate resent', { connectionId: conn.id })
                }
                continue
            }

            if (conn.channel && conn.channel.readyState === 'open') {
                this.registration.sendStunAllocateOnOpen(conn)
                this.logger.debug('sctp subscriptions resent', { connectionId: conn.id })
            }
        }
    }

    /**
     * Puts a leg in `connections` as `Connecting` before anything is dialled, so
     * `announceLastLegLost` sees a whole batch before any leg of it can fail.
     */
    private registerConnection(relayInfo: RelayInfo, generation: number): Connection {
        const connectionId = makeConnectionId(relayInfo.ip, relayInfo.port, relayInfo.authTokenId)

        this.logger.debug('sctp connecting to relay', {
            connectionId,
            relayName: relayInfo.name,
            transport: relayInfo.transport ?? 'webrtc',
            generation
        })

        const conn = createLeg(relayInfo, generation, connectionId)

        this.connections.set(connectionId, conn)
        return conn
    }

    /** Dials a leg that is already registered, over the configured transport. */
    private startConnection(conn: Connection): Promise<void> {
        this.armPortFallback(
            conn,
            PORT_FALLBACK_UNOPENED_MS,
            'relay_port_unopened',
            () => conn.state === ConnectionState.Connecting
        )
        return this.dialer.dial(conn)
    }

    /**
     * Fails a leg: closes what it holds and takes it out of the call if still held. A stale leg
     * whose id a redial reused only releases its own resources.
     */
    private failConnection(conn: Connection, reason: string): void {
        if (!conn || conn.state === ConnectionState.Failed) return
        const current = this.connections.get(conn.id) === conn
        // Registered before the leg leaves, so the call is not announced lost in between.
        const redial = current ? this.registerOnFallbackPort(conn, reason) : null

        this.logger.warn('sctp connection failed', { connectionId: conn.id, reason })
        if (current) this.releaseConnected(conn)
        conn.state = ConnectionState.Failed
        releaseLeg(conn, true, this.logger)
        if (!current) return

        this.keepalive.stop(conn.id)
        this.connections.delete(conn.id)
        this.announceLastLegLost(reason)
        if (redial) void this.startConnection(redial)
    }

    /** Fails `conn`, which redials it on the other port, if `afterMs` from now it is still in the call and `waiting()`. */
    private armPortFallback(
        conn: Connection,
        afterMs: number,
        reason: string,
        waiting: () => boolean
    ): void {
        if (conn.relayInfo.fallbackPort === undefined) return
        unrefTimer(
            setTimeout(() => {
                if (this.connections.get(conn.id) === conn && waiting()) {
                    this.failConnection(conn, reason)
                }
            }, afterMs)
        )
    }

    /** Armed when a leg opens, since its registration burst starts there. */
    private armAnswerFallback(conn: Connection): void {
        this.armPortFallback(
            conn,
            PORT_FALLBACK_AFTER_OPEN_MS,
            'relay_port_unanswered',
            () => !conn.hasReceivedFirstPacket
        )
    }

    /** Registers, once, a redial on the other port of a leg the relay never answered. */
    private registerOnFallbackPort(conn: Connection, reason: string): Connection | null {
        const port = conn.relayInfo.fallbackPort
        if (port === undefined || conn.hasReceivedFirstPacket) return null

        const relayInfo: RelayInfo = { ...conn.relayInfo, port, fallbackPort: undefined }
        if (this.connections.has(makeConnectionId(relayInfo.ip, port, relayInfo.authTokenId))) {
            return null
        }
        this.logger.warn('relay leg unanswered, redialling on the other port', {
            connectionId: conn.id,
            port,
            reason
        })
        return this.registerConnection(relayInfo, conn.generation)
    }

    /**
     * A leg of an older generation at `relayKey`'s address under another auth token id, which
     * a newer generation re-issued; `null` when there is none or the batch still names it.
     */
    private olderLegAtSameAddress(relayKey: string, generation: number): Connection | null {
        const address = relayAddressOf(relayKey)
        for (const conn of this.connections.values()) {
            const key = conn.relayInfo.id
            if (conn.generation >= generation || key === relayKey || this.relayMap.has(key))
                continue
            if (relayAddressOf(key) === address) return conn
        }
        return null
    }

    /** The leg of the configured relay `relayKey`, on either port, if it has one. */
    private legFor(relayKey: string): Connection | null {
        for (const conn of this.connections.values()) {
            if (conn.relayInfo.id === relayKey) return conn
        }
        return null
    }

    /** Gives back the connected count a leg took on open; every way out of `Open` passes here. */
    private releaseConnected(conn: Connection): void {
        if (conn.state !== ConnectionState.Open) return
        this.stats.connected = Math.max(0, this.stats.connected - 1)
    }

    /**
     * Whether any leg is open or still dialling; a dialling leg fails on its own after
     * `CONNECTION_TIMEOUT`, so it counts only that long.
     */
    private hasLiveLeg(): boolean {
        for (const conn of this.connections.values()) {
            if (conn.state === ConnectionState.Open || conn.state === ConnectionState.Connecting) {
                return true
            }
        }
        return false
    }

    /**
     * Tells the owner the call has no leg left, open or dialling. `cleanup` empties
     * `connections` before closing anything, so a teardown never lands here.
     */
    private announceLastLegLost(reason: string): void {
        if (this.hasLiveLeg()) return
        this.logger.warn('relay has no leg left, open or dialling', { reason })
        this.onLost?.(reason)
    }

    /**
     * Marks a leg open and registers it, then starts its keepalive and announces it; the
     * announcement starts the uplink, which is what makes the relay forward anything back.
     */
    private onLegOpen(conn: Connection, rawUdp: boolean): void {
        conn.state = ConnectionState.Open
        this.stats.connected++

        if (conn.connectionTimeout) {
            clearTimeout(conn.connectionTimeout)
            conn.connectionTimeout = null
        }

        if (rawUdp) this.registration.registerRawLeg(conn, 'initial')
        else this.registration.sendStunAllocateOnOpen(conn)
        this.armAnswerFallback(conn)
        this.keepalive.start(conn)
        this.onConnected?.()
    }

    /** Moves every leg's keepalive to the cadence of an accepted call; later legs start on it. */
    setMediaFlowing(): void {
        this.mediaFlowing = true
        this.keepalive.setMediaFlowing(this.connections.values())
    }

    /** Closes a leg the call still holds; an old leg under a reused id is not this one. */
    private closeConnection(conn: Connection): void {
        const connectionId = conn.id
        if (this.connections.get(connectionId) !== conn) return

        this.releaseConnected(conn)
        conn.state = ConnectionState.Closed
        this.keepalive.stop(connectionId)
        releaseLeg(conn, false, this.logger)

        this.connections.delete(connectionId)
        this.announceLastLegLost('closed')
    }

    private sendToChannel(conn: Connection, data: ArrayBuffer): boolean {
        try {
            if (conn.rawLeg) {
                if (!isLegOpen(conn) || !conn.rawLeg.send(new Uint8Array(data))) return false
            } else {
                if (!conn.channel || conn.channel.readyState !== 'open') return false
                conn.channel.send(data)
            }

            conn.stats.sentPackets++
            conn.stats.sentBytes += data.byteLength
            this.traffic.sent++

            if (this.traceEnabled && (this.traffic.sent <= 10 || this.traffic.sent % 100 === 0)) {
                traceSend(this.logger, this.traffic, conn, data)
            }

            return true
        } catch (err) {
            this.logger.warn('sctp relay send failed', {
                connectionId: conn.id,
                message: toError(err).message
            })
            return false
        }
    }

    private handleRelayMessage(data: Uint8Array, conn: Connection): void {
        conn.stats.receivedPackets++
        conn.stats.receivedBytes += data.length

        const twoBits = (data[0] & 0xc0) >> 6
        // A WARP frame has STUN's clear high bits, so it is told apart before the STUN branch.
        const framed = isWarpFramedPacket(data)
        if (framed) this.traffic.warpReceived++
        else if (twoBits === 2) this.traffic.rtpReceived++

        if (!conn.hasReceivedFirstPacket) {
            conn.hasReceivedFirstPacket = true
            const rttMs =
                conn.allocateSentAt === null
                    ? undefined
                    : Math.round(this.now() - conn.allocateSentAt)
            this.logger.debug('relay leg answered', {
                connectionId: conn.id,
                port: conn.relayInfo.port,
                rttMs,
                firstPacket: classifyPacket(data)
            })
            const name = conn.relayInfo.name
            if (name && !this.answeredRelayNames.has(name)) {
                this.answeredRelayNames.add(name)
                this.onRelayAnswered?.(name, rttMs)
            }
        }

        if (this.traceEnabled) traceReceive(this.logger, this.traffic, data, conn, twoBits, framed)
        if (!framed && twoBits === 0) this.handleStun(data, conn)

        this.onReceive?.(data, conn.id)
    }

    private handleStun(data: Uint8Array, conn: Connection): void {
        if (isWaPong(data)) {
            this.keepalive.onPong(conn)
            this.traffic.pongs++
            if (this.traceEnabled && (this.traffic.pongs <= 3 || this.traffic.pongs % 20 === 0)) {
                this.logger.trace('stun pong received', {
                    count: this.traffic.pongs,
                    connectionId: conn.id,
                    size: data.length
                })
            }
            return
        }

        logStunResponse(this.logger, this.traceEnabled, data, conn)
    }

    /**
     * Registers relays and dials each one with no leg. A `generation` above the current one
     * (absent: the current one, 0 at first) moves the call onto this batch: it is dialled even
     * with legs open and media is elected among its legs while one is open. Older legs stay up
     * until a leg of the batch hears authenticated peer media, then each is closed for good once
     * it hears none; until then the peer is followed back to them if only they hear it. A batch
     * below the current generation is stale and ignored.
     */
    async configureRelays(
        relays: RelayEndpoint[],
        options: { readonly generation?: number } = {}
    ): Promise<void> {
        const generation = options.generation ?? this.election.generation
        if (generation < this.election.generation) {
            this.logger.debug('sctp stale relay generation ignored', {
                generation,
                current: this.election.generation,
                count: relays.length
            })
            return
        }
        if (generation > this.election.generation) {
            this.logger.debug('sctp relay generation advanced', {
                from: this.election.generation,
                to: generation,
                count: relays.length
            })
            this.election.advance(generation)
            this.relayMap.clear()
        }

        this.logger.debug('sctp configuring relays', { count: relays.length, generation })

        const { infos, undialable } = planRelayInfos(
            relays,
            this.rawUdpLegs,
            this.createRawUdpLeg !== undefined
        )
        for (const relayInfo of infos) this.relayMap.set(relayInfo.id, relayInfo)

        if (undialable.length > 0) {
            this.logger.warn('relays that need raw udp skipped, the host has no raw udp leg', {
                skipped: undialable.length,
                sample: undialable.slice(0, 3),
                generation
            })
        }

        this.logger.debug('sctp relays registered', { count: this.relayMap.size })

        const legs: Connection[] = []
        for (const [relayKey, relayInfo] of this.relayMap) {
            const leg = this.legFor(relayKey) ?? this.olderLegAtSameAddress(relayKey, generation)
            if (leg?.generation === generation) continue
            if (leg && canReregisterInPlace(leg.relayInfo, relayInfo)) {
                this.reregisterInPlace(leg, relayInfo, generation)
                continue
            }
            if (leg) {
                const sameTransport = leg.relayInfo.transport === relayInfo.transport
                const context = {
                    connectionId: leg.id,
                    generation: leg.generation,
                    newest: generation,
                    keyChanged: leg.relayInfo.key !== relayInfo.key,
                    authTokenIdChanged: leg.relayInfo.authTokenId !== relayInfo.authTokenId
                }
                if (sameTransport) {
                    this.logger.warn(
                        'relay ice credentials changed at the same address, redialling',
                        context
                    )
                } else {
                    this.logger.debug('sctp relay leg replaced by a newer generation', context)
                }
                this.endLegQuietly(leg)
            }
            legs.push(this.registerConnection(relayInfo, generation))
        }

        await Promise.all(legs.map((conn) => this.startConnection(conn)))

        this.logger.debug('sctp relay configuration done', { connected: this.stats.connected })
    }

    /**
     * Moves a leg onto a newer generation's credentials for the same address and registers it
     * again over the same socket or data channel, keeping its 5-tuple, counters and return path.
     */
    private reregisterInPlace(conn: Connection, relayInfo: RelayInfo, generation: number): void {
        const heldUfrag = conn.relayInfo.authToken || conn.relayInfo.token
        const nextUfrag = relayInfo.authToken || relayInfo.token
        if (conn.relayInfo.transport !== 'raw-udp' && heldUfrag !== nextUfrag) {
            this.logger.info('relay ice credential rotated, kept the connection', {
                connectionId: conn.id,
                generation,
                from: credentialFingerprint(this.crypto, heldUfrag),
                to: credentialFingerprint(this.crypto, nextUfrag)
            })
        }
        conn.relayInfo = {
            ...relayInfo,
            port: conn.relayInfo.port,
            fallbackPort: conn.relayInfo.fallbackPort
        }
        conn.generation = generation
        this.logger.debug('sctp relay leg re-registered in place with new credentials', {
            connectionId: conn.id,
            generation,
            open: isLegOpen(conn)
        })
        if (!isLegOpen(conn)) return
        if (conn.rawLeg) this.registration.registerRawLeg(conn, 'reissue')
        else this.registration.sendStunAllocateOnOpen(conn)
    }

    /**
     * Takes a leg out of the call without announcing a loss or redialling it: its keepalive,
     * registration replays and dial stop, and its socket or peer connection closes.
     */
    private endLegQuietly(conn: Connection): void {
        this.connections.delete(conn.id)
        this.releaseConnected(conn)
        conn.state = ConnectionState.Closed
        this.keepalive.stop(conn.id)
        releaseLeg(conn, true, this.logger)
    }

    /**
     * Sends on the one leg elected for media and reports whether it took it; with no leg open
     * nothing goes out. Allocates and keepalives keep reaching every leg, so any can take over.
     */
    sendMedia(data: ArrayBuffer): boolean {
        const leg = this.election.elect()
        if (leg === null || !this.sendToChannel(leg, data)) return false
        this.election.noteSent(leg)
        if (this.mediaFlowing) this.watchdog.onSend()
        return true
    }

    private stalledWebRtcLegs(newestOnly: boolean): Connection[] {
        const legs: Connection[] = []
        for (const conn of this.connections.values()) {
            if (conn.rawLeg || conn.relayInfo.transport === 'raw-udp') continue
            if (newestOnly && conn.generation !== this.election.generation) continue
            legs.push(conn)
        }
        return legs
    }

    private reallocateStalledLegs(stalledMs: number): void {
        const legs = this.stalledWebRtcLegs(false).filter((conn) => isLegOpen(conn))
        if (legs.length === 0) return
        this.logger.warn('relay downlink stalled, re-allocating', { stalledMs, legs: legs.length })
        for (const conn of legs) this.registration.sendStunAllocateOnOpen(conn)
    }

    /** Redials the newest generation's WebRTC legs on new peer connections; whether any was. */
    private redialStalledLegs(stalledMs: number, attempt: number): boolean {
        const legs = this.stalledWebRtcLegs(true)
        if (legs.length === 0) return false
        this.logger.warn('relay downlink stalled, redialling', {
            stalledMs,
            legs: legs.length,
            attempt,
            maxAttempts: DOWNLINK_MAX_REDIALS
        })
        const redialled = legs.map((leg) => {
            const { relayInfo, generation } = leg
            this.endLegQuietly(leg)
            return this.registerConnection(relayInfo, generation)
        })
        for (const conn of redialled) void this.startConnection(conn)
        return true
    }

    /**
     * Records that the peer's media authenticated on a leg, and follows the peer there: when
     * our media leg has not heard the peer for `RX_ELECTION_HOLD_MS`, this leg takes it over.
     * A leg of the newest generation takes over a leg of an older one at once; an older leg
     * takes over a newest one only once the newest carried our media that long unheard.
     */
    notePeerMedia(connectionId: string): void {
        const conn = this.connections.get(connectionId)
        if (!conn) return
        const now = this.now()
        conn.peerMediaAt = now
        this.watchdog.notePeerMedia()
        this.election.notePeerMedia(conn, now)
    }

    /**
     * Sends to every open connection and reports whether any of them took it. Not for media:
     * the peer's SRTP replay window is per SSRC, so every copy past the first is dropped.
     */
    broadcast(data: ArrayBuffer): boolean {
        let sent = false
        for (const conn of this.connections.values()) {
            if (isLegOpen(conn) && this.sendToChannel(conn, data)) {
                sent = true
            }
        }
        return sent
    }

    hasConnection(): boolean {
        for (const conn of this.connections.values()) {
            if (conn.state === ConnectionState.Open) return true
        }
        return false
    }

    getConnectedCount(): number {
        return this.stats.connected
    }

    cleanup(): void {
        this.logger.debug('sctp cleaning up connections', { count: this.connections.size })

        this.keepalive.stopAll()

        // Emptied first, so a channel closing synchronously is not announced as a lost leg.
        const closing = [...this.connections.values()]
        this.connections.clear()

        for (const conn of closing) {
            conn.state = ConnectionState.Closed
            releaseLeg(conn, true, this.logger)
        }

        this.relayMap.clear()
        this.answeredRelayNames.clear()
        this.mediaFlowing = false
        this.watchdog.reset()
        this.stats.connected = 0
        this.election.reset()
        this.keepalive.reset()
        resetRelayTraffic(this.traffic)
        this.registration.reset()

        this.logger.debug('sctp all connections cleaned')
    }
}
