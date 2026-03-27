import type { Fe } from '@crypto/math/fe'

export interface ExtendedPoint {
    readonly x: Fe
    readonly y: Fe
    readonly z: Fe
    readonly t: Fe
}

export interface MutablePoint {
    x: Fe
    y: Fe
    z: Fe
    t: Fe
}
