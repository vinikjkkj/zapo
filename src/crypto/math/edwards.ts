import { BASE_POINT, FE_TWO_D, IDENTITY_POINT } from '@crypto/math/constants'
import { fe, feAdd, feCopy, feInv, feMul, feNeg, fePack, feSub } from '@crypto/math/fe'
import { modGroup } from '@crypto/math/mod'
import type { ExtendedPoint, MutablePoint } from '@crypto/math/types'

// Pre-allocated temporaries for point operations (safe: JS is single-threaded)
const _a = fe()
const _b = fe()
const _c = fe()
const _d = fe()
const _e = fe()
const _f = fe()
const _g = fe()
const _h = fe()

// Pre-allocated output points for hot-path operations
function mutablePoint(): MutablePoint {
    return { x: fe(), y: fe(), z: fe(), t: fe() }
}

const _addOut = mutablePoint()
const _dblOut = mutablePoint()
const _negOut = mutablePoint()

// Temporaries for feInv inside encodeExtendedPoint
const _invZinv = fe()
const _invX = fe()
const _invY = fe()
const _invXBytes = new Uint8Array(32)

function addPointInto(out: MutablePoint, a: ExtendedPoint, b: ExtendedPoint): void {
    feSub(_a, a.y, a.x)
    feSub(_b, b.y, b.x)
    feMul(_a, _a, _b) // aTerm

    feAdd(_b, a.y, a.x)
    feAdd(_c, b.y, b.x)
    feMul(_b, _b, _c) // bTerm

    feMul(_c, FE_TWO_D, a.t)
    feMul(_c, _c, b.t) // cTerm

    feAdd(_d, a.z, a.z)
    feMul(_d, _d, b.z) // dTerm

    feSub(_e, _b, _a) // eTerm
    feSub(_f, _d, _c) // fTerm
    feAdd(_g, _d, _c) // gTerm
    feAdd(_h, _b, _a) // hTerm

    feMul(out.x, _e, _f)
    feMul(out.y, _g, _h)
    feMul(out.z, _f, _g)
    feMul(out.t, _e, _h)
}

function doublePointInto(out: MutablePoint, point: ExtendedPoint): void {
    feMul(_a, point.x, point.x) // aTerm = x^2
    feMul(_b, point.y, point.y) // bTerm = y^2
    feMul(_c, point.z, point.z)
    feAdd(_c, _c, _c) // cTerm = 2*z^2
    feNeg(_d, _a) // dTerm = -aTerm (a=-1 for ed25519)

    feAdd(_e, point.x, point.y)
    feMul(_e, _e, _e)
    feAdd(_f, _a, _b)
    feSub(_e, _e, _f) // eTerm = (x+y)^2 - aTerm - bTerm

    feAdd(_g, _d, _b) // gTerm = dTerm + bTerm
    feSub(_f, _g, _c) // fTerm = gTerm - cTerm
    feSub(_h, _d, _b) // hTerm = dTerm - bTerm

    feMul(out.x, _e, _f)
    feMul(out.y, _g, _h)
    feMul(out.z, _f, _g)
    feMul(out.t, _e, _h)
}

function negatePointInto(out: MutablePoint, p: ExtendedPoint): void {
    feNeg(out.x, p.x)
    feCopy(out.y, p.y)
    feCopy(out.z, p.z)
    feNeg(out.t, p.t)
}

function clonePoint(p: ExtendedPoint): ExtendedPoint {
    const x = fe()
    const y = fe()
    const z = fe()
    const t = fe()
    feCopy(x, p.x)
    feCopy(y, p.y)
    feCopy(z, p.z)
    feCopy(t, p.t)
    return { x, y, z, t }
}

// Allocating versions for precomputation (runs once at module load)
function addPoint(a: ExtendedPoint, b: ExtendedPoint): ExtendedPoint {
    addPointInto(_addOut, a, b)
    return clonePoint(_addOut)
}

