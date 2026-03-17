import { performance } from 'node:perf_hooks'

interface MemorySnapshot {
    readonly rss: number
    readonly heapUsed: number
    readonly external: number
    readonly arrayBuffers: number
}

type TableAlignment = 'left' | 'right'
type BenchOutputMode = 'auto' | 'table' | 'compact'

export interface TimedBenchmarkOptions {
    readonly name: string
    readonly iterations: number
    readonly transferredBytes: number
    readonly sampleIntervalMs: number
    readonly operation: () => Promise<void>
}

export interface TimedBenchmarkResult {
    readonly name: string
    readonly iterations: number
    readonly avgMs: number
    readonly minMs: number
    readonly p95Ms: number
    readonly maxMs: number
    readonly avgCpuTimeMs: number
    readonly p95CpuTimeMs: number
    readonly avgCpuPercent: number
    readonly p95CpuPercent: number
    readonly throughputMiBs: number
    readonly avgPeakRssDeltaMiB: number
    readonly p95PeakRssDeltaMiB: number
    readonly avgPeakArrayBuffersDeltaMiB: number
    readonly p95PeakArrayBuffersDeltaMiB: number
}

export interface TimedBenchmarkThresholds {
    readonly maxAvgMs?: number
    readonly maxP95Ms?: number
    readonly minThroughputMiBs?: number
    readonly maxAvgPeakRssDeltaMiB?: number
    readonly maxP95PeakRssDeltaMiB?: number
    readonly maxAvgPeakArrayBuffersDeltaMiB?: number
    readonly maxP95PeakArrayBuffersDeltaMiB?: number
}

export type TimedBenchmarkThresholdMap = Readonly<Record<string, TimedBenchmarkThresholds>>
export type TimedBenchmarkCheckStatus = 'pass' | 'fail' | 'skip'

export interface TimedBenchmarkCheckResult {
    readonly benchmark: string
    readonly status: TimedBenchmarkCheckStatus
    readonly details: string
}

export interface TimedBenchmarkValidationSummary {
    readonly checks: readonly TimedBenchmarkCheckResult[]
    readonly passed: boolean
}

const BYTES_PER_MEBIBYTE = 1_048_576

function toMiB(bytes: number): number {
    return bytes / BYTES_PER_MEBIBYTE
}

function readMemorySnapshot(): MemorySnapshot {
    const usage = process.memoryUsage()
    return {
        rss: usage.rss,
        heapUsed: usage.heapUsed,
        external: usage.external,
        arrayBuffers: usage.arrayBuffers
    }
}

function mergeMemoryPeak(left: MemorySnapshot, right: MemorySnapshot): MemorySnapshot {
    return {
        rss: Math.max(left.rss, right.rss),
        heapUsed: Math.max(left.heapUsed, right.heapUsed),
        external: Math.max(left.external, right.external),
        arrayBuffers: Math.max(left.arrayBuffers, right.arrayBuffers)
    }
}

function computeP95(sorted: readonly number[]): number {
    const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1)
    return sorted[index]
}

function padCell(value: string, width: number, alignment: TableAlignment): string {
    return alignment === 'right' ? value.padStart(width, ' ') : value.padEnd(width, ' ')
}

function buildRow(
    values: readonly string[],
    widths: readonly number[],
    alignments: readonly TableAlignment[]
): string {
    const cells = values.map((value, index) => padCell(value, widths[index], alignments[index]))
    return `| ${cells.join(' | ')} |`
}

function buildSeparator(widths: readonly number[]): string {
    const segments = widths.map((width) => '-'.repeat(width))
    return `+-${segments.join('-+-')}-+`
}

function getTerminalColumns(): number {
    const columns = process.stdout.columns
    if (!columns || columns <= 0) {
        return 120
    }
    return columns
}

function splitFixedWidth(value: string, width: number): string[] {
    if (width <= 0) {
        return ['']
    }
    if (value.length === 0) {
        return ['']
    }
    const lines: string[] = []
    for (let offset = 0; offset < value.length; offset += width) {
        lines.push(value.slice(offset, offset + width))
    }
    return lines
}

