/**
 * Profiling pass for the three crypto backends. Runs the messaging bench
 * ONCE per backend with V8 CPU profiling + heap-allocation timeline +
 * start/end heap snapshots enabled, into a per-backend out-dir, then
 * digests the artifacts:
 *
 *   - CPU: parses the whole-run .cpuprofile, computes self-time per
 *     function from samples+timeDeltas, and buckets it (x25519/DH,
 *     xeddsa/curve-math, wasm, native-binding, signal, store/sqlite,
 *     wire/serialize, gc, other). Reports total sampled ms + top frames.
 *   - Memory: parses the end heap snapshot and sums node self_size for a
 *     precise retained-JS-heap figure per backend.
 *
 * NOTE: the CPU profiler adds overhead, so throughput here is NOT
 * comparable to the clean matrix — these runs are for ATTRIBUTION only.
 *
 * Run: node packages/fake-server/bench/native-backend-profile.cjs
 * Env: PROFILE_BACKENDS (csv, default js,wasm,napi),
 *      PROFILE_OUT (dir, default ./native-profile-out)
 */
'use strict'

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const BENCH = path.join(__dirname, 'messaging.bench.ts')
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const BACKENDS = (process.env.PROFILE_BACKENDS ?? 'js,wasm,napi').split(',').map((s) => s.trim())
const OUT_ROOT = process.env.PROFILE_OUT ?? path.join(REPO_ROOT, 'native-profile-out')

const WORKLOAD = {
    ZAPO_BENCH_STORE: 'sqlite',
    ZAPO_BENCH_CONTACTS: '1000',
    ZAPO_BENCH_CONTACT_DEVICES: '2',
    ZAPO_BENCH_GROUPS: '4',
    ZAPO_BENCH_GROUP_MEMBERS: '500',
    ZAPO_BENCH_MESSAGES: '1000'
}

// ─── bucket classification ───
function classify(functionName, url) {
    const fn = functionName || '(anonymous)'
    const u = url || ''
    const low = (fn + ' ' + u).toLowerCase()
    if (
        u.startsWith('wasm://') ||
        fn.startsWith('wasm-function') ||
        low.includes('zapo_native_wasm')
    )
        return 'wasm'
    if (u.includes('native') && u.includes('binding')) return 'native-binding'
    if (
        low.includes('diffiehellman') ||
        low.includes('scalarmult') ||
        low.includes('x25519') ||
        u.includes('crypto/curves/x25519') ||
        (u.includes('internal/crypto') && (low.includes('diffie') || low.includes('key')))
    )
        return 'x25519/DH'
    if (
        u.includes('crypto/math') ||
        u.includes('crypto/core/xeddsa') ||
        u.includes('crypto/curves/ed25519') ||
        low.includes('xeddsa') ||
        low.includes('scalarmultbase') ||
        low.includes('edwards')
    )
        return 'xeddsa/curve-math'
    if (
        u.includes('crypto/') ||
        u.includes('internal/crypto') ||
        low.includes('sha512') ||
        low.includes('hkdf')
    )
        return 'other-crypto'
    if (
        u.includes('/signal') ||
        low.includes('ratchet') ||
        low.includes('senderkey') ||
        low.includes('session')
    )
        return 'signal/session'
    if (u.includes('store') || low.includes('sqlite') || low.includes('better-sqlite'))
        return 'store/sqlite'
    if (
        u.includes('binary') ||
        u.includes('wap') ||
        u.includes('proto') ||
        low.includes('encode') ||
        low.includes('decode')
    )
        return 'wire/serialize'
    if (fn.startsWith('(garbage') || fn === '(gc)') return 'gc'
    if (fn === '(program)' || fn === '(idle)' || fn === '(root)') return 'vm/idle'
    return 'other'
}

function digestCpuProfile(file) {
    const prof = JSON.parse(fs.readFileSync(file, 'utf8'))
    const nodeById = new Map()
    for (const n of prof.nodes) nodeById.set(n.id, n)
    // self-time from samples+timeDeltas (microseconds)
    const selfById = new Map()
    const samples = prof.samples || []
    const deltas = prof.timeDeltas || []
    let total = 0
    for (let i = 0; i < samples.length; i += 1) {
        const dt = deltas[i] || 0
        if (dt < 0) continue
        total += dt
        selfById.set(samples[i], (selfById.get(samples[i]) || 0) + dt)
    }
    const buckets = new Map()
    const funcs = new Map()
    for (const [id, us] of selfById) {
        const n = nodeById.get(id)
        if (!n) continue
        const cf = n.callFrame || {}
        const b = classify(cf.functionName, cf.url)
        buckets.set(b, (buckets.get(b) || 0) + us)
        const key = `${cf.functionName || '(anon)'}  ${shortUrl(cf.url)}`
        funcs.set(key, (funcs.get(key) || 0) + us)
    }
    return { totalUs: total, buckets, funcs }
}

function shortUrl(u) {
    if (!u) return ''
    if (u.startsWith('node:')) return u
    const idx = u.replace(/\\/g, '/').lastIndexOf('/src/')
    if (idx >= 0) return u.replace(/\\/g, '/').slice(idx + 1)
    const parts = u.replace(/\\/g, '/').split('/')
    return parts.slice(-2).join('/')
}

function digestHeapSnapshot(file) {
    // sum self_size over all nodes for precise retained JS heap
    const raw = fs.readFileSync(file, 'utf8')
    const snap = JSON.parse(raw)
    const fields = snap.snapshot.meta.node_fields
    const stride = fields.length
    const selfIdx = fields.indexOf('self_size')
    const nodes = snap.nodes
    let sum = 0
    for (let i = selfIdx; i < nodes.length; i += stride) sum += nodes[i]
    return { totalBytes: sum, nodeCount: snap.snapshot.node_count, fileBytes: raw.length }
}

