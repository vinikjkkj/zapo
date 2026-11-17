import { toRawPubKey } from '@crypto/core/keys'
import { WA_DEFAULTS, WA_IQ_TYPES, WA_NODE_TAGS, WA_XMLNS } from '@protocol/constants'
import { SIGNAL_KEY_BUNDLE_TYPE_BYTES } from '@signal/api/constants'
import type { SignalMissingPreKeysTarget } from '@signal/api/SignalMissingPreKeysSyncApi'
import type {
    KyberPreKeyRecord,
    PreKeyRecord,
    RegistrationInfo,
    SignedPreKeyRecord
} from '@signal/types'
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
                content: toRawPubKey(signedPreKey.keyPair.pubKey)
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
    preKeys: readonly PreKeyRecord[]
) {
    const children: BinaryNode[] = []
    children.push(
        {
            tag: WA_NODE_TAGS.IDENTITY,
            attrs: {},
            content: toRawPubKey(registrationInfo.identityKeyPair.pubKey)
        },
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
                        content: toRawPubKey(record.keyPair.pubKey)
                    }
                ]
            }))
        },
        buildSignedPreKeyNode(signedPreKey)
    )
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.SIGNAL, children)
}

function buildKyberPreKeyNode(tag: string, record: KyberPreKeyRecord): BinaryNode {
    return {
        tag,
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
            },
            {
                tag: WA_NODE_TAGS.SIGNATURE,
                attrs: {},
                content: record.signature
            }
        ]
    }
}

function buildKyberPreKeyListNode(records: readonly KyberPreKeyRecord[]): BinaryNode {
    return {
        tag: WA_NODE_TAGS.PQ_LIST,
        attrs: {},
        content: records.map((record) => buildKyberPreKeyNode(WA_NODE_TAGS.KEY, record))
    }
}

/**
 * First post-quantum upload: the last-resort key followed by a `<pq_list>` of
 * signed one-time Kyber keys. Raw 1568-byte public keys go on the wire as-is.
 */
export function buildKyberPreKeySetIq(
    kyberPreKeys: readonly KyberPreKeyRecord[],
    lastResort: KyberPreKeyRecord
) {
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.SIGNAL, [
        buildKyberPreKeyNode(WA_NODE_TAGS.PQ_LAST_RESORT_KEY, lastResort),
        buildKyberPreKeyListNode(kyberPreKeys)
    ])
}

/** Replenishment: `<op mode="add"/>` plus a `<pq_list>` of one-time Kyber keys. */
export function buildKyberPreKeyAddIq(kyberPreKeys: readonly KyberPreKeyRecord[]) {
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.SIGNAL, [
        { tag: WA_NODE_TAGS.OP, attrs: { mode: 'add' } },
        buildKyberPreKeyListNode(kyberPreKeys)
    ])
}

export function buildSignedPreKeyRotateIq(signedPreKey: SignedPreKeyRecord) {
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.SIGNAL, [
        {
            tag: WA_NODE_TAGS.ROTATE,
            attrs: {},
            content: [buildSignedPreKeyNode(signedPreKey)]
        }
    ])
}

export function buildMissingPreKeysFetchIq(
    users: readonly SignalMissingPreKeysTarget[],
    options: { readonly pqSupport?: boolean } = {}
) {
    return buildIqNode(WA_IQ_TYPES.GET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.SIGNAL, [
        {
            tag: WA_NODE_TAGS.KEY_FETCH,
            attrs: options.pqSupport === true ? { pqsupport: 'true' } : {},
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
