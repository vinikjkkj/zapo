const { existsSync, readFileSync, readdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')

const DEFAULTS = Object.freeze({
    reportDirectory: 'bench-results',
    outputPath: 'bench-comment.md',
    marker: '<!-- bench-report -->',
    maxRawLogChars: 20_000
})

const prReportDirectory = readEnvString('WA_BENCH_COMMENT_DIR', DEFAULTS.reportDirectory)
const baseReportDirectory = readEnvString('WA_BENCH_COMMENT_BASE_DIR', '')
const outputPath = readEnvString('WA_BENCH_COMMENT_OUTPUT', DEFAULTS.outputPath)
const rawLogPath = readEnvString('WA_BENCH_LOG_PATH', '')
const prBenchmarkExitCode = readEnvString('WA_BENCH_EXIT_CODE', '0')
const baseBenchmarkExitCode = readEnvString('WA_BENCH_BASE_EXIT_CODE', 'n/a')

const reports = readReports(prReportDirectory)
const baseReports = readReports(baseReportDirectory)
const markdown = buildCommentMarkdown({
    reports,
    baseReports,
    marker: DEFAULTS.marker,
    prBenchmarkExitCode,
    baseBenchmarkExitCode,
    rawLog: readRawLog(rawLogPath),
    maxRawLogChars: DEFAULTS.maxRawLogChars
})

writeFileSync(outputPath, markdown, 'utf8')

function readEnvString(name, fallback) {
    const raw = process.env[name]
    if (!raw) {
        return fallback
    }
    return raw.trim() || fallback
}

function readReports(directoryPath) {
    if (!existsSync(directoryPath)) {
        return []
    }

    const files = readdirSync(directoryPath)
        .filter((fileName) => fileName.endsWith('.json'))
        .sort((left, right) => left.localeCompare(right))

    return files.map((fileName) => {
        const fullPath = path.join(directoryPath, fileName)
        const source = readFileSync(fullPath, 'utf8')
        return JSON.parse(source)
    })
}

function readRawLog(logPath) {
    if (!logPath || !existsSync(logPath)) {
        return null
    }
    return readFileSync(logPath, 'utf8')
}

function buildCommentMarkdown(options) {
    const baseReportsBySuite = mapReportsBySuite(options.baseReports)
    const lines = [options.marker, '# Benchmark Report', '']

    if (options.reports.length === 0) {
        lines.push('No benchmark JSON report found.', '')
        return `${lines.join('\n')}\n`
    }

    const suiteStatuses = options.reports.map((report) => summarizeSuiteStatus(report))
    const failedSuites = suiteStatuses.filter((status) => status.status === 'fail').length
    const passedSuites = suiteStatuses.filter((status) => status.status === 'pass').length
    const skippedSuites = suiteStatuses.filter((status) => status.status === 'skip').length

    lines.push(
        `suites: ${options.reports.length} | pass: ${passedSuites} | fail: ${failedSuites} | skip: ${skippedSuites}`
    )
    lines.push(`pr benchmark process exit code: \`${options.prBenchmarkExitCode}\``)
    if (options.baseReports.length > 0) {
        lines.push(`base benchmark process exit code: \`${options.baseBenchmarkExitCode}\``)
    } else {
        lines.push('base benchmark comparison: unavailable')
    }
    lines.push('')
    lines.push(
        '| suite | status | checks | failures | avg latency delta vs base | throughput delta vs base |'
    )
    lines.push('| --- | --- | ---: | ---: | --- | --- |')

    for (let index = 0; index < suiteStatuses.length; index += 1) {
        const status = suiteStatuses[index]
        const report = options.reports[index]
        const comparison = summarizeSuiteComparison(report, baseReportsBySuite.get(report.suite))
        lines.push(
            `| \`${status.suite}\` | ${status.status.toUpperCase()} | ${status.totalChecks} | ${status.failedChecks} | ${comparison.latencySummary} | ${comparison.throughputSummary} |`
        )
    }

    lines.push('')

    for (const report of options.reports) {
        const suite = summarizeSuiteStatus(report)
        const baseReport = baseReportsBySuite.get(report.suite)
        const suiteComparison = summarizeSuiteComparison(report, baseReport)
        lines.push(
            `<details><summary>${report.title} (${report.suite}) – ${suite.status.toUpperCase()}</summary>`
        )
        lines.push('')
        lines.push(`comparison vs base: ${suiteComparison.comparisonNote}`)
        lines.push('')
        lines.push(
            '| benchmark | base avg ms | pr avg ms | avg delta | base throughput | pr throughput | throughput delta | status |'
        )
        lines.push('| --- | ---: | ---: | --- | ---: | ---: | --- | --- |')

        for (const result of report.results ?? []) {
            const baseResult = findBenchmarkResult(baseReport, result.name)
            const check = (report.validation?.checks ?? []).find(
                (item) => item.benchmark === result.name
            )
            const status = check?.status ?? 'skip'

            const latencyDelta = formatLatencyDelta(baseResult?.avgMs ?? null, result.avgMs)
            const throughputDelta = formatThroughputDelta(
                baseResult?.throughputMiBs ?? null,
                result.throughputMiBs
            )
            lines.push(
                `| \`${result.name}\` | ${formatMetric(baseResult?.avgMs)} | ${formatMetric(result.avgMs)} | ${latencyDelta} | ${formatMetric(baseResult?.throughputMiBs)} | ${formatMetric(result.throughputMiBs)} | ${throughputDelta} | ${status.toUpperCase()} |`
            )
        }

        if ((report.validation?.checks?.length ?? 0) > 0) {
            lines.push('')
            lines.push('| assertion | details |')
            lines.push('| --- | --- |')
            for (const check of report.validation.checks) {
                lines.push(
                    `| \`${check.benchmark}\` (${check.status.toUpperCase()}) | ${escapeCell(
                        check.details
                    )} |`
                )
            }
        }

        lines.push('')
        lines.push('</details>')
        lines.push('')
    }

    if (options.rawLog) {
        const truncated = truncateRawLog(options.rawLog, options.maxRawLogChars)
        lines.push('<details><summary>Raw benchmark log</summary>')
        lines.push('')
        lines.push('```text')
        lines.push(truncated.value)
        lines.push('```')
        if (truncated.truncated) {
            lines.push('')
            lines.push(`raw log truncated to first ${options.maxRawLogChars} chars`)
        }
        lines.push('</details>')
        lines.push('')
    }

    return `${lines.join('\n')}\n`
}

function summarizeSuiteStatus(report) {
    const checks = report.validation?.checks ?? []
    const failedChecks = checks.filter((check) => check.status === 'fail').length

    if (!report.validation) {
        return {
            suite: report.suite,
            status: 'skip',
            totalChecks: 0,
            failedChecks: 0
        }
    }

    return {
        suite: report.suite,
        status: report.validation.passed ? 'pass' : 'fail',
        totalChecks: checks.length,
        failedChecks
    }
}

function mapReportsBySuite(reports) {
    const suiteMap = new Map()
    for (const report of reports) {
        suiteMap.set(report.suite, report)
    }
    return suiteMap
}

function findBenchmarkResult(report, benchmarkName) {
    if (!report || !Array.isArray(report.results)) {
        return null
    }
    for (const result of report.results) {
        if (result.name === benchmarkName) {
            return result
        }
    }
    return null
}

function summarizeSuiteComparison(prReport, baseReport) {
    if (!baseReport) {
        return {
            latencySummary: '-',
            throughputSummary: '-',
            comparisonNote: 'baseline suite not found'
        }
    }

    let matched = 0
    let latencyDeltaTotal = 0
    let throughputDeltaTotal = 0

    for (const prResult of prReport.results ?? []) {
        const baseResult = findBenchmarkResult(baseReport, prResult.name)
        if (!baseResult) {
            continue
        }
        const latencyDelta = computePercentDelta(baseResult.avgMs, prResult.avgMs)
        const throughputDelta = computePercentDelta(
            baseResult.throughputMiBs,
            prResult.throughputMiBs
        )

        if (latencyDelta !== null) {
            latencyDeltaTotal += latencyDelta
        }
        if (throughputDelta !== null) {
            throughputDeltaTotal += throughputDelta
        }
        matched += 1
    }

    if (matched === 0) {
        return {
            latencySummary: '-',
            throughputSummary: '-',
            comparisonNote: 'no overlapping benchmarks with baseline'
        }
    }

    const avgLatencyDelta = latencyDeltaTotal / matched
    const avgThroughputDelta = throughputDeltaTotal / matched
    return {
        latencySummary: formatLatencyDeltaSummary(avgLatencyDelta),
        throughputSummary: formatThroughputDeltaSummary(avgThroughputDelta),
        comparisonNote: `matched ${matched} benchmark(s)`
    }
}

function truncateRawLog(log, maxChars) {
    if (log.length <= maxChars) {
        return {
            value: log,
            truncated: false
        }
    }
    return {
        value: log.slice(0, maxChars),
        truncated: true
    }
}

function formatMetric(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '-'
    }
    return value.toFixed(2)
}

