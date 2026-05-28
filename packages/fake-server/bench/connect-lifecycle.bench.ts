/**
 * Cold-start lifecycle bench: measure `new WaClient()` → `auth_paired`
 * → `connection_open` over N iterations against a FRESH server + store
 * each time. Surfaces the bootstrap cost that the steady-state
 * messaging bench amortizes away by pairing only once.
 *
 * Per-stage timing:
 *   T0  client.connect() begins
 *   T1  server sees authenticated pipeline (post handshake)
 *   T2  client emits `auth_qr` (QR string ready)
 *   T3  client emits `auth_paired` (pairing flow done)
 *   T4  client emits `connection_open` (initial sync done, ready)
 *
 * Tunables:
 *   ZAPO_BENCH_CONNECT_ITERATIONS  (default 10)
 *
 * Profiling flags: same as the messaging bench
 *   --cpu --heap --snapshot --per-scenario --snapshot-per-scenario
 *   --out-dir=<path>
 */

import { performance } from 'node:perf_hooks'

import { WaClient, type WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../src/api/FakeWaServer'
import { parsePairingQrString } from '../src/protocol/auth/pair-device'

import {
    BenchProfiler,
    forceGcIfAvailable,
    formatFixed,
    formatMs,
    installEmergencyStop,
    maybePrintJson,
    NOOP_LOGGER,
    printResult,
    readPositiveIntEnv,
    readProfilerOptions,
    runScenario,
    type ScenarioResult,
    snapshotMemory
} from './_common'
import { buildBenchStore } from './_store-factory'
import { ServerRpc } from './server-rpc'

interface StageTimings {
    readonly connectStartedAt: number
    readonly authenticatedPipelineAt: number
    readonly authQrAt: number
    readonly authPairedAt: number
    readonly connectionOpenAt: number
}

interface IterationResult {
    readonly timings: StageTimings
    readonly handshakeMs: number
    readonly qrMs: number
    readonly pairedMs: number
    readonly readyMs: number
    readonly totalMs: number
}

async function runOneIterationRpc(
    iteration: number,
    captureServerProfile: { cpu: boolean; heap: boolean; outDir: string } | null,
    serverSnapshotLabel: string | null
): Promise<IterationResult> {
    const storeFixture = await buildBenchStore()
    const rpc = new ServerRpc()
    await rpc.spawn()
    await rpc.start()
    if (captureServerProfile && (captureServerProfile.cpu || captureServerProfile.heap)) {
        await rpc.startProfiling(captureServerProfile)
    }
    if (serverSnapshotLabel && captureServerProfile) {
        await rpc
            .takeSnapshot(`server-${serverSnapshotLabel}-pre`, captureServerProfile.outDir)
            .then(
                (p) => console.log(`[server:snapshot] ${p}`),
                (err) => console.error('[server:snapshot]', err)
            )
    }

    const client = new WaClient(
        {
            store: storeFixture.store,
            sessionId: `zapo-connect-bench-rpc-${iteration}`,
            chatSocketUrls: [rpc.serverUrl],
            connectTimeoutMs: 60_000,
            proxy: {
                mediaUpload: rpc.mediaProxyAgent!,
                mediaDownload: rpc.mediaProxyAgent!
            },
            testHooks: {
                noiseRootCa: rpc.noiseRootCa
            }
        },
        NOOP_LOGGER
    )

    const meDeviceJid = '5511999999999:1@s.whatsapp.net'

    let authQrAt = 0
    client.once('auth_qr', (event: Parameters<WaClientEventMap['auth_qr']>[0]) => {
        authQrAt = performance.now()
        const parsed = parsePairingQrString(event.qr)
        rpc.sendPairingMaterial({
            advSecretKey: parsed.advSecretKey,
            identityPublicKey: parsed.identityPublicKey
        })
    })

    let authPairedAt = 0
    const pairedPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('auth_paired timeout')), 60_000)
        client.once('auth_paired', () => {
            authPairedAt = performance.now()
            clearTimeout(timer)
            resolve()
        })
    })

    let connectionOpenAt = 0
    const openPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('connection open timeout')), 60_000)
        const listener: WaClientEventMap['connection'] = (event) => {
            if (event.status !== 'open') return
            connectionOpenAt = performance.now()
            clearTimeout(timer)
            client.off('connection', listener)
            resolve()
        }
        client.on('connection', listener)
    })

    const connectStartedAt = performance.now()
    try {
        const connectPromise = client.connect()
        await rpc.waitForAuthenticatedPipeline()
        const authenticatedPipelineAt = performance.now()
        const pairPromise = rpc.runPairing(meDeviceJid)
        const waitNext = rpc.waitForNextAuthenticatedPipeline()
        await connectPromise
        await pairedPromise
        await pairPromise
        await waitNext
        await rpc.triggerPreKeyUpload()
        await openPromise

        return {
            timings: {
                connectStartedAt,
                authenticatedPipelineAt,
                authQrAt,
                authPairedAt,
                connectionOpenAt
            },
            handshakeMs: authenticatedPipelineAt - connectStartedAt,
            qrMs: authQrAt - connectStartedAt,
            pairedMs: authPairedAt - connectStartedAt,
            readyMs: connectionOpenAt - connectStartedAt,
            totalMs: connectionOpenAt - connectStartedAt
        }
    } finally {
        if (serverSnapshotLabel && captureServerProfile) {
            await rpc
                .takeSnapshot(`server-${serverSnapshotLabel}-post`, captureServerProfile.outDir)
                .then(
                    (p) => console.log(`[server:snapshot] ${p}`),
                    (err) => console.error('[server:snapshot]', err)
                )
        }
        if (captureServerProfile && (captureServerProfile.cpu || captureServerProfile.heap)) {
            const paths = await rpc
                .stopProfiling(captureServerProfile)
                .catch((): { cpuPath?: string; heapPath?: string } => ({}))
            if (paths.cpuPath) console.log(`[server:cpu iter ${iteration}] ${paths.cpuPath}`)
            if (paths.heapPath) console.log(`[server:heap iter ${iteration}] ${paths.heapPath}`)
        }
        await client.disconnect().catch(() => undefined)
        await rpc.stop().catch(() => undefined)
        await storeFixture.destroy().catch(() => undefined)
        forceGcIfAvailable()
    }
}

