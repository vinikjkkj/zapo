/**
 * Field element arithmetic for GF(2^255-19).
 * Representation: 16 limbs of 16 bits in Float64Array (tweetnacl style).
 * Hot-path operations are allocation-free using pre-allocated temporaries.
 */

export type Fe = Float64Array

export function fe(): Fe {
    return new Float64Array(16)
}

export function feCopy(o: Fe, a: Fe): void {
    o.set(a)
}

export function feFromBigInt(n: bigint): Fe {
    const o = fe()
    for (let i = 0; i < 16; i++) {
        o[i] = Number(n & 0xffffn)
        n >>= 16n
    }
    return o
}

export function feToBigInt(a: Fe): bigint {
    const bytes = new Uint8Array(32)
    fePack(bytes, a)
    let r = 0n
    for (let i = 31; i >= 0; i--) {
        r = (r << 8n) | BigInt(bytes[i])
    }
    return r
}

export function feFromBytes(o: Fe, s: Uint8Array): void {
    for (let i = 0; i < 16; i++) {
        o[i] = s[2 * i] | (s[2 * i + 1] << 8)
    }
    o[15] &= 0x7fff
}

function feCarry(o: Fe): void {
    let c = 1
    for (let i = 0; i < 16; i++) {
        const v = o[i] + c + 65535
        c = Math.floor(v / 65536)
        o[i] = v - c * 65536
    }
    o[0] += c - 1 + 37 * (c - 1)
}

function feSel(p: Fe, q: Fe, b: number): void {
    const c = ~(b - 1)
    for (let i = 0; i < 16; i++) {
        const t = c & (p[i] ^ q[i])
        p[i] ^= t
        q[i] ^= t
    }
}

// Pre-allocated temporaries for fePack (safe: JS is single-threaded)
const _packT = fe()
const _packM = fe()

export function fePack(o: Uint8Array, n: Fe): void {
    const t = _packT
    const m = _packM
    feCopy(t, n)
    feCarry(t)
    feCarry(t)
    feCarry(t)
    for (let j = 0; j < 2; j++) {
        m[0] = t[0] - 0xffed
        for (let i = 1; i < 15; i++) {
            m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1)
            m[i - 1] &= 0xffff
        }
        m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1)
        const b = (m[15] >> 16) & 1
        m[14] &= 0xffff
        feSel(t, m, 1 - b)
    }
    for (let i = 0; i < 16; i++) {
        o[2 * i] = t[i] & 0xff
        o[2 * i + 1] = t[i] >> 8
    }
}

export function feAdd(o: Fe, a: Fe, b: Fe): void {
    for (let i = 0; i < 16; i++) o[i] = a[i] + b[i]
}

export function feSub(o: Fe, a: Fe, b: Fe): void {
    for (let i = 0; i < 16; i++) o[i] = a[i] - b[i]
}

export function feNeg(o: Fe, a: Fe): void {
    for (let i = 0; i < 16; i++) o[i] = -a[i]
}

/**
 * Fully unrolled field multiplication with folded reduction.
 * Computes o = a * b mod (2^255-19) using negacyclic convolution:
 * t[i] = Σ a[j]*b[i-j] (direct) + 38 * Σ a[j]*b[i+16-j] (wrapped)
 * All values in local variables for register allocation.
 */
