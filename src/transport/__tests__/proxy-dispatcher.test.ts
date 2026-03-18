import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import type { Socket } from 'node:net'
import test from 'node:test'

import type { Logger } from '@infra/log/types'
import type { WaProxyDispatcher } from '@transport/types'
import { WaWebSocket } from '@transport/WaWebSocket'

interface ProxyObservations {
    fetchRequests: number
    wsUpgradeRequests: number
    wsConnectRequests: number
    fetchConnectRequests: number
}

interface ProxyServerHandle {
    readonly server: http.Server
    readonly url: string
    readonly observations: ProxyObservations
}

interface UpstreamServerHandle {
    readonly server: http.Server
    readonly url: string
}

interface OptionalUndiciModule {
    readonly ProxyAgent: new (uri: string) => WaProxyDispatcher & { close?: () => Promise<void> }
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

async function loadOptionalUndiciModule(): Promise<OptionalUndiciModule | null> {
    let moduleName = 'undici'
    try {
        const loaded = (await import(moduleName)) as { readonly ProxyAgent?: unknown }
        if (typeof loaded.ProxyAgent !== 'function') {
            return null
        }
        return {
            ProxyAgent: loaded.ProxyAgent as OptionalUndiciModule['ProxyAgent']
        }
    } catch {
        return null
    }
}

async function startUpstreamServer(): Promise<UpstreamServerHandle> {
    const server = http.createServer((request, response) => {
        if (request.url === '/proxy-fetch') {
            response.writeHead(200, { 'content-type': 'text/plain' })
            response.end('ok-proxy-fetch')
            return
        }
        response.writeHead(404)
        response.end('not-found')
    })
    await listen(server)
    const address = server.address()
    if (!address || typeof address === 'string') {
        throw new Error('failed to resolve upstream server address')
    }
    return {
        server,
        url: `http://127.0.0.1:${address.port}`
    }
}

async function startProxyServer(): Promise<ProxyServerHandle> {
    const observations: ProxyObservations = {
        fetchRequests: 0,
        wsUpgradeRequests: 0,
        wsConnectRequests: 0,
        fetchConnectRequests: 0
    }
    const server = http.createServer((request, response) => {
        observations.fetchRequests += 1

        let target: URL
        try {
            target = resolveProxyRequestTarget(request)
        } catch (error) {
            response.writeHead(400)
            response.end(
                `invalid proxy request target: ${
                    error instanceof Error ? error.message : 'unknown'
                }`
            )
            return
        }

        const upstreamRequest = http.request(
            {
                hostname: target.hostname,
                port: Number(target.port || '80'),
                method: request.method,
                path: `${target.pathname}${target.search}`,
                headers: stripProxyHeaders(request.headers)
            },
            (upstreamResponse) => {
                response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
                upstreamResponse.pipe(response)
            }
        )

        upstreamRequest.on('error', (error) => {
            response.writeHead(502)
            response.end(`proxy upstream failure: ${error.message}`)
        })

        request.pipe(upstreamRequest)
    })

    server.on('upgrade', (_request, socket) => {
        observations.wsUpgradeRequests += 1
        socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
        socket.destroy()
    })

    server.on('connect', (request, socket: Socket, head) => {
        const { host, port } = parseConnectTarget(request.url)
        if (host === 'proxy-ws.localtest') {
            observations.wsConnectRequests += 1
            socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
            socket.destroy()
            return
        }
        if (host === 'proxy-fetch.localtest') {
            observations.fetchConnectRequests += 1
        }

        const targetHost = host === 'proxy-fetch.localtest' ? '127.0.0.1' : host
        const upstreamSocket = net.connect(port, targetHost)
        upstreamSocket.once('connect', () => {
            socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
            if (head.byteLength > 0) {
                upstreamSocket.write(head)
            }
            upstreamSocket.pipe(socket)
            socket.pipe(upstreamSocket)
        })
        upstreamSocket.once('error', () => {
            socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
            socket.destroy()
        })
    })

    await listen(server)
    const address = server.address()
    if (!address || typeof address === 'string') {
        throw new Error('failed to resolve proxy server address')
    }
    return {
        server,
        url: `http://127.0.0.1:${address.port}`,
        observations
    }
}

function resolveProxyRequestTarget(request: http.IncomingMessage): URL {
    const rawUrl = request.url ?? ''
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        return new URL(rawUrl)
    }
    const host = request.headers.host
    if (!host) {
        throw new Error('missing host header')
    }
    return new URL(`http://${host}${rawUrl}`)
}

function stripProxyHeaders(headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
    const output: http.OutgoingHttpHeaders = {}
    for (const [key, value] of Object.entries(headers)) {
        if (value === undefined) {
            continue
        }
        if (key.toLowerCase() === 'proxy-connection') {
            continue
        }
        output[key] = value
    }
    return output
}

function parseConnectTarget(rawTarget: string | undefined): {
    readonly host: string
    readonly port: number
} {
    if (!rawTarget) {
        return {
            host: '127.0.0.1',
            port: 80
        }
    }
    const separatorIndex = rawTarget.lastIndexOf(':')
    if (separatorIndex <= 0 || separatorIndex === rawTarget.length - 1) {
        return {
            host: rawTarget,
            port: 80
        }
    }
    const host = rawTarget.slice(0, separatorIndex)
    const parsedPort = Number.parseInt(rawTarget.slice(separatorIndex + 1), 10)
    return {
        host,
        port: Number.isFinite(parsedPort) ? parsedPort : 80
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

test('proxy dispatcher routes fetch and ws handshake through local proxy', async (context) => {
    const undici = await loadOptionalUndiciModule()
    if (!undici) {
        context.skip('undici module unavailable in test runtime')
        return
    }

    const upstream = await startUpstreamServer()
    const proxy = await startProxyServer()
    const dispatcher = new undici.ProxyAgent(proxy.url)

    context.after(async () => {
        await dispatcher.close?.().catch(() => undefined)
        await closeServer(proxy.server)
        await closeServer(upstream.server)
    })

    const upstreamAddress = upstream.server.address()
    if (!upstreamAddress || typeof upstreamAddress === 'string') {
        throw new Error('failed to resolve upstream server address for proxy connect test')
    }
    const fetchResponse = await fetch(
        `http://proxy-fetch.localtest:${upstreamAddress.port}/proxy-fetch`,
        {
            dispatcher
        } as RequestInit
    )
    assert.equal(fetchResponse.status, 200)
    assert.equal(await fetchResponse.text(), 'ok-proxy-fetch')
    assert.ok(
        proxy.observations.fetchRequests >= 1 || proxy.observations.fetchConnectRequests >= 1,
        'expected fetch request to reach proxy server'
    )

    const ws = new WaWebSocket(
        {
            url: 'ws://proxy-ws.localtest/proxy-ws-test',
            timeoutIntervalMs: 1_000,
            dispatcher
        },
        createLogger()
    )

    await assert.rejects(() => ws.open(), /websocket connect/)
    await ws.close().catch(() => undefined)

    assert.ok(
        proxy.observations.wsUpgradeRequests > 0 || proxy.observations.wsConnectRequests > 0,
        'expected websocket handshake to reach proxy server'
    )
})
