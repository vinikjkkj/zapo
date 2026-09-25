import { EventEmitter } from 'node:events'

import wrtc from '@roamhq/wrtc'
import { createNoopLogger, type Logger } from 'zapo-js'
import { bytesToHex, toBytesView, toError } from 'zapo-js/util'

import { readUInt32BE, TEXT_ENCODER, toArrayBuffer } from '../bytes.js'

import {
    buildAllocateForRelay,
    buildBindingRequestWithSubs,
    buildSenderSubscriptions,
    buildSSRCSubscriptionList,
    buildWhatsAppPing,
    classifyPacket,
    createStunTransactionId,
    formatStunResponse,
    parseStunResponse
} from './stun.js'
import { WaRawUdpLeg } from './WaRawUdpLeg.js'

function closeQuietly(closeable: { close(): void } | null | undefined, logger: Logger): void {
    try {
        closeable?.close()
    } catch (err) {
        logger.trace('close failed', { message: toError(err).message })
    }
}

type PeerConnectionClass = RTCPeerConnection

type DataChannelClass = RTCDataChannel

/**
 * The port a web client's relay media rides on.
 *
 * Candidates are dialled here rather than on the port the relay advertises,
 * which is often 3478: a relay reached on 3478 completes the handshake and
 * accepts the uplink but never forwards the peer's stream back, so the call is
 * silently one way.
 */
export const TRUE_WEB_CLIENT_RELAY_PORT = 3480

const CONFIG = {
    TRUE_WEB_CLIENT_RELAY_PORT,
    CONNECTION_TIMEOUT: 20000,
    KEEPALIVE_INTERVAL_MS: 1100,
    ICE_DISCONNECT_GRACE_MS: 4000,
    FIXED_FINGERPRINT:
        'sha-256 F9:CA:0C:98:A3:CC:71:D6:42:CE:5A:E2:53:D2:15:20:D3:1B:BA:D8:57:A4:F0:AF:BE:0B:FB:F3:6B:0C:A0:68'
}

/**
 * When a leg replays its registration after the first attempt, in
 * milliseconds from the moment the transport opened.
 *
 * The ladder is not a retry on failure: nothing here waits for an answer. It
 * exists because the registration races the relay finishing its own setup, and
 * because on the raw path there is no transport underneath to retransmit a lost
 * datagram.
 */
const REGISTRATION_RETRY_DELAYS_MS = [50, 150, 500, 3_000]

enum ConnectionState {
    None = 'None',
    Connecting = 'Connecting',
    Open = 'Open',
    Closed = 'Closed',
    Failed = 'Failed'
}

export interface RelayInfo {
    id: string
    ip: string
    port: number
    token: string
    authToken?: string
    rawAuthToken?: Uint8Array
    rawToken?: Uint8Array
    key: string
    relayId: number
    name?: string
    authTokenId?: string
}

export interface Connection {
    state: ConnectionState
    peerConnection: PeerConnectionClass | null
    channel: DataChannelClass | null
    /** Set instead of `peerConnection`/`channel` when this leg rides raw UDP. */
    rawLeg: WaRawUdpLeg | null
    incomingChannels: DataChannelClass[]
    buffer: ArrayBuffer[]
    bufferedBytes: number
    /** Identifies the connection's slot in `connections` and its keepalive timer; never reassigned after registration. */
    readonly id: string
    /** Carries the STUN/allocate credentials `resendSubscriptions` replays; never reassigned after construction. */
    readonly relayInfo: RelayInfo
    connectionTimeout: NodeJS.Timeout | null
    hasReceivedFirstPacket: boolean
    localUfrag: string
    stableRoutingConnId: bigint
    /** Born with the connection, and used by every STUN message it emits. */
    readonly stunTransactionId: Uint8Array
    readonly stats: {
        sentPackets: number
        receivedPackets: number
        sentBytes: number
        receivedBytes: number
    }
}

export interface WaSctpRelayOptions {
    readonly logger?: Logger
    /** See `WaVoipCoordinatorOptions.useRawUdpTransport`. */
    readonly useRawUdpTransport?: boolean
}

export class WaSctpRelay extends EventEmitter {
    private readonly logger: Logger
    private readonly useRawUdpTransport: boolean
    private connections = new Map<string, Connection>()
    private relayMap = new Map<string, RelayInfo>()
    private stats = {
        sent: 0,
        received: 0,
        connected: 0
    }
    private keepaliveTimers = new Map<string, NodeJS.Timeout>()
    private audioSsrc = 0
    private subscriptionSsrc = 0
    private selfStreamSsrcs: number[] = []
    private peerStreamSsrcs: number[] = []
    private selfPid = 0
    private peerPid = 0

    constructor(options: WaSctpRelayOptions = {}) {
        super()
        this.logger = options.logger ?? createNoopLogger()
        this.useRawUdpTransport = options.useRawUdpTransport ?? false
    }

    setSsrc(ssrc: number): void {
        this.audioSsrc = ssrc
        this.logger.debug('sctp ssrc set', { ssrc: `0x${ssrc.toString(16).padStart(8, '0')}` })
    }

    setSubscriptionSsrc(ssrc: number): void {
        this.subscriptionSsrc = ssrc
        this.logger.debug('sctp subscription ssrc set', {
            ssrc: `0x${ssrc.toString(16).padStart(8, '0')}`
        })
    }

