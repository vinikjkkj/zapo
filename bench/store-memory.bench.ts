import type { WaStoredMessageRecord } from '@store/contracts/message.store'
import { WaMessageMemoryStore } from '@store/providers/memory/message.store'
import { toError } from '@util/primitives'

import type { TimedBenchmarkResult } from './benchmark-core'
import type { TimedBenchmarkThresholdMap } from './benchmark-core'
import {
    forceGcIfAvailable,
    formatKiB,
    hasExposedGc,
    printKeyValueTable,
    printTimedBenchmarkResultsTable,
    printTimedBenchmarkValidationTable,
    readPositiveIntEnv,
    runTimedBenchmark,
    shouldFailOnBenchmarkValidationFailure,
    validateTimedBenchmarkResults
} from './benchmark-core'

type StoreBenchMode = 'all' | 'upsert' | 'get' | 'list'

interface StoreBenchConfig {
    readonly recordCount: number
    readonly threadCount: number
    readonly payloadBytes: number
    readonly batchSize: number
    readonly operationRepeats: number
    readonly listLimit: number
    readonly listQueriesPerIteration: number
    readonly warmupIterations: number
    readonly iterations: number
    readonly sampleIntervalMs: number
    readonly mode: StoreBenchMode
}

const DEFAULTS = Object.freeze({
    recordCount: 8_000,
    threadCount: 64,
    payloadBytes: 128,
    batchSize: 500,
    operationRepeats: 16,
    listLimit: 30,
    listQueriesPerIteration: 8,
    warmupIterations: 2,
    iterations: 14,
    sampleIntervalMs: 5
} as const)

const BENCH_THRESHOLDS: TimedBenchmarkThresholdMap = Object.freeze({
    message_upsert_batch: Object.freeze({
        maxAvgMs: 12,
        maxP95Ms: 30,
        minThroughputMiBs: 300,
        maxP95PeakRssDeltaMiB: 64
    }),
    message_get_batch: Object.freeze({
        maxAvgMs: 12,
        maxP95Ms: 30,
        minThroughputMiBs: 300,
        maxP95PeakRssDeltaMiB: 64
    }),
    message_list_batch: Object.freeze({
        maxAvgMs: 25,
        maxP95Ms: 50,
        minThroughputMiBs: 80,
        maxP95PeakRssDeltaMiB: 64
    })
} as const)

function readBenchModeEnv(): StoreBenchMode {
    const raw = process.env.WA_BENCH_STORE_MEMORY_MODE
    if (!raw) {
        return 'all'
    }
    if (raw === 'all' || raw === 'upsert' || raw === 'get' || raw === 'list') {
        return raw
    }
    throw new Error(`invalid WA_BENCH_STORE_MEMORY_MODE: ${raw}`)
}

function buildConfig(): StoreBenchConfig {
    return {
        recordCount: readPositiveIntEnv('WA_BENCH_STORE_MEMORY_RECORDS', DEFAULTS.recordCount),
        threadCount: readPositiveIntEnv('WA_BENCH_STORE_MEMORY_THREADS', DEFAULTS.threadCount),
        payloadBytes: readPositiveIntEnv('WA_BENCH_STORE_MEMORY_BYTES', DEFAULTS.payloadBytes),
        batchSize: readPositiveIntEnv('WA_BENCH_STORE_MEMORY_BATCH', DEFAULTS.batchSize),
        operationRepeats: readPositiveIntEnv(
            'WA_BENCH_STORE_MEMORY_REPEATS',
            DEFAULTS.operationRepeats
        ),
        listLimit: readPositiveIntEnv('WA_BENCH_STORE_MEMORY_LIST_LIMIT', DEFAULTS.listLimit),
        listQueriesPerIteration: readPositiveIntEnv(
            'WA_BENCH_STORE_MEMORY_LIST_QUERIES',
            DEFAULTS.listQueriesPerIteration
        ),
        warmupIterations: readPositiveIntEnv(
            'WA_BENCH_STORE_MEMORY_WARMUP',
            DEFAULTS.warmupIterations
        ),
        iterations: readPositiveIntEnv('WA_BENCH_STORE_MEMORY_ITERATIONS', DEFAULTS.iterations),
        sampleIntervalMs: readPositiveIntEnv(
            'WA_BENCH_STORE_MEMORY_SAMPLE_MS',
            DEFAULTS.sampleIntervalMs
        ),
        mode: readBenchModeEnv()
    }
}

function shouldRun(mode: StoreBenchMode, target: Exclude<StoreBenchMode, 'all'>): boolean {
    return mode === 'all' || mode === target
}

function buildPatternBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length)
    for (let index = 0; index < bytes.byteLength; index += 1) {
        bytes[index] = (index * 17 + 3) & 255
    }
    return bytes
}

function buildRecords(config: StoreBenchConfig): readonly WaStoredMessageRecord[] {
    const payload = buildPatternBytes(config.payloadBytes)
    const records: WaStoredMessageRecord[] = new Array(config.recordCount)

    for (let index = 0; index < config.recordCount; index += 1) {
        const threadNumber = index % config.threadCount
        records[index] = {
            id: `bench-msg-${index}`,
            threadJid: `5511888800${threadNumber}@s.whatsapp.net`,
            senderJid: `5511999900${index % 512}@s.whatsapp.net`,
            fromMe: (index & 1) === 0,
            timestampMs: 1_700_000_000_000 + index,
            plaintext: payload,
            messageBytes: payload
        }
    }

    return records
}