function printCompactTable(
    title: string,
    headers: readonly [string, string],
    rows: readonly (readonly [string, string])[]
): void {
    const terminalColumns = Math.max(40, getTerminalColumns())
    const contentColumns = Math.max(20, terminalColumns - 7)
    const firstColLimit = Math.max(8, Math.floor(contentColumns * 0.42))

    let firstColWidth = Math.min(
        Math.max(headers[0].length, ...rows.map(([key]) => key.length)),
        firstColLimit
    )
    let secondColWidth = contentColumns - firstColWidth
    if (secondColWidth < 10) {
        secondColWidth = 10
        firstColWidth = Math.max(8, contentColumns - secondColWidth)
    }

    const widths = [firstColWidth, secondColWidth] as const
    const alignments: readonly TableAlignment[] = ['left', 'left']
    const separator = buildSeparator(widths)

    console.log('')
    console.log(title)
    console.log(separator)
    console.log(
        buildRow(
            [headers[0].slice(0, firstColWidth), headers[1].slice(0, secondColWidth)],
            widths,
            alignments
        )
    )
    console.log(separator)

    for (const [leftValue, rightValue] of rows) {
        const leftLines = splitFixedWidth(leftValue, firstColWidth)
        const rightLines = splitFixedWidth(rightValue, secondColWidth)
        const lineCount = Math.max(leftLines.length, rightLines.length)
        for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
            console.log(
                buildRow(
                    [leftLines[lineIndex] ?? '', rightLines[lineIndex] ?? ''],
                    widths,
                    alignments
                )
            )
        }
    }

    console.log(separator)
}

function readOutputModeEnv(): BenchOutputMode {
    const raw = process.env.WA_BENCH_OUTPUT_MODE
    if (!raw) {
        return 'auto'
    }
    if (raw === 'auto' || raw === 'table' || raw === 'compact') {
        return raw
    }
    throw new Error(`invalid WA_BENCH_OUTPUT_MODE: ${raw}`)
}

function useCompactOutput(tableWidth: number): boolean {
    const mode = readOutputModeEnv()
    if (mode === 'compact') {
        return true
    }
    if (mode === 'table') {
        return false
    }
    const columns = process.stdout.columns
    if (!columns || columns <= 0) {
        return false
    }
    return tableWidth > columns
}

export function readPositiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name]
    if (!raw) {
        return fallback
    }
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`invalid ${name}: ${raw}`)
    }
    return Math.floor(value)
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
    const raw = process.env[name]
    if (!raw) {
        return fallback
    }

    const normalized = raw.trim().toLowerCase()
    if (
        normalized === '1' ||
        normalized === 'true' ||
        normalized === 'yes' ||
        normalized === 'on'
    ) {
        return true
    }
    if (
        normalized === '0' ||
        normalized === 'false' ||
        normalized === 'no' ||
        normalized === 'off'
    ) {
        return false
    }
    throw new Error(`invalid ${name}: ${raw}`)
}

export function shouldFailOnBenchmarkValidationFailure(): boolean {
    return readBooleanEnv('WA_BENCH_FAIL_ON_FAIL', true)
}

export function hasExposedGc(): boolean {
    return typeof (globalThis as { gc?: () => void }).gc === 'function'
}

export function forceGcIfAvailable(): void {
    const runtime = globalThis as { gc?: () => void }
    if (runtime.gc) {
        runtime.gc()
    }
}

export function formatFixed(value: number, fractionDigits = 2): string {
    return value.toFixed(fractionDigits)
}

export function formatMiB(bytes: number): string {
    return `${formatFixed(toMiB(bytes))} MiB`
}

export function formatKiB(bytes: number): string {
    return `${formatFixed(bytes / 1_024)} KiB`
}

export function formatMiBValue(value: number): string {
    return `${formatFixed(value)} MiB`
}

export function formatMs(value: number): string {
    return `${formatFixed(value)} ms`
}

export function formatThroughput(value: number): string {
    return `${formatFixed(value)} MiB/s`
}

export function formatPercent(value: number): string {
    return `${formatFixed(value)}%`
}

