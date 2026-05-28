#!/usr/bin/env node
/**
 * Run every bench against every requested store backend, capturing
 * CPU profiles + heap snapshots into per-(bench, store) directories.
 *
 * Usage:
 *   node packages/fake-server/bench/run-all-stores.cjs [--stores=memory,sqlite,...]
 *       [--benches=connect-lifecycle,history-sync,...]
 *       [--out=<dir>] [--no-cpu] [--no-snapshot] [--start-docker]
 *
 * Defaults:
 *   stores  = memory,sqlite
 *   benches = all 8 benches (connect-lifecycle, history-sync,
 *             bulk-usync, group-provision, media-upload,
 *             receipts-flood, reconnect-resume, appstate)
 *   out     = <repo>/bench-profiles/all-stores-<ts>
 *
 * When `--start-docker` is passed, the script also spins up the
 * `packages/docker-compose.test.yml` services for stores that need
 * them, captures the ephemeral ports, and tears them down at the end.
 * Without the flag, the stores are expected to be reachable via the
 * `ZAPO_TEST_*` env vars (set the same way `scripts/test-stores.cjs`
 * does).
 *
 * The bench files themselves are run with:
 *   node --expose-gc --import tsx <bench> --cpu --snapshot --out-dir=<dir>
 * (toggle flags via `--no-cpu` / `--no-snapshot`).
 */

const { execSync, spawnSync } = require('node:child_process')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const REPO_ROOT = resolve(__dirname, '../../..')
const COMPOSE_FILE = join(REPO_ROOT, 'packages', 'docker-compose.test.yml')

const ALL_BENCHES = [
    'messaging',
    'connect-lifecycle',
    'history-sync',
    'bulk-usync',
    'group-provision',
    'media-upload',
    'receipts-flood',
    'reconnect-resume',
    'appstate'
]

const ALL_STORES = ['memory', 'sqlite', 'postgres', 'mysql', 'redis', 'mongo']
const DOCKER_STORES = new Set(['postgres', 'mysql', 'redis', 'mongo'])

function parseArgs(argv) {
    const out = {
        stores: ['memory', 'sqlite'],
        benches: ALL_BENCHES.slice(),
        outDir: null,
        cpu: true,
        snapshot: true,
        startDocker: false
    }
    for (const arg of argv) {
        if (arg.startsWith('--stores=')) {
            out.stores = arg.split('=')[1].split(',').filter(Boolean)
        } else if (arg.startsWith('--benches=')) {
            out.benches = arg.split('=')[1].split(',').filter(Boolean)
        } else if (arg.startsWith('--out=')) {
            out.outDir = arg.split('=')[1]
        } else if (arg === '--no-cpu') {
            out.cpu = false
        } else if (arg === '--no-snapshot') {
            out.snapshot = false
        } else if (arg === '--start-docker') {
            out.startDocker = true
        } else if (arg === '--all-stores') {
            out.stores = ALL_STORES.slice()
        } else if (arg === '--help' || arg === '-h') {
            console.log(`Usage: node run-all-stores.cjs [options]
  --stores=<csv>      memory,sqlite,postgres,mysql,redis,mongo (default: memory,sqlite)
  --all-stores        shortcut for all 6 backends
  --benches=<csv>     ${ALL_BENCHES.join(',')} (default: all)
  --out=<dir>         output directory (default: <repo>/bench-profiles/all-stores-<ts>)
  --no-cpu            skip CPU profile capture
  --no-snapshot       skip heap snapshot capture
  --start-docker      spin up docker-compose services for pg/mysql/redis/mongo`)
            process.exit(0)
        } else {
            console.error(`unknown arg: ${arg}`)
            process.exit(1)
        }
    }
    for (const b of out.benches) {
        if (!ALL_BENCHES.includes(b)) {
            console.error(`unknown bench: ${b}; valid: ${ALL_BENCHES.join(',')}`)
            process.exit(1)
        }
    }
    for (const s of out.stores) {
        if (!ALL_STORES.includes(s)) {
            console.error(`unknown store: ${s}; valid: ${ALL_STORES.join(',')}`)
            process.exit(1)
        }
    }
    return out
}

function getComposePort(service, containerPort) {
    const output = execSync(
        `docker compose -f "${COMPOSE_FILE}" port ${service} ${containerPort}`,
        { encoding: 'utf8', cwd: REPO_ROOT }
    ).trim()
    const match = output.match(/:(\d+)$/)
    if (!match) throw new Error(`failed to read port for ${service}: ${output}`)
    return match[1]
}

