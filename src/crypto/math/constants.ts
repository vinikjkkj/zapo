import { fe, feFromBigInt, type Fe } from '@crypto/math/fe'
import type { ExtendedPoint } from '@crypto/math/types'

export const FIELD_P = (1n << 255n) - 19n
export const GROUP_L = (1n << 252n) + 27742317777372353535851937790883648493n

export const FE_TWO_D: Fe =
    feFromBigInt(16295367250680780974490674513165176452449235426866156013048779062215315747161n)

export const FE_ZERO: Fe = fe()
export const FE_ONE: Fe = feFromBigInt(1n)

export const BASE_POINT: ExtendedPoint = Object.freeze({
    x: feFromBigInt(15112221349535400772501151409588531511454012693041857206046113283949847762202n),
    y: feFromBigInt(46316835694926478169428394003475163141307993866256225615783033603165251855960n),
    z: feFromBigInt(1n),
    t: feFromBigInt(46827403850823179245072216630277197565144205554125654976674165829533817101731n)
})

export const IDENTITY_POINT: ExtendedPoint = Object.freeze({
    x: feFromBigInt(0n),
    y: feFromBigInt(1n),
    z: feFromBigInt(1n),
    t: feFromBigInt(0n)
})
