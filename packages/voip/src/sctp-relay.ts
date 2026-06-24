import { EventEmitter } from 'node:events'

import wrtc from '@roamhq/wrtc'
import { bytesToHex, TEXT_ENCODER, toBytesView } from 'zapo-js/util'

import {
    buildAllocateForRelay,
    buildBindingRequestWithSubs,
    buildSenderSubscriptions,
    buildSSRCSubscriptionList,
    buildWhatsAppPing,
    classifyPacket,
    formatStunResponse,
    parseStunResponse
} from './stun.js'

type PeerConnectionClass = RTCPeerConnection
type DataChannelClass = RTCDataChannel

const CONFIG = {
    TRUE_WEB_CLIENT_RELAY_PORT: 3480,
    CONNECTION_TIMEOUT: 20000,
    MAX_BUFFER_SIZE: 10 * 1024,
    KEEPALIVE_INTERVAL_MS: 1100,
    FIXED_FINGERPRINT:
        'sha-256 F9:CA:0C:98:A3:CC:71:D6:42:CE:5A:E2:53:D2:15:20:D3:1B:BA:D8:57:A4:F0:AF:BE:0B:FB:F3:6B:0C:A0:68'
}

enum ConnectionState {
    None = 'None',
    Connecting = 'Connecting',
    Open = 'Open',
    Closed = 'Closed',
    Failed = 'Failed'
}

interface RelayInfo {
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

interface Connection {
    state: ConnectionState
    peerConnection: PeerConnectionClass | null
    channel: DataChannelClass | null
    incomingChannels: DataChannelClass[]
    buffer: ArrayBuffer[]
    bufferedBytes: number
    id: string
    relayInfo: RelayInfo
    connectionTimeout: NodeJS.Timeout | null
    hasReceivedFirstPacket: boolean
    localUfrag: string
    stableRoutingConnId: bigint
    stats: {
        sentPackets: number
        receivedPackets: number
        sentBytes: number
        receivedBytes: number
    }
}

export class NodeSctpRelayManager extends EventEmitter {
    private connections = new Map<string, Connection>()
    private relayMap = new Map<string, RelayInfo>()
    private stats = {
        sent: 0,
        received: 0,
        connected: 0
    }
    private configuring = false
    private globalBuffer: Array<{ ip: string; port: number; data: ArrayBuffer }> = []
    private keepaliveTimers = new Map<string, NodeJS.Timeout>()
    private sdpLogged = false
    private audioSsrc = 0
    private subscriptionSsrc = 0

    setSsrc(ssrc: number): void {
        this.audioSsrc = ssrc
        console.log(`[SCTP] Our SSRC set: 0x${ssrc.toString(16).padStart(8, '0')}`)
    }

    setSubscriptionSsrc(ssrc: number): void {
        this.subscriptionSsrc = ssrc
        console.log(`[SCTP] Subscription SSRC set (peer): 0x${ssrc.toString(16).padStart(8, '0')}`)
    }

