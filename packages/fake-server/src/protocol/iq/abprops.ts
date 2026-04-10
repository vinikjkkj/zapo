/** Builds the `abt/props` IQ result consumed by the client ABProps parser. */

import type { BinaryNode } from '../../transport/codec'

import { buildIqResult } from './router'

export interface FakeAbPropEntry {
    readonly configCode: number
    readonly configValue?: string
}

export interface BuildAbPropsResultInput {
    readonly hash?: string
    readonly refreshSeconds?: number
    readonly refreshId?: number
    readonly props?: readonly FakeAbPropEntry[]
}

export function buildAbPropsResult(
    iq: BinaryNode,
    input: BuildAbPropsResultInput = {}
): BinaryNode {
    const result = buildIqResult(iq)
    const propsAttrs: Record<string, string> = {
        protocol: '1',
        hash: input.hash ?? 'fake-abprops-hash',
        refresh: String(input.refreshSeconds ?? 86_400),
        refresh_id: String(input.refreshId ?? 1),
        delta_update: 'false'
    }
    return {
        ...result,
        content: [
            {
                tag: 'props',
                attrs: propsAttrs,
                content: (input.props ?? []).map((prop) => ({
                    tag: 'prop',
                    attrs: {
                        config_code: String(prop.configCode),
                        ...(prop.configValue !== undefined
                            ? { config_value: prop.configValue }
                            : {})
                    }
                }))
            }
        ]
    }
}
