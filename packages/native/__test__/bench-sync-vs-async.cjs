// XEdDSA sync (inline) vs async (libuv pool) bench.
// Run with: node __test__/bench-sync-vs-async.cjs
// Tune pool: UV_THREADPOOL_SIZE=8 node ...

const { performance } = require('node:perf_hooks')
const { randomBytes, createPrivateKey } = require('node:crypto')
const {
    xeddsaSign,
    xeddsaVerify,
    xeddsaSignAsync,
    xeddsaVerifyAsync
} = require('../binding.js')

if (typeof xeddsaSign !== 'function' || typeof xeddsaVerify !== 'function') {
    console.error('native binding NOT loaded')
    process.exit(2)
}
if (typeof xeddsaSignAsync !== 'function' || typeof xeddsaVerifyAsync !== 'function') {
    console.error('async functions NOT exposed')
    process.exit(2)
}

const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex')

function derivePub(priv) {
    const k = createPrivateKey({
        key: Buffer.concat([X25519_PKCS8_PREFIX, priv]),
        format: 'der',
        type: 'pkcs8'
    })
    return Buffer.from(k.export({ format: 'jwk' }).x, 'base64url')
}

const PRIV = randomBytes(32)
const PUB = derivePub(PRIV)
const MSG = Buffer.from('zapo bench message ' + 'x'.repeat(64))
const SIG = xeddsaSign(PRIV, MSG)

function fmt(ns) {
    if (ns < 1_000) return ns.toFixed(0) + 'ns'
    if (ns < 1_000_000) return (ns / 1_000).toFixed(2) + 'µs'
    return (ns / 1_000_000).toFixed(2) + 'ms'
}

function median(arr) {
    const s = arr.slice().sort((a, b) => a - b)
    const mid = s.length >> 1
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

async function timeit(label, runs, iters, fn) {
    // warmup
    for (let i = 0; i < 200; i++) await fn()
    const samples = []
    for (let r = 0; r < runs; r++) {
        const t0 = performance.now()
        for (let i = 0; i < iters; i++) await fn()
        const t1 = performance.now()
        const perOp = ((t1 - t0) * 1e6) / iters
        samples.push(perOp)
    }
    const med = median(samples)
    const opsPerSec = 1e9 / med
    console.log(
        `  ${label.padEnd(36)} ${fmt(med).padStart(10)} / op   ${opsPerSec.toFixed(0).padStart(9)} ops/s`
    )
    return med
}

async function timeitParallel(label, runs, totalOps, concurrency, makePromise) {
    // warmup
    for (let i = 0; i < 5; i++) {
        await Promise.all(Array.from({ length: concurrency }, () => makePromise()))
    }
    const samples = []
    for (let r = 0; r < runs; r++) {
        const t0 = performance.now()
        let done = 0
        while (done < totalOps) {
            const batch = Math.min(concurrency, totalOps - done)
            await Promise.all(Array.from({ length: batch }, () => makePromise()))
            done += batch
        }
        const t1 = performance.now()
        const perOp = ((t1 - t0) * 1e6) / totalOps
        samples.push(perOp)
    }
    const med = median(samples)
    const opsPerSec = 1e9 / med
    console.log(
        `  ${label.padEnd(36)} ${fmt(med).padStart(10)} / op   ${opsPerSec.toFixed(0).padStart(9)} ops/s`
    )
    return med
}

;(async () => {
    const poolSize = process.env.UV_THREADPOOL_SIZE || '4 (default)'
    console.log(`zapo-native bench  |  UV_THREADPOOL_SIZE=${poolSize}`)
    console.log(`node ${process.version}, ${process.platform}-${process.arch}`)
    console.log('')

    const RUNS = 5
    const SERIAL_ITERS = 2000

    console.log(`SIGN — serial (await per call, ${SERIAL_ITERS} iters x ${RUNS} runs):`)
    const signSyncSerial = await timeit('sync (xeddsaSign)', RUNS, SERIAL_ITERS, async () => {
        xeddsaSign(PRIV, MSG)
    })
    const signAsyncSerial = await timeit('async (xeddsaSignAsync)', RUNS, SERIAL_ITERS, async () => {
        await xeddsaSignAsync(PRIV, MSG)
    })
    console.log(
        `  → async/sync ratio: ${(signAsyncSerial / signSyncSerial).toFixed(2)}x (lower is better; >1 = overhead)\n`
    )

    console.log(`VERIFY — serial (await per call, ${SERIAL_ITERS} iters x ${RUNS} runs):`)
    const verSyncSerial = await timeit('sync (xeddsaVerify)', RUNS, SERIAL_ITERS, async () => {
        xeddsaVerify(PUB, MSG, SIG)
    })
    const verAsyncSerial = await timeit(
        'async (xeddsaVerifyAsync)',
        RUNS,
        SERIAL_ITERS,
        async () => {
            await xeddsaVerifyAsync(PUB, MSG, SIG)
        }
    )
    console.log(`  → async/sync ratio: ${(verAsyncSerial / verSyncSerial).toFixed(2)}x\n`)

    // Parallel — total throughput. For sync we just loop (single-threaded); for async we let libuv parallelize.
    const PAR_TOTAL = 4000
    for (const conc of [1, 4, 8, 16, 32]) {
        console.log(`SIGN — concurrency ${conc} (total ${PAR_TOTAL} ops x ${RUNS} runs):`)
        const sSync = await timeitParallel(
            `sync (loop)`,
            RUNS,
            PAR_TOTAL,
            conc,
            async () => xeddsaSign(PRIV, MSG)
        )
        const sAsync = await timeitParallel(
            `async (libuv pool)`,
            RUNS,
            PAR_TOTAL,
            conc,
            () => xeddsaSignAsync(PRIV, MSG)
        )
        console.log(`  → speedup async vs sync: ${(sSync / sAsync).toFixed(2)}x\n`)
    }

    for (const conc of [1, 4, 8, 16, 32]) {
        console.log(`VERIFY — concurrency ${conc} (total ${PAR_TOTAL} ops x ${RUNS} runs):`)
        const vSync = await timeitParallel(
            `sync (loop)`,
            RUNS,
            PAR_TOTAL,
            conc,
            async () => xeddsaVerify(PUB, MSG, SIG)
        )
        const vAsync = await timeitParallel(
            `async (libuv pool)`,
            RUNS,
            PAR_TOTAL,
            conc,
            () => xeddsaVerifyAsync(PUB, MSG, SIG)
        )
        console.log(`  → speedup async vs sync: ${(vSync / vAsync).toFixed(2)}x\n`)
    }
})().catch((err) => {
    console.error(err)
    process.exit(1)
})
