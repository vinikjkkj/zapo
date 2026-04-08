/**
 * Builder for the `<iq xmlns="encrypt">` prekey-fetch result.
 *
 * Source: /deobfuscated/WAWebFetch/WAWebFetchPrekeysJob.js
 *         /deobfuscated/WASmaxIn*PreKeys*
 * Cross-checked against the lib's `parseFetchKeyBundleResponse` in
 * `src/signal/api/SignalSessionSyncApi.ts`.
 *
 * The lib sends a `<key_fetch>` IQ when it needs to start a Signal
 * session with a peer. The fake server replies with a tree like:
 *
 *   <iq type="result" from="s.whatsapp.net" id="<echo>">
 *     <list>
 *       <user jid="<peer-jid>">
 *         <registration>4-byte-be</registration>
 *         <identity>32-bytes</identity>
 *         <skey>
 *           <id>3-byte-be</id>
 *           <value>32-bytes</value>
 *           <signature>64-bytes</signature>
 *         </skey>
 *         <key>                                ← optional, may be omitted
 *           <id>3-byte-be</id>
 *           <value>32-bytes</value>
 *         </key>
 *       </user>
 *     </list>
 *   </iq>
 *
 * Each `<user>` corresponds to one device. For multi-device users the
 * lib sends one user node per device JID.
 */

import type { BinaryNode } from '../../transport/codec'

export interface PreKeyBundleForUser {
    /** Full device JID (e.g. `5511...:0@s.whatsapp.net`). */
    readonly userJid: string
    /** 32-bit registration id. */
    readonly registrationId: number
    /** 32-byte identity public key (raw, no version prefix). */
    readonly identityPublicKey: Uint8Array
    readonly signedPreKey: {
        readonly id: number
        readonly publicKey: Uint8Array
        readonly signature: Uint8Array
    }
    readonly oneTimePreKey?: {
        readonly id: number
        readonly publicKey: Uint8Array
    }
}

export function buildPreKeyFetchResult(
    inboundIq: BinaryNode,
    bundles: readonly PreKeyBundleForUser[]
): BinaryNode {
    const id = inboundIq.attrs.id
    if (!id) {
        throw new Error('cannot build prekey-fetch result without an inbound id')
    }

    const userNodes: BinaryNode[] = bundles.map((bundle) => {
        const children: BinaryNode[] = [
            {
                tag: 'registration',
                attrs: {},
                content: bigEndianBytes(bundle.registrationId, 4)
            },
            {
                tag: 'identity',
                attrs: {},
                content: bundle.identityPublicKey
            },
            {
                tag: 'skey',
                attrs: {},
                content: [
                    {
                        tag: 'id',
                        attrs: {},
                        content: bigEndianBytes(bundle.signedPreKey.id, 3)
                    },
                    {
                        tag: 'value',
                        attrs: {},
                        content: bundle.signedPreKey.publicKey
                    },
                    {
                        tag: 'signature',
                        attrs: {},
                        content: bundle.signedPreKey.signature
                    }
                ]
            }
        ]
        if (bundle.oneTimePreKey) {
            children.push({
                tag: 'key',
                attrs: {},
                content: [
                    {
                        tag: 'id',
                        attrs: {},
                        content: bigEndianBytes(bundle.oneTimePreKey.id, 3)
                    },
                    {
                        tag: 'value',
                        attrs: {},
                        content: bundle.oneTimePreKey.publicKey
                    }
                ]
            })
        }
        return {
            tag: 'user',
            attrs: { jid: bundle.userJid },
            content: children
        }
    })

    return {
        tag: 'iq',
        attrs: {
            id,
            from: inboundIq.attrs.to ?? 's.whatsapp.net',
            type: 'result'
        },
        content: [
            {
                tag: 'list',
                attrs: {},
                content: userNodes
            }
        ]
    }
}

function bigEndianBytes(value: number, length: number): Uint8Array {
    const out = new Uint8Array(length)
    for (let i = length - 1; i >= 0; i -= 1) {
        out[i] = value & 0xff
        value >>>= 8
    }
    return out
}
