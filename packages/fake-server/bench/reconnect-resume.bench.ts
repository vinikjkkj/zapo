/**
 * Reconnect / resume bench: pair once, then loop N reconnect cycles
 * against the SAME server + persistent store. Each cycle measures the
 * time from `client.connect()` to `connection_open` using the IK
 * (resume) handshake – the path real users hit after a transient
 * network blip or after the lib restarts.
 *
 * Each iteration creates a NEW `WaClient` instance bound to the same
 * `WaStore` (so credentials persist). For the bench we measure:
 *   - handshake completion (debug_connection_success)
 *   - full ready signal (connection_open)
 *
 * Tunables:
 *   ZAPO_BENCH_RECONNECT_ITERATIONS  (default 20)
 *
 * Profiling flags: same as messaging.bench.
 */

import type { Agent } from 'node:https'
import { performance } from 'node:perf_hooks'

import { WaClient, type WaClientEventMap, type WaStore } from 'zapo-js'

import type { FakeWaServer } from '../src/api/FakeWaServer'

import {
    BenchProfiler,
    forceGcIfAvailable,
    formatMs,
    installEmergencyStop,
    maybePrintJson,
    NOOP_LOGGER,
    printResult,
    readPositiveIntEnv,
    readProfilerOptions,
    runScenario,
    startServerProfilingIfRequested,
    stopServerProfilingIfRequested,
    takeServerSnapshotIfRequested,
    type ScenarioResult
} from './_common'
import { bringUpPairedClient, bringUpPairedClientViaRpc } from './_fixtures'
import { buildBenchStore } from './_store-factory'
import type { ServerRpc } from './server-rpc'

interface ResumeTimings {
    readonly handshakeMs: number
    readonly readyMs: number
}

function quantile(samples: readonly number[], q: number): number {
    if (samples.length === 0) return 0
    const sorted = [...samples].sort((a, b) => a - b)
    const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length))
    return sorted[idx]
}

interface ResumeServerHandle {
    readonly url: string
    readonly noiseRootCa: { publicKey: Uint8Array; serial: number }
    readonly mediaProxyAgent?: Agent | null
}

async function singleResume(
    handle: ResumeServerHandle,
    storeFixture: { store: WaStore },
    sessionId: string
): Promise<ResumeTimings> {
    // Same sessionId as the original pairing so the memory auth store
    // is shared and the lib resolves credentials → IK resume handshake
    // (not XX). With a persistent backend the sessionId scopes to the
    // same row/keyspace, achieving the same effect.
    const client = new WaClient(
        {
            store: storeFixture.store,
            sessionId,
            chatSocketUrls: [handle.url],
            connectTimeoutMs: 30_000,
            testHooks: {
                noiseRootCa: handle.noiseRootCa
            }
        },
        NOOP_LOGGER
    )

    let handshakeAt = 0
    const handshakePromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('handshake timeout')), 30_000)
        client.once('debug_connection_success', () => {
            handshakeAt = performance.now()
            clearTimeout(timer)
            resolve()
        })
    })

    let readyAt = 0
    const readyPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('ready timeout')), 30_000)
        const listener: WaClientEventMap['connection'] = (event) => {
            if (event.status !== 'open') return
            readyAt = performance.now()
            clearTimeout(timer)
            client.off('connection', listener)
            resolve()
        }
        client.on('connection', listener)
    })

    const startedAt = performance.now()
    try {
        await client.connect()
        await handshakePromise
        await readyPromise
        return {
            handshakeMs: handshakeAt - startedAt,
            readyMs: readyAt - startedAt
        }
    } finally {
        await client.disconnect().catch(() => undefined)
    }
}

async function main(): Promise<void> {
    installEmergencyStop()
    const argSet = new Set(process.argv.slice(2))
    const profiler = new BenchProfiler(readProfilerOptions(argSet))
    await profiler.start()

    const iterations = readPositiveIntEnv('ZAPO_BENCH_RECONNECT_ITERATIONS', 20)
    const backendName = process.env.ZAPO_BENCH_STORE ?? 'memory'
    const separate = argSet.has('--separate-process')

    console.log('zapo-js reconnect-resume bench')
    console.log('──────────────────────────────')
    console.log(`  iterations : ${iterations}`)
    console.log(`  store      : ${backendName}`)
    console.log(`  mode       : ${separate ? 'separate-process' : 'in-process'}`)
    console.log('')

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('start').catch((err) => console.error('[snapshot]', err))
    }

    // Initial pairing once (full XX). Subsequent iterations reuse the
    // store + sessionId and use IK (resume).
    const sharedSessionId = 'bench-resume-shared'
    const storeFixture = await buildBenchStore()

    let serverHandle: ResumeServerHandle
    let inProcServer: FakeWaServer | null = null
    let rpc: ServerRpc | null = null

    if (separate) {
        const fixture = await bringUpPairedClientViaRpc(storeFixture, {
            sessionId: sharedSessionId
        })
        rpc = fixture.rpc
        serverHandle = {
            url: rpc.serverUrl,
            noiseRootCa: rpc.noiseRootCa
        }
        await fixture.client.disconnect().catch(() => undefined)
        await startServerProfilingIfRequested(rpc, profiler.options, argSet)
        await takeServerSnapshotIfRequested(rpc, 'server-pre', profiler.options, argSet)
    } else {
        const fixture = await bringUpPairedClient(storeFixture, { sessionId: sharedSessionId })
        inProcServer = fixture.server
        serverHandle = {
            url: fixture.server.url,
            noiseRootCa: fixture.server.noiseRootCa
        }
        await fixture.client.disconnect().catch(() => undefined)
    }

    const handshakes: number[] = []
    const readys: number[] = []
    let results: ScenarioResult | null = null

    try {
        // Warm-up (excluded from medians).
        if (iterations > 1) {
            await singleResume(serverHandle, storeFixture, sharedSessionId)
            forceGcIfAvailable()
        }

        const scenarioName = 'reconnect_resume'
        await profiler.beforeScenario(scenarioName)
        results = await runScenario(
            scenarioName,
            iterations,
            async () => {
                for (let i = 0; i < iterations; i += 1) {
                    const t = await singleResume(serverHandle, storeFixture, sharedSessionId)
                    handshakes.push(t.handshakeMs)
                    readys.push(t.readyMs)
                }
            },
            'reconnects'
        )
        await profiler.afterScenario(scenarioName)
        if (rpc) {
            await takeServerSnapshotIfRequested(rpc, 'server-post', profiler.options, argSet)
            await stopServerProfilingIfRequested(rpc, profiler.options, argSet)
        }
    } finally {
        if (rpc) await rpc.stop().catch(() => undefined)
        if (inProcServer) await inProcServer.stop().catch(() => undefined)
        await storeFixture.destroy().catch(() => undefined)
    }

    if (!results) throw new Error('no results captured')
    printResult(results)

    const print = (label: string, samples: readonly number[]): void => {
        console.log(
            `  ${label.padEnd(24)}: median ${formatMs(quantile(samples, 0.5)).padStart(8)}  |  p95 ${formatMs(quantile(samples, 0.95)).padStart(8)}  |  min ${formatMs(Math.min(...samples)).padStart(8)}  |  max ${formatMs(Math.max(...samples)).padStart(8)}`
        )
    }
    console.log('Per-iteration resume timing:')
    print('connect → handshake', handshakes)
    print('connect → ready', readys)

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('end').catch((err) => console.error('[snapshot]', err))
    }
    await profiler.stop()

    maybePrintJson([results])
}

void main().catch((err) => {
    console.error(err)
    process.exit(1)
})
