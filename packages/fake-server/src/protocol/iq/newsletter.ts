/**
 * Builder for the newsletter `my_addons` metadata sync IQ.
 *
 * Source:
 *   /deobfuscated/WAWebNewsletter/WAWebNewsletterMyAddonsResponse.js
 *
 * Cross-checked against:
 *   src/transport/node/builders/account-sync.ts (`buildNewsletterMetadataSyncIq`)
 *   src/client/dirty.ts (`syncNewsletterMetadataDirtyBit`)
 *
 * Wire layout the lib emits:
 *
 *   <iq type="get" to="s.whatsapp.net" xmlns="newsletter">
 *     <my_addons limit="1"/>
 *   </iq>
 *
 * The lib only awaits the response and does not call `assertIqResult`,
 * so a bare `<iq type="result"><my_addons/></iq>` is enough.
 */

import type { BinaryNode } from '../../transport/codec'

import { buildIqResult } from './router'

export function buildNewsletterMyAddonsResult(iq: BinaryNode): BinaryNode {
    const result = buildIqResult(iq)
    return {
        ...result,
        content: [
            {
                tag: 'my_addons',
                attrs: {}
            }
        ]
    }
}
