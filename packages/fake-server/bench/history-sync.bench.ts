/**
 * History-sync ingestion bench: measure how fast the lib processes a
 * history-sync push from a paired peer. Each scenario varies chunk
 * size (conversations × messages per conversation) and measures
 * push-to-`history_sync_chunk`-event latency + per-message ingest
 * throughput.
 *
 * Tunables:
 *   ZAPO_BENCH_HISTORY_CHUNKS    (default 5)   chunks per scenario
 *   ZAPO_BENCH_HISTORY_SCENARIOS (default "small,medium,large")
 *
 * Scenario presets (conversations × msgs/conversation):
 *   small  = 5 × 20      (100 msgs / chunk)
 *   medium = 20 × 50     (1000 msgs / chunk)
 *   large  = 50 × 100    (5000 msgs / chunk)
 *   xlarge = 100 × 200   (20000 msgs / chunk)
 *
 * Profiling flags: same as messaging.bench. With --separate-process
 * the fake server runs in a forked child and gets its own profiles.
 */

import type { WaClientEventMap } from 'zapo-js'

import {
    BenchProfiler,
    forceGcIfAvailable,
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
    teardownFixture,
    teardownRpcFixture
} from './_fixtures'
import { buildBenchStore } from './_store-factory'

interface ChunkPreset {
    readonly name: string
    readonly conversations: number
    readonly messagesPerConversation: number
}

const PRESETS: Readonly<Record<string, ChunkPreset>> = Object.freeze({
    small: { name: 'small', conversations: 5, messagesPerConversation: 20 },
    medium: { name: 'medium', conversations: 20, messagesPerConversation: 50 },
    large: { name: 'large', conversations: 50, messagesPerConversation: 100 },
    xlarge: { name: 'xlarge', conversations: 100, messagesPerConversation: 200 }
})

interface SerializedConversation {
    id: string
    name: string
    unreadCount: number
    messages: {
        id: string
        fromMe: boolean
        timestamp: number
        conversation: string
    }[]
}

function buildChunkConversationsFlat(
    preset: ChunkPreset,
    chunkIndex: number
): SerializedConversation[] {
    const conversations: SerializedConversation[] = []
    for (let c = 0; c < preset.conversations; c += 1) {
        const messages = []
        for (let m = 0; m < preset.messagesPerConversation; m += 1) {
            messages.push({
                id: `chunk-${chunkIndex}-conv-${c}-msg-${m}`,
                fromMe: m % 3 === 0,
                timestamp: 1_700_000_000 + chunkIndex * 1000 + c * 100 + m,
                conversation: `history msg c${c}-m${m} chunk${chunkIndex}`
            })
        }
        conversations.push({
            id: `5511${String(7_000_000_000 + chunkIndex * 1000 + c).padStart(10, '0')}@s.whatsapp.net`,
            name: `Chunk${chunkIndex} Conv${c}`,
            unreadCount: c % 10,
            messages
        })
    }
    return conversations
}

async function runHistoryScenarioInProcess(
    presetName: string,
    chunks: number,
    profiler: BenchProfiler
): Promise<ScenarioResult> {
    const preset = PRESETS[presetName]
    if (!preset) {
        throw new Error(`unknown preset "${presetName}"; valid: ${Object.keys(PRESETS).join(',')}`)
    }
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClient(storeFixture, {
        sessionId: `bench-history-${presetName}`,
        historyEnabled: true
    })
    const { server, client, pipeline } = fixture

    const peer = await server.createFakePeer(
        { jid: '5511888888888@s.whatsapp.net', displayName: 'Primary Device' },
        pipeline
    )

    const totalMessages = chunks * preset.conversations * preset.messagesPerConversation
    const scenarioName = `history_${presetName}`

    try {
        await profiler.beforeScenario(scenarioName)
        const result = await runScenario(
            scenarioName,
            totalMessages,
            async () => {
                let receivedChunks = 0
                const allChunksDone = new Promise<void>((resolve, reject) => {
                    const timer = setTimeout(
                        () =>
                            reject(
                                new Error(
                                    `history-sync stalled at chunk ${receivedChunks}/${chunks}`
                                )
                            ),
                        180_000
                    )
                    const listener: WaClientEventMap['history_sync_chunk'] = () => {
                        receivedChunks += 1
                        if (receivedChunks >= chunks) {
                            clearTimeout(timer)
                            client.off('history_sync_chunk', listener)
                            resolve()
                        }
                    }
                    client.on('history_sync_chunk', listener)
                })

                for (let i = 0; i < chunks; i += 1) {
                    const convs = buildChunkConversationsFlat(preset, i).map((c) => ({
                        id: c.id,
                        name: c.name,
                        unreadCount: c.unreadCount,
                        messages: c.messages.map((m) => ({
                            id: m.id,
                            fromMe: m.fromMe,
                            timestamp: m.timestamp,
                            message: { conversation: m.conversation }
                        }))
                    }))
                    await peer.sendHistorySync({
                        chunkOrder: i,
                        progress: Math.min(100, Math.round(((i + 1) / chunks) * 100)),
                        conversations: convs
                    })
                }
                await allChunksDone
            },
            'msgs'
        )
        await profiler.afterScenario(scenarioName)
        return result
    } finally {
        await teardownFixture(fixture)
        forceGcIfAvailable()
    }
}