export function printKeyValueTable(
    title: string,
    rows: readonly (readonly [string, string])[]
): void {
    const headers = ['key', 'value'] as const
    const widths = [headers[0].length, headers[1].length]
    for (const [key, value] of rows) {
        widths[0] = Math.max(widths[0], key.length)
        widths[1] = Math.max(widths[1], value.length)
    }
    const alignments: readonly TableAlignment[] = ['left', 'left']
    const separator = buildSeparator(widths)
    if (useCompactOutput(separator.length)) {
        printCompactTable(title, ['key', 'value'], rows)
        return
    }

    console.log('')
    console.log(title)
    console.log(separator)
    console.log(buildRow(headers, widths, alignments))
    console.log(separator)
    for (const [key, value] of rows) {
        console.log(buildRow([key, value], widths, alignments))
    }
    console.log(separator)
}

export function printTimedBenchmarkResultsTable(results: readonly TimedBenchmarkResult[]): void {
    const headers = [
        'benchmark',
        'avg',
        'min',
        'p95',
        'max',
        'cpu time (avg/p95)',
        'cpu usage 1-core (avg/p95)',
        'throughput',
        'rss peak (avg/p95)',
        'arrayBuffers peak (avg/p95)'
    ] as const
    const alignments: readonly TableAlignment[] = [
        'left',
        'right',
        'right',
        'right',
        'right',
        'right',
        'right',
        'right',
        'right',
        'right'
    ]

    const rows = results.map(
        (result) =>
            [
                result.name,
                formatMs(result.avgMs),
                formatMs(result.minMs),
                formatMs(result.p95Ms),
                formatMs(result.maxMs),
                `${formatMs(result.avgCpuTimeMs)} / ${formatMs(result.p95CpuTimeMs)}`,
                `${formatPercent(result.avgCpuPercent)} / ${formatPercent(result.p95CpuPercent)}`,
                formatThroughput(result.throughputMiBs),
                `${formatFixed(result.avgPeakRssDeltaMiB)} / ${formatFixed(result.p95PeakRssDeltaMiB)} MiB`,
                `${formatFixed(result.avgPeakArrayBuffersDeltaMiB)} / ${formatFixed(result.p95PeakArrayBuffersDeltaMiB)} MiB`
            ] as const
    )

    const widths = headers.map((header) => header.length)
    for (const row of rows) {
        for (let index = 0; index < row.length; index += 1) {
            widths[index] = Math.max(widths[index], row[index].length)
        }
    }
    const separator = buildSeparator(widths)
    if (useCompactOutput(separator.length)) {
        console.log('')
        console.log('results')
        for (const result of results) {
            printCompactTable(
                result.name,
                ['metric', 'value'],
                [
                    [
                        'latency avg/min/p95/max',
                        `${formatMs(result.avgMs)} / ${formatMs(result.minMs)} / ${formatMs(result.p95Ms)} / ${formatMs(result.maxMs)}`
                    ],
                    [
                        'cpu time avg/p95',
                        `${formatMs(result.avgCpuTimeMs)} / ${formatMs(result.p95CpuTimeMs)}`
                    ],
                    [
                        'cpu usage 1-core avg/p95',
                        `${formatPercent(result.avgCpuPercent)} / ${formatPercent(result.p95CpuPercent)}`
                    ],
                    ['throughput', formatThroughput(result.throughputMiBs)],
                    [
                        'rss peak avg/p95',
                        `${formatFixed(result.avgPeakRssDeltaMiB)} / ${formatFixed(result.p95PeakRssDeltaMiB)} MiB`
                    ],
                    [
                        'arrayBuffers peak avg/p95',
                        `${formatFixed(result.avgPeakArrayBuffersDeltaMiB)} / ${formatFixed(result.p95PeakArrayBuffersDeltaMiB)} MiB`
                    ]
                ]
            )
        }
        return
    }

    console.log('')
    console.log('results')
    console.log(separator)
    console.log(buildRow(headers, widths, alignments))
    console.log(separator)
    for (const row of rows) {
        console.log(buildRow(row, widths, alignments))
    }
    console.log(separator)
}

