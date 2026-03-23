import type { ExtendedPoint } from '@crypto/math/types'

export const FIELD_P = (1n << 255n) - 19n
export const GROUP_L = (1n << 252n) + 27742317777372353535851937790883648493n

function modField(value: bigint): bigint {
    const remainder = value % FIELD_P
    return remainder >= 0n ? remainder : remainder + FIELD_P
}

function modPowField(base: bigint, exponent: bigint): bigint {
    let result = 1n
    let current = modField(base)
    let power = exponent
    while (power > 0n) {
        if ((power & 1n) === 1n) {
            result = modField(result * current)
        }
        current = modField(current * current)
        power >>= 1n
    }
    return result
}

function modInvField(value: bigint): bigint {
    if (value === 0n) {
        throw new Error('field inversion by zero')
    }
    return modPowField(value, FIELD_P - 2n)
}

const BASE_X = 15112221349535400772501151409588531511454012693041857206046113283949847762202n
const BASE_Y = 46316835694926478169428394003475163141307993866256225615783033603165251855960n

const EDWARDS_D = modField(-121665n * modInvField(121666n))
export const TWO_D = modField(2n * EDWARDS_D)
export const BASE_POINT: ExtendedPoint = Object.freeze({
    x: BASE_X,
    y: BASE_Y,
    z: 1n,
    t: modField(BASE_X * BASE_Y)
})
export const IDENTITY_POINT: ExtendedPoint = Object.freeze({
    x: 0n,
    y: 1n,
    z: 1n,
    t: 0n
})