async function runOneIteration(iteration: number): Promise<IterationResult> {
    const storeFixture = await buildBenchStore()
    const server = await FakeWaServer.start()
    const client = new WaClient(
        {
            store: storeFixture.store,
            sessionId: `zapo-connect-bench-${iteration}`,
            chatSocketUrls: [server.url],
            connectTimeoutMs: 60_000,
            proxy: {
                mediaUpload: server.mediaProxyAgent,
                mediaDownload: server.mediaProxyAgent
            },
            testHooks: {
                noiseRootCa: server.noiseRootCa
            }
        },
        NOOP_LOGGER
    )

    const meDeviceJid = '5511999999999:1@s.whatsapp.net'

    let authQrAt = 0
    const materialPromise = new Promise<{
        readonly advSecretKey: Uint8Array
        readonly identityPublicKey: Uint8Array
    }>((resolve) => {
        client.once('auth_qr', (event: Parameters<WaClientEventMap['auth_qr']>[0]) => {
            authQrAt = performance.now()
            const parsed = parsePairingQrString(event.qr)
            resolve({
                advSecretKey: parsed.advSecretKey,
                identityPublicKey: parsed.identityPublicKey
            })
        })
    })

    let authPairedAt = 0
    const pairedPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('auth_paired timeout')), 60_000)
        client.once('auth_paired', () => {
            authPairedAt = performance.now()
            clearTimeout(timer)
            resolve()
        })
    })

    let connectionOpenAt = 0
    const openPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('connection open timeout')), 60_000)
        const listener: WaClientEventMap['connection'] = (event) => {
            if (event.status !== 'open') return
            connectionOpenAt = performance.now()
            clearTimeout(timer)
            client.off('connection', listener)
            resolve()
        }
        client.on('connection', listener)
    })

    const connectStartedAt = performance.now()
    try {
        const connectPromise = client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        const authenticatedPipelineAt = performance.now()

        await server.runPairing(pipeline, { deviceJid: meDeviceJid }, () => materialPromise)
        await connectPromise
        await pairedPromise
        const pipelineAfterPair = await server.waitForNextAuthenticatedPipeline()
        await server.triggerPreKeyUpload(pipelineAfterPair)
        await openPromise

        return {
            timings: {
                connectStartedAt,
                authenticatedPipelineAt,
                authQrAt,
                authPairedAt,
                connectionOpenAt
            },
            handshakeMs: authenticatedPipelineAt - connectStartedAt,
            qrMs: authQrAt - connectStartedAt,
            pairedMs: authPairedAt - connectStartedAt,
            readyMs: connectionOpenAt - connectStartedAt,
            totalMs: connectionOpenAt - connectStartedAt
        }
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop().catch(() => undefined)
        await storeFixture.destroy().catch(() => undefined)
        forceGcIfAvailable()
    }
}

function quantile(samples: readonly number[], q: number): number {
    if (samples.length === 0) return 0
    const sorted = [...samples].sort((a, b) => a - b)
    const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length))
    return sorted[idx]
}