    resendSubscriptions(): void {
        for (const conn of this.connections.values()) {
            if (
                conn.state === ConnectionState.Open &&
                conn.channel &&
                conn.channel.readyState === 'open'
            ) {
                this.sendStunAllocateOnOpen(conn, conn.relayInfo)
                console.log(`[SCTP] Re-sent subscriptions to ${conn.id}`)
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

    async connectToRelay(relayInfo: RelayInfo): Promise<Connection | null> {
        const connectionId = this.makeConnectionId(
            relayInfo.ip,
            relayInfo.port,
            relayInfo.authTokenId
        )

        console.log(` [SCTP] Connecting to relay ${connectionId} (${relayInfo.name})`)

        let conn = this.connections.get(connectionId)
        if (conn && conn.state === ConnectionState.Open) {
            return conn
        }

        conn = {
            state: ConnectionState.Connecting,
            peerConnection: null,
            channel: null,
            incomingChannels: [],
            buffer: [],
            bufferedBytes: 0,
            id: connectionId,
            relayInfo,
            connectionTimeout: null,
            hasReceivedFirstPacket: false,
            localUfrag: '',
            stableRoutingConnId: 0n,
            stats: { sentPackets: 0, receivedPackets: 0, sentBytes: 0, receivedBytes: 0 }
        }

        this.connections.set(connectionId, conn)

        conn.connectionTimeout = setTimeout(() => {
            if (conn.state === ConnectionState.Connecting) {
                console.log(` [SCTP] Connection timeout: ${connectionId}`)
                this.failConnection(conn, 'connection_timeout')
            }
        }, CONFIG.CONNECTION_TIMEOUT)

        try {
            const pc = new wrtc.RTCPeerConnection({ iceServers: [] })
            conn.peerConnection = pc

            pc.oniceconnectionstatechange = () => {
                console.log(` [ICE] ${connectionId} iceConnection: ${pc.iceConnectionState}`)
                if (
                    pc.iceConnectionState === 'failed' ||
                    pc.iceConnectionState === 'disconnected'
                ) {
                    this.failConnection(conn, 'ice_connection_failed')
                }
                if (
                    pc.iceConnectionState === 'connected' ||
                    pc.iceConnectionState === 'completed'
                ) {
                    console.log(` [ICE] ${connectionId} ICE connected!`)
                    try {
                        const stats = (pc as any).getStats?.()
                        if (stats) {
                            stats.forEach((report: any) => {
                                if (
                                    report.type === 'candidate-pair' &&
                                    report.state === 'succeeded'
                                ) {
                                    console.log(
                                        ` [ICE] ${connectionId} candidate-pair: local=${report.localCandidateId} remote=${report.remoteCandidateId}`
                                    )
                                }
                            })
                        }
                    } catch {
                        /* best-effort diagnostics */
                    }
                }
            }

            pc.onconnectionstatechange = () => {
                const connState = (pc as any).connectionState
                console.log(` [PC] ${connectionId} connectionState: ${connState}`)
                if (connState === 'connected') {
                    console.log(` [PC] ${connectionId} DTLS+SCTP fully connected!`)
                }
                if (connState === 'failed') {
                    console.log(` [PC] ${connectionId} Connection FAILED (DTLS or SCTP issue)`)
                    this.failConnection(conn, 'connection_state_failed')
                }
            }

            pc.onicegatheringstatechange = () => {
                console.log(` [ICE] ${connectionId} gatheringState: ${pc.iceGatheringState}`)
            }

            pc.onsignalingstatechange = () => {
                console.log(` [PC] ${connectionId} signalingState: ${pc.signalingState}`)
            }
            ;(pc as any).ondatachannel = (event: any) => {
                const incomingChannel = event.channel as DataChannelClass
                console.log(
                    ` [SCTP] *** INCOMING DataChannel from relay: "${incomingChannel.label}" id=${incomingChannel.id} ***`
                )

                conn.incomingChannels.push(incomingChannel)
                incomingChannel.binaryType = 'arraybuffer'

                incomingChannel.onmessage = (ev: MessageEvent) => {
                    const buffer = toBytesView(ev.data)
                    console.log(
                        ` [SCTP] Data from INCOMING channel (${buffer.length}B): ${classifyPacket(buffer)}`
                    )
                    this.handleRelayMessage(buffer, relayInfo, conn)
                }

                incomingChannel.onopen = () => {
                    console.log(` [SCTP] Incoming channel "${incomingChannel.label}" opened`)
                }

                incomingChannel.onclose = () => {
                    console.log(` [SCTP] Incoming channel "${incomingChannel.label}" closed`)
                }
            }

            const channel = pc.createDataChannel('wa-web-call', {
                ordered: false
            })

            conn.channel = channel
            channel.binaryType = 'arraybuffer'

            channel.onopen = () => {
                console.log(` [SCTP] DataChannel open: ${connectionId}`)
                conn.state = ConnectionState.Open
                this.stats.connected++

                if (conn.connectionTimeout) {
                    clearTimeout(conn.connectionTimeout)
                    conn.connectionTimeout = null
                }

                this.sendStunAllocateOnOpen(conn, relayInfo)
                this.startKeepalive(connectionId, conn)
                this.drainBuffer(connectionId)
                this.emit('relay:connected', { ip: relayInfo.ip, port: relayInfo.port })
            }

            channel.onclose = () => {
                console.log(` [SCTP] DataChannel closed: ${connectionId}`)
                this.closeConnection(connectionId)
            }

            channel.onmessage = (event: MessageEvent) => {
                const buffer = toBytesView(event.data)
                if (conn.stats.receivedPackets === 0) {
                    console.log(
                        ` [SCTP] *** FIRST MESSAGE on DC from ${connectionId}: ${buffer.length}B type=${typeof event.data} ***`
                    )
                }
                this.handleRelayMessage(buffer, relayInfo, conn)
            }

            channel.onerror = (err: Event) => {
                console.log(` [SCTP] DataChannel error ${connectionId}: ${err}`)
                this.failConnection(conn, 'data_channel_error')
            }

            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)

            const localUfragMatch = offer.sdp!.match(/a=ice-ufrag:([^\r\n]+)/)
            conn.localUfrag = localUfragMatch?.[1] || ''

            const modifiedSdp = this.modifySdpForRelay(offer.sdp!, relayInfo)

            const chosenUfrag = relayInfo.authToken || relayInfo.token
            console.log(
                ` [SDP] candidate=${relayInfo.ip}:${relayInfo.port} (host) ufrag=${chosenUfrag.substring(0, 16)}... localUfrag=${conn.localUfrag} authToken=${relayInfo.rawAuthToken ? relayInfo.rawAuthToken.length + 'B' : 'none'}`
            )

            if (!this.sdpLogged) {
                this.sdpLogged = true
                console.log(` [SDP] ═══ FULL MODIFIED SDP (first relay) ═══`)
                console.log(modifiedSdp)
                console.log(` [SDP] ═══ END SDP ═══`)
            }

            await pc.setRemoteDescription({
                type: 'answer',
                sdp: modifiedSdp
            })

            console.log(` [SCTP] Relay ${connectionId} configured, waiting for ICE...`)

            return conn
        } catch (err: any) {
            console.log(` [SCTP] Error connecting to ${connectionId}: ${err.message}`)
            this.failConnection(conn, 'connection_error')
            return null
        }
    }

    private failConnection(conn: Connection, reason: string): void {
        if (!conn || conn.state === ConnectionState.Failed) return

        console.log(` [SCTP] Connection failed: ${conn.id}, reason: ${reason}`)
        conn.state = ConnectionState.Failed

        this.stopKeepalive(conn.id)
        if (conn.connectionTimeout) clearTimeout(conn.connectionTimeout)
        if (conn.channel)
            try {
                conn.channel.close()
            } catch {
                /* already closing */
            }
        for (const ch of conn.incomingChannels) {
            try {
                ch.close()
            } catch {
                /* already closing */
            }
        }
        if (conn.peerConnection)
            try {
                conn.peerConnection.close()
            } catch {
                /* already closing */
            }

        this.connections.delete(conn.id)
    }

    private bufferToArrayBuffer(buf: Uint8Array): ArrayBuffer {
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    }

    private findConnectionByIpPort(ip: string, port: number): Connection | undefined {
        for (const conn of this.connections.values()) {
            if (conn.relayInfo.ip === ip && conn.relayInfo.port === port) {
                return conn
            }
        }
        return undefined
    }

    private sendStunAllocateOnOpen(conn: Connection, relayInfo: RelayInfo): void {
        const connectionId = `${relayInfo.ip}:${relayInfo.port}`

        const remoteUfrag = relayInfo.authToken || relayInfo.token
        if (!remoteUfrag) {
            console.log(` [STUN] Registration - skipped, no ufrag: ${connectionId}`)
            return
        }

        const localUfrag = conn.localUfrag
        const hmacKey = TEXT_ENCODER.encode(relayInfo.key)

        const sendRegistration = (label: string) => {
            if (
                conn.state !== ConnectionState.Open ||
                !conn.channel ||
                conn.channel.readyState !== 'open'
            ) {
                return
            }

            const selfSsrc = this.audioSsrc
            const peerSsrc = this.subscriptionSsrc
            const ssrc = peerSsrc || selfSsrc
            if (!ssrc) {
                console.log(` [STUN] Registration(${label}) - skipped, no SSRC: ${connectionId}`)
                return
            }

            const subs = buildSenderSubscriptions(ssrc)

            if (localUfrag) {
                const username = TEXT_ENCODER.encode(`${remoteUfrag}:${localUfrag}`)
                const v1 = buildBindingRequestWithSubs(username, hmacKey, subs, true, true)
                this.sendToChannel(conn, this.bufferToArrayBuffer(v1))
                console.log(
                    ` [STUN] v1 authToken ufrag (${label}): ${v1.length}B → ${connectionId} (SSRC=0x${ssrc.toString(16)})`
                )
            }

            if (relayInfo.token && relayInfo.token !== remoteUfrag && localUfrag) {
                const username = TEXT_ENCODER.encode(`${relayInfo.token}:${localUfrag}`)
                const v2 = buildBindingRequestWithSubs(username, hmacKey, subs, true, true)
                this.sendToChannel(conn, this.bufferToArrayBuffer(v2))
                console.log(` [STUN] v2 token ufrag (${label}): ${v2.length}B → ${connectionId}`)
            }

            const v3 = buildBindingRequestWithSubs(undefined, undefined, subs, false, false)
            this.sendToChannel(conn, this.bufferToArrayBuffer(v3))
            console.log(` [STUN] v3 no-MI (${label}): ${v3.length}B → ${connectionId}`)

            if (relayInfo.rawToken && relayInfo.rawToken.length > 0) {
                const peerSsrcs = peerSsrc ? [peerSsrc] : []
                const ssrcList = buildSSRCSubscriptionList([selfSsrc], peerSsrcs, 0, 0)
                const v4 = buildAllocateForRelay(
                    relayInfo.rawToken,
                    ssrcList,
                    hmacKey,
                    relayInfo.ip,
                    relayInfo.port
                )
                this.sendToChannel(conn, this.bufferToArrayBuffer(v4))
                console.log(` [STUN] v4-alloc (${label}): ${v4.length}B → ${connectionId}`)
            }
        }

        sendRegistration('initial')
        setTimeout(() => sendRegistration('retry-50ms'), 50)
        setTimeout(() => sendRegistration('retry-150ms'), 150)
        setTimeout(() => sendRegistration('retry-500ms'), 500)
        setTimeout(() => sendRegistration('retry-3s'), 3000)
    }

    private startKeepalive(connectionId: string, conn: Connection): void {
        this.stopKeepalive(connectionId)

        const firstPing = buildWhatsAppPing()
        this.sendToChannel(conn, this.bufferToArrayBuffer(firstPing))
        console.log(` [KEEPALIVE] First ping sent to ${connectionId}`)

        let keepaliveCount = 0
        const timer = setInterval(() => {
            if (
                conn.state !== ConnectionState.Open ||
                !conn.channel ||
                conn.channel.readyState !== 'open'
            ) {
                this.stopKeepalive(connectionId)
                return
            }
            const ping = buildWhatsAppPing()
            this.sendToChannel(conn, this.bufferToArrayBuffer(ping))
            keepaliveCount++

            if (keepaliveCount % 3 === 0) {
                const pc = conn.peerConnection
                const dcState = conn.channel?.readyState || 'unknown'
                const iceState = pc?.iceConnectionState || 'unknown'
                const connState = (pc as any)?.connectionState || 'unknown'
                console.log(` [DIAG] ═══ ${connectionId} STATS ═══`)
                console.log(` [DIAG]   dc=${dcState} ice=${iceState} conn=${connState}`)
                console.log(
                    ` [DIAG]   sent: ${conn.stats.sentPackets} pkts / ${conn.stats.sentBytes}B`
                )
                console.log(
                    ` [DIAG]   recv: ${conn.stats.receivedPackets} pkts / ${conn.stats.receivedBytes}B`
                )
                console.log(` [DIAG]   pongs=${this.pongCount} rtp_recv=${this.rtpRecvCount}`)
                console.log(` [DIAG]   keepalives=${keepaliveCount} global_send=${this.sendCount}`)
                try {
                    const buffered = (conn.channel as any)?.bufferedAmount
                    if (buffered !== undefined) {
                        console.log(` [DIAG]   dc.bufferedAmount=${buffered}`)
                    }
                } catch {
                    /* best-effort diagnostics */
                }
            }
        }, CONFIG.KEEPALIVE_INTERVAL_MS)

        this.keepaliveTimers.set(connectionId, timer)
        console.log(
            ` [KEEPALIVE] Started for ${connectionId} (every ${CONFIG.KEEPALIVE_INTERVAL_MS}ms)`
        )
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

        conn.state = ConnectionState.Closed

        this.stopKeepalive(connectionId)
        if (conn.connectionTimeout) clearTimeout(conn.connectionTimeout)
        for (const ch of conn.incomingChannels) {
            try {
                ch.close()
            } catch {
                /* already closing */
            }
        }
        if (conn.peerConnection)
            try {
                conn.peerConnection.close()
            } catch {
                /* already closing */
            }

        this.stats.connected = Math.max(0, this.stats.connected - 1)
        this.connections.delete(connectionId)
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
                const buf = toBytesView(data)
                const firstByte = buf[0] || 0
                const twoBits = (firstByte & 0xc0) >> 6
                const pktType = twoBits === 0 ? 'STUN' : twoBits === 2 ? 'RTP/SRTP' : 'OTHER'
                console.log(
                    ` [SEND] #${this.sendCount} ${pktType} ${data.byteLength}B → ${conn.id} hex[0:20]: ${bytesToHex(buf.subarray(0, 20))}`
                )
            }

            return true
        } catch (err: any) {
            console.log(` [SCTP] Send error: ${err.message}`)
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
            console.log(` [RECV] *** FIRST PACKET from ${conn.id} ***`)
        }

        const shouldLog =
            conn.stats.receivedPackets <= 50 ||
            conn.stats.receivedPackets % 25 === 0 ||
            twoBits === 2 ||
            (twoBits === 0 && data.length >= 20 && !this.isPong(data))

        if (shouldLog) {
            console.log(
                ` [RECV] #${conn.stats.receivedPackets} ${pktType} ${data.length}B from ${conn.id} hex: ${hexPreview}`
            )
        }

        if (twoBits === 0) {
            const stunInfo = parseStunResponse(data)
            if (stunInfo) {
                if (stunInfo.method === 'wa-pong') {
                    this.pongCount++
                    if (this.pongCount <= 3 || this.pongCount % 20 === 0) {
                        console.log(` [PONG] #${this.pongCount} from ${conn.id} (${data.length}B)`)
                    }
                } else {
                    console.log(
                        ` [STUN] === Response from ${conn.id}: ${formatStunResponse(stunInfo)} ===`
                    )
                    console.log(` [STUN] Full hex: ${bytesToHex(data)}`)
                    if (
                        stunInfo.isSuccess &&
                        (stunInfo.method === 'binding' || stunInfo.method === 'allocate')
                    ) {
                        console.log(
                            ` [STUN] *** ${stunInfo.method.toUpperCase()} SUCCESS from relay ${conn.id} ***`
                        )
                    }
                    if (stunInfo.stableRoutingConnId && conn.stableRoutingConnId === 0n) {
                        conn.stableRoutingConnId = stunInfo.stableRoutingConnId
                        console.log(
                            ` [STUN] stable routing latched conn_id 0x${stunInfo.stableRoutingConnId.toString(16)} from ${conn.id}`
                        )
                    }
                    if (stunInfo.isError) {
                        console.log(
                            ` [STUN] *** ERROR ${stunInfo.errorCode}: ${stunInfo.errorReason || ''} ***`
                        )
                    }
                    for (const attr of stunInfo.attributes) {
                        console.log(
                            ` [STUN] attr: ${attr.typeName} (0x${attr.type.toString(16)}) ${attr.length}B = ${bytesToHex(attr.data.subarray(0, Math.min(32, attr.data.length)))}`
                        )
                    }
                }
            } else {
                console.log(
                    ` [RECV] Unparseable STUN-like: ${data.length}B hex: ${bytesToHex(data).substring(0, 80)}`
                )
            }
        }

        if (twoBits === 2) {
            this.rtpRecvCount++
            const pt = data[1] & 0x7f
            const seq = data.length >= 4 ? (data[2] << 8) | data[3] : 0
            const ssrc =
                data.length >= 12
                    ? new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(
                          8,
                          false
                      )
                    : 0
            console.log(
                ` [RTP-RECV] #${this.rtpRecvCount} PT=${pt} seq=${seq} ssrc=0x${ssrc.toString(16)} ${data.length}B from ${conn.id}`
            )
            if (this.rtpRecvCount <= 3) {
                console.log(` [RTP-RECV] Full hex: ${bytesToHex(data).substring(0, 160)}`)
            }
        }

        if (twoBits !== 0 && twoBits !== 2) {
            this.unknownRecvCount++
            console.log(
                ` [RECV] Unknown type #${this.unknownRecvCount}: 0x${firstByte.toString(16)} ${data.length}B hex: ${bytesToHex(data).substring(0, 80)}`
            )
        }

        this.emit('relay:receive', {
            ip: relayInfo.ip,
            port: relayInfo.port,
            data: new Uint8Array(data)
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
        console.log(` [SCTP] Configuring ${relays.length} relays...`)

        this.configuring = true

        for (const relay of relays) {
            const port = relay.port || CONFIG.TRUE_WEB_CLIENT_RELAY_PORT
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

        console.log(` [SCTP] ${this.relayMap.size} relays registered`)

        const connectionPromises: Array<Promise<Connection | null>> = []
        for (const [, relayInfo] of this.relayMap) {
            const connId = this.makeConnectionId(
                relayInfo.ip,
                relayInfo.port,
                relayInfo.authTokenId
            )
            if (!this.connections.has(connId)) {
                connectionPromises.push(this.connectToRelay(relayInfo))
            }
        }

        await Promise.all(connectionPromises)

        console.log(` [SCTP] Relay config done, ${this.stats.connected} connected`)

        this.configuring = false

        if (this.globalBuffer.length > 0) {
            for (const item of this.globalBuffer) {
                this.sendToRelay(item.ip, item.port, item.data)
            }
            this.globalBuffer = []
        }
    }

    sendToRelay(ip: string, port: number, data: ArrayBuffer): boolean {
        if (this.configuring) {
            this.globalBuffer.push({ ip, port, data })
            return true
        }

        const conn = this.findConnectionByIpPort(ip, port)

        if (!conn) {
            return false
        }

        if (
            conn.state === ConnectionState.Open &&
            conn.channel &&
            conn.channel.readyState === 'open'
        ) {
            if (conn.buffer.length > 0) {
                this.bufferData(conn, data)
                this.drainBuffer(conn.id)
            } else {
                return this.sendToChannel(conn, data)
            }
            return true
        } else if (conn.state === ConnectionState.Connecting) {
            this.bufferData(conn, data)
            return true
        }

        return false
    }

    private bufferData(conn: Connection, data: ArrayBuffer): void {
        while (
            conn.bufferedBytes + data.byteLength > CONFIG.MAX_BUFFER_SIZE &&
            conn.buffer.length > 0
        ) {
            const oldest = conn.buffer.shift()
            if (oldest) conn.bufferedBytes -= oldest.byteLength
        }

        conn.buffer.push(data)
        conn.bufferedBytes += data.byteLength
    }

    broadcast(data: ArrayBuffer): void {
        for (const conn of this.connections.values()) {
            if (conn.state === ConnectionState.Open && conn.channel?.readyState === 'open') {
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
        console.log(` [SCTP] Cleaning up ${this.connections.size} connections...`)

        for (const [id] of this.keepaliveTimers) {
            this.stopKeepalive(id)
        }

        for (const [, conn] of this.connections) {
            if (conn.connectionTimeout) clearTimeout(conn.connectionTimeout)
            if (conn.channel)
                try {
                    conn.channel.close()
                } catch {
                    /* already closing */
                }
            for (const ch of conn.incomingChannels) {
                try {
                    ch.close()
                } catch {
                    /* already closing */
                }
            }
            if (conn.peerConnection)
                try {
                    conn.peerConnection.close()
                } catch {
                    /* already closing */
                }
        }

        this.connections.clear()
        this.relayMap.clear()
        this.globalBuffer = []
        this.configuring = false
        this.stats.connected = 0
        this.audioSsrc = 0
        this.subscriptionSsrc = 0
        this.pongCount = 0
        this.rtpRecvCount = 0
        this.unknownRecvCount = 0
        this.sendCount = 0

        console.log(` [SCTP] All connections cleaned`)
    }
}