async function runBench(): Promise<void> {
    const config = buildConfig()
    const hasGc = hasExposedGc()
    const records = buildRecords(config)
    const threadJids = Array.from(new Set(records.map((record) => record.threadJid)))

    const store = new WaMessageMemoryStore({
        maxMessages: config.recordCount + config.batchSize + 128
    })

    const recordBytesEstimate = config.payloadBytes * 2 + 96
    const upsertBatchBytes = config.batchSize * recordBytesEstimate * config.operationRepeats
    const listBatchBytes =
        config.listQueriesPerIteration *
        config.listLimit *
        recordBytesEstimate *
        config.operationRepeats

    let upsertCursor = 0
    let getCursor = 0
    let listCursor = 0

    const runUpsertBatch = async (): Promise<void> => {
        for (let index = 0; index < config.batchSize; index += 1) {
            const record = records[(upsertCursor + index) % records.length]
            await store.upsert(record)
        }
        upsertCursor = (upsertCursor + config.batchSize) % records.length
    }

    const runGetBatch = async (): Promise<void> => {
        let foundCount = 0
        for (let index = 0; index < config.batchSize; index += 1) {
            const record = records[(getCursor + index) % records.length]
            const found = await store.getById(record.id)
            if (found) {
                foundCount += 1
            }
        }
        if (foundCount !== config.batchSize) {
            throw new Error('getById benchmark miss detected')
        }
        getCursor = (getCursor + config.batchSize) % records.length
    }

    const runListBatch = async (): Promise<void> => {
        let listedCount = 0
        for (let index = 0; index < config.listQueriesPerIteration; index += 1) {
            const threadJid = threadJids[(listCursor + index) % threadJids.length]
            const rows = await store.listByThread(threadJid, config.listLimit)
            listedCount += rows.length
        }
        if (listedCount === 0) {
            throw new Error('listByThread benchmark returned no rows')
        }
        listCursor = (listCursor + config.listQueriesPerIteration) % threadJids.length
    }

    const runUpsertIteration = async (): Promise<void> => {
        for (let repeat = 0; repeat < config.operationRepeats; repeat += 1) {
            await runUpsertBatch()
        }
    }

    const runGetIteration = async (): Promise<void> => {
        for (let repeat = 0; repeat < config.operationRepeats; repeat += 1) {
            await runGetBatch()
        }
    }

    const runListIteration = async (): Promise<void> => {
        for (let repeat = 0; repeat < config.operationRepeats; repeat += 1) {
            await runListBatch()
        }
    }

    for (const record of records) {
        await store.upsert(record)
    }

    const results: TimedBenchmarkResult[] = []

    console.log('memory store benchmark')
    printKeyValueTable('configuration', [
        ['mode', config.mode],
        ['records', String(config.recordCount)],
        ['threads', String(config.threadCount)],
        ['payload per message', `${formatKiB(config.payloadBytes)} (${config.payloadBytes} B)`],
        ['batch size', String(config.batchSize)],
        ['repeats/iteration', String(config.operationRepeats)],
        ['list limit', String(config.listLimit)],
        ['list queries/iteration', String(config.listQueriesPerIteration)],
        ['warmup', String(config.warmupIterations)],
        ['iterations', String(config.iterations)],
        ['sample interval', `${config.sampleIntervalMs} ms`],
        ['gc exposed', hasGc ? 'yes' : 'no']
    ])

    try {
        for (let warmup = 0; warmup < config.warmupIterations; warmup += 1) {
            if (shouldRun(config.mode, 'upsert')) {
                await runUpsertIteration()
            }
            if (shouldRun(config.mode, 'get')) {
                await runGetIteration()
            }
            if (shouldRun(config.mode, 'list')) {
                await runListIteration()
            }
        }

        if (shouldRun(config.mode, 'upsert')) {
            forceGcIfAvailable()
            results.push(
                await runTimedBenchmark({
                    name: 'message_upsert_batch',
                    iterations: config.iterations,
                    transferredBytes: upsertBatchBytes,
                    sampleIntervalMs: config.sampleIntervalMs,
                    operation: runUpsertIteration
                })
            )
        }

        if (shouldRun(config.mode, 'get')) {
            forceGcIfAvailable()
            results.push(
                await runTimedBenchmark({
                    name: 'message_get_batch',
                    iterations: config.iterations,
                    transferredBytes: upsertBatchBytes,
                    sampleIntervalMs: config.sampleIntervalMs,
                    operation: runGetIteration
                })
            )
        }

        if (shouldRun(config.mode, 'list')) {
            forceGcIfAvailable()
            results.push(
                await runTimedBenchmark({
                    name: 'message_list_batch',
                    iterations: config.iterations,
                    transferredBytes: listBatchBytes,
                    sampleIntervalMs: config.sampleIntervalMs,
                    operation: runListIteration
                })
            )
        }

        if (results.length > 0) {
            printTimedBenchmarkResultsTable(results)
            const validation = validateTimedBenchmarkResults(results, BENCH_THRESHOLDS)
            printTimedBenchmarkValidationTable(validation)
            if (!validation.passed && shouldFailOnBenchmarkValidationFailure()) {
                throw new Error('memory store benchmark assertions failed')
            }
        }
    } finally {
        await store.clear()
    }
}

void runBench().catch((error) => {
    const normalized = toError(error)
    console.error('memory store benchmark failed', {
        message: normalized.message,
        stack: normalized.stack
    })
    process.exitCode = 1
})