function computePercentDelta(baseValue, prValue) {
    if (!Number.isFinite(baseValue) || !Number.isFinite(prValue) || baseValue === 0) {
        return null
    }
    return ((prValue - baseValue) / baseValue) * 100
}

function formatSignedPercent(value) {
    if (!Number.isFinite(value)) {
        return '-'
    }
    const signal = value > 0 ? '+' : ''
    return `${signal}${value.toFixed(2)}%`
}

function formatLatencyDelta(baseValue, prValue) {
    const delta = computePercentDelta(baseValue, prValue)
    if (delta === null) {
        return '-'
    }
    if (Math.abs(delta) < 0.1) {
        return `${formatSignedPercent(delta)} (stable)`
    }
    return `${formatSignedPercent(delta)} (${delta > 0 ? 'slower' : 'faster'})`
}

function formatThroughputDelta(baseValue, prValue) {
    const delta = computePercentDelta(baseValue, prValue)
    if (delta === null) {
        return '-'
    }
    if (Math.abs(delta) < 0.1) {
        return `${formatSignedPercent(delta)} (stable)`
    }
    return `${formatSignedPercent(delta)} (${delta > 0 ? 'higher' : 'lower'})`
}

function formatLatencyDeltaSummary(delta) {
    if (!Number.isFinite(delta)) {
        return '-'
    }
    if (Math.abs(delta) < 0.1) {
        return `${formatSignedPercent(delta)} (stable)`
    }
    return `${formatSignedPercent(delta)} (${delta > 0 ? 'slower' : 'faster'})`
}

function formatThroughputDeltaSummary(delta) {
    if (!Number.isFinite(delta)) {
        return '-'
    }
    if (Math.abs(delta) < 0.1) {
        return `${formatSignedPercent(delta)} (stable)`
    }
    return `${formatSignedPercent(delta)} (${delta > 0 ? 'higher' : 'lower'})`
}

function escapeCell(value) {
    if (!value) {
        return '-'
    }
    return String(value).replaceAll('|', '\\|')
}