function doublePoint(a: ExtendedPoint): ExtendedPoint {
    doublePointInto(_dblOut, a)
    return clonePoint(_dblOut)
}

const W = 5
const halfW = 1 << W
const mask = halfW - 1
const precomp: ExtendedPoint[] = new Array(1 << (W - 1))
precomp[0] = BASE_POINT
const _dbl = doublePoint(BASE_POINT)
for (let i = 1; i < precomp.length; i++) {
    precomp[i] = addPoint(precomp[i - 1], _dbl)
}

// Pre-allocated scratch buffers for scalarMultBase (safe: JS is single-threaded)
const _naf = new Int8Array(256)
const _loopResult = mutablePoint()
const _loopDbl = mutablePoint()
const _loopAdd = mutablePoint()

export function scalarMultBase(scalar: bigint): ExtendedPoint {
    let k = modGroup(scalar)
    if (k === 0n) return clonePoint(IDENTITY_POINT)

    const naf = _naf
    naf.fill(0)
    let nafLen = 0
    while (k > 0n) {
        if ((k & 1n) === 1n) {
            let digit = Number(k & BigInt(mask))
            if (digit >= halfW >> 1) digit -= halfW
            naf[nafLen++] = digit
            k -= BigInt(digit)
        } else {
            nafLen++
        }
        k >>= 1n
    }

    // Copy identity into loop result
    feCopy(_loopResult.x, IDENTITY_POINT.x)
    feCopy(_loopResult.y, IDENTITY_POINT.y)
    feCopy(_loopResult.z, IDENTITY_POINT.z)
    feCopy(_loopResult.t, IDENTITY_POINT.t)

    for (let i = nafLen - 1; i >= 0; i--) {
        doublePointInto(_loopDbl, _loopResult)
        // swap dbl → result
        const tmpX = _loopResult.x
        _loopResult.x = _loopDbl.x
        _loopDbl.x = tmpX
        const tmpY = _loopResult.y
        _loopResult.y = _loopDbl.y
        _loopDbl.y = tmpY
        const tmpZ = _loopResult.z
        _loopResult.z = _loopDbl.z
        _loopDbl.z = tmpZ
        const tmpT = _loopResult.t
        _loopResult.t = _loopDbl.t
        _loopDbl.t = tmpT

        const digit = naf[i]
        if (digit > 0) {
            addPointInto(_loopAdd, _loopResult, precomp[(digit - 1) >> 1])
            const ax = _loopResult.x
            _loopResult.x = _loopAdd.x
            _loopAdd.x = ax
            const ay = _loopResult.y
            _loopResult.y = _loopAdd.y
            _loopAdd.y = ay
            const az = _loopResult.z
            _loopResult.z = _loopAdd.z
            _loopAdd.z = az
            const at = _loopResult.t
            _loopResult.t = _loopAdd.t
            _loopAdd.t = at
        } else if (digit < 0) {
            negatePointInto(_negOut, precomp[(-digit - 1) >> 1])
            addPointInto(_loopAdd, _loopResult, _negOut)
            const ax = _loopResult.x
            _loopResult.x = _loopAdd.x
            _loopAdd.x = ax
            const ay = _loopResult.y
            _loopResult.y = _loopAdd.y
            _loopAdd.y = ay
            const az = _loopResult.z
            _loopResult.z = _loopAdd.z
            _loopAdd.z = az
            const at = _loopResult.t
            _loopResult.t = _loopAdd.t
            _loopAdd.t = at
        }
    }

    return clonePoint(_loopResult)
}

export function encodeExtendedPoint(point: ExtendedPoint): Uint8Array {
    feInv(_invZinv, point.z)
    feMul(_invX, point.x, _invZinv)
    feMul(_invY, point.y, _invZinv)
    const encoded = new Uint8Array(32)
    fePack(encoded, _invY)
    fePack(_invXBytes, _invX)
    encoded[31] = (encoded[31] & 0x7f) | ((_invXBytes[0] & 1) << 7)
    return encoded
}