    setStreamSsrcs(selfSsrcs: number[], peerSsrcs: number[]): void {
        this.selfStreamSsrcs = selfSsrcs.filter(Boolean)
        this.peerStreamSsrcs = peerSsrcs.filter(Boolean)
        this.logger.debug('sctp relay stream ssrcs set', {
            selfCount: this.selfStreamSsrcs.length,
            peerCount: this.peerStreamSsrcs.length
        })
    }

    setParticipantIds(selfPid?: number, peerPid?: number): void {
        const nextSelfPid = selfPid ?? 0
        const nextPeerPid = peerPid ?? 0
        const changed = nextSelfPid !== this.selfPid || nextPeerPid !== this.peerPid
        this.selfPid = nextSelfPid
        this.peerPid = nextPeerPid
        this.logger.debug('sctp participant ids set', {
            selfPid: this.selfPid,
            peerPid: this.peerPid
        })
        if (changed && this.selfPid && this.peerPid && this.hasConnection()) {
            this.resendSubscriptions()
        }
    }

    resendSubscriptions(): void {
        for (const conn of this.connections.values()) {
            if (conn.state !== ConnectionState.Open) continue

            if (conn.rawLeg) {
                /**
                 * One allocate, not the opening ladder: the raw leg is
                 * already registered, and this pass only refreshes the SSRC
                 * list it carries.
                 */
                if (conn.rawLeg.isOpen && this.sendRawAllocate(conn, conn.relayInfo, 'resend')) {
                    this.logger.debug('raw udp allocate resent', { connectionId: conn.id })
                }
                continue
            }

            if (conn.channel && conn.channel.readyState === 'open') {
                this.sendStunAllocateOnOpen(conn, conn.relayInfo)
                this.logger.debug('sctp subscriptions resent', { connectionId: conn.id })
            }
        }
    }

    private addRelayCandidate(sdp: string, ip: string, port: number): string {
        const candidate = `a=candidate:2 1 udp 2122262783 ${ip} ${port} typ host generation 0 network-cost 5`
        const endOfCandidates = 'a=end-of-candidates'

        let modified = sdp.replace(/a=candidate:[^\r\n]+\r?\n/g, '')
        modified = modified.replace(/a=end-of-candidates\r?\n?/g, '')
        modified += candidate + '\r\n' + endOfCandidates + '\r\n'

        return modified
    }

    /**
     * Stamps the relay's own credentials onto the SDP answer as the ICE
     * `ice-ufrag`/`ice-pwd`: `ice-ufrag` carries `relayInfo.authToken ||
     * relayInfo.token`, `ice-pwd` carries `relayInfo.key`.
     *
     * The relay requires the token in `a=ice-ufrag`. This is not a design
     * choice inferred from the RFC; it was measured on a real call with a
     * single variable isolated. Three arms, minutes apart, same call:
     * ufrag=random/pwd=random connected 0 of 6 legs; ufrag=random/pwd=`<key>`
     * also connected 0 of 6; ufrag=token/pwd=`<key>` connected 4 of 6 with
     * audio flowing both ways. The only difference between the second and
     * third arm is the ufrag value, and it alone is what took the result from
     * 0/6 to 4/6. Without the token in `ice-ufrag`, every leg dies in
     * `ice_connection_failed` and the peer hangs up on a timeout.
     *
     * A reverse-engineering reading of the official client concluded the
     * opposite: that the token belongs only inside the ALLOCATE's
     * `ATTR_RELAY_CREDENTIAL` (0x4000) attribute (see `buildAllocateForRelay`
     * in `stun.ts`) and that putting it in `ice-ufrag` too was an invented
     * coupling. That reading is what the measurement above falsifies; the
     * ALLOCATE placement is real and additional, not a substitute for this
     * one.
     *
     * There is a known, unresolved defect that follows directly from reusing
     * the token here: at least one observed relay's token is ~194 raw bytes,
     * which is 260 characters once encoded, past the 256-character
     * `ice-ufrag` ceiling RFC 5245 sets. That leg never connects. Truncating
     * the token to fit has been tried twice and does not fix it: the leg
     * still fails, only later, with a corrupted credential instead of a
     * malformed SDP. Do not attempt that fix again without new evidence; the
     * two prior attempts are why this paragraph exists.
     */
    private modifySdpForRelay(sdp: string, relayInfo: RelayInfo): string {
        let modified = sdp

        modified = modified.replace(/a=setup:actpass/g, 'a=setup:passive')

        const iceUfrag = relayInfo.authToken || relayInfo.token || ''
        const icePwd = relayInfo.key
        modified = modified.replace(/a=ice-ufrag:[^\r\n]+/g, `a=ice-ufrag:${iceUfrag}`)
        modified = modified.replace(/a=ice-pwd:[^\r\n]+/g, `a=ice-pwd:${icePwd}`)

        modified = modified.replace(
            /a=fingerprint:[^\r\n]+/g,
            `a=fingerprint:${CONFIG.FIXED_FINGERPRINT}`
        )
        modified = modified.replace(/a=max-message-size:[^\r\n]+/g, 'a=max-message-size:1500')
        modified = modified.replace(/a=ice-options:[^\r\n]+\r?\n/g, '')
        modified = this.addRelayCandidate(modified, relayInfo.ip, relayInfo.port)

        return modified
    }