function newestMatch(dir, prefix, ext) {
    const files = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith(prefix) && f.endsWith('.' + ext))
        .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
    return files.length ? path.join(dir, files[0].f) : null
}

function runProfile(backend, outDir) {
    fs.mkdirSync(outDir, { recursive: true })
    const env = { ...process.env, ...WORKLOAD, ZAPO_NATIVE_BACKEND: backend }
    const res = spawnSync(
        process.execPath,
        [
            '--expose-gc',
            '--import',
            'tsx',
            BENCH,
            '--cpu',
            '--heap',
            '--snapshot',
            `--out-dir=${outDir}`
        ],
        { cwd: REPO_ROOT, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
    if (res.status !== 0) {
        process.stderr.write(res.stdout ?? '')
        process.stderr.write(res.stderr ?? '')
        throw new Error(`profiling run failed for backend=${backend} (exit ${res.status})`)
    }
}

function mib(b) {
    return (b / 1048576).toFixed(1)
}

function main() {
    const digest = {}
    for (const backend of BACKENDS) {
        const outDir = path.join(OUT_ROOT, backend)
        console.log(`### profiling backend=${backend} → ${outDir}`)
        const t = Date.now()
        runProfile(backend, outDir)
        console.log(`  run done in ${((Date.now() - t) / 1000).toFixed(1)}s`)
        const cpuFile = newestMatch(outDir, 'cpu-', 'cpuprofile')
        const endSnap = newestMatch(outDir, 'snapshot-end', 'heapsnapshot')
        const cpu = cpuFile ? digestCpuProfile(cpuFile) : null
        let heap = null
        if (endSnap) {
            try {
                heap = digestHeapSnapshot(endSnap)
            } catch (e) {
                console.log(`  heap snapshot parse failed: ${e.message}`)
            }
        }
        digest[backend] = { cpu, heap, cpuFile, endSnap }
        console.log('')
    }

    // ─── CPU attribution ───
    const bar = '════════════════════════════════════════════════════════════════════════'
    console.log(bar)
    console.log('CPU self-time attribution (whole run, sampled ms) — profiler overhead included')
    console.log(bar)
    const allBuckets = new Set()
    for (const b of BACKENDS)
        if (digest[b].cpu) for (const k of digest[b].cpu.buckets.keys()) allBuckets.add(k)
    const bucketOrder = [
        'x25519/DH',
        'xeddsa/curve-math',
        'wasm',
        'native-binding',
        'other-crypto',
        'signal/session',
        'store/sqlite',
        'wire/serialize',
        'gc',
        'vm/idle',
        'other'
    ].filter((b) => allBuckets.has(b))
    const col = (v) => String(v).padStart(14)
    console.log('bucket'.padEnd(20) + BACKENDS.map((b) => col(b)).join(''))
    for (const bk of bucketOrder) {
        const row = [bk.padEnd(20)]
        for (const b of BACKENDS) {
            const c = digest[b].cpu
            if (!c) {
                row.push(col('-'))
                continue
            }
            const us = c.buckets.get(bk) || 0
            const pct = c.totalUs ? (us / c.totalUs) * 100 : 0
            row.push(col(`${(us / 1000).toFixed(0)}ms ${pct.toFixed(0)}%`))
        }
        console.log(row.join(''))
    }
    console.log('-'.repeat(72))
    console.log(
        'TOTAL sampled'.padEnd(20) +
            BACKENDS.map((b) =>
                col(digest[b].cpu ? (digest[b].cpu.totalUs / 1000).toFixed(0) + 'ms' : '-')
            ).join('')
    )

    // top functions per backend
    for (const b of BACKENDS) {
        const c = digest[b].cpu
        if (!c) continue
        console.log('')
        console.log(`── top CPU frames — backend=${b} ──`)
        const top = [...c.funcs.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 12)
        for (const [key, us] of top) {
            const pct = c.totalUs ? (us / c.totalUs) * 100 : 0
            console.log(
                `  ${(us / 1000).toFixed(0).padStart(5)}ms ${pct.toFixed(1).padStart(5)}%  ${key}`
            )
        }
    }

    // ─── Heap ───
    console.log('')
    console.log(bar)
    console.log('Retained JS heap at end of run (sum of node self_size)')
    console.log(bar)
    console.log('backend'.padEnd(20) + col('retained') + col('nodes'))
    for (const b of BACKENDS) {
        const h = digest[b].heap
        if (!h) {
            console.log(b.padEnd(20) + col('-'))
            continue
        }
        console.log(
            b.padEnd(20) + col(mib(h.totalBytes) + 'MiB') + col(h.nodeCount.toLocaleString())
        )
    }
    console.log(bar)
    console.log(`artifacts under: ${OUT_ROOT}`)

    if (process.env.PROFILE_JSON) {
        const serial = {}
        for (const b of BACKENDS) {
            serial[b] = {
                cpuTotalMs: digest[b].cpu ? digest[b].cpu.totalUs / 1000 : null,
                buckets: digest[b].cpu
                    ? Object.fromEntries([...digest[b].cpu.buckets].map(([k, v]) => [k, v / 1000]))
                    : null,
                retainedHeapBytes: digest[b].heap ? digest[b].heap.totalBytes : null
            }
        }
        fs.writeFileSync(process.env.PROFILE_JSON, JSON.stringify(serial, null, 2))
        console.log(`wrote ${process.env.PROFILE_JSON}`)
    }
}

main()
