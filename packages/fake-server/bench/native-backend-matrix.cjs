/**
 * Drives packages/fake-server/bench/messaging.bench.ts across the three
 * crypto accelerator backends (no-native / wasm / napi) and reports the
 * median msg/s per scenario over N measured runs (after one discarded
 * warmup run per backend).
 *
 * Fixed at the user-requested workload:
 *   1000 contacts x 2 devices, 4 groups x 500 members, 1000 msgs/scenario,
 *   sqlite store. Medians of 3 runs after warmup.
 *
 * Run: node packages/fake-server/bench/native-backend-matrix.cjs
 * Env overrides: MATRIX_RUNS (default 3), MATRIX_WARMUP (default 1),
 *                MATRIX_BACKENDS (csv, default js,wasm,napi).
 */
'use strict'

const { spawnSync } = require('node:child_process')
const path = require('node:path')

const BENCH = path.join(__dirname, 'messaging.bench.ts')
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

const BACKENDS = (process.env.MATRIX_BACKENDS ?? 'js,wasm,napi').split(',').map((s) => s.trim())
const MEASURED_RUNS = Number.parseInt(process.env.MATRIX_RUNS ?? '3', 10)
const WARMUP_RUNS = Number.parseInt(process.env.MATRIX_WARMUP ?? '1', 10)

const LABELS = {
    js: 'no-native (node:crypto DH + JS xeddsa)',
    wasm: 'WASM (wasm-bindgen)',
    napi: 'NAPI (Rust addon)'
}

const WORKLOAD = {
    ZAPO_BENCH_STORE: 'sqlite',
    ZAPO_BENCH_CONTACTS: '1000',
    ZAPO_BENCH_CONTACT_DEVICES: '2',
    ZAPO_BENCH_GROUPS: '4',
    ZAPO_BENCH_GROUP_MEMBERS: '500',
    ZAPO_BENCH_MESSAGES: '1000',
    ZAPO_BENCH_JSON: '1'
}

function parseTrailingJson(stdout) {
    const start = stdout.lastIndexOf('[\n')
    if (start < 0) throw new Error('no JSON array in bench output')
    const slice = stdout.slice(start)
    return JSON.parse(slice)
}

function runOnce(backend) {
    const env = {
        ...process.env,
        ...WORKLOAD,
        ZAPO_NATIVE_BACKEND: backend
    }
    const res = spawnSync(process.execPath, ['--expose-gc', '--import', 'tsx', BENCH], {
        cwd: REPO_ROOT,
        env,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024
    })
    if (res.status !== 0) {
        process.stderr.write(res.stdout ?? '')
        process.stderr.write(res.stderr ?? '')
        throw new Error(`bench failed for backend=${backend} (exit ${res.status})`)
    }
    const results = parseTrailingJson(res.stdout)
    const perScenario = {}
    for (const r of results) {
        perScenario[r.name] = {
            msgps: r.throughputMsgsPerSec,
            cpuTimeMs: r.cpuTimeMs,
            cpuPercent: r.cpuPercent,
            cpuMsPerMsg: r.cpuTimeMs / r.messages,
            rssAfterBytes: r.rssAfterBytes,
            rssDeltaBytes: r.rssDeltaBytes,
            heapDeltaBytes: r.heapDeltaBytes
        }
    }
    return perScenario
}

