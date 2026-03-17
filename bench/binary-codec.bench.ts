import assert from 'node:assert/strict'

import {
    decodeBinaryNode,
    decodeBinaryNodeStanza,
    encodeBinaryNode,
    encodeBinaryNodeStanza
} from '@transport/binary'
import type { BinaryNode } from '@transport/types'
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

type BinaryBenchMode = 'all' | 'encode' | 'decode' | 'stanza_encode' | 'stanza_decode' | 'roundtrip'

interface BinaryBenchConfig {
    readonly payloadBytes: number
    readonly operationsPerIteration: number
    readonly warmupIterations: number
    readonly iterations: number
    readonly sampleIntervalMs: number
    readonly mode: BinaryBenchMode
}

const DEFAULTS = Object.freeze({
    payloadBytes: 32_768,
    operationsPerIteration: 256,
    warmupIterations: 2,
    iterations: 24,
    sampleIntervalMs: 5
} as const)

const BENCH_THRESHOLDS: TimedBenchmarkThresholdMap = Object.freeze({
    encode_node: Object.freeze({
        maxAvgMs: 40,
        maxP95Ms: 80,
        minThroughputMiBs: 200,
        maxP95PeakRssDeltaMiB: 128
    }),
    decode_node: Object.freeze({
        maxAvgMs: 30,
        maxP95Ms: 80,
        minThroughputMiBs: 600,
        maxP95PeakRssDeltaMiB: 64
    }),
    encode_stanza: Object.freeze({
        maxAvgMs: 60,
        maxP95Ms: 120,
        minThroughputMiBs: 160,
        maxP95PeakRssDeltaMiB: 128
    }),
    decode_stanza: Object.freeze({
        maxAvgMs: 40,
        maxP95Ms: 100,
        minThroughputMiBs: 600,
        maxP95PeakRssDeltaMiB: 64
    }),
    roundtrip_node: Object.freeze({
        maxAvgMs: 50,
        maxP95Ms: 100,
        minThroughputMiBs: 400,
        maxP95PeakRssDeltaMiB: 128
    })
} as const)

function readBenchModeEnv(): BinaryBenchMode {
    const raw = process.env.WA_BENCH_BINARY_MODE
    if (!raw) {
        return 'all'
    }
    if (
        raw === 'all' ||
        raw === 'encode' ||
        raw === 'decode' ||
        raw === 'stanza_encode' ||
        raw === 'stanza_decode' ||
        raw === 'roundtrip'
    ) {
        return raw
    }
    throw new Error(`invalid WA_BENCH_BINARY_MODE: ${raw}`)
}

function buildConfig(): BinaryBenchConfig {
    return {
        payloadBytes: readPositiveIntEnv('WA_BENCH_BINARY_BYTES', DEFAULTS.payloadBytes),
        operationsPerIteration: readPositiveIntEnv(
            'WA_BENCH_BINARY_OPS',
            DEFAULTS.operationsPerIteration
        ),
        warmupIterations: readPositiveIntEnv('WA_BENCH_BINARY_WARMUP', DEFAULTS.warmupIterations),
        iterations: readPositiveIntEnv('WA_BENCH_BINARY_ITERATIONS', DEFAULTS.iterations),
        sampleIntervalMs: readPositiveIntEnv(
            'WA_BENCH_BINARY_SAMPLE_MS',
            DEFAULTS.sampleIntervalMs
        ),
        mode: readBenchModeEnv()
    }
}

function shouldRun(mode: BinaryBenchMode, target: Exclude<BinaryBenchMode, 'all'>): boolean {
    return mode === 'all' || mode === target
}

function buildPatternBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length)
    for (let index = 0; index < bytes.byteLength; index += 1) {
        bytes[index] = index & 255
    }
    return bytes
}

function buildSampleNode(payload: Uint8Array): BinaryNode {
    return {
        tag: 'message',
        attrs: {
            id: 'bench-msg-1',
            to: '5511999999999@s.whatsapp.net',
            type: 'text'
        },
        content: [
            {
                tag: 'enc',
                attrs: { v: '2', type: 'msg' },
                content: payload
            },
            {
                tag: 'participants',
                attrs: {},
                content: [
                    {
                        tag: 'to',
                        attrs: { jid: '5511999999999:1@s.whatsapp.net' },
                        content: undefined
                    },
                    {
                        tag: 'to',
                        attrs: { jid: '5511999999999:2@s.whatsapp.net' },
                        content: undefined
                    }
                ]
            },
            {
                tag: 'meta',
                attrs: { source: 'bench' },
                content: undefined
            }
        ]
    }
}

