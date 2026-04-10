/** Builder for `encrypt` prekey-fetch IQ responses. */

import type { BinaryNode } from '../../transport/codec'

export interface PreKeyBundleForUser {
    readonly userJid: string
    readonly registrationId: number
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
