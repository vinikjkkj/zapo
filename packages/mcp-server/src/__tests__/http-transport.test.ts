import assert from 'node:assert/strict'
import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import test from 'node:test'

const BIN = join(__dirname, '..', 'bin.ts')

const waitForPort = async (port: number, host = '127.0.0.1', timeoutMs = 10_000): Promise<void> => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(`http://${host}:${port}/healthz`).catch(() => null)
            if (res) return
        } catch {
            /* swallow */
        }
        // Try a real probe: open a TCP connection by attempting a HEAD; the server returns 405 on non-POST
        try {
            const probe = await fetch(`http://${host}:${port}/mcp`, { method: 'HEAD' })
            if (probe.status === 405 || probe.status === 404) return
        } catch {
            /* not yet listening */
        }
        await new Promise((r) => setTimeout(r, 50))
    }
    throw new Error(`port ${port} not reachable after ${timeoutMs}ms`)
}

const findFreePort = async (): Promise<number> => {
    const net = await import('node:net')
    return new Promise((resolve, reject) => {
        const server = net.createServer()
        server.unref()
        server.on('error', reject)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            if (typeof address === 'object' && address) {
                const port = address.port
                server.close(() => resolve(port))
            } else {
                reject(new Error('failed to bind'))
            }
        })
    })
}

const callMcp = async (
    url: string,
    payload: unknown,
    extraHeaders: Record<string, string> = {}
): Promise<{ status: number; body: unknown; sessionId?: string | null }> => {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            ...extraHeaders
        },
        body: JSON.stringify(payload)
    })
    const text = await res.text()
    let body: unknown
    if (text.startsWith('event:') || text.includes('\nevent:')) {
        // SSE response – parse the first data: line
        const dataLine = text.split('\n').find((l) => l.startsWith('data:'))
        body = dataLine ? JSON.parse(dataLine.slice('data:'.length).trim()) : null
    } else if (text.length > 0) {
        body = JSON.parse(text)
    } else {
        body = null
    }
    return { status: res.status, body, sessionId: res.headers.get('mcp-session-id') }
}

const startServer = async (
    port: number
): Promise<{ child: ChildProcess; stop: () => Promise<void> }> => {
    const child = spawn(process.execPath, ['--import', 'tsx', BIN], {
        env: {
            ...process.env,
            MCP_TRANSPORT: 'http',
            MCP_HTTP_PORT: String(port),
            MCP_LOG_LEVEL: 'error'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout?.on('data', () => undefined)
    child.stderr?.on('data', () => undefined)
    await waitForPort(port)
    return {
        child,
        stop: async () => {
            child.kill('SIGTERM')
            await once(child, 'exit').catch(() => undefined)
        }
    }
}

test('mcp server over http handles initialize + tools/list + tools/call', async () => {
    const port = await findFreePort()
    const { stop } = await startServer(port)
    const url = `http://127.0.0.1:${port}/mcp`
    try {
        const init = await callMcp(url, {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-06-18',
                capabilities: {},
                clientInfo: { name: 'http-smoke', version: '0' }
            }
        })
        assert.equal(init.status, 200)
        const initBody = init.body as { result?: { protocolVersion?: string } }
        assert.ok(initBody.result?.protocolVersion, 'initialize should return protocolVersion')

        const list = await callMcp(url, {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {}
        })
        assert.equal(list.status, 200)
        const listBody = list.body as { result?: { tools?: { name: string }[] } }
        const names = (listBody.result?.tools ?? []).map((t) => t.name)
        assert.ok(names.includes('call'))
        assert.ok(names.includes('lifecycle'))

        const call = await callMcp(url, {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'lifecycle', arguments: { action: 'status' } }
        })
        assert.equal(call.status, 200)
        const callBody = call.body as {
            result?: { content?: { type: string; text: string }[] }
        }
        const text = callBody.result?.content?.[0]?.text
        assert.ok(text, 'lifecycle.status should return content')
        const parsed = JSON.parse(text)
        assert.equal(parsed.config.sessionId, 'default_2')
        assert.equal(parsed.clientCreated, false)
    } finally {
        await stop()
    }
})

test('mcp server over http rejects non-POST and unknown paths', async () => {
    const port = await findFreePort()
    const { stop } = await startServer(port)
    try {
        const wrongPath = await fetch(`http://127.0.0.1:${port}/wrong`)
        assert.equal(wrongPath.status, 404)

        const wrongMethod = await fetch(`http://127.0.0.1:${port}/mcp`)
        assert.equal(wrongMethod.status, 405)
        assert.equal(wrongMethod.headers.get('allow'), 'POST')
    } finally {
        await stop()
    }
})
