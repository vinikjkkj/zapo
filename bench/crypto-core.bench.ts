import assert from 'node:assert/strict'

import { aesGcmDecrypt, aesGcmEncrypt, hkdf, hmacSha256Sign, sha256 } from '@crypto/core'
import { toError } from '@util/primitives'

import {
    emitTimedBenchmarkJsonReport,
    forceGcIfAvailable,
    formatKiB,
    hasExposedGc,
    printKeyValueTable,
    printTimedBenchmarkResultsTable,
    printTimedBenchmarkValidationTable,
    readPositiveIntEnv,
    runTimedBenchmark,
    shouldFailOnBenchmarkValidationFailure,
    shouldPrintHumanOutput,
    type TimedBenchmarkResult,
    type TimedBenchmarkThresholdMap,
    type TimedBenchmarkValidationSummary,
    validateTimedBenchmarkResults
} from './benchmark-core'

type CryptoBenchMode = 'all' | 'hkdf' | 'sha256' | 'aes_encrypt' | 'aes_decrypt' | 'hmac'

interface CryptoBenchConfig {
    readonly payloadBytes: number
    readonly operationsPerIteration: number
    readonly warmupIterations: number
    readonly iterations: number
    readonly sampleIntervalMs: number
    readonly mode: CryptoBenchMode
}

const DEFAULTS = Object.freeze({
    payloadBytes: 65_536,
    operationsPerIteration: 64,
    warmupIterations: 2,
    iterations: 20,
    sampleIntervalMs: 5
} as const)

const BENCH_THRESHOLDS: TimedBenchmarkThresholdMap = Object.freeze({
    hkdf_32: Object.freeze({
        maxAvgMs: 30,
        maxP95Ms: 80,
        minThroughputMiBs: 0.1,
        maxP95PeakRssDeltaMiB: 64
    }),
    sha256_payload: Object.freeze({
        maxAvgMs: 20,
        maxP95Ms: 60,
        minThroughputMiBs: 300,
        maxP95PeakRssDeltaMiB: 64
    }),
    aes_gcm_encrypt: Object.freeze({
        maxAvgMs: 25,
        maxP95Ms: 70,
        minThroughputMiBs: 220,
        maxP95PeakRssDeltaMiB: 96
    }),
    aes_gcm_decrypt: Object.freeze({
        maxAvgMs: 35,
        maxP95Ms: 80,
        minThroughputMiBs: 180,
        maxP95PeakRssDeltaMiB: 96
    }),
    hmac_sign_payload: Object.freeze({
        maxAvgMs: 20,
        maxP95Ms: 60,
        minThroughputMiBs: 250,
        maxP95PeakRssDeltaMiB: 64
    })
} as const)

function readBenchModeEnv(): CryptoBenchMode {
    const raw = process.env.WA_BENCH_CRYPTO_MODE
    if (!raw) {
        return 'all'
    }
    if (
        raw === 'all' ||
        raw === 'hkdf' ||
        raw === 'sha256' ||
        raw === 'aes_encrypt' ||
        raw === 'aes_decrypt' ||
        raw === 'hmac'
    ) {
        return raw
    }
    throw new Error(`invalid WA_BENCH_CRYPTO_MODE: ${raw}`)
}

function buildConfig(): CryptoBenchConfig {
    return {
        payloadBytes: readPositiveIntEnv('WA_BENCH_CRYPTO_BYTES', DEFAULTS.payloadBytes),
        operationsPerIteration: readPositiveIntEnv(
            'WA_BENCH_CRYPTO_OPS',
            DEFAULTS.operationsPerIteration
        ),
        warmupIterations: readPositiveIntEnv('WA_BENCH_CRYPTO_WARMUP', DEFAULTS.warmupIterations),
        iterations: readPositiveIntEnv('WA_BENCH_CRYPTO_ITERATIONS', DEFAULTS.iterations),
        sampleIntervalMs: readPositiveIntEnv(
            'WA_BENCH_CRYPTO_SAMPLE_MS',
            DEFAULTS.sampleIntervalMs
        ),
        mode: readBenchModeEnv()
    }
}

function shouldRun(mode: CryptoBenchMode, target: Exclude<CryptoBenchMode, 'all'>): boolean {
    return mode === 'all' || mode === target
}

function buildPatternBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length)
    for (let index = 0; index < bytes.byteLength; index += 1) {
        bytes[index] = (index * 31 + 7) & 255
    }
    return bytes
}

