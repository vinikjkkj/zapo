import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'

import { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import { toChunkBytes } from '@util/bytes'
import { toError } from '@util/primitives'

import type { TimedBenchmarkThresholdMap } from './benchmark-core'
import type { TimedBenchmarkResult } from './benchmark-core'
import {
    forceGcIfAvailable,
    formatKiB,
    formatMiB,
    hasExposedGc,
    printKeyValueTable,
    printTimedBenchmarkResultsTable,
    printTimedBenchmarkValidationTable,
    readPositiveIntEnv,
    runTimedBenchmark,
    shouldFailOnBenchmarkValidationFailure,
    validateTimedBenchmarkResults
} from './benchmark-core'

interface BenchConfig {
    readonly payloadBytes: number
    readonly chunkBytes: number
    readonly warmupIterations: number
    readonly iterations: number
    readonly sampleIntervalMs: number
    readonly mode: BenchMode
}

interface BenchServerState {
    readonly payloadBytes: number
    readonly chunkBytes: number
}

interface BenchServer {
    readonly baseUrl: string
    close(): Promise<void>
}

interface StreamByteSummary {
    readonly byteLength: number
    readonly firstByte: number | null
    readonly lastByte: number | null
}

type BenchMode = 'both' | 'upload' | 'download'

const BENCH_DEFAULTS = Object.freeze({
    payloadBytes: 8_388_608,
    chunkBytes: 64_000,
    warmupIterations: 2,
    iterations: 8,
    sampleIntervalMs: 5
} as const)

const BENCH_THRESHOLDS: TimedBenchmarkThresholdMap = Object.freeze({
    upload_stream: Object.freeze({
        maxAvgMs: 140,
        maxP95Ms: 220,
        minThroughputMiBs: 70,
        maxP95PeakRssDeltaMiB: 96,
        maxP95PeakArrayBuffersDeltaMiB: 96
    }),
    download_stream: Object.freeze({
        maxAvgMs: 140,
        maxP95Ms: 220,
        minThroughputMiBs: 70,
        maxP95PeakRssDeltaMiB: 96,
        maxP95PeakArrayBuffersDeltaMiB: 96
    })
} as const)

function readBenchModeEnv(): BenchMode {
    const raw = process.env.WA_BENCH_MEDIA_MODE
    if (!raw) {
        return 'both'
    }
    if (raw === 'both' || raw === 'upload' || raw === 'download') {
        return raw
    }
    throw new Error(`invalid WA_BENCH_MEDIA_MODE: ${raw}`)
}

function buildBenchConfig(): BenchConfig {
    return {
        payloadBytes: readPositiveIntEnv('WA_BENCH_MEDIA_BYTES', BENCH_DEFAULTS.payloadBytes),
        chunkBytes: readPositiveIntEnv('WA_BENCH_MEDIA_CHUNK_BYTES', BENCH_DEFAULTS.chunkBytes),
        warmupIterations: readPositiveIntEnv(
            'WA_BENCH_MEDIA_WARMUP',
            BENCH_DEFAULTS.warmupIterations
        ),
        iterations: readPositiveIntEnv('WA_BENCH_MEDIA_ITERATIONS', BENCH_DEFAULTS.iterations),
        sampleIntervalMs: readPositiveIntEnv(
            'WA_BENCH_MEDIA_SAMPLE_MS',
            BENCH_DEFAULTS.sampleIntervalMs
        ),
        mode: readBenchModeEnv()
    }
}

function fillPatternChunk(chunk: Uint8Array, startOffset: number): void {
    for (let index = 0; index < chunk.byteLength; index += 1) {
        chunk[index] = (startOffset + index) & 255
    }
}

async function* generatePatternChunks(
    payloadBytes: number,
    chunkBytes: number
): AsyncGenerator<Uint8Array, void, undefined> {
    for (let offset = 0; offset < payloadBytes; offset += chunkBytes) {
        const size = Math.min(chunkBytes, payloadBytes - offset)
        const chunk = new Uint8Array(size)
        fillPatternChunk(chunk, offset)
        yield chunk
    }
}

function createPatternReadable(payloadBytes: number, chunkBytes: number): Readable {
    return Readable.from(generatePatternChunks(payloadBytes, chunkBytes))
}

function expectedFirstByte(payloadBytes: number): number | null {
    return payloadBytes > 0 ? 0 : null
}

function expectedLastByte(payloadBytes: number): number | null {
    return payloadBytes > 0 ? (payloadBytes - 1) & 255 : null
}

async function consumeReadable(stream: Readable): Promise<StreamByteSummary> {
    let byteLength = 0
    let firstByte: number | null = null
    let lastByte: number | null = null

    for await (const chunk of stream) {
        const bytes = toChunkBytes(chunk)
        if (bytes.byteLength === 0) {
            continue
        }
        if (firstByte === null) {
            firstByte = bytes[0]
        }
        lastByte = bytes[bytes.byteLength - 1]
        byteLength += bytes.byteLength
    }

    return {
        byteLength,
        firstByte,
        lastByte
    }
}

async function streamDownloadResponse(
    response: ServerResponse,
    payloadBytes: number,
    chunkBytes: number
): Promise<void> {
    for await (const chunk of generatePatternChunks(payloadBytes, chunkBytes)) {
        if (response.write(chunk)) {
            continue
        }
        await once(response, 'drain')
    }
    response.end()
}

async function handleBenchRequest(
    request: IncomingMessage,
    response: ServerResponse,
    state: BenchServerState
): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')

    if (request.method === 'POST' && url.pathname === '/upload') {
        const uploaded = await consumeReadable(request)
        response.statusCode = 200
        response.setHeader('x-upload-bytes', String(uploaded.byteLength))
        response.setHeader(
            'x-upload-first-byte',
            uploaded.firstByte !== null ? String(uploaded.firstByte) : ''
        )
        response.setHeader(
            'x-upload-last-byte',
            uploaded.lastByte !== null ? String(uploaded.lastByte) : ''
        )
        response.end('ok')
        return
    }

    if (request.method === 'GET' && url.pathname === '/download') {
        response.statusCode = 200
        response.setHeader('content-type', 'application/octet-stream')
        response.setHeader('content-length', String(state.payloadBytes))
        await streamDownloadResponse(response, state.payloadBytes, state.chunkBytes)
        return
    }

    response.statusCode = 404
    response.end('not found')
}