export function feMul(o: Fe, a: Fe, b: Fe): void {
    const a0 = a[0],
        a1 = a[1],
        a2 = a[2],
        a3 = a[3]
    const a4 = a[4],
        a5 = a[5],
        a6 = a[6],
        a7 = a[7]
    const a8 = a[8],
        a9 = a[9],
        a10 = a[10],
        a11 = a[11]
    const a12 = a[12],
        a13 = a[13],
        a14 = a[14],
        a15 = a[15]
    const b0 = b[0],
        b1 = b[1],
        b2 = b[2],
        b3 = b[3]
    const b4 = b[4],
        b5 = b[5],
        b6 = b[6],
        b7 = b[7]
    const b8 = b[8],
        b9 = b[9],
        b10 = b[10],
        b11 = b[11]
    const b12 = b[12],
        b13 = b[13],
        b14 = b[14],
        b15 = b[15]
    const v1 = 38 * b1,
        v2 = 38 * b2,
        v3 = 38 * b3,
        v4 = 38 * b4
    const v5 = 38 * b5,
        v6 = 38 * b6,
        v7 = 38 * b7,
        v8 = 38 * b8
    const v9 = 38 * b9,
        v10 = 38 * b10,
        v11 = 38 * b11,
        v12 = 38 * b12
    const v13 = 38 * b13,
        v14 = 38 * b14,
        v15 = 38 * b15

    let t0 =
        a0 * b0 +
        a1 * v15 +
        a2 * v14 +
        a3 * v13 +
        a4 * v12 +
        a5 * v11 +
        a6 * v10 +
        a7 * v9 +
        a8 * v8 +
        a9 * v7 +
        a10 * v6 +
        a11 * v5 +
        a12 * v4 +
        a13 * v3 +
        a14 * v2 +
        a15 * v1
    let t1 =
        a0 * b1 +
        a1 * b0 +
        a2 * v15 +
        a3 * v14 +
        a4 * v13 +
        a5 * v12 +
        a6 * v11 +
        a7 * v10 +
        a8 * v9 +
        a9 * v8 +
        a10 * v7 +
        a11 * v6 +
        a12 * v5 +
        a13 * v4 +
        a14 * v3 +
        a15 * v2
    let t2 =
        a0 * b2 +
        a1 * b1 +
        a2 * b0 +
        a3 * v15 +
        a4 * v14 +
        a5 * v13 +
        a6 * v12 +
        a7 * v11 +
        a8 * v10 +
        a9 * v9 +
        a10 * v8 +
        a11 * v7 +
        a12 * v6 +
        a13 * v5 +
        a14 * v4 +
        a15 * v3
    let t3 =
        a0 * b3 +
        a1 * b2 +
        a2 * b1 +
        a3 * b0 +
        a4 * v15 +
        a5 * v14 +
        a6 * v13 +
        a7 * v12 +
        a8 * v11 +
        a9 * v10 +
        a10 * v9 +
        a11 * v8 +
        a12 * v7 +
        a13 * v6 +
        a14 * v5 +
        a15 * v4
    let t4 =
        a0 * b4 +
        a1 * b3 +
        a2 * b2 +
        a3 * b1 +
        a4 * b0 +
        a5 * v15 +
        a6 * v14 +
        a7 * v13 +
        a8 * v12 +
        a9 * v11 +
        a10 * v10 +
        a11 * v9 +
        a12 * v8 +
        a13 * v7 +
        a14 * v6 +
        a15 * v5
    let t5 =
        a0 * b5 +
        a1 * b4 +
        a2 * b3 +
        a3 * b2 +
        a4 * b1 +
        a5 * b0 +
        a6 * v15 +
        a7 * v14 +
        a8 * v13 +
        a9 * v12 +
        a10 * v11 +
        a11 * v10 +
        a12 * v9 +
        a13 * v8 +
        a14 * v7 +
        a15 * v6
    let t6 =
        a0 * b6 +
        a1 * b5 +
        a2 * b4 +
        a3 * b3 +
        a4 * b2 +
        a5 * b1 +
        a6 * b0 +
        a7 * v15 +
        a8 * v14 +
        a9 * v13 +
        a10 * v12 +
        a11 * v11 +
        a12 * v10 +
        a13 * v9 +
        a14 * v8 +
        a15 * v7
    let t7 =
        a0 * b7 +
        a1 * b6 +
        a2 * b5 +
        a3 * b4 +
        a4 * b3 +
        a5 * b2 +
        a6 * b1 +
        a7 * b0 +
        a8 * v15 +
        a9 * v14 +
        a10 * v13 +
        a11 * v12 +
        a12 * v11 +
        a13 * v10 +
        a14 * v9 +
        a15 * v8
    let t8 =
        a0 * b8 +
        a1 * b7 +
        a2 * b6 +
        a3 * b5 +
        a4 * b4 +
        a5 * b3 +
        a6 * b2 +
        a7 * b1 +
        a8 * b0 +
        a9 * v15 +
        a10 * v14 +
        a11 * v13 +
        a12 * v12 +
        a13 * v11 +
        a14 * v10 +
        a15 * v9
    let t9 =
        a0 * b9 +
        a1 * b8 +
        a2 * b7 +
        a3 * b6 +
        a4 * b5 +
        a5 * b4 +
        a6 * b3 +
        a7 * b2 +
        a8 * b1 +
        a9 * b0 +
        a10 * v15 +
        a11 * v14 +
        a12 * v13 +
        a13 * v12 +
        a14 * v11 +
        a15 * v10
    let t10 =
        a0 * b10 +
        a1 * b9 +
        a2 * b8 +
        a3 * b7 +
        a4 * b6 +
        a5 * b5 +
        a6 * b4 +
        a7 * b3 +
        a8 * b2 +
        a9 * b1 +
        a10 * b0 +
        a11 * v15 +
        a12 * v14 +
        a13 * v13 +
        a14 * v12 +
        a15 * v11
    let t11 =
        a0 * b11 +
        a1 * b10 +
        a2 * b9 +
        a3 * b8 +
        a4 * b7 +
        a5 * b6 +
        a6 * b5 +
        a7 * b4 +
        a8 * b3 +
        a9 * b2 +
        a10 * b1 +
        a11 * b0 +
        a12 * v15 +
        a13 * v14 +
        a14 * v13 +
        a15 * v12
    let t12 =
        a0 * b12 +
        a1 * b11 +
        a2 * b10 +
        a3 * b9 +
        a4 * b8 +
        a5 * b7 +
        a6 * b6 +
        a7 * b5 +
        a8 * b4 +
        a9 * b3 +
        a10 * b2 +
        a11 * b1 +
        a12 * b0 +
        a13 * v15 +
        a14 * v14 +
        a15 * v13
    let t13 =
        a0 * b13 +
        a1 * b12 +
        a2 * b11 +
        a3 * b10 +
        a4 * b9 +
        a5 * b8 +
        a6 * b7 +
        a7 * b6 +
        a8 * b5 +
        a9 * b4 +
        a10 * b3 +
        a11 * b2 +
        a12 * b1 +
        a13 * b0 +
        a14 * v15 +
        a15 * v14
    let t14 =
        a0 * b14 +
        a1 * b13 +
        a2 * b12 +
        a3 * b11 +
        a4 * b10 +
        a5 * b9 +
        a6 * b8 +
        a7 * b7 +
        a8 * b6 +
        a9 * b5 +
        a10 * b4 +
        a11 * b3 +
        a12 * b2 +
        a13 * b1 +
        a14 * b0 +
        a15 * v15
    let t15 =
        a0 * b15 +
        a1 * b14 +
        a2 * b13 +
        a3 * b12 +
        a4 * b11 +
        a5 * b10 +
        a6 * b9 +
        a7 * b8 +
        a8 * b7 +
        a9 * b6 +
        a10 * b5 +
        a11 * b4 +
        a12 * b3 +
        a13 * b2 +
        a14 * b1 +
        a15 * b0

    // Carry chain round 1
    let c = Math.floor(t0 / 65536)
    t0 -= c * 65536
    t1 += c
    c = Math.floor(t1 / 65536)
    t1 -= c * 65536
    t2 += c
    c = Math.floor(t2 / 65536)
    t2 -= c * 65536
    t3 += c
    c = Math.floor(t3 / 65536)
    t3 -= c * 65536
    t4 += c
    c = Math.floor(t4 / 65536)
    t4 -= c * 65536
    t5 += c
    c = Math.floor(t5 / 65536)
    t5 -= c * 65536
    t6 += c
    c = Math.floor(t6 / 65536)
    t6 -= c * 65536
    t7 += c
    c = Math.floor(t7 / 65536)
    t7 -= c * 65536
    t8 += c
    c = Math.floor(t8 / 65536)
    t8 -= c * 65536
    t9 += c
    c = Math.floor(t9 / 65536)
    t9 -= c * 65536
    t10 += c
    c = Math.floor(t10 / 65536)
    t10 -= c * 65536
    t11 += c
    c = Math.floor(t11 / 65536)
    t11 -= c * 65536
    t12 += c
    c = Math.floor(t12 / 65536)
    t12 -= c * 65536
    t13 += c
    c = Math.floor(t13 / 65536)
    t13 -= c * 65536
    t14 += c
    c = Math.floor(t14 / 65536)
    t14 -= c * 65536
    t15 += c
    c = Math.floor(t15 / 65536)
    t15 -= c * 65536
    t0 += 38 * c
    // Carry chain round 2
    c = Math.floor(t0 / 65536)
    t0 -= c * 65536
    t1 += c
    c = Math.floor(t1 / 65536)
    t1 -= c * 65536
    t2 += c
    c = Math.floor(t2 / 65536)
    t2 -= c * 65536
    t3 += c
    c = Math.floor(t3 / 65536)
    t3 -= c * 65536
    t4 += c
    c = Math.floor(t4 / 65536)
    t4 -= c * 65536
    t5 += c
    c = Math.floor(t5 / 65536)
    t5 -= c * 65536
    t6 += c
    c = Math.floor(t6 / 65536)
    t6 -= c * 65536
    t7 += c
    c = Math.floor(t7 / 65536)
    t7 -= c * 65536
    t8 += c
    c = Math.floor(t8 / 65536)
    t8 -= c * 65536
    t9 += c
    c = Math.floor(t9 / 65536)
    t9 -= c * 65536
    t10 += c
    c = Math.floor(t10 / 65536)
    t10 -= c * 65536
    t11 += c
    c = Math.floor(t11 / 65536)
    t11 -= c * 65536
    t12 += c
    c = Math.floor(t12 / 65536)
    t12 -= c * 65536
    t13 += c
    c = Math.floor(t13 / 65536)
    t13 -= c * 65536
    t14 += c
    c = Math.floor(t14 / 65536)
    t14 -= c * 65536
    t15 += c
    c = Math.floor(t15 / 65536)
    t15 -= c * 65536
    t0 += 38 * c

    o[0] = t0
    o[1] = t1
    o[2] = t2
    o[3] = t3
    o[4] = t4
    o[5] = t5
    o[6] = t6
    o[7] = t7
    o[8] = t8
    o[9] = t9
    o[10] = t10
    o[11] = t11
    o[12] = t12
    o[13] = t13
    o[14] = t14
    o[15] = t15
}

