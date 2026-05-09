import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import test from 'node:test'

const BIN = join(__dirname, '..', 'bin.ts')

interface JsonRpcMessage {
    readonly id?: number
    readonly result?: unknown
    readonly error?: unknown
}

const expectId = (raw: string, id: number): JsonRpcMessage => {
    const lines = raw.split('\n').filter((l) => l.trim())
    for (const line of lines) {
        let parsed: JsonRpcMessage
        try {
            parsed = JSON.parse(line)
        } catch {
            continue
        }
        if (parsed.id === id) return parsed
    }
    throw new Error(`no response with id=${id} in:\n${raw}`)
}

test('restart process_exit terminates the stdio server after responding', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', BIN], {
        env: { ...process.env, MCP_LOG_LEVEL: 'error' },
        stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdoutBuffer = ''
    child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString('utf8')
    })

    const send = (msg: unknown): void => {
        child.stdin.write(`${JSON.stringify(msg)}\n`)
    }

    try {
        send({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-06-18',
                capabilities: {},
                clientInfo: { name: 'restart-smoke', version: '0' }
            }
        })
        send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
        send({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: 'restart', arguments: { mode: 'process_exit' } }
        })

        const exitTuple = (await once(child, 'exit')) as unknown as readonly [
            number | null,
            NodeJS.Signals | null
        ]
        const [code] = exitTuple
        assert.equal(code, 0, 'process should exit cleanly')

        const restartResponse = expectId(stdoutBuffer, 2)
        assert.ok(restartResponse.result, 'restart should send a result before exiting')
        const text = (restartResponse.result as { content: { text: string }[] }).content[0].text
        const parsed = JSON.parse(text) as { mode: string; ok: boolean; note: string }
        assert.equal(parsed.ok, true)
        assert.equal(parsed.mode, 'process_exit')
        assert.match(parsed.note, /process will exit/)
    } finally {
        if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL')
        }
    }
})
