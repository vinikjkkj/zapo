import assert from 'node:assert/strict'
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { resolve as resolvePath } from 'node:path'
import test from 'node:test'

import { createNoopLogger, createStore, WaClient, type WaClientEventMap } from 'zapo-js'
import { hexToBytes } from 'zapo-js/util'

const CLI_ENTRY = resolvePath(__dirname, '../bin.ts')
const PACKAGE_ROOT = resolvePath(__dirname, '../..')

interface CliExitResult {
    readonly code: number | null
    readonly stdout: string
    readonly stderr: string
}

interface RunningCli {
    readonly child: ChildProcessWithoutNullStreams
    stdoutSnapshot(): string
    stderrSnapshot(): string
    waitForStdout(predicate: (stdout: string) => boolean, label: string): Promise<string>
    writeStdinLine(line: string): void
    dispose(): Promise<void>
}

function spawnCli(args: readonly string[]): ChildProcessWithoutNullStreams {
    return spawn(process.execPath, ['--import', 'tsx', CLI_ENTRY, ...args], {
        cwd: PACKAGE_ROOT,
        stdio: 'pipe'
    })
}

function runCliUntilExit(args: readonly string[], timeoutMs = 60_000): Promise<CliExitResult> {
    return new Promise((resolve, reject) => {
        const child = spawnCli(args)
        let stdout = ''
        let stderr = ''
        const timer = setTimeout(() => {
            child.kill()
            reject(new Error(`cli did not exit within ${timeoutMs}ms\nstdout:\n${stdout}`))
        }, timeoutMs)
        child.stdout.on('data', (chunk) => {
            stdout += String(chunk)
        })
        child.stderr.on('data', (chunk) => {
            stderr += String(chunk)
        })
        child.on('error', (error) => {
            clearTimeout(timer)
            reject(error)
        })
        child.on('close', (code) => {
            clearTimeout(timer)
            resolve({ code, stdout, stderr })
        })
    })
}

function startCli(args: readonly string[], waitTimeoutMs = 60_000): RunningCli {
    const child = spawnCli(args)
    let stdout = ''
    let stderr = ''
    const stdoutWaiters = new Set<{
        readonly predicate: (stdout: string) => boolean
        readonly resolve: (stdout: string) => void
    }>()
    child.stdout.on('data', (chunk) => {
        stdout += String(chunk)
        for (const waiter of stdoutWaiters) {
            if (waiter.predicate(stdout)) {
                stdoutWaiters.delete(waiter)
                waiter.resolve(stdout)
            }
        }
    })
    child.stderr.on('data', (chunk) => {
        stderr += String(chunk)
    })
    return {
        child,
        stdoutSnapshot: () => stdout,
        stderrSnapshot: () => stderr,
        waitForStdout: (predicate, label) => {
            if (predicate(stdout)) {
                return Promise.resolve(stdout)
            }
            return new Promise((resolve, reject) => {
                const waiter = {
                    predicate,
                    resolve: (value: string) => {
                        clearTimeout(timer)
                        resolve(value)
                    }
                }
                const timer = setTimeout(() => {
                    stdoutWaiters.delete(waiter)
                    reject(
                        new Error(
                            `timed out waiting for cli stdout: ${label}\nstdout so far:\n${stdout}\nstderr so far:\n${stderr}`
                        )
                    )
                }, waitTimeoutMs)
                stdoutWaiters.add(waiter)
            })
        },
        writeStdinLine: (line) => {
            child.stdin.write(`${line}\n`)
        },
        dispose: () =>
            new Promise((resolve) => {
                if (child.exitCode !== null) {
                    resolve()
                    return
                }
                child.once('close', () => resolve())
                child.kill()
            })
    }
}

interface CliStartupJson {
    readonly url: string
    readonly host: string
    readonly port: number
    readonly path: string
    readonly noiseRootCa: { readonly serial: number; readonly publicKeyHex: string }
    readonly peers: readonly string[]
    readonly groups: readonly { readonly groupJid: string }[]
    readonly pair: string | null
}

async function waitForStartupJson(cli: RunningCli): Promise<CliStartupJson> {
    const stdout = await cli.waitForStdout(
        (value) => value.includes('{') && value.includes('\n}'),
        'startup json'
    )
    const start = stdout.indexOf('{')
    const end = stdout.indexOf('\n}', start)
    return JSON.parse(stdout.slice(start, end + 2)) as CliStartupJson
}

