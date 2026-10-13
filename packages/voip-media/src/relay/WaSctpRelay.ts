import { bytesToHex, readUInt32BE, TEXT_ENCODER, toArrayBuffer, toBytesView } from '../bytes.js'
import type { WaMediaCrypto } from '../crypto/primitives.js'
import { toError } from '../errors.js'
import { createNoopLogger, isLogLevelEnabled, type Logger } from '../logger.js'
import { unrefTimer } from '../timers.js'

import {
    buildAllocateForRelay,
    buildBindingRequestWithSubs,
    buildSenderSubscriptions,
    buildSSRCSubscriptionList,
    buildStreamDescriptor,
    buildWhatsAppPing,
    classifyPacket,
    createStunTransactionId,
    formatStunResponse,
    isWaPong,
    parseStunResponse,
    type StreamLayerSsrcs
} from './stun.js'
import { isWarpFramedPacket, readWarpFrame } from './warp-frame.js'

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
 * The port a web client's relay media rides on, unless the advertised one is dialled. A mobile
 * primary's legs open here, a companion's on the advertised one; see `RelayInfo.fallbackPort`.
 */
export const TRUE_WEB_CLIENT_RELAY_PORT = 3480

const CONFIG = {
    TRUE_WEB_CLIENT_RELAY_PORT,
    CONNECTION_TIMEOUT: 20000,
    /** `relay_ping_interval` while the call sets up, then once it is accepted. */
    PING_SETUP_INTERVAL_MS: 5000,
    PING_INTERVAL_MS: 1000,
    /** `relay_unresponsive_timeout`: a leg with a ping unanswered this long leaves the election. */
    UNRESPONSIVE_TIMEOUT_MS: 4000,
    /**
     * How long our media leg may go without the peer's media before media arriving on another
     * leg takes it over. Above the gaps of a peer's stream even in DTX, so a peer that sends
     * through every leg never moves it; short, so following a peer that moved costs half a second.
     */
    RX_ELECTION_HOLD_MS: 400,
    /** How long an accepted, sending call may hear no peer media before WebRTC legs re-allocate. */
    DOWNLINK_REALLOCATE_AFTER_MS: 5_000,
    /** How much longer before they are redialled; doubled after each redial of the same call. */
    DOWNLINK_REDIAL_AFTER_MS: 5_000,
    /** Redials of stalled WebRTC legs per call. */
    DOWNLINK_MAX_REDIALS: 3,
    /**
     * How long a leg of an older generation must go without authenticated peer media before the
     * proved newest generation retires it: each sender may be delivered from its own relay.
     */
    OLDER_LEG_QUIET_MS: 5_000,
    ICE_DISCONNECT_GRACE_MS: 4000,
    FIXED_FINGERPRINT:
        'sha-256 F9:CA:0C:98:A3:CC:71:D6:42:CE:5A:E2:53:D2:15:20:D3:1B:BA:D8:57:A4:F0:AF:BE:0B:FB:F3:6B:0C:A0:68'
}

/**
 * When a leg replays its registration, in ms from the moment it opened. Not a retry on
 * failure: nothing waits for an answer, the replays cover the relay's own setup and lost datagrams.
 */
const REGISTRATION_RETRY_DELAYS_MS = [50, 150, 500, 3_000]

/** How long an open leg may go unanswered before it is redialled on the other port: the burst's last replay gets a second to be answered. */
const PORT_FALLBACK_AFTER_OPEN_MS =
    REGISTRATION_RETRY_DELAYS_MS[REGISTRATION_RETRY_DELAYS_MS.length - 1] + 1_000

/**
 * How long a leg may take to open before it is redialled on the other port. ICE, DTLS and SCTP
 * take a few round trips, about a second at relay latencies; ICE itself gives up only at 20 s.
 */
const PORT_FALLBACK_UNOPENED_MS = 5_000

/** Media on the newest generation's legs, or on older ones while those dial or for want of any. */
type ElectionScope = 'newest' | 'awaiting' | 'older'

/**
 * Whether a leg to the same address can take `next`'s credentials without a new socket. A raw
 * leg always can; a WebRTC leg keeps its connection through a rotated auth token, but not
 * through a new relay key or auth token id.
 */
function canReregisterInPlace(held: RelayInfo, next: RelayInfo): boolean {
    if (held.transport !== next.transport) return false
    if (held.transport === 'raw-udp') return true
    return held.key === next.key && held.authTokenId === next.authTokenId
}

function sameOptionalBytes(a: Uint8Array | null, b: Uint8Array | null): boolean {
    if (a === b) return true
    if (!a || !b || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

/** The address part of a relay key, without its auth token id. */
function relayAddressOf(relayKey: string): string {
    const hash = relayKey.indexOf('#')
    return hash < 0 ? relayKey : relayKey.slice(0, hash)
}

/** Keys the one-way credential fingerprints logs carry instead of the credentials. */
const CREDENTIAL_FINGERPRINT_KEY = TEXT_ENCODER.encode('relay-credential-fingerprint')

function sameStreamLayers(
    a: readonly StreamLayerSsrcs[] | null,
    b: readonly StreamLayerSsrcs[] | null
): boolean {
    if (a === b) return true
    if (!a || !b || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i].layer !== b[i].layer || a[i].ssrcs.length !== b[i].ssrcs.length) return false
        for (let j = 0; j < a[i].ssrcs.length; j++) {
            if (a[i].ssrcs[j] !== b[i].ssrcs[j]) return false
        }
    }
    return true
}

