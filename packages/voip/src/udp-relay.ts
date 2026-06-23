import { createSocket, type Socket } from 'node:dgram'
import { EventEmitter } from 'node:events'

import {
    buildAllocateForRelay,
    buildBindingRequestWithSubs,
    buildSenderSubscriptions,
    buildSSRCSubscriptionList,
    buildWhatsAppPing,
    isRtpPacket,
    isStunPacket,
    parseStunResponse
} from './stun.js'

export interface UdpRelayConfig {
    ip: string
    port: number
    rawToken: Buffer
    rawAuthToken?: Buffer
    relayKey: Buffer
    relayKeyString: string
    relayId: number
    relayName: string
    selfSsrc: number
    peerSsrcs: number[]
    selfPid?: number
    peerPid?: number
    selfVideoSsrc?: number
    peerVideoSsrcs?: number[]
    selfAuxSsrcs?: number[]
    mode?: 'allocate' | 'binding'
}

interface UdpConnection {
    socket: Socket
    config: UdpRelayConfig
    connected: boolean
    allocateSuccess: boolean
    bindingSuccess: boolean
    stableRoutingConnId: bigint
    stats: {
        sentPackets: number
        receivedPackets: number
        rtpSent: number
        rtpRecv: number
    }
}

const KEEPALIVE_INTERVAL = 1100
// Mirrors Go sendSubscriptionsToChannel: initial send + retries at these offsets.
const SUBSCRIPTION_RETRY_OFFSETS = [50, 150, 500, 3000]

export class UdpRelayTransport extends EventEmitter {
    private connections = new Map<string, UdpConnection>()
    private keepaliveTimer: ReturnType<typeof setInterval> | null = null
    private subsTimers = new Set<ReturnType<typeof setTimeout>>()
    private debug: boolean

    constructor(debug = false) {
        super()
        this.debug = debug
    }

    private makeId(ip: string, port: number): string {
        return `${ip}:${port}`
    }

