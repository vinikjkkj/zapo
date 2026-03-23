import { FIELD_P, GROUP_L } from '@crypto/math/constants'

export function mod(value: bigint, modulus = FIELD_P): bigint {
    const remainder = value % modulus
    return remainder >= 0n ? remainder : remainder + modulus
}

export function modGroup(value: bigint): bigint {
    return mod(value, GROUP_L)
}

export function modInv(value: bigint, modulus = FIELD_P): bigint {
    if (value === 0n) {
        throw new Error('field inversion by zero')
    }
    return modPow(value, modulus - 2n, modulus)
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
    if (modulus <= 0n) {
        throw new Error('modulus must be positive')
    }
    let result = 1n
    let current = ((base % modulus) + modulus) % modulus
    let e = exponent
    while (e > 0n) {
        if ((e & 1n) === 1n) {
            result = (result * current) % modulus
        }
        current = (current * current) % modulus
        e >>= 1n
    }
    return result
}