async function startBenchServer(state: BenchServerState): Promise<BenchServer> {
    const server = createServer((request, response) => {
        void handleBenchRequest(request, response, state).catch((error) => {
            const normalized = toError(error)
            response.statusCode = 500
            response.end(normalized.message)
        })
    })

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
            server.removeListener('error', reject)
            resolve()
        })
    })

    const address = server.address()
    if (!address || typeof address === 'string') {
        throw new Error('failed to resolve benchmark server address')
    }

    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error)
                        return
                    }
                    resolve()
                })
            })
    }
}

function getHeaderValue(headers: Readonly<Record<string, string>>, name: string): string | null {
    const target = name.toLowerCase()
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === target) {
            return value
        }
    }
    return null
}

async function runUploadIteration(
    mediaClient: WaMediaTransferClient,
    uploadUrl: string,
    payloadBytes: number,
    chunkBytes: number
): Promise<void> {
    const response = await mediaClient.uploadStream({
        url: uploadUrl,
        method: 'POST',
        body: createPatternReadable(payloadBytes, chunkBytes),
        contentType: 'application/octet-stream',
        contentLength: payloadBytes
    })

    assert.equal(response.status, 200, `upload failed with status ${response.status}`)

    const uploadedBytes = getHeaderValue(response.headers, 'x-upload-bytes')
    const uploadedFirstByte = getHeaderValue(response.headers, 'x-upload-first-byte')
    const uploadedLastByte = getHeaderValue(response.headers, 'x-upload-last-byte')

    assert.ok(uploadedBytes, 'missing x-upload-bytes response header')
    assert.ok(uploadedFirstByte !== null, 'missing x-upload-first-byte response header')
    assert.ok(uploadedLastByte !== null, 'missing x-upload-last-byte response header')

    assert.equal(Number(uploadedBytes), payloadBytes, 'upload byte length mismatch')

    const expectedFirst = expectedFirstByte(payloadBytes)
    const expectedLast = expectedLastByte(payloadBytes)
    assert.equal(
        uploadedFirstByte === '' ? null : Number(uploadedFirstByte),
        expectedFirst,
        'upload first-byte mismatch'
    )
    assert.equal(
        uploadedLastByte === '' ? null : Number(uploadedLastByte),
        expectedLast,
        'upload last-byte mismatch'
    )

    await mediaClient.readResponseBytes(response)
}