function median(samples: readonly number[]): number {
    return quantile(samples, 0.5)
}

async function runConnectScenario(
    iterations: number,
    mode: 'in-process' | 'separate-process',
    serverProfileOpts: { cpu: boolean; heap: boolean; outDir: string } | null,
    serverSnapshot: boolean
): Promise<{
    result: ScenarioResult
    perStage: { name: string; median: number; p95: number; min: number; max: number }[]
}> {
    const results: IterationResult[] = []
    // Server snapshots only on first and last iteration – capturing one
    // per iteration would be wasteful (10+ snapshots of identical state).
    const runOne = (i: number): Promise<IterationResult> => {
        if (mode !== 'separate-process') return runOneIteration(i)
        const snapshotLabel = serverSnapshot
            ? i === 0
                ? 'first'
                : i === iterations - 1
                  ? 'last'
                  : null
            : null
        return runOneIterationRpc(i, serverProfileOpts, snapshotLabel)
    }

    // warm-up: 1 iteration (excluded from stats) to avoid JIT / module-init bias
    if (iterations > 1) {
        await runOne(-1)
        forceGcIfAvailable()
    }

    const scenario = await runScenario(
        'connect_lifecycle',
        iterations,
        async () => {
            for (let i = 0; i < iterations; i += 1) {
                results.push(await runOne(i))
            }
        },
        'iterations'
    )

    const handshake = results.map((r) => r.handshakeMs)
    const qr = results.map((r) => r.qrMs)
    const paired = results.map((r) => r.pairedMs)
    const ready = results.map((r) => r.readyMs)

    return {
        result: scenario,
        perStage: [
            {
                name: 'connect → handshake done',
                median: median(handshake),
                p95: quantile(handshake, 0.95),
                min: Math.min(...handshake),
                max: Math.max(...handshake)
            },
            {
                name: 'connect → QR emitted',
                median: median(qr),
                p95: quantile(qr, 0.95),
                min: Math.min(...qr),
                max: Math.max(...qr)
            },
            {
                name: 'connect → auth_paired',
                median: median(paired),
                p95: quantile(paired, 0.95),
                min: Math.min(...paired),
                max: Math.max(...paired)
            },
            {
                name: 'connect → ready',
                median: median(ready),
                p95: quantile(ready, 0.95),
                min: Math.min(...ready),
                max: Math.max(...ready)
            }
        ]
    }
}

async function main(): Promise<void> {
    installEmergencyStop()
    const argSet = new Set(process.argv.slice(2))
    const profiler = new BenchProfiler(readProfilerOptions(argSet))
    await profiler.start()

    const iterations = readPositiveIntEnv('ZAPO_BENCH_CONNECT_ITERATIONS', 10)
    const backendName = process.env.ZAPO_BENCH_STORE ?? 'memory'
    const separate = argSet.has('--separate-process')

    console.log('zapo-js connect-lifecycle bench')
    console.log('───────────────────────────────')
    console.log(`  iterations  : ${iterations}`)
    console.log(`  store       : ${backendName}`)
    console.log(`  mode        : ${separate ? 'separate-process (server per iter)' : 'in-process'}`)
    console.log('')

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('start').catch((err) => console.error('[snapshot]', err))
    }

    // Server profile (only meaningful in separate-process mode) -
    // captured per-iteration since each iter spawns a new child.
    const serverProfileOpts =
        separate &&
        !argSet.has('--no-server-prof') &&
        (profiler.options.cpu || profiler.options.heap)
            ? {
                  cpu: profiler.options.cpu,
                  heap: profiler.options.heap,
                  outDir: profiler.options.outDir
              }
            : null

    const { result, perStage } = await runConnectScenario(
        iterations,
        separate ? 'separate-process' : 'in-process',
        serverProfileOpts,
        separate && argSet.has('--snapshot')
    )

    // Memory before / after the whole bench
    const memNow = snapshotMemory()
    printResult(result)

    console.log('Per-stage timing (median / p95 / min / max):')
    for (const s of perStage) {
        console.log(
            `  ${s.name.padEnd(28)}: ${formatMs(s.median).padStart(10)}  /  ${formatMs(s.p95).padStart(10)}  /  ${formatMs(s.min).padStart(10)}  /  ${formatMs(s.max).padStart(10)}`
        )
    }
    console.log(
        `  final RSS / heap: ${formatFixed(memNow.rss / 1_048_576, 1)} MiB / ${formatFixed(memNow.heap / 1_048_576, 1)} MiB`
    )
    console.log('')

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('end').catch((err) => console.error('[snapshot]', err))
    }
    await profiler.stop()

    maybePrintJson([result])
}

void main().catch((err) => {
    console.error(err)
    process.exit(1)
})
