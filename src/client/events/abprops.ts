import { findNodeChild, getNodeChildren } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt } from '@util/primitives'

export interface AbPropResponseEntry {
    readonly configCode: number
    readonly configValue: string | null
}

export interface AbPropSyncResult {
    readonly abKey: string | null
    readonly hash: string | null
    readonly refresh: number | null
    readonly refreshId: number | null
    readonly isDeltaUpdate: boolean
    readonly props: readonly AbPropResponseEntry[]
}

export function parseAbPropsIqResult(node: BinaryNode): AbPropSyncResult {
    const propsNode = findNodeChild(node, 'props')
    if (!propsNode) {
        return {
            abKey: null,
            hash: null,
            refresh: null,
            refreshId: null,
            isDeltaUpdate: false,
            props: []
        }
    }

    const attrs = propsNode.attrs
    const propChildren = getNodeChildren(propsNode)
    const props: AbPropResponseEntry[] = []

    for (let i = 0; i < propChildren.length; i += 1) {
        const child = propChildren[i]
        if (child.tag !== 'prop') {
            continue
        }
        const configCode = parseOptionalInt(child.attrs.config_code)
        if (configCode === undefined) {
            continue
        }
        props.push({
            configCode,
            configValue: child.attrs.config_value ?? null
        })
    }

    return {
        abKey: attrs.ab_key ?? null,
        hash: attrs.hash ?? null,
        refresh: parseOptionalInt(attrs.refresh) ?? null,
        refreshId: parseOptionalInt(attrs.refresh_id) ?? null,
        isDeltaUpdate: attrs.delta_update === 'true',
        props
    }
}