test('cli --help prints usage and exits 0', async () => {
    const result = await runCliUntilExit(['--help'])
    assert.equal(result.code, 0)
    assert.ok(result.stdout.includes('USAGE'))
    assert.ok(result.stdout.includes('--peer'))
    assert.ok(result.stdout.includes('--pair'))
})

test('cli rejects an unknown flag with exit code 2', async () => {
    const result = await runCliUntilExit(['--nope'])
    assert.equal(result.code, 2)
    assert.ok(result.stderr.includes('unknown flag'))
})

test('cli rejects an invalid --port with exit code 2', async () => {
    const result = await runCliUntilExit(['--port', 'not-a-port'])
    assert.equal(result.code, 2)
    assert.ok(result.stderr.includes('invalid --port'))
})

test('cli rejects a --group referencing an undeclared peer with exit code 2', async () => {
    const result = await runCliUntilExit(['--group', '123@g.us=5511888@s.whatsapp.net'])
    assert.equal(result.code, 2)
    assert.ok(result.stderr.includes('not declared via --peer'))
})

test('cli --json prints connection info with the noise root ca', async () => {
    const cli = startCli(['--json'])
    try {
        const info = await waitForStartupJson(cli)
        assert.ok(info.url.startsWith('ws://'))
        assert.equal(info.path, '/ws/chat')
        assert.ok(info.port > 0)
        assert.ok(info.url.includes(`:${info.port}`))
        assert.equal(info.noiseRootCa.serial, 0)
        assert.match(info.noiseRootCa.publicKeyHex, /^[0-9a-f]{64}$/)
        assert.deepEqual(info.peers, [])
        assert.deepEqual(info.groups, [])
        assert.equal(info.pair, null)
    } finally {
        await cli.dispose()
    }
})

test('cli banner shows pair mode off by default', async () => {
    const cli = startCli([])
    try {
        const stdout = await cli.waitForStdout(
            (value) => value.includes('@zapo-js/fake-server is up'),
            'startup banner'
        )
        assert.ok(stdout.includes('pair mode      (off'))
    } finally {
        await cli.dispose()
    }
})

test('cli --pair drives QR pairing over stdin and then creates peers and groups', async () => {
    const deviceJid = '5511999999999:1@s.whatsapp.net'
    const peerJid = '5511777777777@s.whatsapp.net'
    const groupJid = '123456789@g.us'
    const cli = startCli([
        '--json',
        '--pair',
        deviceJid,
        '--peer',
        peerJid,
        '--group',
        `${groupJid}=${peerJid}`
    ])

    let client: WaClient | null = null
    try {
        const info = await waitForStartupJson(cli)
        assert.equal(info.pair, deviceJid)

        client = new WaClient(
            {
                store: createStore({}),
                sessionId: 'cli-pair-cross-check',
                chatSocketUrls: [info.url],
                connectTimeoutMs: 60_000,
                testHooks: {
                    noiseRootCa: {
                        publicKey: hexToBytes(info.noiseRootCa.publicKeyHex),
                        serial: info.noiseRootCa.serial
                    }
                }
            },
            createNoopLogger('error')
        )

        const qrPromise = new Promise<string>((resolve) => {
            client!.once('auth_qr', (event: Parameters<WaClientEventMap['auth_qr']>[0]) => {
                resolve(event.qr)
            })
        })
        const pairedPromise = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
                () =>
                    reject(
                        new Error(
                            `auth_paired timeout\ncli stdout:\n${cli.stdoutSnapshot()}\ncli stderr:\n${cli.stderrSnapshot()}`
                        )
                    ),
                60_000
            )
            client!.once('auth_paired', () => {
                clearTimeout(timer)
                resolve()
            })
        })

        await client.connect()

        const promptPromise = cli.waitForStdout(
            (value) => value.includes('paste the QR payload'),
            'qr paste prompt'
        )
        const [qr] = await Promise.all([qrPromise, promptPromise])
        cli.writeStdinLine(qr)

        await pairedPromise
        await cli.waitForStdout(
            (value) => value.includes(`pair-success sent for ${deviceJid}`),
            'pair-success confirmation'
        )
        await cli.waitForStdout(
            (value) => value.includes(`created peer ${peerJid}`),
            'peer creation after login'
        )
        await cli.waitForStdout(
            (value) => value.includes(`created group ${groupJid}`),
            'group creation after login'
        )
    } finally {
        await client?.disconnect().catch(() => undefined)
        await cli.dispose()
    }
})
