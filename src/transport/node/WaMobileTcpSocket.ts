import { connect as netConnect, type Socket as NetSocket } from 'node:net'

import { WA_READY_STATES } from '@protocol/constants'
import type {
    RawWebSocket,
    RawWebSocketConstructor,
    WaRawWebSocketInit,
    WebSocketEventLike
} from '@transport/types'
import { TEXT_ENCODER } from '@util/bytes'

export class WaMobileTcpSocket implements RawWebSocket {
    public binaryType = 'arraybuffer'
    public readyState: number = WA_READY_STATES.CONNECTING
    public onopen: ((event: WebSocketEventLike) => void) | null = null
    public onclose: ((event: WebSocketEventLike) => void) | null = null
    public onerror: ((event: WebSocketEventLike) => void) | null = null
    public onmessage: ((event: WebSocketEventLike) => void) | null = null

    private readonly socket: NetSocket
    private closedCode = 1000
    private closedReason = ''
    private closedClean = true
    private forceCloseTimer: NodeJS.Timeout | null = null

    public constructor(url: string, _protocols?: unknown, _options?: WaRawWebSocketInit) {
        const { host, port } = parseTcpUrl(url)
        this.socket = netConnect({ host, port })

        this.socket.on('connect', () => {
            if (this.readyState !== WA_READY_STATES.CONNECTING) return
            this.readyState = WA_READY_STATES.OPEN
            this.onopen?.({})
        })

        this.socket.on('data', (chunk: Uint8Array) => {
            if (!this.onmessage || this.readyState !== WA_READY_STATES.OPEN) return
            const copy = new Uint8Array(chunk.byteLength)
            copy.set(chunk)
            this.onmessage({ data: copy })
        })

        this.socket.on('error', (err: Error) => {
            this.closedClean = false
            this.closedReason = err.message
            this.onerror?.({ reason: err.message })
        })

        this.socket.on('close', (hadError: boolean) => {
            this.readyState = WA_READY_STATES.CLOSED
            if (this.forceCloseTimer) {
                clearTimeout(this.forceCloseTimer)
                this.forceCloseTimer = null
            }
            if (hadError) this.closedClean = false
            this.onclose?.({
                code: this.closedCode,
                reason: this.closedReason,
                wasClean: this.closedClean
            })
        })
    }

    public send(data: string | ArrayBuffer | Uint8Array): void {
        if (this.readyState !== WA_READY_STATES.OPEN) {
            throw new Error('WaMobileTcpSocket: send() called on non-OPEN socket')
        }
        let bytes: Uint8Array
        if (typeof data === 'string') {
            bytes = TEXT_ENCODER.encode(data)
        } else if (data instanceof Uint8Array) {
            bytes = data
        } else {
            bytes = new Uint8Array(data)
        }
        this.socket.write(bytes)
    }

    public close(code?: number, reason?: string): void {
        if (this.readyState === WA_READY_STATES.CLOSED) return
        this.readyState = WA_READY_STATES.CLOSING
        this.closedCode = code ?? 1000
        this.closedReason = reason ?? ''
        this.socket.end()
        this.forceCloseTimer = setTimeout(() => {
            this.forceCloseTimer = null
            if (this.readyState !== WA_READY_STATES.CLOSED) {
                this.socket.destroy()
            }
        }, 5_000)
        this.forceCloseTimer.unref()
    }
}

function parseTcpUrl(url: string): { host: string; port: number } {
    let work = url
    if (work.startsWith('tcp://')) {
        work = work.slice('tcp://'.length)
    }
    const queryIdx = work.indexOf('?')
    if (queryIdx >= 0) {
        work = work.slice(0, queryIdx)
    }
    const slash = work.indexOf('/')
    if (slash >= 0) {
        work = work.slice(0, slash)
    }
    const colon = work.lastIndexOf(':')
    const host = colon === -1 ? work : work.slice(0, colon)
    if (host.length === 0) {
        throw new Error(`WaMobileTcpSocket: invalid host in ${JSON.stringify(url)}`)
    }
    if (colon === -1) {
        return { host, port: 443 }
    }
    const portText = work.slice(colon + 1)
    if (!/^\d+$/.test(portText)) {
        throw new Error(`WaMobileTcpSocket: invalid port in ${JSON.stringify(url)}`)
    }
    const port = Number(portText)
    if (port < 1 || port > 65_535) {
        throw new Error(`WaMobileTcpSocket: port out of range in ${JSON.stringify(url)}`)
    }
    return { host, port }
}

export const WaMobileTcpSocketCtor: RawWebSocketConstructor =
    WaMobileTcpSocket as unknown as RawWebSocketConstructor
