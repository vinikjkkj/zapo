import { connect as netConnect, type Socket as NetSocket } from 'node:net'

import { WA_READY_STATES } from '@protocol/constants'
import type {
    RawWebSocket,
    RawWebSocketConstructor,
    WaRawWebSocketInit,
    WebSocketEventLike
} from '@transport/types'
import { bytesToBase64, concatBytes, TEXT_DECODER, TEXT_ENCODER } from '@util/bytes'

/**
 * `RawWebSocket`-shaped adapter over a raw Node TCP socket. Used by the
 * mobile transport to speak the WhatsApp Mobile binary protocol over
 * `tcp://host:port` URLs.
 */
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

    public constructor(url: string, _protocols?: unknown, options?: WaRawWebSocketInit) {
        const { host, port } = parseTcpUrl(url)
        const proxy = resolveHttpProxy(options?.agent)
        this.socket = proxy
            ? netConnect({ host: proxy.hostname, port: proxy.port })
            : netConnect({ host, port })

        let tunnelReady = proxy === null
        let proxyResponse: Uint8Array = new Uint8Array(0)

        this.socket.on('connect', () => {
            if (this.readyState !== WA_READY_STATES.CONNECTING) return
            if (proxy) {
                const authority = `${host}:${port}`
                const lines = [
                    `CONNECT ${authority} HTTP/1.1`,
                    `Host: ${authority}`,
                    'Proxy-Connection: Keep-Alive'
                ]
                if (proxy.authorization) lines.push(`Proxy-Authorization: ${proxy.authorization}`)
                this.socket.write(TEXT_ENCODER.encode(`${lines.join('\r\n')}\r\n\r\n`))
                return
            }
            this.markOpen()
        })

        this.socket.on('data', (chunk: Uint8Array) => {
            if (!tunnelReady && proxy) {
                proxyResponse = concatBytes([proxyResponse, chunk])
                const headerEnd = findHttpHeaderEnd(proxyResponse)
                if (headerEnd === -1) {
                    if (proxyResponse.byteLength > 65_536) {
                        this.socket.destroy(
                            new Error('WaMobileTcpSocket: proxy response headers too large')
                        )
                    }
                    return
                }
                const statusLine = TEXT_DECODER.decode(proxyResponse.subarray(0, headerEnd)).split(
                    '\r\n'
                )[0]
                if (!/^HTTP\/1\.[01] 2\d\d(?:\s|$)/.test(statusLine)) {
                    this.socket.destroy(
                        new Error(`WaMobileTcpSocket: proxy CONNECT failed (${statusLine})`)
                    )
                    return
                }
                const remaining = proxyResponse.subarray(headerEnd + 4)
                proxyResponse = new Uint8Array(0)
                tunnelReady = true
                this.markOpen()
                if (remaining.byteLength > 0) this.emitMessage(remaining)
                return
            }
            this.emitMessage(chunk)
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

    private markOpen(): void {
        if (this.readyState !== WA_READY_STATES.CONNECTING) return
        this.readyState = WA_READY_STATES.OPEN
        this.onopen?.({})
    }

    private emitMessage(chunk: Uint8Array): void {
        if (!this.onmessage || this.readyState !== WA_READY_STATES.OPEN) return
        const copy = new Uint8Array(chunk.byteLength)
        copy.set(chunk)
        this.onmessage({ data: copy })
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

interface ResolvedHttpProxy {
    readonly hostname: string
    readonly port: number
    readonly authorization?: string
}

function resolveHttpProxy(agent: WaRawWebSocketInit['agent']): ResolvedHttpProxy | null {
    const value = (agent as unknown as { readonly proxy?: URL | string } | undefined)?.proxy
    if (value === undefined) return null
    const proxy = value instanceof URL ? value : new URL(value)
    if (proxy.protocol !== 'http:') {
        throw new Error(`WaMobileTcpSocket: unsupported proxy protocol ${proxy.protocol}`)
    }
    const username = decodeURIComponent(proxy.username)
    const password = decodeURIComponent(proxy.password)
    const authorization =
        username || password
            ? `Basic ${bytesToBase64(TEXT_ENCODER.encode(`${username}:${password}`))}`
            : undefined
    return {
        hostname: proxy.hostname,
        port: proxy.port ? Number(proxy.port) : 80,
        authorization
    }
}

function findHttpHeaderEnd(bytes: Uint8Array): number {
    for (let i = 3; i < bytes.byteLength; i += 1) {
        if (bytes[i - 3] === 13 && bytes[i - 2] === 10 && bytes[i - 1] === 13 && bytes[i] === 10) {
            return i - 3
        }
    }
    return -1
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

/** {@link RawWebSocketConstructor} alias for {@link WaMobileTcpSocket} – drop in via `WaCommsConfig.rawWebSocketConstructor`. */
export const WaMobileTcpSocketCtor: RawWebSocketConstructor = WaMobileTcpSocket
