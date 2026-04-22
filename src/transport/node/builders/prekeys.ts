import { WA_DEFAULTS, WA_NODE_TAGS, WA_XMLNS } from '@protocol/constants'
import { SIGNAL_KEY_BUNDLE_TYPE_BYTES } from '@signal/api/constants'
import type { SignalMissingPreKeysTarget } from '@signal/api/SignalMissingPreKeysSyncApi'
import type { PreKeyRecord, RegistrationInfo, SignedPreKeyRecord } from '@signal/types'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'
import { intToBytes } from '@util/bytes'

function buildSignedPreKeyNode(signedPreKey: SignedPreKeyRecord) {
    return {
        tag: WA_NODE_TAGS.SKEY,
        attrs: {},
        content: [
            {
                tag: WA_NODE_TAGS.ID,
                attrs: {},
                content: intToBytes(3, signedPreKey.keyId)
            },
            {
                tag: WA_NODE_TAGS.VALUE,
                attrs: {},
                content: signedPreKey.keyPair.pubKey
            },
            {
                tag: WA_NODE_TAGS.SIGNATURE,
                attrs: {},
                content: signedPreKey.signature
            }
        ]
    }
}

export function buildPreKeyUploadIq(
    registrationInfo: RegistrationInfo,
    signedPreKey: SignedPreKeyRecord,
    preKeys: readonly PreKeyRecord[],
    options?: { readonly opMode?: 'set' | 'add' }
) {
    const children: BinaryNode[] = []
    if (options?.opMode) {
        children.push({
            tag: WA_NODE_TAGS.OP,
            attrs: { mode: options.opMode }
        })
    }
    children.push(
        {
            tag: WA_NODE_TAGS.REGISTRATION,
            attrs: {},
            content: intToBytes(4, registrationInfo.registrationId)
        },
        {
            tag: WA_NODE_TAGS.TYPE,
            attrs: {},
            content: SIGNAL_KEY_BUNDLE_TYPE_BYTES
        },
        {
            tag: WA_NODE_TAGS.IDENTITY,
            attrs: {},
            content: registrationInfo.identityKeyPair.pubKey
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
                        content: intToBytes(3, record.keyId)
                    },
                    {
                        tag: WA_NODE_TAGS.VALUE,
                        attrs: {},
                        content: record.keyPair.pubKey
                    }
                ]
            }))
        },
        buildSignedPreKeyNode(signedPreKey)
    )
    return buildIqNode('set', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.SIGNAL, children)
}

export function buildSignedPreKeyRotateIq(signedPreKey: SignedPreKeyRecord) {
    return buildIqNode('set', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.SIGNAL, [
        {
            tag: WA_NODE_TAGS.ROTATE,
            attrs: {},
            content: [buildSignedPreKeyNode(signedPreKey)]
        }
    ])
}

export function buildMissingPreKeysFetchIq(users: readonly SignalMissingPreKeysTarget[]) {
    return buildIqNode('get', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.SIGNAL, [
        {
            tag: WA_NODE_TAGS.KEY_FETCH,
            attrs: {},
            content: users.map((user) => ({
                tag: WA_NODE_TAGS.USER,
                attrs: {
                    jid: user.userJid,
                    ...(user.reasonIdentity === true ? { reason: 'identity' } : {})
                },
                content: user.devices.map((device) => ({
                    tag: WA_NODE_TAGS.DEVICE,
                    attrs: { id: String(device.deviceId) },
                    content: [
                        {
                            tag: WA_NODE_TAGS.REGISTRATION,
                            attrs: {},
                            content: intToBytes(4, device.registrationId)
                        }
                    ]
                }))
            }))
        }
    ])
}
