import { type AddressInfo, createServer, type Server, type Socket } from 'node:net'

import { WaFakeConnection } from './WaFakeConnection'
import { createTcpSocketAdapter } from './socket-adapters'

export interface WaFakeTcpServerOptions {
    readonly host?: string
    readonly port?: number
}

export interface WaFakeTcpServerListenInfo {
    readonly host: string
    readonly port: number
    /** `tcp://host:port` – feed straight into `mobileTransport.tcpUrl`. */
    readonly url: string
}

export type WaFakeTcpServerConnectionListener = (connection: WaFakeConnection) => void

/**
 * Raw-TCP listener for the WhatsApp Mobile transport. The mobile client dials
 * `tcp://host:port` instead of upgrading to a WebSocket, but speaks the exact
 * same prologue + length-prefixed frames on top, so every layer above the
 * carrier is shared with {@link WaFakeWsServer}.
 */
export class WaFakeTcpServer {
    private readonly options: Required<WaFakeTcpServerOptions>
    private server: Server | null = null
    private connectionListener: WaFakeTcpServerConnectionListener | null = null
    private readonly sockets = new Set<Socket>()
    private nextConnectionId = 0

    public constructor(options: WaFakeTcpServerOptions = {}) {
        this.options = {
            host: options.host ?? '127.0.0.1',
            port: options.port ?? 0
        }
    }

    public onConnection(listener: WaFakeTcpServerConnectionListener): void {
        this.connectionListener = listener
    }

    public async listen(): Promise<WaFakeTcpServerListenInfo> {
        if (this.server) {
            throw new Error('fake tcp server is already listening')
        }

        const server = createServer((socket) => {
            this.sockets.add(socket)
            socket.on('close', () => this.sockets.delete(socket))
            const id = `t${this.nextConnectionId++}`
            this.connectionListener?.(new WaFakeConnection(id, createTcpSocketAdapter(socket)))
        })

        await new Promise<void>((resolve, reject) => {
            const onError = (error: Error): void => {
                server.off('listening', onListening)
                reject(error)
            }
            const onListening = (): void => {
                server.off('error', onError)
                resolve()
            }
            server.once('error', onError)
            server.once('listening', onListening)
            server.listen(this.options.port, this.options.host)
        })

        this.server = server

        const address = server.address() as AddressInfo
        return {
            host: address.address,
            port: address.port,
            url: `tcp://${address.address}:${address.port}`
        }
    }

    public async close(): Promise<void> {
        const server = this.server
        if (!server) {
            return
        }
        for (const socket of this.sockets) {
            socket.destroy()
        }
        this.sockets.clear()
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()))
        })
        this.server = null
    }
}