    private makeConnectionId(ip: string, port: number, authTokenId?: string): string {
        const base = ip.includes(':') ? `[${ip}]:${port}` : `${ip}:${port}`
        return authTokenId ? `${base}#${authTokenId}` : base
    }

    /**
     * Puts a leg in `connections` as `Connecting`, before anything is dialled.
     *
     * Registering is split from dialling because the map is the only record of
     * what the call still has to try: `announceLastLegLost` reads it and
     * nothing else. Dialling a batch leg by leg would let the first one fail
     * while the rest of the batch is still invisible, and the call would be
     * declared dead with relays nobody had touched yet.
     */
    private registerConnection(relayInfo: RelayInfo): Connection {
        const connectionId = this.makeConnectionId(
            relayInfo.ip,
            relayInfo.port,
            relayInfo.authTokenId
        )

        this.logger.debug('sctp connecting to relay', {
            connectionId,
            relayName: relayInfo.name
        })

        const conn: Connection = {
            state: ConnectionState.Connecting,
            peerConnection: null,
            channel: null,
            rawLeg: null,
            incomingChannels: [],
            buffer: [],
            bufferedBytes: 0,
            id: connectionId,
            relayInfo,
            connectionTimeout: null,
            hasReceivedFirstPacket: false,
            localUfrag: '',
            stableRoutingConnId: 0n,
            stunTransactionId: createStunTransactionId(),
            stats: { sentPackets: 0, receivedPackets: 0, sentBytes: 0, receivedBytes: 0 }
        }

        this.connections.set(connectionId, conn)
        return conn
    }

