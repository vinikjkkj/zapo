/**
 * Builder for `<iq xmlns="abt" type="get"><props .../></iq>` responses.
 *
 * Source:
 *   /deobfuscated/WAWebABProps/WAWebABPropsResponse.js
 *
 * Cross-checked against the lib's `parseAbPropsIqResult`
 * (`src/client/events/abprops.ts`).
 *
 * Wire layout
 * -----------
 *   <iq type="result" id="<echo>" from="s.whatsapp.net">
 *     <props
 *         protocol="<integer>"
 *         hash="<string>"
 *         refresh="<int seconds>"
 *         refresh_id="<int>"
 *         delta_update="false">
 *       <prop config_code="<int>" config_value="<string>"/>
 *       ...
 *     </props>
 *   </iq>
 *
 * The lib only validates that `<props>` exists and reads `protocol`,
 * `hash`, `refresh`, `refresh_id` plus zero or more `<prop>` children.
 * Tests rarely care about the values; the empty default below is
 * enough to keep the lib's startup loop happy.
 */

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