    async connectAll(configs: UdpRelayConfig[]): Promise<number> {
        const uniqueConfigs = new Map<string, UdpRelayConfig>()
        for (const config of configs) {
            if (config.ip.includes(':')) continue
            const id = this.makeId(config.ip, config.port)
            if (uniqueConfigs.has(id)) continue
            uniqueConfigs.set(id, config)
        }

        console.log(
            `[UdpRelay] Connecting to ${uniqueConfigs.size} unique relays (from ${configs.length} entries)`
        )

        this.startKeepalives()

        const results = await Promise.allSettled(
            Array.from(uniqueConfigs.values()).map((c) => this.connectSingle(c))
        )

        let successCount = 0
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value) {
                successCount++
            }
        }

        console.log(`[UdpRelay] Connected: ${successCount}/${uniqueConfigs.size} relays`)
        return successCount
    }

    private connectSingle(config: UdpRelayConfig): Promise<boolean> {
        const id = this.makeId(config.ip, config.port)

        if (this.connections.has(id)) {
            return Promise.resolve(true)
        }

        return new Promise<boolean>((resolve) => {
            const socket = createSocket('udp4')

            socket.on('error', (err) => {
                console.error(`[UdpRelay] Socket error ${id}: ${err.message}`)
                try {
                    socket.close()
                } catch {}
                this.connections.delete(id)
                resolve(false)
            })

            socket.bind(0, () => {
                const localAddr = socket.address()
                console.log(
                    `[UdpRelay] Socket ${localAddr.address}:${localAddr.port} → ${id} (${config.relayName})`
                )

                const conn: UdpConnection = {
                    socket,
                    config,
                    connected: true,
                    allocateSuccess: false,
                    bindingSuccess: false,
                    stableRoutingConnId: 0n,
                    stats: { sentPackets: 0, receivedPackets: 0, rtpSent: 0, rtpRecv: 0 }
                }
                this.connections.set(id, conn)

                socket.on('message', (msg: Buffer) => {
                    conn.stats.receivedPackets++
                    this.handlePacket(conn, msg)
                })

                // Match Go onOpen: immediate subscription burst, then retries, then keepalive ping.
                this.sendSubscriptions(conn, 'initial')
                for (const offset of SUBSCRIPTION_RETRY_OFFSETS) {
                    const timer = setTimeout(() => {
                        this.subsTimers.delete(timer)
                        if (this.connections.get(id) === conn && conn.connected) {
                            this.sendSubscriptions(conn, `retry-${offset}ms`)
                        }
                    }, offset)
                    this.subsTimers.add(timer)
                }

                const firstPing = buildWhatsAppPing()
                conn.socket.send(firstPing, 0, firstPing.length, config.port, config.ip, () => {})
                conn.stats.sentPackets++

                this.emit('connected', { ip: config.ip, port: config.port })
                resolve(true)
            })
        })
    }

    // Mirrors Go (*UdpRelayTransport).sendSubscriptionsToChannel: sends 4 STUN
    // variants on a single push. Raw UDP has no localUfrag (no ICE/SDP handshake),
    // so the username variants use the raw token bytes directly.
    private sendSubscriptions(conn: UdpConnection, label: string): void {
        const cfg = conn.config
        const selfSsrc = cfg.selfSsrc
        const peerSsrcs = cfg.peerSsrcs

        let ssrc: number
        if (peerSsrcs.length > 0 && peerSsrcs[0] !== 0) {
            ssrc = peerSsrcs[0]!
        } else {
            ssrc = selfSsrc
        }
        if (!ssrc) {
            if (this.debug) {
                console.log(
                    `[UdpRelay] sendSubscriptions(${label}) skipped, no SSRC yet (${cfg.relayName})`
                )
            }
            return
        }

        const subs = buildSenderSubscriptions(ssrc)
        const hmacKey = cfg.relayKey

        const send = (variant: string, payload: Buffer) => {
            conn.socket.send(payload, 0, payload.length, cfg.port, cfg.ip, (err) => {
                if (err && this.debug) {
                    console.error(
                        `[UdpRelay] subs ${variant} (${label}) send error: ${err.message}`
                    )
                }
            })
            conn.stats.sentPackets++
        }

        // v1: authToken-preferred username (falls back to token).
        const usernameV1 =
            cfg.rawAuthToken && cfg.rawAuthToken.length > 0 ? cfg.rawAuthToken : cfg.rawToken
        if (usernameV1 && usernameV1.length > 0) {
            send('v1', buildBindingRequestWithSubs(usernameV1, hmacKey, subs, true, true))
        }

        // v2: token username, only if distinct from v1.
        if (
            cfg.rawToken &&
            cfg.rawToken.length > 0 &&
            (!usernameV1 || !cfg.rawToken.equals(usernameV1))
        ) {
            send('v2', buildBindingRequestWithSubs(cfg.rawToken, hmacKey, subs, true, true))
        }

        // v3: subscriptions only, no username / no MI / no ICE-controlling / no fingerprint.
        send('v3', buildBindingRequestWithSubs(undefined, undefined, subs, false, false))

        // v4: Allocate carrying sender-subs (raw token) + SSRC subscription list.
        const allSelfSsrcs = [selfSsrc]
        if (cfg.selfVideoSsrc) allSelfSsrcs.push(cfg.selfVideoSsrc)
        if (cfg.selfAuxSsrcs) allSelfSsrcs.push(...cfg.selfAuxSsrcs)
        const allPeerSsrcs = [...peerSsrcs]
        if (cfg.peerVideoSsrcs) allPeerSsrcs.push(...cfg.peerVideoSsrcs)

        const ssrcList = buildSSRCSubscriptionList(
            allSelfSsrcs,
            allPeerSsrcs,
            cfg.selfPid ?? 0,
            cfg.peerPid ?? 0
        )
        send('v4-alloc', buildAllocateForRelay(cfg.rawToken, ssrcList, hmacKey, cfg.ip, cfg.port))
    }

    private handlePacket(conn: UdpConnection, data: Buffer): void {
        if (isStunPacket(data) && data.length >= 20) {
            const info = parseStunResponse(data)
            if (info) {
                if (info.isSuccess && info.method === 'allocate') {
                    conn.allocateSuccess = true
                }
                if (info.isSuccess && info.method === 'binding') {
                    conn.bindingSuccess = true
                }
                if (info.isError) {
                    console.error(
                        `[UdpRelay] STUN ${info.method} ERROR ${info.errorCode}: ${info.errorReason ?? ''} (${conn.config.relayName})`
                    )
                }
                if (info.stableRoutingConnId && conn.stableRoutingConnId === 0n) {
                    conn.stableRoutingConnId = info.stableRoutingConnId
                    console.log(
                        `[UdpRelay] stable routing latched conn_id 0x${info.stableRoutingConnId.toString(16)} (${conn.config.relayName})`
                    )
                }
            }
            return
        }

        if (isRtpPacket(data)) {
            conn.stats.rtpRecv++
            this.emit('data', {
                ip: conn.config.ip,
                port: conn.config.port,
                data: new Uint8Array(data)
            })
            return
        }
    }

    send(ip: string, port: number, data: Buffer): boolean {
        const id = this.makeId(ip, port)
        const conn = this.connections.get(id)
        if (!conn?.connected) return false

        conn.socket.send(data, 0, data.length, conn.config.port, conn.config.ip, (err) => {
            if (err) {
                console.error(`[UdpRelay] Send error to ${id}: ${err.message}`)
            }
        })
        conn.stats.sentPackets++
        conn.stats.rtpSent++
        return true
    }

    private broadcastCount = 0

    broadcast(data: Buffer): void {
        this.broadcastCount++
        let sentCount = 0
        for (const conn of this.connections.values()) {
            if (conn.connected) {
                conn.socket.send(data, 0, data.length, conn.config.port, conn.config.ip, (err) => {
                    if (err && conn.stats.rtpSent <= 5) {
                        console.error(
                            `[UdpRelay] Broadcast send error to ${conn.config.relayName}: ${err.message}`
                        )
                    }
                })
                conn.stats.sentPackets++
                conn.stats.rtpSent++
                sentCount++
            }
        }

        if (this.broadcastCount <= 3 || this.broadcastCount % 500 === 0) {
            const relayInfo: string[] = []
            for (const [id, conn] of this.connections.entries()) {
                relayInfo.push(
                    `${conn.config.relayName}(${id}): connected=${conn.connected} alloc=${conn.allocateSuccess} bind=${conn.bindingSuccess} rtp_sent=${conn.stats.rtpSent} rtp_recv=${conn.stats.rtpRecv}`
                )
            }
            console.log(
                `[UdpRelay] Broadcast #${this.broadcastCount}: ${data.length}B → ${sentCount} relays | ${relayInfo.join(', ')}`
            )
        }
    }

    hasConnection(): boolean {
        for (const conn of this.connections.values()) {
            if (conn.connected) return true
        }
        return false
    }

    getConnectedCount(): number {
        let count = 0
        for (const conn of this.connections.values()) {
            if (conn.connected) count++
        }
        return count
    }

    getAllocateSuccessCount(): number {
        let count = 0
        for (const conn of this.connections.values()) {
            if (conn.allocateSuccess) count++
        }
        return count
    }

    getStats(): string {
        const parts: string[] = []
        for (const [id, conn] of this.connections.entries()) {
            parts.push(
                `${conn.config.relayName}(${id}): alloc=${conn.allocateSuccess} bind=${conn.bindingSuccess} rtp_sent=${conn.stats.rtpSent} rtp_recv=${conn.stats.rtpRecv}`
            )
        }
        return parts.join(', ')
    }

    getBindingSuccessCount(): number {
        let count = 0
        for (const conn of this.connections.values()) {
            if (conn.bindingSuccess) count++
        }
        return count
    }

    updateSubscriptions(selfSsrc: number, peerSsrcs: number[]): void {
        for (const conn of this.connections.values()) {
            conn.config.selfSsrc = selfSsrc
            conn.config.peerSsrcs = peerSsrcs
        }
        for (const conn of this.connections.values()) {
            if (!conn.connected) continue
            this.sendSubscriptions(conn, 'update')
        }
    }

    private startKeepalives(): void {
        if (this.keepaliveTimer) return

        this.keepaliveTimer = setInterval(() => {
            for (const conn of this.connections.values()) {
                if (conn.connected) {
                    const ping = buildWhatsAppPing()
                    conn.socket.send(
                        ping,
                        0,
                        ping.length,
                        conn.config.port,
                        conn.config.ip,
                        () => {}
                    )
                    conn.stats.sentPackets++
                }
            }
        }, KEEPALIVE_INTERVAL)
    }

    cleanup(): void {
        if (this.keepaliveTimer) {
            clearInterval(this.keepaliveTimer)
            this.keepaliveTimer = null
        }

        for (const timer of this.subsTimers) {
            clearTimeout(timer)
        }
        this.subsTimers.clear()

        for (const conn of this.connections.values()) {
            conn.connected = false
            try {
                conn.socket.close()
            } catch {}
        }
        this.connections.clear()
    }
}