enum ConnectionState {
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
    /**
     * The other of the web client port and the advertised one, tried once if the relay never
     * answers on `port`: which of the two answers follows the account class the server assigns.
     */
    fallbackPort?: number
    /** `'raw-udp'` when this leg rides raw UDP; absent, it rides WebRTC. */
    transport?: 'raw-udp'
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
interface AllocateCache {
    readonly relayInfo: RelayInfo
    readonly epoch: number
    readonly bytes: ArrayBuffer
}

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
    private readonly createPeerConnection: WaSctpRelayOptions['createPeerConnection']
    private readonly createRawUdpLeg: WaSctpRelayOptions['createRawUdpLeg']
    private readonly rawUdpLegs: NonNullable<WaSctpRelayOptions['rawUdpLegs']>
    private readonly onConnected: WaSctpRelayOptions['onConnected']
    private readonly onLost: WaSctpRelayOptions['onLost']
    private readonly onRelayAnswered: WaSctpRelayOptions['onRelayAnswered']
    private readonly onReceive: WaSctpRelayOptions['onReceive']
    private readonly now: () => number
    private readonly traceEnabled: boolean
    private connections = new Map<string, Connection>()
    private readonly answeredRelayNames = new Set<string>()
    /** The attribute layout of each leg's last allocate, logged when it changes. */
    private readonly allocateLayouts = new WeakMap<Connection, string>()
    /** The relays of {@link generation}, by relay key; older ones leave it when it advances. */
    private relayMap = new Map<string, RelayInfo>()
    /** The newest relay generation; media is elected among its legs while one is open. */
    private generation = 0
    /** The newest generation proved below this one; see {@link retireOlderGenerations}. */
    private retiredBelow = 0
    /** Whether older legs hearing the peer outlived the proof; see {@link retireQuietOlderLegs}. */
    private olderLegsHearing = false
    /**
     * When media first went out on a leg of the newest generation before any of its legs heard
     * the peer; `RX_ELECTION_HOLD_MS` after it, the peer is followed back to an older leg.
     */
    private newestSendingSince: number | null = null
    /** Whether the call was accepted; see {@link setMediaFlowing}. */
    private mediaFlowing = false
    /**
     * Since when no leg heard authenticated peer media (RTP or SRTCP) while the accepted call
     * sends; `null` until the next send after the call is accepted or the peer is heard.
     */
    private downlinkStalledSince: number | null = null
    private downlinkReallocated = false
    private downlinkRedials = 0
    /** The scope of the last election, logged when it changes. */
    private electionScope: ElectionScope = 'newest'
    private stats = { connected: 0 }
    private keepaliveTimers = new Map<string, ReturnType<typeof setInterval>>()
    private audioSsrc = 0
    private subscriptionSsrc = 0
    private selfStreamSsrcs: number[] = []
    private peerStreamSsrcs: number[] = []
    private selfPid = 0
    private peerPid = 0
    /** Set, allocates carry the layered descriptor of these streams; see {@link setSelfLayers}. */
    private selfLayers: readonly StreamLayerSsrcs[] | null = null
    /** Set, allocates carry this `0x4021`; see {@link setRxSubscriptions}. */
    private rxSubscriptions: Uint8Array | null = null
    /** The one leg media goes out on; see {@link sendMedia}. */
    private mediaLeg: Connection | null = null
    private pingIntervalMs = CONFIG.PING_SETUP_INTERVAL_MS
    /** Bumped whenever an input of the allocate's SSRC attributes changes. */
    private allocateEpoch = 0

    constructor(options: WaSctpRelayOptions) {
        this.logger = options.logger ?? createNoopLogger()
        this.crypto = options.crypto
        this.createPeerConnection = options.createPeerConnection
        this.createRawUdpLeg = options.createRawUdpLeg
        this.rawUdpLegs = options.rawUdpLegs ?? 'all'
        this.onConnected = options.onConnected
        this.onLost = options.onLost
        this.onRelayAnswered = options.onRelayAnswered
        this.onReceive = options.onReceive
        this.now = options.now ?? (() => performance.now())
        this.traceEnabled = isLogLevelEnabled(this.logger, 'trace')
    }

    setSsrc(ssrc: number): void {
        this.audioSsrc = ssrc
        this.allocateEpoch++
        this.logger.debug('sctp ssrc set', { ssrc: `0x${ssrc.toString(16).padStart(8, '0')}` })
    }

    setSubscriptionSsrc(ssrc: number): void {
        this.subscriptionSsrc = ssrc
        this.allocateEpoch++
        this.logger.debug('sctp subscription ssrc set', {
            ssrc: `0x${ssrc.toString(16).padStart(8, '0')}`
        })
    }

    setStreamSsrcs(selfSsrcs: number[], peerSsrcs: number[]): void {
        this.selfStreamSsrcs = selfSsrcs.filter(Boolean)
        this.peerStreamSsrcs = peerSsrcs.filter(Boolean)
        this.allocateEpoch++
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
        if (changed) this.allocateEpoch++
        this.logger.debug('sctp participant ids set', {
            selfPid: this.selfPid,
            peerPid: this.peerPid
        })
        if (changed && this.selfPid && this.peerPid && this.hasConnection()) {
            this.resendSubscriptions()
        }
    }

    /**
     * Sets the streams this side sends, in which case every allocate carries the self-only
     * layered descriptor instead of the 1:1 SSRC list; `null` goes back to the 1:1 list. A change
     * is re-announced on the open legs.
     */
    setSelfLayers(layers: readonly StreamLayerSsrcs[] | null): void {
        if (sameStreamLayers(this.selfLayers, layers)) return
        this.selfLayers = layers
        this.allocateEpoch++
        this.logger.debug('sctp self stream layers set', {
            layers: layers?.length ?? null,
            ssrcs: layers?.reduce((sum, layer) => sum + layer.ssrcs.length, 0) ?? null
        })
        if (this.hasConnection()) this.resendSubscriptions()
    }

    /**
     * Sets the `0x4021` video subscription every allocate carries (see `buildRxSubscriptions`);
     * `null` or empty leaves it out. A change is re-announced on the open legs.
     */
    setRxSubscriptions(bytes: Uint8Array | null): void {
        const next = bytes && bytes.length > 0 ? bytes.slice() : null
        if (sameOptionalBytes(this.rxSubscriptions, next)) return
        this.rxSubscriptions = next
        this.allocateEpoch++
        this.logger.debug('sctp rx subscriptions set', { size: next?.length ?? 0 })
        if (this.hasConnection()) this.resendSubscriptions()
    }