async function runBench(): Promise<void> {
    const config = buildConfig()
    const hasGc = hasExposedGc()
    const failOnFail = shouldFailOnBenchmarkValidationFailure()

    const ikm = buildPatternBytes(32)
    const salt = buildPatternBytes(32)
    const hkdfInfo = 'wa-bench-crypto'
    const plaintext = buildPatternBytes(config.payloadBytes)
    const nonce = buildPatternBytes(12)

    const aesKey = buildPatternBytes(32)
    const ciphertext = aesGcmEncrypt(aesKey, nonce, plaintext)
    const decrypted = aesGcmDecrypt(aesKey, nonce, ciphertext)
    assert.deepEqual(decrypted, plaintext)

    const hmacKey = buildPatternBytes(32)

    const results: TimedBenchmarkResult[] = []
    let validation: TimedBenchmarkValidationSummary | null = null

    const runHkdfOps = async (): Promise<void> => {
        for (let operation = 0; operation < config.operationsPerIteration; operation += 1) {
            const output = hkdf(ikm, salt, hkdfInfo, 32)
            if (output.byteLength !== 32) {
                throw new Error('hkdf result mismatch')
            }
        }
    }

    const runShaOps = async (): Promise<void> => {
        for (let operation = 0; operation < config.operationsPerIteration; operation += 1) {
            const digest = sha256(plaintext)
            if (digest.byteLength !== 32) {
                throw new Error('sha256 result mismatch')
            }
        }
    }

    const runEncryptOps = async (): Promise<void> => {
        for (let operation = 0; operation < config.operationsPerIteration; operation += 1) {
            const encrypted = aesGcmEncrypt(aesKey, nonce, plaintext)
            if (encrypted.byteLength !== ciphertext.byteLength) {
                throw new Error('aes encrypt result mismatch')
            }
        }
    }

    const runDecryptOps = async (): Promise<void> => {
        for (let operation = 0; operation < config.operationsPerIteration; operation += 1) {
            const decryptedResult = aesGcmDecrypt(aesKey, nonce, ciphertext)
            if (decryptedResult.byteLength !== plaintext.byteLength) {
                throw new Error('aes decrypt result mismatch')
            }
        }
    }

    const runHmacOps = async (): Promise<void> => {
        for (let operation = 0; operation < config.operationsPerIteration; operation += 1) {
            const signature = hmacSha256Sign(hmacKey, plaintext)
            if (signature.byteLength !== 32) {
                throw new Error('hmac result mismatch')
            }
        }
    }

    if (shouldPrintHumanOutput()) {
        console.log('crypto core benchmark')
        printKeyValueTable('configuration', [
            ['mode', config.mode],
            ['payload', `${formatKiB(config.payloadBytes)} (${config.payloadBytes} B)`],
            ['ciphertext', `${formatKiB(ciphertext.byteLength)} (${ciphertext.byteLength} B)`],
            ['ops/iteration', String(config.operationsPerIteration)],
            ['warmup', String(config.warmupIterations)],
            ['iterations', String(config.iterations)],
            ['sample interval', `${config.sampleIntervalMs} ms`],
            ['gc exposed', hasGc ? 'yes' : 'no']
        ])
    }

    for (let warmup = 0; warmup < config.warmupIterations; warmup += 1) {
        if (shouldRun(config.mode, 'hkdf')) {
            await runHkdfOps()
        }

        if (shouldRun(config.mode, 'sha256')) {
            await runShaOps()
        }

        if (shouldRun(config.mode, 'aes_encrypt')) {
            await runEncryptOps()
        }

        if (shouldRun(config.mode, 'aes_decrypt')) {
            await runDecryptOps()
        }

        if (shouldRun(config.mode, 'hmac')) {
            await runHmacOps()
        }
    }

    if (shouldRun(config.mode, 'hkdf')) {
        forceGcIfAvailable()
        results.push(
            await runTimedBenchmark({
                name: 'hkdf_32',
                iterations: config.iterations,
                transferredBytes: 32 * config.operationsPerIteration,
                sampleIntervalMs: config.sampleIntervalMs,
                operation: runHkdfOps
            })
        )
    }

    if (shouldRun(config.mode, 'sha256')) {
        forceGcIfAvailable()
        results.push(
            await runTimedBenchmark({
                name: 'sha256_payload',
                iterations: config.iterations,
                transferredBytes: plaintext.byteLength * config.operationsPerIteration,
                sampleIntervalMs: config.sampleIntervalMs,
                operation: runShaOps
            })
        )
    }

    if (shouldRun(config.mode, 'aes_encrypt')) {
        forceGcIfAvailable()
        results.push(
            await runTimedBenchmark({
                name: 'aes_gcm_encrypt',
                iterations: config.iterations,
                transferredBytes: plaintext.byteLength * config.operationsPerIteration,
                sampleIntervalMs: config.sampleIntervalMs,
                operation: runEncryptOps
            })
        )
    }

    if (shouldRun(config.mode, 'aes_decrypt')) {
        forceGcIfAvailable()
        results.push(
            await runTimedBenchmark({
                name: 'aes_gcm_decrypt',
                iterations: config.iterations,
                transferredBytes: ciphertext.byteLength * config.operationsPerIteration,
                sampleIntervalMs: config.sampleIntervalMs,
                operation: runDecryptOps
            })
        )
    }

    if (shouldRun(config.mode, 'hmac')) {
        forceGcIfAvailable()
        results.push(
            await runTimedBenchmark({
                name: 'hmac_sign_payload',
                iterations: config.iterations,
                transferredBytes: plaintext.byteLength * config.operationsPerIteration,
                sampleIntervalMs: config.sampleIntervalMs,
                operation: runHmacOps
            })
        )
    }

    if (results.length > 0) {
        validation = validateTimedBenchmarkResults(results, BENCH_THRESHOLDS)
        if (shouldPrintHumanOutput()) {
            printTimedBenchmarkResultsTable(results)
            printTimedBenchmarkValidationTable(validation)
        }
    }

    await emitTimedBenchmarkJsonReport({
        suite: 'crypto_core',
        title: 'crypto core benchmark',
        generatedAt: new Date().toISOString(),
        failOnFail,
        config: {
            mode: config.mode,
            payloadBytes: config.payloadBytes,
            ciphertextBytes: ciphertext.byteLength,
            operationsPerIteration: config.operationsPerIteration,
            warmupIterations: config.warmupIterations,
            iterations: config.iterations,
            sampleIntervalMs: config.sampleIntervalMs,
            gcExposed: hasGc
        },
        results,
        validation
    })

    if (validation && !validation.passed && failOnFail) {
        throw new Error('crypto core benchmark assertions failed')
    }
}

void runBench().catch((error) => {
    const normalized = toError(error)
    console.error('crypto core benchmark failed', {
        message: normalized.message,
        stack: normalized.stack
    })
    process.exitCode = 1
})