    /** Dials a leg that is already registered, over the configured transport. */
    private async startConnection(conn: Connection): Promise<Connection | null> {
        const connectionId = conn.id
        const relayInfo = conn.relayInfo

        /**
         * The transport is chosen here, once, when the leg is dialled, and it is
         * chosen by configuration rather than by inspecting the relay.
         *
         * A heuristic was written and then withdrawn: the relays a credential
         * test would have routed here - the ones whose token does not fit in
         * an `ice-ufrag`, which is why WebRTC never reaches them - are exactly
         * the ones measured to accept an allocate, answer every ping, take
         * 1761 uplink packets and forward not one packet of the peer's stream
         * back. The raw transport is proven against the relays that already
         * work over WebRTC, which is where it changes nothing, so nothing
         * selects it on its own.
         */
        if (this.useRawUdpTransport) {
            this.openRawUdpLeg(conn, relayInfo)
            return conn
        }

        conn.connectionTimeout = setTimeout(() => {
            if (conn.state === ConnectionState.Connecting) {
                this.logger.warn('sctp connection timeout', { connectionId })
                this.failConnection(conn, 'connection_timeout')
            }
        }, CONFIG.CONNECTION_TIMEOUT)

        try {
            const pc = new wrtc.RTCPeerConnection({ iceServers: [] })
            conn.peerConnection = pc

            pc.oniceconnectionstatechange = () => {
                this.logger.debug('ice connection state changed', {
                    connectionId,
                    state: pc.iceConnectionState
                })
                if (pc.iceConnectionState === 'failed') {
                    this.failConnection(conn, 'ice_connection_failed')
                }
                if (pc.iceConnectionState === 'disconnected') {
                    setTimeout(() => {
                        if (
                            conn.state !== ConnectionState.Failed &&
                            conn.state !== ConnectionState.Closed &&
                            pc.iceConnectionState === 'disconnected'
                        ) {
                            this.failConnection(conn, 'ice_disconnected_timeout')
                        }
                    }, CONFIG.ICE_DISCONNECT_GRACE_MS)
                }
                if (
                    pc.iceConnectionState === 'connected' ||
                    pc.iceConnectionState === 'completed'
                ) {
                    this.logger.debug('ice connected', { connectionId })
                    try {
                        const stats = (pc as any).getStats?.()
                        if (stats) {
                            stats.forEach((report: any) => {
                                if (
                                    report.type === 'candidate-pair' &&
                                    report.state === 'succeeded'
                                ) {
                                    this.logger.trace('ice candidate pair succeeded', {
                                        connectionId,
                                        localCandidateId: report.localCandidateId,
                                        remoteCandidateId: report.remoteCandidateId
                                    })
                                }
                            })
                        }
                    } catch (err) {
                        this.logger.trace('getStats failed', { message: toError(err).message })
                    }
                }
            }

            pc.onconnectionstatechange = () => {
                const connState = (pc as any).connectionState
                this.logger.debug('peer connection state changed', {
                    connectionId,
                    state: connState
                })
                if (connState === 'connected') {
                    this.logger.debug('sctp dtls fully connected', { connectionId })
                }
                if (connState === 'failed') {
                    this.logger.warn('sctp peer connection failed', { connectionId })
                    this.failConnection(conn, 'connection_state_failed')
                }
            }

            pc.onicegatheringstatechange = () => {
                this.logger.debug('ice gathering state changed', {
                    connectionId,
                    state: pc.iceGatheringState
                })
            }

            pc.onsignalingstatechange = () => {
                this.logger.debug('signaling state changed', {
                    connectionId,
                    state: pc.signalingState
                })
            }
            ;(pc as any).ondatachannel = (event: any) => {
                const incomingChannel = event.channel as DataChannelClass
                this.logger.debug('incoming data channel from relay', {
                    connectionId,
                    label: incomingChannel.label,
                    channelId: incomingChannel.id
                })

                conn.incomingChannels.push(incomingChannel)
                incomingChannel.binaryType = 'arraybuffer'

                incomingChannel.onmessage = (ev: MessageEvent) => {
                    const buffer = toBytesView(ev.data as ArrayBuffer | ArrayBufferView)
                    this.logger.trace('data from incoming channel', {
                        connectionId,
                        size: buffer.length,
                        packetKind: classifyPacket(buffer)
                    })
                    this.handleRelayMessage(buffer, relayInfo, conn)
                }

                incomingChannel.onopen = () => {
                    this.logger.debug('incoming data channel opened', {
                        connectionId,
                        label: incomingChannel.label
                    })
                }

                incomingChannel.onclose = () => {
                    this.logger.debug('incoming data channel closed', {
                        connectionId,
                        label: incomingChannel.label
                    })
                }
            }

            const channel = pc.createDataChannel('wa-web-call', {
                ordered: false
            })

            conn.channel = channel
            channel.binaryType = 'arraybuffer'

            channel.onopen = () => {
                this.logger.debug('sctp data channel open', { connectionId })
                conn.state = ConnectionState.Open
                this.stats.connected++

                if (conn.connectionTimeout) {
                    clearTimeout(conn.connectionTimeout)
                    conn.connectionTimeout = null
                }

                this.sendStunAllocateOnOpen(conn, relayInfo)

                this.startKeepalive(connectionId, conn)

                this.drainBuffer(connectionId)
                this.emit('relay_connected', { ip: relayInfo.ip, port: relayInfo.port })
            }

            channel.onclose = () => {
                this.logger.debug('sctp data channel closed', { connectionId })
                this.closeConnection(connectionId)
            }

            channel.onmessage = (event: MessageEvent) => {
                const buffer = toBytesView(event.data as ArrayBuffer | ArrayBufferView)
                if (conn.stats.receivedPackets === 0) {
                    this.logger.trace('first message on data channel', {
                        connectionId,
                        size: buffer.length,
                        dataType: typeof event.data
                    })
                }
                this.handleRelayMessage(buffer, relayInfo, conn)
            }

            channel.onerror = () => {
                this.logger.warn('sctp data channel error', { connectionId })
                this.failConnection(conn, 'data_channel_error')
            }

            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)

            const localUfragMatch = offer.sdp!.match(/a=ice-ufrag:([^\r\n]+)/)
            conn.localUfrag = localUfragMatch?.[1] || ''

            const modifiedSdp = this.modifySdpForRelay(offer.sdp!, relayInfo)

            this.logger.debug('sdp relay candidate configured', {
                connectionId,
                candidate: `${relayInfo.ip}:${relayInfo.port}`,
                authTokenSize: relayInfo.rawAuthToken?.length ?? 0
            })

            await pc.setRemoteDescription({
                type: 'answer',
                sdp: modifiedSdp
            })

            this.logger.debug('sctp relay configured, waiting for ice', { connectionId })

            return conn
        } catch (err) {
            this.logger.error('sctp relay connect failed', {
                connectionId,
                message: toError(err).message
            })
            this.failConnection(conn, 'connection_error')
            return null
        }
    }

    private failConnection(conn: Connection, reason: string): void {
        if (!conn || conn.state === ConnectionState.Failed) return

        this.logger.warn('sctp connection failed', { connectionId: conn.id, reason })
        this.releaseConnected(conn)
        conn.state = ConnectionState.Failed

        this.stopKeepalive(conn.id)
        if (conn.connectionTimeout) clearTimeout(conn.connectionTimeout)
        closeQuietly(conn.channel, this.logger)
        for (const ch of conn.incomingChannels) closeQuietly(ch, this.logger)
        closeQuietly(conn.peerConnection, this.logger)
        closeQuietly(conn.rawLeg, this.logger)

        this.connections.delete(conn.id)
        this.announceLastLegLost(reason)
    }

    /**
     * Gives back the connected count a leg took when it opened. Both the
     * WebRTC and the raw path count one on open, so every way out of `Open`
     * has to pass through here or `getConnectedCount` drifts upwards.
     */
    private releaseConnected(conn: Connection): void {
        if (conn.state !== ConnectionState.Open) return
        this.stats.connected = Math.max(0, this.stats.connected - 1)
    }

    /**
     * Whether any leg could still be carrying media shortly: one that is open,
     * or one that is still dialling.
     *
     * A leg that is dialling counts because legs open at wildly different
     * speeds - ICE on one relay finishes while another is still gathering - and
     * nothing waits for them to agree. It can only count for so long: every
     * leg is armed with `CONNECTION_TIMEOUT` when it is dialled, so a leg stuck
     * in `Connecting` fails on its own and gets back here.
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
     * Tells the owner the call has no media path left and none on the way.
     *
     * Legs die on their own and a call runs several, so losing one of four is
     * not losing the call, and the last one to go is not necessarily the last
     * one open: a leg that opens first and then fails while its siblings are
     * still dialling loses nothing, and a batch where every leg dies before it
     * ever opens loses everything without any of them having been open. Both
     * are the same question - is there a leg left that is open or dialling -
     * and the answer is read off `connections`, which is why a leg is put there
     * before it is dialled.
     *
     * `cleanup` empties that map before it closes anything, so tearing a call
     * down cannot come through here.
     */
    private announceLastLegLost(reason: string): void {
        if (this.hasLiveLeg()) return
        this.logger.warn('relay has no leg left, open or dialling', { reason })
        this.emit('relay_lost', { reason })
    }

    private isConnOpen(conn: Connection): boolean {
        if (conn.state !== ConnectionState.Open) return false
        if (conn.rawLeg) return conn.rawLeg.isOpen
        return conn.channel?.readyState === 'open'
    }

    /**
     * Opens a raw UDP leg to the relay and wires it into the same connection
     * bookkeeping every other leg uses, so `broadcast`, the keepalive and the
     * receive path treat it as one more connection.
     *
     * A failure here takes down this leg and nothing else: the connection
     * leaves the map and the call carries on over whatever other legs
     * connected, exactly as a failed WebRTC leg does.
     */
    private openRawUdpLeg(conn: Connection, relayInfo: RelayInfo): void {
        const connectionId = conn.id

        conn.rawLeg = new WaRawUdpLeg({
            ip: relayInfo.ip,
            port: relayInfo.port,
            logger: this.logger.child({ connectionId }),
            onOpen: () => {
                if (conn.state !== ConnectionState.Connecting) return
                conn.state = ConnectionState.Open
                this.stats.connected++

                if (conn.connectionTimeout) {
                    clearTimeout(conn.connectionTimeout)
                    conn.connectionTimeout = null
                }

                this.logger.debug('raw udp relay leg open', {
                    connectionId,
                    ip: relayInfo.ip,
                    port: relayInfo.port
                })

                this.sendRawAllocate(conn, relayInfo, 'initial')
                for (const delayMs of REGISTRATION_RETRY_DELAYS_MS) {
                    /**
                     * Unreferenced: a replay of a registration the relay has
                     * most likely already taken is never a reason to hold the
                     * process open on its own.
                     */
                    setTimeout(
                        () => this.sendRawAllocate(conn, relayInfo, 'retry'),
                        delayMs
                    ).unref()
                }

                this.startKeepalive(connectionId, conn)
                this.drainBuffer(connectionId)

                /**
                 * Announcing the leg is what starts the uplink, and the
                 * uplink is what makes the relay forward anything back: it
                 * sends the peer's stream to the address it last saw this
                 * client send from. A leg that allocates and then waits for
                 * media before sending any waits forever.
                 */
                this.emit('relay_connected', { ip: relayInfo.ip, port: relayInfo.port })
            },
            onMessage: (data: Uint8Array) => {
                this.handleRelayMessage(data, relayInfo, conn)
            },
            onFailure: (reason: string) => {
                this.failConnection(conn, reason)
            }
        })

        conn.connectionTimeout = setTimeout(() => {
            if (conn.state === ConnectionState.Connecting) {
                this.logger.warn('raw udp relay leg timeout', { connectionId })
                this.failConnection(conn, 'raw_udp_open_timeout')
            }
        }, CONFIG.CONNECTION_TIMEOUT)

        conn.rawLeg.open()
    }

    /**
     * Emits the ALLOCATE of a raw UDP leg, the only STUN message that path
     * sends besides the keepalive ping. Returns whether one went out.
     *
     * The ICE connectivity checks the WebRTC path sends alongside it have no
     * counterpart here, and not for lack of porting them: this leg has no ICE
     * credentials to check with, since the credential it would use is exactly
     * the one too long to be announced as an `ice-ufrag`. The relay pairs the
     * two ends of the call off the identifier inside the token that goes in
     * the allocate, so there is nothing else to announce and no subscription
     * to negotiate.
     *
     * The allocate registers the 5-tuple; what confirms it is traffic. The
     * relay forwards to the address it last saw the client send from, so
     * allocating and then only listening receives nothing.
     */
    private sendRawAllocate(conn: Connection, relayInfo: RelayInfo, label: string): boolean {
        if (!this.isConnOpen(conn)) return false

        if (!relayInfo.rawToken || relayInfo.rawToken.length === 0) {
            this.logger.debug('raw udp allocate skipped, no relay token', {
                connectionId: conn.id,
                label
            })
            return false
        }

        const allocate = buildAllocateForRelay(
            relayInfo.rawToken,
            this.buildAllocateSsrcList(),
            TEXT_ENCODER.encode(relayInfo.key),
            relayInfo.ip,
            relayInfo.port,
            conn.stunTransactionId
        )

        const sent = this.sendToChannel(conn, toArrayBuffer(allocate))
        this.logger.trace('raw udp allocate sent', {
            connectionId: conn.id,
            label,
            size: allocate.length,
            sent
        })
        return sent
    }

    /**
     * Builds the SSRC list an allocate carries, falling back to the single
     * inbound and outbound SSRCs when the per-stream lists have not been
     * handed over yet.
     */
    private buildAllocateSsrcList(): Uint8Array {
        const selfSsrcs = this.selfStreamSsrcs.length ? this.selfStreamSsrcs : [this.audioSsrc]
        const peerSsrcs = this.peerStreamSsrcs.length
            ? this.peerStreamSsrcs
            : this.subscriptionSsrc
              ? [this.subscriptionSsrc]
              : []

        return buildSSRCSubscriptionList(selfSsrcs, peerSsrcs, this.selfPid, this.peerPid)
    }

    private sendStunAllocateOnOpen(conn: Connection, relayInfo: RelayInfo): void {
        const connectionId = `${relayInfo.ip}:${relayInfo.port}`

        const remoteUfrag = relayInfo.authToken || relayInfo.token
        if (!remoteUfrag) {
            this.logger.debug('stun registration skipped, no ufrag', { connectionId })
            return
        }

        const localUfrag = conn.localUfrag
        const hmacKey = TEXT_ENCODER.encode(relayInfo.key)
        const transactionId = conn.stunTransactionId

        const sendRegistration = (label: string) => {
            if (!this.isConnOpen(conn)) {
                return
            }

            const selfSsrc = this.audioSsrc
            const peerSsrc = this.subscriptionSsrc
            const ssrc = peerSsrc || selfSsrc
            if (!ssrc) {
                this.logger.debug('stun registration skipped, no ssrc', { connectionId, label })
                return
            }

            /**
             * v1-v3 carry only the primary inbound stream: multi-stream
             * subscriptions belong to the v4 allocation below. Repeating v1-v3
             * per slot makes some relays accept the uplink and forward nothing.
             */
            const subs = buildSenderSubscriptions(ssrc)
            if (localUfrag) {
                const username = TEXT_ENCODER.encode(`${remoteUfrag}:${localUfrag}`)
                const v1 = buildBindingRequestWithSubs(
                    username,
                    hmacKey,
                    subs,
                    true,
                    true,
                    transactionId
                )
                this.sendToChannel(conn, toArrayBuffer(v1))
                this.logger.trace('stun v1 auth token ufrag sent', {
                    connectionId,
                    label,
                    size: v1.length,
                    ssrc: `0x${ssrc.toString(16)}`
                })
            }

            if (relayInfo.token && relayInfo.token !== remoteUfrag && localUfrag) {
                const username = TEXT_ENCODER.encode(`${relayInfo.token}:${localUfrag}`)
                const v2 = buildBindingRequestWithSubs(
                    username,
                    hmacKey,
                    subs,
                    true,
                    true,
                    transactionId
                )
                this.sendToChannel(conn, toArrayBuffer(v2))
                this.logger.trace('stun v2 token ufrag sent', {
                    connectionId,
                    label,
                    size: v2.length
                })
            }

            const v3 = buildBindingRequestWithSubs(
                undefined,
                undefined,
                subs,
                false,
                false,
                transactionId
            )
            this.sendToChannel(conn, toArrayBuffer(v3))
            this.logger.trace('stun v3 no-mi sent', { connectionId, label, size: v3.length })

            /**
             * The allocate is the media handshake, and it authenticates with
             * the raw `<relay>` token, not with the ICE ufrag pair the binding
             * requests above use. Without the raw token there is no credential
             * to send, so the allocate is skipped rather than faked.
             */
            if (relayInfo.rawToken && relayInfo.rawToken.length > 0) {
                const v4 = buildAllocateForRelay(
                    relayInfo.rawToken,
                    this.buildAllocateSsrcList(),
                    hmacKey,
                    relayInfo.ip,
                    relayInfo.port,
                    transactionId
                )
                this.sendToChannel(conn, toArrayBuffer(v4))
                this.logger.trace('stun v4 allocate sent', { connectionId, label, size: v4.length })
            }
        }

        sendRegistration('initial')
        for (const delayMs of REGISTRATION_RETRY_DELAYS_MS) {
            setTimeout(() => sendRegistration(`retry-${delayMs}ms`), delayMs)
        }
    }

    private startKeepalive(connectionId: string, conn: Connection): void {
        this.stopKeepalive(connectionId)

        const firstPing = buildWhatsAppPing(conn.stunTransactionId)
        this.sendToChannel(conn, toArrayBuffer(firstPing))
        this.logger.debug('keepalive first ping sent', { connectionId })

        let keepaliveCount = 0
        const timer = setInterval(() => {
            if (!this.isConnOpen(conn)) {
                this.stopKeepalive(connectionId)
                return
            }
            const ping = buildWhatsAppPing(conn.stunTransactionId)
            this.sendToChannel(conn, toArrayBuffer(ping))
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
                    pongs: this.pongCount,
                    rtpRecv: this.rtpRecvCount,
                    keepalives: keepaliveCount,
                    globalSend: this.sendCount,
                    bufferedAmount
                })
            }
        }, CONFIG.KEEPALIVE_INTERVAL_MS)

        this.keepaliveTimers.set(connectionId, timer)
        this.logger.debug('keepalive started', {
            connectionId,
            intervalMs: CONFIG.KEEPALIVE_INTERVAL_MS
        })
    }

    private stopKeepalive(connectionId: string): void {
        const timer = this.keepaliveTimers.get(connectionId)
        if (timer) {
            clearInterval(timer)
            this.keepaliveTimers.delete(connectionId)
        }
    }

    private closeConnection(connectionId: string): void {
        const conn = this.connections.get(connectionId)
        if (!conn) return

        this.releaseConnected(conn)
        conn.state = ConnectionState.Closed

        this.stopKeepalive(connectionId)
        if (conn.connectionTimeout) clearTimeout(conn.connectionTimeout)
        for (const ch of conn.incomingChannels) closeQuietly(ch, this.logger)
        closeQuietly(conn.peerConnection, this.logger)
        closeQuietly(conn.rawLeg, this.logger)

        this.connections.delete(connectionId)
        this.announceLastLegLost('closed')
    }

    private drainBuffer(connectionId: string): void {
        const conn = this.connections.get(connectionId)
        if (!conn || conn.state !== ConnectionState.Open || !conn.channel) return

        while (conn.buffer.length > 0 && conn.channel.readyState === 'open') {
            const data = conn.buffer.shift()
            if (data) {
                conn.bufferedBytes -= data.byteLength
                this.sendToChannel(conn, data)
            }
        }
    }

    private sendCount = 0

    private sendToChannel(conn: Connection, data: ArrayBuffer): boolean {
        try {
            if (conn.rawLeg) {
                /**
                 * `toArrayBuffer` always hands over a buffer that is exactly
                 * the bytes it was given, so wrapping it back is a view and
                 * copies nothing on this per-packet path.
                 */
                if (!this.isConnOpen(conn)) return false
                if (!conn.rawLeg.send(new Uint8Array(data))) return false

                conn.stats.sentPackets++
                conn.stats.sentBytes += data.byteLength
                this.stats.sent++
                this.sendCount++
                return true
            }

            if (!conn.channel || conn.channel.readyState !== 'open') {
                return false
            }

            let arrayBufferToSend: ArrayBuffer
            if (data.constructor.name === 'SharedArrayBuffer') {
                const uint8 = new Uint8Array(data)
                const copied = new Uint8Array(uint8)
                arrayBufferToSend = copied.buffer
            } else {
                arrayBufferToSend = data
            }

            conn.channel.send(arrayBufferToSend)

            conn.stats.sentPackets++
            conn.stats.sentBytes += data.byteLength
            this.stats.sent++
            this.sendCount++

            if (this.sendCount <= 10 || this.sendCount % 100 === 0) {
                const buf = new Uint8Array(data)
                const firstByte = buf[0] || 0
                const twoBits = (firstByte & 0xc0) >> 6
                const pktType = twoBits === 0 ? 'STUN' : twoBits === 2 ? 'RTP/SRTP' : 'OTHER'
                this.logger.trace('sctp relay send', {
                    count: this.sendCount,
                    packetType: pktType,
                    size: data.byteLength,
                    connectionId: conn.id,
                    hexPrefix: bytesToHex(buf.subarray(0, 20))
                })
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

    private pongCount = 0
    private rtpRecvCount = 0
    private unknownRecvCount = 0

    private handleRelayMessage(data: Uint8Array, relayInfo: RelayInfo, conn: Connection): void {
        conn.stats.receivedPackets++
        conn.stats.receivedBytes += data.length
        this.stats.received++

        const firstByte = data[0]
        const twoBits = (firstByte & 0xc0) >> 6

        const hexPreview = bytesToHex(data.subarray(0, Math.min(24, data.length)))
        const pktType =
            twoBits === 0 ? 'STUN' : twoBits === 2 ? 'RTP/SRTP' : twoBits === 1 ? 'DTLS' : 'UNKNOWN'

        if (!conn.hasReceivedFirstPacket) {
            conn.hasReceivedFirstPacket = true
            this.logger.trace('first packet received from relay', { connectionId: conn.id })
        }

        const shouldLog =
            conn.stats.receivedPackets <= 50 ||
            conn.stats.receivedPackets % 25 === 0 ||
            twoBits === 2 ||
            (twoBits === 0 && data.length >= 20 && !this.isPong(data))

        if (shouldLog) {
            this.logger.trace('sctp relay receive', {
                count: conn.stats.receivedPackets,
                packetType: pktType,
                size: data.length,
                connectionId: conn.id,
                hexPreview
            })
        }

        if (twoBits === 0) {
            const stunInfo = parseStunResponse(data)
            if (stunInfo) {
                if (stunInfo.method === 'wa-pong') {
                    this.pongCount++
                    if (this.pongCount <= 3 || this.pongCount % 20 === 0) {
                        this.logger.trace('stun pong received', {
                            count: this.pongCount,
                            connectionId: conn.id,
                            size: data.length
                        })
                    }
                } else {
                    this.logger.trace('stun response received', {
                        connectionId: conn.id,
                        summary: formatStunResponse(stunInfo),
                        hex: bytesToHex(data)
                    })
                    if (
                        stunInfo.isSuccess &&
                        (stunInfo.method === 'binding' || stunInfo.method === 'allocate')
                    ) {
                        this.logger.debug('stun binding or allocate success', {
                            connectionId: conn.id,
                            method: stunInfo.method
                        })
                    }
                    if (stunInfo.stableRoutingConnId && conn.stableRoutingConnId === 0n) {
                        conn.stableRoutingConnId = stunInfo.stableRoutingConnId
                        this.logger.debug('stun stable routing latched', {
                            connectionId: conn.id,
                            connId: `0x${stunInfo.stableRoutingConnId.toString(16)}`
                        })
                    }
                    if (stunInfo.isError) {
                        this.logger.warn('stun error response', {
                            connectionId: conn.id,
                            errorCode: stunInfo.errorCode,
                            errorReason: stunInfo.errorReason || ''
                        })
                    }
                    for (const attr of stunInfo.attributes) {
                        this.logger.trace('stun attribute', {
                            connectionId: conn.id,
                            typeName: attr.typeName,
                            type: `0x${attr.type.toString(16)}`,
                            length: attr.length,
                            data: bytesToHex(attr.data.subarray(0, Math.min(32, attr.data.length)))
                        })
                    }
                }
            } else {
                this.logger.trace('unparseable stun-like packet', {
                    connectionId: conn.id,
                    size: data.length,
                    hex: bytesToHex(data.subarray(0, 80))
                })
            }
        }

        if (twoBits === 2) {
            this.rtpRecvCount++
            const pt = data[1] & 0x7f
            const seq = data.length >= 4 ? (data[2] << 8) | data[3] : 0
            const ssrc = data.length >= 12 ? readUInt32BE(data, 8) : 0
            this.logger.trace('rtp packet received', {
                count: this.rtpRecvCount,
                payloadType: pt,
                sequence: seq,
                ssrc: `0x${ssrc.toString(16)}`,
                size: data.length,
                connectionId: conn.id
            })
            if (this.rtpRecvCount <= 3) {
                this.logger.trace('rtp packet hex preview', {
                    connectionId: conn.id,
                    hex: bytesToHex(data.subarray(0, 160))
                })
            }
        }

        if (twoBits !== 0 && twoBits !== 2) {
            this.unknownRecvCount++
            this.logger.trace('unknown relay packet type', {
                count: this.unknownRecvCount,
                firstByte: `0x${firstByte.toString(16)}`,
                size: data.length,
                connectionId: conn.id,
                hex: bytesToHex(data.subarray(0, 80))
            })
        }

        this.emit('relay_receive', {
            ip: relayInfo.ip,
            port: relayInfo.port,
            data
        })
    }

    private isPong(data: Uint8Array): boolean {
        if (data.length < 2) return false
        const msgType = (data[0] << 8) | data[1]
        return msgType === 0x0802
    }

    async configureRelays(
        relays: Array<{
            ip: string
            port: number
            /**
             * Port the relay advertised for itself, before the caller rewrote
             * it for the WebRTC transport. Raw UDP legs dial this one.
             */
            originalPort?: number
            token: string
            authToken?: string
            rawAuthToken?: Uint8Array
            rawToken?: Uint8Array
            key: string
            relayId: number
            name?: string
            authTokenId?: string
        }>
    ): Promise<void> {
        this.logger.debug('sctp configuring relays', { count: relays.length })

        for (const relay of relays) {
            const webClientPort = relay.port || CONFIG.TRUE_WEB_CLIENT_RELAY_PORT

            /**
             * The rewrite to the web client port belongs to the WebRTC
             * transport, not to the relay: it is what WhatsApp Web does for
             * its own legs. The native transport reads `addr:port` off the
             * endpoint the server advertised and sends both the allocate and
             * the media there, so a raw leg keeps the advertised port and
             * inherits none of that rewriting.
             */
            const port = this.useRawUdpTransport
                ? (relay.originalPort ?? webClientPort)
                : webClientPort

            const connectionId = this.makeConnectionId(relay.ip, port, relay.authTokenId)

            const relayInfo: RelayInfo = {
                id: connectionId,
                ip: relay.ip,
                port,
                token: relay.token,
                authToken: relay.authToken,
                rawAuthToken: relay.rawAuthToken,
                rawToken: relay.rawToken,
                key: relay.key,
                relayId: relay.relayId,
                name: relay.name || 'unknown',
                authTokenId: relay.authTokenId
            }

            this.relayMap.set(connectionId, relayInfo)
        }

        this.logger.debug('sctp relays registered', { count: this.relayMap.size })

        const legs: Connection[] = []
        for (const [, relayInfo] of this.relayMap) {
            const connId = this.makeConnectionId(
                relayInfo.ip,
                relayInfo.port,
                relayInfo.authTokenId
            )
            if (!this.connections.has(connId)) {
                legs.push(this.registerConnection(relayInfo))
            }
        }

        await Promise.all(legs.map((conn) => this.startConnection(conn)))

        this.logger.debug('sctp relay configuration done', { connected: this.stats.connected })
    }

    broadcast(data: ArrayBuffer): void {
        for (const conn of this.connections.values()) {
            if (this.isConnOpen(conn)) {
                this.sendToChannel(conn, data)
            }
        }
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

        for (const [id] of this.keepaliveTimers) {
            this.stopKeepalive(id)
        }

        /**
         * Emptied before anything is closed, not after: a data channel that
         * reports its close synchronously lands in `closeConnection`, which
         * would find the last leg of a call being torn down and announce it as
         * lost. With the map already empty that path finds nothing to report.
         */
        const closing = [...this.connections.values()]
        this.connections.clear()

        for (const conn of closing) {
            if (conn.connectionTimeout) clearTimeout(conn.connectionTimeout)
            closeQuietly(conn.channel, this.logger)
            for (const ch of conn.incomingChannels) closeQuietly(ch, this.logger)
            closeQuietly(conn.peerConnection, this.logger)
            closeQuietly(conn.rawLeg, this.logger)
        }

        this.relayMap.clear()
        this.stats.connected = 0
        this.audioSsrc = 0
        this.subscriptionSsrc = 0
        this.selfStreamSsrcs = []
        this.peerStreamSsrcs = []
        this.selfPid = 0
        this.peerPid = 0
        this.pongCount = 0
        this.rtpRecvCount = 0
        this.unknownRecvCount = 0
        this.sendCount = 0

        this.logger.debug('sctp all connections cleaned')
    }
}