    resendSubscriptions(): void {
        for (const conn of this.connections.values()) {
            if (conn.state !== ConnectionState.Open) continue

            if (conn.rawLeg) {
                if (conn.rawLeg.isOpen && this.sendRawAllocate(conn, 'resend')) {
                    this.logger.debug('raw udp allocate resent', { connectionId: conn.id })
                }
                continue
            }

            if (conn.channel && conn.channel.readyState === 'open') {
                this.sendStunAllocateOnOpen(conn)
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
     * Stamps the relay's credentials onto the SDP answer: `ice-ufrag` carries the relay token
     * (`authToken || token`) and `ice-pwd` its key, both measured as required by the relay.
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
     * Puts a leg in `connections` as `Connecting` before anything is dialled, so
     * `announceLastLegLost` sees a whole batch before any leg of it can fail.
     */
    private registerConnection(relayInfo: RelayInfo, generation: number): Connection {
        const connectionId = this.makeConnectionId(
            relayInfo.ip,
            relayInfo.port,
            relayInfo.authTokenId
        )

        this.logger.debug('sctp connecting to relay', {
            connectionId,
            relayName: relayInfo.name,
            transport: relayInfo.transport ?? 'webrtc',
            generation
        })

        const conn: Connection = {
            state: ConnectionState.Connecting,
            peerConnection: null,
            channel: null,
            rawLeg: null,
            incomingChannels: [],
            id: connectionId,
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

        this.connections.set(connectionId, conn)
        return conn
    }

    /** Dials a leg that is already registered, over the configured transport. */
    private async startConnection(conn: Connection): Promise<void> {
        const connectionId = conn.id
        const relayInfo = conn.relayInfo

        this.armPortFallback(
            conn,
            PORT_FALLBACK_UNOPENED_MS,
            'relay_port_unopened',
            () => conn.state === ConnectionState.Connecting
        )

        if (relayInfo.transport === 'raw-udp' && this.createRawUdpLeg) {
            this.openRawUdpLeg(conn, this.createRawUdpLeg)
            return
        }

        this.armConnectTimeout(conn, 'sctp connection timeout', 'connection_timeout')

        const dialEnded = new Promise<never>((_resolve, reject) => {
            conn.abortDial = () => reject(new Error('leg ended while dialling'))
        })
        dialEnded.catch(() => undefined)
        const whileDialling = <T>(step: Promise<T>): Promise<T> => Promise.race([step, dialEnded])

        try {
            const creating = this.createPeerConnection({ iceServers: [] })
            const pc = await whileDialling(creating).catch((err: unknown) => {
                // If the leg ended first, whatever the factory resolves later is held by nobody.
                creating.then(
                    (late) => closeQuietly(late, this.logger),
                    () => undefined
                )
                throw err
            })

            // The leg may have ended while the factory loaded; close a connection nobody holds.
            if (
                this.connections.get(connectionId) !== conn ||
                conn.state !== ConnectionState.Connecting
            ) {
                closeQuietly(pc, this.logger)
                return
            }
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
                    const grace = setTimeout(() => {
                        conn.iceDisconnectTimers.delete(grace)
                        if (
                            conn.state !== ConnectionState.Failed &&
                            conn.state !== ConnectionState.Closed &&
                            pc.iceConnectionState === 'disconnected'
                        ) {
                            this.failConnection(conn, 'ice_disconnected_timeout')
                        }
                    }, CONFIG.ICE_DISCONNECT_GRACE_MS)
                    unrefTimer(grace)
                    conn.iceDisconnectTimers.add(grace)
                }
                if (
                    pc.iceConnectionState === 'connected' ||
                    pc.iceConnectionState === 'completed'
                ) {
                    this.logger.debug('ice connected', { connectionId })
                    pc.getStats()
                        .then((stats) => {
                            stats.forEach((report) => {
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
                        })
                        .catch((err: unknown) => {
                            this.logger.trace('getStats failed', {
                                message: toError(err).message
                            })
                        })
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
                    if (this.traceEnabled) {
                        this.logger.trace('data from incoming channel', {
                            connectionId,
                            size: buffer.length,
                            packetKind: classifyPacket(buffer)
                        })
                    }
                    this.handleRelayMessage(buffer, conn)
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
                    const index = conn.incomingChannels.indexOf(incomingChannel)
                    if (index >= 0) conn.incomingChannels.splice(index, 1)
                }
            }

            const channel = pc.createDataChannel('wa-web-call', {
                ordered: false
            })

            conn.channel = channel
            channel.binaryType = 'arraybuffer'

            channel.onopen = () => {
                this.logger.debug('sctp data channel open', { connectionId })
                this.onLegOpen(conn, () => this.sendStunAllocateOnOpen(conn))
            }

            channel.onclose = () => {
                this.logger.debug('sctp data channel closed', { connectionId })
                this.closeConnection(conn)
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
                this.handleRelayMessage(buffer, conn)
            }

            channel.onerror = () => {
                this.logger.warn('sctp data channel error', { connectionId })
                this.failConnection(conn, 'data_channel_error')
            }

            const offer = await whileDialling(pc.createOffer())
            await whileDialling(pc.setLocalDescription(offer))

            const localUfragMatch = offer.sdp!.match(/a=ice-ufrag:([^\r\n]+)/)
            conn.localUfrag = localUfragMatch?.[1] || ''

            const modifiedSdp = this.modifySdpForRelay(offer.sdp!, relayInfo)

            this.logger.debug('sdp relay candidate configured', {
                connectionId,
                candidate: `${relayInfo.ip}:${relayInfo.port}`,
                authTokenSize: relayInfo.rawAuthToken?.length ?? 0
            })

            await whileDialling(
                pc.setRemoteDescription({
                    type: 'answer',
                    sdp: modifiedSdp
                })
            )

            this.logger.debug('sctp relay configured, waiting for ice', { connectionId })
        } catch (err) {
            if (conn.state !== ConnectionState.Connecting) {
                this.logger.debug('sctp relay dial abandoned', { connectionId, state: conn.state })
                return
            }
            this.logger.error('sctp relay connect failed', {
                connectionId,
                message: toError(err).message
            })
            this.failConnection(conn, 'connection_error')
        } finally {
            conn.abortDial = null
        }
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
        this.releaseLeg(conn, true)
        if (!current) return

        this.stopKeepalive(conn.id)
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
        if (
            this.connections.has(this.makeConnectionId(relayInfo.ip, port, relayInfo.authTokenId))
        ) {
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

    private isConnOpen(conn: Connection): boolean {
        if (conn.state !== ConnectionState.Open) return false
        if (conn.rawLeg) return conn.rawLeg.isOpen
        return conn.channel?.readyState === 'open'
    }

    /** Opens a raw UDP leg, which then runs through the same bookkeeping as a WebRTC one. */
    private openRawUdpLeg(
        conn: Connection,
        createRawUdpLeg: (options: RawUdpLegOptions) => RawUdpLeg
    ): void {
        const { ip, port } = conn.relayInfo

        conn.rawLeg = createRawUdpLeg({
            ip,
            port,
            logger: this.logger.child({ connectionId: conn.id }),
            onOpen: () => {
                if (conn.state !== ConnectionState.Connecting) return
                this.logger.debug('raw udp relay leg open', { connectionId: conn.id, ip, port })
                this.onLegOpen(conn, () => this.registerRawLeg(conn, 'initial'))
            },
            onMessage: (data: Uint8Array) => {
                this.handleRelayMessage(data, conn)
            },
            onFailure: (reason: string) => {
                this.failConnection(conn, reason)
            }
        })

        this.armConnectTimeout(conn, 'raw udp relay leg timeout', 'raw_udp_open_timeout')

        conn.rawLeg.open()
    }

    /** Fails a leg still `Connecting` after `CONNECTION_TIMEOUT`. */
    private armConnectTimeout(conn: Connection, message: string, reason: string): void {
        conn.connectionTimeout = setTimeout(() => {
            if (conn.state === ConnectionState.Connecting) {
                this.logger.warn(message, { connectionId: conn.id })
                this.failConnection(conn, reason)
            }
        }, CONFIG.CONNECTION_TIMEOUT)
    }

    /**
     * Marks a leg open and registers it, then starts its keepalive and announces it; the
     * announcement starts the uplink, which is what makes the relay forward anything back.
     */
    private onLegOpen(conn: Connection, register: () => void): void {
        conn.state = ConnectionState.Open
        this.stats.connected++

        if (conn.connectionTimeout) {
            clearTimeout(conn.connectionTimeout)
            conn.connectionTimeout = null
        }

        register()
        this.armAnswerFallback(conn)
        this.startKeepalive(conn)
        this.onConnected?.()
    }

    /**
     * Emits a raw leg's ALLOCATE, its only STUN message besides the ping; the relay pairs the
     * call's ends off the token inside it. Returns whether one went out.
     */
    private sendRawAllocate(conn: Connection, label: string): boolean {
        if (!this.isConnOpen(conn)) return false
        const relayInfo = conn.relayInfo

        if (!relayInfo.rawToken || relayInfo.rawToken.length === 0) {
            this.logger.debug('raw udp allocate skipped, no relay token', {
                connectionId: conn.id,
                label
            })
            return false
        }

        const { sent, size } = this.sendAllocate(conn, relayInfo, relayInfo.rawToken)
        this.logger.trace('raw udp allocate sent', { connectionId: conn.id, label, size, sent })
        return sent
    }

    /**
     * Sends the leg's allocate, rebuilt only when its credentials or SSRC state changed, and
     * stamps the first send. The layout is noted when the bytes are new.
     */
    private sendAllocate(
        conn: Connection,
        relayInfo: RelayInfo,
        rawToken: Uint8Array
    ): { readonly sent: boolean; readonly size: number } {
        let cache = conn.allocateCache
        if (cache?.relayInfo !== relayInfo || cache.epoch !== this.allocateEpoch) {
            const allocate = buildAllocateForRelay(
                this.crypto,
                rawToken,
                this.buildAllocateSsrcList(),
                TEXT_ENCODER.encode(relayInfo.key),
                relayInfo.ip,
                relayInfo.port,
                conn.stunTransactionId,
                this.rxSubscriptions
            )
            cache = { relayInfo, epoch: this.allocateEpoch, bytes: toArrayBuffer(allocate) }
            conn.allocateCache = cache
            this.noteAllocateLayout(conn, allocate)
        }
        const sent = this.sendToChannel(conn, cache.bytes)
        if (sent) conn.allocateSentAt ??= this.now()
        return { sent, size: cache.bytes.byteLength }
    }

    /** Runs `send` at each delay of the registration ladder, on unreferenced timers. */
    private scheduleRegistrationReplays(send: (delayMs: number) => void): void {
        for (const delayMs of REGISTRATION_RETRY_DELAYS_MS) {
            unrefTimer(setTimeout(() => send(delayMs), delayMs))
        }
    }

    /** Sends a raw leg's allocate and the replays of its registration ladder. */
    private registerRawLeg(conn: Connection, label: string): void {
        this.sendRawAllocate(conn, label)
        this.scheduleRegistrationReplays(() => this.sendRawAllocate(conn, 'retry'))
    }

    /**
     * Builds the `0x4024` an allocate carries: the layered descriptor once self layers are set,
     * else the 1:1 list, falling back to the single inbound and outbound SSRCs when the
     * per-stream lists have not been handed over yet.
     */
    private buildAllocateSsrcList(): Uint8Array {
        if (this.selfLayers) return buildStreamDescriptor(this.selfLayers)

        const selfSsrcs = this.selfStreamSsrcs.length ? this.selfStreamSsrcs : [this.audioSsrc]
        const peerSsrcs = this.peerStreamSsrcs.length
            ? this.peerStreamSsrcs
            : this.subscriptionSsrc
              ? [this.subscriptionSsrc]
              : []

        return buildSSRCSubscriptionList(selfSsrcs, peerSsrcs, this.selfPid, this.peerPid)
    }

    /** Runs a WebRTC leg's registration ladder; each send reads the leg's current credentials. */
    private sendStunAllocateOnOpen(conn: Connection): void {
        const opening = conn.relayInfo
        if (!(opening.authToken || opening.token)) {
            this.logger.debug('stun registration skipped, no ufrag', { connectionId: conn.id })
            return
        }

        const localUfrag = conn.localUfrag
        const transactionId = conn.stunTransactionId

        const sendRegistration = (label: string) => {
            if (!this.isConnOpen(conn)) {
                return
            }
            const relayInfo = conn.relayInfo
            const connectionId = conn.id
            const remoteUfrag = relayInfo.authToken || relayInfo.token
            const hmacKey = TEXT_ENCODER.encode(relayInfo.key)

            const selfSsrc = this.audioSsrc
            const peerSsrc = this.subscriptionSsrc
            const ssrc = peerSsrc || selfSsrc
            if (!ssrc) {
                this.logger.debug('stun registration skipped, no ssrc', { connectionId, label })
                return
            }

            // v1-v3 carry only the primary inbound SSRC; per-stream lists belong to the allocate.
            const subs = buildSenderSubscriptions(ssrc)
            if (localUfrag) {
                const username = TEXT_ENCODER.encode(`${remoteUfrag}:${localUfrag}`)
                const v1 = buildBindingRequestWithSubs(
                    this.crypto,
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
                    this.crypto,
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
                this.crypto,
                undefined,
                undefined,
                subs,
                false,
                false,
                transactionId
            )
            this.sendToChannel(conn, toArrayBuffer(v3))
            this.logger.trace('stun v3 no-mi sent', { connectionId, label, size: v3.length })

            if (relayInfo.rawToken && relayInfo.rawToken.length > 0) {
                const { size } = this.sendAllocate(conn, relayInfo, relayInfo.rawToken)
                this.logger.trace('stun v4 allocate sent', { connectionId, label, size })
            }
        }

        sendRegistration('initial')
        this.scheduleRegistrationReplays((delayMs) => sendRegistration(`retry-${delayMs}ms`))
    }

    private startKeepalive(conn: Connection): void {
        const connectionId = conn.id
        this.stopKeepalive(connectionId)

        this.sendPing(conn)
        this.logger.debug('keepalive first ping sent', { connectionId })

        let keepaliveCount = 0
        const timer = setInterval(() => {
            if (!this.isConnOpen(conn)) {
                this.stopKeepalive(connectionId)
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
                    pongs: this.pongCount,
                    rtpRecv: this.rtpRecvCount,
                    warpRecv: this.warpRecvCount,
                    keepalives: keepaliveCount,
                    globalSend: this.sendCount,
                    bufferedAmount
                })
            }
        }, this.pingIntervalMs)

        this.keepaliveTimers.set(connectionId, timer)
        this.logger.debug('keepalive started', {
            connectionId,
            intervalMs: this.pingIntervalMs
        })
    }

    private sendPing(conn: Connection): void {
        conn.ping ??= toArrayBuffer(buildWhatsAppPing(conn.stunTransactionId))
        if (this.sendToChannel(conn, conn.ping)) {
            conn.pingUnansweredSince ??= this.now()
        }
    }

    /** Takes a leg whose oldest unanswered ping is `UNRESPONSIVE_TIMEOUT_MS` old out of the election. */
    private checkResponsive(conn: Connection): void {
        const since = conn.pingUnansweredSince
        if (conn.unresponsive || since === null) return
        if (this.now() - since < CONFIG.UNRESPONSIVE_TIMEOUT_MS) return
        conn.unresponsive = true
        this.logger.warn('relay leg unresponsive, out of the media election', {
            connectionId: conn.id,
            elected: conn === this.mediaLeg
        })
    }

    private onPong(conn: Connection): void {
        conn.pingUnansweredSince = null
        if (!conn.unresponsive) return
        conn.unresponsive = false
        this.logger.debug('relay leg answering again, back in the media election', {
            connectionId: conn.id
        })
    }

    /** Moves every leg's keepalive to the cadence of an accepted call; later legs start on it. */
    setMediaFlowing(): void {
        this.mediaFlowing = true
        if (this.pingIntervalMs === CONFIG.PING_INTERVAL_MS) return
        this.pingIntervalMs = CONFIG.PING_INTERVAL_MS
        for (const conn of this.connections.values()) {
            if (this.keepaliveTimers.has(conn.id)) this.startKeepalive(conn)
        }
    }

    private stopKeepalive(connectionId: string): void {
        const timer = this.keepaliveTimers.get(connectionId)
        if (timer) {
            clearInterval(timer)
            this.keepaliveTimers.delete(connectionId)
        }
    }

    /** Closes a leg the call still holds; an old leg under a reused id is not this one. */
    private closeConnection(conn: Connection): void {
        const connectionId = conn.id
        if (this.connections.get(connectionId) !== conn) return

        this.releaseConnected(conn)
        conn.state = ConnectionState.Closed
        this.stopKeepalive(connectionId)
        this.releaseLeg(conn, false)

        this.connections.delete(connectionId)
        this.announceLastLegLost('closed')
    }

    /**
     * Ends a leg's dial and timers and closes what it holds; `closeChannel` is false when its
     * data channel is what closed.
     */
    private releaseLeg(conn: Connection, closeChannel: boolean): void {
        conn.abortDial?.()
        if (conn.connectionTimeout) clearTimeout(conn.connectionTimeout)
        for (const timer of conn.iceDisconnectTimers) clearTimeout(timer)
        conn.iceDisconnectTimers.clear()
        if (closeChannel) closeQuietly(conn.channel, this.logger)
        const incoming = conn.incomingChannels
        conn.incomingChannels = []
        for (const ch of incoming) closeQuietly(ch, this.logger)
        closeQuietly(conn.peerConnection, this.logger)
        closeQuietly(conn.rawLeg, this.logger)
    }

    private sendCount = 0

    private sendToChannel(conn: Connection, data: ArrayBuffer): boolean {
        try {
            if (conn.rawLeg) {
                if (!this.isConnOpen(conn) || !conn.rawLeg.send(new Uint8Array(data))) return false
            } else {
                if (!conn.channel || conn.channel.readyState !== 'open') return false
                conn.channel.send(data)
            }

            conn.stats.sentPackets++
            conn.stats.sentBytes += data.byteLength
            this.sendCount++

            if (this.traceEnabled && (this.sendCount <= 10 || this.sendCount % 100 === 0)) {
                const buf = new Uint8Array(data)
                const twoBits = (buf[0] & 0xc0) >> 6
                this.logger.trace('sctp relay send', {
                    count: this.sendCount,
                    packetType: twoBits === 0 ? 'STUN' : twoBits === 2 ? 'RTP/SRTP' : 'OTHER',
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
    private warpRecvCount = 0

    private handleRelayMessage(data: Uint8Array, conn: Connection): void {
        conn.stats.receivedPackets++
        conn.stats.receivedBytes += data.length

        const twoBits = (data[0] & 0xc0) >> 6
        // A WARP frame has STUN's clear high bits, so it is told apart before the STUN branch.
        const framed = isWarpFramedPacket(data)
        if (framed) this.warpRecvCount++
        else if (twoBits === 2) this.rtpRecvCount++

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

        if (this.traceEnabled) this.traceReceive(data, conn, twoBits, framed)
        if (!framed && twoBits === 0) this.handleStun(data, conn)

        this.onReceive?.(data, conn.id)
    }

    private handleStun(data: Uint8Array, conn: Connection): void {
        if (isWaPong(data)) {
            this.onPong(conn)
            this.pongCount++
            if (this.traceEnabled && (this.pongCount <= 3 || this.pongCount % 20 === 0)) {
                this.logger.trace('stun pong received', {
                    count: this.pongCount,
                    connectionId: conn.id,
                    size: data.length
                })
            }
            return
        }

        const stunInfo = parseStunResponse(data)
        if (!stunInfo) {
            if (this.traceEnabled) {
                this.logger.trace('unparseable stun-like packet', {
                    connectionId: conn.id,
                    size: data.length,
                    hex: bytesToHex(data.subarray(0, 80))
                })
            }
            return
        }

        if (this.traceEnabled) {
            this.logger.trace('stun response received', {
                connectionId: conn.id,
                summary: formatStunResponse(stunInfo),
                hex: bytesToHex(data)
            })
        }
        if (
            stunInfo.isSuccess &&
            (stunInfo.method === 'binding' || stunInfo.method === 'allocate')
        ) {
            this.logger.debug('stun binding or allocate success', {
                connectionId: conn.id,
                method: stunInfo.method
            })
        }
        if (stunInfo.isError) {
            this.logger.warn('stun error response', {
                connectionId: conn.id,
                errorCode: stunInfo.errorCode,
                errorReason: stunInfo.errorReason || ''
            })
        }
        if (!this.traceEnabled) return
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

    /** The per-datagram traces; called only with trace enabled. */
    private traceReceive(
        data: Uint8Array,
        conn: Connection,
        twoBits: number,
        framed: boolean
    ): void {
        const count = conn.stats.receivedPackets
        if (
            count <= 50 ||
            count % 25 === 0 ||
            twoBits === 2 ||
            (twoBits === 0 && !framed && data.length >= 20 && !isWaPong(data))
        ) {
            this.logger.trace('sctp relay receive', {
                count,
                packetType: framed
                    ? 'WARP'
                    : twoBits === 0
                      ? 'STUN'
                      : twoBits === 2
                        ? 'RTP/SRTP'
                        : twoBits === 1
                          ? 'DTLS'
                          : 'UNKNOWN',
                size: data.length,
                connectionId: conn.id,
                hexPreview: bytesToHex(data.subarray(0, Math.min(24, data.length)))
            })
        }

        if (framed) {
            this.traceWarpFrame(data, conn)
        } else if (twoBits === 2) {
            this.logger.trace('rtp packet received', {
                count: this.rtpRecvCount,
                payloadType: data[1] & 0x7f,
                sequence: data.length >= 4 ? (data[2] << 8) | data[3] : 0,
                ssrc: `0x${(data.length >= 12 ? readUInt32BE(data, 8) : 0).toString(16)}`,
                size: data.length,
                connectionId: conn.id
            })
            if (this.rtpRecvCount <= 3) {
                this.logger.trace('rtp packet hex preview', {
                    connectionId: conn.id,
                    hex: bytesToHex(data.subarray(0, 160))
                })
            }
        } else if (twoBits !== 0) {
            this.unknownRecvCount++
            this.logger.trace('unknown relay packet type', {
                count: this.unknownRecvCount,
                firstByte: `0x${data[0].toString(16)}`,
                size: data.length,
                connectionId: conn.id,
                hex: bytesToHex(data.subarray(0, 80))
            })
        }
    }

    /** Logs an allocate's attribute types and lengths, never values, when its layout changes. */
    private noteAllocateLayout(conn: Connection, allocate: Uint8Array): void {
        const attributes = parseStunResponse(allocate)?.attributes
        if (!attributes) return
        const layout = attributes.map((attr) => `${attr.typeName}:${attr.length}`).join(',')
        if (this.allocateLayouts.get(conn) === layout) return
        this.allocateLayouts.set(conn, layout)
        this.logger.debug('relay allocate layout', {
            connectionId: conn.id,
            generation: conn.generation,
            size: allocate.length,
            attributes: layout
        })
    }

    private traceWarpFrame(data: Uint8Array, conn: Connection): void {
        const read = readWarpFrame(data)
        const rtp = read.kind === 'framed' ? read.rtp : null
        this.logger.trace('warp frame received', {
            count: this.warpRecvCount,
            kind: read.kind,
            headerLength: read.kind === 'not_framed' ? undefined : read.headerLength,
            payloadType: rtp ? rtp[1] & 0x7f : undefined,
            sequence: rtp ? (rtp[2] << 8) | rtp[3] : undefined,
            ssrc: rtp ? `0x${readUInt32BE(rtp, 8).toString(16)}` : undefined,
            size: data.length,
            connectionId: conn.id
        })
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
        relays: Array<
            Omit<RelayInfo, 'id' | 'fallbackPort'> & {
                /** The port the relay advertised, before the WebRTC rewrite; raw legs dial it. */
                originalPort?: number
            }
        >,
        options: { readonly generation?: number } = {}
    ): Promise<void> {
        const generation = options.generation ?? this.generation
        if (generation < this.generation) {
            this.logger.debug('sctp stale relay generation ignored', {
                generation,
                current: this.generation,
                count: relays.length
            })
            return
        }
        if (generation > this.generation) {
            this.logger.debug('sctp relay generation advanced', {
                from: this.generation,
                to: generation,
                count: relays.length
            })
            this.generation = generation
            this.olderLegsHearing = false
            this.newestSendingSince = null
            this.relayMap.clear()
        }

        this.logger.debug('sctp configuring relays', { count: relays.length, generation })

        const undialable: string[] = []
        for (const relay of relays) {
            const rawUdp = relay.transport === 'raw-udp' || this.rawUdpLegs === 'all'
            if (relay.transport === 'raw-udp' && !this.createRawUdpLeg) {
                undialable.push(relay.name || relay.ip)
                continue
            }
            const transport = rawUdp && this.createRawUdpLeg ? 'raw-udp' : undefined

            const webClientPort = relay.port || CONFIG.TRUE_WEB_CLIENT_RELAY_PORT

            // Only WebRTC legs move to the web client port; a raw leg keeps the advertised one.
            const port = transport ? (relay.originalPort ?? webClientPort) : webClientPort

            const connectionId = this.makeConnectionId(relay.ip, port, relay.authTokenId)
            const otherPort =
                port === CONFIG.TRUE_WEB_CLIENT_RELAY_PORT
                    ? relay.originalPort
                    : CONFIG.TRUE_WEB_CLIENT_RELAY_PORT

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
                authTokenId: relay.authTokenId,
                fallbackPort: otherPort !== port ? otherPort : undefined,
                transport
            }

            this.relayMap.set(connectionId, relayInfo)
        }

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
                from: this.fingerprint(heldUfrag),
                to: this.fingerprint(nextUfrag)
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
            open: this.isConnOpen(conn)
        })
        if (!this.isConnOpen(conn)) return
        if (conn.rawLeg) this.registerRawLeg(conn, 'reissue')
        else this.sendStunAllocateOnOpen(conn)
    }

    /** A short one-way fingerprint that tells two credentials apart without showing either. */
    private fingerprint(credential: string): string {
        const digest = this.crypto.hmacSha1(
            CREDENTIAL_FINGERPRINT_KEY,
            TEXT_ENCODER.encode(credential)
        )
        return bytesToHex(digest.subarray(0, 4))
    }

    /**
     * Takes a leg out of the call without announcing a loss or redialling it: its keepalive,
     * registration replays and dial stop, and its socket or peer connection closes.
     */
    private endLegQuietly(conn: Connection): void {
        this.connections.delete(conn.id)
        this.releaseConnected(conn)
        conn.state = ConnectionState.Closed
        this.stopKeepalive(conn.id)
        this.releaseLeg(conn, true)
    }

    /**
     * Proves the newest generation once `conn`, an open leg of it, heard authenticated peer media
     * (an answered allocate is no proof), and retires the older legs not hearing the peer.
     */
    private retireOlderGenerations(conn: Connection): void {
        if (conn.generation !== this.generation || this.newestProved()) return
        if (!this.isConnOpen(conn)) return
        this.retiredBelow = this.generation
        this.retireQuietOlderLegs(this.now(), conn.id)
    }

    /**
     * Closes each older leg that has not heard authenticated peer media for `OLDER_LEG_QUIET_MS`;
     * one still hearing a sender stays, receive-only, until it goes quiet.
     */
    private retireQuietOlderLegs(now: number, provedBy?: string): void {
        let hearing = false
        for (const old of this.connections.values()) {
            if (old.generation >= this.generation) continue
            const quietMs = old.peerMediaAt === null ? null : Math.round(now - old.peerMediaAt)
            if (quietMs !== null && quietMs < CONFIG.OLDER_LEG_QUIET_MS) {
                hearing = true
                continue
            }
            this.logger.info('retired by a newer relay generation', {
                connectionId: old.id,
                generation: old.generation,
                newest: this.generation,
                state: old.state,
                proof: 'peer_media',
                provedBy,
                quietMs
            })
            this.endLegQuietly(old)
        }
        if (hearing && !this.olderLegsHearing) {
            this.logger.debug('older relay legs kept while they hear the peer', {
                newest: this.generation
            })
        }
        this.olderLegsHearing = hearing
    }

    /**
     * Sends on the one leg elected for media and reports whether it took it; with no leg open
     * nothing goes out. Allocates and keepalives keep reaching every leg, so any can take over.
     */
    sendMedia(data: ArrayBuffer): boolean {
        const leg = this.electMediaLeg()
        if (leg === null || !this.sendToChannel(leg, data)) return false
        if (this.newestSendingSince === null && leg.generation === this.generation) {
            if (!this.newestProved()) this.newestSendingSince = this.now()
        }
        if (this.olderLegsHearing) this.retireQuietOlderLegs(this.now())
        if (this.mediaFlowing) this.watchDownlink()
        return true
    }

    /**
     * Recovers WebRTC legs that keep answering while no peer media arrives on any leg: past
     * `DOWNLINK_REALLOCATE_AFTER_MS` they re-allocate on the same connection, and
     * `DOWNLINK_REDIAL_AFTER_MS` later the newest generation's WebRTC legs are redialled, with
     * backoff and at most `DOWNLINK_MAX_REDIALS` times per call. Raw legs police their own
     * return path.
     */
    private watchDownlink(): void {
        const now = this.now()
        if (this.downlinkStalledSince === null) {
            this.downlinkStalledSince = now
            return
        }
        const stalledMs = Math.round(now - this.downlinkStalledSince)
        if (!this.downlinkReallocated) {
            if (stalledMs < CONFIG.DOWNLINK_REALLOCATE_AFTER_MS) return
            this.downlinkReallocated = true
            this.reallocateStalledLegs(stalledMs)
            return
        }
        if (this.downlinkRedials >= CONFIG.DOWNLINK_MAX_REDIALS) return
        const redialAfterMs =
            CONFIG.DOWNLINK_REALLOCATE_AFTER_MS +
            CONFIG.DOWNLINK_REDIAL_AFTER_MS * 2 ** this.downlinkRedials
        if (stalledMs < redialAfterMs) return
        if (this.redialStalledLegs(stalledMs)) this.downlinkRedials++
        this.downlinkStalledSince = now
        this.downlinkReallocated = false
    }

    private stalledWebRtcLegs(newestOnly: boolean): Connection[] {
        const legs: Connection[] = []
        for (const conn of this.connections.values()) {
            if (conn.rawLeg || conn.relayInfo.transport === 'raw-udp') continue
            if (newestOnly && conn.generation !== this.generation) continue
            legs.push(conn)
        }
        return legs
    }

    private reallocateStalledLegs(stalledMs: number): void {
        const legs = this.stalledWebRtcLegs(false).filter((conn) => this.isConnOpen(conn))
        if (legs.length === 0) return
        this.logger.warn('relay downlink stalled, re-allocating', { stalledMs, legs: legs.length })
        for (const conn of legs) this.sendStunAllocateOnOpen(conn)
    }

    /** Redials the newest generation's WebRTC legs on new peer connections; whether any was. */
    private redialStalledLegs(stalledMs: number): boolean {
        const legs = this.stalledWebRtcLegs(true)
        if (legs.length === 0) return false
        this.logger.warn('relay downlink stalled, redialling', {
            stalledMs,
            legs: legs.length,
            attempt: this.downlinkRedials + 1,
            maxAttempts: CONFIG.DOWNLINK_MAX_REDIALS
        })
        const redialled = legs.map((leg) => {
            const { relayInfo, generation } = leg
            this.endLegQuietly(leg)
            return this.registerConnection(relayInfo, generation)
        })
        for (const conn of redialled) void this.startConnection(conn)
        return true
    }

    /** Whether a leg of the newest generation heard the peer, or there is no older one. */
    private newestProved(): boolean {
        return this.retiredBelow >= this.generation
    }

    /**
     * Whether the peer is followed back to an older generation: the newest one carried our media
     * for `RX_ELECTION_HOLD_MS` and none of its legs heard the peer.
     */
    private followsPeerToOlder(now: number): boolean {
        return (
            !this.newestProved() &&
            this.newestSendingSince !== null &&
            now - this.newestSendingSince >= CONFIG.RX_ELECTION_HOLD_MS
        )
    }

    /**
     * Records that the peer's media authenticated on a leg, and follows the peer there: when
     * our media leg has not heard the peer for `RX_ELECTION_HOLD_MS`, this leg takes it over.
     * A leg of the newest generation takes over a leg of an older one at once; an older leg
     * takes over a newest one only once {@link followsPeerToOlder}.
     */
    notePeerMedia(connectionId: string): void {
        const conn = this.connections.get(connectionId)
        if (!conn) return
        const now = this.now()
        conn.peerMediaAt = now
        this.downlinkStalledSince = null
        this.downlinkReallocated = false
        if (this.isConnOpen(conn)) this.retireOlderGenerations(conn)
        if (this.olderLegsHearing) this.retireQuietOlderLegs(now)

        const current = this.mediaLeg
        if (conn === current || conn.unresponsive || !this.isConnOpen(conn)) return
        const newest = conn.generation === this.generation
        if (!newest && this.hasOpenLegOf(this.generation) && !this.followsPeerToOlder(now)) return
        const leavesOlder = newest && current !== null && current.generation !== this.generation
        if (
            !leavesOlder &&
            current &&
            this.isElectable(current) &&
            current.peerMediaAt !== null &&
            now - current.peerMediaAt < CONFIG.RX_ELECTION_HOLD_MS
        ) {
            return
        }

        this.mediaLeg = conn
        this.logger.debug(
            newest
                ? 'sctp media leg follows the peer'
                : 'sctp media leg follows the peer to an older relay generation',
            {
                connectionId,
                relayId: conn.relayInfo.relayId,
                generation: conn.generation,
                newest: this.generation,
                replaces: current?.id
            }
        )
    }

    private isElectable(conn: Connection): boolean {
        return this.connections.get(conn.id) === conn && this.isConnOpen(conn) && !conn.unresponsive
    }

    private hasOpenLegOf(generation: number): boolean {
        for (const conn of this.connections.values()) {
            if (conn.generation === generation && this.isConnOpen(conn)) return true
        }
        return false
    }

    /**
     * Keeps the leg in use while it is open and answering pings, since the peer's stream
     * returns where our media leaves. Else the first such leg in dial order, off the dropped
     * leg's relay, which never re-points; with none answering, any open leg. While a leg of
     * the newest generation is open, only those legs are candidates.
     */
    private electMediaLeg(): Connection | null {
        const current = this.mediaLeg
        if (current && current.generation === this.generation && this.isElectable(current)) {
            return current
        }
        if (current && this.isElectable(current) && current.peerMediaAt !== null) {
            const now = this.now()
            const hearing = now - current.peerMediaAt < CONFIG.RX_ELECTION_HOLD_MS
            if (hearing && this.followsPeerToOlder(now)) return current
        }

        const scoped = this.generation > 0 && this.hasOpenLegOf(this.generation)
        if (this.generation > 0) this.noteElectionScope(scoped)
        if (current && !scoped && this.isElectable(current)) return current

        let elected: Connection | null = null
        let sameRelay: Connection | null = null
        let unresponsive: Connection | null = null
        for (const conn of this.connections.values()) {
            if (!this.isConnOpen(conn)) continue
            if (scoped && conn.generation !== this.generation) continue
            if (conn.unresponsive) {
                unresponsive ??= conn
                continue
            }
            if (
                current &&
                conn.generation === current.generation &&
                conn.relayInfo.relayId === current.relayInfo.relayId
            ) {
                sameRelay ??= conn
                continue
            }
            elected = conn
            break
        }
        elected ??= sameRelay ?? unresponsive

        this.mediaLeg = elected
        if (elected && elected !== current) {
            this.logger.debug('sctp media leg elected', {
                connectionId: elected.id,
                relayId: elected.relayInfo.relayId,
                generation: elected.generation,
                replaces: current?.id
            })
        } else if (!elected && current) {
            this.logger.debug('sctp media leg lost, no open leg left', { connectionId: current.id })
        }
        return elected
    }

    /**
     * Logs where media is elected once a newer generation exists, on change only: its legs,
     * an older leg while they still dial, or an older leg because none of them is left (never
     * once the older legs were retired).
     */
    private noteElectionScope(scoped: boolean): void {
        let scope: ElectionScope = 'newest'
        let dialling = 0
        let open = 0
        if (!scoped) {
            for (const conn of this.connections.values()) {
                if (this.isConnOpen(conn)) open++
                else if (
                    conn.generation === this.generation &&
                    conn.state === ConnectionState.Connecting
                ) {
                    dialling++
                }
            }
            scope = dialling > 0 ? 'awaiting' : 'older'
        }
        if (scope === this.electionScope || (scope === 'older' && open === 0)) return
        this.electionScope = scope

        const context = { generation: this.generation, dialling, openLegs: open }
        if (scope === 'older') {
            this.logger.warn(
                'no leg of the newest relays is open, media falls back to older legs',
                context
            )
        } else if (scope === 'awaiting') {
            this.logger.debug('newest relays still dialling, media stays on older legs', context)
        } else {
            this.logger.debug('media elected among the newest relays', context)
        }
    }

    /**
     * Sends to every open connection and reports whether any of them took it. Not for media:
     * the peer's SRTP replay window is per SSRC, so every copy past the first is dropped.
     */
    broadcast(data: ArrayBuffer): boolean {
        let sent = false
        for (const conn of this.connections.values()) {
            if (this.isConnOpen(conn) && this.sendToChannel(conn, data)) {
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

        for (const [id] of this.keepaliveTimers) {
            this.stopKeepalive(id)
        }

        // Emptied first, so a channel closing synchronously is not announced as a lost leg.
        const closing = [...this.connections.values()]
        this.connections.clear()

        for (const conn of closing) {
            conn.state = ConnectionState.Closed
            this.releaseLeg(conn, true)
        }

        this.relayMap.clear()
        this.answeredRelayNames.clear()
        this.generation = 0
        this.retiredBelow = 0
        this.olderLegsHearing = false
        this.newestSendingSince = null
        this.mediaFlowing = false
        this.downlinkStalledSince = null
        this.downlinkReallocated = false
        this.downlinkRedials = 0
        this.electionScope = 'newest'
        this.stats.connected = 0
        this.audioSsrc = 0
        this.subscriptionSsrc = 0
        this.selfStreamSsrcs = []
        this.peerStreamSsrcs = []
        this.selfPid = 0
        this.peerPid = 0
        this.selfLayers = null
        this.rxSubscriptions = null
        this.mediaLeg = null
        this.pingIntervalMs = CONFIG.PING_SETUP_INTERVAL_MS
        this.pongCount = 0
        this.rtpRecvCount = 0
        this.unknownRecvCount = 0
        this.warpRecvCount = 0
        this.sendCount = 0
        this.allocateEpoch++

        this.logger.debug('sctp all connections cleaned')
    }
}