async function runBench(): Promise<void> {
    const config = buildConfig()
    const hasGc = hasExposedGc()

    const payload = buildPatternBytes(config.payloadBytes)
    const sourceNode = buildSampleNode(payload)
    const encodedNode = encodeBinaryNode(sourceNode)
    const encodedStanza = encodeBinaryNodeStanza(sourceNode)

    const decodedNode = decodeBinaryNode(encodedNode)
    assert.equal(decodedNode.tag, sourceNode.tag)
    const decodedStanza = await decodeBinaryNodeStanza(encodedStanza)
    assert.equal(decodedStanza.tag, sourceNode.tag)

    const results: TimedBenchmarkResult[] = []

    const runEncodeOps = async (): Promise<void> => {
        for (let operation = 0; operation < config.operationsPerIteration; operation += 1) {
            const encoded = encodeBinaryNode(sourceNode)
            if (encoded.byteLength !== encodedNode.byteLength) {
                throw new Error('encode size mismatch')
            }
        }
    }

    const runDecodeOps = async (): Promise<void> => {
        for (let operation = 0; operation < config.operationsPerIteration; operation += 1) {
            const decoded = decodeBinaryNode(encodedNode)
            if (decoded.tag !== sourceNode.tag) {
                throw new Error('decode mismatch')
            }
        }
    }

    const runStanzaEncodeOps = async (): Promise<void> => {
        for (let operation = 0; operation < config.operationsPerIteration; operation += 1) {
            const stanza = encodeBinaryNodeStanza(sourceNode)
            if (stanza[0] !== 0) {
                throw new Error('stanza frame mismatch')
            }
        }
    }

    const runStanzaDecodeOps = async (): Promise<void> => {
        for (let operation = 0; operation < config.operationsPerIteration; operation += 1) {
            const decoded = await decodeBinaryNodeStanza(encodedStanza)
            if (decoded.tag !== sourceNode.tag) {
                throw new Error('stanza decode mismatch')
            }
        }
    }

    const runRoundtripOps = async (): Promise<void> => {
        for (let operation = 0; operation < config.operationsPerIteration; operation += 1) {
            const decoded = decodeBinaryNode(encodeBinaryNode(sourceNode))
            if (decoded.tag !== sourceNode.tag) {
                throw new Error('roundtrip mismatch')
            }
        }
    }

    console.log('binary codec benchmark')
    printKeyValueTable('configuration', [
        ['mode', config.mode],
        ['payload', `${formatKiB(config.payloadBytes)} (${config.payloadBytes} B)`],
        ['ops/iteration', String(config.operationsPerIteration)],
        ['encoded node', `${formatKiB(encodedNode.byteLength)} (${encodedNode.byteLength} B)`],
        [
            'encoded stanza',
            `${formatKiB(encodedStanza.byteLength)} (${encodedStanza.byteLength} B)`
        ],
        ['warmup', String(config.warmupIterations)],
        ['iterations', String(config.iterations)],
        ['sample interval', `${config.sampleIntervalMs} ms`],
        ['gc exposed', hasGc ? 'yes' : 'no']
    ])

    for (let warmup = 0; warmup < config.warmupIterations; warmup += 1) {
        if (shouldRun(config.mode, 'encode')) {
            await runEncodeOps()
        }

        if (shouldRun(config.mode, 'decode')) {
            await runDecodeOps()
        }

        if (shouldRun(config.mode, 'stanza_encode')) {
            await runStanzaEncodeOps()
        }

        if (shouldRun(config.mode, 'stanza_decode')) {
            await runStanzaDecodeOps()
        }

        if (shouldRun(config.mode, 'roundtrip')) {
            await runRoundtripOps()
        }
    }

    if (shouldRun(config.mode, 'encode')) {
        forceGcIfAvailable()
        results.push(
            await runTimedBenchmark({
                name: 'encode_node',
                iterations: config.iterations,
                transferredBytes: encodedNode.byteLength * config.operationsPerIteration,
                sampleIntervalMs: config.sampleIntervalMs,
                operation: runEncodeOps
            })
        )
    }

    if (shouldRun(config.mode, 'decode')) {
        forceGcIfAvailable()
        results.push(
            await runTimedBenchmark({
                name: 'decode_node',
                iterations: config.iterations,
                transferredBytes: encodedNode.byteLength * config.operationsPerIteration,
                sampleIntervalMs: config.sampleIntervalMs,
                operation: runDecodeOps
            })
        )
    }

    if (shouldRun(config.mode, 'stanza_encode')) {
        forceGcIfAvailable()
        results.push(
            await runTimedBenchmark({
                name: 'encode_stanza',
                iterations: config.iterations,
                transferredBytes: encodedStanza.byteLength * config.operationsPerIteration,
                sampleIntervalMs: config.sampleIntervalMs,
                operation: runStanzaEncodeOps
            })
        )
    }

    if (shouldRun(config.mode, 'stanza_decode')) {
        forceGcIfAvailable()
        results.push(
            await runTimedBenchmark({
                name: 'decode_stanza',
                iterations: config.iterations,
                transferredBytes: encodedStanza.byteLength * config.operationsPerIteration,
                sampleIntervalMs: config.sampleIntervalMs,
                operation: runStanzaDecodeOps
            })
        )
    }

    if (shouldRun(config.mode, 'roundtrip')) {
        forceGcIfAvailable()
        results.push(
            await runTimedBenchmark({
                name: 'roundtrip_node',
                iterations: config.iterations,
                transferredBytes: encodedNode.byteLength * 2 * config.operationsPerIteration,
                sampleIntervalMs: config.sampleIntervalMs,
                operation: runRoundtripOps
            })
        )
    }

    if (results.length > 0) {
        printTimedBenchmarkResultsTable(results)
        const validation = validateTimedBenchmarkResults(results, BENCH_THRESHOLDS)
        printTimedBenchmarkValidationTable(validation)
        if (!validation.passed && shouldFailOnBenchmarkValidationFailure()) {
            throw new Error('binary codec benchmark assertions failed')
        }
    }
}

void runBench().catch((error) => {
    const normalized = toError(error)
    console.error('binary codec benchmark failed', {
        message: normalized.message,
        stack: normalized.stack
    })
    process.exitCode = 1
})
