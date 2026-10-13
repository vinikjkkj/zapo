import { toBytesView } from '../bytes.js'
import { toError } from '../errors.js'
import type { Logger } from '../logger.js'
import { unrefTimer } from '../timers.js'

import {
    closeQuietly,
    type Connection,
    ConnectionState,
    type DataChannelClass,
    type RawUdpLeg,
    type RawUdpLegOptions
} from './leg.js'
import { modifySdpForRelay, readIceUfrag } from './sdp.js'
import { classifyPacket } from './stun.js'

const CONNECTION_TIMEOUT = 20000
const ICE_DISCONNECT_GRACE_MS = 4000

export interface WaRelayLegDialerOptions {
    /** The call's legs; a dial whose leg left them closes what it built. */
    readonly legs: ReadonlyMap<string, Connection>
    readonly logger: Logger
    readonly traceEnabled: boolean
    readonly createPeerConnection: (configuration: RTCConfiguration) => Promise<RTCPeerConnection>
    readonly createRawUdpLeg?: (options: RawUdpLegOptions) => RawUdpLeg
    /** The leg opened; `rawUdp` tells which transport it rides. */
    readonly onOpen: (conn: Connection, rawUdp: boolean) => void
    readonly onMessage: (data: Uint8Array, conn: Connection) => void
    readonly onFailure: (conn: Connection, reason: string) => void
    /** The leg's data channel closed. */
    readonly onClosed: (conn: Connection) => void
}

/**
 * Dials a registered leg over WebRTC (peer connection, munged SDP answer, data channels) or raw
 * UDP, and reports its open, datagrams, failure and close.
 */
export class WaRelayLegDialer {
    private readonly legs: ReadonlyMap<string, Connection>
    private readonly logger: Logger
    private readonly traceEnabled: boolean
    private readonly createPeerConnection: WaRelayLegDialerOptions['createPeerConnection']
    private readonly createRawUdpLeg: WaRelayLegDialerOptions['createRawUdpLeg']
    private readonly onOpen: WaRelayLegDialerOptions['onOpen']
    private readonly onMessage: WaRelayLegDialerOptions['onMessage']
    private readonly onFailure: WaRelayLegDialerOptions['onFailure']
    private readonly onClosed: WaRelayLegDialerOptions['onClosed']

    constructor(options: WaRelayLegDialerOptions) {
        this.legs = options.legs
        this.logger = options.logger
        this.traceEnabled = options.traceEnabled
        this.createPeerConnection = options.createPeerConnection
        this.createRawUdpLeg = options.createRawUdpLeg
        this.onOpen = options.onOpen
        this.onMessage = options.onMessage
        this.onFailure = options.onFailure
        this.onClosed = options.onClosed
    }

    /** Dials a leg that is already registered, over the configured transport. */
    async dial(conn: Connection): Promise<void> {
        const connectionId = conn.id
        const relayInfo = conn.relayInfo

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
            if (this.legs.get(connectionId) !== conn || conn.state !== ConnectionState.Connecting) {
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
                    this.onFailure(conn, 'ice_connection_failed')
                }
                if (pc.iceConnectionState === 'disconnected') {
                    const grace = setTimeout(() => {
                        conn.iceDisconnectTimers.delete(grace)
                        if (
                            conn.state !== ConnectionState.Failed &&
                            conn.state !== ConnectionState.Closed &&
                            pc.iceConnectionState === 'disconnected'
                        ) {
                            this.onFailure(conn, 'ice_disconnected_timeout')
                        }
                    }, ICE_DISCONNECT_GRACE_MS)
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
                    this.onFailure(conn, 'connection_state_failed')
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
                    this.onMessage(buffer, conn)
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
                this.onOpen(conn, false)
            }

            channel.onclose = () => {
                this.logger.debug('sctp data channel closed', { connectionId })
                this.onClosed(conn)
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
                this.onMessage(buffer, conn)
            }

            channel.onerror = () => {
                this.logger.warn('sctp data channel error', { connectionId })
                this.onFailure(conn, 'data_channel_error')
            }

            const offer = await whileDialling(pc.createOffer())
            await whileDialling(pc.setLocalDescription(offer))

            conn.localUfrag = readIceUfrag(offer.sdp!)

            const modifiedSdp = modifySdpForRelay(offer.sdp!, relayInfo)

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
            this.onFailure(conn, 'connection_error')
        } finally {
            conn.abortDial = null
        }
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
                this.onOpen(conn, true)
            },
            onMessage: (data: Uint8Array) => {
                this.onMessage(data, conn)
            },
            onFailure: (reason: string) => {
                this.onFailure(conn, reason)
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
                this.onFailure(conn, reason)
            }
        }, CONNECTION_TIMEOUT)
    }
}