function median(values) {
    const s = [...values].sort((a, b) => a - b)
    const mid = s.length >> 1
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const METRICS = [
    'msgps',
    'cpuTimeMs',
    'cpuPercent',
    'cpuMsPerMsg',
    'rssAfterBytes',
    'rssDeltaBytes',
    'heapDeltaBytes'
]

function mib(bytes) {
    return (bytes / 1048576).toFixed(1)
}

async function main() {
    const scenarioOrder = ['SEND 1:1', 'RECV 1:1', 'SEND group', 'RECV group']
    const started = Date.now()
    console.log('native backend matrix — messaging bench (sqlite)')
    console.log(
        `workload: 1000 contacts x2 dev, 4 groups x500 members, 1000 msgs/scenario; ` +
            `${WARMUP_RUNS} warmup + ${MEASURED_RUNS} measured runs/backend`
    )
    console.log('')

    // medians[backend][scenario][metric] = median value
    const medians = {}
    for (const backend of BACKENDS) {
        console.log(`### backend=${backend} — ${LABELS[backend] ?? backend}`)
        for (let w = 0; w < WARMUP_RUNS; w += 1) {
            process.stdout.write(`  warmup ${w + 1}/${WARMUP_RUNS} ... `)
            const t = Date.now()
            runOnce(backend)
            console.log(`${((Date.now() - t) / 1000).toFixed(1)}s`)
        }
        // runs[scenario][metric] = [values...]
        const runs = {}
        for (const s of scenarioOrder) {
            runs[s] = {}
            for (const m of METRICS) runs[s][m] = []
        }
        for (let r = 0; r < MEASURED_RUNS; r += 1) {
            process.stdout.write(`  run ${r + 1}/${MEASURED_RUNS} ... `)
            const t = Date.now()
            const out = runOnce(backend)
            for (const s of scenarioOrder) {
                if (!out[s]) continue
                for (const m of METRICS) runs[s][m].push(out[s][m])
            }
            const summary = scenarioOrder.map((s) => `${s}=${out[s]?.msgps?.toFixed(0)}`).join('  ')
            console.log(`${((Date.now() - t) / 1000).toFixed(1)}s   ${summary}`)
        }
        medians[backend] = {}
        for (const s of scenarioOrder) {
            medians[backend][s] = {}
            for (const m of METRICS) medians[backend][s][m] = median(runs[s][m])
        }
        console.log('')
    }

    // ─── Report ───
    const baseline = BACKENDS.includes('js') ? 'js' : BACKENDS[0]
    const col = (v) => String(v).padStart(12)
    const bar = '════════════════════════════════════════════════════════════════════════'
    const dash = '────────────────────────────────────────────────────────────────────────'

    const printMetricTable = (title, metric, fmt, ratios) => {
        console.log(bar)
        console.log(title)
        console.log(dash)
        const head = 'scenario'.padEnd(14) + BACKENDS.map((b) => col(b)).join('')
        console.log(ratios ? head + col('napi/js') + col('wasm/js') + col('wasm/napi') : head)
        for (const s of scenarioOrder) {
            const row = [s.padEnd(14)]
            for (const b of BACKENDS) row.push(col(fmt(medians[b][s][metric])))
            if (ratios) {
                const jsV = medians[baseline]?.[s]?.[metric]
                const napiV = medians.napi?.[s]?.[metric]
                const wasmV = medians.wasm?.[s]?.[metric]
                row.push(col(napiV && jsV ? (napiV / jsV).toFixed(2) + 'x' : '-'))
                row.push(col(wasmV && jsV ? (wasmV / jsV).toFixed(2) + 'x' : '-'))
                row.push(col(wasmV && napiV ? (wasmV / napiV).toFixed(2) + 'x' : '-'))
            }
            console.log(row.join(''))
        }
    }

    printMetricTable(
        'MEDIAN throughput (msg/s) — higher is better',
        'msgps',
        (v) => v.toFixed(1),
        true
    )
    printMetricTable(
        'MEDIAN CPU time per scenario (ms of CPU to process the messages) — lower is better',
        'cpuTimeMs',
        (v) => v.toFixed(0),
        true
    )
    printMetricTable(
        'MEDIAN CPU per message (CPU-ms / msg) — lower is better',
        'cpuMsPerMsg',
        (v) => v.toFixed(2),
        true
    )
    printMetricTable(
        'MEDIAN CPU utilisation (%, >100 = multi-core) — parallelism, not cost',
        'cpuPercent',
        (v) => v.toFixed(0) + '%',
        false
    )
    printMetricTable(
        'MEDIAN RSS after scenario (MiB) — process footprint, lower is better',
        'rssAfterBytes',
        (v) => mib(v),
        true
    )
    printMetricTable(
        'MEDIAN heap delta per scenario (MiB) — allocation churn, lower is better',
        'heapDeltaBytes',
        (v) => mib(v),
        true
    )
    console.log(bar)
    console.log(`total wall: ${((Date.now() - started) / 1000 / 60).toFixed(1)} min`)

    if (process.env.MATRIX_JSON) {
        const fs = require('node:fs')
        fs.writeFileSync(process.env.MATRIX_JSON, JSON.stringify(medians, null, 2))
        console.log(`wrote ${process.env.MATRIX_JSON}`)
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
