import { WA_DEFAULTS, WA_NODE_TAGS, WA_XMLNS } from '../../protocol/constants'
import { buildIqNode, parseIqError } from '../../transport/node/query'
import type { BinaryNode } from '../../transport/types'
import { toBytesView } from '../../util/bytes'
import type { PreKeyRecord, RegistrationInfo, SignedPreKeyRecord } from '../types'

import { SIGNAL_KEY_BUNDLE_TYPE_BYTES } from './constants'

export function intToBigEndianBytes(value: number, byteLength: number): Uint8Array {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`invalid integer value ${value}`)
    }
    const out = new Uint8Array(byteLength)
    let current = value
    for (let index = byteLength - 1; index >= 0; index -= 1) {
        out[index] = current & 0xff
        current = Math.floor(current / 256)
    }
    return out
}

export function buildPreKeyUploadIq(
    registrationInfo: RegistrationInfo,
    signedPreKey: SignedPreKeyRecord,
    preKeys: readonly PreKeyRecord[]
) {
    return buildIqNode('set', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.SIGNAL, [
        {
            tag: WA_NODE_TAGS.REGISTRATION,
            attrs: {},
            content: intToBigEndianBytes(registrationInfo.registrationId, 4)
        },
        {
            tag: WA_NODE_TAGS.TYPE,
            attrs: {},
            content: SIGNAL_KEY_BUNDLE_TYPE_BYTES
        },
        {
            tag: WA_NODE_TAGS.IDENTITY,
            attrs: {},
            content: toBytesView(registrationInfo.identityKeyPair.pubKey)
        },
        {
            tag: WA_NODE_TAGS.LIST,
            attrs: {},
            content: preKeys.map((record) => ({
                tag: WA_NODE_TAGS.KEY,
                attrs: {},
                content: [
                    {
                        tag: WA_NODE_TAGS.ID,
                        attrs: {},
                        content: intToBigEndianBytes(record.keyId, 3)
                    },
                    {
                        tag: WA_NODE_TAGS.VALUE,
                        attrs: {},
                        content: toBytesView(record.keyPair.pubKey)
                    }
                ]
            }))
        },
        {
            tag: WA_NODE_TAGS.SKEY,
            attrs: {},
            content: [
                {
                    tag: WA_NODE_TAGS.ID,
                    attrs: {},
                    content: intToBigEndianBytes(signedPreKey.keyId, 3)
                },
                {
                    tag: WA_NODE_TAGS.VALUE,
                    attrs: {},
                    content: toBytesView(signedPreKey.keyPair.pubKey)
                },
                {
                    tag: WA_NODE_TAGS.SIGNATURE,
                    attrs: {},
                    content: toBytesView(signedPreKey.signature)
                }
            ]
        }
    ])
}

export function parsePreKeyUploadFailure(node: BinaryNode): {
    readonly errorCode?: number
    readonly errorText: string
} {
    const error = parseIqError(node)
    return {
        ...(error.numericCode !== undefined ? { errorCode: error.numericCode } : {}),
        errorText: error.text
    }
}