export function validateTimedBenchmarkResults(
    results: readonly TimedBenchmarkResult[],
    thresholdsByBenchmark: TimedBenchmarkThresholdMap
): TimedBenchmarkValidationSummary {
    const checks: TimedBenchmarkCheckResult[] = []

    for (const result of results) {
        const thresholds = thresholdsByBenchmark[result.name]
        if (!thresholds) {
            checks.push({
                benchmark: result.name,
                status: 'skip',
                details: 'no thresholds configured'
            })
            continue
        }

        const failures: string[] = []

        if (thresholds.maxAvgMs !== undefined && result.avgMs > thresholds.maxAvgMs) {
            failures.push(`avg ${formatMs(result.avgMs)} > ${formatMs(thresholds.maxAvgMs)}`)
        }
        if (thresholds.maxP95Ms !== undefined && result.p95Ms > thresholds.maxP95Ms) {
            failures.push(`p95 ${formatMs(result.p95Ms)} > ${formatMs(thresholds.maxP95Ms)}`)
        }
        if (
            thresholds.minThroughputMiBs !== undefined &&
            result.throughputMiBs < thresholds.minThroughputMiBs
        ) {
            failures.push(
                `throughput ${formatThroughput(result.throughputMiBs)} < ${formatThroughput(thresholds.minThroughputMiBs)}`
            )
        }
        if (
            thresholds.maxAvgPeakRssDeltaMiB !== undefined &&
            result.avgPeakRssDeltaMiB > thresholds.maxAvgPeakRssDeltaMiB
        ) {
            failures.push(
                `avg rss ${formatMiBValue(result.avgPeakRssDeltaMiB)} > ${formatMiBValue(thresholds.maxAvgPeakRssDeltaMiB)}`
            )
        }
        if (
            thresholds.maxP95PeakRssDeltaMiB !== undefined &&
            result.p95PeakRssDeltaMiB > thresholds.maxP95PeakRssDeltaMiB
        ) {
            failures.push(
                `p95 rss ${formatMiBValue(result.p95PeakRssDeltaMiB)} > ${formatMiBValue(thresholds.maxP95PeakRssDeltaMiB)}`
            )
        }
        if (
            thresholds.maxAvgPeakArrayBuffersDeltaMiB !== undefined &&
            result.avgPeakArrayBuffersDeltaMiB > thresholds.maxAvgPeakArrayBuffersDeltaMiB
        ) {
            failures.push(
                `avg arrayBuffers ${formatMiBValue(result.avgPeakArrayBuffersDeltaMiB)} > ${formatMiBValue(thresholds.maxAvgPeakArrayBuffersDeltaMiB)}`
            )
        }
        if (
            thresholds.maxP95PeakArrayBuffersDeltaMiB !== undefined &&
            result.p95PeakArrayBuffersDeltaMiB > thresholds.maxP95PeakArrayBuffersDeltaMiB
        ) {
            failures.push(
                `p95 arrayBuffers ${formatMiBValue(result.p95PeakArrayBuffersDeltaMiB)} > ${formatMiBValue(thresholds.maxP95PeakArrayBuffersDeltaMiB)}`
            )
        }

        checks.push({
            benchmark: result.name,
            status: failures.length === 0 ? 'pass' : 'fail',
            details: failures.length === 0 ? 'ok' : failures.join('; ')
        })
    }

    return {
        checks,
        passed: checks.every((check) => check.status !== 'fail')
    }
}

export function printTimedBenchmarkValidationTable(summary: TimedBenchmarkValidationSummary): void {
    if (summary.checks.length === 0) {
        return
    }

    const rows = summary.checks.map(
        (check) => [check.benchmark, check.status, check.details] as const
    )
    const headers = ['benchmark', 'status', 'details'] as const
    const alignments: readonly TableAlignment[] = ['left', 'left', 'left']

    const widths = headers.map((header) => header.length)
    for (const row of rows) {
        for (let index = 0; index < row.length; index += 1) {
            widths[index] = Math.max(widths[index], row[index].length)
        }
    }
    const separator = buildSeparator(widths)

    if (useCompactOutput(separator.length)) {
        console.log('')
        console.log('assertions')
        for (const check of summary.checks) {
            printCompactTable(
                check.benchmark,
                ['assertion', 'value'],
                [
                    ['status', check.status],
                    ['details', check.details]
                ]
            )
        }
        printCompactTable(
            'assertions summary',
            ['assertion', 'value'],
            [
                ['overall', summary.passed ? 'pass' : 'fail'],
                ['fail on fail', shouldFailOnBenchmarkValidationFailure() ? 'yes' : 'no']
            ]
        )
        return
    }

    console.log('')
    console.log('assertions')
    console.log(separator)
    console.log(buildRow(headers, widths, alignments))
    console.log(separator)
    for (const row of rows) {
        console.log(buildRow(row, widths, alignments))
    }
    console.log(separator)
    console.log(`assertions overall: ${summary.passed ? 'pass' : 'fail'}`)
    console.log(
        `assertions fail on fail: ${shouldFailOnBenchmarkValidationFailure() ? 'yes' : 'no'}`
    )
}

