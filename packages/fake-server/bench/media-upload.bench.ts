/**
 * Media-upload throughput bench: measures encrypted upload + send for
 * binary payloads of varying sizes. Exercises:
 *   - AES-CTR streaming encrypt
 *   - SHA-256 hashing (plain + encrypted bodies)
 *   - HMAC-SHA-256 (sidecar key derivation)
 *   - HTTPS upload to fake server
 *   - the message-encrypt-and-send pipeline
 *
 * Tunables:
 *   ZAPO_BENCH_MEDIA_UPLOADS  (default 20)
 *   ZAPO_BENCH_MEDIA_SIZES    (default "10240,102400,1048576,4194304")
 *                              bytes per upload, comma-separated
 *
 * Profiling flags: same as messaging.bench. With --separate-process
 * the fake server runs in a forked child and gets its own profiles.
 */

import { randomBytes } from 'node:crypto'

import {
    BenchProfiler,
    forceGcIfAvailable,
    formatBytesPerSec,
    formatFixed,
    formatMiB,
    installEmergencyStop,
    maybePrintJson,
    printResult,
    readCsvEnv,
    readPositiveIntEnv,
    readProfilerOptions,
    runScenario,
    startServerProfilingIfRequested,
    stopServerProfilingIfRequested,
    takeServerSnapshotIfRequested,
    type ScenarioResult
} from './_common'
import {
    bringUpPairedClient,
    bringUpPairedClientViaRpc,
    ensurePreKeyPool,
    teardownFixture,
    teardownRpcFixture
} from './_fixtures'
import { buildBenchStore } from './_store-factory'

function fillRandom(size: number): Uint8Array {
    return new Uint8Array(randomBytes(size).buffer)
}

interface MediaScenarioOutput {
    readonly result: ScenarioResult
    readonly totalBytes: number
    readonly throughputBytesPerSec: number
}

async function runMediaScenarioInProcess(
    sizeBytes: number,
    uploads: number,
    profiler: BenchProfiler
): Promise<MediaScenarioOutput> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClient(storeFixture, {
        sessionId: `bench-media-${sizeBytes}`
    })
    const { server, client, pipeline } = fixture
    await ensurePreKeyPool(server, pipeline, 2)

    const peerJid = '5511777777777@s.whatsapp.net'
    await server.createFakePeer({ jid: peerJid }, pipeline)

    const scenarioName = `media_${sizeBytes}B`
    const totalBytes = sizeBytes * uploads
    const buffer = fillRandom(sizeBytes)

    try {
        await profiler.beforeScenario(scenarioName)
        const result = await runScenario(
            scenarioName,
            uploads,
            async () => {
                for (let i = 0; i < uploads; i += 1) {
                    await client.message.send(peerJid, {
                        type: 'image',
                        media: buffer,
                        mimetype: 'image/jpeg',
                        caption: `media bench #${i}`
                    })
                }
            },
            'uploads'
        )
        await profiler.afterScenario(scenarioName)
        const throughputBps = result.elapsedMs > 0 ? (totalBytes / result.elapsedMs) * 1_000 : 0
        return { result, totalBytes, throughputBytesPerSec: throughputBps }
    } finally {
        await teardownFixture(fixture)
        forceGcIfAvailable()
    }
}

async function runMediaScenarioRpc(
    sizeBytes: number,
    uploads: number,
    profiler: BenchProfiler,
    argSet: ReadonlySet<string>
): Promise<MediaScenarioOutput> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClientViaRpc(storeFixture, {
        sessionId: `bench-media-${sizeBytes}`
    })
    const { rpc, client } = fixture
    await startServerProfilingIfRequested(rpc, profiler.options, argSet)
    await takeServerSnapshotIfRequested(rpc, `server-pre-${sizeBytes}B`, profiler.options, argSet)
    await rpc.ensurePreKeyPool(2)

    const peerJid = '5511777777777@s.whatsapp.net'
    await rpc.createFakePeer({ jid: peerJid })

    const scenarioName = `media_${sizeBytes}B`
    const totalBytes = sizeBytes * uploads
    const buffer = fillRandom(sizeBytes)

    try {
        await profiler.beforeScenario(scenarioName)
        const result = await runScenario(
            scenarioName,
            uploads,
            async () => {
                for (let i = 0; i < uploads; i += 1) {
                    await client.message.send(peerJid, {
                        type: 'image',
                        media: buffer,
                        mimetype: 'image/jpeg',
                        caption: `media bench #${i}`
                    })
                }
            },
            'uploads'
        )
        await profiler.afterScenario(scenarioName)
        await takeServerSnapshotIfRequested(
            rpc,
            `server-post-${sizeBytes}B`,
            profiler.options,
            argSet
        )
        await stopServerProfilingIfRequested(rpc, profiler.options, argSet)
        const throughputBps = result.elapsedMs > 0 ? (totalBytes / result.elapsedMs) * 1_000 : 0
        return { result, totalBytes, throughputBytesPerSec: throughputBps }
    } finally {
        await teardownRpcFixture(fixture)
        forceGcIfAvailable()
    }
}

function parseSizes(): readonly number[] {
    const raw = readCsvEnv('ZAPO_BENCH_MEDIA_SIZES', [
        String(10 * 1024),
        String(100 * 1024),
        String(1024 * 1024),
        String(4 * 1024 * 1024)
    ])
    return raw.map((s) => {
        const n = Number.parseInt(s, 10)
        if (!Number.isFinite(n) || n <= 0) throw new Error(`invalid size "${s}"`)
        return n
    })
}

async function main(): Promise<void> {
    installEmergencyStop()
    const argSet = new Set(process.argv.slice(2))
    const profiler = new BenchProfiler(readProfilerOptions(argSet))
    await profiler.start()

    const sizes = parseSizes()
    const uploads = readPositiveIntEnv('ZAPO_BENCH_MEDIA_UPLOADS', 20)
    const backendName = process.env.ZAPO_BENCH_STORE ?? 'memory'
    const separate = argSet.has('--separate-process')

    console.log('zapo-js media-upload bench')
    console.log('──────────────────────────')
    console.log(`  uploads per size  : ${uploads}`)
    console.log(`  sizes (bytes)     : ${sizes.map((s) => formatMiB(s)).join(', ')}`)
    console.log(`  store             : ${backendName}`)
    console.log(`  mode              : ${separate ? 'separate-process' : 'in-process'}`)
    console.log('')

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('start').catch((err) => console.error('[snapshot]', err))
    }

    const aggregated: ScenarioResult[] = []
    for (const size of sizes) {
        const { result, totalBytes, throughputBytesPerSec } = separate
            ? await runMediaScenarioRpc(size, uploads, profiler, argSet)
            : await runMediaScenarioInProcess(size, uploads, profiler)
        aggregated.push(result)
        printResult(result)
        console.log(
            `  total transferred : ${formatMiB(totalBytes)}  →  ${formatBytesPerSec(totalBytes, result.elapsedMs)}` +
                `   (${formatFixed(throughputBytesPerSec / (1024 * 1024), 2)} MiB/s)`
        )
        console.log('')
    }

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('end').catch((err) => console.error('[snapshot]', err))
    }
    await profiler.stop()

    maybePrintJson(aggregated)
}

void main().catch((err) => {
    console.error(err)
    process.exit(1)
})
