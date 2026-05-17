import { FIELD_P, GROUP_L } from '@crypto/math/constants'

export function mod(value: bigint, modulus = FIELD_P): bigint {
    const remainder = value % modulus
    return remainder >= 0n ? remainder : remainder + modulus
}

export function modGroup(value: bigint): bigint {
    return mod(value, GROUP_L)
}