export async function runTimedBenchmark(
    options: TimedBenchmarkOptions
): Promise<TimedBenchmarkResult> {
    const samplesMs: number[] = []
    const cpuTimesMs: number[] = []
    const cpuPercents: number[] = []
    const rssDeltas: number[] = []
    const arrayBufferDeltas: number[] = []

    for (let iteration = 0; iteration < options.iterations; iteration += 1) {
        const before = readMemorySnapshot()
        let peak = before

        const timer = setInterval(() => {
            peak = mergeMemoryPeak(peak, readMemorySnapshot())
        }, options.sampleIntervalMs)
        timer.unref?.()

        const startedCpuUsage = process.cpuUsage()
        const startedAt = performance.now()
        await options.operation()
        const durationMs = performance.now() - startedAt
        const cpuUsage = process.cpuUsage(startedCpuUsage)
        const cpuTimeMs = (cpuUsage.user + cpuUsage.system) / 1_000
        const cpuPercent = durationMs > 0 ? (cpuTimeMs / durationMs) * 100 : 0

        clearInterval(timer)
        peak = mergeMemoryPeak(peak, readMemorySnapshot())

        samplesMs.push(durationMs)
        cpuTimesMs.push(cpuTimeMs)
        cpuPercents.push(cpuPercent)
        rssDeltas.push(Math.max(0, peak.rss - before.rss))
        arrayBufferDeltas.push(Math.max(0, peak.arrayBuffers - before.arrayBuffers))
    }

    const sortedMs = [...samplesMs].sort((left, right) => left - right)
    const sortedCpuTimesMs = [...cpuTimesMs].sort((left, right) => left - right)
    const sortedCpuPercents = [...cpuPercents].sort((left, right) => left - right)
    const sortedRssDeltas = [...rssDeltas].sort((left, right) => left - right)
    const sortedArrayBufferDeltas = [...arrayBufferDeltas].sort((left, right) => left - right)

    const totalMs = samplesMs.reduce((total, sample) => total + sample, 0)
    const totalMiB = (options.transferredBytes * options.iterations) / BYTES_PER_MEBIBYTE
    const totalSeconds = totalMs / 1_000

    const avgCpuTimeMs =
        cpuTimesMs.reduce((total, sample) => total + sample, 0) / options.iterations
    const avgCpuPercent =
        cpuPercents.reduce((total, sample) => total + sample, 0) / options.iterations
    const avgRssDeltaBytes =
        rssDeltas.reduce((total, sample) => total + sample, 0) / options.iterations
    const avgArrayBufferDeltaBytes =
        arrayBufferDeltas.reduce((total, sample) => total + sample, 0) / options.iterations

    return {
        name: options.name,
        iterations: options.iterations,
        avgMs: totalMs / options.iterations,
        minMs: sortedMs[0],
        p95Ms: computeP95(sortedMs),
        maxMs: sortedMs[sortedMs.length - 1],
        avgCpuTimeMs,
        p95CpuTimeMs: computeP95(sortedCpuTimesMs),
        avgCpuPercent,
        p95CpuPercent: computeP95(sortedCpuPercents),
        throughputMiBs: totalMiB / totalSeconds,
        avgPeakRssDeltaMiB: toMiB(avgRssDeltaBytes),
        p95PeakRssDeltaMiB: toMiB(computeP95(sortedRssDeltas)),
        avgPeakArrayBuffersDeltaMiB: toMiB(avgArrayBufferDeltaBytes),
        p95PeakArrayBuffersDeltaMiB: toMiB(computeP95(sortedArrayBufferDeltas))
    }
}