async function runHistoryScenarioRpc(
    presetName: string,
    chunks: number,
    profiler: BenchProfiler,
    argSet: ReadonlySet<string>
): Promise<ScenarioResult> {
    const preset = PRESETS[presetName]
    if (!preset) {
        throw new Error(`unknown preset "${presetName}"; valid: ${Object.keys(PRESETS).join(',')}`)
    }
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClientViaRpc(storeFixture, {
        sessionId: `bench-history-${presetName}`,
        historyEnabled: true
    })
    const { rpc, client } = fixture
    await startServerProfilingIfRequested(rpc, profiler.options, argSet)
    await takeServerSnapshotIfRequested(rpc, `server-pre-${presetName}`, profiler.options, argSet)

    const peer = await rpc.createFakePeer({ jid: '5511888888888@s.whatsapp.net' })

    const totalMessages = chunks * preset.conversations * preset.messagesPerConversation
    const scenarioName = `history_${presetName}`

    try {
        await profiler.beforeScenario(scenarioName)
        const result = await runScenario(
            scenarioName,
            totalMessages,
            async () => {
                let receivedChunks = 0
                const allChunksDone = new Promise<void>((resolve, reject) => {
                    const timer = setTimeout(
                        () =>
                            reject(
                                new Error(
                                    `history-sync stalled at chunk ${receivedChunks}/${chunks}`
                                )
                            ),
                        180_000
                    )
                    const listener: WaClientEventMap['history_sync_chunk'] = () => {
                        receivedChunks += 1
                        if (receivedChunks >= chunks) {
                            clearTimeout(timer)
                            client.off('history_sync_chunk', listener)
                            resolve()
                        }
                    }
                    client.on('history_sync_chunk', listener)
                })

                for (let i = 0; i < chunks; i += 1) {
                    await rpc.peerSendHistorySync({
                        peerId: peer.peerId,
                        chunkOrder: i,
                        progress: Math.min(100, Math.round(((i + 1) / chunks) * 100)),
                        conversations: buildChunkConversationsFlat(preset, i)
                    })
                }
                await allChunksDone
            },
            'msgs'
        )
        await profiler.afterScenario(scenarioName)
        await takeServerSnapshotIfRequested(
            rpc,
            `server-post-${presetName}`,
            profiler.options,
            argSet
        )
        await stopServerProfilingIfRequested(rpc, profiler.options, argSet)
        return result
    } finally {
        await teardownRpcFixture(fixture)
        forceGcIfAvailable()
    }
}

async function main(): Promise<void> {
    installEmergencyStop()
    const argSet = new Set(process.argv.slice(2))
    const profiler = new BenchProfiler(readProfilerOptions(argSet))
    await profiler.start()

    const chunks = readPositiveIntEnv('ZAPO_BENCH_HISTORY_CHUNKS', 5)
    const requested = readCsvEnv('ZAPO_BENCH_HISTORY_SCENARIOS', ['small', 'medium', 'large'])
    const backendName = process.env.ZAPO_BENCH_STORE ?? 'memory'
    const separate = argSet.has('--separate-process')

    console.log('zapo-js history-sync bench')
    console.log('──────────────────────────')
    console.log(`  chunks per scenario : ${chunks}`)
    console.log(`  scenarios           : ${requested.join(', ')}`)
    console.log(`  store               : ${backendName}`)
    console.log(`  mode                : ${separate ? 'separate-process' : 'in-process'}`)
    for (const name of requested) {
        const p = PRESETS[name]
        if (!p) continue
        console.log(
            `    ${name.padEnd(8)} ${p.conversations} conversations × ${p.messagesPerConversation} msgs = ${p.conversations * p.messagesPerConversation} msgs/chunk`
        )
    }
    console.log('')

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('start').catch((err) => console.error('[snapshot]', err))
    }

    const results: ScenarioResult[] = []
    for (const presetName of requested) {
        const result = separate
            ? await runHistoryScenarioRpc(presetName, chunks, profiler, argSet)
            : await runHistoryScenarioInProcess(presetName, chunks, profiler)
        results.push(result)
        printResult(result)
    }

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('end').catch((err) => console.error('[snapshot]', err))
    }
    await profiler.stop()

    maybePrintJson(results)
}

void main().catch((err) => {
    console.error(err)
    process.exit(1)
})
