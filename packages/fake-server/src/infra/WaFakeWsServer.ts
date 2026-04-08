/**
 * WebSocket listener for the fake server.
 *
 * Wraps the `ws` package's `WebSocketServer`, generates connection ids and
 * forwards each new socket as a `WaFakeConnection` to the consumer via
 * `onConnection`.
 *
 * This file is server scaffolding, not a `/deobfuscated` mirror — see AGENTS.md §4.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { WebSocketServer } from 'ws'

import { WaFakeConnection } from './WaFakeConnection'

export interface WaFakeWsServerOptions {
    readonly host?: string
    readonly port?: number
    readonly path?: string
}

export interface WaFakeWsServerListenInfo {
    readonly host: string
    readonly port: number
    readonly path: string
    readonly url: string
}

export type WaFakeWsServerConnectionListener = (connection: WaFakeConnection) => void

export class WaFakeWsServer {
    private readonly options: Required<WaFakeWsServerOptions>
    private httpServer: Server | null = null
    private wsServer: WebSocketServer | null = null
    private connectionListener: WaFakeWsServerConnectionListener | null = null
    private nextConnectionId = 0

    public constructor(options: WaFakeWsServerOptions = {}) {
        this.options = {
            host: options.host ?? '127.0.0.1',
            port: options.port ?? 0,
            path: options.path ?? '/ws/chat'
        }
    }

    public onConnection(listener: WaFakeWsServerConnectionListener): void {
        this.connectionListener = listener
    }

    public async listen(): Promise<WaFakeWsServerListenInfo> {
        if (this.httpServer) {
            throw new Error('fake ws server is already listening')
        }

        const httpServer = createServer()
        const wsServer = new WebSocketServer({ server: httpServer, path: this.options.path })

        wsServer.on('connection', (socket) => {
            const id = `c${this.nextConnectionId++}`
            const connection = new WaFakeConnection(id, socket)
            this.connectionListener?.(connection)
        })

        await new Promise<void>((resolve, reject) => {
            const onError = (error: Error): void => {
                httpServer.off('listening', onListening)
                reject(error)
            }
            const onListening = (): void => {
                httpServer.off('error', onError)
                resolve()
            }
            httpServer.once('error', onError)
            httpServer.once('listening', onListening)
            httpServer.listen(this.options.port, this.options.host)
        })

        this.httpServer = httpServer
        this.wsServer = wsServer

        const address = httpServer.address() as AddressInfo
        return {
            host: address.address,
            port: address.port,
            path: this.options.path,
            url: `ws://${address.address}:${address.port}${this.options.path}`
        }
    }

    public async close(): Promise<void> {
        const wsServer = this.wsServer
        const httpServer = this.httpServer
        if (!wsServer || !httpServer) {
            return
        }
        for (const client of wsServer.clients) {
            client.terminate()
        }
        await new Promise<void>((resolve, reject) => {
            wsServer.close((error) => (error ? reject(error) : resolve()))
        })
        await new Promise<void>((resolve, reject) => {
            httpServer.close((error) => (error ? reject(error) : resolve()))
        })
        this.wsServer = null
        this.httpServer = null
    }
}
