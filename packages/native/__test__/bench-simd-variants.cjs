// Crypto micro-bench isolating the effect of wasm SIMD on the curve
// primitives. Compares NAPI vs wasm variants (scalar / +simd128 /
// +simd128+dalek-64bit) on x25519 ECDH, XEdDSA sign, XEdDSA verify.
// Also validates byte-parity with NAPI before timing.
//
// Run: node packages/native/__test__/bench-simd-variants.cjs

'use strict'

const { performance } = require('node:perf_hooks')
const { randomBytes, createPrivateKey, diffieHellman, createPublicKey } = require('node:crypto')
const path = require('node:path')

const napi = require('../binding.js')

function tryLoad(rel) {
    try {
        return require(rel)
    } catch (e) {
        return null
    }
}

const variants = [
    { name: 'napi', mod: napi },
    { name: 'wasm', mod: tryLoad('../wasm/pkg/zapo_native_wasm.js') },
    { name: 'wasm-simd', mod: tryLoad('../wasm/pkg-simd/zapo_native_wasm.js') },
    { name: 'wasm-simd64', mod: tryLoad('../wasm/pkg-simd64/zapo_native_wasm.js') }
].filter((v) => v.mod)

const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex')
const X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex')

function derivePub(priv) {
    const k = createPrivateKey({
        key: Buffer.concat([X25519_PKCS8_PREFIX, priv]),
        format: 'der',
        type: 'pkcs8'
    })
    return Buffer.from(k.export({ format: 'jwk' }).x, 'base64url')
}

// node:crypto x25519 DH (the "no-native" reference path) for scalarMult
function nodeDh(priv, pub) {
    const privateKey = createPrivateKey({
        key: Buffer.concat([X25519_PKCS8_PREFIX, priv]),
        format: 'der',
        type: 'pkcs8'
    })
    const publicKey = createPublicKey({
        key: Buffer.concat([X25519_SPKI_PREFIX, pub]),
        format: 'der',
        type: 'spki'
    })
    return diffieHellman({ privateKey, publicKey })
}

const PRIV = randomBytes(32)
const PUB = derivePub(PRIV)
const PEER_PRIV = randomBytes(32)
const PEER_PUB = derivePub(PEER_PRIV)
const MSG = Buffer.from('zapo simd bench ' + 'x'.repeat(64))
const SIG = Buffer.from(napi.xeddsaSign(PRIV, MSG))

// ─── correctness: every variant must match napi ───
console.log('parity check vs napi:')
for (const v of variants) {
    if (v.name === 'napi') continue
    let ok = true
    for (let i = 0; i < 100; i++) {
        const a = randomBytes(32)
        const b = randomBytes(32)
        const pb = derivePub(b)
        const s1 = Buffer.from(napi.x25519ScalarMult(a, pb))
        const s2 = Buffer.from(v.mod.x25519ScalarMult(a, pb))
        if (!s1.equals(s2)) {
            ok = false
            break
        }
        const m = randomBytes(48)
        const pa = derivePub(a)
        const sig = Buffer.from(v.mod.xeddsaSign(a, m))
        if (!napi.xeddsaVerify(pa, m, sig)) {
            ok = false
            break
        }
        if (!v.mod.xeddsaVerify(pa, m, sig)) {
            ok = false
            break
        }
    }
    console.log(`  ${v.name.padEnd(14)} ${ok ? 'OK' : 'MISMATCH ✗'}`)
}
console.log('')

function median(arr) {
    const s = arr.slice().sort((a, b) => a - b)
    const m = s.length >> 1
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function timeit(fn, iters = 5000, runs = 7) {
    for (let i = 0; i < 500; i++) fn() // warmup
    const samples = []
    for (let r = 0; r < runs; r++) {
        const t0 = performance.now()
        for (let i = 0; i < iters; i++) fn()
        const t1 = performance.now()
        samples.push(((t1 - t0) * 1e6) / iters) // ns/op
    }
    return median(samples)
}

function fmt(ns) {
    if (ns < 1000) return ns.toFixed(0) + 'ns'
    return (ns / 1000).toFixed(2) + 'µs'
}

const ops = [
    { label: 'x25519 scalarMult', fn: (m) => () => m.x25519ScalarMult(PRIV, PEER_PUB) },
    { label: 'xeddsa sign', fn: (m) => () => m.xeddsaSign(PRIV, MSG) },
    { label: 'xeddsa verify', fn: (m) => () => m.xeddsaVerify(PUB, MSG, SIG) }
]

console.log(`node ${process.version}, ${process.platform}-${process.arch}`)
console.log('median ns/op (lower better) | ops/s | ratio vs napi (>1 = slower than napi)\n')

for (const op of ops) {
    console.log(`── ${op.label} ──`)
    const napiNs = timeit(op.fn(napi))
    const results = []
    // node:crypto reference for scalarMult only
    if (op.label.startsWith('x25519')) {
        const nodeNs = timeit(() => nodeDh(PRIV, PEER_PUB))
        results.push({ name: 'node:crypto DH', ns: nodeNs })
    }
    for (const v of variants) {
        results.push({ name: v.name, ns: timeit(op.fn(v.mod)) })
    }
    for (const r of results) {
        const opsPerSec = 1e9 / r.ns
        const ratio = r.ns / napiNs
        console.log(
            `  ${r.name.padEnd(16)} ${fmt(r.ns).padStart(9)}   ${opsPerSec.toFixed(0).padStart(9)} ops/s   ${ratio.toFixed(2)}x`
        )
    }
    console.log('')
}
