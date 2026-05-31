import { WA_DEFAULTS, WA_IQ_TYPES, WA_XMLNS } from '@protocol/constants'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export type WaPassiveMode = 'active' | 'passive'

export function buildPassiveModeIqNode(mode: WaPassiveMode): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.PASSIVE, [
        { tag: mode, attrs: {} }
    ])
}