/**
 * Fully unrolled field squaring with folded reduction and symmetry.
 * Exploits a[j]*a[k] == a[k]*a[j] to halve off-diagonal multiplications.
 * Combined with negacyclic reduction: wrapped terms use a38[k] = 38*a[k].
 */
export function feSqr(o: Fe, a: Fe): void {
    const a0 = a[0],
        a1 = a[1],
        a2 = a[2],
        a3 = a[3]
    const a4 = a[4],
        a5 = a[5],
        a6 = a[6],
        a7 = a[7]
    const a8 = a[8],
        a9 = a[9],
        a10 = a[10],
        a11 = a[11]
    const a12 = a[12],
        a13 = a[13],
        a14 = a[14],
        a15 = a[15]
    const v8 = 38 * a8,
        v9 = 38 * a9,
        v10 = 38 * a10,
        v11 = 38 * a11
    const v12 = 38 * a12,
        v13 = 38 * a13,
        v14 = 38 * a14,
        v15 = 38 * a15

    let t0 =
        a0 * a0 +
        2 * (a1 * v15 + a2 * v14 + a3 * v13 + a4 * v12 + a5 * v11 + a6 * v10 + a7 * v9) +
        a8 * v8
    let t1 =
        2 * (a0 * a1 + a2 * v15 + a3 * v14 + a4 * v13 + a5 * v12 + a6 * v11 + a7 * v10 + a8 * v9)
    let t2 =
        a1 * a1 +
        2 * (a0 * a2 + a3 * v15 + a4 * v14 + a5 * v13 + a6 * v12 + a7 * v11 + a8 * v10) +
        a9 * v9
    let t3 =
        2 * (a0 * a3 + a1 * a2 + a4 * v15 + a5 * v14 + a6 * v13 + a7 * v12 + a8 * v11 + a9 * v10)
    let t4 =
        a2 * a2 +
        2 * (a0 * a4 + a1 * a3 + a5 * v15 + a6 * v14 + a7 * v13 + a8 * v12 + a9 * v11) +
        a10 * v10
    let t5 =
        2 * (a0 * a5 + a1 * a4 + a2 * a3 + a6 * v15 + a7 * v14 + a8 * v13 + a9 * v12 + a10 * v11)
    let t6 =
        a3 * a3 +
        2 * (a0 * a6 + a1 * a5 + a2 * a4 + a7 * v15 + a8 * v14 + a9 * v13 + a10 * v12) +
        a11 * v11
    let t7 =
        2 * (a0 * a7 + a1 * a6 + a2 * a5 + a3 * a4 + a8 * v15 + a9 * v14 + a10 * v13 + a11 * v12)
    let t8 =
        a4 * a4 +
        2 * (a0 * a8 + a1 * a7 + a2 * a6 + a3 * a5 + a9 * v15 + a10 * v14 + a11 * v13) +
        a12 * v12
    let t9 =
        2 * (a0 * a9 + a1 * a8 + a2 * a7 + a3 * a6 + a4 * a5 + a10 * v15 + a11 * v14 + a12 * v13)
    let t10 =
        a5 * a5 +
        2 * (a0 * a10 + a1 * a9 + a2 * a8 + a3 * a7 + a4 * a6 + a11 * v15 + a12 * v14) +
        a13 * v13
    let t11 =
        2 * (a0 * a11 + a1 * a10 + a2 * a9 + a3 * a8 + a4 * a7 + a5 * a6 + a12 * v15 + a13 * v14)
    let t12 =
        a6 * a6 +
        2 * (a0 * a12 + a1 * a11 + a2 * a10 + a3 * a9 + a4 * a8 + a5 * a7 + a13 * v15) +
        a14 * v14
    let t13 =
        2 * (a0 * a13 + a1 * a12 + a2 * a11 + a3 * a10 + a4 * a9 + a5 * a8 + a6 * a7 + a14 * v15)
    let t14 =
        a7 * a7 +
        2 * (a0 * a14 + a1 * a13 + a2 * a12 + a3 * a11 + a4 * a10 + a5 * a9 + a6 * a8) +
        a15 * v15
    let t15 =
        2 * (a0 * a15 + a1 * a14 + a2 * a13 + a3 * a12 + a4 * a11 + a5 * a10 + a6 * a9 + a7 * a8)

    // Carry chain round 1
    let c = Math.floor(t0 / 65536)
    t0 -= c * 65536
    t1 += c
    c = Math.floor(t1 / 65536)
    t1 -= c * 65536
    t2 += c
    c = Math.floor(t2 / 65536)
    t2 -= c * 65536
    t3 += c
    c = Math.floor(t3 / 65536)
    t3 -= c * 65536
    t4 += c
    c = Math.floor(t4 / 65536)
    t4 -= c * 65536
    t5 += c
    c = Math.floor(t5 / 65536)
    t5 -= c * 65536
    t6 += c
    c = Math.floor(t6 / 65536)
    t6 -= c * 65536
    t7 += c
    c = Math.floor(t7 / 65536)
    t7 -= c * 65536
    t8 += c
    c = Math.floor(t8 / 65536)
    t8 -= c * 65536
    t9 += c
    c = Math.floor(t9 / 65536)
    t9 -= c * 65536
    t10 += c
    c = Math.floor(t10 / 65536)
    t10 -= c * 65536
    t11 += c
    c = Math.floor(t11 / 65536)
    t11 -= c * 65536
    t12 += c
    c = Math.floor(t12 / 65536)
    t12 -= c * 65536
    t13 += c
    c = Math.floor(t13 / 65536)
    t13 -= c * 65536
    t14 += c
    c = Math.floor(t14 / 65536)
    t14 -= c * 65536
    t15 += c
    c = Math.floor(t15 / 65536)
    t15 -= c * 65536
    t0 += 38 * c
    // Carry chain round 2
    c = Math.floor(t0 / 65536)
    t0 -= c * 65536
    t1 += c
    c = Math.floor(t1 / 65536)
    t1 -= c * 65536
    t2 += c
    c = Math.floor(t2 / 65536)
    t2 -= c * 65536
    t3 += c
    c = Math.floor(t3 / 65536)
    t3 -= c * 65536
    t4 += c
    c = Math.floor(t4 / 65536)
    t4 -= c * 65536
    t5 += c
    c = Math.floor(t5 / 65536)
    t5 -= c * 65536
    t6 += c
    c = Math.floor(t6 / 65536)
    t6 -= c * 65536
    t7 += c
    c = Math.floor(t7 / 65536)
    t7 -= c * 65536
    t8 += c
    c = Math.floor(t8 / 65536)
    t8 -= c * 65536
    t9 += c
    c = Math.floor(t9 / 65536)
    t9 -= c * 65536
    t10 += c
    c = Math.floor(t10 / 65536)
    t10 -= c * 65536
    t11 += c
    c = Math.floor(t11 / 65536)
    t11 -= c * 65536
    t12 += c
    c = Math.floor(t12 / 65536)
    t12 -= c * 65536
    t13 += c
    c = Math.floor(t13 / 65536)
    t13 -= c * 65536
    t14 += c
    c = Math.floor(t14 / 65536)
    t14 -= c * 65536
    t15 += c
    c = Math.floor(t15 / 65536)
    t15 -= c * 65536
    t0 += 38 * c

    o[0] = t0
    o[1] = t1
    o[2] = t2
    o[3] = t3
    o[4] = t4
    o[5] = t5
    o[6] = t6
    o[7] = t7
    o[8] = t8
    o[9] = t9
    o[10] = t10
    o[11] = t11
    o[12] = t12
    o[13] = t13
    o[14] = t14
    o[15] = t15
}

