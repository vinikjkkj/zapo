import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'

import type { Logger } from '@infra/log/types'
import type { RawWebSocket, WebSocketEventLike } from '@transport/types'
import { WaWebSocket } from '@transport/WaWebSocket'

interface WsServerLike {
    close(callback?: (error?: Error) => void): void
    on(event: 'connection', listener: (socket: { send(data: string): void }) => void): this
}

interface OptionalWsModule {
    readonly WebSocketServer: new (options: { readonly server: http.Server }) => WsServerLike
}

function createLogger(): Logger {
    return {
        level: 'trace',
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
    }
}

async function loadOptionalWsModule(): Promise<OptionalWsModule | null> {
    try {
        const loaded = await import('ws')
        const constructor = (
            loaded as {
                readonly WebSocketServer?: unknown
            }
        ).WebSocketServer
        if (typeof constructor !== 'function') {
            return null
        }
        return {
            WebSocketServer: constructor as OptionalWsModule['WebSocketServer']
        }
    } catch {
        return null
    }
}

async function listen(server: http.Server): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject)
            resolve()
        })
    })
}

async function closeServer(server: http.Server): Promise<void> {
    if (!server.listening) {
        return
    }
    await new Promise<void>((resolve) => {
        server.close(() => resolve())
    })
}

async function closeWsServer(server: WsServerLike): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error)
                return
            }
            resolve()
        })
    })
}

test(
    'websocket uses optional ws package when proxy agent is configured',
    { concurrency: false },
    async (context) => {
        const optionalWs = await loadOptionalWsModule()
        if (!optionalWs) {
            context.skip('optional dependency ws is unavailable in test runtime')
            return
        }

        const server = http.createServer()
        await listen(server)
        const address = server.address()
        if (!address || typeof address === 'string') {
            throw new Error('failed to resolve websocket server address')
        }

        const wsServer = new optionalWs.WebSocketServer({ server })
        wsServer.on('connection', (socket) => {
            socket.send('hello-ws-agent')
        })

        const globalWithWebSocket = globalThis as unknown as { WebSocket?: unknown }
        const originalGlobalWs = globalWithWebSocket.WebSocket
        class ThrowingGlobalWebSocket {
            public constructor() {
                throw new Error('global websocket constructor should not be used with proxy agent')
            }
        }
        globalWithWebSocket.WebSocket = ThrowingGlobalWebSocket

        const proxyAgent = new http.Agent({ keepAlive: true })
        const client = new WaWebSocket(
            {
                url: `ws://127.0.0.1:${address.port}/agent-test`,
                timeoutIntervalMs: 3_000,
                agent: proxyAgent
            },
            createLogger()
        )

        const messagePromise = new Promise<Uint8Array>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('timeout waiting websocket message'))
            }, 5_000)
            client.setHandlers({
                onMessage: (payload) => {
                    clearTimeout(timeout)
                    resolve(payload)
                },
                onError: (error) => {
                    clearTimeout(timeout)
                    reject(error)
                }
            })
        })

        context.after(async () => {
            proxyAgent.destroy()
            globalWithWebSocket.WebSocket = originalGlobalWs
            await client.close().catch(() => undefined)
            await closeWsServer(wsServer).catch(() => undefined)
            await closeServer(server)
        })

        await client.open()
        const payload = await messagePromise
        assert.equal(new TextDecoder().decode(payload), 'hello-ws-agent')
    }
)

test(
    'websocket concurrent open releases created sockets when setup fails',
    { concurrency: false },
    async (context) => {
        const globalWithWebSocket = globalThis as unknown as { WebSocket?: unknown }
        const originalGlobalWs = globalWithWebSocket.WebSocket

        class MockWebSocket implements RawWebSocket {
            public binaryType = 'arraybuffer'
            public readyState = 0
            public onopen: ((event: WebSocketEventLike) => void) | null = null
            public onclose: ((event: WebSocketEventLike) => void) | null = null
            public onerror: ((event: WebSocketEventLike) => void) | null = null
            public onmessage: ((event: WebSocketEventLike) => void) | null = null

            public constructor(url: string) {
                if (url.includes('bad-url')) {
                    throw new Error('setup failure')
                }
            }

            public close(): void {
                this.readyState = 3
            }

            public send(_data: string | ArrayBuffer | Uint8Array): void {
                return
            }
        }
        globalWithWebSocket.WebSocket = MockWebSocket

        const client = new WaWebSocket(
            {
                urls: ['ws://good.localtest/socket', 'ws://bad-url/socket'],
                timeoutIntervalMs: 500
            },
            createLogger()
        )

        context.after(async () => {
            globalWithWebSocket.WebSocket = originalGlobalWs
            await client.close().catch(() => undefined)
        })

        await assert.rejects(() => client.open(), /setup failure/)
        assert.equal(client.isConnecting(), false)
    }
)
