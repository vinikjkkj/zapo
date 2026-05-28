/**
 * Receipts-flood bench: server pushes N `<receipt/>` stanzas in a
 * tight burst; we measure how fast the lib parses, dedups via the
 * retry tracker, emits `receipt`, and acks. Exercises the IQ ack path
 * + event dispatch + retry-tracker map under sustained inbound load.
 *
 * Tunables:
 *   ZAPO_BENCH_RECEIPTS      (default 5000)
 *   ZAPO_BENCH_RECEIPT_TYPES (default "delivery,read") types to cycle
 *
 * Profiling flags: same as messaging.bench. With --separate-process
 * the fake server runs in a forked child and gets its own profiles.
 */

import type { WaClientEventMap } from 'zapo-js'

import { buildReceipt, type FakeReceiptType } from '../src/protocol/push/receipt'

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

const ALLOWED_TYPES = new Set<FakeReceiptType>(['delivery', 'read', 'played', 'retry'])

interface ReceiptInput {
    id: string
    from: string
    type?: FakeReceiptType
    t?: number
}

function buildReceiptInputs(
    count: number,
    peerJid: string,
    types: readonly FakeReceiptType[]
): ReceiptInput[] {
    const out: ReceiptInput[] = new Array(count)
    const nowSec = Math.floor(Date.now() / 1_000)
    for (let i = 0; i < count; i += 1) {
        out[i] = {
            id: `bench-receipt-${i}`,
            from: peerJid,
            type: types[i % types.length],
            t: nowSec
        }
    }
    return out
}

async function runReceiptsScenarioInProcess(
    totalReceipts: number,
    types: readonly FakeReceiptType[],
    profiler: BenchProfiler
): Promise<ScenarioResult> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClient(storeFixture, { sessionId: 'bench-receipts' })
    const { client, pipeline } = fixture
    const peerJid = '5511777777777@s.whatsapp.net'

    try {
        let received = 0
        const allDone = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error(`receipts stalled at ${received}/${totalReceipts}`)),
                120_000
            )
            const listener: WaClientEventMap['receipt'] = () => {
                received += 1
                if (received >= totalReceipts) {
                    clearTimeout(timer)
                    client.off('receipt', listener)
                    resolve()
                }
            }
            client.on('receipt', listener)
        })

        const inputs = buildReceiptInputs(totalReceipts, peerJid, types)
        const scenarioName = 'receipts_flood'
        await profiler.beforeScenario(scenarioName)
        const result = await runScenario(
            scenarioName,
            totalReceipts,
            async () => {
                for (let i = 0; i < inputs.length; i += 1) {
                    await pipeline.sendStanza(buildReceipt(inputs[i]))
                }
                await allDone
            },
            'receipts'
        )
        await profiler.afterScenario(scenarioName)
        return result
    } finally {
        await teardownFixture(fixture)
        forceGcIfAvailable()
    }
}

async function runReceiptsScenarioRpc(
    totalReceipts: number,
    types: readonly FakeReceiptType[],
    profiler: BenchProfiler,
    argSet: ReadonlySet<string>
): Promise<ScenarioResult> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClientViaRpc(storeFixture, { sessionId: 'bench-receipts' })
    const { rpc, client } = fixture
    await startServerProfilingIfRequested(rpc, profiler.options, argSet)
    await takeServerSnapshotIfRequested(rpc, 'server-pre', profiler.options, argSet)
    const peerJid = '5511777777777@s.whatsapp.net'

    try {
        let received = 0
        const allDone = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error(`receipts stalled at ${received}/${totalReceipts}`)),
                120_000
            )
            const listener: WaClientEventMap['receipt'] = () => {
                received += 1
                if (received >= totalReceipts) {
                    clearTimeout(timer)
                    client.off('receipt', listener)
                    resolve()
                }
            }
            client.on('receipt', listener)
        })

        const inputs = buildReceiptInputs(totalReceipts, peerJid, types)
        const scenarioName = 'receipts_flood'
        await profiler.beforeScenario(scenarioName)
        // Batch IPC: ship all receipts in 1 RPC call (avoid one-IPC-per-receipt
        // overhead that would dominate at high N).
        const result = await runScenario(
            scenarioName,
            totalReceipts,
            async () => {
                await rpc.pipelineSendReceiptBatch(inputs)
                await allDone
            },
            'receipts'
        )
        await profiler.afterScenario(scenarioName)
        await takeServerSnapshotIfRequested(rpc, 'server-post', profiler.options, argSet)
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

    const totalReceipts = readPositiveIntEnv('ZAPO_BENCH_RECEIPTS', 5_000)
    const typesRaw = readCsvEnv('ZAPO_BENCH_RECEIPT_TYPES', ['delivery', 'read'])
    const types: FakeReceiptType[] = []
    for (const t of typesRaw) {
        if (!ALLOWED_TYPES.has(t as FakeReceiptType)) {
            throw new Error(`unknown receipt type "${t}"; valid: ${[...ALLOWED_TYPES].join(',')}`)
        }
        types.push(t as FakeReceiptType)
    }
    const backendName = process.env.ZAPO_BENCH_STORE ?? 'memory'
    const separate = argSet.has('--separate-process')

    console.log('zapo-js receipts-flood bench')
    console.log('────────────────────────────')
    console.log(`  receipts : ${totalReceipts}`)
    console.log(`  types    : ${types.join(', ')}`)
    console.log(`  store    : ${backendName}`)
    console.log(`  mode     : ${separate ? 'separate-process' : 'in-process'}`)
    console.log('')

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('start').catch((err) => console.error('[snapshot]', err))
    }

    const result = separate
        ? await runReceiptsScenarioRpc(totalReceipts, types, profiler, argSet)
        : await runReceiptsScenarioInProcess(totalReceipts, types, profiler)
    printResult(result)

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