async function runDownloadIteration(
    mediaClient: WaMediaTransferClient,
    downloadUrl: string,
    payloadBytes: number
): Promise<void> {
    const response = await mediaClient.downloadStream({
        url: downloadUrl
    })

    assert.equal(response.status, 200, `download failed with status ${response.status}`)
    assert.ok(response.body, 'download response body is empty')

    const downloaded = await consumeReadable(response.body)
    assert.equal(downloaded.byteLength, payloadBytes, 'download byte length mismatch')
    assert.equal(
        downloaded.firstByte,
        expectedFirstByte(payloadBytes),
        'download first-byte mismatch'
    )
    assert.equal(downloaded.lastByte, expectedLastByte(payloadBytes), 'download last-byte mismatch')
}

async function runBench(): Promise<void> {
    const config = buildBenchConfig()
    const state: BenchServerState = {
        payloadBytes: config.payloadBytes,
        chunkBytes: config.chunkBytes
    }

    const hasGc = hasExposedGc()
    const server = await startBenchServer(state)
    const mediaClient = new WaMediaTransferClient({
        defaultTimeoutMs: 30_000
    })

    const uploadUrl = `${server.baseUrl}/upload`
    const downloadUrl = `${server.baseUrl}/download`
    const results: TimedBenchmarkResult[] = []

    console.log('media streaming benchmark')
    printKeyValueTable('configuration', [
        ['mode', config.mode],
        ['payload', `${formatMiB(config.payloadBytes)} (${config.payloadBytes} B)`],
        ['chunk', `${formatKiB(config.chunkBytes)} (${config.chunkBytes} B)`],
        ['warmup', String(config.warmupIterations)],
        ['iterations', String(config.iterations)],
        ['sample interval', `${config.sampleIntervalMs} ms`],
        ['gc exposed', hasGc ? 'yes' : 'no']
    ])

    try {
        forceGcIfAvailable()
        for (let warmup = 0; warmup < config.warmupIterations; warmup += 1) {
            if (config.mode === 'both' || config.mode === 'upload') {
                await runUploadIteration(
                    mediaClient,
                    uploadUrl,
                    config.payloadBytes,
                    config.chunkBytes
                )
            }
            if (config.mode === 'both' || config.mode === 'download') {
                await runDownloadIteration(mediaClient, downloadUrl, config.payloadBytes)
            }
        }

        if (config.mode === 'both' || config.mode === 'upload') {
            forceGcIfAvailable()
            const uploadResult = await runTimedBenchmark({
                name: 'upload_stream',
                iterations: config.iterations,
                transferredBytes: config.payloadBytes,
                sampleIntervalMs: config.sampleIntervalMs,
                operation: () =>
                    runUploadIteration(
                        mediaClient,
                        uploadUrl,
                        config.payloadBytes,
                        config.chunkBytes
                    )
            })
            results.push(uploadResult)
        }

        if (config.mode === 'both' || config.mode === 'download') {
            forceGcIfAvailable()
            const downloadResult = await runTimedBenchmark({
                name: 'download_stream',
                iterations: config.iterations,
                transferredBytes: config.payloadBytes,
                sampleIntervalMs: config.sampleIntervalMs,
                operation: () => runDownloadIteration(mediaClient, downloadUrl, config.payloadBytes)
            })
            results.push(downloadResult)
        }

        if (results.length > 0) {
            printTimedBenchmarkResultsTable(results)
            const validation = validateTimedBenchmarkResults(results, BENCH_THRESHOLDS)
            printTimedBenchmarkValidationTable(validation)
            if (!validation.passed && shouldFailOnBenchmarkValidationFailure()) {
                throw new Error('media streaming benchmark assertions failed')
            }
        }
    } finally {
        await server.close()
    }
}

void runBench().catch((error) => {
    const normalized = toError(error)
    console.error('media streaming benchmark failed', {
        message: normalized.message,
        stack: normalized.stack
    })
    process.exitCode = 1
})