function ensureDocker(stores) {
    const needed = stores.filter((s) => DOCKER_STORES.has(s))
    if (needed.length === 0) return {}
    console.log(`▶ starting docker-compose services for ${needed.join(', ')}...`)
    execSync(`docker compose -f "${COMPOSE_FILE}" up -d --wait`, {
        stdio: 'inherit',
        cwd: REPO_ROOT,
        timeout: 300_000
    })
    const env = {}
    if (stores.includes('mysql')) {
        env.ZAPO_TEST_MYSQL_HOST = 'localhost'
        env.ZAPO_TEST_MYSQL_PORT = getComposePort('mysql', 3306)
        env.ZAPO_TEST_MYSQL_USER = 'root'
        env.ZAPO_TEST_MYSQL_PASSWORD = 'test'
        env.ZAPO_TEST_MYSQL_DATABASE = 'zapo_test'
    }
    if (stores.includes('postgres')) {
        env.ZAPO_TEST_PG_HOST = 'localhost'
        env.ZAPO_TEST_PG_PORT = getComposePort('postgres', 5432)
        env.ZAPO_TEST_PG_USER = 'postgres'
        env.ZAPO_TEST_PG_PASSWORD = 'test'
        env.ZAPO_TEST_PG_DATABASE = 'zapo_test'
    }
    if (stores.includes('redis')) {
        env.ZAPO_TEST_REDIS_HOST = 'localhost'
        env.ZAPO_TEST_REDIS_PORT = getComposePort('redis', 6379)
    }
    if (stores.includes('mongo')) {
        env.ZAPO_TEST_MONGO_HOST = 'localhost'
        env.ZAPO_TEST_MONGO_PORT = getComposePort('mongo', 27017)
    }
    return env
}

function stopDocker() {
    console.log('▶ stopping docker-compose services...')
    try {
        execSync(`docker compose -f "${COMPOSE_FILE}" down`, {
            stdio: 'inherit',
            cwd: REPO_ROOT
        })
    } catch (err) {
        console.error('failed to stop containers:', err.message)
    }
}

function ensureOutDir(opts) {
    const root = opts.outDir
        ? resolve(opts.outDir)
        : join(REPO_ROOT, 'bench-profiles', `all-stores-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    return root
}

function runBench(bench, store, outRoot, opts, extraEnv) {
    const subDir = join(outRoot, `${bench}_${store}`)
    mkdirSync(subDir, { recursive: true })
    const benchFile = join(__dirname, `${bench}.bench.ts`)
    const flags = ['--separate-process']
    if (opts.cpu) flags.push('--cpu')
    if (opts.snapshot) flags.push('--snapshot')
    flags.push(`--out-dir=${subDir}`)

    const env = {
        ...process.env,
        ZAPO_BENCH_STORE: store,
        ...extraEnv
    }

    console.log(`\n┌──[ ${bench} × ${store} ]──`)
    const started = Date.now()
    const res = spawnSync(
        process.execPath,
        ['--expose-gc', '--import', 'tsx', benchFile, ...flags],
        {
            stdio: 'inherit',
            cwd: REPO_ROOT,
            env,
            timeout: 1_800_000
        }
    )
    const elapsedMs = Date.now() - started
    const outcome = {
        bench,
        store,
        outDir: subDir,
        elapsedMs,
        exitCode: res.status,
        signal: res.signal,
        error: res.error ? res.error.message : null
    }
    if (res.status !== 0) {
        console.log(`└──  ✗ FAILED (exit ${res.status}, ${elapsedMs}ms)`)
    } else {
        console.log(`└──  ✓ ok (${elapsedMs}ms)`)
    }
    return outcome
}

function writeSummary(outRoot, results) {
    const summaryPath = join(outRoot, 'summary.json')
    writeFileSync(
        summaryPath,
        JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)
    )
    console.log(`\nSummary written to ${summaryPath}`)
    const ok = results.filter((r) => r.exitCode === 0).length
    const fail = results.length - ok
    console.log(`Result: ${ok} ok / ${fail} failed (of ${results.length})`)
    if (fail > 0) {
        console.log('\nFailures:')
        for (const r of results) {
            if (r.exitCode === 0) continue
            console.log(
                `  - ${r.bench} × ${r.store}  (exit ${r.exitCode}${r.error ? ': ' + r.error : ''})`
            )
        }
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2))
    const outRoot = ensureOutDir(opts)
    console.log(`Output directory: ${outRoot}`)
    console.log(`Stores : ${opts.stores.join(', ')}`)
    console.log(`Benches: ${opts.benches.join(', ')}`)
    console.log(
        `Flags  : ${opts.cpu ? '+cpu' : '-cpu'} ${opts.snapshot ? '+snapshot' : '-snapshot'}`
    )

    let dockerEnv = {}
    let dockerStarted = false
    try {
        if (opts.startDocker) {
            dockerEnv = ensureDocker(opts.stores)
            dockerStarted = true
        }

        const results = []
        for (const store of opts.stores) {
            for (const bench of opts.benches) {
                results.push(runBench(bench, store, outRoot, opts, dockerEnv))
            }
        }
        writeSummary(outRoot, results)
        const fail = results.filter((r) => r.exitCode !== 0).length
        process.exitCode = fail > 0 ? 1 : 0
    } finally {
        if (dockerStarted) {
            stopDocker()
        }
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