export function feSqrN(o: Fe, a: Fe, n: number): void {
    feCopy(o, a)
    for (let i = 0; i < n; i++) {
        feSqr(o, o)
    }
}

// Pre-allocated temporaries for feInv (safe: JS is single-threaded)
const _inv0 = fe()
const _inv1 = fe()
const _inv2 = fe()
const _inv3 = fe()

export function feInv(o: Fe, a: Fe): void {
    const t0 = _inv0
    const t1 = _inv1
    const t2 = _inv2
    const t3 = _inv3

    // a^2
    feSqr(t0, a)
    // a^8
    feSqrN(t1, t0, 2)
    // a^9
    feMul(t1, a, t1)
    // a^11
    feMul(t0, t0, t1)
    // a^22
    feSqr(t2, t0)
    // a^(2^5-1)
    feMul(t1, t1, t2)

    feSqrN(t2, t1, 5)
    // a^(2^10-1)
    feMul(t1, t2, t1)

    feSqrN(t2, t1, 10)
    // a^(2^20-1)
    feMul(t2, t2, t1)

    feSqrN(t3, t2, 20)
    // a^(2^40-1)
    feMul(t2, t3, t2)

    feSqrN(t2, t2, 10)
    // a^(2^50-1)
    feMul(t1, t2, t1)

    feSqrN(t2, t1, 50)
    // a^(2^100-1)
    feMul(t2, t2, t1)

    feSqrN(t3, t2, 100)
    // a^(2^200-1)
    feMul(t2, t3, t2)

    feSqrN(t2, t2, 50)
    // a^(2^250-1)
    feMul(t1, t2, t1)

    feSqrN(t1, t1, 5)
    // a^(2^255-21) = a^(p-2)
    feMul(o, t1, t0)
}
